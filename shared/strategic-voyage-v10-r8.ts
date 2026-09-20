import { z } from 'zod';

export const V10_R8_STRATEGY_POLICY_ID = 'nimble-knots-strategy-v1' as const;
export const V10_R8_BRIEF_REVISION = 'v10-r8-strategic-brief-r2' as const;
export const V10_R8_PROMPT_VERSION = 'v10-r8-strategic-prompt-r4' as const;
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

export const StrategicProviderUsageV10R8Schema = z.object({
    inputTokens: z.number().int().min(0).max(1_000_000),
    outputTokens: z.number().int().min(0).max(1_000_000),
    thinkingTokens: z.number().int().min(0).max(1_000_000),
    totalTokens: z.number().int().min(0).max(2_000_000),
    estimatedCostUsdMicros: z.number().int().min(0).max(1_000_000_000)
}).strict().readonly();
export type StrategicProviderUsageV10R8 = z.infer<typeof StrategicProviderUsageV10R8Schema>;

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
    usage: StrategicProviderUsageV10R8Schema.nullable(),
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
        (record.modelId !== null || record.providerDecision !== null || record.usage !== null ||
            record.decisionSource !== 'deterministic_fallback')) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['providerMode'],
            message: 'Deterministic mode cannot claim a provider decision or model.' });
    }
    if (record.providerMode !== 'deterministic' && record.modelId === null) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['modelId'],
            message: 'Provider-backed strategic turns require an exact model identity.' });
    }
    if (record.providerMode === 'local_fake' && record.decisionSource === 'gemini') {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['decisionSource'],
            message: 'A local fake cannot claim a Gemini decision.' });
    }
    if (record.providerMode === 'gemini' && record.decisionSource === 'local_fake') {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['decisionSource'],
            message: 'Gemini mode cannot claim a local-fake decision.' });
    }
    if (record.providerMode === 'gemini_shadow' && record.decisionSource !== 'deterministic_fallback') {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['decisionSource'],
            message: 'Gemini shadow proposals never receive execution authority.' });
    }
    if (record.providerMode === 'local_fake' && record.usage !== null) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['usage'],
            message: 'Local fakes cannot claim external provider usage.' });
    }
    if (record.providerMode !== 'deterministic') {
        const selectedProposal = record.providerDecision?.candidateId !== null &&
            record.providerDecision?.candidateId !== undefined;
        if (record.operationalOutcome === 'selected' && !selectedProposal) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: ['operationalOutcome'],
                message: 'Selected provider outcomes require exactly one retained selected proposal.' });
        }
        if (record.operationalOutcome === 'abstained' && record.providerDecision?.candidateId !== null) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: ['providerDecision'],
                message: 'Abstention requires a retained strict abstention response.' });
        }
        if (!['selected', 'abstained', 'invalid_response'].includes(record.operationalOutcome) &&
            record.providerDecision !== null) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: ['providerDecision'],
                message: 'Unavailable providers cannot retain a response decision.' });
        }
    }
    if (record.usage && record.usage.totalTokens <
        record.usage.inputTokens + record.usage.outputTokens + record.usage.thinkingTokens) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['usage', 'totalTokens'],
            message: 'Provider usage total cannot be smaller than its token components.' });
    }
    const expectedTotalMs = Math.min(60_000,
        record.timingMs.preparation + record.timingMs.provider + record.timingMs.validation);
    if (record.timingMs.total !== expectedTotalMs) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['timingMs', 'total'],
            message: 'Strategic timing total must cover preparation, provider and validation.' });
    }
});
export type StrategicTurnRecordV10R8 = z.infer<typeof StrategicTurnRecordV10R8Schema>;
