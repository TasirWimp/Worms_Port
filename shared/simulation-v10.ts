import { generateVolcanicRuinTerrain, VOLCANIC_RUIN_RECIPE_REVISION } from './terrain-volcanic-ruin';
import { V10G_PROJECTILE_RULES, V10_R6_PROJECTILE_RULES } from './projectile-rules-v10g';
import { generateV10GTwinCrests, V10G_RECIPE_REVISION, generateV10GFamily, v10gFamilyForSeed, V10G_FAMILY_RECIPE_REVISION } from './terrain-generation-v10g';
import { z } from 'zod';
import {
    applySimulationBarrierV9, applySimulationIntentV9, advanceSimulationTicksV9,
    assertSimulationInvariantsV9, cloneSimulationV9, createSimulationV9, forceSimulationLimitV9,
    SimulationBarrierV9Schema, SimulationIntentV9Schema, SimulationStateV9KernelSchema,
    type SimulationBarrierV9, type SimulationEventV9, type SimulationIntentV9,
    type SimulationStateV9, type SimulationTransitionV9, type SimulationUnitV9
} from './simulation-v9';
import { V8_DEFAULT_DYNAMICS, type ProjectileMechanics, type SimulationDynamics } from './simulation-v8';
import {
    SIM_RULES, terrainSolid,
    type PackedTerrain, type PlayerCalling
} from './simulation';
import {
    V10_PROCEDURAL_CANDIDATE_COUNT, V10_PROCEDURAL_RECIPE_REVISION,
    V10_PROCEDURAL_TERRAIN_PROFILE_IDS, generateLegacyV10Surface,
    packV10SurfaceRows, v10ProceduralTerrainProfileForSeed,
    type V10ProceduralTerrainProfileId
} from './terrain-generation-v10';
import { selectV10ProceduralSurface } from './terrain-admission-v10f';

/** Product-owned V10 terrain/start authority. V9 mechanics remain immutable. */
export const V10_RULESET_ID = 'nimble-knots-artillery-v10' as const;
export const V10_R1_RULESET_ID = 'nimble-knots-artillery-v10-r1' as const;
export const V10_R2_RULESET_ID = 'nimble-knots-artillery-v10-r2' as const;
export const V10_R3_RULESET_ID = 'nimble-knots-artillery-v10-r3' as const;
export const V10_R4_RULESET_ID = 'nimble-knots-artillery-v10-r4' as const;
export const V10_R5_RULESET_ID = 'nimble-knots-artillery-v10-r5' as const;
export const V10_R6_RULESET_ID = 'nimble-knots-artillery-v10-r6' as const;
export const CURRENT_V10_RULESET_ID = V10_R6_RULESET_ID;
export const usesV10GTactics = (rulesetId: string): boolean => rulesetId === V10_R3_RULESET_ID || rulesetId === V10_R4_RULESET_ID || rulesetId === V10_R5_RULESET_ID || rulesetId === V10_R6_RULESET_ID;
export const usesVolcanicRuin = (rulesetId: string): boolean => rulesetId === V10_R5_RULESET_ID || rulesetId === V10_R6_RULESET_ID;
export const usesV10R6ActionDynamics = (rulesetId: string): boolean => rulesetId === V10_R6_RULESET_ID;
export const V10_RULESET_IDS = Object.freeze([V10_RULESET_ID, V10_R1_RULESET_ID, V10_R2_RULESET_ID, V10_R3_RULESET_ID, V10_R4_RULESET_ID, V10_R5_RULESET_ID, V10_R6_RULESET_ID] as const);
export type V10RulesetId = typeof V10_RULESET_IDS[number];
export function isV10RulesetId(value: unknown): value is V10RulesetId {
    return value === V10_RULESET_ID || value === V10_R1_RULESET_ID || value === V10_R2_RULESET_ID || value === V10_R3_RULESET_ID || value === V10_R4_RULESET_ID || value === V10_R5_RULESET_ID || value === V10_R6_RULESET_ID;
}
export const V10_RULESET_VERSION = 10 as const;
export const V10_R6_DYNAMICS: SimulationDynamics = Object.freeze({
    ...V8_DEFAULT_DYNAMICS,
    actionTicks: 1_800,
    leaseTicks: 18,
    maximumTurnTicks: 2_400,
    maximumCombatTicks: 38_400,
    walkSpeedFp: 336,
    jumpSpeedFp: -1_728,
    airControlAccelerationFp: 24
});
export const V10_TERRAIN_PROFILE_IDS = Object.freeze([
    'sheltered-folds',
    'rising-braid',
    'open-terraces'
] as const);
export const V10_R1_TERRAIN_PROFILE_IDS = Object.freeze([
    'twin-hollows',
    'broken-loom',
    'high-stitch'
] as const);
export const V10_ALL_TERRAIN_PROFILE_IDS = Object.freeze([
    ...V10_TERRAIN_PROFILE_IDS,
    ...V10_R1_TERRAIN_PROFILE_IDS,
    ...V10_PROCEDURAL_TERRAIN_PROFILE_IDS,
    'volcanic-ruin'
] as const);
export type V10TerrainProfileId = typeof V10_ALL_TERRAIN_PROFILE_IDS[number];
export type V10R1TerrainProfileId = typeof V10_R1_TERRAIN_PROFILE_IDS[number];
export type V10LegacyTerrainProfileId = typeof V10_TERRAIN_PROFILE_IDS[number] | V10R1TerrainProfileId;

