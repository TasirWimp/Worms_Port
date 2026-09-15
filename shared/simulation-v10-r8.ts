import { z } from 'zod';

import {
    advanceOwnedSimulationTickV10,
    applySimulationBarrierV10,
    applySimulationIntentV10,
    assertSimulationInvariantsV10,
    cloneSimulationV10,
    createSimulationV10,
    forceSimulationLimitV10,
    hashCanonicalV10Value,
    V10_R6_DYNAMICS,
    V10_R7_RULESET_ID,
    type SimulationBarrierV10,
    type SimulationEventV10,
    type SimulationIntentV10,
    type SimulationStateV10,
    type SimulationTransitionV10
} from './simulation-v10';
import {
    compileV10R7Battlefield,
    serializeV10R7Terrain,
    V10_R7_AUTHORING_HEIGHT,
    V10_R7_AUTHORING_WIDTH,
    V10_R7_HORIZONTAL_EXPANSION,
    V10_R7_TERRAIN_CELL_SIZE,
    V10_R7_TERRAIN_HEIGHT,
    V10_R7_TERRAIN_WIDTH,
    V10_R7_VERTICAL_EXPANSION
} from './terrain-battlefield-v10-r7';
import { V8_SIM_RULES } from './simulation-v8';
import { terrainSolid, type PackedTerrain, type PlayerCalling, type SimulationActor, type SimulationWinner } from './simulation';

export const V10_R8_RULESET_ID = 'nimble-knots-artillery-v10-r8' as const;
export const V10_R8_OBJECTIVE_RECIPE_REVISION = 'volcanic-ruin-objectives-r1' as const;
export const V10_R8_OBJECTIVE_MODES = Object.freeze(['defend', 'collect', 'claim'] as const);
export type V10R8ObjectiveMode = typeof V10_R8_OBJECTIVE_MODES[number];
export type V10R8ObjectiveKind = 'coin' | 'chest';
export type V10R8ObjectiveStatus = 'active' | 'collected' | 'captured' | 'lost';
export type V10R8ObjectiveResultReason = 'elimination' | 'chest_captured' | 'chest_lost' |
    'coin_lead' | 'coins_resolved' | 'turn_limit' | 'simulation_limit' | 'simultaneous';
export type V10R8ObjectiveResult = Readonly<{
    winner: SimulationWinner;
    reason: V10R8ObjectiveResultReason;
}>;

export const V10_R8_OBJECT_DIMENSIONS = Object.freeze({
    coin: Object.freeze({ halfWidth: 16, halfHeight: 16 }),
    chest: Object.freeze({ halfWidth: 28, halfHeight: 20 })
} satisfies Readonly<Record<V10R8ObjectiveKind, Readonly<{ halfWidth: number; halfHeight: number }>>>);

export const V10_R8_COLLECT_OBJECTIVES_ASCII = `................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................o...............................
................................................................
.............o..................................................
..................................................o.............
....o......................o....................................
................................................................
................................................................
.................................................o..............
................................................................
................................................................
................................................................
....................o...........................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................`;

export const V10_R8_DEFEND_OBJECTIVES_ASCII = `................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
.............C..................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................`;

export const V10_R8_CLAIM_OBJECTIVES_ASCII = `................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
..................................................C.............
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................
................................................................`;

const FP = 256;
const OBJECT_GRAVITY_FP = V8_SIM_RULES.gravityFp;
const OBJECT_MAXIMUM_FALL_SPEED_FP = V8_SIM_RULES.maximumFallSpeedFp;
const OBJECTIVE_SOURCES: Readonly<Record<V10R8ObjectiveMode, string>> = Object.freeze({
    defend: V10_R8_DEFEND_OBJECTIVES_ASCII,
    collect: V10_R8_COLLECT_OBJECTIVES_ASCII,
    claim: V10_R8_CLAIM_OBJECTIVES_ASCII
});

export type V10R8ObjectiveObject = Readonly<{
    id: string;
    kind: V10R8ObjectiveKind;
    owner: SimulationActor | null;
    xFp: number;
    yFp: number;
    vyFp: number;
    grounded: boolean;
    support: number | null;
    status: V10R8ObjectiveStatus;
    resolvedBy: SimulationActor | null;
}>;

export type V10R8ObjectiveState = Readonly<{
    objectiveMode: V10R8ObjectiveMode;
    recipeRevision: typeof V10_R8_OBJECTIVE_RECIPE_REVISION;
    objectiveRevision: number;
    objectiveHash: string;
    objects: readonly V10R8ObjectiveObject[];
    scores: Readonly<Record<SimulationActor, number>>;
    result: V10R8ObjectiveResult | null;
}>;

export type SimulationStateV10R8 = Omit<SimulationStateV10, 'rulesetId'> & {
    rulesetId: typeof V10_R8_RULESET_ID;
    objective: V10R8ObjectiveState;
};

export type SimulationTransitionV10R8 = Omit<SimulationTransitionV10, 'state'> & {
    state: SimulationStateV10R8;
};

