import { z } from 'zod';
import {
    applySimulationBarrierV9, applySimulationIntentV9, advanceSimulationTicksV9,
    assertSimulationInvariantsV9, cloneSimulationV9, createSimulationV9, forceSimulationLimitV9,
    SimulationBarrierV9Schema, SimulationIntentV9Schema, SimulationStateV9Schema,
    type SimulationBarrierV9, type SimulationEventV9, type SimulationIntentV9,
    type SimulationStateV9, type SimulationTransitionV9, type SimulationUnitV9
} from './simulation-v9';
import {
    SIM_RULES, setTerrainSolid, terrainSolid,
    type PackedTerrain, type PlayerCalling
} from './simulation';

/** Product-owned V10 terrain/start authority. V9 mechanics remain immutable. */
export const V10_RULESET_ID = 'nimble-knots-artillery-v10' as const;
export const V10_RULESET_VERSION = 10 as const;
export const V10_TERRAIN_PROFILE_IDS = Object.freeze([
    'sheltered-folds',
    'rising-braid',
    'open-terraces'
] as const);
export type V10TerrainProfileId = typeof V10_TERRAIN_PROFILE_IDS[number];

export const V10_PROFILE_RULES = Object.freeze({
    'sheltered-folds': Object.freeze({ separation: 512, minimumHeightDifference: 0, maximumHeightDifference: 24 }),
    'rising-braid': Object.freeze({ separation: 576, minimumHeightDifference: 32, maximumHeightDifference: 64 }),
    'open-terraces': Object.freeze({ separation: 640, minimumHeightDifference: 0, maximumHeightDifference: 24 })
} satisfies Readonly<Record<V10TerrainProfileId, Readonly<{
    separation: number; minimumHeightDifference: number; maximumHeightDifference: number;
}>>>);

export const V10_OPENING_RULES = Object.freeze({
    safeWorldMargin: SIM_RULES.actorRadius + SIM_RULES.movementPerTurn,
    outwardMovement: SIM_RULES.movementPerTurn,
    movementStep: SIM_RULES.movementStep,
    maximumRouteStep: 8
});

export type V10OpeningPair = Readonly<{
    leftX: number;
    rightX: number;
    leftSurfaceY: number;
    rightSurfaceY: number;
    score: Readonly<{
        profileFit: number;
        combinedLocalMobility: number;
        centerBias: number;
        tieBreak: number;
    }>;
}>;

export type V10TacticalArena = Readonly<{
    terrain: PackedTerrain;
    rngState: number;
    profileId: V10TerrainProfileId;
    reflected: boolean;
    variation: number;
    phase: number;
    opening: V10OpeningPair;
    evaluatedPairs: number;
    eligiblePairs: number;
}>;

export type SimulationStateV10 = Omit<SimulationStateV9, 'formatVersion' | 'rulesetId' | 'rulesetVersion'> & {
    formatVersion: 10;
    rulesetId: typeof V10_RULESET_ID;
    rulesetVersion: 10;
    terrainProfileId: V10TerrainProfileId;
};
export type SimulationIntentV10 = SimulationIntentV9;
export type SimulationBarrierV10 = SimulationBarrierV9;
export type SimulationEventV10 = SimulationEventV9;
export type SimulationTransitionV10 = Omit<SimulationTransitionV9, 'state'> & { state: SimulationStateV10 };

export const SimulationStateV10Schema = SimulationStateV9Schema.omit({
    formatVersion: true, rulesetId: true, rulesetVersion: true
}).extend({
    formatVersion: z.literal(10),
    rulesetId: z.literal(V10_RULESET_ID),
    rulesetVersion: z.literal(10),
    terrainProfileId: z.enum(V10_TERRAIN_PROFILE_IDS)
}).strict();
export const SimulationIntentV10Schema = SimulationIntentV9Schema;
export const SimulationBarrierV10Schema = SimulationBarrierV9Schema;

export function v10TerrainProfileForSeed(seed: number): V10TerrainProfileId {
    const normalized = normalizeSeed(seed);
    return V10_TERRAIN_PROFILE_IDS[normalized % V10_TERRAIN_PROFILE_IDS.length];
}