export const V10_PROFILE_RULES = Object.freeze({
    'sheltered-folds': Object.freeze({ separation: 512, minimumHeightDifference: 0, maximumHeightDifference: 24 }),
    'rising-braid': Object.freeze({ separation: 576, minimumHeightDifference: 32, maximumHeightDifference: 64 }),
    'open-terraces': Object.freeze({ separation: 640, minimumHeightDifference: 0, maximumHeightDifference: 24 }),
    'twin-hollows': Object.freeze({ separation: 512, minimumHeightDifference: 0, maximumHeightDifference: 16 }),
    'broken-loom': Object.freeze({ separation: 576, minimumHeightDifference: 0, maximumHeightDifference: 16 }),
    'high-stitch': Object.freeze({ separation: 640, minimumHeightDifference: 32, maximumHeightDifference: 48 })
} satisfies Readonly<Record<V10LegacyTerrainProfileId, Readonly<{
    separation: number; minimumHeightDifference: number; maximumHeightDifference: number;
}>>>);

export const V10_OPENING_RULES = Object.freeze({
    safeWorldMargin: SIM_RULES.actorRadius + SIM_RULES.movementPerTurn,
    outwardMovement: SIM_RULES.movementPerTurn,
    movementStep: SIM_RULES.movementStep,
    maximumRouteStep: 8,
    maximumWalkStep: 16,
    jumpPositionDistance: 64,
    minimumJumpRise: 24,
    maximumJumpRise: 48
});

export type V10JumpPosition = Readonly<{
    takeoffX: number;
    landingX: number;
    takeoffSurfaceY: number;
    landingSurfaceY: number;
    direction: -1 | 1;
    rise: number;
}>;

export type V10OpeningPair = Readonly<{
    leftX: number;
    rightX: number;
    leftSurfaceY: number;
    rightSurfaceY: number;
    score: Readonly<{
        profileFit: number;
        combinedLocalMobility: number;
        centerBias: number;
        tieBreak: number;
    }>;
    jumpPositions: readonly V10JumpPosition[] | null;
}>;

export type V10TacticalArena = Readonly<{
    terrain: PackedTerrain;
    rngState: number;
    profileId: V10TerrainProfileId;
    reflected: boolean;
    variation: number;
    phase: number;
    opening: V10OpeningPair;
    evaluatedPairs: number;
    eligiblePairs: number;
    recipeRevision?: typeof V10_PROCEDURAL_RECIPE_REVISION | typeof V10G_RECIPE_REVISION | typeof V10G_FAMILY_RECIPE_REVISION | typeof VOLCANIC_RUIN_RECIPE_REVISION;
    candidateIndex?: number;
    fallbackUsed?: boolean;
}>;

export type SimulationStateV10 = Omit<SimulationStateV9, 'formatVersion' | 'rulesetId' | 'rulesetVersion'> & {
    formatVersion: 10;
    rulesetId: V10RulesetId;
    rulesetVersion: 10;
    terrainProfileId: V10TerrainProfileId;
    terrainRecipeRevision?: typeof V10_PROCEDURAL_RECIPE_REVISION | typeof V10G_RECIPE_REVISION | typeof V10G_FAMILY_RECIPE_REVISION | typeof VOLCANIC_RUIN_RECIPE_REVISION;
    terrainCandidateIndex?: number;
};
export type SimulationIntentV10 = SimulationIntentV9 | { type: 'jump'; direction: 0 };
export type SimulationBarrierV10 = SimulationBarrierV9;
export type SimulationEventV10 = SimulationEventV9;
export type SimulationTransitionV10 = Omit<SimulationTransitionV9, 'state'> & { state: SimulationStateV10 };

