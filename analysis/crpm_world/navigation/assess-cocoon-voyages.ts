import { canonicalJson, compareCanonicalText, deepSortJson, sha256Digest, type JsonValue } from '../canonical';
import { assessReachableCarriers } from './assess-reachable-carriers';
import {
    D2HRawExportSchema,
    type D2HCarrierItem,
    type D2HRawExport
} from './reachable-carrier-schemas';
import {
    D2I_D2H_RAW_DIGEST,
    D2I_D2H_RESULT_DIGEST,
    D2ICocoonVoyageSchema,
    D2IOrderedRouteSummarySchema,
    D2IOrderedRouteWitnessSchema,
    D2IResultSchema,
    D2ISourceBindingsSchema,
    D2ITargetSummarySchema,
    D2ITargetWitnessSchema,
    D2IVoyageSummarySchema,
    type D2ICocoonVoyage,
    type D2IOrderedRouteSummary,
    type D2IOrderedRouteWitness,
    type D2IResult,
    type D2ITargetSummary,
    type D2ITargetWitness,
    type D2IVoyageSummary
} from './cocoon-voyage-schemas';

type Actor = 'player' | 'loomkeeper';
type CaseScope = 'F4' | 'I2';
type PreparerPhase = 'first' | 'second';

const CASES: readonly CaseScope[] = ['F4', 'I2'];

const SOURCE_BINDINGS = D2ISourceBindingsSchema.parse({
    repositoryId: 'worms-port',
    sourceCommit: '38f432fb59a37eb37d19b3aa7de1ccde9598388d',
    crpmReferenceCommit: '053c6fc0a90ed48d8667016b18a1d10106a7a2bc',
    d2hRawExportDigest: D2I_D2H_RAW_DIGEST,
    d2hResultDigest: D2I_D2H_RESULT_DIGEST,
    tacticalModelPath: 'analysis/tactical_model/model.py',
    d2hExporterPath: 'analysis/tactical_model/reachable_carrier_probe.py'
});

function otherActor(actor: Actor): Actor {
    return actor === 'player' ? 'loomkeeper' : 'player';
}

function actorState(carrier: D2HCarrierItem['sourceCarrier'], actor: Actor) {
    return carrier[actor];
}

function relation(left: unknown, right: unknown): 'same' | 'different' {
    return canonicalJson(left) === canonicalJson(right) ? 'same' : 'different';
}

function visibleCarrier(carrier: D2HCarrierItem['sourceCarrier']): JsonValue {
    return {
        activeActor: carrier.activeActor,
        playerX: carrier.player.x,
        loomkeeperX: carrier.loomkeeper.x,
        separation: carrier.distance,
        playerStitching: carrier.player.stitching,
        loomkeeperStitching: carrier.loomkeeper.stitching
    };
}

function flattenLeaves(value: JsonValue, prefix = ''): ReadonlyMap<string, JsonValue> {
    const leaves = new Map<string, JsonValue>();
    const walk = (current: JsonValue, path: string): void => {
        if (current !== null && typeof current === 'object' && !Array.isArray(current)) {
            for (const key of Object.keys(current).sort(compareCanonicalText)) {
                walk(current[key], path ? `${path}.${key}` : key);
            }
            return;
        }
        if (Array.isArray(current)) {
            current.forEach((item, index) => walk(item, `${path}[${index}]`));
            return;
        }
        leaves.set(path, current);
    };
    walk(value, prefix);
    return leaves;
}

function differingFields(left: unknown, right: unknown): string[] {
    const leftLeaves = flattenLeaves(deepSortJson(left));
    const rightLeaves = flattenLeaves(deepSortJson(right));
    return [...new Set([...leftLeaves.keys(), ...rightLeaves.keys()])]
        .filter((field) => canonicalJson(leftLeaves.get(field)) !== canonicalJson(rightLeaves.get(field)))
        .sort(compareCanonicalText);
}

function targetStitching(item: D2HCarrierItem, target: Actor): number {
    return actorState(item.targetCarrier, target).stitching;
}