export function generateV10TacticalArena(seed: number): V10TacticalArena {
    const normalized = normalizeSeed(seed);
    const profileId = v10TerrainProfileForSeed(normalized);
    let rngState = nextRandom(normalized);
    const variation = Number(rngState % 3) - 1;
    rngState = nextRandom(rngState);
    const reflected = (rngState & 1) === 1;
    rngState = nextRandom(rngState);
    const phase = Number(rngState % 17) - 8;
    const rows = Array.from({ length: 256 }, (_, column) => {
        const authoredColumn = reflected ? 255 - column : column;
        return surfaceRow(profileId, authoredColumn, variation, phase);
    });
    const terrain = terrainFromRows(rows);
    const selected = selectV10OpeningPair(terrain, normalized, profileId);
    return { terrain, rngState, profileId, reflected, variation, phase, ...selected };
}

export function selectV10OpeningPair(
    terrain: PackedTerrain,
    seed: number,
    profileId: V10TerrainProfileId
): { opening: V10OpeningPair; evaluatedPairs: number; eligiblePairs: number } {
    const rules = V10_PROFILE_RULES[profileId];
    const firstX = alignUp(V10_OPENING_RULES.safeWorldMargin, terrain.cellSize);
    const lastX = terrain.width * terrain.cellSize - V10_OPENING_RULES.safeWorldMargin - rules.separation;
    let opening: V10OpeningPair | undefined;
    let evaluatedPairs = 0;
    let eligiblePairs = 0;
    for (let leftX = firstX; leftX <= lastX; leftX += terrain.cellSize) {
        evaluatedPairs += 1;
        const candidate = evaluateOpening(terrain, normalizeSeed(seed), profileId, leftX, leftX + rules.separation);
        if (!candidate) continue;
        eligiblePairs += 1;
        if (!opening || compareOpenings(candidate, opening) < 0) opening = candidate;
    }
    if (!opening) throw new Error(`V10 ${profileId} terrain has no eligible opening pair.`);
    return { opening, evaluatedPairs, eligiblePairs };
}

export function evaluateV10OpeningPair(
    terrain: PackedTerrain,
    seed: number,
    profileId: V10TerrainProfileId,
    firstX: number,
    secondX: number
): V10OpeningPair {
    const opening = evaluateOpening(
        terrain, normalizeSeed(seed), profileId,
        Math.min(firstX, secondX), Math.max(firstX, secondX)
    );
    if (!opening) throw new Error(`V10 ${profileId} opening pair lacks valid support or movement geometry.`);
    return opening;
}

export function createSimulationV10(seed: number, calling: PlayerCalling): SimulationStateV10 {
    const base = createV9Base(seed, calling);
    const arena = generateV10TacticalArena(base.seed);
    const state: SimulationStateV10 = {
        ...base,
        formatVersion: 10,
        rulesetId: V10_RULESET_ID,
        rulesetVersion: 10,
        rngState: arena.rngState,
        terrainProfileId: arena.profileId,
        terrain: arena.terrain,
        units: base.units.map((unit, index) => {
            const x = index === 0 ? arena.opening.leftX : arena.opening.rightX;
            const surfaceY = index === 0 ? arena.opening.leftSurfaceY : arena.opening.rightSurfaceY;
            return {
                ...unit,
                xFp: x * 256,
                yFp: (surfaceY - SIM_RULES.actorRadius) * 256,
                facing: index === 0 ? 1 : -1,
                support: terrainSupport(arena.terrain, x, surfaceY)
            };
        }) as [SimulationUnitV9, SimulationUnitV9]
    };
    assertSimulationInvariantsV10(state);
    return state;
}

export function applySimulationIntentV10(
    current: SimulationStateV10,
    actor: Parameters<typeof applySimulationIntentV9>[1],
    intent: SimulationIntentV10,
    expectedTurn: number,
    expectedPhase = current.phase,
    expectedEpoch = current.inputEpoch
): SimulationTransitionV10 {
    assertSimulationInvariantsV10(current);
    return fromV9Transition(
        applySimulationIntentV9(toV9(current), actor, intent, expectedTurn, expectedPhase, expectedEpoch),
        current
    );
}

