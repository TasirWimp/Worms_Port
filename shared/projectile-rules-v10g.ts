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

/** R6 adds its coherent target plus bounded Waypoint 2 impact motion. */
export const V10_R6_PROJECTILE_RULES: ProjectileMechanics = Object.freeze({
    ...V10G_PROJECTILE_RULES,
    directHitbox: Object.freeze({ halfWidth: 22, top: 56, bottom: 12 }),
    blastImpulse: Object.freeze({
        threadball: Object.freeze({ minimumSpeedFp: 384, maximumSpeedFp: 1_536, upwardBiasFp: 1_152 }),
        needlepoint: Object.freeze({ minimumSpeedFp: 256, maximumSpeedFp: 768, upwardBiasFp: 512 }),
        spoolburst: Object.freeze({ minimumSpeedFp: 320, maximumSpeedFp: 1_280, upwardBiasFp: 960 })
    })
});

/**
 * R7 Waypoint 1 keeps every accepted R6 combat value and changes only the
 * terrain cleared by Threadball and Spoolburst.
 */
export const V10_R7_PROJECTILE_RULES: ProjectileMechanics = Object.freeze({
    ...V10_R6_PROJECTILE_RULES,
    relics: Object.freeze({
        threadball: Object.freeze({
            ...V10_R6_PROJECTILE_RULES.relics.threadball,
            craterRadius: 128
        }),
        needlepoint: V10_R6_PROJECTILE_RULES.relics.needlepoint,
        spoolburst: Object.freeze({
            ...V10_R6_PROJECTILE_RULES.relics.spoolburst,
            craterRadius: 164
        })
    })
});
