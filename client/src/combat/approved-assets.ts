import Phaser from 'phaser';

export const APPROVED_COMBAT_ASSETS = {
    wizard: {
        key: 'wp015c-wizard-loomseed',
        path: '/assets/product/characters/knotkin/wizard/knotkin-wizard-loomseed-v1.png'
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
    }
} as const;

type ApprovedCombatAsset = (typeof APPROVED_COMBAT_ASSETS)[keyof typeof APPROVED_COMBAT_ASSETS];

export function preloadApprovedCombatAssets(scene: Phaser.Scene): void {
    for (const asset of Object.values(APPROVED_COMBAT_ASSETS)) {
        if (!scene.textures.exists(asset.key)) scene.load.image(asset.key, asset.path);
    }
}

export function approvedCombatAssetsLoaded(scene: Phaser.Scene): boolean {
    return Object.values(APPROVED_COMBAT_ASSETS).every((asset: ApprovedCombatAsset) =>
        scene.textures.exists(asset.key)
    );
}
