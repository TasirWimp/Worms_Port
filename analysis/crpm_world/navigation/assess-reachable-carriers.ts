import { canonicalJson, compareCanonicalText, sha256Digest, type JsonValue } from '../canonical';
import { assessQuotientTransport } from '../kernel/assess-quotient-transport';
import type { ProjectionTransportAssessmentV2 } from '../types';
import {
    D2HAssessmentSchema,
    D2HCutDefinitionSchema,
    D2HRawExportSchema,
    D2HResultSchema,
    D2HSupportDifferenceSummarySchema,
    type D2HAssessment,
    type D2HCarrierItem,
    type D2HCutDefinition,
    type D2HRawExport,
    type D2HResult
} from './reachable-carrier-schemas';

const EXPECTED_REPORT_DIGESTS = Object.freeze({
    F4: '8e0605617d63b25474da6df059455d0c365b93f657bf0260295788a854cd17dd',
    I2: '31e341944d0490d531e989463804f8402c32c191e7dd1d4fe205081ef0ce099d'
});

const EXPECTED_CASE_BINDINGS = Object.freeze({
    F4: Object.freeze({
        configId: 'v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4',
        configPath: 'analysis/tactical_model/configs/v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4.json',
        configSchemaVersion: 11,
        historicalDisposition: 'structural_reference'
    }),
    I2: Object.freeze({
        configId: 'v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-entry-seam-pin-candidate-i2',
        configPath: 'analysis/tactical_model/configs/v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-entry-seam-pin-candidate-i2.json',
        configSchemaVersion: 16,
        historicalDisposition: 'residualized_policy_fragile'
    })
});

export const D2H_CUT_DEFINITIONS: readonly D2HCutDefinition[] = Object.freeze([
    D2HCutDefinitionSchema.parse({
        schemaVersion: 1,
        cutId: 'spawn640_visible_pressure_v0',
        cutVersion: 1,
        projectionDescription: 'Retain active actor, positions, current separation, and both Stitching values as a deliberately thin pressure readout.',
        includedSupport: ['active-actor', 'positions', 'separation', 'stitching'],
        intentionallyForgotten: [
            'config-identity', 'policies', 'completed-turns', 'escape-slack', 'seam-pin',
            'cooldown', 'preparation', 'cocoon', 'other-status', 'legal-actions'
        ],
        excludedClaims: [
            'Visible equality does not establish equal tactical state, policy support, recurrence carrier, or continuation.',
            'This destructive control cannot establish deterministic continuation.'
        ],
        deterministicContinuationClaim: 'relational'
    }),
    D2HCutDefinitionSchema.parse({
        schemaVersion: 1,
        cutId: 'spawn640_policy_visible_pressure_v1',
        cutVersion: 1,
        projectionDescription: 'Retain the visible pressure readout plus config identity and both declared policies.',
        includedSupport: [
            'active-actor', 'positions', 'separation', 'stitching', 'config-identity',
            'player-policy', 'loomkeeper-policy'
        ],
        intentionallyForgotten: [
            'completed-turns', 'escape-slack', 'seam-pin', 'cooldown', 'preparation',
            'cocoon', 'other-status', 'legal-actions'
        ],
        excludedClaims: [
            'Policy-aware visible equality does not establish equal tactical support or continuation.',
            'A finite absence of aliases does not prove that resource and status support are irrelevant.'
        ],
        deterministicContinuationClaim: 'relational'
    }),
    D2HCutDefinitionSchema.parse({
        schemaVersion: 1,
        cutId: 'spawn640_bounded_tactical_support_v1',
        cutVersion: 1,
        projectionDescription: 'Retain config identity, complete current tactical state including turn progress, both policies, and sorted legal-action support.',
        includedSupport: [
            'config-identity', 'complete-tactical-state', 'completed-turns', 'active-actor',
            'player-policy', 'loomkeeper-policy', 'legal-actions'
        ],
        intentionallyForgotten: ['route-prefix-as-transition-input', 'excluded-authority-ports'],
        excludedClaims: [
            'A passing finite sample does not prove minimal or globally support-complete state.',
            'Singleton-only map eligibility is unexercised evidence, not a support-sufficiency result.'
        ],
        deterministicContinuationClaim: 'bounded'
    }),
    D2HCutDefinitionSchema.parse({
        schemaVersion: 1,
        cutId: 'spawn640_route_provenance_v0',
        cutVersion: 1,
        projectionDescription: 'Retain match identity, ordered path prefix, trace references, and pre/post carrier digests solely for witness re-entry.',
        includedSupport: [
            'match-identity', 'ordered-path-prefix', 'trace-reference',
            'source-carrier-digest', 'target-carrier-digest'
        ],
        intentionallyForgotten: ['route-prefix-as-current-state', 'continuation-claim'],
        excludedClaims: [
            'Route provenance is not an additional gameplay state variable in the Markov tactical model.',
            'Matching or differing paths do not by themselves establish matching or differing continuation.'
        ],
        deterministicContinuationClaim: 'none'
    })
]);