const ObjectiveObjectSchema = z.object({
    id: z.string().regex(/^(coin-[1-7]|player-chest|loomkeeper-chest)$/),
    kind: z.enum(['coin', 'chest']),
    owner: z.enum(['player', 'loomkeeper']).nullable(),
    xFp: z.number().int().min(0).max(V10_R7_TERRAIN_WIDTH * V10_R7_TERRAIN_CELL_SIZE * FP),
    yFp: z.number().int().min(-V10_R7_TERRAIN_HEIGHT * V10_R7_TERRAIN_CELL_SIZE * FP)
        .max(V10_R7_TERRAIN_HEIGHT * V10_R7_TERRAIN_CELL_SIZE * FP * 2),
    vyFp: z.number().int().min(0).max(OBJECT_MAXIMUM_FALL_SPEED_FP),
    grounded: z.boolean(),
    support: z.number().int().min(0).max(V10_R7_TERRAIN_WIDTH * V10_R7_TERRAIN_HEIGHT - 1).nullable(),
    status: z.enum(['active', 'collected', 'captured', 'lost']),
    resolvedBy: z.enum(['player', 'loomkeeper']).nullable()
}).strict();

const ObjectiveStateSchema = z.object({
    objectiveMode: z.enum(V10_R8_OBJECTIVE_MODES),
    recipeRevision: z.literal(V10_R8_OBJECTIVE_RECIPE_REVISION),
    objectiveRevision: z.number().int().min(0).max(65_535),
    objectiveHash: z.string().regex(/^[a-f0-9]{64}$/),
    objects: z.array(ObjectiveObjectSchema).min(1).max(7),
    scores: z.object({ player: z.number().int().min(0).max(7), loomkeeper: z.number().int().min(0).max(7) }).strict(),
    result: z.object({
        winner: z.enum(['player', 'loomkeeper', 'draw']),
        reason: z.enum(['elimination', 'chest_captured', 'chest_lost', 'coin_lead', 'coins_resolved',
            'turn_limit', 'simulation_limit', 'simultaneous'])
    }).strict().nullable()
}).strict();

export function objectiveModeV10R8(value: unknown): V10R8ObjectiveMode {
    return value === 'defend' || value === 'claim' ? value : 'collect';
}

export function createSimulationV10R8(
    seed: number,
    calling: PlayerCalling,
    objectiveMode: V10R8ObjectiveMode = 'collect'
): SimulationStateV10R8 {
    const base = createR7Simulation(seed, calling);
    const objective = compileV10R8ObjectiveLayer(objectiveMode, base.terrain);
    const state = fromR7(base, objective);
    assertSimulationInvariantsV10R8(state);
    return state;
}

export function compileV10R8ObjectiveLayer(
    objectiveMode: V10R8ObjectiveMode,
    terrain: PackedTerrain,
    source = OBJECTIVE_SOURCES[objectiveMode]
): V10R8ObjectiveState {
    assertR7TerrainGeometry(terrain);
    if (source.includes('\r') || source.endsWith('\n')) {
        throw new Error('R8 objective ASCII must use LF separators with no terminal newline.');
    }
    const lines = source.split('\n');
    if (lines.length !== V10_R7_AUTHORING_HEIGHT ||
        lines.some(line => line.length !== V10_R7_AUTHORING_WIDTH)) {
        throw new Error(`R8 objective ASCII must be exactly ${V10_R7_AUTHORING_WIDTH} by ${V10_R7_AUTHORING_HEIGHT}.`);
    }
    if (lines.some(line => /[^.oC]/.test(line))) throw new Error('R8 objective ASCII contains an unknown character.');

    const anchors: { row: number; column: number; kind: V10R8ObjectiveKind }[] = [];
    lines.forEach((line, row) => [...line].forEach((glyph, column) => {
        if (glyph === 'o' || glyph === 'C') anchors.push({ row, column, kind: glyph === 'o' ? 'coin' : 'chest' });
    }));
    const coins = anchors.filter(anchor => anchor.kind === 'coin');
    const chests = anchors.filter(anchor => anchor.kind === 'chest');
    if (objectiveMode === 'collect' ? coins.length !== 7 || chests.length !== 0 : coins.length !== 0 || chests.length !== 1) {
        throw new Error('R8 objective ASCII object count does not match the selected objective mode.');
    }

    let coinIndex = 0;
    const objects = anchors.map(anchor => {
        const dimensions = V10_R8_OBJECT_DIMENSIONS[anchor.kind];
        const x = anchor.column * V10_R7_HORIZONTAL_EXPANSION * V10_R7_TERRAIN_CELL_SIZE +
            V10_R7_HORIZONTAL_EXPANSION * V10_R7_TERRAIN_CELL_SIZE / 2;
        const surfaceY = (anchor.row + 1) * V10_R7_VERTICAL_EXPANSION * V10_R7_TERRAIN_CELL_SIZE;
        assertClearObjectiveEnvelope(terrain, x, surfaceY, dimensions, anchor.kind);
        const prototype = {
            id: anchor.kind === 'coin' ? `coin-${++coinIndex}` : objectiveMode === 'defend' ? 'player-chest' : 'loomkeeper-chest',
            kind: anchor.kind,
            owner: anchor.kind === 'chest' ? objectiveMode === 'defend' ? 'player' as const : 'loomkeeper' as const : null,
            xFp: x * FP,
            yFp: (surfaceY - dimensions.halfHeight) * FP,
            vyFp: 0,
            grounded: true,
            support: null,
            status: 'active' as const,
            resolvedBy: null
        };
        const support = findObjectiveSupport(terrain, prototype);
        if (support === null) throw new Error(`R8 ${anchor.kind} anchor has no support.`);
        return Object.freeze({ ...prototype, support });
    });
    return withObjectiveHash({
        objectiveMode,
        recipeRevision: V10_R8_OBJECTIVE_RECIPE_REVISION,
        objectiveRevision: 0,
        objects: Object.freeze(objects),
        scores: Object.freeze({ player: 0, loomkeeper: 0 }),
        result: null
    });
}