export function advanceSimulationTicksV10(current: SimulationStateV10, count: number): SimulationTransitionV10 {
    assertSimulationInvariantsV10(current);
    return fromV9Transition(advanceSimulationTicksV9(toV9(current), count), current);
}

export function applySimulationBarrierV10(
    current: SimulationStateV10,
    barrier: SimulationBarrierV10
): SimulationTransitionV10 {
    assertSimulationInvariantsV10(current);
    return fromV9Transition(applySimulationBarrierV9(toV9(current), barrier), current);
}

export function forceSimulationLimitV10(current: SimulationStateV10): SimulationTransitionV10 {
    assertSimulationInvariantsV10(current);
    return fromV9Transition(forceSimulationLimitV9(toV9(current)), current);
}

export function cloneSimulationV10(state: SimulationStateV10): SimulationStateV10 {
    const cloned = cloneSimulationV9(toV9(state));
    return fromV9(cloned, state.terrainProfileId);
}

/**
 * Detached compatibility view for the frozen V9 planner. V10 authority keeps
 * its own identity and terrain profile; the planner receives only a deep V9
 * clone and therefore cannot mutate or relabel the live V10 state.
 */
export function simulationV9ViewOfV10(state: SimulationStateV10): SimulationStateV9 {
    assertSimulationInvariantsV10(state);
    return cloneSimulationV9(toV9(state));
}

export function assertSimulationInvariantsV10(state: SimulationStateV10): void {
    if (!SimulationStateV10Schema.safeParse(state).success) throw new Error('Invalid V10 state: schema.');
    if (state.terrainProfileId !== v10TerrainProfileForSeed(state.seed)) {
        throw new Error('Invalid V10 state: terrain profile does not match seed.');
    }
    assertSimulationInvariantsV9(toV9(state));
}

export function canonicalSimulationJsonV10(state: SimulationStateV10): string {
    assertSimulationInvariantsV10(state);
    return canonicalJson(state);
}

export function hashSimulationStateV10(state: SimulationStateV10): string {
    return sha256(new TextEncoder().encode(canonicalSimulationJsonV10(state)));
}

function createV9Base(seed: number, calling: PlayerCalling): SimulationStateV9 {
    return createSimulationV9(normalizeSeed(seed), calling);
}

function fromV9Transition(result: SimulationTransitionV9, current: SimulationStateV10): SimulationTransitionV10 {
    if (!result.mutated) return { ...result, state: current };
    const state = fromV9(result.state, current.terrainProfileId);
    assertSimulationInvariantsV10(state);
    return { ...result, state };
}

function toV9(state: SimulationStateV10): SimulationStateV9 {
    const { terrainProfileId: _profile, ...common } = state;
    return { ...common, formatVersion: 9, rulesetId: 'nimble-knots-artillery-v9', rulesetVersion: 9 };
}

function fromV9(state: SimulationStateV9, terrainProfileId: V10TerrainProfileId): SimulationStateV10 {
    return { ...state, formatVersion: 10, rulesetId: V10_RULESET_ID, rulesetVersion: 10, terrainProfileId };
}

function surfaceRow(
    profileId: V10TerrainProfileId,
    column: number,
    variation: number,
    phase: number
): number {
    if (profileId === 'sheltered-folds') {
        const centre = 128 + phase;
        const distance = Math.abs(column - centre);
        const fold = distance >= 36 ? 0 : Math.min(8, Math.trunc((36 - distance) / 4));
        return clamp(47 + variation - fold, 34, 54);
    }
    if (profileId === 'rising-braid') {
        const start = 84 + phase;
        const rise = clamp(Math.trunc((column - start) / 12), 0, 6);
        return clamp(48 + variation - rise, 34, 54);
    }
    const shifted = column - phase;
    const offset = shifted < 56 ? 1
        : shifted < 88 ? 0
            : shifted < 120 ? -1
                : shifted < 152 ? 0
                    : shifted < 184 ? 1
                        : 0;
    return clamp(46 + variation + offset, 34, 54);
}

