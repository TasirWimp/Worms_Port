import { SIM_RULES } from '../../../shared/simulation';
import type { Rect, SafeAreaInsets } from './contracts';

export type CombatLayout = {
    orientation: 'portrait' | 'landscape';
    battlefield: Rect;
    movementZone: Rect;
    aimZone: Rect;
    actionZone: Rect;
    worldScale: number;
};

const MINIMUM_INSET = 8;
const HUD_HEIGHT = 54;

export function computeCombatLayout(
    width: number,
    height: number,
    safeArea: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 }
): CombatLayout {
    const left = Math.max(MINIMUM_INSET, safeArea.left);
    const right = Math.max(MINIMUM_INSET, safeArea.right);
    const top = Math.max(MINIMUM_INSET, safeArea.top);
    const bottom = Math.max(MINIMUM_INSET, safeArea.bottom);
    const usableWidth = Math.max(240, width - left - right);
    const usableHeight = Math.max(320, height - top - bottom);
    const orientation = width > height ? 'landscape' : 'portrait';

    if (orientation === 'landscape') {
        const actionWidth = Math.max(224, Math.min(300, usableWidth * 0.31));
        const battlefieldWidthLimit = usableWidth - actionWidth - 12;
        const battlefieldHeightLimit = usableHeight - HUD_HEIGHT;
        const scale = Math.min(
            battlefieldWidthLimit / SIM_RULES.worldWidth,
            battlefieldHeightLimit / SIM_RULES.worldHeight
        );
        const battlefield = {
            x: left + Math.max(0, (battlefieldWidthLimit - SIM_RULES.worldWidth * scale) / 2),
            y: top + HUD_HEIGHT + Math.max(0, (battlefieldHeightLimit - SIM_RULES.worldHeight * scale) / 2),
            width: SIM_RULES.worldWidth * scale,
            height: SIM_RULES.worldHeight * scale
        };
        const actionX = left + battlefieldWidthLimit + 12;
        const actionHeight = 104;
        const padHeight = Math.max(82, (usableHeight - HUD_HEIGHT - actionHeight - 12) / 2);
        return {
            orientation,
            battlefield,
            movementZone: { x: actionX, y: top + HUD_HEIGHT, width: actionWidth, height: padHeight },
            aimZone: { x: actionX, y: top + HUD_HEIGHT + padHeight + 6, width: actionWidth, height: padHeight },
            actionZone: { x: actionX, y: height - bottom - actionHeight, width: actionWidth, height: actionHeight },
            worldScale: scale
        };
    }

    const battlefieldWidthLimit = usableWidth;
    const battlefieldHeightLimit = Math.min(usableHeight * 0.43, battlefieldWidthLimit * 0.72);
    const scale = Math.min(
        battlefieldWidthLimit / SIM_RULES.worldWidth,
        battlefieldHeightLimit / SIM_RULES.worldHeight
    );
    const battlefield = {
        x: left + (battlefieldWidthLimit - SIM_RULES.worldWidth * scale) / 2,
        y: top + HUD_HEIGHT,
        width: SIM_RULES.worldWidth * scale,
        height: SIM_RULES.worldHeight * scale
    };
    const controlsTop = battlefield.y + battlefield.height + 8;
    const controlsHeight = Math.max(126, height - bottom - controlsTop - 62);
    const gap = 8;
    const padWidth = (usableWidth - gap) / 2;
    return {
        orientation,
        battlefield,
        movementZone: { x: left, y: controlsTop, width: padWidth, height: controlsHeight },
        aimZone: { x: left + padWidth + gap, y: controlsTop, width: padWidth, height: controlsHeight },
        actionZone: { x: left, y: height - bottom - 56, width: usableWidth, height: 56 },
        worldScale: scale
    };
}
