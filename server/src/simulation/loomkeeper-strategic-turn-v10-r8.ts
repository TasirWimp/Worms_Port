import { hashCanonicalV10Value } from '../../../shared/simulation-v10';
import type { SimulationStateV10R8 } from '../../../shared/simulation-v10-r8';
import { V10_R8_CHAPTER_POLICY_ID, V10_R8_CHAPTER_PROMPT_VERSION,
    type CommittedChapterCarrierV10R8 } from '../../../shared/chapter-v10-r8';
import {
    CommittedStrategicVoyageV10R8Schema,
    EMPTY_COMMITTED_VOYAGE_V10_R8,
    RecentStrategicChangesV10R8Schema,
    StrategicTurnRecordV10R8Schema,
    V10_R8_PROMPT_VERSION,
    type CommittedStrategicVoyageV10R8,
    type RecentStrategicChangesV10R8,
    type StrategicDecisionV10R8,
    type StrategicTurnRecordV10R8
} from '../../../shared/strategic-voyage-v10-r8';
import {
    type CandidateCapabilityV10R8,
    type StrategicCandidateSummaryV10R8,
    type StrategicDecisionBoundaryV10R8
} from './loomkeeper-strategy-v10-r8';
import type { StrategicProviderResultV10R8 } from './loomkeeper-strategy-provider-v10-r8';
import type { ChapterStoryProviderResultV10R8 } from './loomkeeper-chapter-provider-v10-r8';
import { chapterStoryRequestBodyV10R8 } from './loomkeeper-chapter-provider-v10-r8';
import { matchChapterIntentionV10R8 } from './loomkeeper-chapter-matcher-v10-r8';
import { validateChapterStoryV10R8, type ChapterStoryBriefV10R8,
    type FrozenChapterStoryV10R8 } from './loomkeeper-chapter-story-v10-r8';

export type PendingStrategicTurnV10R8 = Readonly<{
    boundary: StrategicDecisionBoundaryV10R8;
    capability: CandidateCapabilityV10R8;
    candidate: StrategicCandidateSummaryV10R8;
    record: StrategicTurnRecordV10R8;
}>;

export function authorizeStrategicTurnV10R8(input: Readonly<{
    boundary: StrategicDecisionBoundaryV10R8;
    state: SimulationStateV10R8;
    currentStrategy?: CommittedStrategicVoyageV10R8;
    providerResult?: StrategicProviderResultV10R8;
}>): PendingStrategicTurnV10R8 {
    const currentStrategy = CommittedStrategicVoyageV10R8Schema.parse(
        input.currentStrategy ?? EMPTY_COMMITTED_VOYAGE_V10_R8
    );
    const providerResult = input.providerResult;
    const fallback = input.boundary.deterministicFallbackCandidate();

    let selected = fallback;
    let providerDecision: StrategicDecisionV10R8 | null = providerResult?.decision ?? null;
    let outcome: StrategicTurnRecordV10R8['operationalOutcome'] = providerResult?.outcome ?? 'selected';
    let diagnostic = providerResult?.diagnostic ?? null;
    let decisionSource: StrategicTurnRecordV10R8['decisionSource'] = 'deterministic_fallback';
    const decision = providerDecision?.candidateId ? providerDecision : null;
    if (decision) {
        const semanticError = validateDecision(input.boundary, input.state, currentStrategy, decision);
        const candidate = input.boundary.brief.legalCandidates.find(item => item.candidateId === decision.candidateId);
        if (!semanticError && candidate) {
            if (providerResult?.providerMode !== 'gemini_shadow' &&
                providerResult?.providerMode !== 'mistral_shadow') {
                selected = candidate;
                decisionSource = providerResult?.providerMode === 'gemini' ? 'gemini' : 'local_fake';
            }
        } else {
            outcome = 'invalid_response';
            diagnostic = semanticError ?? 'Provider candidate is not in the current atlas.';
        }
    }

    const proposedVoyage = decisionSource !== 'deterministic_fallback' && decision
        ? voyageFromDecision(input.state, currentStrategy, decision, selected)
        : fallbackVoyage(input.state, currentStrategy, selected);
    const evidence = input.boundary.evidence();
    const timingMs = providerResult?.timingMs ?? Object.freeze({
        preparation: 0, provider: 0, validation: 0, total: 0
    });
    const record = StrategicTurnRecordV10R8Schema.parse({
        revision: input.boundary.brief.revision,
        policyId: input.boundary.brief.policyId,
        promptVersion: V10_R8_PROMPT_VERSION,
        providerMode: providerResult?.providerMode ?? 'deterministic',
        modelId: providerResult?.modelId ?? null,
        operationalOutcome: outcome,
        turn: input.state.turn,
        ...evidence,
        selectedCandidateId: selected.candidateId,
        decisionSource,
        providerDecision,
        status: 'pending',
        proposedVoyage,
        committedVoyage: null,
        immediatePredictionHash: hashCanonicalV10Value(selected.immediate),
        observedStateHash: null,
        timingMs,
        usage: providerResult?.usage ?? null,
        responseBytes: providerResult?.responseBytes ?? null,
        diagnostic
    });
    return Object.freeze({
        boundary: input.boundary,
        capability: input.boundary.resolve(selected.candidateId),
        candidate: selected,
        record
    });
}