function terrainFromRows(rows: readonly number[]): PackedTerrain {
    const terrain: PackedTerrain = {
        width: 256,
        height: 72,
        cellSize: 8,
        words: new Array(576).fill(0)
    };
    for (let x = 0; x < terrain.width; x += 1) {
        for (let y = rows[x]; y < terrain.height; y += 1) setTerrainSolid(terrain, x, y, true);
    }
    return terrain;
}

function evaluateOpening(
    terrain: PackedTerrain,
    seed: number,
    profileId: V10TerrainProfileId,
    leftX: number,
    rightX: number
): V10OpeningPair | null {
    const rules = V10_PROFILE_RULES[profileId];
    const worldWidth = terrain.width * terrain.cellSize;
    if (!Number.isSafeInteger(leftX) || !Number.isSafeInteger(rightX) ||
        leftX % terrain.cellSize !== 0 || rightX % terrain.cellSize !== 0 ||
        rightX - leftX !== rules.separation || leftX < V10_OPENING_RULES.safeWorldMargin ||
        rightX > worldWidth - V10_OPENING_RULES.safeWorldMargin) return null;
    const leftSurfaceY = bodyClearSurfaceY(terrain, leftX);
    const rightSurfaceY = bodyClearSurfaceY(terrain, rightX);
    if (leftSurfaceY === null || rightSurfaceY === null) return null;
    const heightDifference = Math.abs(rightSurfaceY - leftSurfaceY);
    if (heightDifference < rules.minimumHeightDifference || heightDifference > rules.maximumHeightDifference) return null;
    const outwardSteps = V10_OPENING_RULES.outwardMovement / V10_OPENING_RULES.movementStep;
    if (movementReach(terrain, leftX, -1) < outwardSteps || movementReach(terrain, rightX, 1) < outwardSteps ||
        !hasContinuousRoute(terrain, leftX, rightX)) return null;
    const combinedLocalMobility = ([-1, 1] as const).reduce((total, direction) =>
        total + movementReach(terrain, leftX, direction) + movementReach(terrain, rightX, direction), 0);
    return {
        leftX, rightX, leftSurfaceY, rightSurfaceY,
        score: {
            profileFit: profileFit(terrain, profileId, leftX, rightX, leftSurfaceY, rightSurfaceY),
            combinedLocalMobility,
            centerBias: Math.abs(leftX + rightX - worldWidth),
            tieBreak: pairTieBreak(seed, leftX, rightX)
        }
    };
}

function profileFit(
    terrain: PackedTerrain,
    profileId: V10TerrainProfileId,
    leftX: number,
    rightX: number,
    leftSurfaceY: number,
    rightSurfaceY: number
): number {
    if (profileId === 'rising-braid') return Math.abs(rightSurfaceY - leftSurfaceY);
    let minimumSurface = Number.MAX_SAFE_INTEGER;
    let maximumSurface = 0;
    for (let x = leftX; x <= rightX; x += terrain.cellSize) {
        const surface = surfaceY(terrain, x);
        minimumSurface = Math.min(minimumSurface, surface);
        maximumSurface = Math.max(maximumSurface, surface);
    }
    if (profileId === 'sheltered-folds') {
        return Math.min(leftSurfaceY, rightSurfaceY) - minimumSurface;
    }
    return 256 - (maximumSurface - minimumSurface);
}

function bodyClearSurfaceY(terrain: PackedTerrain, x: number): number | null {
    const supportY = surfaceY(terrain, x);
    if (supportY >= terrain.height * terrain.cellSize) return null;
    const leftColumn = Math.floor((x - SIM_RULES.actorRadius) / terrain.cellSize);
    const rightColumn = Math.ceil((x + SIM_RULES.actorRadius) / terrain.cellSize) - 1;
    const topRow = Math.max(0, Math.floor((supportY - SIM_RULES.actorRadius * 2) / terrain.cellSize));
    const bottomRow = Math.floor((supportY - 1) / terrain.cellSize);
    for (let column = leftColumn; column <= rightColumn; column += 1) {
        for (let row = topRow; row <= bottomRow; row += 1) {
            if (terrainSolid(terrain, column, row)) return null;
        }
    }
    return supportY;
}

