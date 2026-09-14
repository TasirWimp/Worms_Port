import { setTerrainSolid, terrainSolid, type PackedTerrain } from './simulation';

export const V10_R7_BATTLEFIELD_RECIPE_REVISION = 'volcanic-ruin-battlefield-r1' as const;
export const V10_R7_AUTHORING_WIDTH = 64 as const;
export const V10_R7_AUTHORING_HEIGHT = 36 as const;
export const V10_R7_HORIZONTAL_EXPANSION = 4 as const;
export const V10_R7_VERTICAL_EXPANSION = 2 as const;
export const V10_R7_TERRAIN_WIDTH = 256 as const;
export const V10_R7_TERRAIN_HEIGHT = 72 as const;
export const V10_R7_TERRAIN_CELL_SIZE = 8 as const;

const SOLID_GLYPHS = new Set(['#', '=', '|', '+']);
const MARKERS = ['P', 'L'] as const;

/**
 * Complete R7 battlefield source. Every character owns an explicit 32 by 16
 * world-space area; there is no generated fill below a surface. The outer
 * ledges and full-width foundation make both ends of the 2048-unit world part
 * of the battlefield rather than decorative camera margin.
 */
export const V10_R7_BATTLEFIELD_ASCII = `................................................................
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
...........................==========...........................
............................|.......|...........................
...........######...........|.......|...........................
................|...........|.......|...........######..========
========........|.......=======.....|...........|....|..|....|..
..|....|..|.....|..P...........#..#======.......|....|..|....|..
..|....|..|===============.....#..#.........L...|...=|..=====|..
..|=====..|=|...........|......#..#....==============|..|....|..
..|....|..|.|...........|......#++#.....|..........|.|..|....|..
..|....|..|.|...........|......#++#.....|..........|.|..|....|..
######.|..|.|...........|......#++#.....|..........|.|..|.######
######==..=====================#++#===================..==######
...............................#..#.............................
...............................#..#.............................
################################################################
################################################################
################################################################
################################################################
################################################################
################################################################
################################################################
################################################################
################################################################`;

type Marker = typeof MARKERS[number];
type AuthoringAnchor = Readonly<{ column: number; row: number; x: number; surfaceY: number }>;

export type V10R7CompiledBattlefield = Readonly<{
    terrain: PackedTerrain;
    recipeRevision: typeof V10_R7_BATTLEFIELD_RECIPE_REVISION;
    opening: Readonly<{
        leftX: number;
        rightX: number;
        leftSurfaceY: number;
        rightSurfaceY: number;
    }>;
    anchors: Readonly<Record<Marker, AuthoringAnchor>>;
    jumpPositions: readonly Readonly<{
        takeoffX: number;
        landingX: number;
        takeoffSurfaceY: number;
        landingSurfaceY: number;
        direction: -1 | 1;
        rise: number;
    }>[];
}>;