function cocoonDefect(
    left: D2HCarrierItem,
    right: D2HCarrierItem
): NonNullable<D2ITargetWitness['visibleDefect']> {
    if (left.selectedAction.actionKey !== right.selectedAction.actionKey ||
        left.selectedAction.kind !== 'cast' ||
        right.selectedAction.kind !== 'cast' ||
        left.selectedAction.relicId !== right.selectedAction.relicId ||
        !['needlepoint', 'spoolburst'].includes(left.selectedAction.relicId ?? '')) {
        throw new Error('Visible matched-action defect is not an admitted Cocoon cast witness.');
    }
    const target = otherActor(left.sourceCarrier.activeActor);
    if (target !== otherActor(right.sourceCarrier.activeActor)) {
        throw new Error('Visible matched-action defect crosses active-actor targets.');
    }
    const leftAbsorbed = left.analyticalTraceStep.spoolburstCocoonAbsorbedFor === target;
    const rightAbsorbed = right.analyticalTraceStep.spoolburstCocoonAbsorbedFor === target;
    if (leftAbsorbed === rightAbsorbed) {
        throw new Error('Visible matched-action defect lacks exactly one Cocoon absorption.');
    }
    const validateSide = (item: D2HCarrierItem, absorbed: boolean): void => {
        const before = actorState(item.sourceCarrier, target).spoolburstCocoonHits;
        const after = actorState(item.targetCarrier, target).spoolburstCocoonHits;
        if (absorbed) {
            if (before !== 1 || after !== 0 || item.analyticalTraceStep.damage !== 0) {
                throw new Error('Cocoon absorption does not match authoritative before/after support and damage.');
            }
        } else if (before !== 0 || after !== 0 || item.analyticalTraceStep.damage <= 0) {
            throw new Error('Non-absorbed Cocoon control does not retain the expected empty support and positive damage.');
        }
    };
    validateSide(left, leftAbsorbed);
    validateSide(right, rightAbsorbed);
    const side = (item: D2HCarrierItem) => ({
        itemRef: item.itemRef,
        damage: item.analyticalTraceStep.damage,
        targetStitching: targetStitching(item, target),
        cocoonBefore: actorState(item.sourceCarrier, target).spoolburstCocoonHits,
        cocoonAfter: actorState(item.targetCarrier, target).spoolburstCocoonHits
    });
    return {
        cause: 'cocoon_absorption',
        absorbedFor: target,
        relicId: left.selectedAction.relicId as 'needlepoint' | 'spoolburst',
        left: side(left),
        right: side(right)
    };
}

function classifyTargetWitnesses(
    raw: D2HRawExport,
    d2hResult: ReturnType<typeof assessReachableCarriers>
): D2ITargetWitness[] {
    const byRef = new Map(raw.items.map((item) => [item.itemRef, item]));
    const output: D2ITargetWitness[] = [];
    for (const caseScope of CASES) {
        const assessment = d2hResult.assessments.find((item) =>
            item.caseScope === caseScope &&
            item.cutId === 'spawn640_policy_visible_pressure_v1'
        );
        if (!assessment || assessment.witnessRoutes.length !== 68) {
            throw new Error(`${caseScope} policy-visible assessment does not retain its 68 D2H witnesses.`);
        }
        for (const witness of assessment.witnessRoutes) {
            const left = byRef.get(witness.left.itemRef);
            const right = byRef.get(witness.right.itemRef);
            if (!left || !right || left.caseId !== caseScope || right.caseId !== caseScope) {
                throw new Error('Target witness is detached from its case-local D2H carriers.');
            }
            const sourceDifferenceFields = differingFields(left.sourceCarrier, right.sourceCarrier);
            if (sourceDifferenceFields.length === 0) {
                throw new Error('Target witness has no richer source-carrier distinction.');
            }
            const relations = {
                selectedAction: relation(left.selectedAction, right.selectedAction),
                visibleSuccessor: relation(visibleCarrier(left.targetCarrier), visibleCarrier(right.targetCarrier)),
                tacticalRecurrenceSuccessor: relation(left.targetRecurrenceKey, right.targetRecurrenceKey),
                exactCarrierSuccessor: relation(left.targetCarrier, right.targetCarrier),
                terminalRelation: relation(left.terminalRelation, right.terminalRelation)
            } as const;
            let classification: D2ITargetWitness['classification'];
            let visibleDefect: D2ITargetWitness['visibleDefect'] = null;
            if (relations.selectedAction === 'different') {
                classification = 'policy_selection_split';
            } else if (relations.visibleSuccessor === 'different') {
                classification = 'matched_action_visible_descent_defect';
                visibleDefect = cocoonDefect(left, right);
            } else if (relations.tacticalRecurrenceSuccessor === 'different') {
                classification = 'matched_action_recurrence_support_split';
            } else {
                if (canonicalJson(sourceDifferenceFields) !== canonicalJson(['completedTurns'])) {
                    throw new Error('Matched-action exact residue contains support beyond completed-turn progress.');
                }
                if (relations.exactCarrierSuccessor !== 'different') {
                    throw new Error('Completed-turn residue unexpectedly closes at the exact carrier.');
                }
                classification = 'matched_action_exact_time_residue';
            }
            output.push(D2ITargetWitnessSchema.parse({
                schemaVersion: 1,
                caseScope,
                sourceClassKey: witness.sourceClassKey,
                leftItemRef: left.itemRef,
                rightItemRef: right.itemRef,
                leftActionKey: left.selectedAction.actionKey,
                rightActionKey: right.selectedAction.actionKey,
                sourceDifferenceFields,
                relations,
                classification,
                visibleDefect
            }));
        }
    }
    return output.sort((left, right) =>
        compareCanonicalText(left.caseScope, right.caseScope) ||
        compareCanonicalText(left.sourceClassKey, right.sourceClassKey)
    );
}

