import { canonicalJson, sha256Digest } from '../canonical';
import {
    D2LRawExportSchema,
    D2LResultSchema,
    D2LVariantSummarySchema,
    type D2LMatch,
    type D2LRawExport,
    type D2LResult,
    type D2LVariantSummary
} from './policy-transport-schemas';

const FRAMES = ['f4_cross_band_v0', 'd2k_boundary_v0'] as const;
const VARIANTS = [
    'baseline_v0',
    'terminal_tie_residue_v0',
    'preparation_response_lethal_guard_v0',
    'global_lethal_guard_v0'
] as const;
const POLICIES = [
    'range_pressure', 'medium_hold', 'short_approach', 'retreat_kite', 'best_response'
] as const;

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function identityKey(match: D2LMatch): string {
    return canonicalJson({
        frameId: match.frameId,
        startingDistance: match.startingDistance,
        firstActor: match.firstActor,
        mirrored: match.mirrored,
        playerPolicy: match.playerPolicy,
        loomkeeperPolicy: match.loomkeeperPolicy
    });
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const item of items) {
        const id = key(item);
        groups.set(id, [...(groups.get(id) ?? []), item]);
    }
    return groups;
}

function validateTopology(raw: D2LRawExport): void {
    if (raw.matches.length !== 2_200 || new Set(raw.matches.map((item) => item.matchRef)).size !== 2_200) {
        throw new Error('D2L must contain 2,200 unique match records.');
    }
    for (const frameId of FRAMES) {
        for (const variant of VARIANTS) {
            const local = raw.matches.filter((item) => item.frameId === frameId && item.variant === variant);
            const expected = frameId === 'f4_cross_band_v0' ? 250 : 300;
            if (local.length !== expected || new Set(local.map(identityKey)).size !== expected) {
                throw new Error(`${frameId}/${variant} does not cover its complete fixed domain.`);
            }
        }
    }
    for (const match of raw.matches) {
        for (const substitution of match.substitutions) {
            if (substitution.selectedTargetCarrier.winner !== substitution.actor ||
                substitution.selectedTargetCarrier.finishReason === null) {
                throw new Error(`${match.matchRef} contains a non-winning claimed immediate substitution.`);
            }
            const selected = substitution.immediateWins.find((item) =>
                item.action.actionKey === substitution.selectedAction.actionKey
            );
            if (!selected || selected.targetCarrierDigest !== substitution.selectedTargetCarrierDigest) {
                throw new Error(`${match.matchRef} detaches its selected immediate-win target.`);
            }
            if (substitution.trigger === 'preparation_response_lethal_guard' &&
                (!substitution.responseCarrier || substitution.preparerPreparationTurns <= 0 ||
                    substitution.responderPreparationTurns !== 0)) {
                throw new Error(`${match.matchRef} applies the response guard outside its declared support.`);
            }
        }
    }
}

function orientationStats(matches: readonly D2LMatch[]): {
    orientationClassCount: number;
    orientationMismatchCount: number;
} {
    const groups = groupBy(matches, (item) => canonicalJson({
        startingDistance: item.startingDistance,
        firstPolicy: item.firstPolicy,
        secondPolicy: item.secondPolicy
    }));
    let mismatches = 0;
    for (const items of groups.values()) {
        const expected = items[0]?.frameId === 'f4_cross_band_v0' ? 2 : 4;
        if (items.length !== expected) {
            throw new Error('Actor-relative orientation class is incomplete.');
        }
        const signatures = items.map((item) => canonicalJson({
            winnerRole: item.winnerRole,
            completedTurns: item.completedTurns,
            normalizedPathDigest: item.normalizedPathDigest
        }));
        if (new Set(signatures).size !== 1) mismatches += 1;
    }
    return { orientationClassCount: groups.size, orientationMismatchCount: mismatches };
}

