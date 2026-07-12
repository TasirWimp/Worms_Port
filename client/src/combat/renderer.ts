import Phaser from 'phaser';

import {
    SIM_RULES,
    terrainSolid,
    type RelicId,
    type SimulationState,
    type SimulationUnit
} from '../../../shared/simulation';
import type { CombatLayout } from './layout';

export class CombatRenderer {
    private readonly graphics: Phaser.GameObjects.Graphics;

    public constructor(scene: Phaser.Scene) {
        this.graphics = scene.add.graphics().setDepth(0);
    }

    public render(
        state: SimulationState,
        layout: CombatLayout,
        preview: { x: number; y: number }[]
    ): void {
        const g = this.graphics;
        const field = layout.battlefield;
        g.clear();
        g.fillStyle(0xD9F2F3);
        g.fillRect(0, 0, g.scene.scale.width, g.scene.scale.height);
        g.fillStyle(0xC9EEF2);
        g.fillRoundedRect(field.x, field.y, field.width, field.height, 10);
        this.drawClouds(layout);
        this.drawTerrain(state, layout);
        this.drawTrace(state.lastProjectile?.trace ?? [], layout, 0xFC8702, 0.8, false);
        this.drawTrace(preview, layout, 0xE9B213, 0.95, true);
        for (const unit of state.units) this.drawKnotkin(unit, layout, state.selectedRelic);
        g.lineStyle(2, 0x1F2348, 0.65);
        g.strokeRoundedRect(field.x, field.y, field.width, field.height, 10);
    }

    public destroy(): void {
        this.graphics.destroy();
    }

    private drawClouds(layout: CombatLayout): void {
        const g = this.graphics;
        const field = layout.battlefield;
        g.fillStyle(0xFFFFFF, 0.75);
        for (const [x, y, radius] of [
            [0.14, 0.18, 13], [0.2, 0.15, 18], [0.26, 0.19, 11],
            [0.72, 0.17, 12], [0.78, 0.14, 17], [0.84, 0.18, 10]
        ]) g.fillCircle(field.x + field.width * x, field.y + field.height * y, radius);
    }

    private drawTerrain(state: SimulationState, layout: CombatLayout): void {
        const g = this.graphics;
        const field = layout.battlefield;
        const cell = state.terrain.cellSize * layout.worldScale;
        g.fillStyle(0x795548);
        for (let y = 0; y < state.terrain.height; y += 1) {
            let runStart = -1;
            for (let x = 0; x <= state.terrain.width; x += 1) {
                const solid = x < state.terrain.width && terrainSolid(state.terrain, x, y);
                if (solid && runStart < 0) runStart = x;
                if (!solid && runStart >= 0) {
                    g.fillRect(
                        field.x + runStart * cell,
                        field.y + y * cell,
                        (x - runStart) * cell + 0.6,
                        cell + 0.6
                    );
                    runStart = -1;
                }
            }
        }
        g.lineStyle(Math.max(2, cell * 0.45), 0x88B04B, 1);
        for (let x = 0; x < state.terrain.width; x += 1) {
            for (let y = 0; y < state.terrain.height; y += 1) {
                if (terrainSolid(state.terrain, x, y) &&
                    (y === 0 || !terrainSolid(state.terrain, x, y - 1))) {
                    const px = field.x + x * cell;
                    const py = field.y + y * cell;
                    g.lineBetween(px, py, px + cell, py);
                    break;
                }
            }
        }
    }

    private drawKnotkin(unit: SimulationUnit, layout: CombatLayout, relicId: RelicId): void {
        const g = this.graphics;
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
        g.fillRoundedRect(point.x - radius * 0.72, point.y + radius * 0.58, radius * 0.58, radius * 0.55, 3);
        g.fillRoundedRect(point.x + radius * 0.14, point.y + radius * 0.58, radius * 0.58, radius * 0.55, 3);
        g.lineStyle(Math.max(2, radius * 0.12), accent, alpha);
        g.strokeCircle(point.x, point.y, radius);
        g.fillStyle(0x111111, alpha);
        g.fillCircle(point.x - radius * 0.34, point.y - radius * 0.14, radius * 0.25);
        g.fillCircle(point.x + radius * 0.34, point.y - radius * 0.14, radius * 0.25);
        g.fillStyle(0xFFFFFF, alpha);
        g.fillCircle(point.x - radius * 0.28, point.y - radius * 0.23, radius * 0.075);
        g.fillCircle(point.x + radius * 0.4, point.y - radius * 0.23, radius * 0.075);
        this.drawHeldRelic(relicId, point.x, point.y, radius, unit.facing);
    }

    private drawHeldRelic(
        relicId: RelicId,
        x: number,
        y: number,
        radius: number,
        facing: -1 | 1
    ): void {
        const g = this.graphics;
        const rx = x + facing * radius * 1.15;
        const ry = y + radius * 0.18;
        g.lineStyle(2, 0xE9B213, 1);
        if (relicId === 'threadball') {
            g.strokeCircle(rx, ry, radius * 0.3);
            g.lineBetween(rx - radius * 0.2, ry, rx + radius * 0.2, ry);
        } else if (relicId === 'needlepoint') {
            g.lineBetween(rx - facing * radius * 0.4, ry + radius * 0.3, rx + facing * radius * 0.45, ry - radius * 0.35);
            g.fillCircle(rx + facing * radius * 0.45, ry - radius * 0.35, 2);
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
        dotted: boolean
    ): void {
        if (points.length < 2) return;
        const g = this.graphics;
        g.lineStyle(dotted ? 3 : 2, color, alpha);
        for (let index = 1; index < points.length; index += 1) {
            if (dotted && index % 2 === 0) continue;
            const start = this.worldPoint(points[index - 1].x, points[index - 1].y, layout);
            const end = this.worldPoint(points[index].x, points[index].y, layout);
            g.lineBetween(start.x, start.y, end.x, end.y);
        }
    }

    private worldPoint(x: number, y: number, layout: CombatLayout): { x: number; y: number } {
        return {
            x: layout.battlefield.x + x * layout.worldScale,
            y: layout.battlefield.y + y * layout.worldScale
        };
    }
}
