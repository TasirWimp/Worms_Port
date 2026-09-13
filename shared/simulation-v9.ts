import type { ProjectileMechanics, SimulationDynamics } from './simulation-v8';
import { z } from 'zod';
import {
    V8_R1_RULESET_ID, V8_SIM_RULES, applySimulationBarrierV8, applySimulationIntentV8,
    advanceSimulationTicksV8, assertSimulationInvariantsV8Family,
    createSimulationV8, forceSimulationLimitV8, type ProjectileV8, type SettleReasonV8,
    type SimulationBarrierV8Family, type SimulationEventV8, type SimulationIntentV8R1,
    type SimulationPhaseV8, type SimulationStateV8R1, type SimulationTransitionV8,
    type SimulationUnitV8
} from './simulation-v8';
import type { PackedTerrain, PlayerCalling, ProjectileSummary, RelicId, SimulationActor, SimulationWinner } from './simulation';

/** Product-owned V9 resource/utility rules; V8 and V8-r1 remain immutable. */
export const V9_RULESET_ID = 'nimble-knots-artillery-v9' as const;
export const V9_RULESET_VERSION = 9 as const;
export const V9_LOOMKEEPER_POLICY_ID = 'nimble-knots-loomkeeper-v4' as const;
export const V9_LOOMKEEPER_PROFILE_ID = 'standard-v9-0' as const;
export const V9_SIM_RULES = V8_SIM_RULES;
export const V9_RELIC_THREAD_COSTS: Readonly<Record<RelicId, number>> = Object.freeze({
    threadball: 2, needlepoint: 3, spoolburst: 5
});

export type SimulationUnitV9 = SimulationUnitV8 & {
    thread: number;
    lastCreditedTurn: number;
    shield: number;
    shieldExpiresTurn: number | null;
    reinforcedLeap: boolean;
};
export type SimulationStateV9 = {
    formatVersion: 9; rulesetId: typeof V9_RULESET_ID; rulesetVersion: 9;
    seed: number; rngState: number; tick: number; revision: number; turn: number;
    activeActor: SimulationActor; phase: SimulationPhaseV8;
    phaseStartedTick: number; phaseDeadlineTick: number;
    settleReason: SettleReasonV8 | null; castUsed: boolean; utilityUsed: boolean;
    inputEpoch: number; heldDirection: -1 | 0 | 1;
    leaseExpiresTick: number | null; lastLeaseRefreshTick: number | null;
    acceptedIntentCount: number; lifecycleBarrierCount: number; aimId: number;
    selectedRelic: RelicId; aim: { angleMilliDegrees: number; powerPermille: number } | null;
    winner: SimulationWinner | null;
    finishReason: 'unravelled' | 'turn_limit' | 'simulation_limit' | null;
    units: [SimulationUnitV9, SimulationUnitV9]; terrain: PackedTerrain;
    projectile: ProjectileV8 | null; lastProjectile: ProjectileSummary | null;
};
export type SimulationIntentV9 = SimulationIntentV8R1
    | { type: 'threadguard' }
    | { type: 'threadleap'; direction: -1 | 1 };
export type SimulationBarrierV9 = SimulationBarrierV8Family;
export type DamageResolvedEventV9 = {
    type: 'damage_resolved'; actor: SimulationActor; raw: number; absorbed: number;
    stitchingLost: number; stitching: number; shield: number;
};
export type SimulationEventV9 = Exclude<SimulationEventV8, { type: 'damaged' }> | DamageResolvedEventV9;
export type SimulationTransitionV9 = {
    accepted: boolean; mutated: boolean; state: SimulationStateV9; events: SimulationEventV9[];
    error?: SimulationTransitionV8['error'];
};

