import { z } from 'zod';
import { ProtocolErrorSchema } from './protocol';
import {
    SimulationBarrierV10Schema, SimulationIntentV10Schema, SimulationStateV10Schema,
    CURRENT_V10_RULESET_ID, V10_R6_RULESET_ID, V10_R7_RULESET_ID
} from './simulation-v10';
import {
    SimulationStateV10R8Schema, V10_R8_OBJECTIVE_MODES, V10_R8_OBJECTIVE_RECIPE_REVISION,
    V10_R8_RULESET_ID
} from './simulation-v10-r8';
import { V10_R7_BATTLEFIELD_RECIPE_REVISION } from './terrain-battlefield-v10-r7';
import {
    V10_AUTOMATION_ID, V10_AUTOMATION_IDS, V10_R6_AUTOMATION_ID, V10_R7_AUTOMATION_ID,
    V10_R8_AUTOMATION_ID
} from './combat-version';
import {
    StrategicTurnRecordV10R8Schema,
    V10_R8_STRATEGY_POLICY_ID
} from './strategic-voyage-v10-r8';
import {
    CoordinatorReplayV10Schema, ReplayOperationV10Schema, ReplayRecordV10Schema,
    V10_REPLAY_LIMITS, jsonBytesV10
} from './protocol-v10';

const V10_LOOMKEEPER_POLICY_ID = 'nimble-knots-loomkeeper-v5';
const V10_LOOMKEEPER_PROFILE_ID = 'standard-v10-0';

export const V10_INPUT_BYTES = 1024;
/** Dedicated live V10 transport names shared by Practice and Daily. */
export const protocolEventsV10 = Object.freeze({
    create: 'v10:challenge.create', input: 'v10:input.submit', cancel: 'v10:input.cancel', release: 'v10:input.release',
    pause: 'v10:challenge.pause', leave: 'v10:challenge.leave', snapshot: 'v10:challenge.snapshot', result: 'v10:challenge.result'
});

const integer = (minimum: number, maximum: number) => z.number().int().min(minimum).max(maximum);
const id = z.string().min(16).max(64).regex(/^[A-Za-z0-9_-]+$/);
const requestId = z.string().min(16).max(64).regex(/^[A-Za-z0-9_-]+$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const calling = z.enum(['wizard', 'thief', 'warrior']);
const phase = z.enum(['action', 'projectile', 'settling', 'retreat', 'finished']);
const wireSequence = integer(0, 0xffffffff);
const r7Ownership = { rulesetId: z.literal(CURRENT_V10_RULESET_ID), automationId: z.literal(V10_AUTOMATION_ID) };
const r8Ownership = { rulesetId: z.literal(V10_R8_RULESET_ID), automationId: z.literal(V10_R8_AUTOMATION_ID) };

export { V10_REPLAY_LIMITS, jsonBytesV10, ReplayOperationV10Schema, CoordinatorReplayV10Schema } from './protocol-v10';
export type { CoordinatorReplayV10, ReplayOperationV10 } from './protocol-v10';

export const LoomkeeperSelectionV10Schema = z.object({
    turn: integer(0, 16),
    prefix: z.enum(['threadguard', 'threadleap', 'none']),
    status: z.enum(['selected', 'no_legal_plan', 'work_failure']),
    ordinal: integer(0, 179).nullable()
}).strict().superRefine((value, context) => {
    if ((value.status === 'selected') !== (value.ordinal !== null)) context.addIssue({
        code: z.ZodIssueCode.custom, message: 'Selected V10 plans require exactly one ordinal.'
    });
    if (value.status !== 'selected' && value.prefix !== 'none') context.addIssue({
        code: z.ZodIssueCode.custom, message: 'Unselected V10 plans cannot spend a utility prefix.'
    });
});
export type LoomkeeperSelectionV10Record = z.infer<typeof LoomkeeperSelectionV10Schema>;

const CoordinatorReplayV10R7AutomatedSchema = CoordinatorReplayV10Schema.safeExtend({
    automationId: z.enum(V10_AUTOMATION_IDS),
    chosenPlans: z.array(LoomkeeperSelectionV10Schema).max(16)
}).strict().superRefine((replay, context) => {
    const identityMatches = replay.rulesetId === V10_R6_RULESET_ID
        ? replay.automationId === V10_R6_AUTOMATION_ID
        : replay.rulesetId === V10_R7_RULESET_ID && replay.automationId === V10_R7_AUTOMATION_ID;
    if (!identityMatches) context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['automationId'],
        message: 'Automation provenance does not belong to the recorded live V10 ruleset.'
    });
});