function summarizeTargets(caseScope: CaseScope, witnesses: readonly D2ITargetWitness[]): D2ITargetSummary {
    const items = witnesses.filter((item) => item.caseScope === caseScope);
    const count = (classification: D2ITargetWitness['classification']) =>
        items.filter((item) => item.classification === classification).length;
    const actionCounts = new Map<string, number>();
    for (const item of items.filter((entry) => entry.visibleDefect !== null)) {
        actionCounts.set(item.leftActionKey, (actionCounts.get(item.leftActionKey) ?? 0) + 1);
    }
    return D2ITargetSummarySchema.parse({
        schemaVersion: 1,
        caseScope,
        witnessPairCount: items.length,
        policySelectionSplitCount: count('policy_selection_split'),
        matchedActionPairCount: items.filter((item) => item.relations.selectedAction === 'same').length,
        visibleDescentDefectCount: count('matched_action_visible_descent_defect'),
        recurrenceSupportSplitCount: count('matched_action_recurrence_support_split'),
        exactTimeResidueCount: count('matched_action_exact_time_residue'),
        matchedActionTerminalSplitCount: items.filter((item) =>
            item.relations.selectedAction === 'same' && item.relations.terminalRelation === 'different'
        ).length,
        visibleDefectActions: [...actionCounts.entries()]
            .sort(([left], [right]) => compareCanonicalText(left, right))
            .map(([actionKey, witnessCount]) => ({ actionKey, witnessCount }))
    });
}

function edgeReference(item: D2HCarrierItem) {
    return {
        itemRef: item.itemRef,
        transitionIndex: item.transitionIndex,
        actor: item.analyticalTraceStep.actor,
        actionKey: item.selectedAction.actionKey,
        sourceCarrierDigest: item.sourceCarrierDigest,
        targetCarrierDigest: item.targetCarrierDigest,
        damage: item.analyticalTraceStep.damage
    };
}

function assertAdjacent(left: D2HCarrierItem, right: D2HCarrierItem): void {
    if (right.transitionIndex !== left.transitionIndex + 1 ||
        right.sourceCarrierDigest !== left.targetCarrierDigest ||
        right.sourceCarrier.activeActor !== otherActor(left.sourceCarrier.activeActor)) {
        throw new Error(`Transition ${right.itemRef} is not an exact alternating successor of ${left.itemRef}.`);
    }
}

function responseRelation(
    response: D2HCarrierItem,
    preparer: Actor
): D2ICocoonVoyage['response']['relation'] {
    if (response.selectedAction.kind === 'unweave_spoolburst') {
        if (response.analyticalTraceStep.spoolburstUnwovenFor !== preparer) {
            throw new Error('Unweave response does not identify the prepared actor.');
        }
        return 'unweave_cleared';
    }
    if (response.selectedAction.kind === 'prepare_spoolburst') {
        return 'counter_preparation';
    }
    if (response.selectedAction.kind === 'cast' && response.selectedAction.relicId === 'threadball') {
        if (response.analyticalTraceStep.spoolburstCocoonAbsorbedFor !== null) {
            throw new Error('Threadball response was incorrectly recorded as Cocoon absorption.');
        }
        return 'threadball_bypassed';
    }
    if (response.selectedAction.kind === 'cast' && response.selectedAction.relicId === 'needlepoint' &&
        response.analyticalTraceStep.spoolburstCocoonAbsorbedFor === preparer) {
        return 'needlepoint_absorbed';
    }
    if (response.selectedAction.kind === 'cast' && response.selectedAction.relicId === 'spoolburst' &&
        response.analyticalTraceStep.spoolburstCocoonAbsorbedFor === preparer) {
        return 'spoolburst_absorbed';
    }
    return 'other';
}

function supportDelta(
    initial: D2HCarrierItem['sourceCarrier'],
    final: D2HCarrierItem['targetCarrier']
) {
    return {
        completedTurns: final.completedTurns - initial.completedTurns,
        playerX: final.player.x - initial.player.x,
        loomkeeperX: final.loomkeeper.x - initial.loomkeeper.x,
        playerStitching: final.player.stitching - initial.player.stitching,
        loomkeeperStitching: final.loomkeeper.stitching - initial.loomkeeper.stitching,
        playerEscapeSlack: final.player.escapeSlack - initial.player.escapeSlack,
        loomkeeperEscapeSlack: final.loomkeeper.escapeSlack - initial.loomkeeper.escapeSlack,
        playerPreparation: final.player.spoolburstPreparationTurns - initial.player.spoolburstPreparationTurns,
        loomkeeperPreparation: final.loomkeeper.spoolburstPreparationTurns - initial.loomkeeper.spoolburstPreparationTurns,
        playerCocoon: final.player.spoolburstCocoonHits - initial.player.spoolburstCocoonHits,
        loomkeeperCocoon: final.loomkeeper.spoolburstCocoonHits - initial.loomkeeper.spoolburstCocoonHits
    };
}