type TransportCutId = Exclude<D2HCutDefinition['cutId'], 'spawn640_route_provenance_v0'>;
type CaseScope = 'F4' | 'I2' | 'combined';

type TransportItem = Readonly<{
    itemRef: string;
    matchRef: string;
    caseId: 'F4' | 'I2';
    configId: string;
    playerPolicy: string;
    loomkeeperPolicy: string;
    sourceCarrier: D2HCarrierItem['sourceCarrier'];
    sourceCarrierDigest: string;
    sourceRecurrenceKey: JsonValue;
    legalActionKeys: readonly string[];
    selectedAction: D2HCarrierItem['selectedAction'];
    targetCarrier: D2HCarrierItem['targetCarrier'];
    targetCarrierDigest: string;
    targetRecurrenceKey: JsonValue;
    terminalRelation: D2HCarrierItem['terminalRelation'];
    pathPrefixDigest: string;
}>;

function toTransportItem(item: D2HCarrierItem): TransportItem {
    return {
        itemRef: item.itemRef,
        matchRef: item.matchRef,
        caseId: item.caseId,
        configId: item.configId,
        playerPolicy: item.domain.playerPolicy,
        loomkeeperPolicy: item.domain.loomkeeperPolicy,
        sourceCarrier: item.sourceCarrier,
        sourceCarrierDigest: item.sourceCarrierDigest,
        sourceRecurrenceKey: item.sourceRecurrenceKey,
        legalActionKeys: item.legalActionKeys,
        selectedAction: item.selectedAction,
        targetCarrier: item.targetCarrier,
        targetCarrierDigest: item.targetCarrierDigest,
        targetRecurrenceKey: item.targetRecurrenceKey,
        terminalRelation: item.terminalRelation,
        pathPrefixDigest: item.pathPrefixDigest
    };
}

function visibleProjection(item: TransportItem): JsonValue {
    return {
        activeActor: item.sourceCarrier.activeActor,
        playerX: item.sourceCarrier.player.x,
        loomkeeperX: item.sourceCarrier.loomkeeper.x,
        separation: item.sourceCarrier.distance,
        playerStitching: item.sourceCarrier.player.stitching,
        loomkeeperStitching: item.sourceCarrier.loomkeeper.stitching
    };
}

function sourceProjection(cutId: TransportCutId, item: TransportItem): JsonValue {
    const visible = visibleProjection(item);
    if (cutId === 'spawn640_visible_pressure_v0') return visible;
    if (cutId === 'spawn640_policy_visible_pressure_v1') {
        return {
            visible,
            configId: item.configId,
            playerPolicy: item.playerPolicy,
            loomkeeperPolicy: item.loomkeeperPolicy
        };
    }
    return {
        configId: item.configId,
        sourceCarrier: item.sourceCarrier,
        playerPolicy: item.playerPolicy,
        loomkeeperPolicy: item.loomkeeperPolicy,
        legalActionKeys: [...item.legalActionKeys]
    };
}

function targetProjection(item: TransportItem): JsonValue {
    return {
        selectedAction: item.selectedAction,
        targetCarrier: item.targetCarrier,
        targetRecurrenceKey: item.targetRecurrenceKey,
        terminalRelation: item.terminalRelation
    };
}