export const CoordinatorReplayV10R8Schema = z.object({
    formatVersion: z.literal(10), challengeId: id, sessionId: id,
    seed: integer(1, 0xffffffff), calling, rulesetId: z.literal(V10_R8_RULESET_ID),
    terrainProfileId: z.literal('volcanic-ruin'),
    recipeRevision: z.literal(V10_R7_BATTLEFIELD_RECIPE_REVISION), candidateIndex: z.literal(0),
    objectiveMode: z.enum(V10_R8_OBJECTIVE_MODES),
    objectiveRecipeRevision: z.literal(V10_R8_OBJECTIVE_RECIPE_REVISION),
    strategyPolicyId: z.literal(V10_R8_STRATEGY_POLICY_ID),
    automationId: z.literal(V10_R8_AUTOMATION_ID), initialStateHash: hash,
    records: z.array(ReplayRecordV10Schema).max(V10_REPLAY_LIMITS.records),
    chosenPlans: z.array(LoomkeeperSelectionV10Schema).max(16),
    strategicTurns: z.array(StrategicTurnRecordV10R8Schema).max(8)
}).strict();

export const CoordinatorReplayV10AutomatedSchema = z.union([
    CoordinatorReplayV10R7AutomatedSchema,
    CoordinatorReplayV10R8Schema
]);
export type CoordinatorReplayV10Automated = z.infer<typeof CoordinatorReplayV10AutomatedSchema>;
export type CoordinatorReplayV10R8 = z.infer<typeof CoordinatorReplayV10R8Schema>;

const rewardEligibilityToken = z.string().length(43).regex(/^[A-Za-z0-9_-]+$/);
export const ChallengeCreateV10Schema = z.union([
    z.object({ requestId, sequence: wireSequence, mode: z.literal('practice'), calling, ...r7Ownership }).strict(),
    z.object({ requestId, sequence: wireSequence, mode: z.literal('practice'), calling, ...r8Ownership,
        objectiveMode: z.enum(V10_R8_OBJECTIVE_MODES),
        objectiveRecipeRevision: z.literal(V10_R8_OBJECTIVE_RECIPE_REVISION) }).strict(),
    z.object({ requestId, sequence: wireSequence, mode: z.literal('reward'), calling,
        challengeId: id, ...r7Ownership, eligibilityToken: rewardEligibilityToken }).strict()
]);

const InputRequestR7Schema = z.object({ requestId, challengeId: id, ...r7Ownership,
    inputSequence: wireSequence, expectedTurn: integer(0, 16), expectedPhase: phase,
    inputEpoch: integer(0, 65535), intent: SimulationIntentV10Schema }).strict();
const InputRequestR8Schema = z.object({ requestId, challengeId: id, ...r8Ownership,
    inputSequence: wireSequence, expectedTurn: integer(0, 16), expectedPhase: phase,
    inputEpoch: integer(0, 65535), intent: SimulationIntentV10Schema }).strict();
export const InputRequestV10Schema = z.union([InputRequestR7Schema, InputRequestR8Schema]);

const InputCancelR7Schema = z.object({ requestId, challengeId: id, ...r7Ownership,
    expectedTurn: integer(0, 16), inputEpoch: integer(0, 65535) }).strict();
const InputCancelR8Schema = z.object({ requestId, challengeId: id, ...r8Ownership,
    expectedTurn: integer(0, 16), inputEpoch: integer(0, 65535) }).strict();
export const InputCancelV10Schema = z.union([InputCancelR7Schema, InputCancelR8Schema]);
export const InputReleaseV10Schema = InputCancelV10Schema;

const lifecycleR7 = z.object({ requestId, challengeId: id, ...r7Ownership,
    sequence: wireSequence, paused: z.boolean() }).strict();
const lifecycleR8 = z.object({ requestId, challengeId: id, ...r8Ownership,
    sequence: wireSequence, paused: z.boolean() }).strict();
export const ChallengePauseV10Schema = z.union([lifecycleR7, lifecycleR8]);
export const ChallengeLeaveV10Schema = z.union([
    lifecycleR7.omit({ paused: true }), lifecycleR8.omit({ paused: true })
]);