export function applySimulationIntentV10R8(
    current: SimulationStateV10R8,
    actor: SimulationActor,
    intent: SimulationIntentV10,
    expectedTurn: number,
    expectedPhase = current.phase,
    expectedEpoch = current.inputEpoch
): SimulationTransitionV10R8 {
    assertSimulationInvariantsV10R8(current);
    if (current.phase === 'finished') return reject(current, 'The R8 Clash has already ended.');
    return fromR7Transition(applySimulationIntentV10(
        r7View(current), actor, intent, expectedTurn, expectedPhase, expectedEpoch
    ), current);
}

export function applySimulationBarrierV10R8(
    current: SimulationStateV10R8,
    barrier: SimulationBarrierV10
): SimulationTransitionV10R8 {
    assertSimulationInvariantsV10R8(current);
    if (current.phase === 'finished') return reject(current, 'The R8 Clash has already ended.');
    return fromR7Transition(applySimulationBarrierV10(r7View(current), barrier), current);
}

export function advanceSimulationTicksV10R8(
    current: SimulationStateV10R8,
    count: number
): SimulationTransitionV10R8 {
    assertSimulationInvariantsV10R8(current);
    if (!Number.isSafeInteger(count) || count < 0 || count > V10_R6_DYNAMICS.maximumCombatTicks) {
        return reject(current, 'Tick count exceeds the R8 simulation bound.');
    }
    if (count === 0 || current.phase === 'finished') {
        return { accepted: true, mutated: false, state: current, events: [] };
    }
    let state = cloneSimulationV10R8(current);
    let mutated = false;
    const events: SimulationEventV10[] = [];
    for (let tick = 0; tick < count; tick += 1) {
        const transition = advanceOwnedSimulationTickV10R8(state);
        if (!transition.mutated) break;
        state = transition.state;
        events.push(...transition.events);
        mutated = true;
    }
    if (mutated) assertSimulationInvariantsV10R8(state);
    return { accepted: true, mutated, state, events };
}

export function advanceOwnedSimulationTickV10R8(current: SimulationStateV10R8): SimulationTransitionV10R8 {
    assertSimulationInvariantsV10R8(current);
    if (current.phase === 'finished') {
        return { accepted: true, mutated: false, state: current, events: [] };
    }
    const combat = advanceOwnedSimulationTickV10(r7View(current));
    if (!combat.mutated) return { ...combat, state: current };
    const objective = advanceObjectiveAuthorityV10R8(current.objective, combat.state);
    if (!objective.result) return { ...combat, state: fromR7(combat.state, objective) };
    const state = finishObjectiveMatchV10R8(combat.state, objective.result);
    const finishReason = state.finishReason!;
    const events: SimulationEventV10[] = combat.events.filter(event => event.type !== 'finished');
    if (!combat.events.some(event => event.type === 'phase_changed' && event.phase === 'finished')) {
        events.push({ type: 'input_barrier', reason: 'phase', tick: state.tick });
        events.push({ type: 'phase_changed', phase: 'finished', tick: state.tick });
    }
    events.push({ type: 'finished', winner: state.winner!, reason: finishReason });
    return { ...combat, state: fromR7(state, objective), events };
}

export function advanceDetachedProjectileV10R8(
    current: SimulationStateV10R8,
    maximumTicks: number
): SimulationTransitionV10R8 {
    assertSimulationInvariantsV10R8(current);
    if (!Number.isSafeInteger(maximumTicks) || maximumTicks < 0 || maximumTicks > V10_R6_DYNAMICS.maximumCombatTicks) {
        return reject(current, 'Projectile rollout exceeds the R8 simulation bound.');
    }
    let state = cloneSimulationV10R8(current);
    let mutated = false;
    const events: SimulationEventV10[] = [];
    for (let tick = 0; tick < maximumTicks && state.phase === 'projectile'; tick += 1) {
        const transition = advanceOwnedSimulationTickV10R8(state);
        if (!transition.mutated) break;
        state = transition.state;
        events.push(...transition.events);
        mutated = true;
    }
    if (!mutated) return { accepted: true, mutated: false, state: current, events };
    assertSimulationInvariantsV10R8(state);
    return { accepted: true, mutated: true, state, events };
}

