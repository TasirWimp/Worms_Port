import { directProjectileHitboxFor, V7_RULESET_ID, terrainSolid, type PackedTerrain } from './simulation';
import { V8_SIM_RULES } from './simulation-v8';

/** Candidate-only constraints; no historical terrain or runtime selection changes. */
export const V10G_GEOMETRY_REVISION = 'v10g-combat-clearance-r1' as const;
const hitbox = directProjectileHitboxFor(V7_RULESET_ID);
const cell = V8_SIM_RULES.terrainCellSize;
const roundUp = (value: number) => Math.ceil(value / cell) * cell;

export const V10G_COMBAT_DIMENSIONS = Object.freeze({
    movementRadius: V8_SIM_RULES.actorRadius,
    damageHalfWidth: hitbox.halfWidth,
    damageTop: hitbox.top,
    damageBottom: hitbox.bottom,
    damageHeightAboveSupport: V8_SIM_RULES.actorRadius + hitbox.top,
    cellSize: cell,
    authoringColumnWorldWidth: 64,
    clearanceMargin: cell
});

/** Free jump envelope is an upper bound, never proof of a terrain landing. */
export function v10gFreeJumpEnvelope(): Readonly<{ rise: number; horizontalReach: number }> {
    let y = 0;
    let velocity: number = V8_SIM_RULES.jumpSpeedFp;
    let minimumY = 0;
    let ticks = 0;
    do {
        velocity = Math.min(velocity + V8_SIM_RULES.gravityFp, V8_SIM_RULES.maximumFallSpeedFp);
        y += velocity;
        minimumY = Math.min(minimumY, y);
        ticks += 1;
    } while (y < 0 && ticks < V8_SIM_RULES.maximumAirTicks);
    return Object.freeze({ rise: -minimumY / V8_SIM_RULES.fixedPointScale,
        horizontalReach: ticks * V8_SIM_RULES.walkSpeedFp / V8_SIM_RULES.fixedPointScale });
}

export const V10G_COVER_CONSTRAINTS = Object.freeze({
    // Whole-cell margin above the actual head; 97 + 8 rounds to 112.
    minimumCoverRise: roundUp(V10G_COMBAT_DIMENSIONS.damageHeightAboveSupport + cell),
    minimumPocketWidth: roundUp(2 * hitbox.halfWidth + 2 * cell),
    minimumShelfWidth: roundUp(2 * hitbox.halfWidth + 2 * cell),
    maximumSingleJumpRise: Math.floor((v10gFreeJumpEnvelope().rise - cell) / cell) * cell
});

export type V10GPosition = Readonly<{ x: number; surfaceY: number }>;
export function v10gDamageBounds(position: V10GPosition) {
    const rootY = position.surfaceY - V8_SIM_RULES.actorRadius;
    return { left: position.x - hitbox.halfWidth, right: position.x + hitbox.halfWidth,
        top: rootY - hitbox.top, bottom: rootY + hitbox.bottom };
}

/** Geometric prerequisite for horizontal precision cover, not tactical admission.
 * Checks every integer hitbox row and requires material outside the hitbox.
 * Angled attacks, splash, escaping and damage outcomes still need authority tests.
 */
export function v10gHorizontalCoverFailures(
    terrain: PackedTerrain, position: V10GPosition, incomingFrom: -1 | 1
): readonly string[] {
    const failures: string[] = [];
    const bounds = v10gDamageBounds(position);
    if (terrain.cellSize !== cell) return ['unsupported_cell_size'];
    if (![position.x, position.surfaceY].every(Number.isSafeInteger) ||
        bounds.left < 0 || bounds.right >= terrain.width * cell || bounds.top < 0 ||
        position.surfaceY >= terrain.height * cell) return ['invalid_position'];
    // The inherited target extends one unit below its physical support plane;
    // only its above-ground part is exposed to incoming horizontal flight.
    for (let y = bounds.top; y < position.surfaceY; y += 1) {
        let blocked = false;
        const edge = incomingFrom === -1 ? bounds.left - 1 : bounds.right + 1;
        for (let x = edge; x >= 0 && x < terrain.width * cell; x += incomingFrom) {
            if (terrainSolid(terrain, Math.floor(x / cell), Math.floor(y / cell))) {
                blocked = true;
                break;
            }
        }
        if (!blocked) { failures.push('exposed_damage_hitbox'); break; }
    }
    return failures;
}

/** Fail early before expensive ballistic witnesses. Numerical constraints alone
 * never admit a candidate; actual movement and weapon witnesses remain required.
 */
export function v10gFeatureDimensionFailures(feature: Readonly<{
    coverRise: number; pocketWidth: number; shelfWidth: number; jumpRise: number;
}>): readonly string[] {
    if (!Object.values(feature).every(value => Number.isSafeInteger(value) && value > 0 && value % cell === 0)) {
        return ['non_grid_dimensions'];
    }
    const failures: string[] = [];
    if (feature.coverRise < V10G_COVER_CONSTRAINTS.minimumCoverRise) failures.push('cover_too_low');
    if (feature.pocketWidth < V10G_COVER_CONSTRAINTS.minimumPocketWidth) failures.push('pocket_too_narrow');
    if (feature.shelfWidth < V10G_COVER_CONSTRAINTS.minimumShelfWidth) failures.push('shelf_too_narrow');
    if (feature.jumpRise > V10G_COVER_CONSTRAINTS.maximumSingleJumpRise) failures.push('shelf_above_jump_envelope');
    return failures;
}
