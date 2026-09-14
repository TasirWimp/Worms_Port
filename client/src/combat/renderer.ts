import Phaser from 'phaser';

import {
    SIM_RULES,
    terrainSolid,
    type RelicId,
    type SimulationActor,
    type SimulationUnit
} from '../../../shared/simulation';
import { wizardAnimationFor, type CombatAnimationState, type CombatRenderState } from './presentation';
import {
    APPROVED_COMBAT_ASSETS,
    WIZARD_ANIMATION_KEYS,
    approvedCombatAssetsLoaded,
    approvedWizardAnimationsLoaded
} from './approved-assets';
import type { CombatLayout } from './layout';
import {
    WIZARD_ANIMATION_ROOT_ORIGIN_Y,
    WIZARD_STATIC_ROOT_ORIGIN_Y,
    WIZARD_UNRAVEL_ROOT_ORIGIN_Y,
    loomseedScreenPoint,
    traceFromLoomseedOrigin,
    usesCompactWizardPresentation,
    wizardPresentationVisible,
    wizardPresentationScaleInWorld
} from './loomseed-origin';

export type CombatVisualPhase =
    | {
        kind: 'movement';
        actor: SimulationActor;
      }
    | {
        kind: 'cast-charge';
        actor: SimulationActor;
        relicId: RelicId;
        trace: { x: number; y: number }[];
      }
    | {
        kind: 'cast-formation';
        actor: SimulationActor;
        relicId: RelicId;
        stage: 'start' | 'ready';
        trace: { x: number; y: number }[];
      }
    | {
        kind: 'projectile';
        actor: SimulationActor;
        relicId: RelicId;
        trace: { x: number; y: number }[];
      }
    | {
        kind: 'impact';
        actor: SimulationActor;
        relicId: RelicId;
        trace: { x: number; y: number }[];
        unraveling: SimulationActor[];
      };

// The 256px Patch materials used to be compressed into every 8-unit terrain
// cell. Render them at a stable world material scale instead, so the approved
// felt weave and sparse gold stitching remain readable on a phone.
const TERRAIN_MATERIAL_SCALE_IN_WORLD = 1;
const TERRAIN_TOP_SOURCE_HEIGHT = 64;

export class CombatRenderer {
    private readonly scene: Phaser.Scene;
    private readonly background: Phaser.GameObjects.Graphics;
    private readonly worldClip: Phaser.GameObjects.Graphics;
    private readonly worldMask: Phaser.Display.Masks.GeometryMask;
    private readonly teamCues: Phaser.GameObjects.Graphics;
    private readonly effects: Phaser.GameObjects.Graphics;
    private readonly wizardSprites: Partial<Record<SimulationActor, Phaser.GameObjects.Sprite>> = {};
    private readonly cloudSprites: Phaser.GameObjects.Image[] = [];
    private readonly terrainInteriorTiles: Phaser.GameObjects.TileSprite[] = [];
    private readonly terrainTopTiles: Phaser.GameObjects.TileSprite[] = [];
    private readonly formationSprite?: Phaser.GameObjects.Image;
    private readonly projectileSprite?: Phaser.GameObjects.Image;
    private readonly usingApprovedAssets: boolean;
    private readonly usingWizardAnimations: boolean;
    private presentationRulesetId?: string;

    public constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.background = scene.add.graphics().setDepth(0);
        this.worldClip = scene.make.graphics();
        this.worldMask = this.worldClip.createGeometryMask();
        this.teamCues = scene.add.graphics().setDepth(1.2);
        this.effects = scene.add.graphics().setDepth(1.3);
        this.teamCues.setMask(this.worldMask);
        this.effects.setMask(this.worldMask);
        this.usingApprovedAssets = approvedCombatAssetsLoaded(scene);
        this.usingWizardAnimations = approvedWizardAnimationsLoaded(scene);