export function trajectoryPreviewV10R8(
    state: SimulationStateV10R8,
    aim: { angleMilliDegrees: number; powerPermille: number }
): { x: number; y: number }[] {
    const source = cloneSimulationV10R8(state);
    if (source.phase !== 'action' || source.activeActor !== 'player' || source.winner !== null ||
        source.castUsed || source.heldDirection !== 0 ||
        source.units.some(unit => !unit.alive || !unit.grounded || unit.vxFp !== 0 || unit.vyFp !== 0)) return [];
    const aimed = applySimulationIntentV10R8(
        source, 'player', { type: 'aim', ...aim }, source.turn, source.phase, source.inputEpoch
    );
    if (!aimed.accepted) return [];
    const fired = applySimulationIntentV10R8(
        aimed.state, 'player', { type: 'fire', aimId: aimed.state.aimId },
        aimed.state.turn, aimed.state.phase, aimed.state.inputEpoch
    );
    if (!fired.accepted) return [];
    const projected = advanceDetachedProjectileV10R8(fired.state, 300).state;
    return projected.lastProjectile?.trace.map(point => ({ ...point })) ?? [];
}

export function forceSimulationLimitV10R8(current: SimulationStateV10R8): SimulationTransitionV10R8 {
    assertSimulationInvariantsV10R8(current);
    if (current.phase === 'finished') return { accepted: true, mutated: false, state: current, events: [] };
    const result = forceSimulationLimitV10(r7View(current));
    const objective = withObjectiveHash({
        ...current.objective,
        objectiveRevision: current.objective.objectiveRevision + 1,
        result: Object.freeze({ winner: 'draw', reason: 'simulation_limit' })
    });
    return { ...result, state: fromR7(result.state, objective) };
}

export function cloneSimulationV10R8(state: SimulationStateV10R8): SimulationStateV10R8 {
    assertSimulationInvariantsV10R8(state);
    const objective = withObjectiveHash({
        objectiveMode: state.objective.objectiveMode,
        recipeRevision: state.objective.recipeRevision,
        objectiveRevision: state.objective.objectiveRevision,
        objects: Object.freeze(state.objective.objects.map(object => Object.freeze({ ...object }))),
        scores: Object.freeze({ ...state.objective.scores }),
        result: state.objective.result ? Object.freeze({ ...state.objective.result }) : null
    });
    const cloned = cloneSimulationV10(r7ValidationView(state));
    return fromR7({ ...cloned, turn: state.turn, winner: state.winner, finishReason: state.finishReason }, objective);
}

export function assertSimulationInvariantsV10R8(state: SimulationStateV10R8): void {
    const parsed = ObjectiveStateSchema.safeParse(state.objective);
    if (!parsed.success) throw new Error('Invalid R8 state: objective schema.');
    assertSimulationInvariantsV10(r7ValidationView(state));
    if (state.objective.objectiveHash !== hashObjectiveState(state.objective)) {
        throw new Error('Invalid R8 state: objective hash does not match objective state.');
    }
    const expected = state.objective.objectiveMode === 'collect' ? { kind: 'coin', count: 7, owner: null }
        : { kind: 'chest', count: 1, owner: state.objective.objectiveMode === 'defend' ? 'player' : 'loomkeeper' };
    if (state.objective.objects.length !== expected.count ||
        state.objective.objects.some(object => object.kind !== expected.kind || object.owner !== expected.owner) ||
        new Set(state.objective.objects.map(object => object.id)).size !== state.objective.objects.length) {
        throw new Error('Invalid R8 state: objective inventory does not match the selected mode.');
    }
    const worldBottomFp = state.terrain.height * state.terrain.cellSize * FP;
    for (const object of state.objective.objects) {
        const dimensions = V10_R8_OBJECT_DIMENSIONS[object.kind];
        if (object.status === 'active') {
            if (object.grounded) {
                if (object.vyFp !== 0 || object.support === null ||
                    findObjectiveSupport(state.terrain, object) !== object.support) {
                    throw new Error(`Invalid R8 state: ${object.id} has stale terrain support.`);
                }
            } else if (object.support !== null) {
                throw new Error(`Invalid R8 state: ${object.id} is airborne with support.`);
            }
            if (object.yFp - dimensions.halfHeight * FP >= worldBottomFp) {
                throw new Error(`Invalid R8 state: ${object.id} crossed the open bottom while active.`);
            }
        } else if (object.grounded || object.support !== null || object.vyFp !== 0) {
            throw new Error(`Invalid R8 state: resolved ${object.id} retains motion.`);
        }
    }
    const collected = state.objective.objects.filter(object => object.status === 'collected');
    const expectedScores = {
        player: collected.filter(object => object.resolvedBy === 'player').length,
        loomkeeper: collected.filter(object => object.resolvedBy === 'loomkeeper').length
    };
    if (state.objective.objectiveMode === 'collect') {
        if (state.objective.scores.player !== expectedScores.player ||
            state.objective.scores.loomkeeper !== expectedScores.loomkeeper) {
            throw new Error('Invalid R8 state: Collect scores do not match banked coins.');
        }
    } else if (state.objective.scores.player !== 0 || state.objective.scores.loomkeeper !== 0) {
        throw new Error('Invalid R8 state: chest modes cannot carry coin scores.');
    }
    if ((state.phase === 'finished') !== (state.objective.result !== null) ||
        (state.objective.result && state.objective.result.winner !== state.winner)) {
        throw new Error('Invalid R8 state: objective result does not match the combat result.');
    }
}

