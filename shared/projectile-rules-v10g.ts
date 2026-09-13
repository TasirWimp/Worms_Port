import type { ProjectileMechanics } from './simulation-v8';

/** Product-owned finite R3 table. Distances are world units, speeds are fp/tick. */
export const V10G_PROJECTILE_RULES: ProjectileMechanics = Object.freeze({
    terrainFirst: true,
    shieldBlast: true,
    relics: Object.freeze({
        threadball: Object.freeze({ minimumShotSpeed: 1459, maximumShotSpeed: 4864,
            gravityFp: 80, craterRadius: 40, damageRadius: 64, maximumDamage: 45 }),
        needlepoint: Object.freeze({ minimumShotSpeed: 1536, maximumShotSpeed: 5120,
            gravityFp: 0, craterRadius: 8, damageRadius: 8, maximumDamage: 60 }),
        spoolburst: Object.freeze({ minimumShotSpeed: 1459, maximumShotSpeed: 4864,
            gravityFp: 80, craterRadius: 80, damageRadius: 48, maximumDamage: 25 })
    })
});

/** R6 changes only the coherent visual/direct-target envelope in Waypoint 1. */
export const V10_R6_PROJECTILE_RULES: ProjectileMechanics = Object.freeze({
    ...V10G_PROJECTILE_RULES,
    directHitbox: Object.freeze({ halfWidth: 22, top: 56, bottom: 12 })
});