function formVoyage(
    formation: D2HCarrierItem,
    response: D2HCarrierItem,
    following: D2HCarrierItem | undefined
): D2ICocoonVoyage {
    const preparer = formation.analyticalTraceStep.actor;
    if (formation.selectedAction.kind !== 'prepare_spoolburst' ||
        formation.analyticalTraceStep.spoolburstPreparationStartedBy !== preparer) {
        throw new Error('Cocoon voyage formation is not an authoritative preparation edge.');
    }
    assertAdjacent(formation, response);
    if (actorState(formation.sourceCarrier, preparer).spoolburstPreparationTurns !== 0 ||
        actorState(formation.sourceCarrier, preparer).spoolburstCocoonHits !== 0 ||
        actorState(formation.targetCarrier, preparer).spoolburstPreparationTurns !== 1 ||
        actorState(formation.targetCarrier, preparer).spoolburstCocoonHits !== 1) {
        throw new Error('Preparation does not publicly form the expected one-turn preparation and one-hit Cocoon.');
    }
    const responseKind = responseRelation(response, preparer);
    if (responseKind === 'other') {
        throw new Error(`Cocoon voyage ${formation.itemRef} has an unclassified immediate response.`);
    }
    const afterResponse = actorState(response.targetCarrier, preparer);
    let cocoonDisposition: D2ICocoonVoyage['cocoonDisposition'];
    let resolutionDisposition: D2ICocoonVoyage['resolutionDisposition'];
    let lifecycleEndEdge: D2ICocoonVoyage['lifecycleEndEdge'];
    let finalEdge: D2HCarrierItem;
    if (responseKind === 'needlepoint_absorbed' || responseKind === 'spoolburst_absorbed') {
        if (afterResponse.spoolburstCocoonHits !== 0 || afterResponse.spoolburstPreparationTurns !== 1) {
            throw new Error('Absorbed response does not consume only the Cocoon while preserving preparation.');
        }
        cocoonDisposition = responseKind === 'needlepoint_absorbed'
            ? 'consumed_by_needlepoint'
            : 'consumed_by_spoolburst';
    } else if (responseKind === 'unweave_cleared') {
        if (afterResponse.spoolburstCocoonHits !== 0 || afterResponse.spoolburstPreparationTurns !== 0) {
            throw new Error('Unweave does not clear Cocoon and preparation together.');
        }
        cocoonDisposition = 'cleared_by_unweave';
    } else {
        if (afterResponse.spoolburstCocoonHits !== 1 || afterResponse.spoolburstPreparationTurns !== 1) {
            throw new Error('Non-clearing response does not transport Cocoon and preparation unchanged.');
        }
        cocoonDisposition = 'expired_on_release';
    }

    if (response.targetCarrier.winner !== null) {
        resolutionDisposition = 'terminal_before_resolution';
        cocoonDisposition = cocoonDisposition === 'cleared_by_unweave'
            ? cocoonDisposition
            : 'terminal_or_unresolved';
        lifecycleEndEdge = 'response';
        finalEdge = response;
    } else if (responseKind === 'unweave_cleared') {
        resolutionDisposition = 'unwoven';
        lifecycleEndEdge = 'response';
        finalEdge = response;
        if (following) assertAdjacent(response, following);
    } else {
        if (!following) {
            throw new Error('Prepared Cocoon voyage lacks the preparer resolution edge.');
        }
        assertAdjacent(response, following);
        if (following.analyticalTraceStep.actor !== preparer ||
            following.selectedAction.kind !== 'cast' ||
            following.selectedAction.relicId !== 'spoolburst') {
            throw new Error('Prepared Cocoon voyage does not resolve through the expected Spoolburst release.');
        }
        if (actorState(following.sourceCarrier, preparer).spoolburstPreparationTurns !== 1 ||
            actorState(following.targetCarrier, preparer).spoolburstPreparationTurns !== 0 ||
            actorState(following.targetCarrier, preparer).spoolburstCocoonHits !== 0) {
            throw new Error('Spoolburst release does not discharge preparation and remaining Cocoon support.');
        }
        resolutionDisposition = 'released_spoolburst';
        lifecycleEndEdge = 'following_preparer';
        finalEdge = following;
    }
    const reentryItemRefs = [formation.itemRef, response.itemRef];
    if (following) reentryItemRefs.push(following.itemRef);
    const payload = {
        schemaVersion: 1 as const,
        caseScope: formation.caseId,
        configId: formation.configId,
        matchRef: formation.matchRef,
        playerPolicy: formation.domain.playerPolicy,
        loomkeeperPolicy: formation.domain.loomkeeperPolicy,
        firstActor: formation.domain.firstActor,
        mirrored: formation.domain.mirrored,
        preparer,
        preparerPhase: (preparer === formation.domain.firstActor ? 'first' : 'second') as PreparerPhase,
        formation: edgeReference(formation),
        response: { ...edgeReference(response), relation: responseKind },
        followingPreparerEdge: following ? edgeReference(following) : null,
        lifecycleEndEdge,
        cocoonDisposition,
        resolutionDisposition,
        supportDelta: supportDelta(formation.sourceCarrier, finalEdge.targetCarrier),
        recurrenceReturn: relation(formation.sourceRecurrenceKey, finalEdge.targetRecurrenceKey) === 'same',
        terminalRelation: finalEdge.terminalRelation,
        reentryItemRefs
    };
    const voyageDigest = sha256Digest(payload);
    return D2ICocoonVoyageSchema.parse({
        voyageRef: `d2i-voyage-${voyageDigest.slice(0, 24)}`,
        ...payload,
        voyageDigest
    });
}

