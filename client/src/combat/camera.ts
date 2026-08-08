import type { SimulationActor, SimulationState } from '../../../shared/simulation';

/**
 * The physical combat window stays at the V3 1024 by 576 dimensions. V4 makes
 * the authoritative terrain wider; it does not make mobile controls smaller.
 */
export const COMBAT_CAMERA_WINDOW = Object.freeze({ width: 1024, height: 576 });

export type CombatCamera = Readonly<{
    left: number;
    top: number;
    width: number;
    height: number;
}>;

export function createCombatCamera(state: Pick<SimulationState, 'terrain'>): CombatCamera {
    return clampCombatCamera(state, {
        left: 0,
        top: 0,
        width: Math.min(COMBAT_CAMERA_WINDOW.width, worldWidth(state)),
        height: Math.min(COMBAT_CAMERA_WINDOW.height, worldHeight(state))
    });
}

export function clampCombatCamera(
    state: Pick<SimulationState, 'terrain'>,
    camera: CombatCamera
): CombatCamera {
    const width = Math.min(COMBAT_CAMERA_WINDOW.width, worldWidth(state));
    const height = Math.min(COMBAT_CAMERA_WINDOW.height, worldHeight(state));
    return {
        left: clamp(camera.left, 0, Math.max(0, worldWidth(state) - width)),
        top: 0,
        width,
        height
    };
}

export function focusCombatCamera(
    state: Pick<SimulationState, 'terrain'>,
    camera: CombatCamera,
    worldX: number
): CombatCamera {
    return clampCombatCamera(state, { ...camera, left: worldX - camera.width / 2 });
}

export function panCombatCamera(
    state: Pick<SimulationState, 'terrain'>,
    camera: CombatCamera,
    deltaWorldX: number
): CombatCamera {
    return clampCombatCamera(state, { ...camera, left: camera.left + deltaWorldX });
}

/**
 * Keeps an off-screen predicted impact just inside the view while a player is
 * still dragging the Aim pad. This is presentation navigation only: it never
 * changes the aim, simulation, or target selection.
 */
export function revealCombatCameraPoint(
    state: Pick<SimulationState, 'terrain'>,
    camera: CombatCamera,
    worldX: number
): CombatCamera {
    if (worldX > camera.left + camera.width) {
        return clampCombatCamera(state, { ...camera, left: worldX - camera.width });
    }
    if (worldX < camera.left) {
        return clampCombatCamera(state, { ...camera, left: worldX });
    }
    return clampCombatCamera(state, camera);
}

export function cameraForActor(
    state: Pick<SimulationState, 'terrain' | 'units'>,
    camera: CombatCamera,
    actor: SimulationActor
): CombatCamera {
    const unit = state.units[actor === 'player' ? 0 : 1];
    return focusCombatCamera(state, camera, unit.x);
}

export function cameraDirectionToWorldX(
    camera: CombatCamera,
    worldX: number
): 'left' | 'right' | null {
    if (worldX < camera.left) return 'left';
    if (worldX > camera.left + camera.width) return 'right';
    return null;
}

function worldWidth(state: Pick<SimulationState, 'terrain'>): number {
    return state.terrain.width * state.terrain.cellSize;
}

function worldHeight(state: Pick<SimulationState, 'terrain'>): number {
    return state.terrain.height * state.terrain.cellSize;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}