function sampledDomain(
    scope: CaseScope,
    activeActorScope: 'all' | 'player' | 'loomkeeper',
    items: readonly TransportItem[]
) {
    const actionFamilies = [...new Set(items.map((item) => item.selectedAction.kind))]
        .sort(compareCanonicalText);
    return {
        schemaVersion: 1 as const,
        scenarioIds: [`d2h-spawn640-${scope.toLowerCase()}`],
        actionFamilies,
        policyFamilies: [
            'range_pressure', 'medium_hold', 'short_approach', 'retreat_kite', 'best_response'
        ],
        seeds: [3237998097],
        constraints: [
            'Only transitions re-entered from unchanged F4/I2 matches starting at 640 are sampled.',
            `Assessment scope is ${scope}.`,
            `Active-actor partition is ${activeActorScope}.`,
            'Passing evidence is bounded to the declared finite transition inventory.'
        ]
    };
}

function routeFor(item: TransportItem) {
    return {
        itemRef: item.itemRef,
        matchRef: item.matchRef,
        pathPrefixDigest: item.pathPrefixDigest,
        sourceCarrierDigest: item.sourceCarrierDigest,
        targetCarrierDigest: item.targetCarrierDigest,
        selectedActionKey: item.selectedAction.actionKey
    };
}

function coverage(
    assessment: ProjectionTransportAssessmentV2,
    byRef: ReadonlyMap<string, TransportItem>
) {
    const repeated = assessment.sourceClasses.filter((item) => item.memberRefs.length > 1);
    const aliasing = new Set(assessment.aliasingKeys);
    const multiRouteAliasingClassCount = assessment.sourceClasses.filter((sourceClass) => {
        if (!aliasing.has(sourceClass.classKey)) return false;
        return new Set(sourceClass.memberRefs.map((ref) => {
            const item = byRef.get(ref);
            if (!item) throw new Error(`Missing carrier item ${ref}.`);
            return item.matchRef;
        })).size > 1;
    }).length;
    return {
        sourceClassCount: assessment.sourceClasses.length,
        repeatedSourceClassCount: repeated.length,
        singletonSourceClassCount: assessment.sourceClasses.length - repeated.length,
        maximumSourceClassSize: Math.max(...assessment.sourceClasses.map((item) => item.memberRefs.length)),
        aliasingSourceClassCount: assessment.aliasingKeys.length,
        multiRouteAliasingClassCount,
        status: assessment.aliasingKeys.length > 0
            ? 'aliased' as const
            : repeated.length > 0
                ? 'bounded_consistent_with_twins' as const
                : 'unexercised_no_twins' as const
    };
}

function buildAssessment(
    scope: CaseScope,
    cutId: TransportCutId,
    sourceItems: readonly D2HCarrierItem[],
    activeActorScope: 'all' | 'player' | 'loomkeeper' = 'all'
): D2HAssessment {
    const items = sourceItems.map(toTransportItem);
    const byRef = new Map(items.map((item) => [item.itemRef, item]));
    const assessmentId = `d2h-${scope.toLowerCase()}-${activeActorScope}-${cutId}`;
    let assessment: ProjectionTransportAssessmentV2;
    try {
        assessment = assessQuotientTransport(
            items,
            (item) => sourceProjection(cutId, item),
            (item) => targetProjection(item),
            (item) => item,
            {
                assessmentId,
                assessmentVersion: 1,
                sampledDomain: sampledDomain(scope, activeActorScope, items),
                itemReference: (item) => item.itemRef,
                blockedClaims: [
                    'No finite carrier sample proves minimal state, global deterministic transport, optimal play, balance, fun, or product authority.'
                ]
            }
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`D2H assessment ${assessmentId} failed: ${message}`, { cause: error });
    }
    const witnessRoutes = assessment.aliasingWitnessPairs.map((pair) => {
        const left = byRef.get(pair.left.sourceItemRef);
        const right = byRef.get(pair.right.sourceItemRef);
        if (!left || !right) throw new Error('Aliasing witness is detached from its route carrier.');
        if (pair.left.sourceClassKey !== pair.right.sourceClassKey) {
            throw new Error('Aliasing witness pair does not share one source class.');
        }
        return {
            sourceClassKey: pair.left.sourceClassKey,
            left: routeFor(left),
            right: routeFor(right)
        };
    });
    return D2HAssessmentSchema.parse({
        schemaVersion: 1,
        caseScope: scope,
        activeActorScope,
        cutId,
        assessment,
        coverage: coverage(assessment, byRef),
        witnessRoutes
    });
}

