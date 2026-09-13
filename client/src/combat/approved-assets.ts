import Phaser from 'phaser';

export const APPROVED_COMBAT_ASSETS = {
    wizard: {
        key: 'wp015c-wizard-loomseed',
        path: '/assets/product/characters/knotkin/wizard/knotkin-wizard-loomseed-v1.png'
    },
    wizardIdle: {
        key: 'wp015c-wizard-autosprite-idle',
        path: '/assets/product/characters/knotkin/wizard/animation/idle-v1.png',
        frameWidth: 256,
        frameHeight: 256
    },
    wizardWalk: {
        key: 'wp015c-wizard-autosprite-walk',
        path: '/assets/product/characters/knotkin/wizard/animation/walk-v1.png',
        frameWidth: 256,
        frameHeight: 256
    },
    wizardCast: {
        key: 'wp015c-wizard-autosprite-loomseed-spell',
        path: '/assets/product/characters/knotkin/wizard/animation/loomseed-spell-v1.png',
        frameWidth: 256,
        frameHeight: 256
    },
    wizardUnravel: {
        key: 'wp015c-wizard-autosprite-unravel',
        path: '/assets/product/characters/knotkin/wizard/animation/unravel-v1.png',
        frameWidth: 256,
        frameHeight: 256
    },
    formationStart: {
        key: 'wp015c-threadball-formation-start',
        path: '/assets/product/relics/threadball/cast/formation-start-v1.png'
    },
    formationReady: {
        key: 'wp015c-threadball-formation-ready',
        path: '/assets/product/relics/threadball/cast/formation-ready-v1.png'
    },
    projectile: {
        key: 'wp015c-threadball-projectile',
        path: '/assets/product/relics/threadball/cast/projectile-v1.png'
    },
    cloud: {
        key: 'wp015c-patch-cloud',
        path: '/assets/product/environment/patch-01/clouds/cloud-v1.png'
    },
    terrainTop: {
        key: 'wp015c-patch-terrain-top',
        path: '/assets/product/environment/patch-01/terrain/top-v1.png'
    },
    terrainInterior: {
        key: 'wp015c-patch-terrain-interior',
        path: '/assets/product/environment/patch-01/terrain/interior-v1.png'
    },
    volcano: {
        key: 'wp015d4f-volcanic-ruin-volcano',
        path: '/assets/product/environment/backgrounds/volcanic-ruin/volcanic-cone-v1.png'
    },
    jungle: {
        key: 'wp015d4f-volcanic-ruin-jungle',
        path: '/assets/product/environment/backgrounds/volcanic-ruin/distant-jungle-v1.png'
    },
    tower: {
        key: 'wp015d4f-volcanic-ruin-tower',
        path: '/assets/product/environment/backgrounds/volcanic-ruin/stone-tower-v1.png'
    },
    palm: {
        key: 'wp015d4f-volcanic-ruin-palm',
        path: '/assets/product/environment/backgrounds/volcanic-ruin/palm-cluster-v1.png'
    },
    bush: {
        key: 'wp015d4f-volcanic-ruin-bush',
        path: '/assets/product/environment/backgrounds/volcanic-ruin/bush-cluster-v1.png'
    }
} as const;

type ApprovedCombatAsset = (typeof APPROVED_COMBAT_ASSETS)[keyof typeof APPROVED_COMBAT_ASSETS];
type SpriteSheetCombatAsset = ApprovedCombatAsset & { frameWidth: number; frameHeight: number };

export const WIZARD_ANIMATION_KEYS = {
    idle: 'wp015c-wizard-idle',
    walk: 'wp015c-wizard-walk',
    cast: 'wp015c-wizard-cast',
    unravel: 'wp015c-wizard-unravel'
} as const;

export const WIZARD_CAST_DURATION_MS = 2_000;
export const WIZARD_UNRAVEL_DURATION_MS = 2_000;

type WizardAnimationDefinition = {
    key: string;
    texture: string;
    frameRate: number;
    repeat?: number;
    end?: number;
};

