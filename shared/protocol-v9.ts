import { z } from 'zod';
import {
    SimulationBarrierV9Schema, SimulationIntentV9Schema, SimulationStateV9Schema,
    V9_LOOMKEEPER_POLICY_ID, V9_LOOMKEEPER_PROFILE_ID, V9_RULESET_ID
} from './simulation-v9';

/** V9 reuses the frozen bounded replay storage budget without sharing a wire ABI. */
export const V9_REPLAY_LIMITS = Object.freeze({ records: 32_768, bytes: 16 * 1024 * 1024,
    operationBytes: 512, ticks: 16_800, terminalBytes: 512 });

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

/** Strict V9 state/command schemas, without defining a V9 wire lifecycle. */
export const SimulationSnapshotV9Schema = SimulationStateV9Schema;
export { SimulationStateV9Schema, SimulationIntentV9Schema, SimulationBarrierV9Schema };
export function jsonBytesV9(value: unknown): number {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
}
