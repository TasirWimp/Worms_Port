import { z } from 'zod';

import { hashCanonicalV10Value } from './simulation-v10';
import { V10_R8_OBJECTIVE_MODES } from './simulation-v10-r8';

export const V10_R8_CHAPTER_POLICY_ID = 'nimble-knots-chapter-v1' as const;
export const V10_R8_CHAPTER_CARRIER_REVISION = 'v10-r8-chapter-carrier-r1' as const;
export const V10_R8_CHAPTER_PROMPT_VERSION = 'v10-r8-chapter-story-r4' as const;

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const candidateId = z.string().regex(/^c(?:0[1-9]|1[0-2])$/);
const shortText = z.string().trim().min(1).max(160);

export const ChapterStoryProposalV10R8Schema = z.object({
    chapterClosure: z.string().trim().min(1).max(240),
    playerReading: z.object({
        hypothesis: shortText,
        evidenceIds: z.array(z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/)).min(1).max(3),
        alternative: shortText,
        watchFor: shortText
    }).strict().nullable(),
    intention: z.object({
        posture: z.enum([
            'contest_coin', 'deny_coin_route', 'shape_coin_route',
            'approach_chest', 'open_chest_route', 'dislodge_chest',
            'hold_chest', 'deny_chest_route', 'intercept_player',
            'pressure_player', 'survive'
        ]),
        targetId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
        horizonOwnTurns: z.number().int().min(1).max(3),
        reason: shortText,
        watchFor: shortText
    }).strict()
}).strict();
export type ChapterStoryProposalV10R8 = z.infer<typeof ChapterStoryProposalV10R8Schema>;

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
    unresolvedCounterevidence: z.array(shortText).max(2),
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
    if (carrier.turn % 2 !== 1) context.addIssue({ code: z.ZodIssueCode.custom, path: ['turn'],
        message: 'A Loomkeeper chapter must have an odd turn.' });
    if ((carrier.story === null) !== (carrier.storyHash === null) ||
        (carrier.story === null) !== (carrier.storyBriefHash === null)) context.addIssue({
        code: z.ZodIssueCode.custom, path: ['story'],
        message: 'A chapter story and its two hashes must travel together.'
    });
    if (carrier.story !== null && hashCanonicalV10Value(carrier.story) !== carrier.storyHash) context.addIssue({
        code: z.ZodIssueCode.custom, path: ['storyHash'],
        message: 'The retained chapter story hash is inconsistent.'
    });
    if (carrier.decisionSource !== 'deterministic_fallback' && carrier.story === null) context.addIssue({
        code: z.ZodIssueCode.custom, path: ['decisionSource'],
        message: 'Story-conditioned matching requires a retained story.'
    });
});
export type CommittedChapterCarrierV10R8 = z.infer<typeof CommittedChapterCarrierV10R8Schema>;

/** Stored at authorization, then completed only after the selected turn has an observed result. */
export const ChapterTurnEvidenceV10R8Schema = z.object({
    observationBasisId: hash,
    storyRequestHash: hash,
    storyBriefHash: hash.nullable(),
    storyHash: hash.nullable(),
    story: ChapterStoryProposalV10R8Schema.nullable(),
    carrier: CommittedChapterCarrierV10R8Schema.nullable()
}).strict().superRefine((evidence, context) => {
    if ((evidence.story === null) !== (evidence.storyHash === null) ||
        (evidence.story === null) !== (evidence.storyBriefHash === null)) context.addIssue({
        code: z.ZodIssueCode.custom, path: ['story'], message: 'Chapter story hashes must travel together.'
    });
    if (evidence.story && hashCanonicalV10Value(evidence.story) !== evidence.storyHash) context.addIssue({
        code: z.ZodIssueCode.custom, path: ['storyHash'], message: 'Chapter story hash changed.'
    });
});
export type ChapterTurnEvidenceV10R8 = z.infer<typeof ChapterTurnEvidenceV10R8Schema>;