const integer = (minimum: number, maximum: number) => z.number().int().min(minimum).max(maximum);
const actor = z.enum(['player', 'loomkeeper']);
const direction = z.union([z.literal(-1), z.literal(1)]);
const relic = z.enum(['threadball', 'needlepoint', 'spoolburst']);
const phase = z.enum(['action', 'projectile', 'settling', 'retreat', 'finished']);
const point = z.object({ x: integer(-4096, 4096), y: integer(-4096, 4096) }).strict();
const aim = z.object({ angleMilliDegrees: integer(-90_000, 90_000), powerPermille: integer(0, 1000) }).strict();
const unit = z.object({
    id: actor, calling: z.enum(['wizard', 'thief', 'warrior', 'loomkeeper']),
    xFp: integer(12 * 256, 2036 * 256), yFp: integer(12 * 256, 596 * 256),
    vxFp: integer(-2048, 2048), vyFp: integer(-2048, 2048), facing: direction,
    stitching: integer(0, 100), alive: z.boolean(), grounded: z.boolean(),
    support: z.union([integer(0, 256 * 72 - 1), actor]).nullable(), airTicks: integer(0, 120),
    airDrive: z.enum(['jump', 'walk_fall']).nullable(), thread: integer(0, 9),
    lastCreditedTurn: integer(-1, 15), shield: integer(0, 24),
    shieldExpiresTurn: integer(0, 17).nullable(), reinforcedLeap: z.boolean()
}).strict();
const projectile = z.object({ actor, relicId: relic, xFp: integer(-4096 * 256, 4096 * 256),
    yFp: integer(-4096 * 256, 4096 * 256), vxFp: integer(-8192, 8192), vyFp: integer(-32768, 32768),
    flightTicks: integer(0, 300), startX: integer(-4096, 4096), startY: integer(-4096, 4096),
    trace: z.array(point).min(1).max(41) }).strict();
const projectileSummary = z.object({ relicId: relic, startX: integer(-4096, 4096), startY: integer(-4096, 4096),
    endX: integer(-4096, 4096), endY: integer(-4096, 4096), flightTicks: integer(1, 300),
    impact: z.enum(['terrain', 'player', 'loomkeeper', 'world_exit', 'lifetime']), trace: z.array(point).min(2).max(41) }).strict();

/** Strict state-only validator for V9 snapshots. Wire/replay envelopes belong to protocol-v9. */
export const SimulationStateV9Schema = z.object({
    formatVersion: z.literal(9), rulesetId: z.literal(V9_RULESET_ID), rulesetVersion: z.literal(9),
    seed: integer(1, 0xffffffff), rngState: integer(1, 0xffffffff), tick: integer(0, 16800),
    revision: integer(0, 65535), turn: integer(0, 16), activeActor: actor, phase,
    phaseStartedTick: integer(0, 16800), phaseDeadlineTick: integer(0, 17850),
    settleReason: z.enum(['post_shot', 'action_timeout', 'retreat_timeout', 'death']).nullable(),
    castUsed: z.boolean(), utilityUsed: z.boolean(), inputEpoch: integer(0, 65535),
    heldDirection: z.union([direction, z.literal(0)]), leaseExpiresTick: integer(0, 16809).nullable(),
    lastLeaseRefreshTick: integer(0, 16800).nullable(), acceptedIntentCount: integer(0, 512),
    lifecycleBarrierCount: integer(0, 128), aimId: integer(0, 65535), selectedRelic: relic, aim: aim.nullable(),
    winner: z.enum(['player', 'loomkeeper', 'draw']).nullable(),
    finishReason: z.enum(['unravelled', 'turn_limit', 'simulation_limit']).nullable(), units: z.tuple([unit, unit]),
    terrain: z.object({ width: z.literal(256), height: z.literal(72), cellSize: z.literal(8),
        words: z.array(integer(0, 0xffffffff)).length(576) }).strict(),
    projectile: projectile.nullable(), lastProjectile: projectileSummary.nullable()
}).strict();
/** Internal later-version validator; exact timing remains in the kernel invariant. */
export const SimulationStateV9KernelSchema = SimulationStateV9Schema.extend({
    tick: integer(0, 38_400),
    phaseStartedTick: integer(0, 38_400),
    phaseDeadlineTick: integer(0, 40_800),
    leaseExpiresTick: integer(0, 38_418).nullable(),
    lastLeaseRefreshTick: integer(0, 38_400).nullable()
}).strict();
export const SimulationIntentV9Schema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('walk_start'), direction }).strict(),
    z.object({ type: z.literal('walk_refresh') }).strict(),
    z.object({ type: z.literal('walk_stop') }).strict(),
    z.object({ type: z.literal('face'), direction }).strict(),
    z.object({ type: z.literal('jump'), direction }).strict(),
    z.object({ type: z.literal('select_relic'), relicId: relic }).strict(),
    aim.extend({ type: z.literal('aim') }).strict(), z.object({ type: z.literal('fire'), aimId: integer(1, 65535) }).strict(),
    z.object({ type: z.literal('threadguard') }).strict(), z.object({ type: z.literal('threadleap'), direction }).strict()
]);
export const SimulationBarrierV9Schema = z.object({ reason: z.enum(['cancel', 'disconnect', 'reconnect', 'pause', 'resume', 'intent_limit', 'walk_stop']),
    actor, expectedTurn: integer(0, 16), expectedEpoch: integer(0, 65535) }).strict();