export function hashSimulationStateV10R8(state: SimulationStateV10R8): string {
    assertSimulationInvariantsV10R8(state);
    return hashCanonicalV10Value(state);
}

export function advanceObjectivePhysicsV10R8(
    current: V10R8ObjectiveState,
    terrain: PackedTerrain
): V10R8ObjectiveState {
    let changed = false;
    const worldBottomFp = terrain.height * terrain.cellSize * FP;
    const objects = current.objects.map(source => {
        if (source.status !== 'active') return source;
        const dimensions = V10_R8_OBJECT_DIMENSIONS[source.kind];
        let object = { ...source };
        if (object.grounded) {
            const support = findObjectiveSupport(terrain, object);
            if (support === object.support && support !== null) return source;
            object = { ...object, grounded: false, support: null };
            changed = true;
        }

        const vyFp = Math.min(object.vyFp + OBJECT_GRAVITY_FP, OBJECT_MAXIMUM_FALL_SPEED_FP);
        const landingY = findLandingYFp(terrain, object, vyFp);
        if (landingY !== null) {
            const landed = { ...object, yFp: landingY, vyFp: 0, grounded: true };
            const support = findObjectiveSupport(terrain, landed);
            if (support === null) throw new Error(`R8 ${source.id} landing has no support.`);
            object = { ...landed, support };
        } else {
            object = { ...object, yFp: object.yFp + vyFp, vyFp };
        }
        if (object.yFp - dimensions.halfHeight * FP >= worldBottomFp) {
            object = { ...object, vyFp: 0, grounded: false, support: null, status: 'lost' };
        }
        if (!sameObjectiveObject(source, object)) changed = true;
        return Object.freeze(object);
    });
    if (!changed) return current;
    return withObjectiveHash({
        objectiveMode: current.objectiveMode,
        recipeRevision: current.recipeRevision,
        objectiveRevision: current.objectiveRevision + 1,
        objects: Object.freeze(objects),
        scores: current.scores,
        result: current.result
    });
}

export type V10R8LiveBattlefieldState = Readonly<{
    tacticalAscii: string;
    terrainAscii: string;
    terrainRevision: number;
    terrainHash: string;
    objectiveRevision: number;
    objectiveHash: string;
    stateHash: string;
    objective: V10R8ObjectiveState;
}>;

export function serializeV10R8BattlefieldState(state: SimulationStateV10R8): V10R8LiveBattlefieldState {
    assertSimulationInvariantsV10R8(state);
    const terrainAscii = serializeV10R7Terrain(state.terrain);
    const rows = terrainAscii.split('\n').map(line => [...line]);
    const place = (xFp: number, yFp: number, glyph: 'P' | 'L' | 'o' | 'C', label: string) => {
        const column = Math.floor(xFp / FP / state.terrain.cellSize);
        const row = Math.floor(yFp / FP / state.terrain.cellSize);
        if (column < 0 || column >= state.terrain.width || row < 0 || row >= state.terrain.height) return;
        if (rows[row][column] !== '.') throw new Error(`R8 ${label} cannot overlay occupied tactical ASCII.`);
        rows[row][column] = glyph;
    };
    for (const object of state.objective.objects) {
        if (object.status === 'active') place(object.xFp, object.yFp, object.kind === 'coin' ? 'o' : 'C', object.id);
    }
    for (const [index, glyph] of [[0, 'P'], [1, 'L']] as const) {
        const unit = state.units[index];
        if (unit.alive) place(unit.xFp, unit.yFp, glyph, unit.id);
    }
    return Object.freeze({
        tacticalAscii: rows.map(row => row.join('')).join('\n'),
        terrainAscii,
        terrainRevision: state.terrainRevision!,
        terrainHash: state.terrainHash!,
        objectiveRevision: state.objective.objectiveRevision,
        objectiveHash: state.objective.objectiveHash,
        stateHash: hashSimulationStateV10R8(state),
        objective: cloneObjectiveState(state.objective)
    });
}

export function simulationV10R7ViewOfR8(state: SimulationStateV10R8): SimulationStateV10 {
    assertSimulationInvariantsV10R8(state);
    return cloneSimulationV10(r7ValidationView(state));
}

/** Internal read-only adapter for a fixture-owned state already validated at its transition boundary. */
export function simulationV10R7ViewOfValidatedR8(state: SimulationStateV10R8): SimulationStateV10 {
    return r7View(state);
}

function createR7Simulation(seed: number, calling: PlayerCalling): SimulationStateV10 {
    // Keep R8 construction in this isolated module so current R7 selection and
    // replay truth do not need an R8 branch before the server waypoint.
    return createSimulationV10(seed, calling, V10_R7_RULESET_ID);
}

function r7View(state: SimulationStateV10R8): SimulationStateV10 {
    const { objective: _objective, rulesetId: _rulesetId, ...common } = state;
    return { ...common, rulesetId: V10_R7_RULESET_ID };
}