function assertFrozenBindings(raw: D2HRawExport): void {
    for (const binding of raw.reportBindings) {
        const expected = EXPECTED_CASE_BINDINGS[binding.caseId];
        if (canonicalJson({
            configId: binding.configId,
            configPath: binding.configPath,
            configSchemaVersion: binding.configSchemaVersion,
            historicalDisposition: binding.historicalDisposition
        }) !== canonicalJson(expected)) {
            throw new Error(`${binding.caseId} config binding is outside the D2H contract.`);
        }
        if (binding.reportDigest !== EXPECTED_REPORT_DIGESTS[binding.caseId]) {
            throw new Error(`${binding.caseId} report digest is outside the D2H contract.`);
        }
        if (binding.spawnResult.firstActorWins !== 60 ||
            binding.spawnResult.firstActorWinRateDenominator !== 100) {
            throw new Error(`${binding.caseId} spawn-640 historical result drifted.`);
        }
    }
    for (const item of raw.items) {
        const expected = EXPECTED_CASE_BINDINGS[item.caseId];
        if (item.configId !== expected.configId ||
            item.configPath !== expected.configPath ||
            item.configSchemaVersion !== expected.configSchemaVersion ||
            item.reportDigest !== EXPECTED_REPORT_DIGESTS[item.caseId]) {
            throw new Error(`${item.itemRef} is detached from its frozen config/report binding.`);
        }
    }
}

function flattenLeaves(
    value: JsonValue,
    prefix = '',
    output = new Map<string, JsonValue>()
): Map<string, JsonValue> {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        for (const key of Object.keys(value).sort(compareCanonicalText)) {
            flattenLeaves(value[key], prefix.length > 0 ? `${prefix}.${key}` : key, output);
        }
    } else {
        output.set(prefix, value);
    }
    return output;
}

function summarizeSupportDifferences(
    assessment: D2HAssessment,
    byRef: ReadonlyMap<string, D2HCarrierItem>
) {
    if (assessment.caseScope === 'combined' ||
        assessment.cutId !== 'spawn640_policy_visible_pressure_v1') {
        throw new Error('Support-difference summaries require one policy-visible config assessment.');
    }
    type MutableFieldSummary = {
        witnessPairCount: number;
        differentSelectedActionPairCount: number;
        example: {
            leftItemRef: string;
            rightItemRef: string;
            leftValue: JsonValue;
            rightValue: JsonValue;
            leftActionKey: string;
            rightActionKey: string;
        };
    };
    const fields = new Map<string, MutableFieldSummary>();
    let sameSelectedActionPairCount = 0;
    let differentSelectedActionPairCount = 0;
    let completedTurnOnlyPairCount = 0;
    let additionalSupportDifferencePairCount = 0;
    for (const witness of assessment.witnessRoutes) {
        const left = byRef.get(witness.left.itemRef);
        const right = byRef.get(witness.right.itemRef);
        if (!left || !right) throw new Error('Support-difference witness is detached from raw carrier data.');
        const actionsDiffer = left.selectedAction.actionKey !== right.selectedAction.actionKey;
        if (actionsDiffer) differentSelectedActionPairCount += 1;
        else sameSelectedActionPairCount += 1;
        const leftLeaves = flattenLeaves(JSON.parse(canonicalJson(left.sourceCarrier)) as JsonValue);
        const rightLeaves = flattenLeaves(JSON.parse(canonicalJson(right.sourceCarrier)) as JsonValue);
        const differingFields = [...new Set([...leftLeaves.keys(), ...rightLeaves.keys()])]
            .filter((field) => canonicalJson(leftLeaves.get(field)) !== canonicalJson(rightLeaves.get(field)))
            .sort(compareCanonicalText);
        if (differingFields.length === 0) {
            throw new Error('Policy-visible alias witness has no omitted carrier difference.');
        }
        if (canonicalJson(differingFields) === canonicalJson(['completedTurns'])) {
            completedTurnOnlyPairCount += 1;
        } else {
            additionalSupportDifferencePairCount += 1;
        }
        for (const field of differingFields) {
            const prior = fields.get(field);
            if (prior) {
                prior.witnessPairCount += 1;
                if (actionsDiffer) prior.differentSelectedActionPairCount += 1;
            } else {
                fields.set(field, {
                    witnessPairCount: 1,
                    differentSelectedActionPairCount: actionsDiffer ? 1 : 0,
                    example: {
                        leftItemRef: left.itemRef,
                        rightItemRef: right.itemRef,
                        leftValue: leftLeaves.get(field) ?? null,
                        rightValue: rightLeaves.get(field) ?? null,
                        leftActionKey: left.selectedAction.actionKey,
                        rightActionKey: right.selectedAction.actionKey
                    }
                });
            }
        }
    }
    const fieldDifferences = [...fields.entries()]
        .sort(([leftField, left], [rightField, right]) =>
            right.witnessPairCount - left.witnessPairCount || compareCanonicalText(leftField, rightField)
        )
        .map(([field, summary]) => ({ field, ...summary }));
    return D2HSupportDifferenceSummarySchema.parse({
        schemaVersion: 1,
        caseScope: assessment.caseScope,
        witnessPairCount: assessment.witnessRoutes.length,
        sameSelectedActionPairCount,
        differentSelectedActionPairCount,
        completedTurnOnlyPairCount,
        additionalSupportDifferencePairCount,
        fieldDifferences
    });
}

