export const RULESET_ID = 'nimble-knots-artillery-v1' as const;
export const RULESET_VERSION = 1 as const;
export const LEGACY_RULESET_ID = RULESET_ID;
export const V2_RULESET_ID = 'nimble-knots-artillery-v2' as const;
export const V2_RULESET_VERSION = 2 as const;
export const V3_RULESET_ID = 'nimble-knots-artillery-v3' as const;
export const V3_RULESET_VERSION = 3 as const;
export const V4_RULESET_ID = 'nimble-knots-artillery-v4' as const;
export const V4_RULESET_VERSION = 4 as const;
export const LATEST_RULESET_ID = V4_RULESET_ID;
export const LATEST_RULESET_VERSION = V4_RULESET_VERSION;

export type SimulationRulesetId =
    | typeof RULESET_ID
    | typeof V2_RULESET_ID
    | typeof V3_RULESET_ID
    | typeof LATEST_RULESET_ID;
export type RelicId = 'threadball' | 'needlepoint' | 'spoolburst';

export const RELIC_IDS = Object.freeze([
    'threadball',
    'needlepoint',
    'spoolburst'
] as const);

export const RELIC_RULES: Readonly<Record<RelicId, {
    craterRadius: number;
    damageRadius: number;
    maximumDamage: number;
}>> = Object.freeze({
    threadball: Object.freeze({ craterRadius: 40, damageRadius: 64, maximumDamage: 70 }),
    needlepoint: Object.freeze({ craterRadius: 16, damageRadius: 32, maximumDamage: 120 }),
    spoolburst: Object.freeze({ craterRadius: 64, damageRadius: 88, maximumDamage: 45 })
});

export const SIM_RULES = Object.freeze({
    worldWidth: 1024,
    worldHeight: 576,
    terrainCellSize: 8,
    terrainWidth: 128,
    terrainHeight: 72,
    fixedPointScale: 256,
    tickRate: 30,
    turnTicks: 900,
    projectileTicks: 300,
    maximumTurns: 16,
    maximumReplayEntries: 2048,
    maximumStitching: 100,
    movementPerTurn: 64,
    movementStep: 8,
    maximumClimb: 24,
    actorRadius: 12,
    craterRadius: 40,
    damageRadius: 64,
    maximumDamage: 70,
    gravityPerTick: 80,
    minimumShotSpeed: 1536,
    maximumShotSpeed: 5120
});

export type ArenaRules = Readonly<{
    worldWidth: number;
    worldHeight: number;
    terrainCellSize: number;
    terrainWidth: number;
    terrainHeight: number;
    playerSpawnX: number;
    loomkeeperSpawnX: number;
}>;

/** V1/V2/V3's immutable 1024 by 576 terrain contract. */
export const HISTORICAL_ARENA_RULES: ArenaRules = Object.freeze({
    worldWidth: SIM_RULES.worldWidth,
    worldHeight: SIM_RULES.worldHeight,
    terrainCellSize: SIM_RULES.terrainCellSize,
    terrainWidth: SIM_RULES.terrainWidth,
    terrainHeight: SIM_RULES.terrainHeight,
    playerSpawnX: 192,
    loomkeeperSpawnX: 832
});

/**
 * V4 doubles horizontal simulation space without changing vertical physics or
 * the V3 reachable 640-unit opening duel. Presentation owns its camera; this
 * remains authoritative replay data only through the ruleset/terrain state.
 */
export const V4_ARENA_RULES: ArenaRules = Object.freeze({
    worldWidth: 2048,
    worldHeight: 576,
    terrainCellSize: 8,
    terrainWidth: 256,
    terrainHeight: 72,
    playerSpawnX: 512,
    loomkeeperSpawnX: 1152
});

export function arenaRulesFor(rulesetId: SimulationRulesetId): ArenaRules {
    return rulesetId === V4_RULESET_ID ? V4_ARENA_RULES : HISTORICAL_ARENA_RULES;
}

export type DirectProjectileHitbox = Readonly<{
    halfWidth: number;
    top: number;
    bottom: number;
}>;

/**
 * V1/V2 retain the original 24 by 24 direct-hit square centred on the unit.
 * V3 records the historical shared-Wizard direct target in fixed world units.
 * It is deliberately code-owned replay data, never runtime image analysis or
 * a dependency on presentation scale. Later visual-only scaling must retain
 * this historical profile unless a separately versioned ruleset is approved.
 */