const snapshotCommon = {
    protocolVersion: z.literal(10), serverTimeMs: integer(0, Number.MAX_SAFE_INTEGER),
    sessionId: id, challengeId: id,
    loomkeeperPolicyId: z.literal(V10_LOOMKEEPER_POLICY_ID),
    loomkeeperProfileId: z.literal(V10_LOOMKEEPER_PROFILE_ID), calling,
    status: z.enum(['active', 'left', 'expired', 'completed']), paused: z.boolean(),
    nextSequence: wireSequence, nextInputSequence: wireSequence, expiresAt: z.string().datetime(), stateHash: hash
};
const ChallengeSnapshotV10R7Schema = z.object({ ...snapshotCommon, ...r7Ownership,
    mode: z.enum(['practice', 'reward']),
    simulation: SimulationStateV10Schema.refine(state => state.rulesetId === CURRENT_V10_RULESET_ID)
}).strict();
export const ChallengeSnapshotV10R8Schema = z.object({ ...snapshotCommon, ...r8Ownership,
    mode: z.literal('practice'), objectiveMode: z.enum(V10_R8_OBJECTIVE_MODES),
    objectiveRecipeRevision: z.literal(V10_R8_OBJECTIVE_RECIPE_REVISION),
    simulation: SimulationStateV10R8Schema
}).strict().superRefine((snapshot, context) => {
    if (snapshot.simulation.objective.objectiveMode !== snapshot.objectiveMode ||
        snapshot.simulation.objective.recipeRevision !== snapshot.objectiveRecipeRevision) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['objectiveMode'],
            message: 'R8 snapshot objective identity does not match its state.' });
    }
});
export const ChallengeSnapshotV10Schema = z.union([ChallengeSnapshotV10R7Schema, ChallengeSnapshotV10R8Schema]);
export type ChallengeSnapshotV10 = z.infer<typeof ChallengeSnapshotV10Schema>;

export const V10StopReasonSchema = z.enum(['replay_limit', 'clock_debt', 'lifecycle_limit', 'sequence_limit', 'expiry', 'left', 'runtime_error']);
export type V10StopReason = z.infer<typeof V10StopReasonSchema>;
const resultCommon = {
    protocolVersion: z.literal(10), serverTimeMs: integer(0, Number.MAX_SAFE_INTEGER),
    sessionId: id, challengeId: id,
    loomkeeperPolicyId: z.literal(V10_LOOMKEEPER_POLICY_ID),
    loomkeeperProfileId: z.literal(V10_LOOMKEEPER_PROFILE_ID),
    nextSequence: wireSequence, nextInputSequence: wireSequence,
    outcome: z.enum(['player_win', 'loomkeeper_win', 'draw', 'left', 'expired']),
    stopReason: V10StopReasonSchema.optional(), finalTick: integer(0, V10_REPLAY_LIMITS.ticks), finalStateHash: hash
};
const ChallengeResultV10R7Schema = z.object({ ...resultCommon, ...r7Ownership }).strict();
export const ChallengeResultV10R8Schema = z.object({ ...resultCommon, ...r8Ownership,
    objectiveMode: z.enum(V10_R8_OBJECTIVE_MODES),
    objectiveRecipeRevision: z.literal(V10_R8_OBJECTIVE_RECIPE_REVISION),
    objectiveResultReason: z.enum(['elimination', 'chest_captured', 'chest_lost', 'coin_lead',
        'coins_resolved', 'turn_limit', 'simulation_limit', 'simultaneous', 'left', 'expired'])
}).strict();
export const ChallengeResultV10Schema = z.union([ChallengeResultV10R7Schema, ChallengeResultV10R8Schema]);
export type ChallengeResultV10 = z.infer<typeof ChallengeResultV10Schema>;

const ackFailure = z.object({ protocolVersion: z.literal(10), requestId, nextSequence: wireSequence,
    nextInputSequence: wireSequence, ok: z.literal(false), error: ProtocolErrorSchema }).strict();
const ackSuccess = z.object({ protocolVersion: z.literal(10), requestId, nextSequence: wireSequence,
    nextInputSequence: wireSequence, ok: z.literal(true),
    data: z.union([ChallengeSnapshotV10Schema, ChallengeResultV10Schema]) }).strict();
export const CandidateAckV10Schema = z.union([ackSuccess, ackFailure]);
export type CandidateAckV10 = z.infer<typeof CandidateAckV10Schema>;
export const ChallengeCreateAckV10Schema = z.union([
    z.object({ protocolVersion: z.literal(10), requestId, nextSequence: wireSequence,
        nextInputSequence: wireSequence, ok: z.literal(true), data: ChallengeSnapshotV10Schema }).strict(),
    ackFailure
]);
export type ChallengeCreateAckV10 = z.infer<typeof ChallengeCreateAckV10Schema>;

export const SimulationSnapshotV10Schema = z.union([SimulationStateV10Schema, SimulationStateV10R8Schema]);
export { SimulationStateV10Schema, SimulationIntentV10Schema, SimulationBarrierV10Schema };