function classifyWake(
    assessments: readonly D2HAssessment[],
    supportDifferenceSummaries: readonly ReturnType<typeof summarizeSupportDifferences>[]
) {
    const support = assessments.filter((item) =>
        item.cutId === 'spawn640_bounded_tactical_support_v1' && item.caseScope !== 'combined'
    );
    const policyVisible = assessments.filter((item) =>
        item.cutId === 'spawn640_policy_visible_pressure_v1' && item.caseScope !== 'combined'
    );
    const visible = assessments.filter((item) =>
        item.cutId === 'spawn640_visible_pressure_v0' && item.caseScope !== 'combined'
    );
    const witnessRefs = policyVisible.flatMap((item) =>
        item.assessment.aliasingWitnessPairs.flatMap((pair) => [
            pair.left.witnessRef.witnessId,
            pair.right.witnessRef.witnessId
        ])
    ).slice(0, 256).sort(compareCanonicalText);

    if (support.some((item) => item.coverage.status === 'aliased')) {
        return {
            classification: 'retain_and_refine' as const,
            reasons: [
                'The declared bounded tactical-support projection still aliases different one-step successors.',
                'Preserve the explicit support witness and repair the observation cut before interpreting a gameplay direction.'
            ],
            witnessRefs,
            nextPermittedAction: 'Revise only the D2H support cut around the explicit aliasing witnesses; do not propose a gameplay mechanic.'
        };
    }

    const policyVisibleMultiRouteAliases = policyVisible.reduce(
        (total, item) => total + item.coverage.multiRouteAliasingClassCount,
        0
    );
    const supportIsExercised = support.every((item) =>
        item.coverage.status === 'bounded_consistent_with_twins'
    );
    if (policyVisibleMultiRouteAliases > 0 && supportIsExercised) {
        return {
            classification: 'advance' as const,
            reasons: [
                'Policy-aware visible carriers alias different transitions across multiple route identities.',
                'The full bounded tactical-support cut is exercised by repeated twins and remains transition-consistent in both F4 and I2.',
                'The next probe may navigate the witnessed resource, status, or turn-progress distinctions without changing gameplay yet.'
            ],
            witnessRefs,
            nextPermittedAction: 'Review the compact policy-visible alias families and contract one smaller observation probe around the recurring support distinction.'
        };
    }
    if (policyVisibleMultiRouteAliases > 0) {
        const pairCount = supportDifferenceSummaries.reduce((total, item) => total + item.witnessPairCount, 0);
        const turnOnly = supportDifferenceSummaries.reduce((total, item) => total + item.completedTurnOnlyPairCount, 0);
        const supportBearing = supportDifferenceSummaries.reduce((total, item) => total + item.additionalSupportDifferencePairCount, 0);
        const changedActions = supportDifferenceSummaries.reduce((total, item) => total + item.differentSelectedActionPairCount, 0);
        return {
            classification: 'retain_and_refine' as const,
            reasons: [
                `Policy-aware visible carriers expose ${pairCount} alias witness pairs across multiple route identities: ${turnOnly} differ only by completed-turn progress and ${supportBearing} also differ in tactical resource/status support.`,
                `${changedActions} witness pairs select different actions; the remaining pairs preserve action choice but still reach time- or support-distinct successors.`,
                'The bounded tactical-support cut lacks exercised repeated twins in at least one config, so support sufficiency remains untested.'
            ],
            witnessRefs,
            nextPermittedAction: 'Contract a smaller recurrence-support twin probe that separates the existing completed-turn-excluding tactical key from exact turn-limit/replay progress before changing gameplay or policy.'
        };
    }
    if (visible.some((item) => item.coverage.status === 'aliased')) {
        return {
            classification: 'retain_and_refine' as const,
            reasons: [
                'The thin visible cut aliases transitions, but restoring config and policy identity removes the observed split.',
                'The next distinction is policy-conditioned rather than evidence for a gameplay mechanic.'
            ],
            witnessRefs,
            nextPermittedAction: 'Return to the R2 policy-choice direction with a separate bounded contract over unchanged carriers.'
        };
    }
    return {
        classification: 'return' as const,
        reasons: [
            'The declared spawn-640 projections expose no repeated alias family that can orient a smaller tactical probe.'
        ],
        witnessRefs,
        nextPermittedAction: 'Return from R1 and review whether the next question requires the R2 policy or R3 authority/playtest cut.'
    };
}