export function createSimulationV9(seed: number, calling: PlayerCalling): SimulationStateV9 {
    const legacy = createSimulationV8(seed, calling, V8_R1_RULESET_ID);
    const state = fromV8(legacy, undefined, []);
    state.units[0].thread = 3;
    state.units[0].lastCreditedTurn = 0;
    assertSimulationInvariantsV9(state);
    return state;
}

export function applySimulationIntentV9(current: SimulationStateV9, actorId: SimulationActor, intent: SimulationIntentV9,
    expectedTurn: number, expectedPhase = current.phase, expectedEpoch = current.inputEpoch, mechanics?: ProjectileMechanics,
    dynamics?: SimulationDynamics): SimulationTransitionV9 {
    assertSimulationInvariantsV9(current, dynamics);
    if (!SimulationIntentV9Schema.safeParse(intent).success) return reject(current, 'COMMAND_REJECTED', 'Invalid V9 intent.');
    if (intent.type !== 'threadguard' && intent.type !== 'threadleap') {
        const result = applySimulationIntentV8(toV8(current), actorId, intent, expectedTurn, expectedPhase, expectedEpoch, mechanics, dynamics);
        if (!result.accepted) return { ...result, state: current, events: [] };
        const state = fromV8(result.state, current, result.events);
        if (intent.type === 'fire' && result.state.phase === 'projectile') {
            const price = V9_RELIC_THREAD_COSTS[current.selectedRelic];
            const unit = activeUnit(current);
            if (unit.thread < price) return reject(current, 'COMMAND_REJECTED', 'Insufficient Thread.');
            activeUnit(state).thread -= price;
        }
        assertSimulationInvariantsV9(state, dynamics);
        return { accepted: result.accepted, mutated: result.mutated, state, events: translateEvents(result.events, current, state) };
    }
    if (current.phase === 'finished') return reject(current, 'COMMAND_REJECTED', 'The match is finished.');
    if (expectedTurn !== current.turn) return reject(current, 'LATE_TURN', 'Different turn.');
    if (actorId !== current.activeActor) return reject(current, 'NOT_YOUR_TURN', 'Different active actor.');
    if (expectedPhase !== current.phase || expectedEpoch !== current.inputEpoch) return reject(current, 'STALE_INPUT', 'Different phase or input epoch.');
    if (current.acceptedIntentCount >= (dynamics?.maximumIntentsPerTurn ?? V8_SIM_RULES.maximumIntentsPerTurn)) return reject(current, 'INTENT_LIMIT', 'Turn intent budget exhausted.');
    const active = activeUnit(current);
    if (current.phase !== 'action' || current.tick >= current.phaseDeadlineTick || current.castUsed || current.utilityUsed ||
        current.heldDirection !== 0 || !active.alive ||
        !current.units.every(body => body.alive && body.grounded && body.vxFp === 0 && body.vyFp === 0))
        return reject(current, 'COMMAND_REJECTED', 'Utility is not legal in this state.');
    // Mirror V8's fail-closed counter terminal before a utility can mutate or debit.
    if (current.revision >= 65534 || current.inputEpoch >= 65534) return forceSimulationLimitV9(current, dynamics);
    if (active.thread < 2) return reject(current, 'COMMAND_REJECTED', 'Insufficient Thread.');
    const state = cloneSimulationV9(current); const body = activeUnit(state);
    body.thread -= 2; state.utilityUsed = true; clearInput(state, false);
    if (intent.type === 'threadguard') {
        body.shield = 24; body.shieldExpiresTurn = state.turn + 2;
    } else {
        body.facing = intent.direction; body.grounded = false; body.support = null;
        body.vxFp = intent.direction * 512; body.vyFp = -2048; body.airTicks = 0;
        body.airDrive = 'jump'; body.reinforcedLeap = true;
    }
    state.acceptedIntentCount += 1; state.revision += 1;
    assertSimulationInvariantsV9(state, dynamics);
    return { accepted: true, mutated: true, state, events: [] };
}

