import { setTerrainSolid, type PackedTerrain } from './simulation';

const TERRAIN_WIDTH = 256;
const TERRAIN_HEIGHT = 72;
const TERRAIN_CELL_SIZE = 8;
const MINIMUM_SURFACE_ROW = 34;
const MAXIMUM_SURFACE_ROW = 54;

export const V10_LEGACY_SURFACE_GENERATOR_ID = 'v10-authored-profiles-v1' as const;
export const V10_PROCEDURAL_SURFACE_GENERATOR_ID = 'v10-surface-grammar-v1' as const;
export const V10_PROCEDURAL_CANDIDATE_COUNT = 8;

export type V10GeneratedSurface = Readonly<{
    rows: readonly number[];
    rngState: number;
    reflected: boolean;
    variation: number;
    phase: number;
}>;

export type V10ProceduralTerrainOperation = Readonly<
    | { kind: 'plateau'; row: number }
    | { kind: 'ramp'; start: number; end: number; delta: number }
    | { kind: 'hollow'; center: number; radius: number; depth: number }
    | { kind: 'jump-shelf'; start: number; width: number; rise: number }
    | { kind: 'notch'; center: number; radius: number; depth: number }
>;

export type V10ProceduralSurfaceCandidate = Readonly<{
    generatorId: typeof V10_PROCEDURAL_SURFACE_GENERATOR_ID;
    seed: number;
    candidateIndex: number;
    reflected: boolean;
    operations: readonly V10ProceduralTerrainOperation[];
    rows: readonly number[];
}>;

/**
 * Compatibility generator for the accepted V10 and V10E profile families.
 * Keep this path isolated from later procedural grammar changes: canonical
 * state hashes bind its exact rows and RNG state.
 */
export function generateLegacyV10Surface(seed: number, profileId: string): V10GeneratedSurface {
    const normalized = normalizeSeed(seed);
    let rngState = nextRandom(normalized);
    const variation = Number(rngState % 3) - 1;
    rngState = nextRandom(rngState);
    const reflected = (rngState & 1) === 1;
    rngState = nextRandom(rngState);
    const phase = Number(rngState % 17) - 8;
    const rows = Array.from({ length: TERRAIN_WIDTH }, (_, column) => {
        const authoredColumn = reflected ? TERRAIN_WIDTH - 1 - column : column;
        return legacySurfaceRow(profileId, authoredColumn, variation, phase);
    });
    return { rows, rngState, reflected, variation, phase };
}

/**
 * Builds one deterministic, product-authored grammar candidate. This is the
 * V10F preparation seam only: admission, scoring and ruleset wiring happen in
 * a later slice after the candidate gates are frozen.
 */
export function generateV10ProceduralSurfaceCandidate(
    seed: number,
    candidateIndex: number
): V10ProceduralSurfaceCandidate {
    if (!Number.isSafeInteger(candidateIndex) || candidateIndex < 0 ||
        candidateIndex >= V10_PROCEDURAL_CANDIDATE_COUNT) {
        throw new Error(`V10 procedural candidate index must be between 0 and ${V10_PROCEDURAL_CANDIDATE_COUNT - 1}.`);
    }
    const normalized = normalizeSeed(seed);
    const pick = (tag: string, minimum: number, maximum: number): number =>
        minimum + deriveTaggedSeed(normalized, candidateIndex, tag) % (maximum - minimum + 1);
    const nonZeroDelta = (value: number): number => value === 0
        ? (deriveTaggedSeed(normalized, candidateIndex, 'ramp-direction') & 1) === 0 ? -1 : 1
        : value;
    const reflected = (deriveTaggedSeed(normalized, candidateIndex, 'reflection') & 1) === 1;
    const leftHollowCenter = pick('left-hollow-center', 48, 76);
    const rightHollowCenter = pick('right-hollow-center', 180, 208);
    const operations: readonly V10ProceduralTerrainOperation[] = Object.freeze([
        Object.freeze({ kind: 'plateau', row: pick('plateau-row', 46, 50) }),
        Object.freeze({
            kind: 'ramp', start: pick('ramp-start', 24, 40), end: pick('ramp-end', 214, 230),
            delta: nonZeroDelta(pick('ramp-delta', -3, 3))
        }),
        Object.freeze({
            kind: 'hollow', center: leftHollowCenter,
            radius: pick('left-hollow-radius', 18, 28), depth: pick('left-hollow-depth', 2, 4)
        }),
        Object.freeze({
            kind: 'hollow', center: rightHollowCenter,
            radius: pick('right-hollow-radius', 18, 28), depth: pick('right-hollow-depth', 2, 4)
        }),
        Object.freeze({
            kind: 'jump-shelf', start: leftHollowCenter + pick('left-shelf-offset', 8, 14),
            width: pick('left-shelf-width', 8, 12), rise: pick('left-shelf-rise', 3, 6)
        }),
        Object.freeze({
            kind: 'jump-shelf', start: rightHollowCenter - pick('right-shelf-offset', 18, 25),
            width: pick('right-shelf-width', 8, 12), rise: pick('right-shelf-rise', 3, 6)
        }),
        Object.freeze({
            kind: 'notch', center: pick('notch-center', 116, 140),
            radius: pick('notch-radius', 5, 10), depth: pick('notch-depth', 2, 5)
        })
    ]);
    const authoredRows = Array<number>(TERRAIN_WIDTH).fill(48);
    for (const operation of operations) applyOperation(authoredRows, operation);
    const boundedRows = authoredRows.map(row => clamp(row, MINIMUM_SURFACE_ROW, MAXIMUM_SURFACE_ROW));
    const rows = Object.freeze(reflected ? boundedRows.reverse() : boundedRows);
    return Object.freeze({
        generatorId: V10_PROCEDURAL_SURFACE_GENERATOR_ID,
        seed: normalized,
        candidateIndex,
        reflected,
        operations,
        rows
    });
}

