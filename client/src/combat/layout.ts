import { SIM_RULES } from '../../../shared/simulation';
import type { SimulationUnit } from '../../../shared/simulation';
import type { Rect, SafeAreaInsets } from './contracts';

export type CombatLayout = {
    orientation: 'portrait' | 'landscape';
    battlefield: Rect;
    movementZone: Rect;
    aimZone: Rect;
    actionZone: Rect;
    statusZone: Rect;
    pauseZone: Rect;
    worldScale: number;
};

const MINIMUM_INSET = 8;
const MINIMUM_PAD_SIZE = 112;
const MAXIMUM_PAD_SIZE = 164;
const ACTION_WIDTH = 212;
const ACTION_HEIGHT = 56;
const STATUS_HEIGHT = 46;

export function computeCombatLayout(
    width: number,
    height: number,
    safeArea: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 }
): CombatLayout {
    const left = Math.max(MINIMUM_INSET, safeArea.left);
    const right = Math.max(MINIMUM_INSET, safeArea.right);
    const top = Math.max(MINIMUM_INSET, safeArea.top);
    const bottom = Math.max(MINIMUM_INSET, safeArea.bottom);
    const usableWidth = Math.max(1, width - left - right);
    const usableHeight = Math.max(1, height - top - bottom);
    const orientation = width > height ? 'landscape' : 'portrait';

    const scale = Math.min(
        usableWidth / SIM_RULES.worldWidth,
        usableHeight / SIM_RULES.worldHeight
    );
    const battlefield = {
        x: left + (usableWidth - SIM_RULES.worldWidth * scale) / 2,
        y: top + (usableHeight - SIM_RULES.worldHeight * scale) / 2,
        width: SIM_RULES.worldWidth * scale,
        height: SIM_RULES.worldHeight * scale
    };

    const padSize = Math.min(
        MAXIMUM_PAD_SIZE,
        Math.max(MINIMUM_PAD_SIZE, Math.min(usableWidth * 0.28, usableHeight * 0.46))
    );
    const padY = top + usableHeight - padSize;
    const actionWidth = Math.min(ACTION_WIDTH, Math.max(112, usableWidth - padSize * 2 - 16));
    const actionY = orientation === 'portrait'
        ? Math.max(top + STATUS_HEIGHT + 8, padY - ACTION_HEIGHT - 8)
        : top + usableHeight - ACTION_HEIGHT;
    const statusWidth = Math.min(240, Math.max(160, usableWidth * 0.34));

    return {
        orientation,
        battlefield,
        movementZone: { x: left, y: padY, width: padSize, height: padSize },
        aimZone: { x: left + usableWidth - padSize, y: padY, width: padSize, height: padSize },
        actionZone: {
            x: left + (usableWidth - actionWidth) / 2,
            y: actionY,
            width: actionWidth,
            height: ACTION_HEIGHT
        },
        statusZone: {
            x: left + (usableWidth - statusWidth) / 2,
            y: top,
            width: statusWidth,
            height: STATUS_HEIGHT
        },
        pauseZone: { x: left, y: top, width: 48, height: 48 },
        worldScale: scale
    };
}

export function computeActorStatusLayout(
    layout: CombatLayout,
    units: readonly [SimulationUnit, SimulationUnit] | readonly SimulationUnit[]
): { player: Rect; loomkeeper: Rect } {
    const width = Math.min(108, Math.max(78, layout.battlefield.width * 0.16));
    const height = 32;
    const edge = 6;
    const actorOffset = Math.max(36, SIM_RULES.actorRadius * layout.worldScale * 1.8 + 25);
    const field = layout.battlefield;
    const rectFor = (unit: SimulationUnit): Rect => ({
        x: clamp(field.x + unit.x * layout.worldScale - width / 2, field.x + edge, field.x + field.width - width - edge),
        y: clamp(field.y + unit.y * layout.worldScale - actorOffset - height, field.y + edge, field.y + field.height - height - edge),
        width,
        height
    });
    const player = rectFor(units[0]);
    const loomkeeper = rectFor(units[1]);
    if (overlaps(player, loomkeeper)) {
        player.x = field.x + edge;
        loomkeeper.x = field.x + field.width - width - edge;
        const sharedY = Math.min(player.y, loomkeeper.y);
        player.y = sharedY;
        loomkeeper.y = sharedY;
    }
    return { player, loomkeeper };
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function overlaps(a: Rect, b: Rect): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x &&
        a.y < b.y + b.height && a.y + a.height > b.y;
}