/** The chapter story conditions only server ranking; the current-basis capability still executes. */
export function authorizeChapterTurnV10R8(input: Readonly<{
    boundary: StrategicDecisionBoundaryV10R8;
    state: SimulationStateV10R8;
    storyBrief: ChapterStoryBriefV10R8;
    currentStrategy: CommittedStrategicVoyageV10R8;
    providerResult: ChapterStoryProviderResultV10R8;
}>): PendingStrategicTurnV10R8 {
    const { boundary, state, storyBrief, providerResult } = input;
    if (storyBrief.stateHash !== boundary.brief.stateHash ||
        storyBrief.mode !== state.objective.objectiveMode ||
        (providerResult.frozenStory !== null &&
            hashCanonicalV10Value(storyBrief) !== providerResult.frozenStory.briefHash)) {
        throw new Error('Chapter story and legal atlas must share the current authoritative state.');
    }
    const currentStrategy = CommittedStrategicVoyageV10R8Schema.parse(input.currentStrategy);
    const fallback = boundary.deterministicFallbackCandidate();
    let selected = fallback;
    let frozenStory: FrozenChapterStoryV10R8 | null = null;
    let outcome: StrategicTurnRecordV10R8['operationalOutcome'] = providerResult.outcome;
    let diagnostic = providerResult.diagnostic;
    let decisionSource: StrategicTurnRecordV10R8['decisionSource'] = 'deterministic_fallback';
    if (providerResult.outcome === 'selected' && providerResult.frozenStory) {
        try {
            frozenStory = validateChapterStoryV10R8(storyBrief, providerResult.frozenStory.proposal);
            const comparison = matchChapterIntentionV10R8({ storyBrief, frozenStory,
                decisionBrief: boundary.brief, fallbackCandidateId: fallback.candidateId });
            const chosen = boundary.brief.legalCandidates.find(candidate =>
                candidate.candidateId === comparison.deterministicCandidateId);
            if (!chosen) throw new Error('Matcher selected a missing candidate.');
            selected = chosen;
            decisionSource = 'server_matcher';
        } catch {
            frozenStory = null;
            outcome = 'invalid_response';
            diagnostic = 'chapter_match_rejected';
        }
    } else if (providerResult.outcome === 'selected') {
        outcome = 'invalid_response';
        diagnostic = 'chapter_story_missing';
    }
    const proposedVoyage = frozenStory ? chapterVoyage(state, currentStrategy, frozenStory, selected) :
        fallbackVoyage(state, currentStrategy, selected);
    const evidence = boundary.evidence();
    const record = StrategicTurnRecordV10R8Schema.parse({
        revision: boundary.brief.revision,
        policyId: V10_R8_CHAPTER_POLICY_ID,
        promptVersion: V10_R8_CHAPTER_PROMPT_VERSION,
        providerMode: 'chapter_mistral', modelId: providerResult.modelId,
        operationalOutcome: outcome, turn: state.turn,
        ...evidence,
        selectedCandidateId: selected.candidateId,
        decisionSource, providerDecision: null,
        chapter: {
            observationBasisId: storyBrief.basisId,
            storyRequestHash: providerResult.requestHash,
            storyBriefHash: frozenStory?.briefHash ?? null,
            storyHash: frozenStory?.proposalHash ?? null,
            story: frozenStory?.proposal ?? null,
            carrier: null
        },
        status: 'pending', proposedVoyage, committedVoyage: null,
        immediatePredictionHash: hashCanonicalV10Value(selected.immediate), observedStateHash: null,
        timingMs: providerResult.timingMs,
        usage: providerResult.usage, responseBytes: providerResult.responseBytes,
        diagnostic
    });
    if (record.chapter?.storyRequestHash !== hashCanonicalV10Value(chapterStoryRequestBodyV10R8(storyBrief))) {
        throw new Error('Chapter request changed before authorization.');
    }
    return Object.freeze({ boundary, capability: boundary.resolve(selected.candidateId), candidate: selected, record });
}