const STATIC_COMBAT_ASSETS = [
    APPROVED_COMBAT_ASSETS.wizard,
    APPROVED_COMBAT_ASSETS.formationStart,
    APPROVED_COMBAT_ASSETS.formationReady,
    APPROVED_COMBAT_ASSETS.projectile,
    APPROVED_COMBAT_ASSETS.cloud,
    APPROVED_COMBAT_ASSETS.terrainTop,
    APPROVED_COMBAT_ASSETS.terrainInterior
] as const;

const WIZARD_ANIMATION_ASSETS = [
    APPROVED_COMBAT_ASSETS.wizardIdle,
    APPROVED_COMBAT_ASSETS.wizardWalk,
    APPROVED_COMBAT_ASSETS.wizardCast,
    APPROVED_COMBAT_ASSETS.wizardUnravel
] as const;

const VOLCANIC_RUIN_BACKGROUND_ASSETS = [
    APPROVED_COMBAT_ASSETS.volcano,
    APPROVED_COMBAT_ASSETS.jungle,
    APPROVED_COMBAT_ASSETS.tower,
    APPROVED_COMBAT_ASSETS.palm,
    APPROVED_COMBAT_ASSETS.bush
] as const;

export function preloadApprovedCombatAssets(scene: Phaser.Scene): void {
    for (const asset of [...STATIC_COMBAT_ASSETS, ...WIZARD_ANIMATION_ASSETS]) {
        if (scene.textures.exists(asset.key)) continue;
        if (isSpriteSheetAsset(asset)) {
            scene.load.spritesheet(asset.key, asset.path, {
                frameWidth: asset.frameWidth,
                frameHeight: asset.frameHeight
            });
        } else {
            scene.load.image(asset.key, asset.path);
        }
    }
}

/** The background bundle is never part of the ordinary combat preload. */
export function preloadVolcanicRuinBackgroundAssets(scene: Phaser.Scene): void {
    for (const asset of VOLCANIC_RUIN_BACKGROUND_ASSETS) {
        if (!scene.textures.exists(asset.key)) scene.load.image(asset.key, asset.path);
    }
}

export function approvedCombatAssetsLoaded(scene: Phaser.Scene): boolean {
    return STATIC_COMBAT_ASSETS.every((asset) =>
        scene.textures.exists(asset.key)
    );
}

export function createApprovedWizardAnimations(scene: Phaser.Scene): boolean {
    if (!approvedWizardAnimationsLoaded(scene)) return false;
    const animations: readonly WizardAnimationDefinition[] = [
        { key: WIZARD_ANIMATION_KEYS.idle, texture: APPROVED_COMBAT_ASSETS.wizardIdle.key, frameRate: 12, repeat: -1 },
        { key: WIZARD_ANIMATION_KEYS.walk, texture: APPROVED_COMBAT_ASSETS.wizardWalk.key, frameRate: 18, repeat: -1 },
        // The final eight source frames include an in-frame projectile. The authoritative
        // projectile renderer owns flight, so the character pose stops just before it.
        { key: WIZARD_ANIMATION_KEYS.cast, texture: APPROVED_COMBAT_ASSETS.wizardCast.key, frameRate: 8.5, end: 16 },
        { key: WIZARD_ANIMATION_KEYS.unravel, texture: APPROVED_COMBAT_ASSETS.wizardUnravel.key, frameRate: 12.5 }
    ];
    for (const animation of animations) {
        if (scene.anims.exists(animation.key)) continue;
        scene.anims.create({
            key: animation.key,
            frames: scene.anims.generateFrameNumbers(animation.texture, {
                start: 0,
                end: animation.end ?? 24
            }),
            frameRate: animation.frameRate,
            repeat: animation.repeat ?? 0
        });
    }
    return true;
}

export function approvedWizardAnimationsLoaded(scene: Phaser.Scene): boolean {
    return WIZARD_ANIMATION_ASSETS.every((asset) => scene.textures.exists(asset.key));
}

/** All-or-nothing makes missing or failed preview art fall back to no background. */
export function volcanicRuinBackgroundAssetsLoaded(scene: Phaser.Scene): boolean {
    return VOLCANIC_RUIN_BACKGROUND_ASSETS.every((asset) => scene.textures.exists(asset.key));
}

function isSpriteSheetAsset(asset: ApprovedCombatAsset): asset is SpriteSheetCombatAsset {
    return 'frameWidth' in asset && 'frameHeight' in asset;
}
