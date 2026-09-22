import { z } from 'zod';

import { hashCanonicalV10Value } from '../../../shared/simulation-v10';
import type { StrategicCandidateSummaryV10R8, StrategicDecisionBriefV10R8 } from './loomkeeper-strategy-v10-r8';
import type { ChapterStoryBriefV10R8, FrozenChapterStoryV10R8 } from './loomkeeper-chapter-story-v10-r8';

export const V10_R8_CHAPTER_MATCH_REVISION = 'v10-r8-chapter-match-r1' as const;
const CandidateChoiceSchema = z.object({
    candidateId: z.string().regex(/^c(?:0[1-9]|1[0-2])$/),
    reason: z.string().trim().min(1).max(160),
    watchFor: z.string().trim().min(1).max(160)
}).strict();
export type CandidateFitChoiceV10R8 = z.infer<typeof CandidateChoiceSchema>;

export type RankedChapterCandidateV10R8 = Readonly<{
    candidateId: string;
    score: number;
    evidence: 'computed_turn' | 'position_proxy';
}>;
export type ChapterMatchComparisonV10R8 = Readonly<{
    revision: typeof V10_R8_CHAPTER_MATCH_REVISION;
    storyHash: string;
    atlasBasisId: string;
    deterministicCandidateId: string;
    shortlist: readonly string[];
    ranked: readonly RankedChapterCandidateV10R8[];
}>;

/** Scores exact completed-turn facts and marks geometric route proxies explicitly. Shadow-only. */
export function matchChapterIntentionV10R8(input: Readonly<{
    storyBrief: ChapterStoryBriefV10R8;
    frozenStory: FrozenChapterStoryV10R8;
    decisionBrief: StrategicDecisionBriefV10R8;
    fallbackCandidateId: string;
}>): ChapterMatchComparisonV10R8 {
    const { storyBrief, frozenStory, decisionBrief } = input;
    if (hashCanonicalV10Value(storyBrief) !== frozenStory.briefHash ||
        storyBrief.stateHash !== decisionBrief.stateHash || storyBrief.mode !== decisionBrief.objective.mode ||
        !decisionBrief.legalCandidates.some(candidate => candidate.candidateId === input.fallbackCandidateId)) {
        throw new Error('Chapter story, legal atlas and private fallback must share one current basis.');
    }
    const ranked = decisionBrief.legalCandidates.map(candidate => Object.freeze({
        candidateId: candidate.candidateId,
        score: candidateScore(candidate, decisionBrief, frozenStory.proposal.intention),
        evidence: routeProxy(frozenStory.proposal.intention.posture) ? 'position_proxy' as const : 'computed_turn' as const
    })).sort((left, right) => right.score - left.score ||
        (left.candidateId === input.fallbackCandidateId ? -1 : right.candidateId === input.fallbackCandidateId ? 1 :
            hashCanonicalV10Value({ basis: decisionBrief.basisId, id: left.candidateId }).localeCompare(
                hashCanonicalV10Value({ basis: decisionBrief.basisId, id: right.candidateId }))));
    if (!ranked.length) throw new Error('Chapter matching requires a legal candidate atlas.');
    const shortlist = [ranked[0].candidateId];
    if (!shortlist.includes(input.fallbackCandidateId)) shortlist.push(input.fallbackCandidateId);
    for (const item of ranked) {
        if (shortlist.length >= 3) break;
        if (!shortlist.includes(item.candidateId)) shortlist.push(item.candidateId);
    }
    shortlist.sort((left, right) => hashCanonicalV10Value({ basis: decisionBrief.basisId, id: left }).localeCompare(
        hashCanonicalV10Value({ basis: decisionBrief.basisId, id: right })));
    return Object.freeze({
        revision: V10_R8_CHAPTER_MATCH_REVISION,
        storyHash: frozenStory.proposalHash,
        atlasBasisId: decisionBrief.basisId,
        deterministicCandidateId: ranked[0].candidateId,
        shortlist: Object.freeze(shortlist),
        ranked: Object.freeze(ranked)
    });
}

export function validateCandidateFitV10R8(
    comparison: ChapterMatchComparisonV10R8,
    raw: unknown
): CandidateFitChoiceV10R8 {
    const choice = CandidateChoiceSchema.parse(raw);
    if (!comparison.shortlist.includes(choice.candidateId)) throw new Error('Candidate fit is not in the frozen shortlist.');
    return choice;
}