export const SimulationStateV10Schema = SimulationStateV9KernelSchema.omit({
    formatVersion: true, rulesetId: true, rulesetVersion: true
}).extend({
    formatVersion: z.literal(10),
    rulesetId: z.enum(V10_RULESET_IDS),
    rulesetVersion: z.literal(10),
    terrainProfileId: z.enum(V10_ALL_TERRAIN_PROFILE_IDS),
    terrainRecipeRevision: z.enum([V10_PROCEDURAL_RECIPE_REVISION, V10G_RECIPE_REVISION, V10G_FAMILY_RECIPE_REVISION, VOLCANIC_RUIN_RECIPE_REVISION]).optional(),
    terrainCandidateIndex: z.number().int().min(0).max(V10_PROCEDURAL_CANDIDATE_COUNT - 1).optional()
}).strict().superRefine((state, context) => {
    const r3 = state.rulesetId === V10_R3_RULESET_ID;
    const r4 = state.rulesetId === V10_R4_RULESET_ID;
    const r5 = state.rulesetId === V10_R5_RULESET_ID;
    const r6 = state.rulesetId === V10_R6_RULESET_ID;
    const volcanic = r5 || r6;
    const procedural = state.rulesetId === V10_R2_RULESET_ID || r3 || r4 || volcanic;
    const expectedProfiles = volcanic ? ['volcanic-ruin'] : procedural
        ? V10_PROCEDURAL_TERRAIN_PROFILE_IDS
        : state.rulesetId === V10_R1_RULESET_ID ? V10_R1_TERRAIN_PROFILE_IDS : V10_TERRAIN_PROFILE_IDS;
    if (!(expectedProfiles as readonly string[]).includes(state.terrainProfileId) || (r3 && state.terrainProfileId !== 'twin-crests') || (r4 && state.terrainProfileId !== v10gFamilyForSeed(state.seed).profileId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['terrainProfileId'],
            message: 'Terrain profile does not belong to the recorded V10 ruleset.' });
    }
    if (procedural && (state.terrainRecipeRevision !== (volcanic ? VOLCANIC_RUIN_RECIPE_REVISION : r4 ? V10G_FAMILY_RECIPE_REVISION : r3 ? V10G_RECIPE_REVISION : V10_PROCEDURAL_RECIPE_REVISION) || ((r3 || r4 || volcanic) && state.terrainCandidateIndex !== 0))) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['terrainRecipeRevision'], message: 'Recipe/candidate does not belong to ruleset.' });
    }
    const hasRecipeRevision = Object.prototype.hasOwnProperty.call(state, 'terrainRecipeRevision');
    const hasCandidateIndex = Object.prototype.hasOwnProperty.call(state, 'terrainCandidateIndex');
    if (procedural !== hasRecipeRevision || (hasRecipeRevision && state.terrainRecipeRevision === undefined)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['terrainRecipeRevision'],
            message: 'Procedural recipe revision must match the recorded V10 ruleset.' });
    }
    if (procedural !== hasCandidateIndex || (hasCandidateIndex && state.terrainCandidateIndex === undefined)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['terrainCandidateIndex'],
            message: 'Procedural candidate index must match the recorded V10 ruleset.' });
    }
    if (!r6 && (state.tick > V8_DEFAULT_DYNAMICS.maximumCombatTicks ||
        state.phaseStartedTick > V8_DEFAULT_DYNAMICS.maximumCombatTicks ||
        state.phaseDeadlineTick > V8_DEFAULT_DYNAMICS.maximumCombatTicks + V8_DEFAULT_DYNAMICS.maximumTurnTicks ||
        (state.lastLeaseRefreshTick !== null && state.lastLeaseRefreshTick > V8_DEFAULT_DYNAMICS.maximumCombatTicks) ||
        (state.leaseExpiresTick !== null && state.leaseExpiresTick > V8_DEFAULT_DYNAMICS.maximumCombatTicks + V8_DEFAULT_DYNAMICS.leaseTicks))) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['tick'],
            message: 'Pre-R6 state exceeds its frozen clock bounds.' });
    }
});
export const SimulationIntentV10Schema = z.union([
    SimulationIntentV9Schema,
    z.object({ type: z.literal('jump'), direction: z.literal(0) }).strict()
]);
export const SimulationBarrierV10Schema = SimulationBarrierV9Schema;

export function v10TerrainProfileForSeed(
    seed: number,
    rulesetId: V10RulesetId = V10_RULESET_ID
): V10TerrainProfileId {
    const normalized = normalizeSeed(seed);
    if (usesVolcanicRuin(rulesetId)) return 'volcanic-ruin';
    if (rulesetId === V10_R4_RULESET_ID) return v10gFamilyForSeed(normalized).profileId;
    if (rulesetId === V10_R3_RULESET_ID) return 'twin-crests';
    if (rulesetId === V10_R2_RULESET_ID) return v10ProceduralTerrainProfileForSeed(normalized);
    const profiles = rulesetId === V10_R1_RULESET_ID ? V10_R1_TERRAIN_PROFILE_IDS : V10_TERRAIN_PROFILE_IDS;
    return profiles[normalized % profiles.length];
}