export function advanceSimulationTicksV9(current: SimulationStateV9, count: number, mechanics?: ProjectileMechanics,
    dynamics?: SimulationDynamics): SimulationTransitionV9 {
    assertSimulationInvariantsV9(current, dynamics);
    const maximumCombatTicks = dynamics?.maximumCombatTicks ?? V8_SIM_RULES.maximumCombatTicks;
    if (!Number.isSafeInteger(count) || count < 0 || count > maximumCombatTicks)
        return reject(current, 'COMMAND_REJECTED', 'Tick batch exceeds the simulation bound.');
    if (current.phase === 'finished' || count === 0) return { accepted: true, mutated: false, state: current, events: [] };
    // Reapply the immutable V8-r1 tick one at a time so resource effects occur at
    // each real boundary, making a batch exactly equivalent to repeated ticks.
    let state = current;
    const events: SimulationEventV9[] = [];
    for (let index = 0; index < count && state.phase !== 'finished'; index += 1) {
        const result = advanceSimulationTicksV8(toV8(state), 1, mechanics, dynamics);
        if (!result.mutated) break;
        const next = fromV8(result.state, state, result.events);
        assertSimulationInvariantsV9(next, dynamics);
        events.push(...translateEvents(result.events, state, next));
        state = next;
    }
    return { accepted: true, mutated: state !== current, state, events };
}

/** Detached state is created only through the validated planner boundary below. */
export class DetachedSimulationRolloutV9 {
    private constructor(private current: SimulationStateV9, public readonly dynamics?: SimulationDynamics) {}
    public static fromTrustedSource(source: SimulationStateV9, dynamics?: SimulationDynamics): DetachedSimulationRolloutV9 {
        assertSimulationInvariantsV9(source, dynamics);
        return new DetachedSimulationRolloutV9(cloneSimulationV9(source), dynamics);
    }
    public get state(): SimulationStateV9 { return this.current; }
    /** Public V9 transitions already validate their result before this replacement. */
    public replace(state: SimulationStateV9): void { this.current = state; }
}

/**
 * Advances a validated, clone-owned detached rollout without re-running V9's
 * Zod validation for each internal tick. V8 remains the mechanics kernel for
 * every tick. Call completeDetachedSimulationRolloutV9 before ranking.
 */
