import {
    V7_RULESET_ID, V5_LAUNCH_SPEED_RULES, V5_RELIC_RULES, RELIC_IDS,
    createSimulation, deformTerrain, directProjectileHitboxFor, terrainSolid,
    type PackedTerrain, type PlayerCalling, type ProjectileSummary, type RelicId,
    type SimulationActor, type SimulationWinner
} from './simulation';

/** Product-owned V8 contract wp-015d3a-v8a-rules-v0; legacy exports stay frozen. */
export const V8_RULESET_ID = 'nimble-knots-artillery-v8' as const;
export const V8_RULESET_VERSION = 8 as const;
export const V8_SIM_RULES = Object.freeze({
    worldWidth: 2048, worldHeight: 576, terrainCellSize: 8,
    terrainWidth: 256, terrainHeight: 72, fixedPointScale: 256,
    tickRate: 30, actionTicks: 450, retreatTicks: 60, projectileTicks: 300,
    settlingTicks: 120, maximumAirTicks: 120, maximumTurns: 16,
    maximumTurnTicks: 1050, maximumCombatTicks: 16800, actorRadius: 12,
    walkSpeedFp: 256, jumpSpeedFp: -2048, gravityFp: 64, maximumFallSpeedFp: 2048,
    stepHeight: 8, leaseTicks: 9, leaseRefreshTicks: 3,
    maximumIntentsPerTurn: 512, maximumLifecycleBarriers: 128,
    maximumCounter: 65535
});
export type SimulationPhaseV8 = 'action' | 'projectile' | 'settling' | 'retreat' | 'finished';
export type SettleReasonV8 = 'post_shot' | 'action_timeout' | 'retreat_timeout' | 'death';
export type SimulationUnitV8 = {
    id: SimulationActor;
    calling: PlayerCalling | 'loomkeeper';
    xFp: number; yFp: number; vxFp: number; vyFp: number;
    facing: -1 | 1; stitching: number; alive: boolean;
    grounded: boolean;
    /** Flat terrain cell index, supporting actor ID, or no support. */
    support: number | SimulationActor | null;
    airTicks: number;
    airDrive: 'jump' | 'walk_fall' | null;
};
export type ProjectileV8 = {
    actor: SimulationActor; relicId: RelicId;
    xFp: number; yFp: number; vxFp: number; vyFp: number;
    flightTicks: number; startX: number; startY: number;
    trace: { x: number; y: number }[];
};
export type SimulationStateV8 = {
    formatVersion: 8; rulesetId: typeof V8_RULESET_ID; rulesetVersion: 8;
    seed: number; rngState: number; tick: number; revision: number; turn: number;
    activeActor: SimulationActor; phase: SimulationPhaseV8;
    phaseStartedTick: number; phaseDeadlineTick: number;
    settleReason: SettleReasonV8 | null; castUsed: boolean;
    inputEpoch: number; heldDirection: -1 | 0 | 1;
    leaseExpiresTick: number | null; lastLeaseRefreshTick: number | null;
    acceptedIntentCount: number; lifecycleBarrierCount: number; aimId: number;
    selectedRelic: RelicId;
    aim: { angleMilliDegrees: number; powerPermille: number } | null;
    winner: SimulationWinner | null;
    finishReason: 'unravelled' | 'turn_limit' | 'simulation_limit' | null;
    units: [SimulationUnitV8, SimulationUnitV8]; terrain: PackedTerrain;
    projectile: ProjectileV8 | null; lastProjectile: ProjectileSummary | null;
};
export type SimulationIntentV8 =
    | { type: 'walk_start'; direction: -1 | 1 }
    | { type: 'walk_refresh' }
    | { type: 'face'; direction: -1 | 1 }
    | { type: 'jump' }
    | { type: 'select_relic'; relicId: RelicId }
    | { type: 'aim'; angleMilliDegrees: number; powerPermille: number }
    | { type: 'fire'; aimId: number };
export type SimulationBarrierV8 = {
    reason: 'cancel' | 'disconnect' | 'reconnect' | 'pause' | 'resume' | 'intent_limit';
    actor: SimulationActor; expectedTurn: number; expectedEpoch: number;
};
export type SimulationEventV8 =
    | { type: 'phase_changed'; phase: SimulationPhaseV8; tick: number }
    | { type: 'input_barrier'; reason: 'lease_expired' | 'phase'; tick: number }
    | { type: 'impact'; x: number; y: number; target: ProjectileSummary['impact'] }
    | { type: 'damaged'; actor: SimulationActor; amount: number; stitching: number }
    | { type: 'finished'; winner: SimulationWinner; reason: NonNullable<SimulationStateV8['finishReason']> };
export type SimulationTransitionV8 = {
    accepted: boolean; mutated: boolean; state: SimulationStateV8; events: SimulationEventV8[];
    error?: { code: 'COMMAND_REJECTED' | 'NOT_YOUR_TURN' | 'LATE_TURN' | 'STALE_INPUT' |
        'INTENT_LIMIT' | 'LIFECYCLE_LIMIT'; message: string };
};