export function generateV10TacticalArena(
    seed: number,
    rulesetId: V10RulesetId = V10_RULESET_ID
): V10TacticalArena {
    const normalized = normalizeSeed(seed);
    const profileId = v10TerrainProfileForSeed(normalized, rulesetId);
    if (usesV10GTactics(rulesetId)) {
        const candidate = usesVolcanicRuin(rulesetId) ? generateVolcanicRuinTerrain() : rulesetId === V10_R4_RULESET_ID ? generateV10GFamily(normalized) : generateV10GTwinCrests();
        return { terrain: candidate.terrain, rngState: normalized, profileId, reflected: rulesetId === V10_R4_RULESET_ID && v10gFamilyForSeed(normalized).reflected, variation: 0, phase: 0,
            opening: { ...candidate.opening, score: { profileFit: 0, combinedLocalMobility: 0, centerBias: 0, tieBreak: normalized }, jumpPositions: candidate.jumpPositions },
            evaluatedPairs: 1, eligiblePairs: 1, recipeRevision: candidate.recipeRevision, candidateIndex: 0, fallbackUsed: false };
    }
    if (rulesetId === V10_R2_RULESET_ID) {
        const selection = selectV10ProceduralSurface(normalized);
        const evaluated = selection.selected;
        const candidate = evaluated.candidate;
        return {
            terrain: evaluated.terrain,
            rngState: evaluated.score.tieBreak || normalized,
            profileId,
            reflected: candidate.reflected,
            variation: candidate.candidateIndex,
            phase: 0,
            opening: {
                ...evaluated.opening,
                score: {
                    profileFit: evaluated.score.familyLandmarkFit,
                    combinedLocalMobility: evaluated.localMobility[0] + evaluated.localMobility[1],
                    centerBias: evaluated.score.centerBias,
                    tieBreak: evaluated.score.tieBreak
                },
                jumpPositions: evaluated.jumpPositions
            },
            evaluatedPairs: V10_PROCEDURAL_CANDIDATE_COUNT,
            eligiblePairs: selection.admittedCandidates,
            recipeRevision: candidate.recipeRevision,
            candidateIndex: candidate.candidateIndex,
            fallbackUsed: selection.fallbackUsed
        };
    }
    const { rows, ...surface } = generateLegacyV10Surface(normalized, profileId);
    const terrain = packV10SurfaceRows(rows);
    const selected = selectV10OpeningPair(terrain, normalized, profileId);
    return { terrain, profileId, ...surface, ...selected };
}

export function selectV10OpeningPair(
    terrain: PackedTerrain,
    seed: number,
    profileId: V10TerrainProfileId
): { opening: V10OpeningPair; evaluatedPairs: number; eligiblePairs: number } {
    if (isV10ProceduralProfile(profileId) || profileId === 'volcanic-ruin') {
        throw new Error('V10F openings are selected with their procedural candidate.');
    }
    const rules = V10_PROFILE_RULES[profileId];
    const firstX = alignUp(V10_OPENING_RULES.safeWorldMargin, terrain.cellSize);
    const lastX = terrain.width * terrain.cellSize - V10_OPENING_RULES.safeWorldMargin - rules.separation;
    let opening: V10OpeningPair | undefined;
    let evaluatedPairs = 0;
    let eligiblePairs = 0;
    for (let leftX = firstX; leftX <= lastX; leftX += terrain.cellSize) {
        evaluatedPairs += 1;
        const candidate = evaluateOpening(terrain, normalizeSeed(seed), profileId, leftX, leftX + rules.separation);
        if (!candidate) continue;
        eligiblePairs += 1;
        if (!opening || compareOpenings(candidate, opening) < 0) opening = candidate;
    }
    if (!opening) throw new Error(`V10 ${profileId} terrain has no eligible opening pair.`);
    return { opening, evaluatedPairs, eligiblePairs };
}

export function evaluateV10OpeningPair(
    terrain: PackedTerrain,
    seed: number,
    profileId: V10TerrainProfileId,
    firstX: number,
    secondX: number
): V10OpeningPair {
    if (isV10ProceduralProfile(profileId) || profileId === 'volcanic-ruin') {
        throw new Error('V10F openings are selected with their procedural candidate.');
    }
    const opening = evaluateOpening(
        terrain, normalizeSeed(seed), profileId,
        Math.min(firstX, secondX), Math.max(firstX, secondX)
    );
    if (!opening) throw new Error(`V10 ${profileId} opening pair lacks valid support or movement geometry.`);
    return opening;
}