export function advanceSimulationTicksV9DetachedRollout(rollout: DetachedSimulationRolloutV9, count: number, mechanics?: ProjectileMechanics): SimulationTransitionV9 {
    const current = rollout.state;
    const maximumCombatTicks = rollout.dynamics?.maximumCombatTicks ?? V8_SIM_RULES.maximumCombatTicks;
    if (!Number.isSafeInteger(count) || count < 0 || count > maximumCombatTicks)
        return reject(current, 'COMMAND_REJECTED', 'Tick batch exceeds the simulation bound.');
    if (current.phase === 'finished' || count === 0) return { accepted: true, mutated: false, state: current, events: [] };
    let state = current;
    const events: SimulationEventV9[] = [];
    for (let index = 0; index < count && state.phase !== 'finished'; index += 1) {
        const result = advanceSimulationTicksV8(toV8(state), 1, mechanics, rollout.dynamics);
        if (!result.mutated) break;
        const next = fromV8(result.state, state, result.events);
        events.push(...translateEvents(result.events, state, next));
        state = next;
    }
    rollout.replace(state);
    return { accepted: true, mutated: true, state, events };
}

/** Completes the detached-only trust boundary before a candidate can be ranked. */
export function completeDetachedSimulationRolloutV9(rollout: DetachedSimulationRolloutV9): SimulationStateV9 {
    assertSimulationInvariantsV9(rollout.state, rollout.dynamics);
    return rollout.state;
}

export function applySimulationBarrierV9(current: SimulationStateV9, barrier: SimulationBarrierV9,
    dynamics?: SimulationDynamics): SimulationTransitionV9 {
    assertSimulationInvariantsV9(current, dynamics);
    if (!SimulationBarrierV9Schema.safeParse(barrier).success) return reject(current, 'COMMAND_REJECTED', 'Invalid barrier.');
    // V8 restricts pause to grounded player action. A V9 committed Threadleap is
    // interruptible: it loses horizontal drive while its inherited gravity arc
    // continues, so pause cannot retain a hidden 512-fp impulse.
    if (barrier.reason === 'pause' && activeUnit(current).reinforcedLeap && current.phase === 'action' &&
        barrier.actor === current.activeActor && barrier.expectedTurn === current.turn && barrier.expectedEpoch === current.inputEpoch) {
        if (current.lifecycleBarrierCount >= 128) return reject(current, 'LIFECYCLE_LIMIT', 'Lifecycle budget exhausted.');
        if (current.revision >= 65534 || current.inputEpoch >= 65534) return forceSimulationLimitV9(current, dynamics);
        const state = cloneSimulationV9(current); clearInput(state, false); state.lifecycleBarrierCount += 1; state.revision += 1;
        assertSimulationInvariantsV9(state, dynamics);
        return { accepted: true, mutated: true, state, events: [] };
    }
    const result = applySimulationBarrierV8(toV8(current), barrier, dynamics);
    if (!result.mutated) return { ...result, state: current, events: [] };
    const state = fromV8(result.state, current, result.events);
    assertSimulationInvariantsV9(state, dynamics);
    return { accepted: result.accepted, mutated: result.mutated, state, events: translateEvents(result.events, current, state) };
}

export function forceSimulationLimitV9(current: SimulationStateV9, dynamics?: SimulationDynamics): SimulationTransitionV9 {
    const result = forceSimulationLimitV8(toV8(current), dynamics);
    if (!result.mutated) return { ...result, state: current, events: [] };
    const state = fromV8(result.state, current, result.events);
    assertSimulationInvariantsV9(state, dynamics);
    return { accepted: result.accepted, mutated: result.mutated, state, events: translateEvents(result.events, current, state) };
}

export function cloneSimulationV9(state: SimulationStateV9): SimulationStateV9 {
    return { ...state, aim: state.aim ? { ...state.aim } : null, units: state.units.map(unit => ({ ...unit })) as [SimulationUnitV9, SimulationUnitV9],
        terrain: { ...state.terrain, words: [...state.terrain.words] }, projectile: state.projectile ? { ...state.projectile, trace: state.projectile.trace.map(point => ({ ...point })) } : null,
        lastProjectile: state.lastProjectile ? { ...state.lastProjectile, trace: state.lastProjectile.trace.map(point => ({ ...point })) } : null };
}

