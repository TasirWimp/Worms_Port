import type { CombatLayout } from './layout';

export type CombatWorldPoint = Readonly<{ x: number; y: number }>;
export type WizardRoot = Readonly<{ x: number; y: number; facing: -1 | 1 }>;
export type WizardPresentationGeometry = 'static-master' | 'animation-sheet';

export const WIZARD_STATIC_ROOT_ORIGIN_Y = 451 / 512;
export const WIZARD_STATIC_SCALE_IN_WORLD = 0.23;
export const WIZARD_ANIMATION_ROOT_ORIGIN_Y = 212 / 256;
export const WIZARD_UNRAVEL_ROOT_ORIGIN_Y = 229 / 256;
export const WIZARD_ANIMATION_SCALE_IN_WORLD = 0.56;

const STATIC_LOOMSEED_OFFSET = { x: 151, y: -223 };
// The final retained spell frame puts the Loomseed centre at (158, 106)
// relative to its 256px root (128, 212), unlike the static 512px master.
const ANIMATION_LOOMSEED_OFFSET = { x: 30, y: -106 };

export function loomseedScreenPoint(
    root: WizardRoot,
    layout: CombatLayout,
    geometry: WizardPresentationGeometry
): CombatWorldPoint {
    const animationSheet = geometry === 'animation-sheet';
    const scale = Math.max(0.1, layout.worldScale * (animationSheet
        ? WIZARD_ANIMATION_SCALE_IN_WORLD
        : WIZARD_STATIC_SCALE_IN_WORLD));
    const offset = animationSheet ? ANIMATION_LOOMSEED_OFFSET : STATIC_LOOMSEED_OFFSET;
    return {
        x: root.x + root.facing * offset.x * scale,
        y: root.y + offset.y * scale
    };
}

// Physics stays authoritative. Replacing only the first displayed point makes
// the guide and launch leave the permanent Loomseed without moving impact,
// collision, damage, replay, or the rest of the flight.
export function traceFromLoomseedOrigin(
    trace: readonly CombatWorldPoint[],
    root: WizardRoot,
    layout: CombatLayout,
    geometry: WizardPresentationGeometry
): CombatWorldPoint[] {
    if (trace.length === 0 || layout.worldScale <= 0) return trace.map((point) => ({ ...point }));
    const anchor = loomseedScreenPoint(root, layout, geometry);
    return [
        {
            x: (anchor.x - layout.battlefield.x) / layout.worldScale,
            y: (anchor.y - layout.battlefield.y) / layout.worldScale
        },
        ...trace.slice(1).map((point) => ({ ...point }))
    ];
}
