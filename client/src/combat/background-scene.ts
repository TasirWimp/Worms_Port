/**
 * A preview-only, non-authoritative scene grammar.  This module intentionally
 * consumes no terrain, actors, simulation seed, replay, or input state.
 */
export type BackgroundSceneId = 'volcanic-ruin';

export type BackgroundLayer = 'L1-distant' | 'L2-landmark' | 'L3-near';

export type BackgroundPlacement = Readonly<{
    asset: 'volcano' | 'jungle' | 'tower' | 'palm' | 'bush';
    layer: BackgroundLayer;
    anchor: Readonly<{ x: number; y: number }>;
    scale: number;
    alpha: number;
    parallax: number;
}>;

export type BackgroundSceneDefinition = Readonly<{
    id: BackgroundSceneId;
    vegetationSeed: number;
    landmarkPlacements: readonly BackgroundPlacement[];
}>;

export type BackgroundProjectionInput = Readonly<{
    worldWidth: number;
    worldHeight: number;
    cameraLeft: number;
    fieldX: number;
    fieldY: number;
    fieldHeight: number;
    fieldWidth: number;
    worldScaleX: number;
    worldScaleY: number;
}>;

export const VOLCANIC_RUIN_BACKGROUND_PREVIEW = 'volcanic-ruin';
// Preview scene grammar is bound to the reviewed V10G presentation world, not
// to any terrain instance, terrain pixels, seed, or simulation snapshot.
export const VOLCANIC_RUIN_PREVIEW_WORLD = Object.freeze({ width: 2048, height: 576 });

// These normalized rectangles reserve the actor, trajectory, and status-read
// areas. Decorative anchors must stay outside them; their pixels never affect
// any of those systems.
export const BACKGROUND_LEGIBILITY_LANES = Object.freeze([
    { left: 0, right: 0.18, top: 0.15, bottom: 0.60 },
    { left: 0.87, right: 1, top: 0.15, bottom: 0.65 },
    { left: 0.25, right: 0.68, top: 0.10, bottom: 0.48 }
]);

export const VOLCANIC_RUIN_BACKGROUND = Object.freeze({
    id: 'volcanic-ruin',
    vegetationSeed: 0x015D4F,
    landmarkPlacements: Object.freeze([
        { asset: 'volcano', layer: 'L1-distant', anchor: { x: 0.40, y: 0.87 }, scale: 0.82, alpha: 0.74, parallax: 0.08 },
        ...[0.04, 0.27, 0.50, 0.73, 0.96].map(x => ({ asset: 'jungle', layer: 'L1-distant',
            anchor: { x, y: 0.83 }, scale: 0.64, alpha: 0.88, parallax: 0.1 })),
        { asset: 'tower', layer: 'L2-landmark', anchor: { x: 0.79, y: 0.81 }, scale: 0.74, alpha: 0.96, parallax: 0.18 }
    ])
}) as BackgroundSceneDefinition;

/** Only this explicit, engineering-only URL opt-in may request scene art. */
export function backgroundSceneFromSearch(search: string): BackgroundSceneDefinition | undefined {
    return new URLSearchParams(search).get('background-preview') === VOLCANIC_RUIN_BACKGROUND_PREVIEW
        ? VOLCANIC_RUIN_BACKGROUND
        : undefined;
}

export function pointIsInBackgroundLegibilityLane(anchor: Readonly<{ x: number; y: number }>): boolean {
    return BACKGROUND_LEGIBILITY_LANES.some((lane) =>
        anchor.x >= lane.left && anchor.x <= lane.right && anchor.y >= lane.top && anchor.y <= lane.bottom
    );
}

/** A fixed LCG keeps near foliage stable without borrowing any game state. */
export function seededVegetationPlacements(seed: number, count = 24): readonly BackgroundPlacement[] {
    let state = seed >>> 0;
    const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x1_0000_0000; };
    return Array.from({ length: count }, (_, index) => {
        const palm = index % 3 === 0;
        return { asset: palm ? 'palm' : 'bush', layer: 'L3-near',
            anchor: { x: (index + 0.2 + next() * 0.6) / count, y: (palm ? 0.84 : 0.81) + next() * 0.02 },
            scale: palm ? 0.26 + next() * 0.07 : 0.22 + next() * 0.09,
            alpha: palm ? 0.86 : 0.94, parallax: 0.32 };
    });
}

export function backgroundPlacements(definition: BackgroundSceneDefinition): readonly BackgroundPlacement[] {
    return [...definition.landmarkPlacements, ...seededVegetationPlacements(definition.vegetationSeed)];
}

export function backgroundLayerDepth(layer: BackgroundLayer): number {
    return layer === 'L1-distant' ? 0.1 : layer === 'L2-landmark' ? 0.2 : 0.3;
}

/** Pure camera/layout projection; authority data is intentionally not accepted. */
export function projectBackgroundPlacement(
    placement: BackgroundPlacement,
    input: BackgroundProjectionInput
): Readonly<{ x: number; y: number; scale: number; depth: number }> {
    return {
        // Compose inside the visible arena, not across the hidden 2048-unit world.
        // Modest bounded drift preserves the landmark even after deliberate panning.
        x: input.fieldX + placement.anchor.x * input.fieldWidth - Math.max(-input.fieldWidth * 0.06,
            Math.min(input.fieldWidth * 0.06, (input.cameraLeft - 512) * placement.parallax * input.worldScaleX)),
        y: input.fieldY + placement.anchor.y * input.worldHeight * input.worldScaleY,
        scale: input.fieldHeight / input.worldHeight * placement.scale,
        depth: backgroundLayerDepth(placement.layer)
    };
}