export function assertSimulationInvariantsV9(state: SimulationStateV9, dynamics?: SimulationDynamics): void {
    if (!(dynamics ? SimulationStateV9KernelSchema : SimulationStateV9Schema).safeParse(state).success) throw new Error('Invalid V9 state: schema.');
    const fail = (condition: boolean, message: string) => { if (!condition) throw new Error(`Invalid V9 state: ${message}`); };
    for (const body of state.units) {
        // Validate V9's actual health before creating the temporary V8
        // effective-health damage adapter. A shield cannot make a zero-health
        // actor alive in the authoritative V9 snapshot.
        fail(body.alive === (body.stitching > 0), 'stitching/alive');
        fail((body.shield === 0) === (body.shieldExpiresTurn === null), 'shield expiry');
        if (!body.alive) fail(body.shield === 0 && body.shieldExpiresTurn === null && !body.reinforcedLeap, 'dead resource');
        if (body.reinforcedLeap) fail(!body.grounded && body.airDrive === 'jump', 'reinforced leap');
    }
    assertSimulationInvariantsV8Family(toV8(state), dynamics);
}

/** Validates before serializing and recursively sorts all object keys. */
export function canonicalSimulationJsonV9(state: SimulationStateV9): string {
    assertSimulationInvariantsV9(state);
    return canonicalJson(state);
}
export function hashSimulationStateV9(state: SimulationStateV9): string {
    return sha256(new TextEncoder().encode(canonicalSimulationJsonV9(state)));
}

function toV8(state: SimulationStateV9): SimulationStateV8R1 {
    const { utilityUsed: _utilityUsed, units, ...common } = state;
    return { ...common, formatVersion: 8, rulesetId: V8_R1_RULESET_ID, rulesetVersion: 8,
        units: units.map(body => {
            const { thread: _thread, lastCreditedTurn: _last, shield, shieldExpiresTurn: _expiry, reinforcedLeap: _leap, ...unitV8 } = body;
            // A temporary effective-Stitching view preserves V8's raw damage and terminal ordering.
            return { ...unitV8, stitching: Math.min(100, unitV8.stitching + shield), alive: unitV8.alive };
        }) as [SimulationUnitV8, SimulationUnitV8] };
}

function fromV8(next: SimulationStateV8R1, prior: SimulationStateV9 | undefined, events: SimulationEventV8[]): SimulationStateV9 {
    const damages = new Map<SimulationActor, number>();
    for (const event of events) if (event.type === 'damaged') damages.set(event.actor, event.amount);
    const state: SimulationStateV9 = {
        ...next, formatVersion: 9, rulesetId: V9_RULESET_ID, rulesetVersion: 9, utilityUsed: prior?.utilityUsed ?? false,
        units: next.units.map((unitV8, index) => {
            const before = prior?.units[index]; const raw = damages.get(unitV8.id);
            const absorbed = before && raw !== undefined ? Math.min(before.shield, raw) : 0;
            const residual = raw === undefined ? 0 : raw - absorbed;
            // The V8 adapter borrows shield points only while resolving a hit.
            // Its effective Stitching must never become a V9 health update.
            const stitching = before ? (raw === undefined ? (unitV8.alive ? before.stitching : 0)
                : Math.max(0, before.stitching - residual)) : unitV8.stitching;
            const alive = raw === undefined ? unitV8.alive : stitching > 0;
            const keepLeap = Boolean(before?.reinforcedLeap && alive && !unitV8.grounded && next.phase === 'action');
            return { ...unitV8, stitching, alive, thread: before?.thread ?? 0, lastCreditedTurn: before?.lastCreditedTurn ?? -1,
                shield: alive ? Math.max(0, (before?.shield ?? 0) - absorbed) : 0,
                shieldExpiresTurn: alive && (before?.shield ?? 0) - absorbed > 0 ? before?.shieldExpiresTurn ?? null : null,
                reinforcedLeap: keepLeap };
        }) as [SimulationUnitV9, SimulationUnitV9]
    };
    if (state.phase === 'action' && (!prior || state.turn !== prior.turn)) {
        const body = activeUnit(state);
        if (body.shieldExpiresTurn === state.turn) { body.shield = 0; body.shieldExpiresTurn = null; }
        if (body.lastCreditedTurn !== state.turn) { body.thread = Math.min(9, body.thread + 3); body.lastCreditedTurn = state.turn; }
        state.utilityUsed = false;
    }
    return state;
}

