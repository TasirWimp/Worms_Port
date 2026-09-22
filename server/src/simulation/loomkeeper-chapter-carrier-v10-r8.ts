import { z } from 'zod';

import { hashCanonicalV10Value } from '../../../shared/simulation-v10';
import {
    hashSimulationStateV10R8, V10_R8_OBJECTIVE_MODES,
    type SimulationStateV10R8
} from '../../../shared/simulation-v10-r8';
import type { ChapterObservationV10R8 } from './loomkeeper-chapter-observation-v10-r8';
import {
    buildChapterStoryBriefV10R8, observedChapterFactsV10R8,
    validateChapterStoryV10R8, ChapterStoryProposalV10R8Schema,
    type ChapterStoryBriefV10R8, type FrozenChapterStoryV10R8
} from './loomkeeper-chapter-story-v10-r8';
import {
    matchChapterIntentionV10R8, validateCandidateFitV10R8,
    type CandidateFitChoiceV10R8, type ChapterMatchComparisonV10R8
} from './loomkeeper-chapter-matcher-v10-r8';
import type { StrategicDecisionBoundaryV10R8 } from './loomkeeper-strategy-v10-r8';

export const V10_R8_CHAPTER_CARRIER_REVISION = 'v10-r8-chapter-carrier-r1' as const;
export const V10_R8_CHAPTER_POLICY_ID = 'nimble-knots-chapter-v1' as const;

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const candidateId = z.string().regex(/^c(?:0[1-9]|1[0-2])$/);
const objectiveStatus = z.enum(['active', 'collected', 'captured', 'lost']);

export const CommittedChapterCarrierV10R8Schema = z.object({
    revision: z.literal(V10_R8_CHAPTER_CARRIER_REVISION),
    policyId: z.literal(V10_R8_CHAPTER_POLICY_ID),
    mode: z.enum(V10_R8_OBJECTIVE_MODES),
    turn: z.number().int().min(1).max(15),
    priorCarrierHash: hash.nullable(),
    observationBasisId: hash,
    observedFactIds: z.array(z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/)).max(32),
    storyBriefHash: hash.nullable(),
    storyHash: hash.nullable(),
    story: ChapterStoryProposalV10R8Schema.nullable(),
    unresolvedCounterevidence: z.array(z.string().trim().min(1).max(160)).max(2),
    atlasBasisId: hash,
    selectedCandidateId: candidateId,
    decisionSource: z.enum(['server_matcher', 'mistral_fit', 'deterministic_fallback']),
    observedStateHash: hash,
    observedResult: z.object({
        terrainRevisionDelta: z.number().int(),
        playerStitchingDelta: z.number().int(),
        loomkeeperStitchingDelta: z.number().int(),
        playerScoreDelta: z.number().int(),
        loomkeeperScoreDelta: z.number().int(),
        changedObjectives: z.array(z.object({
            id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
            from: objectiveStatus,
            to: objectiveStatus,
            resolvedBy: z.enum(['player', 'loomkeeper']).nullable()
        }).strict()).max(7)
    }).strict()
}).strict().superRefine((carrier, context) => {
    if (carrier.turn % 2 !== 1) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['turn'],
            message: 'A Loomkeeper chapter must have an odd turn.' });
    }
    if ((carrier.story === null) !== (carrier.storyHash === null) ||
        (carrier.story === null) !== (carrier.storyBriefHash === null)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['story'],
            message: 'A chapter story and its two hashes must travel together.' });
    }
    if (carrier.story !== null && hashCanonicalV10Value(carrier.story) !== carrier.storyHash) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['storyHash'],
            message: 'The retained chapter story hash is inconsistent.' });
    }
    if (carrier.decisionSource !== 'deterministic_fallback' && carrier.story === null) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['decisionSource'],
            message: 'Story-conditioned matching requires a retained story.' });
    }
});
export type CommittedChapterCarrierV10R8 = z.infer<typeof CommittedChapterCarrierV10R8Schema>;