function summarizeVariant(
    matches: readonly D2LMatch[],
    baselineByIdentity: ReadonlyMap<string, D2LMatch>
): D2LVariantSummary {
    const first = matches[0];
    if (!first) throw new Error('Cannot summarize an empty D2L variant.');
    const substitutions = matches.flatMap((item) => item.substitutions);
    const changes = matches.filter((item) => {
        const baseline = baselineByIdentity.get(identityKey(item));
        if (!baseline) throw new Error('D2L variant lacks its baseline identity.');
        return baseline.winnerRole !== item.winnerRole;
    });
    const firstActorGains = changes.filter((item) => {
        const baseline = baselineByIdentity.get(identityKey(item));
        return baseline?.winnerRole === 'second' && item.winnerRole === 'first';
    });
    const secondActorGains = changes.filter((item) => {
        const baseline = baselineByIdentity.get(identityKey(item));
        return baseline?.winnerRole === 'first' && item.winnerRole === 'second';
    });
    const substitutionsByPolicy = Object.fromEntries(POLICIES.map((policy) => [
        policy,
        substitutions.filter((item) => item.policy === policy).length
    ])) as Record<typeof POLICIES[number], number>;
    const starts = [...new Set(matches.map((item) => item.startingDistance))].sort((a, b) => a - b);
    const distances = starts.map((startingDistance) => {
        const local = matches.filter((item) => item.startingDistance === startingDistance);
        const localChanges = local.filter((item) => {
            const baseline = baselineByIdentity.get(identityKey(item));
            return baseline?.winnerRole !== item.winnerRole;
        });
        return {
            startingDistance,
            matchCount: local.length,
            firstActorWins: local.filter((item) => item.winnerRole === 'first').length,
            secondActorWins: local.filter((item) => item.winnerRole === 'second').length,
            draws: local.filter((item) => item.winnerRole === 'draw').length,
            outcomeChangesFromBaseline: localChanges.length,
            firstActorGainCount: localChanges.filter((item) => {
                const baseline = baselineByIdentity.get(identityKey(item));
                return baseline?.winnerRole === 'second' && item.winnerRole === 'first';
            }).length,
            secondActorGainCount: localChanges.filter((item) => {
                const baseline = baselineByIdentity.get(identityKey(item));
                return baseline?.winnerRole === 'first' && item.winnerRole === 'second';
            }).length
        };
    });
    const orientation = orientationStats(matches);
    return D2LVariantSummarySchema.parse({
        frameId: first.frameId,
        variant: first.variant,
        matchCount: matches.length,
        firstActorWins: matches.filter((item) => item.winnerRole === 'first').length,
        secondActorWins: matches.filter((item) => item.winnerRole === 'second').length,
        draws: matches.filter((item) => item.winnerRole === 'draw').length,
        totalTurns: matches.reduce((total, item) => total + item.completedTurns, 0),
        recurrenceCount: matches.filter((item) => item.nonterminalRecurrence !== null).length,
        turnLimitCount: matches.filter((item) => item.finishReason === 'turn_limit').length,
        outcomeChangesFromBaseline: changes.length,
        firstActorGainCount: firstActorGains.length,
        secondActorGainCount: secondActorGains.length,
        substitutionCount: substitutions.length,
        substitutionsByPolicy,
        firstActorSubstitutionCount: substitutions.filter((item) => item.actorRole === 'first').length,
        secondActorSubstitutionCount: substitutions.filter((item) => item.actorRole === 'second').length,
        responseCarrierSubstitutionCount: substitutions.filter((item) => item.responseCarrier).length,
        escapeSlackSpend: substitutions.reduce((total, item) => total + item.escapeSlackSpend, 0),
        displacement: substitutions.reduce((total, item) => total + item.displacement, 0),
        ...orientation,
        distances
    });
}

function summaryFor(
    summaries: readonly D2LVariantSummary[],
    frameId: typeof FRAMES[number],
    variant: typeof VARIANTS[number]
): D2LVariantSummary {
    const summary = summaries.find((item) => item.frameId === frameId && item.variant === variant);
    if (!summary) throw new Error(`Missing D2L summary ${frameId}/${variant}.`);
    return summary;
}