function reconstructVoyages(raw: D2HRawExport): D2ICocoonVoyage[] {
    const byMatch = new Map<string, D2HCarrierItem[]>();
    for (const item of raw.items) {
        const prior = byMatch.get(item.matchRef) ?? [];
        prior.push(item);
        byMatch.set(item.matchRef, prior);
    }
    const voyages: D2ICocoonVoyage[] = [];
    for (const items of byMatch.values()) {
        const ordered = items.sort((left, right) => left.transitionIndex - right.transitionIndex);
        const byIndex = new Map(ordered.map((item) => [item.transitionIndex, item]));
        for (const formation of ordered.filter((item) =>
            item.analyticalTraceStep.spoolburstPreparationStartedBy !== null
        )) {
            const response = byIndex.get(formation.transitionIndex + 1);
            if (!response) {
                throw new Error(`Preparation ${formation.itemRef} lacks an immediate response edge.`);
            }
            voyages.push(formVoyage(formation, response, byIndex.get(formation.transitionIndex + 2)));
        }
    }
    return voyages.sort((left, right) =>
        compareCanonicalText(left.caseScope, right.caseScope) ||
        compareCanonicalText(left.matchRef, right.matchRef) ||
        left.formation.transitionIndex - right.formation.transitionIndex
    );
}

function summarizeVoyages(
    caseScope: CaseScope,
    preparerPhase: PreparerPhase,
    voyages: readonly D2ICocoonVoyage[]
): D2IVoyageSummary {
    const items = voyages.filter((item) =>
        item.caseScope === caseScope && item.preparerPhase === preparerPhase
    );
    const responseCount = (value: D2ICocoonVoyage['response']['relation']) =>
        items.filter((item) => item.response.relation === value).length;
    const cocoonCount = (value: D2ICocoonVoyage['cocoonDisposition']) =>
        items.filter((item) => item.cocoonDisposition === value).length;
    const resolutionCount = (value: D2ICocoonVoyage['resolutionDisposition']) =>
        items.filter((item) => item.resolutionDisposition === value).length;
    return D2IVoyageSummarySchema.parse({
        schemaVersion: 1,
        caseScope,
        preparerPhase,
        formationCount: items.length,
        uniqueMatchCount: new Set(items.map((item) => item.matchRef)).size,
        responseCounts: {
            needlepointAbsorbed: responseCount('needlepoint_absorbed'),
            spoolburstAbsorbed: responseCount('spoolburst_absorbed'),
            threadballBypassed: responseCount('threadball_bypassed'),
            unweaveCleared: responseCount('unweave_cleared'),
            counterPreparation: responseCount('counter_preparation'),
            other: responseCount('other')
        },
        cocoonDispositionCounts: {
            consumedByNeedlepoint: cocoonCount('consumed_by_needlepoint'),
            consumedBySpoolburst: cocoonCount('consumed_by_spoolburst'),
            clearedByUnweave: cocoonCount('cleared_by_unweave'),
            expiredOnRelease: cocoonCount('expired_on_release'),
            terminalOrUnresolved: cocoonCount('terminal_or_unresolved')
        },
        resolutionCounts: {
            releasedSpoolburst: resolutionCount('released_spoolburst'),
            unwoven: resolutionCount('unwoven'),
            terminalBeforeResolution: resolutionCount('terminal_before_resolution'),
            unresolved: resolutionCount('unresolved')
        },
        recurrenceReturnCount: items.filter((item) => item.recurrenceReturn).length,
        terminalVoyageCount: items.filter((item) => item.terminalRelation.postStateFinished).length,
        aggregateResponseDamage: items.reduce((total, item) => total + item.response.damage, 0)
    });
}