/** Converts one surface row per column into the existing packed collision mask. */
export function packV10SurfaceRows(rows: readonly number[]): PackedTerrain {
    if (rows.length !== TERRAIN_WIDTH || rows.some(row =>
        !Number.isSafeInteger(row) || row < 0 || row >= TERRAIN_HEIGHT)) {
        throw new Error(`V10 surface must contain ${TERRAIN_WIDTH} valid row indices.`);
    }
    const terrain: PackedTerrain = {
        width: TERRAIN_WIDTH,
        height: TERRAIN_HEIGHT,
        cellSize: TERRAIN_CELL_SIZE,
        words: new Array(TERRAIN_WIDTH * TERRAIN_HEIGHT / 32).fill(0)
    };
    for (let x = 0; x < terrain.width; x += 1) {
        for (let y = rows[x]; y < terrain.height; y += 1) setTerrainSolid(terrain, x, y, true);
    }
    return terrain;
}

function legacySurfaceRow(profileId: string, column: number, variation: number, phase: number): number {
    if (profileId === 'sheltered-folds') {
        const centre = 128 + phase;
        const distance = Math.abs(column - centre);
        const fold = distance >= 36 ? 0 : Math.min(8, Math.trunc((36 - distance) / 4));
        return clamp(47 + variation - fold, MINIMUM_SURFACE_ROW, MAXIMUM_SURFACE_ROW);
    }
    if (profileId === 'rising-braid') {
        const start = 84 + phase;
        const rise = clamp(Math.trunc((column - start) / 12), 0, 6);
        return clamp(48 + variation - rise, MINIMUM_SURFACE_ROW, MAXIMUM_SURFACE_ROW);
    }
    if (profileId === 'open-terraces') {
        const shifted = column - phase;
        const offset = shifted < 56 ? 1
            : shifted < 88 ? 0
                : shifted < 120 ? -1
                    : shifted < 152 ? 0
                        : shifted < 184 ? 1
                            : 0;
        return clamp(46 + variation + offset, MINIMUM_SURFACE_ROW, MAXIMUM_SURFACE_ROW);
    }
    const shifted = column - phase;
    if (profileId === 'twin-hollows') {
        return clamp(50 + variation - (shifted >= 100 && shifted < 156 ? 6 : 0), MINIMUM_SURFACE_ROW, MAXIMUM_SURFACE_ROW);
    }
    if (profileId === 'broken-loom') {
        const shelf = (shifted >= 96 && shifted < 124) || (shifted >= 132 && shifted < 160);
        return clamp(50 + variation - (shelf ? 4 : 0), MINIMUM_SURFACE_ROW, MAXIMUM_SURFACE_ROW);
    }
    if (profileId !== 'high-stitch') throw new Error(`Unknown legacy V10 terrain profile: ${profileId}.`);
    // High Stitch is intentionally asymmetric; reflection alternates which
    // opening owns the deeper shelter while both sides retain a jump lookout.
    if (shifted >= 92 && shifted < 160) return clamp(46 + variation, MINIMUM_SURFACE_ROW, MAXIMUM_SURFACE_ROW);
    if (shifted >= 160 && shifted < 164) return clamp(42 + variation, MINIMUM_SURFACE_ROW, MAXIMUM_SURFACE_ROW);
    if (shifted >= 164) return clamp(46 + variation, MINIMUM_SURFACE_ROW, MAXIMUM_SURFACE_ROW);
    return clamp(50 + variation, MINIMUM_SURFACE_ROW, MAXIMUM_SURFACE_ROW);
}

function applyOperation(rows: number[], operation: V10ProceduralTerrainOperation): void {
    if (operation.kind === 'plateau') {
        rows.fill(operation.row);
        return;
    }
    if (operation.kind === 'ramp') {
        const span = operation.end - operation.start;
        for (let column = operation.start; column < TERRAIN_WIDTH; column += 1) {
            const progress = Math.min(column - operation.start, span);
            rows[column] += Math.trunc(operation.delta * progress / span);
        }
        return;
    }
    if (operation.kind === 'jump-shelf') {
        for (let column = operation.start; column < operation.start + operation.width; column += 1) {
            rows[column] -= operation.rise;
        }
        return;
    }
    const start = Math.max(0, operation.center - operation.radius);
    const end = Math.min(TERRAIN_WIDTH - 1, operation.center + operation.radius);
    for (let column = start; column <= end; column += 1) {
        const distance = Math.abs(column - operation.center);
        const amount = Math.ceil(operation.depth * (operation.radius - distance) / operation.radius);
        if (operation.kind === 'hollow' || operation.kind === 'notch') rows[column] += amount;
    }
}

function deriveTaggedSeed(seed: number, candidateIndex: number, tag: string): number {
    let value = (seed ^ Math.imul(candidateIndex + 1, 0x9E3779B1)) >>> 0;
    for (let index = 0; index < tag.length; index += 1) {
        value = Math.imul(value ^ tag.charCodeAt(index), 0x01000193) >>> 0;
    }
    value = Math.imul(value ^ (value >>> 16), 0x85EBCA6B) >>> 0;
    value = Math.imul(value ^ (value >>> 13), 0xC2B2AE35) >>> 0;
    return (value ^ (value >>> 16)) >>> 0;
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

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
}
