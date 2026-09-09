import { packV10SurfaceRows } from './terrain-generation-v10';
import { V10G_COVER_CONSTRAINTS, V10G_COMBAT_DIMENSIONS,
    v10gFeatureDimensionFailures, v10gHorizontalCoverFailures } from './terrain-geometry-v10g';

export const V10G_RECIPE_REVISION = 'v10g-twin-crests-r1' as const;

/** First-map calibration: one deterministic 32-column recipe, no random retry.
 * Rows are derived from combat clearance, not V10F's old clamped height ranges.
 */
export function generateV10GTwinCrests() {
    const cell = V10G_COMBAT_DIMENSIONS.cellSize;
    const floorRow = 56;
    const shelfRow = floorRow - V10G_COVER_CONSTRAINTS.minimumCoverRise / cell;
    const authoringRows = Array<number>(32).fill(shelfRow);
    for (let column = 9; column <= 12; column += 1) {
        authoringRows[column] = floorRow;
        authoringRows[31 - column] = floorRow;
    }
    // A centre crest one cell above the shelves still leaves one clear cell
    // below the inherited shelf muzzle, allowing exposed precision fire.
    authoringRows[15] = authoringRows[16] = shelfRow - 1;
    const rows = authoringRows.flatMap(row => Array<number>(8).fill(row));
    const terrain = packV10SurfaceRows(rows);
    const opening = { leftX: 760, rightX: 1288, leftSurfaceY: floorRow * cell, rightSurfaceY: floorRow * cell };
    const failures = [
        ...v10gFeatureDimensionFailures({ coverRise: (floorRow - shelfRow) * cell,
            pocketWidth: 4 * 64, shelfWidth: 2 * 64, jumpRise: (floorRow - shelfRow) * cell }),
        ...v10gHorizontalCoverFailures(terrain, { x: opening.leftX, surfaceY: opening.leftSurfaceY }, 1),
        ...v10gHorizontalCoverFailures(terrain, { x: opening.rightX, surfaceY: opening.rightSurfaceY }, -1)
    ];
    if (failures.length) throw new Error(`V10G Twin Crests unavailable: ${failures.join(', ')}.`);
    const minimumRow = Math.min(...authoringRows);
    const ascii = Array.from({ length: floorRow - minimumRow + 1 }, (_, index) =>
        authoringRows.map(row => row <= minimumRow + index ? '#' : ' ').join('')).join('\n');
    return { terrain, opening, rows, authoringRows, ascii, recipeRevision: V10G_RECIPE_REVISION,
        jumpPositions: [
            { takeoffX: 800, landingX: 844, takeoffSurfaceY: floorRow * cell, landingSurfaceY: shelfRow * cell, direction: 1 as const, rise: (floorRow - shelfRow) * cell },
            { takeoffX: 1248, landingX: 1204, takeoffSurfaceY: floorRow * cell, landingSurfaceY: shelfRow * cell, direction: -1 as const, rise: (floorRow - shelfRow) * cell }
        ] };
}
