import { setTerrainSolid, type PackedTerrain } from './simulation';

const TERRAIN_WIDTH = 256;
const TERRAIN_HEIGHT = 72;
const TERRAIN_CELL_SIZE = 8;
const MINIMUM_SURFACE_ROW = 34;
const MAXIMUM_SURFACE_ROW = 54;

export const V10_AUTHORING_WIDTH = 32;
export const V10_AUTHORING_EXPANSION = TERRAIN_WIDTH / V10_AUTHORING_WIDTH;
export const V10_LEGACY_SURFACE_GENERATOR_ID = 'v10-authored-profiles-v1' as const;
export const V10_PROCEDURAL_SURFACE_GENERATOR_ID = 'v10-surface-grammar-v1' as const;
export const V10_PROCEDURAL_RECIPE_REVISION = 'v10f-recipes-r1' as const;
export const V10_PROCEDURAL_CANDIDATE_COUNT = 8;
export const V10_PROCEDURAL_FALLBACK_CANDIDATE_INDEX = 0;
export const V10_PROCEDURAL_TERRAIN_PROFILE_IDS = Object.freeze([
    'twin-crests',
    'asymmetric-rampart',
    'trench-needle',
    'stepping-mesa'
] as const);
export type V10ProceduralTerrainProfileId = typeof V10_PROCEDURAL_TERRAIN_PROFILE_IDS[number];

export const V10_PROCEDURAL_OPERATION_LIMITS = Object.freeze({
    plateau: Object.freeze({ minimumWidth: 3, maximumWidth: 5 }),
    ramp: Object.freeze({ minimumWidth: 2, maximumWidth: 4, minimumDelta: 1, maximumDelta: 3 }),
    hollow: Object.freeze({ minimumWidth: 3, maximumWidth: 6, minimumDepth: 2, maximumDepth: 5 }),
    ridge: Object.freeze({ minimumWidth: 3, maximumWidth: 5, minimumHeight: 3, maximumHeight: 6 }),
    'jump-shelf': Object.freeze({ minimumWidth: 2, maximumWidth: 3, minimumRise: 3, maximumRise: 6 }),
    notch: Object.freeze({ minimumWidth: 1, maximumWidth: 2, minimumDepth: 3, maximumDepth: 5 }),
    'asymmetric-elevation': Object.freeze({ minimumWidth: 1, maximumWidth: 16, minimumDelta: 3, maximumDelta: 6 })
});

export type V10GeneratedSurface = Readonly<{
    rows: readonly number[];
    rngState: number;
    reflected: boolean;
    variation: number;
    phase: number;
}>;

export type V10ProceduralTerrainOperation = Readonly<
    | { kind: 'plateau'; start: number; width: number }
    | { kind: 'ramp'; start: number; width: number; delta: number }
    | { kind: 'hollow'; start: number; width: number; depth: number }
    | { kind: 'ridge'; start: number; width: number; height: number }
    | { kind: 'jump-shelf'; start: number; width: number; rise: number }
    | { kind: 'notch'; start: number; width: number; depth: number }
    | { kind: 'asymmetric-elevation'; start: number; width: number; delta: number }
>;

type ParameterRange = Readonly<{ minimum: number; maximum: number; fallback: number }>;
type RecipeSegment = Readonly<{
    kind: V10ProceduralTerrainOperation['kind'];
    width: number;
    tag: string;
    value?: ParameterRange;
}>;

export type V10ProceduralJumpLandmark = Readonly<{
    takeoffColumn: number;
    landingColumn: number;
}>;

export type V10ProceduralTerrainRecipe = Readonly<{
    id: V10ProceduralTerrainProfileId;
    revision: typeof V10_PROCEDURAL_RECIPE_REVISION;
    transform: 'mirror' | 'seed-reflect' | 'none';
    baseRow: ParameterRange;
    segments: readonly RecipeSegment[];
    openingColumns: readonly [number, number];
    jumpLandmarks: readonly V10ProceduralJumpLandmark[];
}>;

export type V10ProceduralSurfaceCandidate = Readonly<{
    generatorId: typeof V10_PROCEDURAL_SURFACE_GENERATOR_ID;
    recipeRevision: typeof V10_PROCEDURAL_RECIPE_REVISION;
    profileId: V10ProceduralTerrainProfileId;
    seed: number;
    candidateIndex: number;
    reflected: boolean;
    baseRow: number;
    operations: readonly V10ProceduralTerrainOperation[];
    openingColumns: readonly [number, number];
    jumpLandmarks: readonly V10ProceduralJumpLandmark[];
    authoringRows: readonly number[];
    rows: readonly number[];
    ascii: string;
}>;