export function compileV10R7Battlefield(
    source = V10_R7_BATTLEFIELD_ASCII
): V10R7CompiledBattlefield {
    if (source.includes('\r')) throw new Error('R7 battlefield ASCII must use LF separators only.');
    const lines = source.split('\n');
    if (lines.length !== V10_R7_AUTHORING_HEIGHT || lines.some(line => line.length !== V10_R7_AUTHORING_WIDTH)) {
        throw new Error(`R7 battlefield ASCII must be exactly ${V10_R7_AUTHORING_WIDTH} by ${V10_R7_AUTHORING_HEIGHT}.`);
    }
    if (lines.some(line => /[^.#=|+PL]/.test(line))) {
        throw new Error('R7 battlefield ASCII contains an unknown character.');
    }

    const markerLocations = new Map<Marker, { column: number; row: number }[]>();
    for (const marker of MARKERS) markerLocations.set(marker, []);
    const terrain: PackedTerrain = {
        width: V10_R7_TERRAIN_WIDTH,
        height: V10_R7_TERRAIN_HEIGHT,
        cellSize: V10_R7_TERRAIN_CELL_SIZE,
        words: new Array(V10_R7_TERRAIN_WIDTH * V10_R7_TERRAIN_HEIGHT / 32).fill(0)
    };
    for (let row = 0; row < lines.length; row += 1) {
        for (let column = 0; column < lines[row].length; column += 1) {
            const glyph = lines[row][column];
            if (glyph === 'P' || glyph === 'L') markerLocations.get(glyph)!.push({ column, row });
            if (!SOLID_GLYPHS.has(glyph)) continue;
            for (let dy = 0; dy < V10_R7_VERTICAL_EXPANSION; dy += 1) {
                for (let dx = 0; dx < V10_R7_HORIZONTAL_EXPANSION; dx += 1) {
                    setTerrainSolid(
                        terrain,
                        column * V10_R7_HORIZONTAL_EXPANSION + dx,
                        row * V10_R7_VERTICAL_EXPANSION + dy,
                        true
                    );
                }
            }
        }
    }

    const anchors = Object.fromEntries(MARKERS.map(marker => {
        const locations = markerLocations.get(marker)!;
        if (locations.length !== 1) throw new Error(`R7 battlefield ASCII requires exactly one ${marker} anchor.`);
        const { column, row } = locations[0];
        const anchor = {
            column,
            row,
            x: column * V10_R7_HORIZONTAL_EXPANSION * V10_R7_TERRAIN_CELL_SIZE +
                V10_R7_HORIZONTAL_EXPANSION * V10_R7_TERRAIN_CELL_SIZE / 2,
            surfaceY: (row + 1) * V10_R7_VERTICAL_EXPANSION * V10_R7_TERRAIN_CELL_SIZE
        };
        validateAnchor(terrain, marker, anchor);
        return [marker, anchor];
    })) as Record<Marker, AuthoringAnchor>;

    assertAuthoringRoundTrip(lines, terrain);
    return Object.freeze({
        terrain,
        recipeRevision: V10_R7_BATTLEFIELD_RECIPE_REVISION,
        opening: Object.freeze({
            leftX: anchors.P.x,
            rightX: anchors.L.x,
            leftSurfaceY: anchors.P.surfaceY,
            rightSurfaceY: anchors.L.surfaceY
        }),
        anchors: Object.freeze(anchors),
        jumpPositions: Object.freeze([
            Object.freeze({ takeoffX: anchors.P.x, landingX: anchors.P.x + 64,
                takeoffSurfaceY: anchors.P.surfaceY, landingSurfaceY: anchors.P.surfaceY,
                direction: 1 as const, rise: 0 }),
            Object.freeze({ takeoffX: anchors.L.x, landingX: anchors.L.x - 64,
                takeoffSurfaceY: anchors.L.surfaceY, landingSurfaceY: anchors.L.surfaceY,
                direction: -1 as const, rise: 0 })
        ])
    });
}

/** Exact terrain-only model used for hashing, persistence checks and later AI input. */
export function serializeV10R7Terrain(terrain: PackedTerrain): string {
    assertRuntimeGeometry(terrain);
    const lines = Array.from({ length: terrain.height }, (_, row) =>
        Array.from({ length: terrain.width }, (_, column) => terrainSolid(terrain, column, row) ? '#' : '.').join('')
    );
    return lines.join('\n');
}

/** Parse only canonical 256 by 72 `#`/`.` live terrain; actor overlays are not terrain. */
export function parseV10R7Terrain(source: string): PackedTerrain {
    if (source.includes('\r') || source.endsWith('\n')) {
        throw new Error('R7 live terrain must use LF separators with no terminal newline.');
    }
    const lines = source.split('\n');
    if (lines.length !== V10_R7_TERRAIN_HEIGHT ||
        lines.some(line => line.length !== V10_R7_TERRAIN_WIDTH || /[^.#]/.test(line))) {
        throw new Error(`R7 live terrain must be exactly ${V10_R7_TERRAIN_WIDTH} by ${V10_R7_TERRAIN_HEIGHT}.`);
    }
    const terrain: PackedTerrain = {
        width: V10_R7_TERRAIN_WIDTH,
        height: V10_R7_TERRAIN_HEIGHT,
        cellSize: V10_R7_TERRAIN_CELL_SIZE,
        words: new Array(V10_R7_TERRAIN_WIDTH * V10_R7_TERRAIN_HEIGHT / 32).fill(0)
    };
    for (let row = 0; row < lines.length; row += 1) {
        for (let column = 0; column < lines[row].length; column += 1) {
            if (lines[row][column] === '#') setTerrainSolid(terrain, column, row, true);
        }
    }
    if (serializeV10R7Terrain(terrain) !== source) throw new Error('R7 live terrain is not canonical.');
    return terrain;
}

export function overlayV10R7Actors(
    terrain: PackedTerrain,
    units: readonly Readonly<{ id: 'player' | 'loomkeeper'; xFp: number; yFp: number; alive: boolean }>[]
): string {
    const rows = serializeV10R7Terrain(terrain).split('\n').map(line => [...line]);
    for (const [id, marker] of [['player', 'P'], ['loomkeeper', 'L']] as const) {
        const unit = units.find(candidate => candidate.id === id);
        if (!unit || !unit.alive) continue;
        const column = Math.floor(unit.xFp / 256 / terrain.cellSize);
        const row = Math.floor(unit.yFp / 256 / terrain.cellSize);
        if (column < 0 || column >= terrain.width || row < 0 || row >= terrain.height) {
            throw new Error(`R7 ${id} marker is outside the battlefield.`);
        }
        if (rows[row][column] !== '.') throw new Error(`R7 ${id} marker must overlay an empty terrain cell.`);
        rows[row][column] = marker;
    }
    return rows.map(row => row.join('')).join('\n');
}

function validateAnchor(terrain: PackedTerrain, marker: Marker, anchor: AuthoringAnchor): void {
    const worldWidth = terrain.width * terrain.cellSize;
    const worldHeight = terrain.height * terrain.cellSize;
    const rootY = anchor.surfaceY - 12;
    if (anchor.x - 22 < 0 || anchor.x + 22 > worldWidth || rootY - 56 < 0 || rootY + 12 > worldHeight) {
        throw new Error(`R7 ${marker} anchor target envelope leaves the world.`);
    }
    if (terrainRectOccupied(terrain, anchor.x - 22, rootY - 56, anchor.x + 22, rootY + 12) ||
        terrainRectOccupied(terrain, anchor.x - 12, rootY - 12, anchor.x + 12, rootY + 12)) {
        throw new Error(`R7 ${marker} anchor does not clear the actor envelopes.`);
    }
    const supportRow = anchor.surfaceY / terrain.cellSize;
    const firstSupport = Math.floor((anchor.x - 12) / terrain.cellSize);
    const lastSupport = Math.ceil((anchor.x + 12) / terrain.cellSize) - 1;
    if (!Number.isInteger(supportRow) ||
        !Array.from({ length: lastSupport - firstSupport + 1 }, (_, index) => firstSupport + index)
            .some(column => terrainSolid(terrain, column, supportRow))) {
        throw new Error(`R7 ${marker} anchor has no support.`);
    }
}

function terrainRectOccupied(
    terrain: PackedTerrain,
    left: number,
    top: number,
    right: number,
    bottom: number
): boolean {
    const firstColumn = Math.floor(left / terrain.cellSize);
    const lastColumn = Math.ceil(right / terrain.cellSize) - 1;
    const firstRow = Math.floor(top / terrain.cellSize);
    const lastRow = Math.ceil(bottom / terrain.cellSize) - 1;
    for (let row = firstRow; row <= lastRow; row += 1) {
        for (let column = firstColumn; column <= lastColumn; column += 1) {
            if (terrainSolid(terrain, column, row)) return true;
        }
    }
    return false;
}

function assertRuntimeGeometry(terrain: PackedTerrain): void {
    if (terrain.width !== V10_R7_TERRAIN_WIDTH || terrain.height !== V10_R7_TERRAIN_HEIGHT ||
        terrain.cellSize !== V10_R7_TERRAIN_CELL_SIZE || terrain.words.length !== 576 ||
        terrain.words.some(word => !Number.isSafeInteger(word) || word < 0 || word > 0xffff_ffff)) {
        throw new Error('R7 terrain has invalid runtime geometry.');
    }
}

function assertAuthoringRoundTrip(lines: readonly string[], terrain: PackedTerrain): void {
    for (let row = 0; row < V10_R7_AUTHORING_HEIGHT; row += 1) {
        for (let column = 0; column < V10_R7_AUTHORING_WIDTH; column += 1) {
            const expected = SOLID_GLYPHS.has(lines[row][column]);
            for (let dy = 0; dy < V10_R7_VERTICAL_EXPANSION; dy += 1) {
                for (let dx = 0; dx < V10_R7_HORIZONTAL_EXPANSION; dx += 1) {
                    const actual = terrainSolid(terrain,
                        column * V10_R7_HORIZONTAL_EXPANSION + dx,
                        row * V10_R7_VERTICAL_EXPANSION + dy);
                    if (actual !== expected) throw new Error('R7 battlefield failed its packed-mask round trip.');
                }
            }
        }
    }
}
