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
    { left: 0.14, right: 0.36, top: 0.42, bottom: 0.94 },
    { left: 0.64, right: 0.86, top: 0.42, bottom: 0.94 },
    { left: 0.32, right: 0.68, top: 0.58, bottom: 0.88 }
]);

export const VOLCANIC_RUIN_BACKGROUND = Object.freeze({
    id: 'volcanic-ruin',
    vegetationSeed: 0x015D4F,
    landmarkPlacements: Object.freeze([
        { asset: 'volcano', layer: 'L1-distant', anchor: { x: 0.5, y: 0.42 }, scale: 0.74, alpha: 0.56, parallax: 0.08 },
        { asset: 'jungle', layer: 'L1-distant', anchor: { x: 0.5, y: 0.55 }, scale: 0.98, alpha: 0.42, parallax: 0.1 },
        { asset: 'tower', layer: 'L2-landmark', anchor: { x: 0.92, y: 0.68 }, scale: 0.53, alpha: 0.68, parallax: 0.18 }
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
export function seededVegetationPlacements(seed: number, count = 6): readonly BackgroundPlacement[] {
    let state = seed >>> 0;
    const next = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x1_0000_0000;
    };
    const placements: BackgroundPlacement[] = [];
    for (let index = 0; placements.length < count && index < count * 16; index += 1) {
        const anchor = { x: 0.025 + next() * 0.95, y: 0.73 + next() * 0.21 };
        if (pointIsInBackgroundLegibilityLane(anchor)) continue;
        placements.push({
            asset: placements.length % 2 === 0 ? 'palm' : 'bush',
            layer: 'L3-near',
            anchor,
            scale: 0.19 + next() * 0.1,
            alpha: 0.58 + next() * 0.14,
            parallax: 0.32
        });
    }
    return placements;
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
        x: input.fieldX + (placement.anchor.x * input.worldWidth - input.cameraLeft * placement.parallax) * input.worldScaleX,
        y: input.fieldY + placement.anchor.y * input.worldHeight * input.worldScaleY,
        scale: input.fieldHeight / input.worldHeight * placement.scale,
        depth: backgroundLayerDepth(placement.layer)
    };
}