const range = (minimum: number, maximum: number, fallback: number): ParameterRange =>
    Object.freeze({ minimum, maximum, fallback });
const segment = (
    kind: RecipeSegment['kind'], width: number, tag: string, value?: ParameterRange
): RecipeSegment => Object.freeze({ kind, width, tag, ...(value ? { value } : {}) });
const openings = (left: number, right: number): readonly [number, number] =>
    Object.freeze([left, right]) as readonly [number, number];

/** Product-authored machine recipes. Their fixed segment widths total 32. */
export const V10_PROCEDURAL_TERRAIN_RECIPES: Readonly<Record<
    V10ProceduralTerrainProfileId,
    V10ProceduralTerrainRecipe
>> = Object.freeze({
    'twin-crests': Object.freeze({
        id: 'twin-crests', revision: V10_PROCEDURAL_RECIPE_REVISION, transform: 'mirror',
        baseRow: range(47, 49, 48),
        segments: Object.freeze([
            segment('plateau', 4, 'left-plateau'),
            segment('ridge', 3, 'edge-ridge', range(3, 5, 4)),
            segment('hollow', 4, 'pocket-depth', range(2, 4, 3)),
            segment('jump-shelf', 2, 'firing-shelf', range(3, 5, 4)),
            segment('notch', 1, 'crest-notch', range(3, 5, 4)),
            segment('ridge', 4, 'center-crest', range(4, 6, 5)),
            segment('notch', 1, 'crest-notch', range(3, 5, 4)),
            segment('jump-shelf', 2, 'firing-shelf', range(3, 5, 4)),
            segment('hollow', 4, 'pocket-depth', range(2, 4, 3)),
            segment('ridge', 3, 'edge-ridge', range(3, 5, 4)),
            segment('plateau', 4, 'right-plateau')
        ]),
        openingColumns: openings(9, 22),
        jumpLandmarks: Object.freeze([
            Object.freeze({ takeoffColumn: 10, landingColumn: 11 }),
            Object.freeze({ takeoffColumn: 21, landingColumn: 20 })
        ])
    }),
    'asymmetric-rampart': Object.freeze({
        id: 'asymmetric-rampart', revision: V10_PROCEDURAL_RECIPE_REVISION, transform: 'seed-reflect',
        baseRow: range(41, 43, 42),
        segments: Object.freeze([
            segment('plateau', 5, 'high-plateau'),
            segment('asymmetric-elevation', 5, 'side-offset', range(3, 5, 4)),
            segment('ramp', 4, 'descending-ramp', range(1, 2, 2)),
            segment('jump-shelf', 3, 'siege-shelf', range(3, 5, 4)),
            segment('notch', 1, 'shelf-notch', range(3, 5, 4)),
            segment('hollow', 5, 'deep-pocket', range(3, 5, 4)),
            segment('ridge', 4, 'cover-ridge', range(3, 5, 4)),
            segment('plateau', 5, 'low-plateau')
        ]),
        openingColumns: openings(12, 21),
        jumpLandmarks: Object.freeze([
            Object.freeze({ takeoffColumn: 13, landingColumn: 14 })
        ])
    }),
    'trench-needle': Object.freeze({
        id: 'trench-needle', revision: V10_PROCEDURAL_RECIPE_REVISION, transform: 'mirror',
        baseRow: range(46, 48, 47),
        segments: Object.freeze([
            segment('plateau', 3, 'left-plateau'),
            segment('hollow', 3, 'outer-hollow', range(2, 4, 3)),
            segment('ridge', 3, 'needle-ridge', range(3, 5, 4)),
            segment('notch', 1, 'outer-notch', range(3, 5, 4)),
            segment('hollow', 5, 'inner-hollow', range(2, 4, 3)),
            segment('jump-shelf', 2, 'pit-shelf', range(3, 5, 4)),
            segment('hollow', 5, 'inner-hollow', range(2, 4, 3)),
            segment('notch', 1, 'outer-notch', range(3, 5, 4)),
            segment('ridge', 3, 'needle-ridge', range(3, 5, 4)),
            segment('hollow', 3, 'outer-hollow', range(2, 4, 3)),
            segment('plateau', 3, 'right-plateau')
        ]),
        openingColumns: openings(12, 19),
        jumpLandmarks: Object.freeze([
            Object.freeze({ takeoffColumn: 14, landingColumn: 15 }),
            Object.freeze({ takeoffColumn: 17, landingColumn: 16 })
        ])
    }),
    'stepping-mesa': Object.freeze({
        id: 'stepping-mesa', revision: V10_PROCEDURAL_RECIPE_REVISION, transform: 'mirror',
        baseRow: range(47, 49, 48),
        segments: Object.freeze([
            segment('plateau', 4, 'left-plateau'),
            segment('hollow', 5, 'nest-hollow', range(2, 4, 3)),
            segment('jump-shelf', 3, 'mesa-shelf', range(3, 5, 4)),
            segment('notch', 2, 'peak-notch', range(3, 5, 4)),
            segment('ridge', 4, 'central-peak', range(4, 6, 5)),
            segment('notch', 2, 'peak-notch', range(3, 5, 4)),
            segment('jump-shelf', 3, 'mesa-shelf', range(3, 5, 4)),
            segment('hollow', 5, 'nest-hollow', range(2, 4, 3)),
            segment('plateau', 4, 'right-plateau')
        ]),
        openingColumns: openings(7, 24),
        jumpLandmarks: Object.freeze([
            Object.freeze({ takeoffColumn: 8, landingColumn: 9 }),
            Object.freeze({ takeoffColumn: 23, landingColumn: 22 })
        ])
    })
});