function chapterVoyage(
    state: SimulationStateV10R8,
    current: CommittedStrategicVoyageV10R8,
    story: FrozenChapterStoryV10R8,
    candidate: StrategicCandidateSummaryV10R8
): CommittedStrategicVoyageV10R8 {
    const intention = story.proposal.intention;
    const milestoneId = chapterMilestone(intention.posture);
    const decision: Extract<StrategicDecisionV10R8, { candidateId: string }> = {
        candidateId: candidate.candidateId,
        strategy: current.targetId === intention.targetId && current.milestoneId === milestoneId
            ? 'continue' : 'switch',
        targetId: intention.targetId,
        milestoneId,
        horizonOwnTurns: intention.horizonOwnTurns,
        reason: intention.reason,
        watchFor: intention.watchFor
    };
    return voyageFromDecision(state, current, decision, candidate);
}

function chapterMilestone(posture: FrozenChapterStoryV10R8['proposal']['intention']['posture']): string {
    switch (posture) {
    case 'contest_coin': case 'dislodge_chest': return 'resolve-objective';
    case 'approach_chest': return 'approach-objective';
    case 'shape_coin_route': case 'open_chest_route': return 'create-route';
    case 'deny_coin_route': case 'deny_chest_route': return 'deny-player-route';
    case 'hold_chest': return 'preserve-route';
    case 'intercept_player': case 'pressure_player': return 'pressure-player';
    case 'survive': return 'survive-response';
    }
}

export function executingStrategicTurnV10R8(
    pending: StrategicTurnRecordV10R8
): StrategicTurnRecordV10R8 {
    if (pending.status !== 'pending') throw new Error('Only a pending strategic turn can begin execution.');
    return StrategicTurnRecordV10R8Schema.parse({ ...pending, status: 'executing' });
}

export function committedStrategicTurnV10R8(
    executing: StrategicTurnRecordV10R8,
    observedStateHash: string,
    chapterCarrier?: CommittedChapterCarrierV10R8
): StrategicTurnRecordV10R8 {
    if (executing.status !== 'executing' || !executing.proposedVoyage) {
        throw new Error('Only an executing strategic turn with a proposed voyage can commit.');
    }
    if ((executing.policyId === V10_R8_CHAPTER_POLICY_ID) !== (chapterCarrier !== undefined)) {
        throw new Error('A chapter turn must commit its authoritative chapter carrier.');
    }
    return StrategicTurnRecordV10R8Schema.parse({
        ...executing,
        status: 'committed',
        committedVoyage: executing.proposedVoyage,
        observedStateHash,
        ...(chapterCarrier && executing.chapter ? { chapter: { ...executing.chapter, carrier: chapterCarrier } } : {})
    });
}

export function deriveRecentStrategicChangesV10R8(input: Readonly<{
    previous: SimulationStateV10R8;
    current: SimulationStateV10R8;
    currentStrategy: CommittedStrategicVoyageV10R8;
    previousAction: string | null;
    observedResult: string | null;
}>): RecentStrategicChangesV10R8 {
    const playerBefore = input.previous.units[0];
    const playerAfter = input.current.units[0];
    const playerChanges: string[] = [];
    const moved = Math.round((playerAfter.xFp - playerBefore.xFp) / 256);
    if (moved) playerChanges.push(`Player moved ${Math.abs(moved)} world units ${moved < 0 ? 'left' : 'right'}.`);
    const stitching = playerAfter.stitching - playerBefore.stitching;
    if (stitching) playerChanges.push(`Player stitching changed by ${stitching}.`);
    const score = input.current.objective.scores.player - input.previous.objective.scores.player;
    if (score) playerChanges.push(`Player objective score changed by ${score}.`);
    if (playerBefore.alive !== playerAfter.alive) playerChanges.push(`Player alive state changed to ${playerAfter.alive}.`);
    const systemChanges: string[] = [];
    if (input.current.terrainRevision !== input.previous.terrainRevision) {
        systemChanges.push(`Terrain revision changed from ${input.previous.terrainRevision} to ${input.current.terrainRevision}.`);
    }
    for (const object of input.current.objective.objects) {
        const before = input.previous.objective.objects.find(candidate => candidate.id === object.id);
        if (before && before.status !== object.status) {
            systemChanges.push(`${object.id} changed from ${before.status} to ${object.status}.`);
        }
    }
    return RecentStrategicChangesV10R8Schema.parse({
        previousAction: input.previousAction,
        observedResult: input.observedResult,
        playerChanges: playerChanges.slice(0, 4),
        systemChanges: systemChanges.slice(0, 4),
        unresolvedConcerns: input.currentStrategy.unresolvedConcerns
    });
}