export function assessReachableCarriers(value: unknown): D2HResult {
    const raw = D2HRawExportSchema.parse(value);
    assertFrozenBindings(raw);
    const scopes: readonly CaseScope[] = ['F4', 'I2', 'combined'];
    const cutIds: readonly TransportCutId[] = [
        'spawn640_visible_pressure_v0',
        'spawn640_policy_visible_pressure_v1',
        'spawn640_bounded_tactical_support_v1'
    ];
    const assessments = scopes.flatMap((scope) => {
        const items = scope === 'combined'
            ? raw.items
            : raw.items.filter((item) => item.caseId === scope);
        const relationalCutIds = scope === 'combined' ? cutIds.slice(0, 1) : cutIds.slice(0, 2);
        const relationalAssessments = relationalCutIds.map((cutId) =>
            buildAssessment(scope, cutId, items)
        );
        if (scope === 'combined') return relationalAssessments;
        const supportAssessments = (['player', 'loomkeeper'] as const).map((activeActor) =>
            buildAssessment(
                scope,
                'spawn640_bounded_tactical_support_v1',
                items.filter((item) => item.sourceCarrier.activeActor === activeActor),
                activeActor
            )
        );
        return [...relationalAssessments, ...supportAssessments];
    });
    const itemByRef = new Map(raw.items.map((item) => [item.itemRef, item]));
    const supportDifferenceSummaries = (['F4', 'I2'] as const).map((caseScope) => {
        const assessment = assessments.find((item) =>
            item.caseScope === caseScope &&
            item.cutId === 'spawn640_policy_visible_pressure_v1'
        );
        if (!assessment) throw new Error(`Missing ${caseScope} policy-visible assessment.`);
        return summarizeSupportDifferences(assessment, itemByRef);
    });
    const blockedClaims = [...new Set([
        ...raw.blockedClaims,
        ...D2H_CUT_DEFINITIONS.flatMap((cut) => cut.excludedClaims),
        'Adapter and report parity prove observation fidelity only; they do not establish gameplay design landfall.'
    ])].sort(compareCanonicalText);
    const resultWithoutDigest = {
        schemaVersion: 1 as const,
        resultId: 'wp-015d2h-production-spawn-reachable-carrier-assessment' as const,
        rawExportDigest: raw.exportDigest,
        sourceBindings: raw.sourceBindings,
        domain: raw.domain,
        reportBindings: raw.reportBindings,
        cutDefinitions: D2H_CUT_DEFINITIONS,
        assessments,
        supportDifferenceSummaries,
        accumulatedResidue: [
            'config-identity',
            'policy-identity',
            'route-provenance',
            'tactical-resource-status',
            'turn-progress',
            'excluded-authority-ports'
        ],
        navigationWake: classifyWake(assessments, supportDifferenceSummaries),
        blockedClaims,
        productAuthority: 'none' as const
    };
    return D2HResultSchema.parse({
        ...resultWithoutDigest,
        resultDigest: sha256Digest(resultWithoutDigest)
    });
}

export function canonicalD2HResult(value: D2HResult): string {
    return canonicalJson(D2HResultSchema.parse(value));
}