export const DIRECT_PROJECTILE_HITBOXES: Readonly<Record<SimulationRulesetId, DirectProjectileHitbox>> = Object.freeze({
    [LEGACY_RULESET_ID]: Object.freeze({
        halfWidth: SIM_RULES.actorRadius,
        top: SIM_RULES.actorRadius,
        bottom: SIM_RULES.actorRadius
    }),
    [V2_RULESET_ID]: Object.freeze({
        halfWidth: SIM_RULES.actorRadius,
        top: SIM_RULES.actorRadius,
        bottom: SIM_RULES.actorRadius
    }),
    [V3_RULESET_ID]: Object.freeze({ halfWidth: 32, top: 85, bottom: 13 }),
    [V4_RULESET_ID]: Object.freeze({ halfWidth: 32, top: 85, bottom: 13 })
});

export type SimulationActor = 'player' | 'loomkeeper';
export type PlayerCalling = 'wizard' | 'thief' | 'warrior';
export type SimulationWinner = SimulationActor | 'draw';

export type SimulationCommand =
    | { type: 'move'; direction: -1 | 0 | 1 }
    | { type: 'select_relic'; relicId: string }
    | { type: 'aim'; angleMilliDegrees: number; powerPermille: number }
    | { type: 'fire' };

export type SimulationUnit = {
    id: SimulationActor;
    calling: PlayerCalling | 'loomkeeper';
    x: number;
    y: number;
    facing: -1 | 1;
    stitching: number;
    alive: boolean;
};

export type PackedTerrain = {
    width: number;
    height: number;
    cellSize: number;
    words: number[];
};

export type ProjectileSummary = {
    relicId?: RelicId;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    flightTicks: number;
    impact: 'terrain' | 'player' | 'loomkeeper' | 'world_exit' | 'lifetime';
    trace: { x: number; y: number }[];
};

export type SimulationState = {
    formatVersion: 1 | 2 | 3 | 4;
    rulesetId: SimulationRulesetId;
    rulesetVersion: 1 | 2 | 3 | 4;
    seed: number;
    rngState: number;
    tick: number;
    revision: number;
    turn: number;
    activeActor: SimulationActor;
    turnDeadlineTick: number;
    phase: 'awaiting_command' | 'finished';
    winner: SimulationWinner | null;
    finishReason: 'unravelled' | 'turn_limit' | null;
    movementRemaining: number;
    selectedRelic: RelicId;
    aim: { angleMilliDegrees: number; powerPermille: number } | null;
    units: [SimulationUnit, SimulationUnit];
    terrain: PackedTerrain;
    lastProjectile: ProjectileSummary | null;
};

export type SimulationEvent =
    | { type: 'moved'; actor: SimulationActor; x: number; y: number }
    | { type: 'aimed'; actor: SimulationActor; angleMilliDegrees: number; powerPermille: number }
    | { type: 'relic_selected'; actor: SimulationActor; relicId: RelicId }
    | { type: 'projectile'; actor: SimulationActor; trace: { x: number; y: number }[] }
    | { type: 'impact'; x: number; y: number; target: ProjectileSummary['impact'] }
    | { type: 'damaged'; actor: SimulationActor; amount: number; stitching: number }
    | { type: 'turn_changed'; turn: number; actor: SimulationActor; reason: 'shot' | 'timeout' }
    | { type: 'finished'; winner: SimulationWinner; reason: 'unravelled' | 'turn_limit' };

export type SimulationError = {
    code: 'COMMAND_REJECTED' | 'NOT_YOUR_TURN' | 'LATE_TURN';
    message: string;
};

export type SimulationTransition = {
    accepted: boolean;
    mutated: boolean;
    state: SimulationState;
    events: SimulationEvent[];
    error?: SimulationError;
};