/** Compatibility path for accepted V10/V10E hashes. */
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

export function v10ProceduralTerrainProfileForSeed(seed: number): V10ProceduralTerrainProfileId {
    const normalized = normalizeSeed(seed);
    return V10_PROCEDURAL_TERRAIN_PROFILE_IDS[normalized % V10_PROCEDURAL_TERRAIN_PROFILE_IDS.length];
}

export function generateV10ProceduralSurfaceCandidates(
    seed: number,
    profileId: V10ProceduralTerrainProfileId = v10ProceduralTerrainProfileForSeed(seed)
): readonly V10ProceduralSurfaceCandidate[] {
    return Object.freeze(Array.from({ length: V10_PROCEDURAL_CANDIDATE_COUNT }, (_, candidateIndex) =>
        generateV10ProceduralSurfaceCandidate(seed, candidateIndex, profileId)));
}

export function generateV10ProceduralSurfaceCandidate(
    seed: number,
    candidateIndex: number,
    profileId: V10ProceduralTerrainProfileId = v10ProceduralTerrainProfileForSeed(seed)
): V10ProceduralSurfaceCandidate {
    if (!Number.isSafeInteger(candidateIndex) || candidateIndex < 0 ||
        candidateIndex >= V10_PROCEDURAL_CANDIDATE_COUNT) {
        throw new Error(`V10 procedural candidate index must be between 0 and ${V10_PROCEDURAL_CANDIDATE_COUNT - 1}.`);
    }
    const recipe = V10_PROCEDURAL_TERRAIN_RECIPES[profileId];
    if (!recipe) throw new Error(`Unknown V10 procedural terrain profile: ${profileId}.`);
    const normalized = normalizeSeed(seed);
    const choose = (tag: string, limits: ParameterRange): number => candidateIndex === 0
        ? limits.fallback
        : limits.minimum + deriveTaggedSeed(
            normalized, candidateIndex, `${recipe.id}/${recipe.revision}/${tag}`
        ) % (limits.maximum - limits.minimum + 1);
    const baseRow = choose('base-row', recipe.baseRow);
    let start = 0;
    const values = new Map<string, number>();
    const operations = recipe.segments.map(item => {
        const operationStart = start;
        start += item.width;
        const value = item.value ? values.get(item.tag) ?? choose(item.tag, item.value) : undefined;
        if (value !== undefined) values.set(item.tag, value);
        return resolvedOperation(item, operationStart, value);
    });
    if (start !== V10_AUTHORING_WIDTH) {
        throw new Error(`V10 ${recipe.id} recipe must cover exactly ${V10_AUTHORING_WIDTH} authoring columns.`);
    }
    const authoredRows = compileV10ProceduralOperations(baseRow, operations);
    const reflected = recipe.transform === 'seed-reflect' &&
        (deriveTaggedSeed(normalized, 0, `${recipe.id}/${recipe.revision}/reflection`) & 1) === 1;
    const rows = Object.freeze(reflected ? [...authoredRows].reverse() : [...authoredRows]);
    const authoringRows = Object.freeze(Array.from({ length: V10_AUTHORING_WIDTH }, (_, column) =>
        rows[column * V10_AUTHORING_EXPANSION + Math.trunc(V10_AUTHORING_EXPANSION / 2)]));
    const openingColumns = transformOpeningColumns(recipe.openingColumns, reflected);
    const jumpLandmarks = transformJumpLandmarks(recipe.jumpLandmarks, reflected);
    const candidate = {
        generatorId: V10_PROCEDURAL_SURFACE_GENERATOR_ID,
        recipeRevision: V10_PROCEDURAL_RECIPE_REVISION,
        profileId: recipe.id,
        seed: normalized,
        candidateIndex,
        reflected,
        baseRow,
        operations: Object.freeze(operations),
        openingColumns,
        jumpLandmarks,
        authoringRows,
        rows,
        ascii: ''
    } satisfies V10ProceduralSurfaceCandidate;
    return Object.freeze({ ...candidate, ascii: renderV10ProceduralAscii(candidate) });
}

