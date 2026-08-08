import { SIM_RULES } from '../../../shared/simulation';
import type { SimulationUnit } from '../../../shared/simulation';
import { COMBAT_CAMERA_WINDOW, type CombatCamera } from './camera';
import type { Rect, SafeAreaInsets } from './contracts';
import { WIZARD_PRESENTATION_TOP_IN_WORLD } from './loomseed-origin';

export type CombatLayout = {
    orientation: 'portrait' | 'landscape';
    battlefield: Rect;
    movementZone: Rect;
    aimZone: Rect;
    actionZone: Rect;
    statusZone: Rect;
    pauseZone: Rect;
    worldScale: number;
    camera: CombatCamera;
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
    safeArea: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 },
    camera: CombatCamera = { left: 0, top: 0, ...COMBAT_CAMERA_WINDOW }
): CombatLayout {
    const left = Math.max(MINIMUM_INSET, safeArea.left);
    const right = Math.max(MINIMUM_INSET, safeArea.right);
    const top = Math.max(MINIMUM_INSET, safeArea.top);
    const bottom = Math.max(MINIMUM_INSET, safeArea.bottom);
    const usableWidth = Math.max(1, width - left - right);
    const usableHeight = Math.max(1, height - top - bottom);
    const orientation = width > height ? 'landscape' : 'portrait';

    const scale = Math.min(
        usableWidth / camera.width,
        usableHeight / camera.height
    );
    const battlefield = {
        x: left + (usableWidth - camera.width * scale) / 2,
        y: top + (usableHeight - camera.height * scale) / 2,
        width: camera.width * scale,
        height: camera.height * scale
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
        worldScale: scale,
        camera
    };
}

export function computeActorStatusLayout(
    layout: CombatLayout,
    units: readonly [SimulationUnit, SimulationUnit] | readonly SimulationUnit[]
): { player?: Rect; loomkeeper?: Rect } {
    const width = Math.min(108, Math.max(78, layout.battlefield.width * 0.16));
    const height = 32;
    const actorOffset = Math.max(
        36,
        (SIM_RULES.actorRadius + WIZARD_PRESENTATION_TOP_IN_WORLD) * layout.worldScale + 12
    );
    const field = layout.battlefield;
    const rectFor = (unit: SimulationUnit): Rect | undefined => {
        const worldX = unit.x - layout.camera.left;
        const status = {
            x: field.x + worldX * layout.worldScale - width / 2,
            y: field.y + unit.y * layout.worldScale - actorOffset - height,
            width,
            height
        };
        // Never clamp a card to the viewport edge: that makes it look detached
        // from its Wizard while the camera moves. Hide it once its true anchor
        // is no longer fully in the visible battlefield.
        return status.x < field.x || status.x + status.width > field.x + field.width ||
            status.y < field.y || status.y + status.height > field.y + field.height
            ? undefined
            : status;
    };
    const player = rectFor(units[0]);
    const loomkeeper = rectFor(units[1]);
    return { player, loomkeeper };
}