export function createSimulation(
    seed: number,
    calling: PlayerCalling,
    rulesetId: SimulationRulesetId = LEGACY_RULESET_ID
): SimulationState {
    const normalizedSeed = normalizeSeed(seed);
    const arena = arenaRulesFor(rulesetId);
    const generated = generateTerrain(normalizedSeed, arena);
    const playerX = arena.playerSpawnX;
    const loomkeeperX = arena.loomkeeperSpawnX;
    const state: SimulationState = {
        formatVersion: rulesetVersionFor(rulesetId),
        rulesetId,
        rulesetVersion: rulesetVersionFor(rulesetId),
        seed: normalizedSeed,
        rngState: generated.rngState,
        tick: 0,
        revision: 0,
        turn: 0,
        activeActor: 'player',
        turnDeadlineTick: SIM_RULES.turnTicks,
        phase: 'awaiting_command',
        winner: null,
        finishReason: null,
        movementRemaining: SIM_RULES.movementPerTurn,
        selectedRelic: 'threadball',
        aim: null,
        units: [
            unitAt('player', calling, playerX, 1, generated.terrain),
            unitAt('loomkeeper', 'loomkeeper', loomkeeperX, -1, generated.terrain)
        ],
        terrain: generated.terrain,
        lastProjectile: null
    };
    assertSimulationInvariants(state);
    return state;
}

export function createLatestSimulation(seed: number, calling: PlayerCalling): SimulationState {
    return createSimulation(seed, calling, LATEST_RULESET_ID);
}

export function applySimulationCommand(
    current: SimulationState,
    actor: SimulationActor,
    command: SimulationCommand,
    expectedTurn: number
): SimulationTransition {
    if (current.phase === 'finished') {
        return rejected(current, 'COMMAND_REJECTED', 'The match is already finished.');
    }
    if (expectedTurn !== current.turn) {
        return rejected(current, 'LATE_TURN', 'The command targets a different turn.');
    }
    if (actor !== current.activeActor) {
        return rejected(current, 'NOT_YOUR_TURN', 'The actor does not own the active turn.');
    }

    const state = cloneSimulation(current);
    const events: SimulationEvent[] = [];
    if (command.type === 'move') {
        const moved = moveUnit(state, actor, command.direction);
        if (moved.accepted === false) {
            return rejected(current, 'COMMAND_REJECTED', moved.message);
        }
        events.push({ type: 'moved', actor, x: moved.unit.x, y: moved.unit.y });
    } else if (command.type === 'select_relic') {
        const relicId = command.relicId as RelicId;
        if (!availableRelics(state).includes(relicId)) {
            return rejected(current, 'COMMAND_REJECTED', 'The Relic is not available in this ruleset.');
        }
        state.selectedRelic = relicId;
        events.push({ type: 'relic_selected', actor, relicId });
    } else if (command.type === 'aim') {
        if (!Number.isSafeInteger(command.angleMilliDegrees) ||
            !Number.isSafeInteger(command.powerPermille) ||
            command.angleMilliDegrees < -90_000 ||
            command.angleMilliDegrees > 90_000 ||
            command.powerPermille < 0 ||
            command.powerPermille > 1_000) {
            return rejected(current, 'COMMAND_REJECTED', 'Aim values must be bounded integers.');
        }
        state.aim = {
            angleMilliDegrees: command.angleMilliDegrees,
            powerPermille: command.powerPermille
        };
        events.push({ type: 'aimed', actor, ...state.aim });
    } else {
        if (!state.aim) {
            return rejected(current, 'COMMAND_REJECTED', 'Aim must be locked before firing.');
        }
        resolveProjectile(state, actor, events);
    }

    state.revision += 1;
    assertSimulationInvariants(state);
    return { accepted: true, mutated: true, state, events };
}

export function advanceSimulationTicks(
    current: SimulationState,
    count: number
): SimulationTransition {
    if (!Number.isSafeInteger(count) || count < 0) {
        return rejected(current, 'COMMAND_REJECTED', 'Tick count must be a non-negative integer.');
    }
    if (count === 0 || current.phase === 'finished') {
        return { accepted: true, mutated: false, state: cloneSimulation(current), events: [] };
    }
    const state = cloneSimulation(current);
    const events: SimulationEvent[] = [];
    const target = Math.min(Number.MAX_SAFE_INTEGER, state.tick + count);
    while (state.phase !== 'finished' && target >= state.turnDeadlineTick) {
        state.tick = state.turnDeadlineTick;
        changeTurn(state, events, 'timeout');
        state.revision += 1;
    }
    if (state.phase !== 'finished') state.tick = target;
    assertSimulationInvariants(state);
    return { accepted: true, mutated: true, state, events };
}

export function canonicalSimulationJson(state: SimulationState): string {
    return canonicalJson(state);
}

export function cloneSimulation(state: SimulationState): SimulationState {
    return {
        ...state,
        aim: state.aim ? { ...state.aim } : null,
        units: [{ ...state.units[0] }, { ...state.units[1] }],
        terrain: { ...state.terrain, words: [...state.terrain.words] },
        lastProjectile: state.lastProjectile
            ? {
                ...state.lastProjectile,
                trace: state.lastProjectile.trace.map((point) => ({ ...point }))
            }
            : null
    };
}