/** The model receives only these neutral cards after the chapter intention is frozen. */
export function candidateFitCardsV10R8(
    comparison: ChapterMatchComparisonV10R8,
    decisionBrief: StrategicDecisionBriefV10R8
): readonly Readonly<Pick<StrategicCandidateSummaryV10R8,
    'candidateId' | 'families' | 'action' | 'immediate' | 'opportunities' | 'risks' | 'uncertainty'> & {
        after: Readonly<{
            actors: StrategicCandidateSummaryV10R8['worldDelta']['actorsAfter'];
            objects: StrategicCandidateSummaryV10R8['worldDelta']['objectsAfter'];
        }>;
    }>[] {
    if (comparison.atlasBasisId !== decisionBrief.basisId) throw new Error('The candidate fit atlas changed.');
    return Object.freeze(comparison.shortlist.map(candidateId => {
        const candidate = decisionBrief.legalCandidates.find(item => item.candidateId === candidateId);
        if (!candidate) throw new Error('A frozen shortlist candidate is unavailable.');
        return Object.freeze({
            candidateId: candidate.candidateId,
            families: candidate.families,
            action: candidate.action,
            immediate: candidate.immediate,
            opportunities: candidate.opportunities,
            risks: candidate.risks,
            uncertainty: candidate.uncertainty,
            after: Object.freeze({
                actors: Object.freeze(decisionBrief.battlefield.actors.map(actor =>
                    candidate.worldDelta.actorsAfter.find(changed => changed.id === actor.id) ?? actor)),
                objects: Object.freeze(decisionBrief.battlefield.objects.map(object =>
                    candidate.worldDelta.objectsAfter.find(changed => changed.id === object.id) ?? object))
            })
        });
    }));
}

function candidateScore(
    candidate: StrategicCandidateSummaryV10R8,
    brief: StrategicDecisionBriefV10R8,
    intention: FrozenChapterStoryV10R8['proposal']['intention']
): number {
    const immediate = candidate.immediate;
    if (immediate.terminalWinner === 'loomkeeper') return 100_000;
    if (immediate.terminalWinner === 'player') return -100_000;
    const safety = 12 * immediate.ownStitchingDelta;
    const pressure = -8 * immediate.opponentStitchingDelta;
    const target = brief.battlefield.objects.find(object => object.id === intention.targetId);
    const targetAfter = candidate.worldDelta.objectsAfter.find(object => object.id === intention.targetId) ?? target;
    const ownBefore = brief.battlefield.actors.find(actor => actor.id === 'loomkeeper')!;
    const ownAfter = candidate.worldDelta.actorsAfter.find(actor => actor.id === 'loomkeeper') ?? ownBefore;
    const playerBefore = brief.battlefield.actors.find(actor => actor.id === 'player')!;
    const playerAfter = candidate.worldDelta.actorsAfter.find(actor => actor.id === 'player') ?? playerBefore;
    const approach = target && targetAfter ? distance(ownBefore, target) - distance(ownAfter, targetAfter) : 0;
    const playerDelay = target && targetAfter ? distance(playerAfter, targetAfter) - distance(playerBefore, target) : 0;
    switch (intention.posture) {
    case 'contest_coin':
        return 500 * immediate.objectiveScoreDelta + 2 * approach + safety + pressure;
    case 'deny_coin_route':
        return 2 * playerDelay + safety + pressure;
    case 'shape_coin_route':
        return Math.min(30, immediate.terrainCellsRemoved) + 2 * approach + safety + pressure;
    case 'approach_chest':
        return 2 * approach + safety + pressure;
    case 'open_chest_route':
        return Math.min(30, immediate.terrainCellsRemoved) + 2 * approach + safety + pressure;
    case 'dislodge_chest':
        return (targetAfter?.status === 'lost' || targetAfter?.status === 'captured' ? 500 : 0) +
            Math.min(30, immediate.terrainCellsRemoved) + approach + safety;
    case 'hold_chest':
        return (targetAfter?.status === 'active' ? 50 : -500) + 2 * playerDelay + safety + pressure;
    case 'deny_chest_route':
        return 2 * playerDelay + Math.min(20, immediate.terrainCellsRemoved) + safety + pressure;
    case 'intercept_player':
        return pressure + distance(playerBefore, ownBefore) - distance(playerAfter, ownAfter) + safety;
    case 'pressure_player':
        return 2 * pressure + safety;
    case 'survive':
        return 3 * safety + pressure;
    }
}

function routeProxy(posture: FrozenChapterStoryV10R8['proposal']['intention']['posture']): boolean {
    return ['deny_coin_route', 'shape_coin_route', 'open_chest_route', 'deny_chest_route'].includes(posture);
}

function distance(a: Readonly<{ x: number; y: number }>, b: Readonly<{ x: number; y: number }>): number {
    return Math.round(Math.hypot(a.x - b.x, a.y - b.y));
}
