import { packV10SurfaceRows } from './terrain-generation-v10';

export const VOLCANIC_RUIN_RECIPE_REVISION = 'volcanic-ruin-steps-r1' as const;
/** Fixed opening frame within the inherited world; no global camera/physics resize. */
export const VOLCANIC_RUIN_ARENA_FRAME = Object.freeze({ left: 512, top: 0, width: 1024, height: 576 });
/** Each character is 32 world units wide and 16 high, starting at world y=288.
 * Solid cells extend downwards; the ASCII is the source of the surface mask.
 */
export const VOLCANIC_RUIN_SURFACE_ASCII = `................................
####............................
####........................####
######........###...........####
######........###..........#####
######........###..........#####
########...######...#......#####
########...######...#....#######
########...######...#....#######
########...######...############
################################`;

export function generateVolcanicRuinTerrain() {
    const lines = VOLCANIC_RUIN_SURFACE_ASCII.split('\n');
    if (lines.some(line => line.length !== 32 || /[^.#]/.test(line))) throw new Error('Invalid volcanic-ruin ASCII.');
    const authoringRows = Array.from({ length: 32 }, (_, x) => {
        const top = lines.findIndex(line => line[x] === '#');
        if (top < 0 || lines.slice(top).some(line => line[x] !== '#')) throw new Error('Volcanic terrain must remain surface-only.');
        return 36 + top * 2;
    });
    const rows = [...Array<number>(64).fill(authoringRows[0]),
        ...authoringRows.flatMap(row => Array<number>(4).fill(row)), ...Array<number>(64).fill(authoringRows[31])];
    return { terrain: packV10SurfaceRows(rows), rows, authoringRows,
        recipeRevision: VOLCANIC_RUIN_RECIPE_REVISION,
        opening: { leftX: 624, rightX: 1424, leftSurfaceY: 304, rightSurfaceY: 320 },
        jumpPositions: [
            { takeoffX: 832, landingX: 876, takeoffSurfaceY: 448, landingSurfaceY: 384, direction: 1 as const, rise: 64 },
            { takeoffX: 1088, landingX: 1044, takeoffSurfaceY: 448, landingSurfaceY: 336, direction: -1 as const, rise: 112 }
        ] };
}