export function createSimulationV8(seed: number, calling: PlayerCalling): SimulationStateV8 {
    if (!['wizard', 'thief', 'warrior'].includes(calling)) throw new Error('Invalid V8 Calling.');
    const legacy = createSimulation(seed, calling, V7_RULESET_ID);
    const state: SimulationStateV8 = {
        formatVersion: 8, rulesetId: V8_RULESET_ID, rulesetVersion: 8,
        seed: legacy.seed, rngState: legacy.rngState, tick: 0, revision: 0, turn: 0,
        activeActor: 'player', phase: 'action', phaseStartedTick: 0, phaseDeadlineTick: 450,
        settleReason: null, castUsed: false, inputEpoch: 0, heldDirection: 0,
        leaseExpiresTick: null, lastLeaseRefreshTick: null,
        acceptedIntentCount: 0, lifecycleBarrierCount: 0, aimId: 0,
        selectedRelic: 'threadball', aim: null, winner: null, finishReason: null,
        units: legacy.units.map(unit => ({
            id: unit.id, calling: unit.calling, xFp: unit.x * 256, yFp: unit.y * 256,
            vxFp: 0, vyFp: 0, facing: unit.facing, stitching: unit.stitching, alive: unit.alive,
            grounded: true, support: null, airTicks: 0, airDrive: null
        })) as [SimulationUnitV8, SimulationUnitV8],
        terrain: legacy.terrain, projectile: null, lastProjectile: null
    };
    reevaluateSupports(state);
    assertSimulationInvariantsV8(state);
    return state;
}
export function applySimulationIntentV8(current: SimulationStateV8, actor: SimulationActor,
    intent: SimulationIntentV8, expectedTurn: number, expectedPhase = current.phase,
    expectedEpoch = current.inputEpoch): SimulationTransitionV8 {
    if (current.phase === 'finished') return reject(current, 'COMMAND_REJECTED', 'The match is finished.');
    if (expectedTurn !== current.turn) return reject(current, 'LATE_TURN', 'Different turn.');
    if (actor !== current.activeActor) return reject(current, 'NOT_YOUR_TURN', 'Different active actor.');
    if (expectedPhase !== current.phase || expectedEpoch !== current.inputEpoch) {
        return reject(current, 'STALE_INPUT', 'Different phase or input epoch.');
    }
    if (!validIntent(intent)) return reject(current, 'COMMAND_REJECTED', 'Invalid V8 intent.');
    if (!movingPhase(current) || current.tick >= current.phaseDeadlineTick || !activeUnit(current).alive) {
        return reject(current, 'COMMAND_REJECTED', 'Input is not legal in this phase.');
    }
    if (current.acceptedIntentCount >= 512) return reject(current, 'INTENT_LIMIT', 'Turn intent budget exhausted.');
    const unit = activeUnit(current);
    if (intent.type === 'walk_start' && current.heldDirection !== 0) {
        return reject(current, 'COMMAND_REJECTED', 'Release the existing hold before starting another.');
    }
    if (intent.type === 'walk_refresh' && (current.heldDirection === 0 || current.leaseExpiresTick === null ||
        current.tick >= current.leaseExpiresTick || current.lastLeaseRefreshTick === null ||
        current.tick - current.lastLeaseRefreshTick < 3)) {
        return reject(current, 'COMMAND_REJECTED', 'No live hold eligible for refresh.');
    }
    if (intent.type === 'jump' && !unit.grounded) return reject(current, 'COMMAND_REJECTED', 'Jump needs stable ground.');
    const offensive = intent.type === 'aim' || intent.type === 'select_relic' || intent.type === 'fire';
    if (offensive && (current.phase !== 'action' || current.heldDirection !== 0 ||
        !current.units.every(body => body.alive && body.grounded && body.vxFp === 0 && body.vyFp === 0))) {
        return reject(current, 'COMMAND_REJECTED', 'Offense needs neutral, grounded action.');
    }
    if (intent.type === 'fire' && (current.castUsed || !current.aim || intent.aimId !== current.aimId)) {
        return reject(current, 'COMMAND_REJECTED', 'Fire needs the current acknowledged aim.');
    }
    if (countersExhausted(current) || (intent.type === 'aim' && current.aimId >= 65534)) {
        return forceSimulationLimitV8(current);
    }
    const state = cloneSimulationV8(current);
    const body = activeUnit(state);
    const events: SimulationEventV8[] = [];
    switch (intent.type) {
    case 'walk_start':
        state.heldDirection = intent.direction;
        state.leaseExpiresTick = state.tick + 9;
        state.lastLeaseRefreshTick = state.tick;
        body.facing = intent.direction; state.aim = null;
        break;
    case 'walk_refresh':
        state.leaseExpiresTick = state.tick + 9; state.lastLeaseRefreshTick = state.tick;
        break;
    case 'face': body.facing = intent.direction; state.aim = null; break;
    case 'jump':
        body.grounded = false; body.support = null;
        body.vxFp = body.facing * 256; body.vyFp = -2048;
        body.airTicks = 0; body.airDrive = 'jump'; state.aim = null;
        break;
    case 'select_relic': state.selectedRelic = intent.relicId; state.aim = null; break;
    case 'aim':
        state.aimId += 1;
        state.aim = { angleMilliDegrees: intent.angleMilliDegrees, powerPermille: intent.powerPermille };
        break;
    case 'fire':
        state.projectile = launchProjectile(state);
        state.castUsed = true;
        enterPhase(state, 'projectile', 300, null, events);
        break;
    }
    state.acceptedIntentCount += 1;
    state.revision += 1;
    assertSimulationInvariantsV8(state);
    return { accepted: true, mutated: true, state, events };
}
export function advanceSimulationTicksV8(current: SimulationStateV8, count: number): SimulationTransitionV8 {
    if (!integer(count, 0, 16800)) return reject(current, 'COMMAND_REJECTED', 'Tick batch exceeds the V8 bound.');
    if (current.phase === 'finished' || count === 0) return unchanged(current);
    const state = cloneSimulationV8(current);
    const events: SimulationEventV8[] = [];
    for (let step = 0; step < count && state.phase !== 'finished'; step += 1) {
        if (state.tick >= 16800 || countersExhausted(state)) {
            finish(state, 'draw', 'simulation_limit', events); state.revision = Math.min(65535, state.revision + 1);
            break;
        }
        expireLease(state, events);
        if (state.phase !== 'projectile') integrateBodies(state);
        state.tick += 1;
        if (state.phase === 'projectile') advanceProjectile(state, events);
        else resolveBodyBoundaries(state, events);
        if (state.winner === null) resolvePhaseDeadline(state, events);
        if (state.winner === null && state.tick >= 16800) finish(state, 'draw', 'simulation_limit', events);
        state.revision += 1;
    }
    assertSimulationInvariantsV8(state);
    return { accepted: true, mutated: true, state, events };
}
export function applySimulationBarrierV8(current: SimulationStateV8, barrier: SimulationBarrierV8): SimulationTransitionV8 {
    if (!exactKeys(barrier, ['reason', 'actor', 'expectedTurn', 'expectedEpoch']) ||
        !['cancel', 'disconnect', 'reconnect', 'pause', 'resume', 'intent_limit'].includes(barrier.reason) ||
        !['player', 'loomkeeper'].includes(barrier.actor)) return reject(current, 'COMMAND_REJECTED', 'Invalid barrier.');
    if (current.phase === 'finished' || barrier.actor !== current.activeActor || barrier.expectedTurn !== current.turn ||
        barrier.expectedEpoch !== current.inputEpoch) return unchanged(current);
    const forced = barrier.reason === 'reconnect' || barrier.reason === 'pause' || barrier.reason === 'resume';
    // Connection-only events during flight/settling own no active input. Pause is stricter.
    if (!movingPhase(current)) return unchanged(current);
    if (barrier.reason === 'pause' && (current.activeActor !== 'player' || current.phase !== 'action' ||
        !current.units.every(unit => unit.alive && unit.grounded))) {
        return reject(current, 'COMMAND_REJECTED', 'Pause needs grounded player action.');
    }
    if (!forced && current.heldDirection === 0 && activeUnit(current).vxFp === 0 && current.aim === null) return unchanged(current);
    if (current.lifecycleBarrierCount >= 128) return reject(current, 'LIFECYCLE_LIMIT', 'Lifecycle budget exhausted.');
    if (countersExhausted(current)) return forceSimulationLimitV8(current);
    const state = cloneSimulationV8(current);
    clearInput(state, false);
    state.lifecycleBarrierCount += 1; state.revision += 1;
    assertSimulationInvariantsV8(state);
    return { accepted: true, mutated: true, state, events: [] };
}
export function forceSimulationLimitV8(current: SimulationStateV8): SimulationTransitionV8 {
    if (current.phase === 'finished') return unchanged(current);
    const state = cloneSimulationV8(current); const events: SimulationEventV8[] = [];
    finish(state, 'draw', 'simulation_limit', events);
    state.revision = Math.min(65535, state.revision + 1);
    assertSimulationInvariantsV8(state);
    return { accepted: true, mutated: true, state, events };
}
export function cloneSimulationV8(state: SimulationStateV8): SimulationStateV8 {
    return {
        ...state, aim: state.aim ? { ...state.aim } : null,
        units: [{ ...state.units[0] }, { ...state.units[1] }],
        terrain: { ...state.terrain, words: [...state.terrain.words] },
        projectile: state.projectile ? { ...state.projectile, trace: state.projectile.trace.map(point => ({ ...point })) } : null,
        lastProjectile: state.lastProjectile ? { ...state.lastProjectile,
            trace: state.lastProjectile.trace.map(point => ({ ...point })) } : null
    };
}
export function canonicalSimulationJsonV8(state: SimulationStateV8): string {
    assertSimulationInvariantsV8(state);
    return canonicalJson(state);
}
export function assertSimulationInvariantsV8(state: SimulationStateV8): void {
    const fail = (condition: boolean, message: string): void => { if (!condition) throw new Error(`Invalid V8 state: ${message}`); };
    fail(exactKeys(state, ['formatVersion', 'rulesetId', 'rulesetVersion', 'seed', 'rngState', 'tick', 'revision', 'turn',
        'activeActor', 'phase', 'phaseStartedTick', 'phaseDeadlineTick', 'settleReason', 'castUsed', 'inputEpoch',
        'heldDirection', 'leaseExpiresTick', 'lastLeaseRefreshTick', 'acceptedIntentCount', 'lifecycleBarrierCount',
        'aimId', 'selectedRelic', 'aim', 'winner', 'finishReason', 'units', 'terrain', 'projectile', 'lastProjectile']), 'keys');
    fail(state.formatVersion === 8 && state.rulesetVersion === 8 && state.rulesetId === V8_RULESET_ID, 'identity');
    fail(integer(state.seed, 1, 0xffffffff) && integer(state.rngState, 1, 0xffffffff), 'RNG');
    fail(integer(state.tick, 0, 16800) && integer(state.turn, 0, 16), 'clock/turn');
    fail(['revision', 'inputEpoch', 'aimId'].every(key => integer(state[key as 'revision'], 0, 65535)), 'counter');
    fail(integer(state.acceptedIntentCount, 0, 512) && integer(state.lifecycleBarrierCount, 0, 128), 'budget');
    fail(['player', 'loomkeeper'].includes(state.activeActor) && ['action', 'retreat', 'projectile', 'settling', 'finished'].includes(state.phase), 'actor/phase');
    fail(integer(state.phaseStartedTick, 0, state.tick) && integer(state.phaseDeadlineTick, state.tick, 17850), 'phase clock');
    const phaseDuration = { action: 450, retreat: 60, projectile: 300, settling: 120, finished: 0 }[state.phase];
    fail(state.phaseDeadlineTick - state.phaseStartedTick === phaseDuration &&
        (state.phase === 'finished' ? state.phaseDeadlineTick === state.tick : state.tick < state.phaseDeadlineTick && state.turn < 16), 'phase deadline');
    fail(state.settleReason === null || ['post_shot', 'action_timeout', 'retreat_timeout', 'death'].includes(state.settleReason), 'settle reason');
    fail((state.phase === 'settling') === (state.settleReason !== null), 'settle phase');
    fail(typeof state.castUsed === 'boolean' && [-1, 0, 1].includes(state.heldDirection), 'input');
    fail(state.phase === 'action' ? !state.castUsed : state.phase === 'projectile' || state.phase === 'retreat' ||
        state.settleReason === 'post_shot' || state.settleReason === 'retreat_timeout' ? state.castUsed :
        state.settleReason !== 'action_timeout' || !state.castUsed, 'cast phase');
    fail((state.heldDirection === 0 && state.leaseExpiresTick === null && state.lastLeaseRefreshTick === null) ||
        (state.heldDirection !== 0 && integer(state.lastLeaseRefreshTick, 0, state.tick) &&
            state.leaseExpiresTick === state.lastLeaseRefreshTick! + 9), 'lease');
    fail(RELIC_IDS.includes(state.selectedRelic), 'Relic');
    fail(state.aim === null || (exactKeys(state.aim, ['angleMilliDegrees', 'powerPermille']) &&
        integer(state.aim.angleMilliDegrees, -90000, 90000) && integer(state.aim.powerPermille, 0, 1000)), 'aim');
    fail(state.aim === null || (state.aimId > 0 && state.phase === 'action' && state.heldDirection === 0 &&
        state.units.every(unit => unit.alive && unit.grounded && unit.vxFp === 0 && unit.vyFp === 0)), 'aim phase');
    fail(state.phase === 'finished' ? ['player', 'loomkeeper', 'draw'].includes(state.winner!) &&
        ['unravelled', 'turn_limit', 'simulation_limit'].includes(state.finishReason!) : state.winner === null && state.finishReason === null, 'result');
    fail(exactKeys(state.terrain, ['width', 'height', 'cellSize', 'words']) && state.terrain.width === 256 &&
        state.terrain.height === 72 && state.terrain.cellSize === 8 && Array.isArray(state.terrain.words) &&
        state.terrain.words.length === 576 && state.terrain.words.every(word => integer(word, 0, 0xffffffff)), 'terrain');
    fail(Array.isArray(state.units) && state.units.length === 2, 'units');
    for (const [index, unit] of state.units.entries()) {
        fail(exactKeys(unit, ['id', 'calling', 'xFp', 'yFp', 'vxFp', 'vyFp', 'facing', 'stitching', 'alive', 'grounded', 'support', 'airTicks', 'airDrive']), 'unit keys');
        fail(unit.id === (index === 0 ? 'player' : 'loomkeeper') && (index === 0 ? ['wizard', 'thief', 'warrior'].includes(unit.calling) : unit.calling === 'loomkeeper'), 'unit identity');
        fail(integer(unit.xFp, 12 * 256, 2036 * 256) && integer(unit.yFp, 12 * 256, 596 * 256), 'coordinate');
        fail(integer(unit.vxFp, -2048, 2048) && integer(unit.vyFp, -2048, 2048), 'velocity');
        fail(integer(unit.stitching, 0, 100) && typeof unit.alive === 'boolean' && unit.alive === (unit.stitching > 0), 'Stitching');
        fail([-1, 1].includes(unit.facing) && typeof unit.grounded === 'boolean' && integer(unit.airTicks, 0, 120), 'unit motion');
        fail(unit.airDrive === null || unit.airDrive === 'jump' || unit.airDrive === 'walk_fall', 'air drive');
        fail(unit.support === null || integer(unit.support, 0, 18431) || unit.support === 'player' || unit.support === 'loomkeeper', 'support');
        if (unit.alive) {
            fail(!terrainOverlaps(state, bodyRect(unit)), 'terrain penetration');
            fail(unit.grounded ? unit.support !== null && findSupport(state, unit) === unit.support && unit.vyFp === 0 && unit.airTicks === 0 && unit.airDrive === null
                : unit.support === null, 'ground support');
        } else fail(!unit.grounded && unit.support === null && unit.vxFp === 0 && unit.vyFp === 0 && unit.airTicks === 0 && unit.airDrive === null, 'dead motion');
    }
    fail(!state.units.every(unit => unit.alive) || !rectanglesOverlap(bodyRect(state.units[0]), bodyRect(state.units[1])), 'body penetration');
    fail((state.phase === 'projectile') === (state.projectile !== null), 'projectile phase');
    if (state.projectile) {
        const shot = state.projectile;
        fail(exactKeys(shot, ['actor', 'relicId', 'xFp', 'yFp', 'vxFp', 'vyFp', 'flightTicks', 'startX', 'startY', 'trace']), 'projectile keys');
        fail(shot.actor === state.activeActor && shot.relicId === state.selectedRelic && RELIC_IDS.includes(shot.relicId) &&
            integer(shot.flightTicks, 0, 299) && shot.flightTicks === state.tick - state.phaseStartedTick, 'projectile identity');
        fail(integer(shot.xFp, -8192, 532480) && integer(shot.yFp, -8192, 155648) &&
            integer(shot.vxFp, -5120, 5120) && integer(shot.vyFp, -5120, 29120), 'projectile motion');
        fail(integer(shot.startX, -4, 2052) && integer(shot.startY, 8, 592) && validTrace(shot.trace, 40), 'projectile trace');
    }
    if (state.lastProjectile) {
        const shot = state.lastProjectile;
        fail(exactKeys(shot, ['relicId', 'startX', 'startY', 'endX', 'endY', 'flightTicks', 'impact', 'trace']) &&
            RELIC_IDS.includes(shot.relicId!) && integer(shot.flightTicks, 1, 300) &&
            [shot.startX, shot.startY, shot.endX, shot.endY].every(value => integer(value, -4096, 4096)) &&
            ['terrain', 'player', 'loomkeeper', 'world_exit', 'lifetime'].includes(shot.impact) && validTrace(shot.trace, 41), 'last projectile');
    }
    if (!movingPhase(state)) fail(state.heldDirection === 0 && state.aim === null && state.units.every(unit => unit.vxFp === 0), 'hard boundary');
    if (state.phase === 'finished') {
        if (state.finishReason === 'simulation_limit') fail(state.winner === 'draw', 'safety result');
        if (state.finishReason === 'turn_limit') fail(state.winner === 'draw' && state.turn === 16, 'turn result');
        if (state.finishReason === 'unravelled') fail(!hasUnsupported(state) && !state.units.every(unit => unit.alive) &&
            state.winner === (state.units[0].alive ? 'player' : state.units[1].alive ? 'loomkeeper' : 'draw'), 'death result');
    }
}