export function relicsForRuleset(rulesetId: SimulationRulesetId): readonly RelicId[] {
    return rulesetId === LEGACY_RULESET_ID ? ['threadball'] : RELIC_IDS;
}

export function directProjectileHitboxFor(rulesetId: SimulationRulesetId): DirectProjectileHitbox {
    return DIRECT_PROJECTILE_HITBOXES[rulesetId];
}

function availableRelics(state: SimulationState): readonly RelicId[] {
    return relicsForRuleset(state.rulesetId);
}

export function terrainSolid(terrain: PackedTerrain, x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= terrain.width || y >= terrain.height) return false;
    const index = y * terrain.width + x;
    return Boolean(terrain.words[index >>> 5] & (1 << (index & 31)));
}

export function setTerrainSolid(
    terrain: PackedTerrain,
    x: number,
    y: number,
    solid: boolean
): void {
    if (x < 0 || y < 0 || x >= terrain.width || y >= terrain.height) return;
    const index = y * terrain.width + x;
    const word = index >>> 5;
    const mask = 1 << (index & 31);
    terrain.words[word] = (solid
        ? terrain.words[word] | mask
        : terrain.words[word] & ~mask) >>> 0;
}

export function deformTerrain(terrain: PackedTerrain, centerX: number, centerY: number, radius: number): void {
    const cellSize = terrain.cellSize;
    const minX = Math.max(0, Math.trunc((centerX - radius) / cellSize));
    const maxX = Math.min(terrain.width - 1, Math.trunc((centerX + radius) / cellSize));
    const minY = Math.max(0, Math.trunc((centerY - radius) / cellSize));
    const maxY = Math.min(terrain.height - 1, Math.trunc((centerY + radius) / cellSize));
    const radiusSquared = radius * radius;
    for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
            const dx = x * cellSize + Math.trunc(cellSize / 2) - centerX;
            const dy = y * cellSize + Math.trunc(cellSize / 2) - centerY;
            if (dx * dx + dy * dy <= radiusSquared) setTerrainSolid(terrain, x, y, false);
        }
    }
}

export function assertSimulationInvariants(state: SimulationState): void {
    const legacy = state.rulesetId === LEGACY_RULESET_ID &&
        state.rulesetVersion === 1 && state.formatVersion === 1;
    const v2 = state.rulesetId === V2_RULESET_ID &&
        state.rulesetVersion === V2_RULESET_VERSION && state.formatVersion === 2;
    const v3 = state.rulesetId === V3_RULESET_ID &&
        state.rulesetVersion === V3_RULESET_VERSION && state.formatVersion === 3;
    const v4 = state.rulesetId === V4_RULESET_ID &&
        state.rulesetVersion === V4_RULESET_VERSION && state.formatVersion === 4;
    if (!legacy && !v2 && !v3 && !v4) {
        throw new Error('Unknown deterministic simulation ruleset.');
    }
    if (!availableRelics(state).includes(state.selectedRelic)) {
        throw new Error('Selected Relic is unavailable in this ruleset.');
    }
    if (state.lastProjectile && (v2 || v3 || v4) && !state.lastProjectile.relicId) {
        throw new Error('Current-ruleset projectile lacks its Relic identifier.');
    }
    if (state.lastProjectile && legacy && state.lastProjectile.relicId) {
        throw new Error('Legacy projectile contains a current-ruleset field.');
    }
    const arena = arenaRulesFor(state.rulesetId);
    const expectedWords = Math.ceil(arena.terrainWidth * arena.terrainHeight / 32);
    if (state.terrain.width !== arena.terrainWidth || state.terrain.height !== arena.terrainHeight ||
        state.terrain.cellSize !== arena.terrainCellSize || state.terrain.words.length !== expectedWords) {
        throw new Error('Terrain dimensions changed for this ruleset.');
    }
    const integers: number[] = [
        state.seed, state.rngState, state.tick, state.revision, state.turn,
        state.turnDeadlineTick, state.movementRemaining,
        ...state.terrain.words,
        ...state.units.flatMap((unit) => [unit.x, unit.y, unit.stitching])
    ];
    if (state.aim) integers.push(state.aim.angleMilliDegrees, state.aim.powerPermille);
    if (integers.some((value) => !Number.isSafeInteger(value) || Object.is(value, -0))) {
        throw new Error('Simulation state contains a non-canonical number.');
    }
    if (state.units.some((unit) => unit.stitching < 0 || unit.stitching > SIM_RULES.maximumStitching)) {
        throw new Error('Stitching is outside the ruleset bounds.');
    }
    if (state.phase === 'finished' && (!state.winner || !state.finishReason)) {
        throw new Error('Finished state lacks a result.');
    }
    if (state.phase !== 'finished' && (state.winner || state.finishReason)) {
        throw new Error('Active state contains a terminal result.');
    }
}