/** A provider-free post-action carrier. The existing R8 replay policy is unchanged until canary selection. */
export function commitChapterCarrierV10R8(input: Readonly<{
    observation: ChapterObservationV10R8;
    storyBrief: ChapterStoryBriefV10R8;
    frozenStory?: FrozenChapterStoryV10R8;
    comparison?: ChapterMatchComparisonV10R8;
    modelFit?: CandidateFitChoiceV10R8;
    decisionSource: CommittedChapterCarrierV10R8['decisionSource'];
    boundary: StrategicDecisionBoundaryV10R8;
    before: SimulationStateV10R8;
    after: SimulationStateV10R8;
    priorCarrier?: CommittedChapterCarrierV10R8;
}>): CommittedChapterCarrierV10R8 {
    const { observation, storyBrief, frozenStory, comparison, before, after } = input;
    const decisionBrief = input.boundary.brief;
    const fallbackCandidateId = input.boundary.deterministicFallbackCandidate().candidateId;
    const mode = before.objective.objectiveMode;
    const beforeHash = hashSimulationStateV10R8(before);
    if (mode !== after.objective.objectiveMode || mode !== observation.mode ||
        mode !== storyBrief.mode || mode !== decisionBrief.objective.mode ||
        beforeHash !== decisionBrief.stateHash || beforeHash !== storyBrief.stateHash ||
        beforeHash !== observation.basis.afterStateHash ||
        before.turn !== observation.loomkeeperTurn || before.activeActor !== 'loomkeeper' ||
        before.phase !== 'action' || (after.phase === 'finished'
            ? ![before.turn, before.turn + 1].includes(after.turn)
            : after.activeActor !== 'player' || after.turn !== before.turn + 1)) {
        throw new Error('A committed chapter must follow one authoritative Loomkeeper turn in the same match frame.');
    }
    if (input.priorCarrier) {
        const prior = CommittedChapterCarrierV10R8Schema.parse(input.priorCarrier);
        if (prior.mode !== mode || prior.turn !== before.turn - 2 ||
            prior.observedStateHash !== observation.basis.beforeStateHash || observation.opening) {
            throw new Error('The prior chapter carrier does not precede this observation.');
        }
    } else if (!observation.opening || before.turn !== 1) {
        throw new Error('A later chapter requires its committed predecessor.');
    }
    const expectedStoryBrief = buildChapterStoryBriefV10R8({
        decisionBrief, observation,
        priorReading: input.priorCarrier?.story?.playerReading ?? null
    });
    if (hashCanonicalV10Value(expectedStoryBrief) !== hashCanonicalV10Value(storyBrief)) {
        throw new Error('The chapter story brief does not match the replay observation and prior carrier.');
    }
    if (frozenStory && (frozenStory.briefHash !== hashCanonicalV10Value(storyBrief) ||
        frozenStory.proposalHash !== hashCanonicalV10Value(frozenStory.proposal) ||
        hashCanonicalV10Value(validateChapterStoryV10R8(storyBrief, frozenStory.proposal)) !==
            hashCanonicalV10Value(frozenStory))) {
        throw new Error('The frozen story changed before the observed result.');
    }
    if (comparison && (!frozenStory || hashCanonicalV10Value(comparison) !==
        hashCanonicalV10Value(matchChapterIntentionV10R8({
            storyBrief, frozenStory, decisionBrief, fallbackCandidateId
        })))) {
        throw new Error('The chapter matcher does not share the frozen story and atlas.');
    }
    if (input.modelFit && input.decisionSource !== 'mistral_fit') {
        throw new Error('A model fit cannot accompany another decision source.');
    }
    let selectedCandidateId: string;
    if (input.decisionSource === 'server_matcher') {
        if (!comparison) throw new Error('Server matching requires a frozen comparison.');
        selectedCandidateId = comparison.deterministicCandidateId;
    } else if (input.decisionSource === 'mistral_fit') {
        if (!comparison || !input.modelFit) throw new Error('Model fitting requires a validated shortlist choice.');
        selectedCandidateId = validateCandidateFitV10R8(comparison, input.modelFit).candidateId;
    } else {
        selectedCandidateId = fallbackCandidateId;
    }
    if (!decisionBrief.legalCandidates.some(candidate => candidate.candidateId === selectedCandidateId)) {
        throw new Error('A chapter carrier can retain only a current legal turn.');
    }
    const changedObjectives = after.objective.objects.flatMap(object => {
        const previous = before.objective.objects.find(item => item.id === object.id);
        if (!previous) throw new Error('The observed result introduced an unknown objective.');
        return previous.status === object.status ? [] : [{
            id: object.id, from: previous.status, to: object.status, resolvedBy: object.resolvedBy
        }];
    });
    return CommittedChapterCarrierV10R8Schema.parse({
        revision: V10_R8_CHAPTER_CARRIER_REVISION,
        policyId: V10_R8_CHAPTER_POLICY_ID,
        mode, turn: before.turn,
        priorCarrierHash: input.priorCarrier ? hashCanonicalV10Value(input.priorCarrier) : null,
        observationBasisId: storyBrief.basisId,
        observedFactIds: observedChapterFactsV10R8(observation).map(fact => fact.id),
        storyBriefHash: frozenStory?.briefHash ?? null,
        storyHash: frozenStory?.proposalHash ?? null,
        story: frozenStory?.proposal ?? null,
        unresolvedCounterevidence: frozenStory ? [
            ...(frozenStory.proposal.playerReading ? [frozenStory.proposal.playerReading.watchFor] : []),
            frozenStory.proposal.intention.watchFor
        ] : [],
        atlasBasisId: decisionBrief.basisId,
        selectedCandidateId, decisionSource: input.decisionSource,
        observedStateHash: hashSimulationStateV10R8(after),
        observedResult: {
            terrainRevisionDelta: after.terrainRevision - before.terrainRevision,
            playerStitchingDelta: after.units[0].stitching - before.units[0].stitching,
            loomkeeperStitchingDelta: after.units[1].stitching - before.units[1].stitching,
            playerScoreDelta: after.objective.scores.player - before.objective.scores.player,
            loomkeeperScoreDelta: after.objective.scores.loomkeeper - before.objective.scores.loomkeeper,
            changedObjectives
        }
    });
}