function activeUnit(state: SimulationStateV9): SimulationUnitV9 { return state.units[state.activeActor === 'player' ? 0 : 1]; }
function clearInput(state: SimulationStateV9, allBodies: boolean): void {
    state.heldDirection = 0; state.leaseExpiresTick = null; state.lastLeaseRefreshTick = null; state.aim = null;
    state.inputEpoch = Math.min(65535, state.inputEpoch + 1);
    if (allBodies) state.units.forEach(unit => { unit.vxFp = 0; }); else activeUnit(state).vxFp = 0;
}
function reject(state: SimulationStateV9, code: NonNullable<SimulationTransitionV9['error']>['code'], message: string): SimulationTransitionV9 {
    return { accepted: false, mutated: false, state, events: [], error: { code, message } };
}
function translateEvents(events: SimulationEventV8[], before: SimulationStateV9, after: SimulationStateV9): SimulationEventV9[] {
    const translated: SimulationEventV9[] = [];
    for (const event of events) {
        if (event.type !== 'damaged') { translated.push(event); continue; }
        const old = before.units[event.actor === 'player' ? 0 : 1]; const body = after.units[event.actor === 'player' ? 0 : 1];
        const absorbed = Math.min(old.shield, event.amount);
        translated.push({ type: 'damage_resolved', actor: event.actor, raw: event.amount, absorbed,
            stitchingLost: event.amount - absorbed, stitching: body.stitching, shield: body.shield });
    }
    return translated;
}
function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value !== null && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

/** Small synchronous SHA-256 implementation so canonical hashes are identical in Node and browser bundles. */
function sha256(bytes: Uint8Array): string {
    const words: number[] = []; const bitLength = bytes.length * 8;
    for (let index = 0; index < bytes.length; index += 1) words[index >> 2] = (words[index >> 2] ?? 0) | (bytes[index] << (24 - (index % 4) * 8));
    words[bitLength >> 5] = (words[bitLength >> 5] ?? 0) | (0x80 << (24 - (bitLength % 32)));
    const lengthIndex = (((bitLength + 64) >> 9) << 4) + 15;
    words[lengthIndex] = bitLength;
    let [a0, b0, c0, d0, e0, f0, g0, h0] = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const constants = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    for (let offset = 0; offset < words.length; offset += 16) {
        const w = Array<number>(64).fill(0); for (let index = 0; index < 16; index += 1) w[index] = words[offset + index] ?? 0;
        for (let index = 16; index < 64; index += 1) { const x = w[index - 15], y = w[index - 2]; const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3); const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10); w[index] = (w[index - 16] + s0 + w[index - 7] + s1) | 0; }
        let [a,b,c,d,e,f,g,h] = [a0,b0,c0,d0,e0,f0,g0,h0];
        for (let index = 0; index < 64; index += 1) { const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7)); const choose = (e & f) ^ (~e & g); const temp1 = (h + s1 + choose + constants[index] + w[index]) | 0; const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10)); const majority = (a & b) ^ (a & c) ^ (b & c); h=g; g=f; f=e; e=(d + temp1)|0; d=c; c=b; b=a; a=(temp1+s0+majority)|0; }
        a0=(a0+a)|0; b0=(b0+b)|0; c0=(c0+c)|0; d0=(d0+d)|0; e0=(e0+e)|0; f0=(f0+f)|0; g0=(g0+g)|0; h0=(h0+h)|0;
    }
    return [a0,b0,c0,d0,e0,f0,g0,h0].map(word => (word >>> 0).toString(16).padStart(8, '0')).join('');
}
