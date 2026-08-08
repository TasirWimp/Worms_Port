import Phaser from 'phaser';

import {
    SIM_RULES,
    terrainSolid,
    type RelicId,
    type SimulationActor,
    type SimulationState,
    type SimulationUnit
} from '../../../shared/simulation';
import {
    APPROVED_COMBAT_ASSETS,
    WIZARD_ANIMATION_KEYS,
    approvedCombatAssetsLoaded,
    approvedWizardAnimationsLoaded
} from './approved-assets';
import type { CombatLayout } from './layout';

export type CombatVisualPhase =
    | {
        kind: 'movement';
        actor: SimulationActor;
      }
    | {
        kind: 'cast-charge';
        actor: SimulationActor;
        relicId: 'threadball';
        trace: { x: number; y: number }[];
      }
    | {
        kind: 'cast-formation';
        actor: SimulationActor;
        relicId: 'threadball';
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

const WIZARD_ROOT_ORIGIN_Y = 451 / 512;
const WIZARD_SCALE_IN_WORLD = 0.23;
const WIZARD_ANIMATION_ROOT_ORIGIN_Y = 212 / 256;
const WIZARD_UNRAVEL_ROOT_ORIGIN_Y = 229 / 256;
const WIZARD_ANIMATION_SCALE_IN_WORLD = 0.56;
const EMISSION_OFFSET = { x: 151, y: -223 };
const INTERIOR_SOURCE_SIZE = 256;

export class CombatRenderer {
    private readonly scene: Phaser.Scene;
    private readonly background: Phaser.GameObjects.Graphics;
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

    public constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.background = scene.add.graphics().setDepth(0);
        this.teamCues = scene.add.graphics().setDepth(4);
        this.effects = scene.add.graphics().setDepth(6);
        this.usingApprovedAssets = approvedCombatAssetsLoaded(scene);
        this.usingWizardAnimations = approvedWizardAnimationsLoaded(scene);

        if (!this.usingApprovedAssets) return;
        this.wizardSprites.player = this.createWizardSprite();
        this.wizardSprites.loomkeeper = this.createWizardSprite();
        for (let index = 0; index < 3; index += 1) {
            this.cloudSprites.push(scene.add.image(0, 0, APPROVED_COMBAT_ASSETS.cloud.key)
                .setDepth(1)
                .setAlpha(0.72));
        }
        this.formationSprite = scene.add.image(0, 0, APPROVED_COMBAT_ASSETS.formationStart.key)
            .setDepth(5)
            .setVisible(false);
        this.projectileSprite = scene.add.image(0, 0, APPROVED_COMBAT_ASSETS.projectile.key)
            .setDepth(5)
            .setVisible(false);
    }

    public get assetState(): 'approved-runtime-copies' | 'procedural-fallback' {
        return this.usingApprovedAssets ? 'approved-runtime-copies' : 'procedural-fallback';
    }

    public render(
        state: SimulationState,
        layout: CombatLayout,
        preview: { x: number; y: number }[],
        projectileTrace: { x: number; y: number }[] = [],
        visualPhase?: CombatVisualPhase
    ): void {
        const g = this.background;
        const field = layout.battlefield;
        g.clear();
        g.fillStyle(0xD9F2F3);
        g.fillRect(0, 0, this.scene.scale.width, this.scene.scale.height);
        g.fillStyle(0xC9EEF2);
        g.fillRoundedRect(field.x, field.y, field.width, field.height, 10);

        if (this.usingApprovedAssets) {
            this.updateClouds(layout);
            this.updateTerrain(state, layout);
            this.updateWizardSprites(state.units, layout, visualPhase);
        } else {
            this.drawFallbackClouds(layout);
            this.drawFallbackTerrain(state, layout);
            for (const unit of state.units) this.drawFallbackKnotkin(unit, layout, state.selectedRelic);
        }

        this.teamCues.clear();
        if (this.usingApprovedAssets) this.drawTeamCues(state.units, layout);

        this.effects.clear();
        this.drawTrace(preview, layout, 0xE9B213, 0.95, true);
        this.drawVisualPhase(visualPhase, layout);

        g.lineStyle(2, 0x1F2348, 0.65);
        g.strokeRoundedRect(field.x, field.y, field.width, field.height, 10);
    }

    public destroy(): void {
        this.background.destroy();
        this.teamCues.destroy();
        this.effects.destroy();
        for (const sprite of Object.values(this.wizardSprites)) sprite?.destroy();
        for (const sprite of this.cloudSprites) sprite.destroy();
        for (const tile of this.terrainInteriorTiles) tile.destroy();
        for (const tile of this.terrainTopTiles) tile.destroy();
        this.formationSprite?.destroy();
        this.projectileSprite?.destroy();
    }

    private createWizardSprite(): Phaser.GameObjects.Sprite {
        const texture = this.usingWizardAnimations
            ? APPROVED_COMBAT_ASSETS.wizardIdle.key
            : APPROVED_COMBAT_ASSETS.wizard.key;
        return this.scene.add.sprite(0, 0, texture)
            .setDepth(3)
            .setOrigin(0.5, this.usingWizardAnimations
                ? WIZARD_ANIMATION_ROOT_ORIGIN_Y
                : WIZARD_ROOT_ORIGIN_Y);
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
            sprite.setPosition(field.x + field.width * x, field.y + field.height * y)
                .setDisplaySize(field.width * width, field.width * width)
                .setVisible(true);
        }
    }

    private updateTerrain(state: SimulationState, layout: CombatLayout): void {
        const cell = state.terrain.cellSize * layout.worldScale;
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
                    tile.setPosition(field.x + runStart * cell, field.y + y * cell)
                        .setSize((x - runStart) * cell + 0.5, cell + 0.5)
                        .setTileScale(cell / INTERIOR_SOURCE_SIZE, cell / INTERIOR_SOURCE_SIZE)
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
                tile.setPosition(field.x + x * cell, field.y + y * cell)
                    .setSize(cell + 0.5, Math.max(2, cell * 0.34))
                    .setTileScale(cell / INTERIOR_SOURCE_SIZE, cell / INTERIOR_SOURCE_SIZE)
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
            .setDepth(2);
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
        const scale = Math.max(0.1, layout.worldScale * (this.usingWizardAnimations
            ? WIZARD_ANIMATION_SCALE_IN_WORLD
            : WIZARD_SCALE_IN_WORLD));
        for (const unit of units) {
            const sprite = this.wizardSprites[unit.id];
            if (!sprite) continue;
            const root = this.actorRoot(unit, layout);
            sprite.setPosition(root.x, root.y)
                .setScale(scale)
                .setFlipX(unit.facing < 0)
                .setAlpha(1)
                .setVisible(true);
            this.updateWizardAnimation(sprite, unit, visualPhase);
        }
    }

    private updateWizardAnimation(
        sprite: Phaser.GameObjects.Sprite,
        unit: SimulationUnit,
        visualPhase?: CombatVisualPhase
    ): void {
        if (!this.usingWizardAnimations) return;
        const animation = this.wizardAnimationFor(unit.id, unit.alive, visualPhase);
        sprite.setOrigin(0.5, animation === WIZARD_ANIMATION_KEYS.unravel
            ? WIZARD_UNRAVEL_ROOT_ORIGIN_Y
            : WIZARD_ANIMATION_ROOT_ORIGIN_Y);
        if (sprite.anims.currentAnim?.key !== animation) sprite.play(animation);
    }

    private wizardAnimationFor(
        actor: SimulationActor,
        alive: boolean,
        visualPhase?: CombatVisualPhase
    ): string {
        // Once a unit is defeated, keep the terminal Unraveling frame rather than
        // returning it to an idle pose after the short impact presentation ends.
        if (!alive) return WIZARD_ANIMATION_KEYS.unravel;
        if (visualPhase?.actor === actor) {
            if (visualPhase.kind === 'movement') return WIZARD_ANIMATION_KEYS.walk;
            if (visualPhase.kind === 'cast-charge' || visualPhase.kind === 'cast-formation' ||
                visualPhase.kind === 'projectile') return WIZARD_ANIMATION_KEYS.cast;
        }
        return WIZARD_ANIMATION_KEYS.idle;
    }

    private drawTeamCues(units: readonly SimulationUnit[], layout: CombatLayout): void {
        const g = this.teamCues;
        const radius = Math.max(10, SIM_RULES.actorRadius * layout.worldScale * 1.8);
        for (const unit of units) {
            const root = this.actorRoot(unit, layout);
            const color = unit.id === 'player' ? 0xE9B213 : 0xFA7268;
            const alpha = unit.alive ? 0.75 : 0.25;
            g.lineStyle(Math.max(2, radius * 0.12), color, alpha);
            g.strokeEllipse(root.x, root.y - radius * 0.08, radius * 1.5, radius * 0.44);
        }
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
            if (visualPhase.relicId === 'threadball' && this.usingApprovedAssets) {
                this.drawThreadballProjectile(visualPhase.trace, layout);
            } else {
                this.drawGenericProjectile(visualPhase.relicId, visualPhase.trace, layout);
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
        if (!this.usingApprovedAssets || !this.formationSprite) return;
        const root = this.rootForActor(visualPhase.actor, layout);
        if (!root) return;
        const point = this.emissionPoint(root, layout);
        const key = visualPhase.stage === 'start'
            ? APPROVED_COMBAT_ASSETS.formationStart.key
            : APPROVED_COMBAT_ASSETS.formationReady.key;
        const scale = layout.worldScale * (visualPhase.stage === 'start' ? 0.38 : 0.62);
        this.formationSprite.setTexture(key)
            .setPosition(point.x, point.y)
            .setScale(scale)
            .setAlpha(visualPhase.stage === 'start' ? 0.9 : 1)
            .setVisible(true);
        if (visualPhase.stage === 'ready') {
            this.effects.lineStyle(Math.max(1, layout.worldScale * 1.8), 0xE9B213, 0.25);
            this.effects.strokeCircle(point.x, point.y, Math.max(6, layout.worldScale * 12));
        }
    }

    private drawThreadballProjectile(trace: { x: number; y: number }[], layout: CombatLayout): void {
        if (!this.projectileSprite || trace.length === 0) return;
        const endpoint = this.worldPoint(trace.at(-1)!.x, trace.at(-1)!.y, layout);
        this.projectileSprite.setPosition(endpoint.x, endpoint.y)
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
        const scale = Math.max(0.1, layout.worldScale * WIZARD_SCALE_IN_WORLD);
        return {
            x: root.x + root.facing * EMISSION_OFFSET.x * scale,
            y: root.y + EMISSION_OFFSET.y * scale
        };
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

    private drawFallbackTerrain(state: SimulationState, layout: CombatLayout): void {
        const g = this.background;
        const field = layout.battlefield;
        const cell = state.terrain.cellSize * layout.worldScale;
        g.fillStyle(0x795548);
        for (let y = 0; y < state.terrain.height; y += 1) {
            let runStart = -1;
            for (let x = 0; x <= state.terrain.width; x += 1) {
                const solid = x < state.terrain.width && terrainSolid(state.terrain, x, y);
                if (solid && runStart < 0) runStart = x;
                if (!solid && runStart >= 0) {
                    g.fillRect(field.x + runStart * cell, field.y + y * cell, (x - runStart) * cell + 0.6, cell + 0.6);
                    runStart = -1;
                }
            }
        }
        g.lineStyle(Math.max(2, cell * 0.45), 0x88B04B, 1);
        for (let x = 0; x < state.terrain.width; x += 1) {
            for (let y = 0; y < state.terrain.height; y += 1) {
                if (terrainSolid(state.terrain, x, y) && (y === 0 || !terrainSolid(state.terrain, x, y - 1))) {
                    const px = field.x + x * cell;
                    const py = field.y + y * cell;
                    g.lineBetween(px, py, px + cell, py);
                    break;
                }
            }
        }
    }

    private drawFallbackKnotkin(unit: SimulationUnit, layout: CombatLayout, relicId: RelicId): void {
        const g = this.background;
        const point = this.worldPoint(unit.x, unit.y, layout);
        const radius = Math.max(10, SIM_RULES.actorRadius * layout.worldScale * 1.8);
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
            x: layout.battlefield.x + x * layout.worldScale,
            y: layout.battlefield.y + y * layout.worldScale
        };
    }
}