function reconstructOrderedWitnesses(
    raw: D2HRawExport,
    voyages: readonly D2ICocoonVoyage[]
): D2IOrderedRouteWitness[] {
    const voyageByFormation = new Map(voyages.map((item) => [item.formation.itemRef, item]));
    const itemByRef = new Map(raw.items.map((item) => [item.itemRef, item]));
    const matchTerminal = new Map<string, { winner: Actor | 'draw'; completedTurns: number }>();
    for (const item of raw.items) {
        if (item.targetCarrier.winner !== null) {
            matchTerminal.set(item.matchRef, {
                winner: item.targetCarrier.winner,
                completedTurns: item.targetCarrier.completedTurns
            });
        }
    }
    const witnesses: D2IOrderedRouteWitness[] = [];
    for (const secondVoyage of voyages.filter((item) =>
        item.preparerPhase === 'second' && item.response.relation === 'counter_preparation'
    )) {
        const firstVoyage = voyageByFormation.get(secondVoyage.response.itemRef);
        if (!firstVoyage || firstVoyage.preparerPhase !== 'first' ||
            firstVoyage.matchRef !== secondVoyage.matchRef ||
            !secondVoyage.followingPreparerEdge || !firstVoyage.followingPreparerEdge ||
            firstVoyage.response.itemRef !== secondVoyage.followingPreparerEdge.itemRef) {
            throw new Error('Counter-preparation route does not re-enter as an interleaved first-phase Cocoon voyage.');
        }
        const secondRelease = itemByRef.get(secondVoyage.followingPreparerEdge.itemRef);
        const firstRelease = itemByRef.get(firstVoyage.followingPreparerEdge.itemRef);
        const secondFormation = itemByRef.get(secondVoyage.formation.itemRef);
        const firstFormation = itemByRef.get(firstVoyage.formation.itemRef);
        if (!secondRelease || !firstRelease || !secondFormation || !firstFormation) {
            throw new Error('Ordered Cocoon route has detached transition references.');
        }
        if (secondRelease.selectedAction.relicId !== 'spoolburst' ||
            firstRelease.selectedAction.relicId !== 'spoolburst' ||
            secondRelease.analyticalTraceStep.spoolburstCocoonAbsorbedFor !== firstVoyage.preparer ||
            secondRelease.analyticalTraceStep.damage !== 0 ||
            actorState(secondRelease.sourceCarrier, secondVoyage.preparer).spoolburstCocoonHits !== 1 ||
            actorState(secondRelease.targetCarrier, secondVoyage.preparer).spoolburstCocoonHits !== 0) {
            throw new Error('Interleaved route does not preserve the expected later-Cocoon absorption and earlier-Cocoon expiry.');
        }
        const terminal = matchTerminal.get(secondVoyage.matchRef);
        if (!terminal || terminal.winner !== secondVoyage.firstActor) {
            throw new Error('Ordered Cocoon witness match does not terminate for the first actor.');
        }
        const payload = {
            schemaVersion: 1 as const,
            caseScope: secondVoyage.caseScope,
            matchRef: secondVoyage.matchRef,
            playerPolicy: secondVoyage.playerPolicy as 'short_approach',
            loomkeeperPolicy: secondVoyage.loomkeeperPolicy as 'short_approach',
            firstActor: secondVoyage.firstActor,
            mirrored: secondVoyage.mirrored,
            secondPhaseVoyageRef: secondVoyage.voyageRef,
            firstPhaseVoyageRef: firstVoyage.voyageRef,
            actionSequence: [
                secondFormation.selectedAction.actionKey,
                firstFormation.selectedAction.actionKey,
                secondRelease.selectedAction.actionKey,
                firstRelease.selectedAction.actionKey
            ] as const,
            secondActorReleaseDamage: secondRelease.analyticalTraceStep.damage,
            firstActorReleaseDamage: firstRelease.analyticalTraceStep.damage,
            laterCocoonAbsorbsEarlierRelease: true as const,
            earlierCocoonExpiresOnRelease: true as const,
            finalWinner: terminal.winner,
            finalCompletedTurns: terminal.completedTurns,
            firstActorWins: true as const,
            reentryItemRefs: [
                secondFormation.itemRef,
                firstFormation.itemRef,
                secondRelease.itemRef,
                firstRelease.itemRef
            ] as const
        };
        const witnessDigest = sha256Digest(payload);
        witnesses.push(D2IOrderedRouteWitnessSchema.parse({
            witnessRef: `d2i-order-${witnessDigest.slice(0, 24)}`,
            ...payload,
            witnessDigest
        }));
    }
    return witnesses.sort((left, right) =>
        compareCanonicalText(left.caseScope, right.caseScope) ||
        compareCanonicalText(left.matchRef, right.matchRef) ||
        compareCanonicalText(left.witnessRef, right.witnessRef)
    );
}