function normalizeSeed(seed: number): number {
    if (!Number.isSafeInteger(seed)) throw new Error('Simulation seed must be an integer.');
    const normalized = seed >>> 0;
    return normalized === 0 ? 0x6D2B79F5 : normalized;
}

function rulesetVersionFor(rulesetId: SimulationRulesetId): 1 | 2 | 3 | 4 {
    if (rulesetId === LEGACY_RULESET_ID) return RULESET_VERSION;
    if (rulesetId === V2_RULESET_ID) return V2_RULESET_VERSION;
    if (rulesetId === V3_RULESET_ID) return V3_RULESET_VERSION;
    return V4_RULESET_VERSION;
}

function nextRandom(state: number): number {
    let value = state >>> 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return value >>> 0;
}

function generateTerrain(seed: number, arena: ArenaRules): { terrain: PackedTerrain; rngState: number } {
    const words = new Array(Math.ceil(arena.terrainWidth * arena.terrainHeight / 32)).fill(0);
    const terrain: PackedTerrain = {
        width: arena.terrainWidth,
        height: arena.terrainHeight,
        cellSize: arena.terrainCellSize,
        words
    };
    let rngState = seed;
    let surface = 44;
    for (let x = 0; x < terrain.width; x += 1) {
        if (x % 4 === 0) {
            rngState = nextRandom(rngState);
            surface = clamp(surface + Number(rngState % 3) - 1, 36, 50);
        }
        for (let y = surface; y < terrain.height; y += 1) setTerrainSolid(terrain, x, y, true);
    }
    return { terrain, rngState };
}

function unitAt(
    id: SimulationActor,
    calling: PlayerCalling | 'loomkeeper',
    x: number,
    facing: -1 | 1,
    terrain: PackedTerrain
): SimulationUnit {
    return {
        id,
        calling,
        x,
        y: surfaceY(terrain, x) - SIM_RULES.actorRadius,
        facing,
        stitching: SIM_RULES.maximumStitching,
        alive: true
    };
}

function moveUnit(
    state: SimulationState,
    actor: SimulationActor,
    direction: -1 | 0 | 1
): { accepted: true; unit: SimulationUnit } | { accepted: false; message: string } {
    const unit = state.units[actor === 'player' ? 0 : 1];
    if (!unit.alive) return { accepted: false, message: 'Unravelled actors cannot move.' };
    if (direction === 0) {
        settleUnit(state, unit);
        return { accepted: true, unit };
    }
    if (state.movementRemaining < SIM_RULES.movementStep) {
        return { accepted: false, message: 'The movement budget is exhausted.' };
    }
    const targetX = clamp(
        unit.x + direction * SIM_RULES.movementStep,
        SIM_RULES.actorRadius,
        worldWidth(state.terrain) - SIM_RULES.actorRadius - 1
    );
    const targetY = surfaceY(state.terrain, targetX) - SIM_RULES.actorRadius;
    if (Math.abs(targetY - unit.y) > SIM_RULES.maximumClimb) {
        return { accepted: false, message: 'The terrain is too steep.' };
    }
    const other = state.units[actor === 'player' ? 1 : 0];
    if (other.alive && Math.abs(other.x - targetX) < SIM_RULES.actorRadius * 2 &&
        Math.abs(other.y - targetY) < SIM_RULES.actorRadius * 2) {
        return { accepted: false, message: 'The movement path is occupied.' };
    }
    unit.x = targetX;
    unit.y = targetY;
    unit.facing = direction;
    state.movementRemaining -= SIM_RULES.movementStep;
    return { accepted: true, unit };
}

