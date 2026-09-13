import { z } from 'zod';
import { ProtocolErrorSchema } from './protocol';
import {
    SimulationBarrierV10Schema, SimulationIntentV10Schema, SimulationStateV10Schema,
    V10_R5_RULESET_ID
} from './simulation-v10';
import { V10_AUTOMATION_ID } from './combat-version';

const V10_LOOMKEEPER_POLICY_ID = 'nimble-knots-loomkeeper-v5';
const V10_LOOMKEEPER_PROFILE_ID = 'standard-v10-0';

/** V10 reuses the frozen bounded replay storage budget without sharing a wire ABI. */

export const V10_INPUT_BYTES = 1024;
/** Dedicated live V10 transport names shared by Practice and Daily. */
export const protocolEventsV10 = Object.freeze({
    create: 'v10:challenge.create', input: 'v10:input.submit', cancel: 'v10:input.cancel', release: 'v10:input.release',
    pause: 'v10:challenge.pause', leave: 'v10:challenge.leave', snapshot: 'v10:challenge.snapshot', result: 'v10:challenge.result'
});

const integer = (minimum: number, maximum: number) => z.number().int().min(minimum).max(maximum);
const id = z.string().min(16).max(64).regex(/^[A-Za-z0-9_-]+$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const actor = z.enum(['player', 'loomkeeper']);
const calling = z.enum(['wizard', 'thief', 'warrior']);
const phase = z.enum(['action', 'projectile', 'settling', 'retreat', 'finished']);

export { V10_REPLAY_LIMITS, jsonBytesV10, ReplayOperationV10Schema, CoordinatorReplayV10Schema } from './protocol-v10';
import { V10_REPLAY_LIMITS, jsonBytesV10, ReplayOperationV10Schema, CoordinatorReplayV10Schema } from './protocol-v10';
export type { CoordinatorReplayV10, ReplayOperationV10 } from './protocol-v10';
/**
 * Automation is deliberately a separate envelope.  A foundation V10 replay
 * cannot be relabelled as policy evidence by adding or removing fields.
 */
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
export const CoordinatorReplayV10AutomatedSchema = CoordinatorReplayV10Schema.safeExtend({
    automationId: z.literal(V10_AUTOMATION_ID),
    chosenPlans: z.array(LoomkeeperSelectionV10Schema).max(16)
}).strict();
export type CoordinatorReplayV10Automated = z.infer<typeof CoordinatorReplayV10AutomatedSchema>;

const wireOwnership = { requestId: z.string().min(16).max(64).regex(/^[A-Za-z0-9_-]+$/), challengeId: id,
    rulesetId: z.literal(V10_R5_RULESET_ID), automationId: z.literal(V10_AUTOMATION_ID) };
const wireSequence = integer(0, 0xffffffff);

const rewardEligibilityToken = z.string().length(43).regex(/^[A-Za-z0-9_-]+$/);
export const ChallengeCreateV10Schema = z.discriminatedUnion('mode', [
    z.object({ requestId: wireOwnership.requestId, sequence: wireSequence, mode: z.literal('practice'), calling,
        rulesetId: z.literal(V10_R5_RULESET_ID), automationId: z.literal(V10_AUTOMATION_ID) }).strict(),
    z.object({ requestId: wireOwnership.requestId, sequence: wireSequence, mode: z.literal('reward'), calling,
        challengeId: wireOwnership.challengeId, rulesetId: z.literal(V10_R5_RULESET_ID),
        automationId: z.literal(V10_AUTOMATION_ID), eligibilityToken: rewardEligibilityToken }).strict()
]);
export const InputRequestV10Schema = z.object({ ...wireOwnership, inputSequence: wireSequence, expectedTurn: integer(0, 16),
    expectedPhase: phase, inputEpoch: integer(0, 65535), intent: SimulationIntentV10Schema }).strict();
export const InputCancelV10Schema = z.object({ ...wireOwnership, expectedTurn: integer(0, 16), inputEpoch: integer(0, 65535) }).strict();
export const InputReleaseV10Schema = InputCancelV10Schema;
export const ChallengePauseV10Schema = z.object({ ...wireOwnership, sequence: wireSequence, paused: z.boolean() }).strict();
export const ChallengeLeaveV10Schema = z.object({ ...wireOwnership, sequence: wireSequence }).strict();
export const ChallengeSnapshotV10Schema = z.object({ protocolVersion: z.literal(10), serverTimeMs: integer(0, Number.MAX_SAFE_INTEGER),
    sessionId: id, challengeId: id, rulesetId: z.literal(V10_R5_RULESET_ID), automationId: z.literal(V10_AUTOMATION_ID),
    loomkeeperPolicyId: z.literal(V10_LOOMKEEPER_POLICY_ID), loomkeeperProfileId: z.literal(V10_LOOMKEEPER_PROFILE_ID),
    mode: z.enum(['practice', 'reward']), calling, status: z.enum(['active', 'left', 'expired', 'completed']), paused: z.boolean(),
    nextSequence: wireSequence, nextInputSequence: wireSequence, expiresAt: z.string().datetime(), simulation: SimulationStateV10Schema.refine(state => state.rulesetId === V10_R5_RULESET_ID), stateHash: hash }).strict();
export type ChallengeSnapshotV10 = z.infer<typeof ChallengeSnapshotV10Schema>;
// Diagnostic metadata only: simulation/replay identities and settlement outcomes stay unchanged.
export const V10StopReasonSchema = z.enum(['replay_limit', 'clock_debt', 'lifecycle_limit', 'sequence_limit', 'expiry', 'left', 'runtime_error']);
export type V10StopReason = z.infer<typeof V10StopReasonSchema>;
export const ChallengeResultV10Schema = z.object({ protocolVersion: z.literal(10), serverTimeMs: integer(0, Number.MAX_SAFE_INTEGER),
    sessionId: id, challengeId: id, rulesetId: z.literal(V10_R5_RULESET_ID), automationId: z.literal(V10_AUTOMATION_ID),
    loomkeeperPolicyId: z.literal(V10_LOOMKEEPER_POLICY_ID), loomkeeperProfileId: z.literal(V10_LOOMKEEPER_PROFILE_ID),
    nextSequence: wireSequence, nextInputSequence: wireSequence, outcome: z.enum(['player_win', 'loomkeeper_win', 'draw', 'left', 'expired']),
    stopReason: V10StopReasonSchema.optional(),
    finalTick: integer(0, V10_REPLAY_LIMITS.ticks), finalStateHash: hash }).strict();
export type ChallengeResultV10 = z.infer<typeof ChallengeResultV10Schema>;
const ackSuccess = z.object({ protocolVersion: z.literal(10), requestId: wireOwnership.requestId, nextSequence: wireSequence,
    nextInputSequence: wireSequence, ok: z.literal(true), data: z.union([ChallengeSnapshotV10Schema, ChallengeResultV10Schema]) }).strict();
const ackFailure = z.object({ protocolVersion: z.literal(10), requestId: wireOwnership.requestId, nextSequence: wireSequence,
    nextInputSequence: wireSequence, ok: z.literal(false), error: ProtocolErrorSchema }).strict();
export const CandidateAckV10Schema = z.union([ackSuccess, ackFailure]);
export type CandidateAckV10 = z.infer<typeof CandidateAckV10Schema>;
export const ChallengeCreateAckV10Schema = z.union([
    ackSuccess.extend({ data: ChallengeSnapshotV10Schema }).strict(), ackFailure
]);
export type ChallengeCreateAckV10 = z.infer<typeof ChallengeCreateAckV10Schema>;

/** State and command schemas shared with the V10 simulation. */
export const SimulationSnapshotV10Schema = SimulationStateV10Schema;
export { SimulationStateV10Schema, SimulationIntentV10Schema, SimulationBarrierV10Schema };