export function assessPolicyTransport(value: unknown): D2LResult {
    const raw = D2LRawExportSchema.parse(value);
    validateTopology(raw);
    const baselineByIdentity = new Map(
        raw.matches.filter((item) => item.variant === 'baseline_v0').map((item) => [identityKey(item), item])
    );
    if (baselineByIdentity.size !== 550) throw new Error('D2L baseline identity map must contain 550 matches.');
    const variantSummaries = FRAMES.flatMap((frameId) => VARIANTS.map((variant) =>
        summarizeVariant(
            raw.matches.filter((item) => item.frameId === frameId && item.variant === variant),
            baselineByIdentity
        )
    ));

    const primaryBaseline = summaryFor(variantSummaries, 'f4_cross_band_v0', 'baseline_v0');
    const primaryTie = summaryFor(variantSummaries, 'f4_cross_band_v0', 'terminal_tie_residue_v0');
    const primaryResponse = summaryFor(
        variantSummaries, 'f4_cross_band_v0', 'preparation_response_lethal_guard_v0'
    );
    const primaryGlobal = summaryFor(variantSummaries, 'f4_cross_band_v0', 'global_lethal_guard_v0');
    const boundaryTie = summaryFor(variantSummaries, 'd2k_boundary_v0', 'terminal_tie_residue_v0');
    const boundaryResponse = summaryFor(
        variantSummaries, 'd2k_boundary_v0', 'preparation_response_lethal_guard_v0'
    );
    const boundaryGlobal = summaryFor(variantSummaries, 'd2k_boundary_v0', 'global_lethal_guard_v0');

    const expectedBaseline = [30, 28, 30, 30, 40];
    const baselineReproduced = primaryBaseline.firstActorWins === 158 &&
        primaryBaseline.distances.map((item) => item.firstActorWins)
            .every((value, index) => value === expectedBaseline[index]) &&
        primaryBaseline.recurrenceCount === 0 && primaryBaseline.turnLimitCount === 0;
    const tieOutcomeInvariant = variantSummaries
        .filter((item) => item.variant === 'terminal_tie_residue_v0')
        .every((item) => item.outcomeChangesFromBaseline === 0);

    const boundaryResponseMatches = raw.matches.filter((item) =>
        item.frameId === 'd2k_boundary_v0' &&
        item.variant === 'preparation_response_lethal_guard_v0' &&
        item.firstPolicy === 'short_approach' && item.secondPolicy === 'short_approach'
    );
    if (boundaryResponseMatches.length !== 12) {
        throw new Error('D2L must retain twelve short/short boundary orientation matches.');
    }
    const firstCycleCocoonBranchPreserved = boundaryResponseMatches.every((item) =>
        item.substitutions.every((substitution) => substitution.responseCarrierIndex !== 1)
    );
    const secondCycleImmediateOmissionsRepaired = boundaryResponseMatches.every((item) => {
        const cycleTwo = item.substitutions.filter((substitution) => substitution.responseCarrierIndex === 2);
        return cycleTwo.length === 1 && cycleTwo[0]?.selectedAction.actionKey === 'cast:threadball:stay' &&
            cycleTwo[0].escapeSlackSpend === 0 && cycleTwo[0].displacement === 0;
    });
    const boundarySelectionEquivariant = [boundaryTie, boundaryResponse, boundaryGlobal]
        .every((item) => item.orientationMismatchCount === 0);
    const noRecurrenceOrTurnLimitDrift = variantSummaries.every((item) =>
        item.recurrenceCount === 0 && item.turnLimitCount === 0
    );

    const guardedPrimaryMatches = raw.matches.filter((item) =>
        item.frameId === 'f4_cross_band_v0' &&
        item.variant === 'preparation_response_lethal_guard_v0'
    );
    const phaseTransportWitnesses = guardedPrimaryMatches.flatMap((item) => {
        const baseline = baselineByIdentity.get(identityKey(item));
        if (!baseline || baseline.winnerRole === item.winnerRole) return [];
        const substitution = item.substitutions.find((candidate) =>
            candidate.selectedTargetCarrier.finishReason !== null
        );
        if (!substitution) throw new Error(`${item.matchRef} changed outcome without a terminal substitution.`);
        return [{
            matchRef: item.matchRef,
            startingDistance: item.startingDistance,
            firstPolicy: item.firstPolicy,
            secondPolicy: item.secondPolicy,
            baselineWinnerRole: baseline.winnerRole,
            guardedWinnerRole: item.winnerRole,
            substitutionActorRole: substitution.actorRole,
            substitutionRef: substitution.substitutionDigest
        }];
    }).sort((left, right) =>
        left.startingDistance - right.startingDistance || compareText(left.matchRef, right.matchRef)
    );

    const boundaryMatches = raw.matches.filter((item) => item.frameId === 'd2k_boundary_v0');
    const orientationMismatchWitnesses = [...groupBy(boundaryMatches, (item) => canonicalJson({
        variant: item.variant,
        startingDistance: item.startingDistance,
        firstPolicy: item.firstPolicy,
        secondPolicy: item.secondPolicy
    })).values()].flatMap((items) => {
        const first = items[0];
        if (!first) return [];
        const signatures = items.map((item) => sha256Digest({
            winnerRole: item.winnerRole,
            completedTurns: item.completedTurns,
            normalizedPathDigest: item.normalizedPathDigest
        }));
        if (new Set(signatures).size === 1) return [];
        return [{
            variant: first.variant,
            startingDistance: first.startingDistance,
            firstPolicy: first.firstPolicy,
            secondPolicy: first.secondPolicy,
            matchRefs: items.map((item) => item.matchRef).sort(compareText),
            normalizedRouteSignatures: [...new Set(signatures)].sort(compareText)
        }];
    }).sort((left, right) =>
        compareText(left.variant, right.variant) ||
        left.startingDistance - right.startingDistance ||
        compareText(left.firstPolicy, right.firstPolicy) ||
        compareText(left.secondPolicy, right.secondPolicy)
    );

    const responseVector = primaryResponse.distances.map((item) => item.firstActorWins).join('/');
    const globalVector = primaryGlobal.distances.map((item) => item.firstActorWins).join('/');
    const closeBandRegression = primaryResponse.distances
        .filter((item) => [448, 512, 576].includes(item.startingDistance))
        .every((item) => item.firstActorGainCount > item.secondActorGainCount);
    const farBandReversal = primaryResponse.distances
        .find((item) => item.startingDistance === 704)?.secondActorGainCount === 4;
    const rejected = baselineReproduced && tieOutcomeInvariant &&
        firstCycleCocoonBranchPreserved && secondCycleImmediateOmissionsRepaired &&
        noRecurrenceOrTurnLimitDrift && closeBandRegression && farBandReversal &&
        primaryResponse.firstActorWins > primaryBaseline.firstActorWins;

    const payload = {
        schemaVersion: 1 as const,
        resultId: 'wp-015d2l-policy-transport-assessment' as const,
        sourceBindings: raw.sourceBindings,
        rawExportDigest: raw.exportDigest,
        variantSummaries,
        gates: {
            baselineReproduced,
            tieOutcomeInvariant,
            firstCycleCocoonBranchPreserved,
            secondCycleImmediateOmissionsRepaired,
            boundarySelectionEquivariant,
            noRecurrenceOrTurnLimitDrift
        },
        phaseTransportWitnesses,
        orientationMismatchWitnesses,
        diagnosticProfile: {
            pathPressure: [
                `The preparation-response guard changes ${primaryResponse.outcomeChangesFromBaseline} primary outcomes: ${primaryResponse.firstActorGainCount} toward the first actor and ${primaryResponse.secondActorGainCount} toward the second actor.`,
                `Its first-actor vector is ${responseVector}; the same response improvement follows responder phase rather than reducing the cross-band split.`,
                `The global control increases first-actor wins to ${primaryGlobal.firstActorWins}/250 with vector ${globalVector}.`,
                `The bounded response guard retains ${boundaryResponse.orientationMismatchCount} actor/mirror-normalized path mismatches in the 639/640/641 frame.`
            ],
            residueVisibility: [
                `${primaryTie.substitutionCount} primary tie-only substitutions change terminal action residue but no outcome.`,
                `Response-guard substitutions retain actor role, turn, preparation support, Escape-Slack spend, displacement, and exact source/target carrier digests.`,
                'Primary and boundary frames overlap and remain one covariance family.'
            ],
            localReorganization: [
                'The first 100/100-Stitching Cocoon response cycle remains unchanged.',
                'All twelve short/short boundary replicas replace the second response-cycle omission with stationary Threadball.',
                'The locally coherent repair reorganizes the wider route according to which turn role owns the response edge.'
            ],
            cutFidelity: [
                'F4 mechanics, legal actions, policy identities, transition order, recurrence key, seed, and horizon remain unchanged.',
                'The shadow variants are analytical comparators and do not represent live Loomkeeper or human choice.',
                'Terrain, aim, trajectory, splash, hidden information, player execution, and production ports remain excluded.'
            ],
            returnStrength: [
                'Every variant delegates back to the unchanged base selector outside its exact trigger.',
                'Baseline execution reproduces the historical F4 report and every substitution retains digest-bound re-entry carriers.',
                'Tie-only and lethal-guard routes can be paired with the exact baseline identity.'
            ],
            closureRisk: [
                'Repairing an obvious local omission can worsen aggregate initiative by improving the actor who reaches that carrier first.',
                'The unchanged 640 aggregate hides equal and opposite changed routes.',
                'The improved 704 band coexists with regressions at 448/512/576.',
                'Terminal resource preservation has no recursive value after the game has already ended.'
            ]
        },
        disposition: rejected
            ? {
                classification: 'rejected' as const,
                reasons: [
                    `The response guard raises F4 first-actor wins from ${primaryBaseline.firstActorWins}/250 to ${primaryResponse.firstActorWins}/250.`,
                    `It changes the distance vector from 30/28/30/30/40 to ${responseVector}: close bands favor the first responder while 704 favors the second responder.`,
                    'The 640 scalar remains 30/50 only because first- and second-actor gains cancel across different policy routes.',
                    `The global destructive control amplifies the same problem to ${primaryGlobal.firstActorWins}/250.`,
                    'Tie-only repair is a terminal presentation/residue normalization, not a gameplay improvement.',
                    `The response guard also fails full boundary-path equivariance in ${boundaryResponse.orientationMismatchCount} normalized policy classes.`
                ],
                witnessRefs: [
                    ...phaseTransportWitnesses.map((item) => item.matchRef),
                    ...orientationMismatchWitnesses
                        .filter((item) => item.variant === 'preparation_response_lethal_guard_v0')
                        .flatMap((item) => item.matchRefs)
                ].filter((item, index, values) => values.indexOf(item) === index),
                nextPermittedAction: 'Return the response-phase transport landmark to D2G and select a new reversible direction; do not implement a lethal-first policy or tune it by aggregate.'
            }
            : {
                classification: 'residualized' as const,
                reasons: ['The fixed falsifier did not produce the predeclared responder-phase transport pattern.'],
                witnessRefs: raw.matches.slice(0, 4).map((item) => item.matchRef),
                nextPermittedAction: 'Review the failed gate before changing a policy or gameplay mechanic.'
            },
        accumulatedResidue: [
            'response-phase',
            'turn-role',
            'distance-band',
            'policy-pair',
            'terminal-action-style',
            'escape-slack',
            'displacement',
            'preparation-cocoon',
            'orientation-covariance',
            'frame-overlap',
            'excluded-production-ports'
        ],
        blockedClaims: [
            ...raw.blockedClaims,
            'Taking an available terminal win is locally coherent but is not a role-neutral balance intervention.',
            'A 640 aggregate equality does not mean the same routes or actors are unchanged.',
            'The response-phase landmark does not prove a sole cause for F4 initiative.',
            'Rejecting these shadow policies does not select a replacement mechanic or policy.',
            'No analytical result authorizes V5, Loomkeeper, client, server, protocol, replay, reward, wallet, UI, asset, or production changes.'
        ],
        productAuthority: 'none' as const
    };
    return D2LResultSchema.parse({ ...payload, resultDigest: sha256Digest(payload) });
}

export function canonicalD2LResult(result: D2LResult): string {
    return canonicalJson(D2LResultSchema.parse(result));
}