function resolveProjectile(
    state: SimulationState,
    actor: SimulationActor,
    events: SimulationEvent[]
): void {
    const shooter = state.units[actor === 'player' ? 0 : 1];
    const scale = SIM_RULES.fixedPointScale;
    const aim = state.aim!;
    const relicId = state.selectedRelic;
    const relicRules = RELIC_RULES[relicId];
    const speed = SIM_RULES.minimumShotSpeed + Math.trunc(
        (SIM_RULES.maximumShotSpeed - SIM_RULES.minimumShotSpeed) * aim.powerPermille / 1000
    );
    const horizontal = 90_000 - Math.abs(aim.angleMilliDegrees);
    let vx = Math.trunc(speed * horizontal / 90_000) * shooter.facing;
    let vy = -Math.trunc(speed * aim.angleMilliDegrees / 90_000);
    let x = (shooter.x + shooter.facing * (SIM_RULES.actorRadius + 4)) * scale;
    let y = (shooter.y - 4) * scale;
    const startX = Math.trunc(x / scale);
    const startY = Math.trunc(y / scale);
    const trace: { x: number; y: number }[] = [{ x: startX, y: startY }];
    let impact: ProjectileSummary['impact'] = 'lifetime';
    let endX = startX;
    let endY = startY;
    let flightTicks = 0;
    let directTarget: SimulationActor | undefined;
    for (let tick = 1; tick <= SIM_RULES.projectileTicks; tick += 1) {
        const oldX = x;
        const oldY = y;
        vy += SIM_RULES.gravityPerTick;
        x += vx;
        y += vy;
        state.tick += 1;
        flightTicks = tick;
        const collision = sweptCollision(state, actor, oldX, oldY, x, y, tick);
        endX = collision?.x ?? Math.trunc(x / scale);
        endY = collision?.y ?? Math.trunc(y / scale);
        if (tick % 8 === 0 && trace.length < 40) trace.push({ x: endX, y: endY });
        if (collision) {
            impact = collision.target;
            if ((state.rulesetId === V3_RULESET_ID || state.rulesetId === V4_RULESET_ID) &&
                (collision.target === 'player' || collision.target === 'loomkeeper')) {
                directTarget = collision.target;
            }
            break;
        }
        if (endX < 0 || endX >= worldWidth(state.terrain) || endY < 0 || endY >= worldHeight(state.terrain)) {
            impact = 'world_exit';
            break;
        }
    }
    trace.push({ x: endX, y: endY });
    state.lastProjectile = {
        ...(state.rulesetId !== LEGACY_RULESET_ID ? { relicId } : {}),
        startX, startY, endX, endY, flightTicks, impact,
        trace: trace.map((point) => ({ ...point }))
    };
    events.push({ type: 'projectile', actor, trace });
    events.push({ type: 'impact', x: endX, y: endY, target: impact });
    if (impact !== 'world_exit' && impact !== 'lifetime') {
        deformTerrain(state.terrain, endX, endY, relicRules.craterRadius);
        applyDamage(state, endX, endY, relicRules, events, directTarget);
        state.units.forEach((unit) => settleUnit(state, unit));
    }
    state.aim = null;
    if (!finishFromDamage(state, events)) changeTurn(state, events, 'shot');
}

function sweptCollision(
    state: SimulationState,
    shooter: SimulationActor,
    oldX: number,
    oldY: number,
    newX: number,
    newY: number,
    flightTick: number
): { x: number; y: number; target: ProjectileSummary['impact'] } | undefined {
    const scale = SIM_RULES.fixedPointScale;
    const hitbox = directProjectileHitboxFor(state.rulesetId);
    const x0 = Math.trunc(oldX / scale);
    const y0 = Math.trunc(oldY / scale);
    const x1 = Math.trunc(newX / scale);
    const y1 = Math.trunc(newY / scale);
    const steps = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let step = 1; step <= steps; step += 1) {
        const x = x0 + Math.trunc((x1 - x0) * step / steps);
        const y = y0 + Math.trunc((y1 - y0) * step / steps);
        for (const unit of state.units) {
            if (!unit.alive || (unit.id === shooter && flightTick <= 3)) continue;
            if (Math.abs(unit.x - x) <= hitbox.halfWidth &&
                y >= unit.y - hitbox.top && y <= unit.y + hitbox.bottom) {
                return { x, y, target: unit.id };
            }
        }
        const cellX = Math.trunc(x / state.terrain.cellSize);
        const cellY = Math.trunc(y / state.terrain.cellSize);
        if (terrainSolid(state.terrain, cellX, cellY)) return { x, y, target: 'terrain' };
    }
    return undefined;
}

