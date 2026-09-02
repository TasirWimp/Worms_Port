import { z } from 'zod';
import { RequestIdSchema, ProtocolErrorSchema } from './protocol';
import { V8_RULESET_ID, assertSimulationInvariantsV8, type SimulationStateV8 } from './simulation-v8';
import { V8_LOOMKEEPER_POLICY_ID, V8_LOOMKEEPER_PROFILE_ID } from './combat-version';

export const V8_REPLAY_LIMITS = Object.freeze({ records: 32_768, bytes: 16 * 1024 * 1024,
    operationBytes: 512, ticks: 16_800, terminalBytes: 512 });
export const V8_INPUT_BYTES = 1024;
export const protocolEventsV8 = Object.freeze({ input: 'v8:input.submit', cancel: 'v8:input.cancel',
    pause: 'v8:challenge.pause', leave: 'v8:challenge.leave',
    snapshot: 'v8:challenge.snapshot', result: 'v8:challenge.result' });
const integer = (minimum: number, maximum: number) => z.number().int().min(minimum).max(maximum);
const uint32 = integer(0, 0xFFFFFFFF);
const counter = integer(0, 65535);
const tick = integer(0, V8_REPLAY_LIMITS.ticks);
const id = z.string().min(16).max(64).regex(/^[A-Za-z0-9_-]+$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const actor = z.enum(['player', 'loomkeeper']);
const calling = z.enum(['wizard', 'thief', 'warrior']);
const direction = z.union([z.literal(-1), z.literal(1)]);
const relic = z.enum(['threadball', 'needlepoint', 'spoolburst']);
export const SimulationPhaseV8Schema = z.enum(['action', 'projectile', 'settling', 'retreat', 'finished']);
const aim = z.object({ angleMilliDegrees: integer(-90_000, 90_000), powerPermille: integer(0, 1000) }).strict();

export const SimulationIntentV8Schema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('walk_start'), direction }).strict(),
    z.object({ type: z.literal('walk_refresh') }).strict(),
    z.object({ type: z.literal('face'), direction }).strict(),
    z.object({ type: z.literal('jump') }).strict(),
    z.object({ type: z.literal('select_relic'), relicId: relic }).strict(),
    aim.extend({ type: z.literal('aim') }).strict(),
    z.object({ type: z.literal('fire'), aimId: counter }).strict()
]);
const ownership = { requestId: RequestIdSchema, challengeId: id, rulesetId: z.literal(V8_RULESET_ID),
    expectedTurn: integer(0, 16), inputEpoch: counter };
export const InputRequestV8Schema = z.object({ ...ownership, inputSequence: uint32,
    expectedPhase: SimulationPhaseV8Schema, intent: SimulationIntentV8Schema }).strict();
export const InputCancelV8Schema = z.object(ownership).strict();
export const ChallengeLeaveV8Schema = z.object({ requestId:RequestIdSchema,challengeId:id,
    rulesetId:z.literal(V8_RULESET_ID),sequence:uint32 }).strict();
export const ChallengePauseV8Schema = ChallengeLeaveV8Schema.extend({ paused:z.boolean() }).strict();
export type InputRequestV8 = z.infer<typeof InputRequestV8Schema>;
export type InputCancelV8 = z.infer<typeof InputCancelV8Schema>;

export const SimulationBarrierV8Schema = z.object({
    reason: z.enum(['cancel', 'disconnect', 'reconnect', 'pause', 'resume', 'intent_limit']),
    actor, expectedTurn: integer(0, 16), expectedEpoch: counter
}).strict();
const point = z.object({ x: integer(-4096, 4096), y: integer(-4096, 4096) }).strict();
const projectileSummary = z.object({ relicId: relic, startX: integer(-4096,4096), startY: integer(-4096,4096),
    endX: integer(-4096,4096), endY: integer(-4096,4096), flightTicks: integer(0,300),
    impact: z.enum(['terrain','player','loomkeeper','world_exit','lifetime']), trace: z.array(point).min(2).max(41) }).strict();
