import type { SimulationActor, SimulationState } from '../../../shared/simulation';

/**
 * Normal combat returns to the V3 1024 by 576 presentation window. V4 also
 * permits one bounded opening overview; it never exposes a user-controlled
 * zoom or changes authoritative world geometry.
 */
export const COMBAT_CAMERA_WINDOW = Object.freeze({ width: 1024, height: 576 });

/** Presentation-only breathing room between a live aim endpoint and the camera edge. */
export const COMBAT_AIM_EDGE_INSET_WORLD = 64;

export type CombatCamera = Readonly<{
    left: number;
    top: number;
    width: number;
    height: number;
}>;

export function createCombatCamera(state: Pick<SimulationState, 'terrain'>): CombatCamera {
    const standard = standardCameraWindow(state);
    return clampCombatCamera(state, {
        left: 0,
        top: 0,
        ...standard
    });
}

/**
 * V4's opening-only survey. It preserves the normal 16:9 presentation aspect
 * while fitting the full authoritative width, which places the extra vertical
 * sky around the existing world without extending simulation space.
 */
export function createCombatOverviewCamera(state: Pick<SimulationState, 'terrain'>): CombatCamera {
    const standard = standardCameraWindow(state);
    const width = Math.max(standard.width, worldWidth(state));
    return clampCombatCamera(state, {
        left: 0,
        top: 0,
        width,
        height: width * standard.height / standard.width
    });
}

export function clampCombatCamera(
    state: Pick<SimulationState, 'terrain'>,
    camera: CombatCamera
): CombatCamera {
    const standard = standardCameraWindow(state);
    const width = clamp(camera.width, standard.width, Math.max(standard.width, worldWidth(state)));
    const height = width * standard.height / standard.width;
    return {
        left: clamp(camera.left, 0, Math.max(0, worldWidth(state) - width)),
        top: (worldHeight(state) - height) / 2,
        width,
        height
    };
}

export function interpolateCombatCamera(
    state: Pick<SimulationState, 'terrain'>,
    from: CombatCamera,
    to: CombatCamera,
    progress: number
): CombatCamera {
    const amount = clamp(progress, 0, 1);
    return clampCombatCamera(state, {
        left: from.left + (to.left - from.left) * amount,
        top: from.top + (to.top - from.top) * amount,
        width: from.width + (to.width - from.width) * amount,
        height: from.height + (to.height - from.height) * amount
    });
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
    const inset = Math.min(COMBAT_AIM_EDGE_INSET_WORLD, camera.width / 2);
    if (worldX > camera.left + camera.width - inset) {
        return clampCombatCamera(state, { ...camera, left: worldX - camera.width + inset });
    }
    if (worldX < camera.left + inset) {
        return clampCombatCamera(state, { ...camera, left: worldX - inset });
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

function standardCameraWindow(state: Pick<SimulationState, 'terrain'>): Pick<CombatCamera, 'width' | 'height'> {
    return {
        width: Math.min(COMBAT_CAMERA_WINDOW.width, worldWidth(state)),
        height: Math.min(COMBAT_CAMERA_WINDOW.height, worldHeight(state))
    };
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}
