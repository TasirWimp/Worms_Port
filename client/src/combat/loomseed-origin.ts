import type { CombatLayout } from './layout';

export type CombatWorldPoint = Readonly<{ x: number; y: number }>;
export type WizardRoot = Readonly<{ x: number; y: number; facing: -1 | 1 }>;
export type WizardPresentationGeometry = 'static-master' | 'animation-sheet';

// WP-015C phone-scale read: both shared Wizard presentations are enlarged by
// thirty percent without changing their ground root or their source geometry.
export const WIZARD_PRESENTATION_SCALE_MULTIPLIER = 1.3;
export const WIZARD_STATIC_ROOT_ORIGIN_Y = 451 / 512;
export const WIZARD_STATIC_SCALE_IN_WORLD = 0.23 * WIZARD_PRESENTATION_SCALE_MULTIPLIER;
export const WIZARD_ANIMATION_ROOT_ORIGIN_Y = 212 / 256;
export const WIZARD_UNRAVEL_ROOT_ORIGIN_Y = 229 / 256;
export const WIZARD_ANIMATION_SCALE_IN_WORLD = 0.56 * WIZARD_PRESENTATION_SCALE_MULTIPLIER;
// The idle/cast sheet's hat begins near y=40. This keeps unit status cards
// visibly above the enlarged shared Wizard while preserving its ground root.
export const WIZARD_PRESENTATION_TOP_IN_WORLD = (212 - 40) * WIZARD_ANIMATION_SCALE_IN_WORLD;
export const WIZARD_R6_ANIMATION_SCALE_IN_WORLD = 0.4;
export const WIZARD_R6_STATIC_SCALE_IN_WORLD = 0.23 * WIZARD_R6_ANIMATION_SCALE_IN_WORLD / 0.56;
export const WIZARD_R6_PRESENTATION_TOP_IN_WORLD = (212 - 40) * WIZARD_R6_ANIMATION_SCALE_IN_WORLD;

/** R7 retains the accepted compact R6 actor presentation. */
export function usesCompactWizardPresentation(rulesetId?: string): boolean {
    return rulesetId === 'nimble-knots-artillery-v10-r6' ||
        rulesetId === 'nimble-knots-artillery-v10-r7' ||
        rulesetId === 'nimble-knots-artillery-v10-r8';
}

/**
 * A fallen R7 unit is already authoritatively dead once its collision body has
 * cleared the open bottom. Do not hold its larger art sprite on the last row
 * during the terminal presentation.
 */
export function wizardPresentationVisible(
    unit: Readonly<{ alive: boolean; y: number }>,
    rulesetId: string | undefined,
    worldBottom: number,
    collisionRadius: number
): boolean {
    return (rulesetId !== 'nimble-knots-artillery-v10-r7' && rulesetId !== 'nimble-knots-artillery-v10-r8') || unit.alive ||
        unit.y - collisionRadius < worldBottom;
}

export function wizardPresentationScaleInWorld(
    geometry: WizardPresentationGeometry,
    rulesetId?: string
): number {
    const compact = usesCompactWizardPresentation(rulesetId);
    return geometry === 'animation-sheet'
        ? compact ? WIZARD_R6_ANIMATION_SCALE_IN_WORLD : WIZARD_ANIMATION_SCALE_IN_WORLD
        : compact ? WIZARD_R6_STATIC_SCALE_IN_WORLD : WIZARD_STATIC_SCALE_IN_WORLD;
}

export function wizardPresentationTopInWorld(rulesetId?: string): number {
    return usesCompactWizardPresentation(rulesetId)
        ? WIZARD_R6_PRESENTATION_TOP_IN_WORLD
        : WIZARD_PRESENTATION_TOP_IN_WORLD;
}

const STATIC_LOOMSEED_OFFSET = { x: 151, y: -223 };
// The final retained spell frame puts the Loomseed centre at (158, 106)
// relative to its 256px root (128, 212), unlike the static 512px master.
const ANIMATION_LOOMSEED_OFFSET = { x: 30, y: -106 };

export function loomseedScreenPoint(
    root: WizardRoot,
    layout: CombatLayout,
    geometry: WizardPresentationGeometry,
    rulesetId?: string
): CombatWorldPoint {
    const animationSheet = geometry === 'animation-sheet';
    const scale = Math.max(0.1, layout.worldScale * wizardPresentationScaleInWorld(geometry, rulesetId));
    const offset = animationSheet ? ANIMATION_LOOMSEED_OFFSET : STATIC_LOOMSEED_OFFSET;
    return {
        x: root.x + root.facing * offset.x * scale,
        y: root.y + offset.y * scale
    };
}

// Physics stays authoritative. The presentation offsets the whole sampled arc
// smoothly from the permanent Loomseed back to the authoritative impact. This
// avoids a visible kink after the first point while leaving collision, damage,
// replay, and the final impact coordinate unchanged.
export function traceFromLoomseedOrigin(
    trace: readonly CombatWorldPoint[],
    root: WizardRoot,
    layout: CombatLayout,
    geometry: WizardPresentationGeometry,
    rulesetId?: string
): CombatWorldPoint[] {
    if (trace.length === 0 || layout.worldScaleX <= 0 || layout.worldScaleY <= 0) {
        return trace.map((point) => ({ ...point }));
    }
    const anchor = loomseedScreenPoint(root, layout, geometry, rulesetId);
    const origin = {
        // `anchor` is in screen space. Restore the camera origin before
        // comparing it with authoritative world-space trace samples; omitting
        // this was invisible at camera.left = 0 but shifted a panned preview.
        x: (anchor.x - layout.battlefield.x) / layout.worldScaleX + layout.camera.left,
        y: (anchor.y - layout.battlefield.y) / layout.worldScaleY + layout.camera.top
    };
    if (trace.length === 1) return [origin];
    const delta = { x: origin.x - trace[0].x, y: origin.y - trace[0].y };
    const lastIndex = trace.length - 1;
    return trace.map((point, index) => {
        const remaining = 1 - index / lastIndex;
        const weight = remaining * remaining;
        return {
            x: point.x + delta.x * weight,
            y: point.y + delta.y * weight
        };
    });
}