export function compileV10ProceduralOperations(
    baseRow: number,
    operations: readonly V10ProceduralTerrainOperation[]
): readonly number[] {
    if (!Number.isSafeInteger(baseRow)) throw new Error('V10 procedural base row must be an integer.');
    const rows: number[] = [];
    let currentRow = baseRow;
    let expectedStart = 0;
    for (const operation of operations) {
        validateOperation(operation);
        if (operation.start !== expectedStart) throw new Error('V10 procedural operations must be contiguous.');
        const span = operation.width * V10_AUTHORING_EXPANSION;
        if (operation.kind === 'plateau') {
            rows.push(...Array<number>(span).fill(currentRow));
        } else if (operation.kind === 'ramp' || operation.kind === 'asymmetric-elevation') {
            for (let index = 0; index < span; index += 1) {
                rows.push(currentRow + Math.round(operation.delta * (index + 1) / span));
            }
            currentRow += operation.delta;
        } else if (operation.kind === 'jump-shelf') {
            rows.push(...Array<number>(span).fill(currentRow - operation.rise));
        } else if (operation.kind === 'notch') {
            rows.push(...Array<number>(span).fill(currentRow + operation.depth));
        } else {
            const amount = operation.kind === 'hollow' ? operation.depth : -operation.height;
            const maximumDistance = Math.max(1, Math.floor((span - 1) / 2));
            for (let index = 0; index < span; index += 1) {
                const distance = Math.min(index, span - 1 - index);
                rows.push(currentRow + Math.round(amount * distance / maximumDistance));
            }
        }
        expectedStart += operation.width;
    }
    if (expectedStart !== V10_AUTHORING_WIDTH || rows.length !== TERRAIN_WIDTH) {
        throw new Error(`V10 procedural operations must compile to exactly ${TERRAIN_WIDTH} collision columns.`);
    }
    return Object.freeze(rows.map(row => clamp(row, MINIMUM_SURFACE_ROW, MAXIMUM_SURFACE_ROW)));
}

export function renderV10ProceduralAscii(
    surface: Pick<V10ProceduralSurfaceCandidate,
        'profileId' | 'recipeRevision' | 'candidateIndex' | 'reflected' | 'authoringRows'>
): string {
    if (surface.authoringRows.length !== V10_AUTHORING_WIDTH) {
        throw new Error(`V10 ASCII preview requires ${V10_AUTHORING_WIDTH} authoring rows.`);
    }
    const minimum = Math.min(...surface.authoringRows);
    const maximum = Math.max(...surface.authoringRows);
    const lines = [
        `${surface.profileId}@${surface.recipeRevision} candidate=${surface.candidateIndex} reflected=${surface.reflected}`
    ];
    for (let row = minimum; row <= maximum; row += 1) {
        lines.push(`${String(row).padStart(2, '0')}|${surface.authoringRows.map(value => value === row ? '#' : ' ').join('')}|`);
    }
    lines.push(`  +${'-'.repeat(V10_AUTHORING_WIDTH)}+`);
    return lines.join('\n');
}

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