export function createSimulationV10(
    seed: number,
    calling: PlayerCalling,
    rulesetId: V10RulesetId = V10_RULESET_ID
): SimulationStateV10 {
    const base = createV9Base(seed, calling);
    if (!isV10RulesetId(rulesetId)) throw new Error('Unknown V10 ruleset.');
    if (usesV10R6ActionDynamics(rulesetId)) {
        base.phaseDeadlineTick = V10_R6_DYNAMICS.actionTicks;
        base.units[0].thread = 5;
    }
    const arena = generateV10TacticalArena(base.seed, rulesetId);
    const state: SimulationStateV10 = {
        ...base,
        formatVersion: 10,
        rulesetId,
        rulesetVersion: 10,
        rngState: arena.rngState,
        terrainProfileId: arena.profileId,
        ...((rulesetId === V10_R2_RULESET_ID || usesV10GTactics(rulesetId)) ? {
            terrainRecipeRevision: arena.recipeRevision!,
            terrainCandidateIndex: arena.candidateIndex!
        } : {}),
        terrain: arena.terrain,
        units: base.units.map((unit, index) => {
            const x = index === 0 ? arena.opening.leftX : arena.opening.rightX;
            const surfaceY = index === 0 ? arena.opening.leftSurfaceY : arena.opening.rightSurfaceY;
            return {
                ...unit,
                xFp: x * 256,
                yFp: (surfaceY - SIM_RULES.actorRadius) * 256,
                facing: index === 0 ? 1 : -1,
                support: terrainSupport(arena.terrain, x, surfaceY)
            };
        }) as [SimulationUnitV9, SimulationUnitV9]
    };
    assertSimulationInvariantsV10(state);
    return state;
}

export function applySimulationIntentV10(
    current: SimulationStateV10,
    actor: Parameters<typeof applySimulationIntentV9>[1],
    intent: SimulationIntentV10,
    expectedTurn: number,
    expectedPhase = current.phase,
    expectedEpoch = current.inputEpoch
): SimulationTransitionV10 {
    assertSimulationInvariantsV10(current);
    const mechanics = mechanicsForV10(current.rulesetId);
    const dynamics = dynamicsForV10(current.rulesetId);
    const neutralJump = intent.type === 'jump' && intent.direction === 0;
    if (neutralJump && (current.rulesetId !== V10_R6_RULESET_ID || current.heldDirection !== 0)) {
        return { accepted: false, mutated: false, state: current, events: [],
            error: { code: 'COMMAND_REJECTED', message: 'Neutral jump requires an idle R6 actor.' } };
    }
    const delegatedIntent: SimulationIntentV9 = neutralJump
        ? { type: 'jump', direction: current.units[actor === 'player' ? 0 : 1].facing }
        : intent as SimulationIntentV9;
    const transition = applySimulationIntentV9(
        toV9(current), actor, delegatedIntent, expectedTurn, expectedPhase, expectedEpoch, mechanics, dynamics
    );
    if (neutralJump && transition.accepted && transition.mutated) {
        transition.state.units[actor === 'player' ? 0 : 1].vxFp = 0;
    }
    return fromV9Transition(
        transition,
        current
    );
}

export function advanceSimulationTicksV10(current: SimulationStateV10, count: number): SimulationTransitionV10 {
    assertSimulationInvariantsV10(current);
    return fromV9Transition(advanceSimulationTicksV9(toV9(current), count,
        mechanicsForV10(current.rulesetId), dynamicsForV10(current.rulesetId)), current);
}

export function applySimulationBarrierV10(
    current: SimulationStateV10,
    barrier: SimulationBarrierV10
): SimulationTransitionV10 {
    assertSimulationInvariantsV10(current);
    return fromV9Transition(applySimulationBarrierV9(toV9(current), barrier, dynamicsForV10(current.rulesetId)), current);
}

export function forceSimulationLimitV10(current: SimulationStateV10): SimulationTransitionV10 {
    assertSimulationInvariantsV10(current);
    return fromV9Transition(forceSimulationLimitV9(toV9(current), dynamicsForV10(current.rulesetId)), current);
}

export function cloneSimulationV10(state: SimulationStateV10): SimulationStateV10 {
    const cloned = cloneSimulationV9(toV9(state));
    return fromV9(cloned, state.rulesetId, state.terrainProfileId,
        state.terrainRecipeRevision, state.terrainCandidateIndex);
}

/**
 * Detached compatibility view for the frozen V9 planner. V10 authority keeps
 * its own identity and terrain profile; the planner receives only a deep V9
 * clone and therefore cannot mutate or relabel the live V10 state. R3/R4 callers
 * must also bind R3 mechanics, as LoomkeeperPlannerV10 does; this view alone
 * does not carry the candidate's physics.
 */
export function simulationV9ViewOfV10(state: SimulationStateV10): SimulationStateV9 {
    assertSimulationInvariantsV10(state);
    return cloneSimulationV9(toV9(state));
}

export function assertSimulationInvariantsV10(state: SimulationStateV10): void {
    if (!SimulationStateV10Schema.safeParse(state).success) throw new Error('Invalid V10 state: schema.');
    if (state.terrainProfileId !== v10TerrainProfileForSeed(state.seed, state.rulesetId)) {
        throw new Error('Invalid V10 state: terrain profile does not match seed.');
    }
    assertSimulationInvariantsV9(toV9(state), dynamicsForV10(state.rulesetId));
}

export function canonicalSimulationJsonV10(state: SimulationStateV10): string {
    assertSimulationInvariantsV10(state);
    return canonicalJson(state);
}