        if (!this.usingApprovedAssets) return;
        this.wizardSprites.player = this.createWizardSprite();
        this.wizardSprites.loomkeeper = this.createWizardSprite();
        for (let index = 0; index < 3; index += 1) {
            this.cloudSprites.push(scene.add.image(0, 0, APPROVED_COMBAT_ASSETS.cloud.key)
                .setDepth(0.05)
                .setAlpha(0.72)
                .setMask(this.worldMask));
        }
        this.formationSprite = scene.add.image(0, 0, APPROVED_COMBAT_ASSETS.formationStart.key)
            .setDepth(5)
            .setMask(this.worldMask)
            .setVisible(false);
        this.projectileSprite = scene.add.image(0, 0, APPROVED_COMBAT_ASSETS.projectile.key)
            .setDepth(5)
            .setMask(this.worldMask)
            .setVisible(false);
    }

    public get assetState(): 'approved-runtime-copies' | 'procedural-fallback' {
        return this.usingApprovedAssets ? 'approved-runtime-copies' : 'procedural-fallback';
    }

    public animationState(actor: SimulationActor): CombatAnimationState {
        const animation = this.wizardSprites[actor]?.anims;
        return { key: animation?.currentAnim?.key ?? 'static', frame: animation?.currentFrame?.index ?? 0,
            complete: Boolean(animation?.currentFrame?.isLast && !animation.isPlaying && !animation.isPaused) };
    }

    public render(
        state: CombatRenderState,
        layout: CombatLayout,
        preview: { x: number; y: number }[],
        projectileTrace: { x: number; y: number }[] = [],
        visualPhase?: CombatVisualPhase,
        renderBackground?: (layout: CombatLayout) => void
    ): void {
        this.presentationRulesetId = state.rulesetId;
        const g = this.background;
        const field = layout.battlefield;
        g.clear();
        g.fillStyle(0xD9F2F3);
        g.fillRect(0, 0, this.scene.scale.width, this.scene.scale.height);
        g.fillStyle(0xC9EEF2);
        g.fillRoundedRect(field.x, field.y, field.width, field.height, 10);
        this.worldClip.clear();
        this.worldClip.fillStyle(0xFFFFFF);
        this.worldClip.fillRect(field.x, field.y, field.width, field.height);

        renderBackground?.(layout);

        if (this.usingApprovedAssets) {
            this.updateClouds(layout);
            this.updateTerrain(state, layout);
            this.updateWizardSprites(state.units, layout, visualPhase);
        } else {
            this.drawFallbackClouds(layout);
            this.drawFallbackTerrain(state, layout);
            for (const unit of state.units) {
                if (this.unitPresentationVisible(unit, layout)) {
                    this.drawFallbackKnotkin(unit, layout, state.selectedRelic);
                }
            }
        }

        this.teamCues.clear();
        if (this.usingApprovedAssets) this.drawTeamCues(state.units, layout);

        this.effects.clear();
        this.drawTrace(this.traceFromLoomseed(preview, state.activeActor, layout), layout, 0xE9B213, 0.95, true);
        this.drawVisualPhase(visualPhase, layout);

        g.lineStyle(2, 0x1F2348, 0.65);
        g.strokeRoundedRect(field.x, field.y, field.width, field.height, 10);
    }

    public destroy(): void {
        this.background.destroy();
        this.worldClip.destroy();
        this.teamCues.destroy();
        this.effects.destroy();
        for (const sprite of Object.values(this.wizardSprites)) sprite?.destroy();
        for (const sprite of this.cloudSprites) sprite.destroy();
        for (const tile of this.terrainInteriorTiles) tile.destroy();
        for (const tile of this.terrainTopTiles) tile.destroy();
        this.formationSprite?.destroy();
        this.projectileSprite?.destroy();
    }

    public get backgroundMask(): Phaser.Display.Masks.GeometryMask {
        return this.worldMask;
    }

    private createWizardSprite(): Phaser.GameObjects.Sprite {
        const texture = this.usingWizardAnimations
            ? APPROVED_COMBAT_ASSETS.wizardIdle.key
            : APPROVED_COMBAT_ASSETS.wizard.key;
        return this.scene.add.sprite(0, 0, texture)
            .setDepth(1.1)
            .setOrigin(0.5, this.usingWizardAnimations
                ? WIZARD_ANIMATION_ROOT_ORIGIN_Y
                : WIZARD_STATIC_ROOT_ORIGIN_Y);
    }

    private updateClouds(layout: CombatLayout): void {
        const field = layout.battlefield;
        const placements = [
            [0.17, 0.2, 0.24],
            [0.53, 0.15, 0.18],
            [0.82, 0.23, 0.2]
        ];
        for (const [index, sprite] of this.cloudSprites.entries()) {
            const [x, y, width] = placements[index];
            sprite.setPosition(
                field.x + field.width * x - layout.camera.left * layout.worldScaleX * 0.25,
                field.y + field.height * y
            )
                .setDisplaySize(field.width * width, field.width * width)
                .setVisible(true);
        }
    }

    private updateTerrain(state: CombatRenderState, layout: CombatLayout): void {
        const cellX = state.terrain.cellSize * layout.worldScaleX;
        const cellY = state.terrain.cellSize * layout.worldScaleY;
        const materialScaleX = layout.worldScaleX * TERRAIN_MATERIAL_SCALE_IN_WORLD;
        const materialScaleY = layout.worldScaleY * TERRAIN_MATERIAL_SCALE_IN_WORLD;
        const field = layout.battlefield;
        let interiorIndex = 0;
        let topIndex = 0;

        for (let y = 0; y < state.terrain.height; y += 1) {
            let runStart = -1;
            for (let x = 0; x <= state.terrain.width; x += 1) {
                const solid = x < state.terrain.width && terrainSolid(state.terrain, x, y);
                if (solid && runStart < 0) runStart = x;
                if (!solid && runStart >= 0) {
                    const tile = this.terrainInteriorTiles[interiorIndex++] ?? this.createTerrainTile(
                        APPROVED_COMBAT_ASSETS.terrainInterior.key,
                        this.terrainInteriorTiles
                    );
                    tile.setPosition(field.x + (runStart * state.terrain.cellSize - layout.camera.left) * layout.worldScaleX, field.y + y * cellY)
                        .setSize((x - runStart) * cellX + 0.5, cellY + 0.5)
                        .setTileScale(materialScaleX, materialScaleY)
                        .setTilePosition(
                            runStart * cellX / materialScaleX,
                            y * cellY / materialScaleY
                        )
                        .setVisible(true);
                    runStart = -1;
                }
            }
        }

        for (let x = 0; x < state.terrain.width; x += 1) {
            for (let y = 0; y < state.terrain.height; y += 1) {
                if (!terrainSolid(state.terrain, x, y) || (y > 0 && terrainSolid(state.terrain, x, y - 1))) {
                    continue;
                }
                const tile = this.terrainTopTiles[topIndex++] ?? this.createTerrainTile(
                    APPROVED_COMBAT_ASSETS.terrainTop.key,
                    this.terrainTopTiles
                    );
                    tile.setPosition(field.x + (x * state.terrain.cellSize - layout.camera.left) * layout.worldScaleX, field.y + y * cellY)
                        .setSize(
                            cellX + 0.5,
                            Math.max(
                                2,
                                layout.worldScaleY * TERRAIN_TOP_SOURCE_HEIGHT * TERRAIN_MATERIAL_SCALE_IN_WORLD
                            )
                        )
                        .setTileScale(materialScaleX, materialScaleY)
                        // Each surface segment starts at the grass edge while
                        // retaining a single horizontally aligned material run.
                        .setTilePosition(x * cellX / materialScaleX, 0)
                        .setVisible(true);
                break;
            }
        }
        this.hideUnusedTiles(this.terrainInteriorTiles, interiorIndex);
        this.hideUnusedTiles(this.terrainTopTiles, topIndex);
    }

    private createTerrainTile(
        texture: string,
        collection: Phaser.GameObjects.TileSprite[]
    ): Phaser.GameObjects.TileSprite {
        const tile = this.scene.add.tileSprite(0, 0, 1, 1, texture)
            .setOrigin(0, 0)
            .setDepth(1)
            .setMask(this.worldMask);
        collection.push(tile);
        return tile;
    }

    private hideUnusedTiles(tiles: Phaser.GameObjects.TileSprite[], used: number): void {
        for (let index = used; index < tiles.length; index += 1) tiles[index].setVisible(false);
    }

    private updateWizardSprites(
        units: readonly SimulationUnit[],
        layout: CombatLayout,
        visualPhase?: CombatVisualPhase
    ): void {
        const scale = Math.max(0.1, layout.worldScale * wizardPresentationScaleInWorld(
            this.usingWizardAnimations ? 'animation-sheet' : 'static-master',
            this.presentationRulesetId
        ));
        for (const unit of units) {
            const sprite = this.wizardSprites[unit.id];
            if (!sprite) continue;
            if (!this.unitPresentationVisible(unit, layout)) {
                sprite.setVisible(false);
                continue;
            }
            const root = this.actorRoot(unit, layout);
            sprite.setPosition(root.x, root.y)
                .setScale(scale)
                .setFlipX(unit.facing < 0)
                .setAlpha(1)
                .setVisible(true);
            sprite.setMask(this.worldMask);
            this.updateWizardAnimation(sprite, unit, visualPhase);
        }
    }

    private updateWizardAnimation(
        sprite: Phaser.GameObjects.Sprite,
        unit: SimulationUnit,
        visualPhase?: CombatVisualPhase
    ): void {
        if (!this.usingWizardAnimations) return;
        const animation = wizardAnimationFor(unit, visualPhase);
        sprite.setOrigin(0.5, animation === WIZARD_ANIMATION_KEYS.unravel
            ? WIZARD_UNRAVEL_ROOT_ORIGIN_Y
            : WIZARD_ANIMATION_ROOT_ORIGIN_Y);
        if (sprite.anims.currentAnim?.key !== animation) sprite.play(animation);
    }

    private drawTeamCues(units: readonly SimulationUnit[], layout: CombatLayout): void {
        const g = this.teamCues;
        const radius = Math.max(10, SIM_RULES.actorRadius * layout.worldScale * 1.8);
        for (const unit of units) {
            if (!this.unitPresentationVisible(unit, layout)) continue;
            const root = this.actorRoot(unit, layout);
            const color = unit.id === 'player' ? 0xE9B213 : 0xFA7268;
            const alpha = unit.alive ? 0.75 : 0.25;
            g.lineStyle(Math.max(2, radius * 0.12), color, alpha);
            g.strokeEllipse(root.x, root.y - radius * 0.08, radius * 1.5, radius * 0.44);
        }
    }

    private unitPresentationVisible(unit: SimulationUnit, layout: CombatLayout): boolean {
        return wizardPresentationVisible(
            unit,
            this.presentationRulesetId,
            layout.camera.top + layout.camera.height,
            SIM_RULES.actorRadius
        );
    }

    private drawVisualPhase(visualPhase: CombatVisualPhase | undefined, layout: CombatLayout): void {
        this.formationSprite?.setVisible(false);
        this.projectileSprite?.setVisible(false);
        if (!visualPhase) return;

        if (visualPhase.kind === 'movement') return;

        if (visualPhase.kind === 'cast-charge') {
            this.drawCastCharge(visualPhase.actor, layout);
            return;
        }
        if (visualPhase.kind === 'cast-formation') {
            this.drawCastFormation(visualPhase, layout);
            return;
        }
        if (visualPhase.kind === 'projectile') {
            const trace = this.traceFromLoomseed(visualPhase.trace, visualPhase.actor, layout);
            if (visualPhase.relicId === 'threadball' && this.usingApprovedAssets) {
                this.drawThreadballProjectile(trace, layout);
            } else {
                this.drawGenericProjectile(visualPhase.relicId, trace, layout);
            }
            return;
        }
        if (visualPhase.kind === 'impact' && visualPhase.relicId === 'threadball') {
            this.drawUnravelImpact(visualPhase.trace, layout);
        } else if (visualPhase.kind === 'impact') {
            this.drawGenericImpact(visualPhase.relicId, visualPhase.trace, layout);
        }
    }

    private drawCastCharge(actor: SimulationActor, layout: CombatLayout): void {
        const root = this.rootForActor(actor, layout);
        if (!root) return;
        const point = this.emissionPoint(root, layout);
        const radius = Math.max(6, SIM_RULES.actorRadius * layout.worldScale * 0.55);
        const g = this.effects;
        g.lineStyle(Math.max(1.5, radius * 0.18), 0xE9B213, 0.35);
        g.strokeCircle(point.x, point.y, radius);
        g.lineStyle(Math.max(1, radius * 0.14), 0x0582CA, 0.72);
        for (const [dx, dy] of [[-1, -0.5], [0.9, -0.35], [0.2, 1]]) {
            g.lineBetween(
                point.x + dx * radius * 1.25,
                point.y + dy * radius * 1.25,
                point.x + dx * radius * 0.4,
                point.y + dy * radius * 0.4
            );
        }
    }

    private drawCastFormation(
        visualPhase: Extract<CombatVisualPhase, { kind: 'cast-formation' }>,
        layout: CombatLayout
    ): void {
        const root = this.rootForActor(visualPhase.actor, layout);
        if (!root) return;
        const point = this.emissionPoint(root, layout);
        if (visualPhase.relicId !== 'threadball') {
            this.drawGenericCastFormation(visualPhase.relicId, point, layout);
            return;
        }
        if (!this.usingApprovedAssets || !this.formationSprite) return;
        const key = visualPhase.stage === 'start'
            ? APPROVED_COMBAT_ASSETS.formationStart.key
            : APPROVED_COMBAT_ASSETS.formationReady.key;
        const scale = layout.worldScale * (visualPhase.stage === 'start' ? 0.38 : 0.62);
        this.formationSprite.setMask(this.worldMask)
            .setTexture(key)
            .setPosition(point.x, point.y)
            .setScale(scale)
            .setAlpha(visualPhase.stage === 'start' ? 0.9 : 1)
            .setVisible(true);
        if (visualPhase.stage === 'ready') {
            this.effects.lineStyle(Math.max(1, layout.worldScale * 1.8), 0xE9B213, 0.25);
            this.effects.strokeCircle(point.x, point.y, Math.max(6, layout.worldScale * 12));
        }
    }

    private drawGenericCastFormation(
        relicId: Exclude<RelicId, 'threadball'>,
        point: { x: number; y: number },
        layout: CombatLayout
    ): void {
        const color = relicId === 'needlepoint' ? 0xDDFBFF : 0xFA7268;
        const radius = Math.max(6, layout.worldScale * 13);
        this.effects.lineStyle(Math.max(1, layout.worldScale * 1.8), color, 0.72);
        this.effects.strokeCircle(point.x, point.y, radius);
        this.effects.lineStyle(Math.max(1, layout.worldScale * 1.1), 0xE9B213, 0.5);
        this.effects.strokeCircle(point.x, point.y, radius * 0.58);
    }

    private drawThreadballProjectile(trace: { x: number; y: number }[], layout: CombatLayout): void {
        if (!this.projectileSprite || trace.length === 0) return;
        const endpoint = this.worldPoint(trace.at(-1)!.x, trace.at(-1)!.y, layout);
        this.projectileSprite.setMask(this.worldMask)
            .setPosition(endpoint.x, endpoint.y)
            .setScale(Math.max(0.16, layout.worldScale * 0.46))
            .setAlpha(1)
            .setVisible(true);
        const tail = trace.slice(Math.max(0, trace.length - 4));
        this.drawTrace(tail, layout, 0x0582CA, 0.72, false, Math.max(1, layout.worldScale * 2));
    }

    private drawGenericProjectile(
        relicId: RelicId,
        trace: { x: number; y: number }[],
        layout: CombatLayout
    ): void {
        if (trace.length === 0) return;
        const point = this.worldPoint(trace.at(-1)!.x, trace.at(-1)!.y, layout);
        const radius = Math.max(3, layout.worldScale * 5);
        const g = this.effects;

        if (relicId === 'needlepoint') {
            g.fillStyle(0xDDFBFF, 0.98);
            g.fillCircle(point.x, point.y, radius * 0.72);
            g.lineStyle(Math.max(1.5, layout.worldScale * 1.7), 0x0582CA, 0.85);
            g.strokeCircle(point.x, point.y, radius);
            return;
        }

        if (relicId === 'spoolburst') {
            g.fillStyle(0xFA7268, 0.94);
            g.fillCircle(point.x, point.y, radius * 0.8);
            g.lineStyle(Math.max(1, layout.worldScale * 1.5), 0xE9B213, 0.9);
            g.strokeCircle(point.x, point.y, radius * 1.35);
            g.fillStyle(0xFFF3B0, 0.9);
            g.fillCircle(point.x, point.y, Math.max(1.5, radius * 0.25));
            return;
        }

        g.fillStyle(0xE9B213, 0.9);
        g.fillCircle(point.x, point.y, radius * 0.75);
    }

    private drawGenericImpact(
        relicId: RelicId,
        trace: { x: number; y: number }[],
        layout: CombatLayout
    ): void {
        if (trace.length === 0) return;
        const point = this.worldPoint(trace.at(-1)!.x, trace.at(-1)!.y, layout);
        const radius = Math.max(4, layout.worldScale * 6);
        const g = this.effects;

        if (relicId === 'needlepoint') {
            g.lineStyle(Math.max(1.5, layout.worldScale * 1.6), 0xDDFBFF, 0.9);
            g.lineBetween(point.x - radius, point.y, point.x + radius, point.y);
            g.lineBetween(point.x, point.y - radius, point.x, point.y + radius);
            return;
        }

        if (relicId === 'spoolburst') {
            for (const factor of [0.7, 1.25]) {
                g.lineStyle(Math.max(1, layout.worldScale * 1.35), 0xFA7268, 0.75);
                g.strokeCircle(point.x, point.y, radius * factor);
            }
        }
    }

    private drawUnravelImpact(trace: { x: number; y: number }[], layout: CombatLayout): void {
        if (trace.length === 0) return;
        const point = this.worldPoint(trace.at(-1)!.x, trace.at(-1)!.y, layout);
        const base = Math.max(4, SIM_RULES.actorRadius * layout.worldScale * 0.36);
        for (let index = 0; index < 4; index += 1) {
            const radius = base * (0.75 + index * 0.38);
            const color = index % 2 === 0 ? 0x0582CA : 0xE9B213;
            this.effects.lineStyle(Math.max(1, layout.worldScale * 1.4), color, 0.6 - index * 0.1);
            this.effects.strokeEllipse(
                point.x + (index - 1.5) * base * 0.28,
                point.y - (index % 2) * base * 0.18,
                radius * 1.25,
                radius * 0.55
            );
        }
    }

    private rootForActor(actor: SimulationActor, layout: CombatLayout): { x: number; y: number; facing: -1 | 1 } | undefined {
        const sprite = this.wizardSprites[actor];
        if (!sprite) return undefined;
        return { x: sprite.x, y: sprite.y, facing: sprite.flipX ? -1 : 1 };
    }

    private emissionPoint(
        root: { x: number; y: number; facing: -1 | 1 },
        layout: CombatLayout
    ): { x: number; y: number } {
        return loomseedScreenPoint(
            root,
            layout,
            this.usingWizardAnimations ? 'animation-sheet' : 'static-master',
            this.presentationRulesetId
        );
    }

    private traceFromLoomseed(
        trace: { x: number; y: number }[],
        actor: SimulationActor,
        layout: CombatLayout
    ): { x: number; y: number }[] {
        const root = this.rootForActor(actor, layout);
        if (!root) return trace.map((point) => ({ ...point }));
        return traceFromLoomseedOrigin(
            trace,
            root,
            layout,
            this.usingWizardAnimations ? 'animation-sheet' : 'static-master',
            this.presentationRulesetId
        );
    }

    private actorRoot(unit: SimulationUnit, layout: CombatLayout): { x: number; y: number } {
        return this.worldPoint(unit.x, unit.y + SIM_RULES.actorRadius, layout);
    }

    private drawFallbackClouds(layout: CombatLayout): void {
        const g = this.background;
        const field = layout.battlefield;
        g.fillStyle(0xFFFFFF, 0.75);
        for (const [x, y, radius] of [
            [0.14, 0.18, 13], [0.2, 0.15, 18], [0.26, 0.19, 11],
            [0.72, 0.17, 12], [0.78, 0.14, 17], [0.84, 0.18, 10]
        ]) g.fillCircle(field.x + field.width * x, field.y + field.height * y, radius);
    }

    private drawFallbackTerrain(state: CombatRenderState, layout: CombatLayout): void {
        const g = this.background;
        const field = layout.battlefield;
        const cellX = state.terrain.cellSize * layout.worldScaleX;
        const cellY = state.terrain.cellSize * layout.worldScaleY;
        g.fillStyle(0x795548);
        for (let y = 0; y < state.terrain.height; y += 1) {
            let runStart = -1;
            for (let x = 0; x <= state.terrain.width; x += 1) {
                const solid = x < state.terrain.width && terrainSolid(state.terrain, x, y);
                if (solid && runStart < 0) runStart = x;
                if (!solid && runStart >= 0) {
                    const left = field.x + (runStart * state.terrain.cellSize - layout.camera.left) * layout.worldScaleX;
                    const right = field.x + (x * state.terrain.cellSize - layout.camera.left) * layout.worldScaleX;
                    g.fillRect(Math.max(field.x, left), field.y + y * cellY, Math.max(0, Math.min(field.x + field.width, right) - Math.max(field.x, left)) + 0.6, cellY + 0.6);
                    runStart = -1;
                }
            }
        }
        g.lineStyle(Math.max(2, cellY * 0.45), 0x88B04B, 1);
        for (let x = 0; x < state.terrain.width; x += 1) {
            for (let y = 0; y < state.terrain.height; y += 1) {
                if (terrainSolid(state.terrain, x, y) && (y === 0 || !terrainSolid(state.terrain, x, y - 1))) {
                    const px = field.x + (x * state.terrain.cellSize - layout.camera.left) * layout.worldScaleX;
                    const py = field.y + y * cellY;
                    g.lineBetween(px, py, px + cellX, py);
                    break;
                }
            }
        }
    }

    private drawFallbackKnotkin(unit: SimulationUnit, layout: CombatLayout, relicId: RelicId): void {
        const g = this.background;
        const point = this.worldPoint(unit.x, unit.y, layout);
        const radiusInWorld = usesCompactWizardPresentation(this.presentationRulesetId)
            ? 34 : SIM_RULES.actorRadius * 1.8;
        const radius = Math.max(10, radiusInWorld * layout.worldScale);
        const body = unit.id === 'player' ? 0x0582CA : 0x5F4B8B;
        const accent = unit.id === 'player' ? 0xE9B213 : 0xFA7268;
        const alpha = unit.alive ? 1 : 0.35;
        g.fillStyle(body, alpha);
        g.fillPoints([
            new Phaser.Geom.Point(point.x - radius * 0.65, point.y - radius * 0.7),
            new Phaser.Geom.Point(point.x + radius * 0.65, point.y - radius * 0.7),
            new Phaser.Geom.Point(point.x + radius, point.y - radius * 0.2),
            new Phaser.Geom.Point(point.x + radius * 0.72, point.y + radius * 0.72),
            new Phaser.Geom.Point(point.x - radius * 0.72, point.y + radius * 0.72),
            new Phaser.Geom.Point(point.x - radius, point.y - radius * 0.2)
        ], true);
        g.lineStyle(Math.max(2, radius * 0.12), accent, alpha);
        g.strokeCircle(point.x, point.y, radius);
        g.fillStyle(0x111111, alpha);
        g.fillCircle(point.x - radius * 0.34, point.y - radius * 0.14, radius * 0.25);
        g.fillCircle(point.x + radius * 0.34, point.y - radius * 0.14, radius * 0.25);
        this.drawFallbackRelic(relicId, point.x, point.y, radius, unit.facing);
    }

    private drawFallbackRelic(relicId: RelicId, x: number, y: number, radius: number, facing: -1 | 1): void {
        const g = this.background;
        const rx = x + facing * radius * 1.15;
        const ry = y + radius * 0.18;
        g.lineStyle(2, 0xE9B213, 1);
        if (relicId === 'threadball') {
            g.strokeCircle(rx, ry, radius * 0.3);
            g.lineBetween(rx - radius * 0.2, ry, rx + radius * 0.2, ry);
        } else if (relicId === 'needlepoint') {
            g.lineBetween(rx - facing * radius * 0.4, ry + radius * 0.3, rx + facing * radius * 0.45, ry - radius * 0.35);
        } else {
            g.strokeRoundedRect(rx - radius * 0.3, ry - radius * 0.22, radius * 0.6, radius * 0.44, 2);
            g.strokeCircle(rx, ry, radius * 0.42);
        }
    }

    private drawTrace(
        points: { x: number; y: number }[],
        layout: CombatLayout,
        color: number,
        alpha: number,
        dotted: boolean,
        width = dotted ? 3 : 2
    ): void {
        if (points.length < 2) return;
        this.effects.lineStyle(width, color, alpha);
        for (let index = 1; index < points.length; index += 1) {
            if (dotted && index % 2 === 0) continue;
            const start = this.worldPoint(points[index - 1].x, points[index - 1].y, layout);
            const end = this.worldPoint(points[index].x, points[index].y, layout);
            this.effects.lineBetween(start.x, start.y, end.x, end.y);
        }
    }

    private worldPoint(x: number, y: number, layout: CombatLayout): { x: number; y: number } {
        return {
            x: layout.battlefield.x + (x - layout.camera.left) * layout.worldScaleX,
            y: layout.battlefield.y + (y - layout.camera.top) * layout.worldScaleY
        };
    }
}