function summarizeOrderedRoutes(
    caseScope: CaseScope,
    voyageSummaries: readonly D2IVoyageSummary[],
    witnesses: readonly D2IOrderedRouteWitness[]
): D2IOrderedRouteSummary {
    const first = voyageSummaries.find((item) =>
        item.caseScope === caseScope && item.preparerPhase === 'first'
    );
    const second = voyageSummaries.find((item) =>
        item.caseScope === caseScope && item.preparerPhase === 'second'
    );
    if (!first || !second) throw new Error(`Missing ${caseScope} phase summaries.`);
    const local = witnesses.filter((item) => item.caseScope === caseScope);
    const formationCountsEqual = first.formationCount === second.formationCount;
    const releaseUnweaveDispositionEqual = canonicalJson(first.resolutionCounts) === canonicalJson(second.resolutionCounts);
    const firstPhaseSpoolburstResponseCount = first.responseCounts.spoolburstAbsorbed;
    const secondPhaseCounterPreparationResponseCount = second.responseCounts.counterPreparation;
    const uniqueMatches = new Set(local.map((item) => item.matchRef));
    const classification = local.length > 0 &&
        local.length === firstPhaseSpoolburstResponseCount &&
        local.length === secondPhaseCounterPreparationResponseCount
        ? 'ordered_response_split'
        : firstPhaseSpoolburstResponseCount !== secondPhaseCounterPreparationResponseCount
            ? 'aggregate_residue_only'
            : 'no_split';
    return D2IOrderedRouteSummarySchema.parse({
        schemaVersion: 1,
        caseScope,
        formationCountsEqual,
        releaseUnweaveDispositionEqual,
        firstPhaseSpoolburstResponseCount,
        secondPhaseCounterPreparationResponseCount,
        orderedWitnessCount: local.length,
        uniqueWitnessMatchCount: uniqueMatches.size,
        firstActorWinMatchCount: new Set(local.filter((item) => item.firstActorWins).map((item) => item.matchRef)).size,
        classification
    });
}

function sameLocalPattern(left: unknown, right: unknown): boolean {
    const stripCase = (value: unknown): JsonValue => {
        const copy = JSON.parse(canonicalJson(value)) as Record<string, JsonValue>;
        delete copy.caseScope;
        return copy;
    };
    return canonicalJson(stripCase(left)) === canonicalJson(stripCase(right));
}

function navigationWake(
    targets: readonly D2ITargetSummary[],
    voyageSummaries: readonly D2IVoyageSummary[],
    ordered: readonly D2IOrderedRouteSummary[],
    orderedWitnesses: readonly D2IOrderedRouteWitness[],
    targetWitnesses: readonly D2ITargetWitness[]
) {
    const targetPatternsMatch = sameLocalPattern(targets[0], targets[1]);
    const voyagePatternsMatch = sameLocalPattern(voyageSummaries[0], voyageSummaries[2]) &&
        sameLocalPattern(voyageSummaries[1], voyageSummaries[3]);
    const orderedPatternsMatch = sameLocalPattern(ordered[0], ordered[1]);
    const exactOrdered = ordered.every((item) =>
        item.classification === 'ordered_response_split' &&
        item.formationCountsEqual && item.releaseUnweaveDispositionEqual &&
        item.orderedWitnessCount > 0 &&
        item.uniqueWitnessMatchCount === item.firstActorWinMatchCount
    );
    const visibleDefects = targets.reduce((total, item) => total + item.visibleDescentDefectCount, 0);
    const terminalSplits = targets.reduce((total, item) => total + item.matchedActionTerminalSplitCount, 0);
    if (visibleDefects > 0 && terminalSplits === 0 && exactOrdered &&
        targetPatternsMatch && voyagePatternsMatch && orderedPatternsMatch) {
        return {
            classification: 'advance_to_candidate_question' as const,
            reasons: [
                `Matched-action target typing isolates ${visibleDefects} immediate visible descent witnesses across F4 and I2, all bound to existing Cocoon absorption rather than completed-turn residue.`,
                'Cocoon formation and release/Unweave totals are phase-symmetric, but short-approach mirror routes retain an exact ordered response split between firing into the first actor Cocoon and counter-preparing before the second actor release.',
                `The ${ordered.reduce((total, item) => total + item.orderedWitnessCount, 0)} interleaved voyage witnesses occupy ${ordered.reduce((total, item) => total + item.uniqueWitnessMatchCount, 0)} unique matches, each ending for the first actor in this fixed policy domain.`,
                'F4 and I2 reproduce the same target and voyage pattern, so the wake belongs to their shared F4 Cocoon/preparation carrier rather than I2 entry-Seam-Pin behavior.'
            ],
            witnessRefs: [
                ...orderedWitnesses.map((item) => item.witnessRef),
                ...targetWitnesses.filter((item) => item.visibleDefect !== null).slice(0, 4).map((item) => item.sourceClassKey)
            ],
            nextPermittedAction: 'Owner review may open a separate candidate-question contract about Cocoon formation/expiry timing in interleaved preparation routes; no model or config change is authorized by D2I.'
        };
    }
    if (visibleDefects > 0 || ordered.some((item) => item.classification !== 'no_split')) {
        return {
            classification: 'retain_and_refine' as const,
            reasons: [
                'A target-specific or route-order distinction survives, but it lacks a case-local re-enterable interface sufficient to open a candidate question.'
            ],
            witnessRefs: targetWitnesses.filter((item) => item.visibleDefect !== null).slice(0, 8).map((item) => item.sourceClassKey),
            nextPermittedAction: 'Refine the Cocoon voyage support cut without changing gameplay or policy.'
        };
    }
    return {
        classification: 'return' as const,
        reasons: ['No target-specific Cocoon transport distinction survived the frozen D2H carrier audit.'],
        witnessRefs: targetWitnesses.slice(0, 1).map((item) => item.sourceClassKey),
        nextPermittedAction: 'Return to the D2G navigation chart; do not open a Cocoon gameplay candidate.'
    };
}