const unit = z.object({ id: actor, calling: z.enum(['wizard','thief','warrior','loomkeeper']),
    xFp: integer(12*256,2036*256), yFp: integer(12*256,596*256),
    vxFp: integer(-2048,2048), vyFp: integer(-2048,2048), facing: direction,
    stitching: integer(0,100), alive: z.boolean(), grounded: z.boolean(),
    support: z.union([integer(0,256*72-1),actor]).nullable(), airTicks: integer(0,120),
    airDrive: z.enum(['jump','walk_fall']).nullable() }).strict();
// This is an independent V8 validator; no legacy schema accepts these fields.
export const SimulationSnapshotV8Schema = z.object({
    formatVersion: z.literal(8), rulesetId: z.literal(V8_RULESET_ID), rulesetVersion: z.literal(8),
    seed: uint32, rngState: uint32, tick, revision: counter, turn: integer(0,16), activeActor: actor,
    phase: SimulationPhaseV8Schema, phaseStartedTick: tick, phaseDeadlineTick: integer(0,17_250),
    settleReason: z.enum(['post_shot','action_timeout','retreat_timeout','death']).nullable(),
    winner: z.enum(['player','loomkeeper','draw']).nullable(),
    finishReason: z.enum(['unravelled','turn_limit','simulation_limit']).nullable(), castUsed: z.boolean(),
    inputEpoch: counter, heldDirection: z.union([direction,z.literal(0)]), leaseExpiresTick: integer(0,16_809).nullable(),
    lastLeaseRefreshTick: integer(0,16_800).nullable(), acceptedIntentCount: integer(0,512),
    lifecycleBarrierCount: integer(0,128), aimId: counter, aim: aim.nullable(), selectedRelic: relic,
    units: z.tuple([unit,unit]), terrain: z.object({ width: z.literal(256), height: z.literal(72),
        cellSize: z.literal(8), words: z.array(uint32).length(576) }).strict(),
    lastProjectile: projectileSummary.nullable(),
    projectile: z.object({ actor, relicId: relic, xFp: integer(-4096*256,4096*256),
        yFp: integer(-4096*256,4096*256), vxFp: integer(-8192,8192), vyFp: integer(-32768,32768),
        startX: integer(-4096,4096), startY: integer(-4096,4096), flightTicks: integer(0,300),
        trace: z.array(point).max(41) }).strict().nullable()
}).strict().superRefine((state, context) => {
    if (state.units[0].id !== 'player' || state.units[1].id !== 'loomkeeper')
        context.addIssue({ code: 'custom', message: 'The actor tuple must be player, loomkeeper.' });
    if (state.phase === 'finished' ? state.winner === null || state.finishReason === null
        : state.winner !== null || state.finishReason !== null)
        context.addIssue({ code: 'custom', message: 'Terminal facts must agree with the phase.' });
    if ((state.phase === 'projectile') !== (state.projectile !== null))
        context.addIssue({ code: 'custom', message: 'Projectile phase and payload must agree.' });
    try { assertSimulationInvariantsV8(state as SimulationStateV8); }
    catch { context.addIssue({ code: 'custom', message: 'Invalid V8 combat invariants.' }); }
});

