export const RULESET_ID = 'nimble-knots-artillery-v1' as const;
export const RULESET_VERSION = 1 as const;

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
    width: 128;
    height: 72;
    cellSize: 8;
    words: number[];
};

export type ProjectileSummary = {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    flightTicks: number;
    impact: 'terrain' | 'player' | 'loomkeeper' | 'world_exit' | 'lifetime';
    trace: { x: number; y: number }[];
};

export type SimulationState = {
    formatVersion: 1;
    rulesetId: typeof RULESET_ID;
    rulesetVersion: 1;
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
    selectedRelic: 'threadball';
    aim: { angleMilliDegrees: number; powerPermille: number } | null;
    units: [SimulationUnit, SimulationUnit];
    terrain: PackedTerrain;
    lastProjectile: ProjectileSummary | null;
};

export type SimulationEvent =
    | { type: 'moved'; actor: SimulationActor; x: number; y: number }
    | { type: 'aimed'; actor: SimulationActor; angleMilliDegrees: number; powerPermille: number }
    | { type: 'relic_selected'; actor: SimulationActor; relicId: 'threadball' }
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

export function createSimulation(seed: number, calling: PlayerCalling): SimulationState {
    const normalizedSeed = normalizeSeed(seed);
    const generated = generateTerrain(normalizedSeed);
    const playerX = 192;
    const loomkeeperX = 832;
    const state: SimulationState = {
        formatVersion: 1,
        rulesetId: RULESET_ID,
        rulesetVersion: RULESET_VERSION,
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
        if (command.relicId !== 'threadball') {
            return rejected(current, 'COMMAND_REJECTED', 'Only Threadball is available in this ruleset.');
        }
        state.selectedRelic = 'threadball';
        events.push({ type: 'relic_selected', actor, relicId: 'threadball' });
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
    if (state.rulesetId !== RULESET_ID || state.rulesetVersion !== RULESET_VERSION) {
        throw new Error('Unknown deterministic simulation ruleset.');
    }
    const expectedWords = Math.ceil(state.terrain.width * state.terrain.height / 32);
    if (state.terrain.words.length !== expectedWords) throw new Error('Terrain word length changed.');
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

function nextRandom(state: number): number {
    let value = state >>> 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return value >>> 0;
}

function generateTerrain(seed: number): { terrain: PackedTerrain; rngState: number } {
    const words = new Array(Math.ceil(SIM_RULES.terrainWidth * SIM_RULES.terrainHeight / 32)).fill(0);
    const terrain: PackedTerrain = {
        width: SIM_RULES.terrainWidth,
        height: SIM_RULES.terrainHeight,
        cellSize: SIM_RULES.terrainCellSize,
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
        SIM_RULES.worldWidth - SIM_RULES.actorRadius - 1
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
            break;
        }
        if (endX < 0 || endX >= SIM_RULES.worldWidth || endY < 0 || endY >= SIM_RULES.worldHeight) {
            impact = 'world_exit';
            break;
        }
    }
    trace.push({ x: endX, y: endY });
    state.lastProjectile = {
        startX, startY, endX, endY, flightTicks, impact,
        trace: trace.map((point) => ({ ...point }))
    };
    events.push({ type: 'projectile', actor, trace });
    events.push({ type: 'impact', x: endX, y: endY, target: impact });
    if (impact !== 'world_exit' && impact !== 'lifetime') {
        deformTerrain(state.terrain, endX, endY, SIM_RULES.craterRadius);
        applyDamage(state, endX, endY, events);
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
            if (Math.abs(unit.x - x) <= SIM_RULES.actorRadius &&
                Math.abs(unit.y - y) <= SIM_RULES.actorRadius) {
                return { x, y, target: unit.id };
            }
        }
        const cellX = Math.trunc(x / state.terrain.cellSize);
        const cellY = Math.trunc(y / state.terrain.cellSize);
        if (terrainSolid(state.terrain, cellX, cellY)) return { x, y, target: 'terrain' };
    }
    return undefined;
}

function applyDamage(state: SimulationState, x: number, y: number, events: SimulationEvent[]): void {
    for (const unit of state.units) {
        if (!unit.alive) continue;
        const dx = unit.x - x;
        const dy = unit.y - y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared > SIM_RULES.damageRadius * SIM_RULES.damageRadius) continue;
        const distance = integerSquareRoot(distanceSquared);
        const damage = Math.max(1, Math.trunc(
            (SIM_RULES.damageRadius - distance) * SIM_RULES.maximumDamage /
            SIM_RULES.damageRadius
        ));
        unit.stitching = Math.max(0, unit.stitching - damage);
        if (unit.stitching === 0) unit.alive = false;
        events.push({ type: 'damaged', actor: unit.id, amount: damage, stitching: unit.stitching });
    }
}

function settleUnit(state: SimulationState, unit: SimulationUnit): void {
    if (!unit.alive) return;
    const top = surfaceY(state.terrain, unit.x, unit.y + SIM_RULES.actorRadius);
    if (top >= SIM_RULES.worldHeight) {
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
    return SIM_RULES.worldHeight;
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
    let high = Math.min(value, SIM_RULES.damageRadius);
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