export function assessCocoonVoyages(value: unknown): D2IResult {
    const raw = D2HRawExportSchema.parse(value);
    if (raw.exportDigest !== D2I_D2H_RAW_DIGEST) {
        throw new Error('D2I input does not match the frozen D2H raw export digest.');
    }
    const d2hResult = assessReachableCarriers(raw);
    if (d2hResult.resultDigest !== D2I_D2H_RESULT_DIGEST) {
        throw new Error('D2I could not re-enter the frozen D2H assessment result.');
    }
    const targetWitnesses = classifyTargetWitnesses(raw, d2hResult);
    const targetSummaries = CASES.map((caseScope) => summarizeTargets(caseScope, targetWitnesses)) as [
        D2ITargetSummary, D2ITargetSummary
    ];
    const voyages = reconstructVoyages(raw);
    const voyageSummaries = CASES.flatMap((caseScope) =>
        (['first', 'second'] as const).map((phase) => summarizeVoyages(caseScope, phase, voyages))
    ) as [D2IVoyageSummary, D2IVoyageSummary, D2IVoyageSummary, D2IVoyageSummary];
    const orderedRouteWitnesses = reconstructOrderedWitnesses(raw, voyages);
    const orderedRouteSummaries = CASES.map((caseScope) =>
        summarizeOrderedRoutes(caseScope, voyageSummaries, orderedRouteWitnesses)
    ) as [D2IOrderedRouteSummary, D2IOrderedRouteSummary];
    const resultWithoutDigest = {
        schemaVersion: 1 as const,
        resultId: 'wp-015d2i-cocoon-formation-ordered-transport-audit' as const,
        sourceBindings: SOURCE_BINDINGS,
        targetWitnesses,
        targetSummaries,
        voyages,
        voyageSummaries,
        orderedRouteWitnesses,
        orderedRouteSummaries,
        navigationWake: navigationWake(
            targetSummaries,
            voyageSummaries,
            orderedRouteSummaries,
            orderedRouteWitnesses,
            targetWitnesses
        ),
        accumulatedResidue: [
            'fixed-policy-covariance',
            'representative-alias-pairs',
            'completed-turn-progress',
            'recurrence-support',
            'cocoon-formation',
            'cocoon-expiry-on-release',
            'ordered-response-route',
            'spawn640-domain',
            'excluded-production-ports'
        ],
        blockedClaims: [
            'D2I does not prove that Cocoon timing causes the complete first-actor rate.',
            'D2I does not establish optimal play, human behavior, or a strategy-complete policy family.',
            'Equal F4/I2 patterns do not multiply evidence or create an I2-specific repair claim.',
            'The ordered response split is not a mathematical noncommutative-operator proof or universal CRPM object.',
            'Target-specific descent witnesses do not establish a unique or minimal recursive carrier.',
            'No gameplay mechanic, value, status, V5 ruleset, protocol, replay, reward, UI, or production authority is approved.'
        ],
        productAuthority: 'none' as const
    };
    return D2IResultSchema.parse({
        ...resultWithoutDigest,
        resultDigest: sha256Digest(resultWithoutDigest)
    });
}

export function canonicalD2IResult(result: D2IResult): string {
    return canonicalJson(D2IResultSchema.parse(result));
}