export const ReplayOperationV8Schema = z.union([
    z.object({ kind: z.literal('intent'), actor, intent: SimulationIntentV8Schema,
        expectedTurn: integer(0,16), expectedPhase: SimulationPhaseV8Schema, expectedEpoch: counter }).strict(),
    z.object({ kind: z.literal('barrier'), barrier: SimulationBarrierV8Schema }).strict(),
    z.object({ kind: z.literal('ticks'), count: integer(1,V8_REPLAY_LIMITS.ticks) }).strict(),
    z.discriminatedUnion('reason',[
        z.object({ kind:z.literal('automatic'),reason:z.literal('lease_expired'),tick,inputEpoch:counter }).strict(),
        z.object({ kind:z.literal('automatic'),reason:z.literal('phase'),tick,inputEpoch:counter,phase:SimulationPhaseV8Schema }).strict()
    ]),
    z.object({ kind: z.literal('safety'), reason: z.enum(['replay_limit','clock_debt','lifecycle_limit','sequence_limit','expiry','left']) }).strict()
]);
export const ReplayRecordV8Schema = z.object({ index: integer(0,V8_REPLAY_LIMITS.records-1),
    operation: ReplayOperationV8Schema, stateHash: hash }).strict();
export const CoordinatorReplayV8Schema = z.object({ formatVersion: z.literal(8),
    challengeId: id, sessionId: id, seed: uint32, calling, rulesetId: z.literal(V8_RULESET_ID),
    loomkeeperPolicyId: z.literal(V8_LOOMKEEPER_POLICY_ID), loomkeeperProfileId: z.literal(V8_LOOMKEEPER_PROFILE_ID),
    initialStateHash: hash, records: z.array(ReplayRecordV8Schema).max(V8_REPLAY_LIMITS.records) }).strict();
export type CoordinatorReplayV8 = z.infer<typeof CoordinatorReplayV8Schema>;
export type ReplayOperationV8 = z.infer<typeof ReplayOperationV8Schema>;

const snapshotMetadata = { protocolVersion: z.literal(8), serverTimeMs: integer(0,Number.MAX_SAFE_INTEGER),
    sessionId: id, challengeId: id, rulesetId: z.literal(V8_RULESET_ID),
    loomkeeperPolicyId: z.literal(V8_LOOMKEEPER_POLICY_ID), loomkeeperProfileId: z.literal(V8_LOOMKEEPER_PROFILE_ID),
    nextInputSequence: uint32 };
export const ChallengeSnapshotV8Schema = z.object({ ...snapshotMetadata,
    mode: z.enum(['practice','reward']), calling, status: z.enum(['active','left','expired','completed']),
    paused: z.boolean(), nextSequence: uint32, expiresAt: z.string().datetime(),
    simulation: SimulationSnapshotV8Schema, stateHash: hash }).strict();
export const ChallengeResultV8Schema = z.object({ ...snapshotMetadata,
    outcome: z.enum(['player_win','loomkeeper_win','draw','left','expired']),
    finalTick: tick, finalStateHash: hash }).strict();
export type ChallengeSnapshotV8 = z.infer<typeof ChallengeSnapshotV8Schema>;
export type ChallengeResultV8 = z.infer<typeof ChallengeResultV8Schema>;
export function InputAckV8Schema() {
    const metadata = { protocolVersion: z.literal(8), requestId: RequestIdSchema, nextInputSequence: uint32 };
    return z.union([
        z.object({ ...metadata, ok: z.literal(true), data: ChallengeSnapshotV8Schema }).strict(),
        z.object({ ...metadata, ok: z.literal(false), error: ProtocolErrorSchema }).strict()
    ]);
}
export type InputAckV8 = z.infer<ReturnType<typeof InputAckV8Schema>>;
export const LifecycleAckV8Schema = z.union([
    z.object({ protocolVersion:z.literal(8),requestId:RequestIdSchema,nextSequence:uint32,ok:z.literal(true),
        data:z.union([ChallengeSnapshotV8Schema,ChallengeResultV8Schema]) }).strict(),
    z.object({ protocolVersion:z.literal(8),requestId:RequestIdSchema,nextSequence:uint32,ok:z.literal(false),
        error:ProtocolErrorSchema }).strict()
]);

/** Browser-safe byte count. Size-check untrusted payloads before parsing or applying. */
export function jsonBytesV8(value: unknown): number {
    try { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
    catch { return Number.POSITIVE_INFINITY; }
}