export function hashSimulationStateV10(state: SimulationStateV10): string {
    return sha256(new TextEncoder().encode(canonicalSimulationJsonV10(state)));
}

function createV9Base(seed: number, calling: PlayerCalling): SimulationStateV9 {
    return createSimulationV9(normalizeSeed(seed), calling);
}

export function dynamicsForV10(rulesetId: V10RulesetId): SimulationDynamics | undefined {
    return usesV10R6ActionDynamics(rulesetId) ? V10_R6_DYNAMICS : undefined;
}

export function mechanicsForV10(rulesetId: V10RulesetId): ProjectileMechanics | undefined {
    return rulesetId === V10_R6_RULESET_ID ? V10_R6_PROJECTILE_RULES
        : usesV10GTactics(rulesetId) ? V10G_PROJECTILE_RULES : undefined;
}

function fromV9Transition(result: SimulationTransitionV9, current: SimulationStateV10): SimulationTransitionV10 {
    if (!result.mutated) return { ...result, state: current };
    const state = fromV9(result.state, current.rulesetId, current.terrainProfileId,
        current.terrainRecipeRevision, current.terrainCandidateIndex);
    assertSimulationInvariantsV10(state);
    return { ...result, state };
}

function toV9(state: SimulationStateV10): SimulationStateV9 {
    const {
        terrainProfileId: _profile,
        terrainRecipeRevision: _recipe,
        terrainCandidateIndex: _candidate,
        ...common
    } = state;
    return { ...common, formatVersion: 9, rulesetId: 'nimble-knots-artillery-v9', rulesetVersion: 9 };
}

function fromV9(
    state: SimulationStateV9,
    rulesetId: V10RulesetId,
    terrainProfileId: V10TerrainProfileId,
    terrainRecipeRevision?: typeof V10_PROCEDURAL_RECIPE_REVISION | typeof V10G_RECIPE_REVISION | typeof V10G_FAMILY_RECIPE_REVISION | typeof VOLCANIC_RUIN_RECIPE_REVISION,
    terrainCandidateIndex?: number
): SimulationStateV10 {
    return {
        ...state,
        formatVersion: 10,
        rulesetId,
        rulesetVersion: 10,
        terrainProfileId,
        ...(terrainRecipeRevision !== undefined ? { terrainRecipeRevision } : {}),
        ...(terrainCandidateIndex !== undefined ? { terrainCandidateIndex } : {})
    };
}

function evaluateOpening(
    terrain: PackedTerrain,
    seed: number,
    profileId: V10LegacyTerrainProfileId,
    leftX: number,
    rightX: number
): V10OpeningPair | null {
    const rules = V10_PROFILE_RULES[profileId];
    const worldWidth = terrain.width * terrain.cellSize;
    if (!Number.isSafeInteger(leftX) || !Number.isSafeInteger(rightX) ||
        leftX % terrain.cellSize !== 0 || rightX % terrain.cellSize !== 0 ||
        rightX - leftX !== rules.separation || leftX < V10_OPENING_RULES.safeWorldMargin ||
        rightX > worldWidth - V10_OPENING_RULES.safeWorldMargin) return null;
    const leftSurfaceY = bodyClearSurfaceY(terrain, leftX);
    const rightSurfaceY = bodyClearSurfaceY(terrain, rightX);
    if (leftSurfaceY === null || rightSurfaceY === null) return null;
    const heightDifference = Math.abs(rightSurfaceY - leftSurfaceY);
    if (heightDifference < rules.minimumHeightDifference || heightDifference > rules.maximumHeightDifference) return null;
    const outwardSteps = V10_OPENING_RULES.outwardMovement / V10_OPENING_RULES.movementStep;
    if (movementReach(terrain, leftX, -1) < outwardSteps || movementReach(terrain, rightX, 1) < outwardSteps) return null;
    const jumpPositions = isV10R1Profile(profileId)
        ? tacticalJumpPositions(terrain, leftX, rightX)
        : null;
    if (jumpPositions === undefined || (!isV10R1Profile(profileId) && !hasContinuousRoute(terrain, leftX, rightX))) return null;
    const combinedLocalMobility = ([-1, 1] as const).reduce((total, direction) =>
        total + movementReach(terrain, leftX, direction) + movementReach(terrain, rightX, direction), 0);
    return {
        leftX, rightX, leftSurfaceY, rightSurfaceY,
        score: {
            profileFit: profileFit(terrain, profileId, leftX, rightX, leftSurfaceY, rightSurfaceY),
            combinedLocalMobility,
            centerBias: Math.abs(leftX + rightX - worldWidth),
            tieBreak: pairTieBreak(seed, leftX, rightX)
        },
        jumpPositions
    };
}

