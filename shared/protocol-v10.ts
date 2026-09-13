import { VOLCANIC_RUIN_RECIPE_REVISION } from './terrain-volcanic-ruin';
import { V10G_RECIPE_REVISION, V10G_FAMILY_RECIPE_REVISION, v10gFamilyForSeed } from './terrain-generation-v10g';
import { z } from 'zod';
import {
    SimulationBarrierV10Schema, SimulationIntentV10Schema, SimulationStateV10Schema,
    V10_ALL_TERRAIN_PROFILE_IDS, V10_R1_RULESET_ID, V10_R1_TERRAIN_PROFILE_IDS,
    V10_R2_RULESET_ID, V10_R3_RULESET_ID, V10_R4_RULESET_ID, V10_R5_RULESET_ID, V10_R6_RULESET_ID, V10_RULESET_IDS
} from './simulation-v10';
import {
    V10_PROCEDURAL_CANDIDATE_COUNT, V10_PROCEDURAL_RECIPE_REVISION,
    V10_PROCEDURAL_TERRAIN_PROFILE_IDS
} from './terrain-generation-v10';

/** V10 keeps V9's byte/record budget while R6 widens the bounded tick ceiling. */
export const V10_REPLAY_LIMITS = Object.freeze({
    records: 32_768,
    bytes: 16 * 1024 * 1024,
    operationBytes: 512,
    ticks: 38_400,
    terminalBytes: 512
});

const integer = (minimum: number, maximum: number) => z.number().int().min(minimum).max(maximum);
const id = z.string().min(16).max(64).regex(/^[A-Za-z0-9_-]+$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const actor = z.enum(['player', 'loomkeeper']);
const calling = z.enum(['wizard', 'thief', 'warrior']);
const phase = z.enum(['action', 'projectile', 'settling', 'retreat', 'finished']);

export const ReplayOperationV10Schema = z.union([
    z.object({
        kind: z.literal('intent'), actor, intent: SimulationIntentV10Schema,
        expectedTurn: integer(0, 16), expectedPhase: phase, expectedEpoch: integer(0, 65535)
    }).strict(),
    z.object({ kind: z.literal('barrier'), barrier: SimulationBarrierV10Schema }).strict(),
    z.object({ kind: z.literal('ticks'), count: integer(1, V10_REPLAY_LIMITS.ticks) }).strict(),
    z.discriminatedUnion('reason', [
        z.object({
            kind: z.literal('automatic'), reason: z.literal('lease_expired'),
            tick: integer(0, V10_REPLAY_LIMITS.ticks), inputEpoch: integer(0, 65535)
        }).strict(),
        z.object({
            kind: z.literal('automatic'), reason: z.literal('phase'),
            tick: integer(0, V10_REPLAY_LIMITS.ticks), inputEpoch: integer(0, 65535), phase
        }).strict()
    ]),
    z.object({
        kind: z.literal('safety'),
        reason: z.enum(['replay_limit', 'lifecycle_limit', 'sequence_limit', 'expiry', 'left'])
    }).strict()
]);
export type ReplayOperationV10 = z.infer<typeof ReplayOperationV10Schema>;

export const ReplayRecordV10Schema = z.object({
    index: integer(0, V10_REPLAY_LIMITS.records - 1),
    operation: ReplayOperationV10Schema,
    stateHash: hash
}).strict();
export type ReplayRecordV10 = z.infer<typeof ReplayRecordV10Schema>;

/** Internal candidate replay only. V10C owns any query-gated transport envelope. */
export const CoordinatorReplayV10Schema = z.object({
    formatVersion: z.literal(10),
    challengeId: id,
    sessionId: id,
    seed: integer(1, 0xffffffff),
    calling,
    rulesetId: z.enum(V10_RULESET_IDS),
    terrainProfileId: z.enum(V10_ALL_TERRAIN_PROFILE_IDS),
    recipeRevision: z.enum([V10_PROCEDURAL_RECIPE_REVISION, V10G_RECIPE_REVISION, V10G_FAMILY_RECIPE_REVISION, VOLCANIC_RUIN_RECIPE_REVISION]).optional(),
    candidateIndex: integer(0, V10_PROCEDURAL_CANDIDATE_COUNT - 1).optional(),
    initialStateHash: hash,
    records: z.array(ReplayRecordV10Schema).max(V10_REPLAY_LIMITS.records)
}).strict().superRefine((replay, context) => {
    const revised = replay.rulesetId === V10_R1_RULESET_ID;
    const r3 = replay.rulesetId === V10_R3_RULESET_ID;
    const r4 = replay.rulesetId === V10_R4_RULESET_ID;
    const r5 = replay.rulesetId === V10_R5_RULESET_ID;
    const r6 = replay.rulesetId === V10_R6_RULESET_ID;
    const volcanic = r5 || r6;
    const procedural = replay.rulesetId === V10_R2_RULESET_ID || r3 || r4 || volcanic;
    const profileIsRevised = (V10_R1_TERRAIN_PROFILE_IDS as readonly string[]).includes(replay.terrainProfileId);
    const profileIsProcedural = (volcanic && replay.terrainProfileId === 'volcanic-ruin') || (V10_PROCEDURAL_TERRAIN_PROFILE_IDS as readonly string[]).includes(replay.terrainProfileId);
    if ((volcanic && replay.terrainProfileId !== 'volcanic-ruin') || (!volcanic && replay.terrainProfileId === 'volcanic-ruin') || revised !== profileIsRevised || procedural !== profileIsProcedural || (r4 && replay.terrainProfileId !== v10gFamilyForSeed(replay.seed).profileId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['terrainProfileId'],
            message: 'Terrain profile does not belong to the recorded V10 ruleset.' });
    }
    if (procedural && (replay.recipeRevision !== (volcanic ? VOLCANIC_RUIN_RECIPE_REVISION : r4 ? V10G_FAMILY_RECIPE_REVISION : r3 ? V10G_RECIPE_REVISION : V10_PROCEDURAL_RECIPE_REVISION) || ((r4 || volcanic) && replay.candidateIndex !== 0) || (r3 && (replay.candidateIndex !== 0 || replay.terrainProfileId !== 'twin-crests')))) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['recipeRevision'], message: 'Recipe/candidate does not belong to ruleset.' });
    }
    const hasRecipeRevision = Object.prototype.hasOwnProperty.call(replay, 'recipeRevision');
    const hasCandidateIndex = Object.prototype.hasOwnProperty.call(replay, 'candidateIndex');
    if (procedural !== hasRecipeRevision || (hasRecipeRevision && replay.recipeRevision === undefined)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['recipeRevision'],
            message: 'Procedural replay recipe revision must match the R2/R3/R4 ruleset.' });
    }
    if (procedural !== hasCandidateIndex || (hasCandidateIndex && replay.candidateIndex === undefined)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['candidateIndex'],
            message: 'Procedural replay candidate index must match the R2/R3/R4 ruleset.' });
    }
    if (!r6 && replay.records.reduce((ticks, record) => ticks +
        (record.operation.kind === 'ticks' ? record.operation.count : 0), 0) > 16_800) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['records'],
            message: 'Pre-R6 replay exceeds its frozen tick bound.' });
    }
});
export type CoordinatorReplayV10 = z.infer<typeof CoordinatorReplayV10Schema>;

export const SimulationSnapshotV10Schema = SimulationStateV10Schema;
export { SimulationStateV10Schema, SimulationIntentV10Schema, SimulationBarrierV10Schema };

export function jsonBytesV10(value: unknown): number {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
