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

/** Expanded catalogue has its own replay identity; the accepted R3 recipe above is frozen. */
export const V10G_FAMILY_RECIPE_REVISION = 'v10g-families-r1' as const;
export const V10G_REVIEW_SEEDS = [4, 5, 6, 7, 8] as const;
export function v10gFamilyForSeed(seed: number) {
    const index = ((seed >>> 0) + 1) % 5;
    return { profileId: (['twin-crests', 'trench-needle', 'stepping-mesa', 'asymmetric-rampart', 'asymmetric-rampart'] as const)[index],
        reflected: index === 4 };
}

export function generateV10GFamily(seed: number) {
    const family = v10gFamilyForSeed(seed);
    const base = generateV10GTwinCrests();
    const authoringRows = [...base.authoringRows];
    let opening = { ...base.opening };
    let jumpPositions = [...base.jumpPositions];
    if (family.profileId === 'trench-needle') {
        // Two cover ridges frame a deep central notch; dropping loses the firing lane.
        for (let column = 15; column <= 16; column += 1) authoringRows[column] = 56;
        authoringRows[15] = authoringRows[16] = 56;
        jumpPositions.push(
            { takeoffX: 992, landingX: 948, takeoffSurfaceY: 448, landingSurfaceY: 336, direction: -1, rise: 112 },
            { takeoffX: 1056, landingX: 1100, takeoffSurfaceY: 448, landingSurfaceY: 336, direction: 1, rise: 112 });
    } else if (family.profileId === 'stepping-mesa') {
        // A second ordinary jump is needed to reach the central firing mesa.
        authoringRows[15] = authoringRows[16] = 28;
        jumpPositions.push(
            { takeoffX: 928, landingX: 972, takeoffSurfaceY: 336, landingSurfaceY: 224, direction: 1, rise: 112 },
            { takeoffX: 1120, landingX: 1076, takeoffSurfaceY: 336, landingSurfaceY: 224, direction: -1, rise: 112 });
    } else if (family.profileId === 'asymmetric-rampart') {
        // Exposed high start versus a protected low pocket. Rear high shelf is optional.
        for (let column = 9; column <= 12; column += 1) authoringRows[column] = 42;
        authoringRows[7] = authoringRows[8] = 28;
        opening.leftSurfaceY = 336;
        jumpPositions = [
            { takeoffX: 608, landingX: 564, takeoffSurfaceY: 336, landingSurfaceY: 224, direction: -1, rise: 112 },
            base.jumpPositions[1]
        ];
    }
    if (family.reflected) {
        authoringRows.reverse();
        opening = { leftX: 2048 - opening.rightX, rightX: 2048 - opening.leftX,
            leftSurfaceY: opening.rightSurfaceY, rightSurfaceY: opening.leftSurfaceY };
        jumpPositions = jumpPositions.map(jump => ({ ...jump, takeoffX: 2048 - jump.takeoffX,
            landingX: 2048 - jump.landingX, direction: -jump.direction as -1 | 1 })).reverse();
    }
    const rows = authoringRows.flatMap(row => Array<number>(8).fill(row));
    const terrain = packV10SurfaceRows(rows);
    const protectedSides = family.profileId === 'asymmetric-rampart'
        ? [family.reflected ? 0 : 1] : [0, 1];
    const failures = v10gFamilyGeometryFailures({ rows, opening, jumpPositions, protectedSides });
    if (failures.length) throw new Error(`V10G ${family.profileId} unavailable: ${failures.join(', ')}.`);
    const minimumRow = Math.min(...authoringRows), maximumRow = Math.max(...authoringRows);
    const ascii = Array.from({ length: maximumRow - minimumRow + 1 }, (_, index) =>
        authoringRows.map(row => row <= minimumRow + index ? '#' : ' ').join('')).join('\n');
    return { ...family, terrain, rows, authoringRows, ascii, opening, jumpPositions,
        recipeRevision: V10G_FAMILY_RECIPE_REVISION };
}

/** Bounded runtime geometry admission of the finite catalogue. Tactical witnesses
 * run offline against real authority; this is not an arbitrary-map balance test.
 */
export function v10gFamilyGeometryFailures(candidate: {
    rows: readonly number[];
    opening: ReturnType<typeof generateV10GTwinCrests>['opening'];
    jumpPositions: ReturnType<typeof generateV10GTwinCrests>['jumpPositions'];
    protectedSides: readonly number[];
}): string[] {
    const { rows, opening, jumpPositions, protectedSides } = candidate;
    if (rows.length !== 256 || rows.some(row => !Number.isInteger(row) || row < 14 || row > 62)) return ['invalid_surface'];
    const terrain = packV10SurfaceRows([...rows]);
    const failures: string[] = [];
    const widthAt = (x: number) => {
        const column = Math.floor(x / 8), row = rows[column];
        let left = column, right = column;
        while (left > 0 && rows[left - 1] === row) left--;
        while (right < 255 && rows[right + 1] === row) right++;
        return (right - left + 1) * 8;
    };
    for (const side of [0, 1]) {
        const x = side === 0 ? opening.leftX : opening.rightX;
        const surfaceY = side === 0 ? opening.leftSurfaceY : opening.rightSurfaceY;
        if (rows[Math.floor(x / 8)] * 8 !== surfaceY || widthAt(x) < V10G_COVER_CONSTRAINTS.minimumPocketWidth) failures.push('invalid_opening');
        // Whole damage body above the floor must fit, not just the movement disc.
        for (let column = Math.floor((x - V10G_COMBAT_DIMENSIONS.damageHalfWidth) / 8); column <= Math.floor((x + V10G_COMBAT_DIMENSIONS.damageHalfWidth) / 8); column++) {
            if (rows[column] * 8 < surfaceY) failures.push('opening_body_obstructed');
        }
        if (protectedSides.includes(side)) {
            const direction = side === 0 ? 1 : -1;
            let column = Math.floor(x / 8);
            while (column >= 0 && column < 256 && rows[column] * 8 === surfaceY) column += direction;
            if (column < 0 || column >= 256 || surfaceY - rows[column] * 8 < V10G_COVER_CONSTRAINTS.minimumCoverRise) failures.push('cover_too_low');
            failures.push(...v10gHorizontalCoverFailures(terrain, { x, surfaceY }, direction));
        }
    }
    for (const jump of jumpPositions) {
        failures.push(...v10gFeatureDimensionFailures({ coverRise: V10G_COVER_CONSTRAINTS.minimumCoverRise,
            pocketWidth: widthAt(jump.takeoffX), shelfWidth: widthAt(jump.landingX), jumpRise: jump.takeoffSurfaceY - jump.landingSurfaceY }));
        if (rows[Math.floor(jump.takeoffX / 8)] * 8 !== jump.takeoffSurfaceY ||
            rows[Math.floor(jump.landingX / 8)] * 8 !== jump.landingSurfaceY ||
            jump.rise !== jump.takeoffSurfaceY - jump.landingSurfaceY ||
            (jump.landingX - jump.takeoffX) * jump.direction <= 0 ||
            Math.abs(jump.landingX - jump.takeoffX) > 48) failures.push('unsupported_jump');
    }
    return failures;
}