function movementReach(terrain: PackedTerrain, startX: number, direction: -1 | 1): number {
    let x = startX;
    let surface = surfaceY(terrain, x);
    let steps = 0;
    const maximumSteps = V10_OPENING_RULES.outwardMovement / V10_OPENING_RULES.movementStep;
    while (steps < maximumSteps) {
        const targetX = x + direction * V10_OPENING_RULES.movementStep;
        if (targetX < SIM_RULES.actorRadius || targetX > terrain.width * terrain.cellSize - SIM_RULES.actorRadius - 1) break;
        const targetSurface = surfaceY(terrain, targetX);
        if (targetSurface >= terrain.height * terrain.cellSize || Math.abs(targetSurface - surface) > V10_OPENING_RULES.maximumRouteStep) break;
        x = targetX;
        surface = targetSurface;
        steps += 1;
    }
    return steps;
}

function hasContinuousRoute(terrain: PackedTerrain, leftX: number, rightX: number): boolean {
    let previous = surfaceY(terrain, leftX);
    for (let x = leftX + terrain.cellSize; x <= rightX; x += terrain.cellSize) {
        const next = surfaceY(terrain, x);
        if (next >= terrain.height * terrain.cellSize || Math.abs(next - previous) > V10_OPENING_RULES.maximumRouteStep) return false;
        previous = next;
    }
    return true;
}

function terrainSupport(terrain: PackedTerrain, x: number, supportY: number): number {
    const row = supportY / terrain.cellSize;
    const first = Math.max(0, Math.floor((x - SIM_RULES.actorRadius) / terrain.cellSize));
    const last = Math.min(terrain.width - 1, Math.ceil((x + SIM_RULES.actorRadius) / terrain.cellSize) - 1);
    for (let column = first; column <= last; column += 1) {
        if (terrainSolid(terrain, column, row)) return row * terrain.width + column;
    }
    throw new Error('V10 opening has no authoritative support cell.');
}

function surfaceY(terrain: PackedTerrain, worldX: number): number {
    const column = clamp(Math.floor(worldX / terrain.cellSize), 0, terrain.width - 1);
    for (let row = 0; row < terrain.height; row += 1) {
        if (terrainSolid(terrain, column, row)) return row * terrain.cellSize;
    }
    return terrain.height * terrain.cellSize;
}

function compareOpenings(first: V10OpeningPair, second: V10OpeningPair): number {
    return second.score.profileFit - first.score.profileFit ||
        second.score.combinedLocalMobility - first.score.combinedLocalMobility ||
        first.score.centerBias - second.score.centerBias ||
        first.score.tieBreak - second.score.tieBreak ||
        first.leftX - second.leftX;
}

function pairTieBreak(seed: number, leftX: number, rightX: number): number {
    let mixed = seed ^ Math.imul(leftX, 0x27D4EB2D) ^ Math.imul(rightX, 0x165667B1);
    mixed = Math.imul(mixed ^ (mixed >>> 15), 0x85EBCA6B);
    mixed = Math.imul(mixed ^ (mixed >>> 13), 0xC2B2AE35);
    return (mixed ^ (mixed >>> 16)) >>> 0;
}

function normalizeSeed(seed: number): number {
    if (!Number.isFinite(seed)) throw new Error('V10 seed must be finite.');
    const normalized = Math.trunc(seed) >>> 0;
    return normalized === 0 ? 0x6D2B79F5 : normalized;
}

function nextRandom(state: number): number {
    let value = state >>> 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return value >>> 0;
}

function alignUp(value: number, step: number): number {
    return Math.ceil(value / step) * step;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
}

function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value !== null && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

/** Browser-compatible synchronous SHA-256, kept byte-identical to V9. */
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