function resolvedOperation(segment: RecipeSegment, start: number, value: number | undefined): V10ProceduralTerrainOperation {
    if (segment.kind === 'plateau') return Object.freeze({ kind: segment.kind, start, width: segment.width });
    if (value === undefined) throw new Error(`V10 procedural operation ${segment.tag} lacks a parameter.`);
    if (segment.kind === 'ramp' || segment.kind === 'asymmetric-elevation') {
        return Object.freeze({ kind: segment.kind, start, width: segment.width, delta: value });
    }
    if (segment.kind === 'ridge') return Object.freeze({ kind: segment.kind, start, width: segment.width, height: value });
    if (segment.kind === 'jump-shelf') return Object.freeze({ kind: segment.kind, start, width: segment.width, rise: value });
    return Object.freeze({ kind: segment.kind, start, width: segment.width, depth: value });
}

function validateOperation(operation: V10ProceduralTerrainOperation): void {
    if (!Number.isSafeInteger(operation.start) || !Number.isSafeInteger(operation.width) || operation.start < 0) {
        throw new Error('V10 procedural operation coordinates must be non-negative integers.');
    }
    const limits = V10_PROCEDURAL_OPERATION_LIMITS[operation.kind];
    if (operation.width < limits.minimumWidth || operation.width > limits.maximumWidth) {
        throw new Error(`V10 ${operation.kind} width is outside its contract.`);
    }
    if (operation.kind === 'ramp' || operation.kind === 'asymmetric-elevation') {
        const valueLimits = V10_PROCEDURAL_OPERATION_LIMITS[operation.kind];
        const magnitude = Math.abs(operation.delta);
        if (!Number.isSafeInteger(operation.delta) || magnitude < valueLimits.minimumDelta || magnitude > valueLimits.maximumDelta) {
            throw new Error(`V10 ${operation.kind} delta is outside its contract.`);
        }
    } else if (operation.kind === 'hollow' || operation.kind === 'notch') {
        const valueLimits = V10_PROCEDURAL_OPERATION_LIMITS[operation.kind];
        if (!Number.isSafeInteger(operation.depth) || operation.depth < valueLimits.minimumDepth || operation.depth > valueLimits.maximumDepth) {
            throw new Error(`V10 ${operation.kind} depth is outside its contract.`);
        }
    } else if (operation.kind === 'ridge') {
        const valueLimits = V10_PROCEDURAL_OPERATION_LIMITS.ridge;
        if (!Number.isSafeInteger(operation.height) || operation.height < valueLimits.minimumHeight || operation.height > valueLimits.maximumHeight) {
            throw new Error('V10 ridge height is outside its contract.');
        }
    } else if (operation.kind === 'jump-shelf') {
        const valueLimits = V10_PROCEDURAL_OPERATION_LIMITS['jump-shelf'];
        if (!Number.isSafeInteger(operation.rise) || operation.rise < valueLimits.minimumRise || operation.rise > valueLimits.maximumRise) {
            throw new Error('V10 jump-shelf rise is outside its contract.');
        }
    }
}

function transformOpeningColumns(
    columns: readonly [number, number], reflected: boolean
): readonly [number, number] {
    if (!reflected) return Object.freeze([...columns]) as readonly [number, number];
    return Object.freeze([
        V10_AUTHORING_WIDTH - 1 - columns[1],
        V10_AUTHORING_WIDTH - 1 - columns[0]
    ]) as readonly [number, number];
}

function transformJumpLandmarks(
    landmarks: readonly V10ProceduralJumpLandmark[], reflected: boolean
): readonly V10ProceduralJumpLandmark[] {
    if (!reflected) return Object.freeze(landmarks.map(item => Object.freeze({ ...item })));
    return Object.freeze(landmarks.map(item => Object.freeze({
        takeoffColumn: V10_AUTHORING_WIDTH - 1 - item.takeoffColumn,
        landingColumn: V10_AUTHORING_WIDTH - 1 - item.landingColumn
    })));
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
    if (shifted >= 92 && shifted < 160) return clamp(46 + variation, MINIMUM_SURFACE_ROW, MAXIMUM_SURFACE_ROW);
    if (shifted >= 160 && shifted < 164) return clamp(42 + variation, MINIMUM_SURFACE_ROW, MAXIMUM_SURFACE_ROW);
    if (shifted >= 164) return clamp(46 + variation, MINIMUM_SURFACE_ROW, MAXIMUM_SURFACE_ROW);
    return clamp(50 + variation, MINIMUM_SURFACE_ROW, MAXIMUM_SURFACE_ROW);
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