function r7ValidationView(state: SimulationStateV10R8): SimulationStateV10 {
    const view = r7View(state);
    if (view.phase !== 'finished' ||
        (view.finishReason === 'unravelled' || view.finishReason === 'simulation_limit' ||
            (view.finishReason === 'turn_limit' && view.turn === V10_R6_DYNAMICS.maximumTurns && view.winner === 'draw'))) {
        return view;
    }
    // R8 objective victories can finish before R7's turn limit and can award a
    // non-draw winner. Normalize only the temporary inherited validation view;
    // the R8 state and hash retain their exact turn, winner and objective reason.
    return { ...view, turn: V10_R6_DYNAMICS.maximumTurns, winner: 'draw', finishReason: 'turn_limit' };
}

function fromR7(state: SimulationStateV10, objective: V10R8ObjectiveState): SimulationStateV10R8 {
    return { ...state, rulesetId: V10_R8_RULESET_ID, objective: cloneObjectiveState(objective) };
}

function fromR7Transition(result: SimulationTransitionV10, current: SimulationStateV10R8): SimulationTransitionV10R8 {
    if (!result.mutated) return { ...result, state: current };
    if (result.state.phase !== 'finished') return { ...result, state: fromR7(result.state, current.objective) };
    const reason: V10R8ObjectiveResultReason = result.state.finishReason === 'simulation_limit'
        ? 'simulation_limit' : result.state.finishReason === 'turn_limit' ? 'turn_limit' : 'elimination';
    const objective = withObjectiveHash({
        ...current.objective,
        objectiveRevision: current.objective.objectiveRevision + 1,
        result: Object.freeze({ winner: result.state.winner!, reason })
    });
    return { ...result, state: fromR7(result.state, objective) };
}

function advanceObjectiveAuthorityV10R8(
    current: V10R8ObjectiveState,
    combat: SimulationStateV10
): V10R8ObjectiveState {
    const worldBottomFp = combat.terrain.height * combat.terrain.cellSize * FP;
    let objects = current.objects.map(source => advanceObjectiveMotionV10R8(source, combat.terrain));
    const scores = { ...current.scores };

    if (current.objectiveMode === 'collect') {
        objects = objects.map(source => {
            if (source.status !== 'active') return source;
            const contenders = (['player', 'loomkeeper'] as const).filter(actor =>
                objectiveOverlapsActorV10R8(source, combat, actor));
            if (!contenders.length) return source;
            let collector: SimulationActor | undefined = contenders[0];
            if (contenders.length === 2) {
                const playerDistance = objectiveActorDistanceSquaredV10R8(source, combat, 'player');
                const loomkeeperDistance = objectiveActorDistanceSquaredV10R8(source, combat, 'loomkeeper');
                collector = playerDistance === loomkeeperDistance ? undefined
                    : playerDistance < loomkeeperDistance ? 'player' : 'loomkeeper';
            }
            if (!collector) return source;
            scores[collector] += 1;
            return Object.freeze({ ...source, vyFp: 0, grounded: false, support: null,
                status: 'collected' as const, resolvedBy: collector });
        });
    } else {
        const attacker: SimulationActor = current.objectiveMode === 'defend' ? 'loomkeeper' : 'player';
        objects = objects.map(source => source.status === 'active' &&
            objectiveOverlapsActorV10R8(source, combat, attacker)
            ? Object.freeze({ ...source, vyFp: 0, grounded: false, support: null,
                status: 'captured' as const, resolvedBy: attacker })
            : source);
    }

    objects = objects.map(source => {
        if (source.kind === 'chest' && source.status === 'lost' && source.resolvedBy === null) {
            return Object.freeze({ ...source,
                resolvedBy: current.objectiveMode === 'defend' ? 'loomkeeper' as const : 'player' as const });
        }
        if (source.status !== 'active') return source;
        const dimensions = V10_R8_OBJECT_DIMENSIONS[source.kind];
        if (source.yFp - dimensions.halfHeight * FP < worldBottomFp) return source;
        const resolvedBy = source.kind === 'chest'
            ? current.objectiveMode === 'defend' ? 'loomkeeper' : 'player'
            : null;
        return Object.freeze({ ...source, vyFp: 0, grounded: false, support: null,
            status: 'lost' as const, resolvedBy });
    });

    const result = evaluateObjectiveResultV10R8(current.objectiveMode, objects, scores, combat);
    const changed = objects.some((object, index) => !sameObjectiveObject(current.objects[index], object)) ||
        scores.player !== current.scores.player || scores.loomkeeper !== current.scores.loomkeeper ||
        JSON.stringify(result) !== JSON.stringify(current.result);
    if (!changed) return current;
    return withObjectiveHash({
        objectiveMode: current.objectiveMode,
        recipeRevision: current.recipeRevision,
        objectiveRevision: current.objectiveRevision + 1,
        objects: Object.freeze(objects),
        scores: Object.freeze(scores),
        result: result ? Object.freeze(result) : null
    });
}

function advanceObjectiveMotionV10R8(
    source: V10R8ObjectiveObject,
    terrain: PackedTerrain
): V10R8ObjectiveObject {
    if (source.status !== 'active') return source;
    let object = { ...source };
    if (object.grounded) {
        const support = findObjectiveSupport(terrain, object);
        if (support === object.support && support !== null) return source;
        object = { ...object, grounded: false, support: null };
    }
    const vyFp = Math.min(object.vyFp + OBJECT_GRAVITY_FP, OBJECT_MAXIMUM_FALL_SPEED_FP);
    const landingY = findLandingYFp(terrain, object, vyFp);
    if (landingY !== null) {
        const landed = { ...object, yFp: landingY, vyFp: 0, grounded: true };
        const support = findObjectiveSupport(terrain, landed);
        if (support === null) throw new Error(`R8 ${source.id} landing has no support.`);
        object = { ...landed, support };
    } else {
        object = { ...object, yFp: object.yFp + vyFp, vyFp };
    }
    return sameObjectiveObject(source, object) ? source : Object.freeze(object);
}

