import Phaser from 'phaser';

import {
    backgroundPlacements,
    backgroundLayerDepth,
    projectBackgroundPlacement,
    VOLCANIC_RUIN_PREVIEW_WORLD,
    type BackgroundPlacement,
    type BackgroundSceneDefinition
} from './background-scene';
import { APPROVED_COMBAT_ASSETS, volcanicRuinBackgroundAssetsLoaded } from './approved-assets';
import type { CombatLayout } from './layout';

type BackgroundSprite = Readonly<{ placement: BackgroundPlacement; image: Phaser.GameObjects.Image }>;

/** Decorative-only projection: it creates no physics objects, masks, or state. */
export class BackgroundRenderer {
    private readonly sprites: readonly BackgroundSprite[];

    public constructor(
        scene: Phaser.Scene,
        private readonly definition: BackgroundSceneDefinition | undefined,
        mask: Phaser.Display.Masks.GeometryMask
    ) {
        if (!definition || !volcanicRuinBackgroundAssetsLoaded(scene)) {
            this.sprites = [];
            return;
        }
        this.sprites = backgroundPlacements(definition).map((placement) => ({
            placement,
            image: scene.add.image(0, 0, textureKey(placement.asset))
                .setOrigin(512 / 1024, 528 / 576)
                .setDepth(backgroundLayerDepth(placement.layer))
                .setMask(mask)
        }));
    }

    public get active(): boolean { return this.sprites.length > 0; }

    public render(layout: CombatLayout): void {
        for (const { placement, image } of this.sprites) {
            const projection = projectBackgroundPlacement(placement, {
                worldWidth: VOLCANIC_RUIN_PREVIEW_WORLD.width,
                worldHeight: VOLCANIC_RUIN_PREVIEW_WORLD.height, cameraLeft: layout.camera.left,
                fieldX: layout.battlefield.x, fieldY: layout.battlefield.y,
                fieldHeight: layout.battlefield.height, fieldWidth: layout.battlefield.width,
                worldScaleX: layout.worldScaleX, worldScaleY: layout.worldScaleY
            });
            image.setPosition(projection.x, projection.y).setScale(projection.scale)
                .setAlpha(placement.alpha)
                .setVisible(true);
        }
    }

    public destroy(): void {
        for (const { image } of this.sprites) image.destroy();
    }
}

function textureKey(asset: BackgroundPlacement['asset']): string {
    return APPROVED_COMBAT_ASSETS[asset].key;
}