function validateDecision(
    boundary: StrategicDecisionBoundaryV10R8,
    state: SimulationStateV10R8,
    current: CommittedStrategicVoyageV10R8,
    decision: Extract<StrategicDecisionV10R8, { candidateId: string }>
): string | null {
    if (!boundary.brief.legalCandidates.some(candidate => candidate.candidateId === decision.candidateId)) {
        return 'Provider candidate is not in the current atlas.';
    }
    if (!boundary.brief.strategyVocabulary.targetIds.includes(decision.targetId)) {
        return 'Provider target is not in the current brief.';
    }
    if (!(boundary.brief.strategyVocabulary.milestoneIds as readonly string[]).includes(decision.milestoneId)) {
        return 'Provider milestone is not in the current brief.';
    }
    const ownTurn = Math.min(8, Math.floor(state.turn / 2) + 1);
    if (decision.horizonOwnTurns > Math.max(1, 8 - ownTurn)) {
        return 'Provider horizon exceeds the remaining Loomkeeper turns.';
    }
    if (decision.strategy === 'continue' &&
        (current.targetId !== decision.targetId || current.milestoneId !== decision.milestoneId)) {
        return 'Continue must retain the committed target and milestone.';
    }
    return null;
}

function voyageFromDecision(
    state: SimulationStateV10R8,
    current: CommittedStrategicVoyageV10R8,
    decision: Extract<StrategicDecisionV10R8, { candidateId: string }>,
    candidate: StrategicCandidateSummaryV10R8
): CommittedStrategicVoyageV10R8 {
    const sameMilestone = current.targetId === decision.targetId && current.milestoneId === decision.milestoneId;
    const keepDeadline = sameMilestone && ['continue', 'refine', 'repair'].includes(decision.strategy);
    const ownTurn = Math.min(8, Math.floor(state.turn / 2) + 1);
    const temporaryCost = candidate.immediate.objectiveScoreDelta < 0 ||
        (candidate.immediate.objectiveDistanceDelta ?? 0) < 0 || candidate.immediate.ownStitchingDelta < 0
        ? candidate.risks[0] ?? null
        : keepDeadline ? current.acceptedTemporaryCost : null;
    return CommittedStrategicVoyageV10R8Schema.parse({
        targetId: decision.targetId,
        milestoneId: decision.milestoneId,
        originalDueOwnTurn: keepDeadline && current.originalDueOwnTurn !== null
            ? current.originalDueOwnTurn
            : Math.min(8, ownTurn + decision.horizonOwnTurns),
        acceptedTemporaryCost: temporaryCost,
        invalidationConditions: invalidationConditions(decision.targetId),
        unresolvedConcerns: uniqueBounded([decision.watchFor, ...candidate.uncertainty])
    });
}

function fallbackVoyage(
    state: SimulationStateV10R8,
    current: CommittedStrategicVoyageV10R8,
    candidate: StrategicCandidateSummaryV10R8
): CommittedStrategicVoyageV10R8 {
    if (current.targetId && current.milestoneId && current.originalDueOwnTurn) return current;
    const activeTarget = state.objective.objects.find(object => object.status === 'active')?.id ?? 'player';
    const milestoneId = candidate.families.includes('objective_progress') ? 'approach-objective'
        : candidate.families.includes('terrain') ? 'create-route'
            : candidate.families.includes('survival') ? 'survive-response' : 'pressure-player';
    const ownTurn = Math.min(8, Math.floor(state.turn / 2) + 1);
    return CommittedStrategicVoyageV10R8Schema.parse({
        targetId: activeTarget,
        milestoneId,
        originalDueOwnTurn: Math.min(8, ownTurn + 1),
        acceptedTemporaryCost: null,
        invalidationConditions: invalidationConditions(activeTarget),
        unresolvedConcerns: uniqueBounded(candidate.uncertainty)
    });
}

function invalidationConditions(targetId: string): readonly string[] {
    if (targetId === 'player') return ['player is no longer a live tactical target'];
    if (targetId === 'loomkeeper') return ['loomkeeper is no longer alive'];
    return [`${targetId} is no longer active before the milestone completes`];
}

function uniqueBounded(values: readonly string[]): readonly string[] {
    return [...new Set(values)].slice(0, 4);
}