function objectiveOverlapsActorV10R8(
    object: V10R8ObjectiveObject,
    combat: SimulationStateV10,
    actor: SimulationActor
): boolean {
    const unit = combat.units[actor === 'player' ? 0 : 1];
    if (!unit.alive) return false;
    const dimensions = V10_R8_OBJECT_DIMENSIONS[object.kind];
    const actorRadiusFp = 12 * FP;
    return Math.abs(unit.xFp - object.xFp) <= dimensions.halfWidth * FP + actorRadiusFp &&
        Math.abs(unit.yFp - object.yFp) <= dimensions.halfHeight * FP + actorRadiusFp;
}

function objectiveActorDistanceSquaredV10R8(
    object: V10R8ObjectiveObject,
    combat: SimulationStateV10,
    actor: SimulationActor
): number {
    const unit = combat.units[actor === 'player' ? 0 : 1];
    const dx = unit.xFp - object.xFp;
    const dy = unit.yFp - object.yFp;
    return dx * dx + dy * dy;
}

function evaluateObjectiveResultV10R8(
    mode: V10R8ObjectiveMode,
    objects: readonly V10R8ObjectiveObject[],
    scores: Readonly<Record<SimulationActor, number>>,
    combat: SimulationStateV10
): V10R8ObjectiveResult | null {
    const playerAlive = combat.units[0].alive;
    const loomkeeperAlive = combat.units[1].alive;
    const elimination: V10R8ObjectiveResult | null = playerAlive && loomkeeperAlive ? null
        : { winner: playerAlive ? 'player' : loomkeeperAlive ? 'loomkeeper' : 'draw', reason: 'elimination' };
    let objective: V10R8ObjectiveResult | null = null;

    if (mode === 'collect') {
        const active = objects.filter(object => object.status === 'active').length;
        if (scores.player > scores.loomkeeper + active) objective = { winner: 'player', reason: 'coin_lead' };
        else if (scores.loomkeeper > scores.player + active) objective = { winner: 'loomkeeper', reason: 'coin_lead' };
        else if (active === 0) objective = {
            winner: scores.player === scores.loomkeeper ? 'draw'
                : scores.player > scores.loomkeeper ? 'player' : 'loomkeeper',
            reason: 'coins_resolved'
        };
    } else {
        const chest = objects[0];
        if (chest.status === 'captured' || chest.status === 'lost') objective = {
            winner: mode === 'defend' ? 'loomkeeper' : 'player',
            reason: chest.status === 'captured' ? 'chest_captured' : 'chest_lost'
        };
    }

    if (elimination && objective) {
        if (elimination.winner === objective.winner && elimination.winner !== 'draw') return objective;
        return { winner: 'draw', reason: 'simultaneous' };
    }
    if (objective) return objective;
    if (elimination) return elimination;
    if (combat.phase !== 'finished') return null;
    if (combat.finishReason === 'simulation_limit') return { winner: 'draw', reason: 'simulation_limit' };
    if (combat.finishReason !== 'turn_limit') return null;
    if (mode === 'defend') return { winner: 'player', reason: 'turn_limit' };
    if (mode === 'claim') return { winner: 'loomkeeper', reason: 'turn_limit' };
    return {
        winner: scores.player === scores.loomkeeper ? 'draw'
            : scores.player > scores.loomkeeper ? 'player' : 'loomkeeper',
        reason: 'turn_limit'
    };
}

function finishObjectiveMatchV10R8(
    source: SimulationStateV10,
    result: V10R8ObjectiveResult
): SimulationStateV10 {
    const finishReason: NonNullable<SimulationStateV10['finishReason']> = result.reason === 'elimination'
        ? 'unravelled' : result.reason === 'simulation_limit' ? 'simulation_limit' : 'turn_limit';
    if (source.phase === 'finished') return { ...source, winner: result.winner, finishReason };
    return {
        ...source,
        phase: 'finished',
        phaseStartedTick: source.tick,
        phaseDeadlineTick: source.tick,
        settleReason: null,
        inputEpoch: Math.min(65_535, source.inputEpoch + 1),
        heldDirection: 0,
        leaseExpiresTick: null,
        lastLeaseRefreshTick: null,
        aim: null,
        winner: result.winner,
        finishReason,
        units: source.units.map(unit => ({ ...unit, vxFp: 0 })) as SimulationStateV10['units'],
        projectile: null
    };
}

function cloneObjectiveState(state: V10R8ObjectiveState): V10R8ObjectiveState {
    return Object.freeze({
        ...state,
        objects: Object.freeze(state.objects.map(object => Object.freeze({ ...object }))),
        scores: Object.freeze({ ...state.scores }),
        result: state.result ? Object.freeze({ ...state.result }) : null
    });
}

