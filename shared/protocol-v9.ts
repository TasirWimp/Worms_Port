import { z } from 'zod';
import { ProtocolErrorSchema } from './protocol';
import {
    SimulationBarrierV9Schema, SimulationIntentV9Schema, SimulationStateV9Schema,
    V9_LOOMKEEPER_POLICY_ID, V9_LOOMKEEPER_PROFILE_ID, V9_RULESET_ID
} from './simulation-v9';
import { V9_AUTOMATION_ID } from './combat-version';

/** V9 reuses the frozen bounded replay storage budget without sharing a wire ABI. */
export const V9_REPLAY_LIMITS = Object.freeze({ records: 32_768, bytes: 16 * 1024 * 1024,
    operationBytes: 512, ticks: 16_800, terminalBytes: 512 });
export const V9_INPUT_BYTES = 1024;
/** Candidate-only transport names; they do not alter the ordinary V7 protocol. */
export const protocolEventsV9 = Object.freeze({
    create: 'v9:challenge.create', input: 'v9:input.submit', cancel: 'v9:input.cancel', release: 'v9:input.release',
    pause: 'v9:challenge.pause', leave: 'v9:challenge.leave', snapshot: 'v9:challenge.snapshot', result: 'v9:challenge.result'
});

const integer = (minimum: number, maximum: number) => z.number().int().min(minimum).max(maximum);
const id = z.string().min(16).max(64).regex(/^[A-Za-z0-9_-]+$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const actor = z.enum(['player', 'loomkeeper']);
const calling = z.enum(['wizard', 'thief', 'warrior']);
const phase = z.enum(['action', 'projectile', 'settling', 'retreat', 'finished']);

export const ReplayOperationV9Schema = z.union([
    z.object({ kind: z.literal('intent'), actor, intent: SimulationIntentV9Schema,
        expectedTurn: integer(0, 16), expectedPhase: phase, expectedEpoch: integer(0, 65535) }).strict(),
    z.object({ kind: z.literal('barrier'), barrier: SimulationBarrierV9Schema }).strict(),
    z.object({ kind: z.literal('ticks'), count: integer(1, V9_REPLAY_LIMITS.ticks) }).strict(),
    z.discriminatedUnion('reason', [
        z.object({ kind: z.literal('automatic'), reason: z.literal('lease_expired'),
            tick: integer(0, V9_REPLAY_LIMITS.ticks), inputEpoch: integer(0, 65535) }).strict(),
        z.object({ kind: z.literal('automatic'), reason: z.literal('phase'),
            tick: integer(0, V9_REPLAY_LIMITS.ticks), inputEpoch: integer(0, 65535), phase }).strict()
    ]),
    z.object({ kind: z.literal('safety'),
        reason: z.enum(['replay_limit', 'clock_debt', 'lifecycle_limit', 'sequence_limit', 'expiry', 'left']) }).strict()
]);
export type ReplayOperationV9 = z.infer<typeof ReplayOperationV9Schema>;

export const ReplayRecordV9Schema = z.object({ index: integer(0, V9_REPLAY_LIMITS.records - 1),
    operation: ReplayOperationV9Schema, stateHash: hash }).strict();
export type ReplayRecordV9 = z.infer<typeof ReplayRecordV9Schema>;

/** Strict internal replay ABI. It intentionally contains no transport, reward, or automation envelope. */
export const CoordinatorReplayV9Schema = z.object({
    formatVersion: z.literal(9), challengeId: id, sessionId: id, seed: integer(1, 0xffffffff), calling,
    rulesetId: z.literal(V9_RULESET_ID), loomkeeperPolicyId: z.literal(V9_LOOMKEEPER_POLICY_ID),
    loomkeeperProfileId: z.literal(V9_LOOMKEEPER_PROFILE_ID), initialStateHash: hash,
    records: z.array(ReplayRecordV9Schema).max(V9_REPLAY_LIMITS.records)
}).strict();
export type CoordinatorReplayV9 = z.infer<typeof CoordinatorReplayV9Schema>;

/**
 * Automation is deliberately a separate envelope.  A foundation V9 replay
 * cannot be relabelled as policy evidence by adding or removing fields.
 */
export const LoomkeeperSelectionV9Schema = z.object({
    turn: integer(0, 16),
    prefix: z.enum(['threadguard', 'threadleap', 'none']),
    status: z.enum(['selected', 'no_legal_plan', 'work_failure']),
    ordinal: integer(0, 179).nullable()
}).strict().superRefine((value, context) => {
    if ((value.status === 'selected') !== (value.ordinal !== null)) context.addIssue({
        code: z.ZodIssueCode.custom, message: 'Selected V9 plans require exactly one ordinal.'
    });
    if (value.status !== 'selected' && value.prefix !== 'none') context.addIssue({
        code: z.ZodIssueCode.custom, message: 'Unselected V9 plans cannot spend a utility prefix.'
    });
});
export type LoomkeeperSelectionV9Record = z.infer<typeof LoomkeeperSelectionV9Schema>;
export const CoordinatorReplayV9AutomatedSchema = CoordinatorReplayV9Schema.extend({
    automationId: z.literal(V9_AUTOMATION_ID),
    chosenPlans: z.array(LoomkeeperSelectionV9Schema).max(16)
}).strict();
export type CoordinatorReplayV9Automated = z.infer<typeof CoordinatorReplayV9AutomatedSchema>;

const wireOwnership = { requestId: z.string().min(16).max(64).regex(/^[A-Za-z0-9_-]+$/), challengeId: id,
    rulesetId: z.literal(V9_RULESET_ID), automationId: z.literal(V9_AUTOMATION_ID) };
const wireSequence = integer(0, 0xffffffff);
const rewardEligibilityToken = z.string().length(43).regex(/^[A-Za-z0-9_-]+$/);
export const ChallengeCreateV9Schema = z.discriminatedUnion('mode', [
    z.object({ requestId: wireOwnership.requestId, sequence: wireSequence, mode: z.literal('practice'), calling,
        rulesetId: z.literal(V9_RULESET_ID), automationId: z.literal(V9_AUTOMATION_ID) }).strict(),
    z.object({ requestId: wireOwnership.requestId, sequence: wireSequence, mode: z.literal('reward'), calling,
        challengeId: wireOwnership.challengeId, rulesetId: z.literal(V9_RULESET_ID), automationId: z.literal(V9_AUTOMATION_ID), eligibilityToken: rewardEligibilityToken }).strict()
]);
export const InputRequestV9Schema = z.object({ ...wireOwnership, inputSequence: wireSequence, expectedTurn: integer(0, 16),
    expectedPhase: phase, inputEpoch: integer(0, 65535), intent: SimulationIntentV9Schema }).strict();
export const InputCancelV9Schema = z.object({ ...wireOwnership, expectedTurn: integer(0, 16), inputEpoch: integer(0, 65535) }).strict();
export const InputReleaseV9Schema = InputCancelV9Schema;
export const ChallengePauseV9Schema = z.object({ ...wireOwnership, sequence: wireSequence, paused: z.boolean() }).strict();
export const ChallengeLeaveV9Schema = z.object({ ...wireOwnership, sequence: wireSequence }).strict();
export const ChallengeSnapshotV9Schema = z.object({ protocolVersion: z.literal(9), serverTimeMs: integer(0, Number.MAX_SAFE_INTEGER),
    sessionId: id, challengeId: id, rulesetId: z.literal(V9_RULESET_ID), automationId: z.literal(V9_AUTOMATION_ID),
    loomkeeperPolicyId: z.literal(V9_LOOMKEEPER_POLICY_ID), loomkeeperProfileId: z.literal(V9_LOOMKEEPER_PROFILE_ID),
    mode: z.enum(['practice', 'reward']), calling, status: z.enum(['active', 'left', 'expired', 'completed']), paused: z.boolean(),
    nextSequence: wireSequence, nextInputSequence: wireSequence, expiresAt: z.string().datetime(), simulation: SimulationStateV9Schema, stateHash: hash }).strict();
export type ChallengeSnapshotV9 = z.infer<typeof ChallengeSnapshotV9Schema>;
// Diagnostic metadata only: simulation/replay identities and settlement outcomes stay unchanged.
export const V9StopReasonSchema = z.enum(['replay_limit', 'clock_debt', 'lifecycle_limit', 'sequence_limit', 'expiry', 'left', 'runtime_error']);
export type V9StopReason = z.infer<typeof V9StopReasonSchema>;
export const ChallengeResultV9Schema = z.object({ protocolVersion: z.literal(9), serverTimeMs: integer(0, Number.MAX_SAFE_INTEGER),
    sessionId: id, challengeId: id, rulesetId: z.literal(V9_RULESET_ID), automationId: z.literal(V9_AUTOMATION_ID),
    loomkeeperPolicyId: z.literal(V9_LOOMKEEPER_POLICY_ID), loomkeeperProfileId: z.literal(V9_LOOMKEEPER_PROFILE_ID),
    nextSequence: wireSequence, nextInputSequence: wireSequence, outcome: z.enum(['player_win', 'loomkeeper_win', 'draw', 'left', 'expired']),
    stopReason: V9StopReasonSchema.optional(),
    finalTick: integer(0, V9_REPLAY_LIMITS.ticks), finalStateHash: hash }).strict();
export type ChallengeResultV9 = z.infer<typeof ChallengeResultV9Schema>;
const ackSuccess = z.object({ protocolVersion: z.literal(9), requestId: wireOwnership.requestId, nextSequence: wireSequence,
    nextInputSequence: wireSequence, ok: z.literal(true), data: z.union([ChallengeSnapshotV9Schema, ChallengeResultV9Schema]) }).strict();
const ackFailure = z.object({ protocolVersion: z.literal(9), requestId: wireOwnership.requestId, nextSequence: wireSequence,
    nextInputSequence: wireSequence, ok: z.literal(false), error: ProtocolErrorSchema }).strict();
export const CandidateAckV9Schema = z.union([ackSuccess, ackFailure]);
export type CandidateAckV9 = z.infer<typeof CandidateAckV9Schema>;
export const ChallengeCreateAckV9Schema = z.union([
    ackSuccess.extend({ data: ChallengeSnapshotV9Schema }).strict(), ackFailure
]);
export type ChallengeCreateAckV9 = z.infer<typeof ChallengeCreateAckV9Schema>;

/** Strict V9 state/command schemas, without defining a V9 wire lifecycle. */
export const SimulationSnapshotV9Schema = SimulationStateV9Schema;
export { SimulationStateV9Schema, SimulationIntentV9Schema, SimulationBarrierV9Schema };
export function jsonBytesV9(value: unknown): number {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