function applyDamage(
    state: SimulationState,
    x: number,
    y: number,
    relicRules: (typeof RELIC_RULES)[RelicId],
    events: SimulationEvent[],
    directTarget?: SimulationActor
): void {
    for (const unit of state.units) {
        if (!unit.alive) continue;
        const directHit = directTarget === unit.id;
        const dx = unit.x - x;
        const dy = unit.y - y;
        const distanceSquared = dx * dx + dy * dy;
        if (!directHit && distanceSquared > relicRules.damageRadius * relicRules.damageRadius) continue;
        const distance = integerSquareRoot(distanceSquared);
        const damage = directHit
            ? relicRules.maximumDamage
            : Math.max(1, Math.trunc(
                (relicRules.damageRadius - distance) * relicRules.maximumDamage /
                relicRules.damageRadius
            ));
        unit.stitching = Math.max(0, unit.stitching - damage);
        if (unit.stitching === 0) unit.alive = false;
        events.push({ type: 'damaged', actor: unit.id, amount: damage, stitching: unit.stitching });
    }
}

function settleUnit(state: SimulationState, unit: SimulationUnit): void {
    if (!unit.alive) return;
    const top = surfaceY(state.terrain, unit.x, unit.y + SIM_RULES.actorRadius);
    if (top >= worldHeight(state.terrain)) {
        unit.stitching = 0;
        unit.alive = false;
        return;
    }
    unit.y = top - SIM_RULES.actorRadius;
}

function finishFromDamage(state: SimulationState, events: SimulationEvent[]): boolean {
    const playerAlive = state.units[0].alive;
    const loomkeeperAlive = state.units[1].alive;
    if (playerAlive && loomkeeperAlive) return false;
    const winner: SimulationWinner = playerAlive
        ? 'player'
        : loomkeeperAlive
            ? 'loomkeeper'
            : 'draw';
    finish(state, winner, 'unravelled', events);
    return true;
}

function changeTurn(
    state: SimulationState,
    events: SimulationEvent[],
    reason: 'shot' | 'timeout'
): void {
    state.turn += 1;
    if (state.turn >= SIM_RULES.maximumTurns) {
        finish(state, 'draw', 'turn_limit', events);
        return;
    }
    state.activeActor = state.activeActor === 'player' ? 'loomkeeper' : 'player';
    state.turnDeadlineTick = state.tick + SIM_RULES.turnTicks;
    state.movementRemaining = SIM_RULES.movementPerTurn;
    state.aim = null;
    events.push({ type: 'turn_changed', turn: state.turn, actor: state.activeActor, reason });
}

function finish(
    state: SimulationState,
    winner: SimulationWinner,
    reason: 'unravelled' | 'turn_limit',
    events: SimulationEvent[]
): void {
    state.phase = 'finished';
    state.winner = winner;
    state.finishReason = reason;
    events.push({ type: 'finished', winner, reason });
}

function surfaceY(terrain: PackedTerrain, worldX: number, startWorldY = 0): number {
    const x = clamp(Math.trunc(worldX / terrain.cellSize), 0, terrain.width - 1);
    const start = clamp(Math.trunc(startWorldY / terrain.cellSize), 0, terrain.height - 1);
    for (let y = start; y < terrain.height; y += 1) {
        if (terrainSolid(terrain, x, y)) return y * terrain.cellSize;
    }
    return worldHeight(terrain);
}

function worldWidth(terrain: PackedTerrain): number {
    return terrain.width * terrain.cellSize;
}

function worldHeight(terrain: PackedTerrain): number {
    return terrain.height * terrain.cellSize;
}

function rejected(
    state: SimulationState,
    code: SimulationError['code'],
    message: string
): SimulationTransition {
    return {
        accepted: false,
        mutated: false,
        state: cloneSimulation(state),
        events: [],
        error: { code, message }
    };
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

function integerSquareRoot(value: number): number {
    if (value <= 0) return 0;
    let low = 1;
    let high = Math.min(value, RELIC_RULES.spoolburst.damageRadius);
    let result = 0;
    while (low <= high) {
        const middle = Math.trunc((low + high) / 2);
        const square = middle * middle;
        if (square <= value) {
            result = middle;
            low = middle + 1;
        } else {
            high = middle - 1;
        }
    }
    return result;
}

function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record).sort().map(
            (key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`
        ).join(',')}}`;
    }
    return JSON.stringify(value);
}