function profileFit(
    terrain: PackedTerrain,
    profileId: V10LegacyTerrainProfileId,
    leftX: number,
    rightX: number,
    leftSurfaceY: number,
    rightSurfaceY: number
): number {
    if (profileId === 'rising-braid' || profileId === 'high-stitch') {
        return Math.abs(rightSurfaceY - leftSurfaceY);
    }
    let minimumSurface = Number.MAX_SAFE_INTEGER;
    let maximumSurface = 0;
    for (let x = leftX; x <= rightX; x += terrain.cellSize) {
        const surface = surfaceY(terrain, x);
        minimumSurface = Math.min(minimumSurface, surface);
        maximumSurface = Math.max(maximumSurface, surface);
    }
    if (profileId === 'sheltered-folds' || profileId === 'twin-hollows' || profileId === 'broken-loom') {
        return Math.min(leftSurfaceY, rightSurfaceY) - minimumSurface;
    }
    return 256 - (maximumSurface - minimumSurface);
}

function isV10R1Profile(profileId: V10TerrainProfileId): profileId is V10R1TerrainProfileId {
    return (V10_R1_TERRAIN_PROFILE_IDS as readonly string[]).includes(profileId);
}

function isV10ProceduralProfile(profileId: V10TerrainProfileId): profileId is V10ProceduralTerrainProfileId {
    return (V10_PROCEDURAL_TERRAIN_PROFILE_IDS as readonly string[]).includes(profileId);
}

function tacticalJumpPositions(
    terrain: PackedTerrain,
    leftX: number,
    rightX: number
): readonly [V10JumpPosition, V10JumpPosition] | undefined {
    const left = tacticalJumpPosition(terrain, leftX, 1);
    const right = tacticalJumpPosition(terrain, rightX, -1);
    if (!left || !right || hasWalkableRoute(terrain, left.takeoffX, left.landingX) ||
        hasWalkableRoute(terrain, right.landingX, right.takeoffX)) return undefined;
    return [left, right];
}

function tacticalJumpPosition(
    terrain: PackedTerrain,
    takeoffX: number,
    direction: -1 | 1
): V10JumpPosition | undefined {
    const landingX = takeoffX + direction * V10_OPENING_RULES.jumpPositionDistance;
    const takeoffSurfaceY = bodyClearSurfaceY(terrain, takeoffX);
    const landingSurfaceY = bodyClearSurfaceY(terrain, landingX);
    if (takeoffSurfaceY === null || landingSurfaceY === null) return undefined;
    const rise = takeoffSurfaceY - landingSurfaceY;
    if (rise < V10_OPENING_RULES.minimumJumpRise || rise > V10_OPENING_RULES.maximumJumpRise) return undefined;
    // A full actor-width landing zone keeps the phone jump forgiving.
    for (const offset of [-8, 0, 8]) {
        const surface = bodyClearSurfaceY(terrain, landingX + offset);
        if (surface === null || surface !== landingSurfaceY) return undefined;
    }
    return { takeoffX, landingX, takeoffSurfaceY, landingSurfaceY, direction, rise };
}

function hasWalkableRoute(terrain: PackedTerrain, leftX: number, rightX: number): boolean {
    let previous = surfaceY(terrain, leftX);
    for (let x = leftX + terrain.cellSize; x <= rightX; x += terrain.cellSize) {
        const next = surfaceY(terrain, x);
        if (next >= terrain.height * terrain.cellSize ||
            Math.abs(next - previous) > V10_OPENING_RULES.maximumWalkStep) return false;
        previous = next;
    }
    return true;
}

function bodyClearSurfaceY(terrain: PackedTerrain, x: number): number | null {
    const supportY = surfaceY(terrain, x);
    if (supportY >= terrain.height * terrain.cellSize) return null;
    const leftColumn = Math.floor((x - SIM_RULES.actorRadius) / terrain.cellSize);
    const rightColumn = Math.ceil((x + SIM_RULES.actorRadius) / terrain.cellSize) - 1;
    const topRow = Math.max(0, Math.floor((supportY - SIM_RULES.actorRadius * 2) / terrain.cellSize));
    const bottomRow = Math.floor((supportY - 1) / terrain.cellSize);
    for (let column = leftColumn; column <= rightColumn; column += 1) {
        for (let row = topRow; row <= bottomRow; row += 1) {
            if (terrainSolid(terrain, column, row)) return null;
        }
    }
    return supportY;
}

function movementReach(terrain: PackedTerrain, startX: number, direction: -1 | 1): number {
    let x = startX;
    let surface = surfaceY(terrain, x);
    let steps = 0;
    const maximumSteps = V10_OPENING_RULES.outwardMovement / V10_OPENING_RULES.movementStep;
    while (steps < maximumSteps) {
        const targetX = x + direction * V10_OPENING_RULES.movementStep;
        if (targetX < SIM_RULES.actorRadius || targetX > terrain.width * terrain.cellSize - SIM_RULES.actorRadius - 1) break;
        const targetSurface = surfaceY(terrain, targetX);
        if (targetSurface >= terrain.height * terrain.cellSize || Math.abs(targetSurface - surface) > V10_OPENING_RULES.maximumRouteStep) break;
        x = targetX;
        surface = targetSurface;
        steps += 1;
    }
    return steps;
}

