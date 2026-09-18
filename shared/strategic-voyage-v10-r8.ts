import { z } from 'zod';

export const V10_R8_STRATEGY_POLICY_ID = 'nimble-knots-strategy-v1' as const;
export const V10_R8_BRIEF_REVISION = 'v10-r8-strategic-brief-r1' as const;
export const V10_R8_PROMPT_VERSION = 'v10-r8-strategic-prompt-r1' as const;
export const V10_R8_STRATEGY_MILESTONE_IDS = Object.freeze([
    'approach-objective',
    'create-route',
    'preserve-route',
    'deny-player-route',
    'resolve-objective',
    'pressure-player',
    'survive-response',
    'finish-match'
] as const);
export type StrategicMilestoneIdV10R8 = typeof V10_R8_STRATEGY_MILESTONE_IDS[number];

const boundedText = z.string().trim().min(1).max(160);
const boundedTextList = z.array(boundedText).max(4).readonly();
const optionalId = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/).nullable();
const candidateId = z.string().regex(/^c(?:0[1-9]|1[0-2])$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);

export const CommittedStrategicVoyageV10R8Schema = z.object({
    targetId: optionalId,
    milestoneId: optionalId,
    originalDueOwnTurn: z.number().int().min(1).max(8).nullable(),
    acceptedTemporaryCost: z.string().max(160).nullable(),
    invalidationConditions: boundedTextList,
    unresolvedConcerns: boundedTextList
}).strict().readonly();
export type CommittedStrategicVoyageV10R8 = z.infer<typeof CommittedStrategicVoyageV10R8Schema>;

export const EMPTY_COMMITTED_VOYAGE_V10_R8: CommittedStrategicVoyageV10R8 =
    CommittedStrategicVoyageV10R8Schema.parse({
        targetId: null,
        milestoneId: null,
        originalDueOwnTurn: null,
        acceptedTemporaryCost: null,
        invalidationConditions: [],
        unresolvedConcerns: []
    });

export const RecentStrategicChangesV10R8Schema = z.object({
    previousAction: z.string().max(160).nullable(),
    observedResult: z.string().max(160).nullable(),
    playerChanges: boundedTextList,
    systemChanges: boundedTextList,
    unresolvedConcerns: boundedTextList
}).strict().readonly();
export type RecentStrategicChangesV10R8 = z.infer<typeof RecentStrategicChangesV10R8Schema>;

export const EMPTY_RECENT_CHANGES_V10_R8: RecentStrategicChangesV10R8 =
    RecentStrategicChangesV10R8Schema.parse({
        previousAction: null,
        observedResult: null,
        playerChanges: [],
        systemChanges: [],
        unresolvedConcerns: []
    });

const selectedDecision = z.object({
    candidateId,
    strategy: z.enum(['continue', 'refine', 'repair', 'switch', 'complete']),
    targetId: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
    milestoneId: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
    horizonOwnTurns: z.number().int().min(1).max(8),
    reason: boundedText,
    watchFor: boundedText
}).strict().readonly();
const abstainedDecision = z.object({
    candidateId: z.null(),
    strategy: z.null(),
    targetId: z.null(),
    milestoneId: z.null(),
    horizonOwnTurns: z.null(),
    reason: boundedText,
    watchFor: z.null()
}).strict().readonly();

export const StrategicDecisionV10R8Schema = z.union([selectedDecision, abstainedDecision]);
export type StrategicDecisionV10R8 = z.infer<typeof StrategicDecisionV10R8Schema>;

export const StrategicTurnRecordV10R8Schema = z.object({
    revision: z.literal(V10_R8_BRIEF_REVISION),
    policyId: z.literal(V10_R8_STRATEGY_POLICY_ID),
    promptVersion: z.literal(V10_R8_PROMPT_VERSION),
    providerMode: z.enum(['deterministic', 'local_fake', 'gemini_shadow', 'gemini']),
    modelId: z.string().min(1).max(96).nullable(),
    operationalOutcome: z.enum([
        'selected', 'abstained', 'invalid_response', 'timeout', 'provider_error',
        'circuit_open', 'spend_limit', 'concurrency_limit', 'recovered'
    ]),
    turn: z.number().int().min(0).max(16),
    basisId: hash,
    stateHash: hash,
    briefHash: hash,
    candidateAtlasHash: hash,
    selectedCandidateId: candidateId,
    decisionSource: z.enum(['gemini', 'local_fake', 'deterministic_fallback']),
    providerDecision: StrategicDecisionV10R8Schema.nullable(),
    status: z.enum(['pending', 'executing', 'committed']),
    proposedVoyage: CommittedStrategicVoyageV10R8Schema.nullable(),
    committedVoyage: CommittedStrategicVoyageV10R8Schema.nullable(),
    immediatePredictionHash: hash,
    observedStateHash: hash.nullable(),
    timingMs: z.object({
        preparation: z.number().int().min(0).max(60_000),
        provider: z.number().int().min(0).max(60_000),
        validation: z.number().int().min(0).max(60_000),
        total: z.number().int().min(0).max(60_000)
    }).strict().readonly(),
    responseBytes: z.number().int().min(0).max(1_024).nullable(),
    diagnostic: z.string().max(160).nullable()
}).strict().superRefine((record, context) => {
    const committed = record.status === 'committed';
    if (record.proposedVoyage === null) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['proposedVoyage'],
            message: 'Every authorized strategic turn must carry a proposed voyage.' });
    }
    if ((committed && (record.observedStateHash === null || record.committedVoyage === null)) ||
        (!committed && (record.observedStateHash !== null || record.committedVoyage !== null))) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['status'],
            message: 'Only committed strategic turns carry observed state and committed voyage.' });
    }
    if (committed && JSON.stringify(record.committedVoyage) !== JSON.stringify(record.proposedVoyage)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['committedVoyage'],
            message: 'A committed voyage must be the exact voyage authorized before execution.' });
    }
    if ((record.decisionSource === 'gemini' || record.decisionSource === 'local_fake') &&
        record.providerDecision?.candidateId !== record.selectedCandidateId) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['selectedCandidateId'],
            message: 'A provider-selected capability must match its validated provider decision.' });
    }
    if (record.providerMode === 'deterministic' &&
        (record.modelId !== null || record.providerDecision !== null || record.decisionSource !== 'deterministic_fallback')) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['providerMode'],
            message: 'Deterministic mode cannot claim a provider decision or model.' });
    }
});
export type StrategicTurnRecordV10R8 = z.infer<typeof StrategicTurnRecordV10R8Schema>;