const RADIUS_FP = 12 * 256;
const CELL_FP = 8 * 256;
type Rect = { left: number; right: number; top: number; bottom: number };
function activeUnit(state: SimulationStateV8): SimulationUnitV8 { return state.units[state.activeActor === 'player' ? 0 : 1]; }
function movingPhase(state: SimulationStateV8): boolean { return state.phase === 'action' || state.phase === 'retreat'; }
function integer(value: unknown, minimum: number, maximum: number): value is number {
    return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}
function exactKeys(value: unknown, keys: string[]): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const actual = Object.keys(value);
    return actual.length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}
function validIntent(intent: SimulationIntentV8): boolean {
    if (!intent || typeof intent !== 'object') return false;
    switch (intent.type) {
    case 'walk_start': case 'face': return exactKeys(intent, ['type', 'direction']) && [-1, 1].includes(intent.direction);
    case 'walk_refresh': case 'jump': return exactKeys(intent, ['type']);
    case 'select_relic': return exactKeys(intent, ['type', 'relicId']) && RELIC_IDS.includes(intent.relicId);
    case 'aim': return exactKeys(intent, ['type', 'angleMilliDegrees', 'powerPermille']) && integer(intent.angleMilliDegrees, -90000, 90000) && integer(intent.powerPermille, 0, 1000);
    case 'fire': return exactKeys(intent, ['type', 'aimId']) && integer(intent.aimId, 1, 65535);
    default: return false;
    }
}
function validTrace(trace: { x: number; y: number }[], maximum: number): boolean {
    return Array.isArray(trace) && trace.length >= 1 && trace.length <= maximum && trace.every(point =>
        exactKeys(point, ['x', 'y']) && integer(point.x, -4096, 4096) && integer(point.y, -4096, 4096));
}
function unchanged(state: SimulationStateV8): SimulationTransitionV8 { return { accepted: true, mutated: false, state, events: [] }; }
function reject(state: SimulationStateV8, code: NonNullable<SimulationTransitionV8['error']>['code'], message: string): SimulationTransitionV8 {
    return { accepted: false, mutated: false, state, events: [], error: { code, message } };
}
function countersExhausted(state: SimulationStateV8): boolean { return state.revision >= 65534 || state.inputEpoch >= 65534; }
function clearInput(state: SimulationStateV8, allBodies: boolean): void {
    state.heldDirection = 0; state.leaseExpiresTick = null; state.lastLeaseRefreshTick = null;
    state.aim = null; state.inputEpoch = Math.min(65535, state.inputEpoch + 1);
    if (allBodies) state.units.forEach(unit => { unit.vxFp = 0; });
    else activeUnit(state).vxFp = 0;
}
function expireLease(state: SimulationStateV8, events: SimulationEventV8[]): void {
    if (state.leaseExpiresTick !== null && state.tick >= state.leaseExpiresTick) {
        const unit = activeUnit(state); const jumpVx = unit.airDrive === 'jump' ? unit.vxFp : 0;
        clearInput(state, false); unit.vxFp = jumpVx;
        events.push({ type: 'input_barrier', reason: 'lease_expired', tick: state.tick });
    }
}
function bodyRect(unit: SimulationUnitV8): Rect {
    return { left: unit.xFp - RADIUS_FP, right: unit.xFp + RADIUS_FP,
        top: unit.yFp - RADIUS_FP, bottom: unit.yFp + RADIUS_FP };
}
function rectanglesOverlap(a: Rect, b: Rect): boolean {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
function terrainRects(state: SimulationStateV8, rect: Rect, visit: (obstacle: Rect) => void): void {
    const left = Math.max(0, Math.floor(rect.left / CELL_FP));
    const right = Math.min(255, Math.ceil(rect.right / CELL_FP) - 1);
    const top = Math.max(0, Math.floor(rect.top / CELL_FP));
    const bottom = Math.min(71, Math.ceil(rect.bottom / CELL_FP) - 1);
    for (let cy = top; cy <= bottom; cy += 1) for (let cx = left; cx <= right; cx += 1) {
        if (terrainSolid(state.terrain, cx, cy)) visit({ left: cx * CELL_FP, right: (cx + 1) * CELL_FP,
            top: cy * CELL_FP, bottom: (cy + 1) * CELL_FP });
    }
}
function terrainOverlaps(state: SimulationStateV8, rect: Rect): boolean {
    let result = false; terrainRects(state, rect, obstacle => { if (rectanglesOverlap(rect, obstacle)) result = true; });
    return result;
}
/** A bounded swept rectangle, terrain first then stable actor ID. No endpoint sampling. */
function sweep(state: SimulationStateV8, unit: SimulationUnitV8, axis: 'x' | 'y', delta: number): number {
    if (delta === 0) return 0;
    const body = bodyRect(unit);
    const area = { ...body };
    if (axis === 'x') { area.left += Math.min(0, delta); area.right += Math.max(0, delta); }
    else { area.top += Math.min(0, delta); area.bottom += Math.max(0, delta); }
    let clipped = delta;
    if (axis === 'x') clipped = Math.max(12 * 256 - unit.xFp, Math.min(2036 * 256 - unit.xFp, clipped));
    else if (delta < 0) clipped = Math.max(12 * 256 - unit.yFp, clipped);
    const inspect = (obstacle: Rect): void => {
        const overlap = axis === 'x' ? body.top < obstacle.bottom && body.bottom > obstacle.top
            : body.left < obstacle.right && body.right > obstacle.left;
        if (!overlap) return;
        const start = axis === 'x' ? body.left : body.top;
        const end = axis === 'x' ? body.right : body.bottom;
        const near = axis === 'x' ? obstacle.left : obstacle.top;
        const far = axis === 'x' ? obstacle.right : obstacle.bottom;
        if (delta > 0 && near >= end && near - end < clipped) clipped = near - end;
        if (delta < 0 && far <= start && far - start > clipped) clipped = far - start;
    };
    terrainRects(state, area, inspect);
    for (const other of state.units) if (other.alive && other.id !== unit.id) inspect(bodyRect(other));
    return clipped;
}
function findSupport(state: SimulationStateV8, unit: SimulationUnitV8): SimulationUnitV8['support'] {
    const rect = bodyRect(unit);
    if (rect.bottom % CELL_FP === 0) {
        const cy = rect.bottom / CELL_FP;
        const first = Math.max(0, Math.floor(rect.left / CELL_FP));
        const last = Math.min(255, Math.ceil(rect.right / CELL_FP) - 1);
        for (let cx = first; cx <= last; cx += 1) if (terrainSolid(state.terrain, cx, cy)) return cy * 256 + cx;
    }
    for (const other of state.units) {
        if (other.id === unit.id || !other.alive || !other.grounded) continue;
        const floor = bodyRect(other);
        if (rect.bottom === floor.top && rect.left < floor.right && rect.right > floor.left) return other.id;
    }
    return null;
}
function orderedBodies(state: SimulationStateV8): SimulationUnitV8[] {
    return [...state.units].sort((a, b) => b.yFp - a.yFp || (a.id === 'player' ? -1 : 1));
}
function land(unit: SimulationUnitV8, support: NonNullable<SimulationUnitV8['support']>): void {
    unit.grounded = true; unit.support = support; unit.vxFp = 0; unit.vyFp = 0;
    unit.airTicks = 0; unit.airDrive = null;
}
function reevaluateSupports(state: SimulationStateV8): void {
    for (const unit of orderedBodies(state)) {
        if (!unit.alive) {
            unit.grounded = false; unit.support = null; unit.vxFp = 0; unit.vyFp = 0;
            unit.airTicks = 0; unit.airDrive = null; continue;
        }
        const support = unit.vyFp < 0 ? null : findSupport(state, unit);
        if (support !== null) {
            if (!unit.grounded) land(unit, support); else unit.support = support;
        } else {
            if (unit.grounded) { unit.airTicks = 0; unit.airDrive = 'walk_fall'; }
            unit.grounded = false; unit.support = null;
        }
    }
}
function integrateBodies(state: SimulationStateV8): void {
    reevaluateSupports(state);
    for (const unit of orderedBodies(state)) {
        if (!unit.alive) continue;
        if (!movingPhase(state) || unit.id !== state.activeActor) unit.vxFp = 0;
        else if (unit.grounded) unit.vxFp = state.heldDirection * 256;
        const grounded = unit.grounded;
        const wanted = unit.vxFp;
        let dx = sweep(state, unit, 'x', wanted);
        if (grounded && dx !== wanted && wanted !== 0 && sweep(state, unit, 'y', -CELL_FP) === -CELL_FP) {
            const lifted = { ...unit, yFp: unit.yFp - CELL_FP };
            if (sweep(state, lifted, 'x', wanted) === wanted) {
                lifted.xFp += wanted;
                const support = findSupport(state, lifted);
                if (support !== null) { unit.yFp = lifted.yFp; unit.support = support; dx = wanted; }
            }
        }
        unit.xFp += dx;
        if (dx !== wanted) unit.vxFp = 0;
        if (dx !== 0) state.aim = null;
        if (unit.grounded) {
            unit.support = findSupport(state, unit);
            if (unit.support === null) { unit.grounded = false; unit.airTicks = 0; unit.airDrive = 'walk_fall'; }
        }
        if (!unit.grounded) {
            unit.airTicks += 1;
            unit.vyFp = Math.min(unit.vyFp + 64, 2048);
            const dy = sweep(state, unit, 'y', unit.vyFp);
            unit.yFp += dy;
            const wasDownward = unit.vyFp >= 0;
            if (dy !== unit.vyFp) unit.vyFp = 0;
            const support = wasDownward ? findSupport(state, unit) : null;
            if (support !== null) land(unit, support);
        }
    }
}
function removeBelowWorld(state: SimulationStateV8): void {
    for (const unit of state.units) if (unit.alive && unit.yFp - RADIUS_FP >= 576 * 256) {
        unit.alive = false; unit.stitching = 0;
    }
    reevaluateSupports(state);
}
function hasUnsupported(state: SimulationStateV8): boolean { return state.units.some(unit => unit.alive && !unit.grounded); }
function deathResult(state: SimulationStateV8, events: SimulationEventV8[]): boolean {
    if (state.units.every(unit => unit.alive) || hasUnsupported(state)) return false;
    finish(state, state.units[0].alive ? 'player' : state.units[1].alive ? 'loomkeeper' : 'draw', 'unravelled', events);
    return true;
}
function resolveBodyBoundaries(state: SimulationStateV8, events: SimulationEventV8[]): void {
    removeBelowWorld(state);
    if (deathResult(state, events)) return;
    if (state.units.some(unit => unit.alive && !unit.grounded && unit.airTicks >= 120)) {
        finish(state, 'draw', 'simulation_limit', events); return;
    }
    if (state.phase === 'settling' && !hasUnsupported(state)) {
        if (state.settleReason === 'post_shot') enterPhase(state, 'retreat', 60, null, events);
        else handover(state, events);
    } else if (state.phase !== 'settling' && state.units.some(unit => !unit.alive)) {
        enterPhase(state, 'settling', 120, 'death', events);
    }
}
function resolvePhaseDeadline(state: SimulationStateV8, events: SimulationEventV8[]): void {
    if (state.tick < state.phaseDeadlineTick) return;
    if (state.phase === 'action' || state.phase === 'retreat') {
        if (hasUnsupported(state)) enterPhase(state, 'settling', 120,
            state.phase === 'action' ? 'action_timeout' : 'retreat_timeout', events);
        else handover(state, events);
    } else if (state.phase === 'settling') finish(state, 'draw', 'simulation_limit', events);
}
function enterPhase(state: SimulationStateV8, phase: SimulationPhaseV8, ticks: number,
    reason: SettleReasonV8 | null, events: SimulationEventV8[]): void {
    clearInput(state, true); state.phase = phase; state.phaseStartedTick = state.tick;
    state.phaseDeadlineTick = state.tick + ticks; state.settleReason = reason;
    events.push({ type: 'input_barrier', reason: 'phase', tick: state.tick });
    events.push({ type: 'phase_changed', phase, tick: state.tick });
}
function handover(state: SimulationStateV8, events: SimulationEventV8[]): void {
    if (deathResult(state, events)) return;
    state.turn += 1;
    if (state.turn >= 16) { finish(state, 'draw', 'turn_limit', events); return; }
    state.activeActor = state.activeActor === 'player' ? 'loomkeeper' : 'player';
    state.castUsed = false; state.acceptedIntentCount = 0;
    enterPhase(state, 'action', 450, null, events);
}
function finish(state: SimulationStateV8, winner: SimulationWinner,
    reason: NonNullable<SimulationStateV8['finishReason']>, events: SimulationEventV8[]): void {
    if (state.phase === 'finished') return;
    state.projectile = null;
    enterPhase(state, 'finished', 0, null, events);
    state.winner = winner; state.finishReason = reason;
    events.push({ type: 'finished', winner, reason });
}

// The following launch/sweep/radial expressions preserve the MIT product's V5/V7
// math in shared/simulation.ts. Only flight scheduling and physical settling differ.
function launchProjectile(state: SimulationStateV8): ProjectileV8 {
    const unit = activeUnit(state); const aim = state.aim!;
    const band = V5_LAUNCH_SPEED_RULES[state.selectedRelic];
    const speed = band.minimumShotSpeed + Math.trunc((band.maximumShotSpeed - band.minimumShotSpeed) * aim.powerPermille / 1000);
    const startX = Math.floor(unit.xFp / 256) + unit.facing * 16;
    const startY = Math.floor(unit.yFp / 256) - 4;
    return { actor: unit.id, relicId: state.selectedRelic,
        xFp: startX * 256, yFp: startY * 256,
        vxFp: Math.trunc(speed * (90000 - Math.abs(aim.angleMilliDegrees)) / 90000) * unit.facing,
        vyFp: -Math.trunc(speed * aim.angleMilliDegrees / 90000), flightTicks: 0,
        startX, startY, trace: [{ x: startX, y: startY }] };
}
function projectileCollision(state: SimulationStateV8, shot: ProjectileV8, oldX: number, oldY: number):
    { x: number; y: number; target: ProjectileSummary['impact'] } | null {
    const hitbox = directProjectileHitboxFor(V7_RULESET_ID);
    const x0 = Math.trunc(oldX / 256); const y0 = Math.trunc(oldY / 256);
    const x1 = Math.trunc(shot.xFp / 256); const y1 = Math.trunc(shot.yFp / 256);
    const steps = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let step = 1; step <= steps; step += 1) {
        const x = x0 + Math.trunc((x1 - x0) * step / steps);
        const y = y0 + Math.trunc((y1 - y0) * step / steps);
        for (const unit of state.units) {
            if (!unit.alive || (unit.id === shot.actor && shot.flightTicks <= 3)) continue;
            const rootX = Math.floor(unit.xFp / 256); const rootY = Math.floor(unit.yFp / 256);
            if (Math.abs(rootX - x) <= hitbox.halfWidth && y >= rootY - hitbox.top && y <= rootY + hitbox.bottom) return { x, y, target: unit.id };
        }
        if (terrainSolid(state.terrain, Math.trunc(x / 8), Math.trunc(y / 8))) return { x, y, target: 'terrain' };
    }
    return null;
}
function advanceProjectile(state: SimulationStateV8, events: SimulationEventV8[]): void {
    const shot = state.projectile!;
    const oldX = shot.xFp; const oldY = shot.yFp;
    shot.vyFp += 80; shot.xFp += shot.vxFp; shot.yFp += shot.vyFp; shot.flightTicks += 1;
    const collision = projectileCollision(state, shot, oldX, oldY);
    const x = collision?.x ?? Math.trunc(shot.xFp / 256);
    const y = collision?.y ?? Math.trunc(shot.yFp / 256);
    if (shot.flightTicks % 8 === 0 && shot.trace.length < 40) shot.trace.push({ x, y });
    const impact = collision?.target ?? (x < 0 || x >= 2048 || y < 0 || y >= 576 ? 'world_exit' :
        shot.flightTicks >= 300 ? 'lifetime' : null);
    if (!impact) return;
    shot.trace.push({ x, y });
    state.lastProjectile = { relicId: shot.relicId, startX: shot.startX, startY: shot.startY,
        endX: x, endY: y, flightTicks: shot.flightTicks, impact, trace: shot.trace.map(point => ({ ...point })) };
    events.push({ type: 'impact', x, y, target: impact });
    if (impact !== 'world_exit' && impact !== 'lifetime') {
        const relic = V5_RELIC_RULES[shot.relicId];
        deformTerrain(state.terrain, x, y, relic.craterRadius);
        for (const unit of state.units) {
            if (!unit.alive) continue;
            const dx = Math.floor(unit.xFp / 256) - x; const dy = Math.floor(unit.yFp / 256) - y;
            const distanceSquared = dx * dx + dy * dy;
            const direct = impact === unit.id;
            if (!direct && distanceSquared > relic.damageRadius * relic.damageRadius) continue;
            const distance = integerSquareRoot(distanceSquared);
            const amount = direct ? relic.maximumDamage : Math.max(1,
                Math.trunc((relic.damageRadius - distance) * relic.maximumDamage / relic.damageRadius));
            unit.stitching = Math.max(0, unit.stitching - amount); unit.alive = unit.stitching > 0;
            events.push({ type: 'damaged', actor: unit.id, amount, stitching: unit.stitching });
        }
    }
    state.projectile = null; removeBelowWorld(state);
    if (deathResult(state, events)) return;
    if (hasUnsupported(state)) enterPhase(state, 'settling', 120, 'post_shot', events);
    else enterPhase(state, 'retreat', 60, null, events);
}
function integerSquareRoot(value: number): number {
    let low = 1; let high = Math.min(value, 88); let result = 0;
    while (low <= high) {
        const middle = Math.trunc((low + high) / 2);
        if (middle * middle <= value) { result = middle; low = middle + 1; } else high = middle - 1;
    }
    return result;
}
function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value !== null && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
