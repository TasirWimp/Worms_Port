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
    const usableWidth = Math.max(1, width - left - right);
    const usableHeight = Math.max(1, height - top - bottom);
    const orientation = width > height ? 'landscape' : 'portrait';

    if (orientation === 'landscape') {
        const hudHeight = Math.min(HUD_HEIGHT, Math.max(44, usableHeight * 0.16));
        const actionWidth = Math.min(
            320,
            Math.max(200, usableWidth * 0.34),
            usableWidth * 0.46
        );
        const battlefieldWidthLimit = Math.max(1, usableWidth - actionWidth - 12);
        const battlefieldHeightLimit = Math.max(1, usableHeight - hudHeight);
        const scale = Math.min(
            battlefieldWidthLimit / SIM_RULES.worldWidth,
            battlefieldHeightLimit / SIM_RULES.worldHeight
        );
        const battlefield = {
            x: left + Math.max(0, (battlefieldWidthLimit - SIM_RULES.worldWidth * scale) / 2),
            y: top + hudHeight + Math.max(0, (battlefieldHeightLimit - SIM_RULES.worldHeight * scale) / 2),
            width: SIM_RULES.worldWidth * scale,
            height: SIM_RULES.worldHeight * scale
        };
        const actionX = left + battlefieldWidthLimit + 12;
        const controlsTop = top + hudHeight;
        const controlsHeight = Math.max(1, usableHeight - hudHeight);
        const gap = 6;
        const maximumActionHeight = Math.max(48, controlsHeight - 72);
        const actionHeight = Math.min(
            104,
            Math.max(96, controlsHeight * 0.42),
            maximumActionHeight
        );
        const padHeight = Math.max(1, controlsHeight - actionHeight - gap);
        const padWidth = (actionWidth - gap) / 2;
        return {
            orientation,
            battlefield,
            movementZone: { x: actionX, y: controlsTop, width: padWidth, height: padHeight },
            aimZone: { x: actionX + padWidth + gap, y: controlsTop, width: padWidth, height: padHeight },
            actionZone: {
                x: actionX,
                y: controlsTop + padHeight + gap,
                width: actionWidth,
                height: actionHeight
            },
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