function withObjectiveHash(
    state: Omit<V10R8ObjectiveState, 'objectiveHash'>
): V10R8ObjectiveState {
    const payload = {
        objectiveMode: state.objectiveMode,
        recipeRevision: state.recipeRevision,
        objectiveRevision: state.objectiveRevision,
        objects: state.objects,
        scores: state.scores,
        result: state.result
    };
    return Object.freeze({ ...state, objectiveHash: hashCanonicalV10Value(payload) });
}

function hashObjectiveState(state: V10R8ObjectiveState): string {
    const { objectiveHash: _hash, ...payload } = state;
    return hashCanonicalV10Value(payload);
}

function findObjectiveSupport(terrain: PackedTerrain, object: Pick<V10R8ObjectiveObject, 'kind' | 'xFp' | 'yFp'>): number | null {
    const dimensions = V10_R8_OBJECT_DIMENSIONS[object.kind];
    const left = Math.floor((object.xFp / FP - dimensions.halfWidth) / terrain.cellSize);
    const right = Math.floor((object.xFp / FP + dimensions.halfWidth - 1) / terrain.cellSize);
    const supportRow = Math.floor((object.yFp / FP + dimensions.halfHeight) / terrain.cellSize);
    if (supportRow < 0 || supportRow >= terrain.height) return null;
    for (let column = Math.max(0, left); column <= Math.min(terrain.width - 1, right); column += 1) {
        if (terrainSolid(terrain, column, supportRow)) return supportRow * terrain.width + column;
    }
    return null;
}

function findLandingYFp(
    terrain: PackedTerrain,
    object: Pick<V10R8ObjectiveObject, 'kind' | 'xFp' | 'yFp'>,
    vyFp: number
): number | null {
    const dimensions = V10_R8_OBJECT_DIMENSIONS[object.kind];
    const left = Math.floor((object.xFp / FP - dimensions.halfWidth) / terrain.cellSize);
    const right = Math.floor((object.xFp / FP + dimensions.halfWidth - 1) / terrain.cellSize);
    const currentBottomFp = object.yFp + dimensions.halfHeight * FP;
    const nextBottomFp = currentBottomFp + vyFp;
    const firstRow = Math.max(0, Math.floor(currentBottomFp / (terrain.cellSize * FP)));
    const lastRow = Math.min(terrain.height - 1, Math.floor(nextBottomFp / (terrain.cellSize * FP)));
    for (let row = firstRow; row <= lastRow; row += 1) {
        const surfaceFp = row * terrain.cellSize * FP;
        if (surfaceFp < currentBottomFp || surfaceFp > nextBottomFp) continue;
        for (let column = Math.max(0, left); column <= Math.min(terrain.width - 1, right); column += 1) {
            if (terrainSolid(terrain, column, row)) return surfaceFp - dimensions.halfHeight * FP;
        }
    }
    return null;
}

function assertClearObjectiveEnvelope(
    terrain: PackedTerrain,
    x: number,
    surfaceY: number,
    dimensions: Readonly<{ halfWidth: number; halfHeight: number }>,
    kind: V10R8ObjectiveKind
): void {
    const worldWidth = terrain.width * terrain.cellSize;
    const top = surfaceY - dimensions.halfHeight * 2;
    if (x - dimensions.halfWidth < 0 || x + dimensions.halfWidth > worldWidth || top < 0 ||
        surfaceY > terrain.height * terrain.cellSize) {
        throw new Error(`R8 ${kind} anchor envelope leaves the world.`);
    }
    const firstColumn = Math.floor((x - dimensions.halfWidth) / terrain.cellSize);
    const lastColumn = Math.floor((x + dimensions.halfWidth - 1) / terrain.cellSize);
    const firstRow = Math.floor(top / terrain.cellSize);
    const lastRow = Math.floor((surfaceY - 1) / terrain.cellSize);
    for (let row = firstRow; row <= lastRow; row += 1) {
        for (let column = firstColumn; column <= lastColumn; column += 1) {
            if (terrainSolid(terrain, column, row)) throw new Error(`R8 ${kind} anchor envelope intersects terrain.`);
        }
    }
}

function assertR7TerrainGeometry(terrain: PackedTerrain): void {
    if (terrain.width !== V10_R7_TERRAIN_WIDTH || terrain.height !== V10_R7_TERRAIN_HEIGHT ||
        terrain.cellSize !== V10_R7_TERRAIN_CELL_SIZE || terrain.words.length !== 576) {
        throw new Error('R8 objectives require the exact R7 terrain geometry.');
    }
}

function sameObjectiveObject(left: V10R8ObjectiveObject, right: V10R8ObjectiveObject): boolean {
    return left.id === right.id && left.kind === right.kind && left.owner === right.owner &&
        left.xFp === right.xFp && left.yFp === right.yFp && left.vyFp === right.vyFp &&
        left.grounded === right.grounded && left.support === right.support &&
        left.status === right.status && left.resolvedBy === right.resolvedBy;
}

function reject(current: SimulationStateV10R8, message: string): SimulationTransitionV10R8 {
    return { accepted: false, mutated: false, state: current, events: [],
        error: { code: 'COMMAND_REJECTED', message } };
}