function hasContinuousRoute(terrain: PackedTerrain, leftX: number, rightX: number): boolean {
    let previous = surfaceY(terrain, leftX);
    for (let x = leftX + terrain.cellSize; x <= rightX; x += terrain.cellSize) {
        const next = surfaceY(terrain, x);
        if (next >= terrain.height * terrain.cellSize || Math.abs(next - previous) > V10_OPENING_RULES.maximumRouteStep) return false;
        previous = next;
    }
    return true;
}

function terrainSupport(terrain: PackedTerrain, x: number, supportY: number): number {
    const row = supportY / terrain.cellSize;
    const first = Math.max(0, Math.floor((x - SIM_RULES.actorRadius) / terrain.cellSize));
    const last = Math.min(terrain.width - 1, Math.ceil((x + SIM_RULES.actorRadius) / terrain.cellSize) - 1);
    for (let column = first; column <= last; column += 1) {
        if (terrainSolid(terrain, column, row)) return row * terrain.width + column;
    }
    throw new Error('V10 opening has no authoritative support cell.');
}

function surfaceY(terrain: PackedTerrain, worldX: number): number {
    const column = clamp(Math.floor(worldX / terrain.cellSize), 0, terrain.width - 1);
    for (let row = 0; row < terrain.height; row += 1) {
        if (terrainSolid(terrain, column, row)) return row * terrain.cellSize;
    }
    return terrain.height * terrain.cellSize;
}

function compareOpenings(first: V10OpeningPair, second: V10OpeningPair): number {
    return second.score.profileFit - first.score.profileFit ||
        second.score.combinedLocalMobility - first.score.combinedLocalMobility ||
        first.score.centerBias - second.score.centerBias ||
        first.score.tieBreak - second.score.tieBreak ||
        first.leftX - second.leftX;
}

function pairTieBreak(seed: number, leftX: number, rightX: number): number {
    let mixed = seed ^ Math.imul(leftX, 0x27D4EB2D) ^ Math.imul(rightX, 0x165667B1);
    mixed = Math.imul(mixed ^ (mixed >>> 15), 0x85EBCA6B);
    mixed = Math.imul(mixed ^ (mixed >>> 13), 0xC2B2AE35);
    return (mixed ^ (mixed >>> 16)) >>> 0;
}

function normalizeSeed(seed: number): number {
    if (!Number.isFinite(seed)) throw new Error('V10 seed must be finite.');
    const normalized = Math.trunc(seed) >>> 0;
    return normalized === 0 ? 0x6D2B79F5 : normalized;
}

function alignUp(value: number, step: number): number {
    return Math.ceil(value / step) * step;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
}

function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value !== null && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

/** Browser-compatible synchronous SHA-256, kept byte-identical to V9. */
function sha256(bytes: Uint8Array): string {
    const words: number[] = []; const bitLength = bytes.length * 8;
    for (let index = 0; index < bytes.length; index += 1) words[index >> 2] = (words[index >> 2] ?? 0) | (bytes[index] << (24 - (index % 4) * 8));
    words[bitLength >> 5] = (words[bitLength >> 5] ?? 0) | (0x80 << (24 - (bitLength % 32)));
    const lengthIndex = (((bitLength + 64) >> 9) << 4) + 15;
    words[lengthIndex] = bitLength;
    let [a0, b0, c0, d0, e0, f0, g0, h0] = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const constants = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    for (let offset = 0; offset < words.length; offset += 16) {
        const w = Array<number>(64).fill(0); for (let index = 0; index < 16; index += 1) w[index] = words[offset + index] ?? 0;
        for (let index = 16; index < 64; index += 1) { const x = w[index - 15], y = w[index - 2]; const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3); const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10); w[index] = (w[index - 16] + s0 + w[index - 7] + s1) | 0; }
        let [a,b,c,d,e,f,g,h] = [a0,b0,c0,d0,e0,f0,g0,h0];
        for (let index = 0; index < 64; index += 1) { const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7)); const choose = (e & f) ^ (~e & g); const temp1 = (h + s1 + choose + constants[index] + w[index]) | 0; const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10)); const majority = (a & b) ^ (a & c) ^ (b & c); h=g; g=f; f=e; e=(d + temp1)|0; d=c; c=b; b=a; a=(temp1+s0+majority)|0; }
        a0=(a0+a)|0; b0=(b0+b)|0; c0=(c0+c)|0; d0=(d0+d)|0; e0=(e0+e)|0; f0=(f0+f)|0; g0=(g0+g)|0; h0=(h0+h)|0;
    }
    return [a0,b0,c0,d0,e0,f0,g0,h0].map(word => (word >>> 0).toString(16).padStart(8, '0')).join('');
}
