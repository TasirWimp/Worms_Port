import { z } from 'zod';

export const PROTOCOL_VERSION = 1 as const;
export const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const RequestIdSchema = z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/);
const SequenceSchema = z.number().int().nonnegative().max(0xFFFFFFFF);
const ChallengeIdSchema = z.string().min(16).max(64).regex(/^[A-Za-z0-9_-]+$/);
const Uint32Schema = z.number().int().nonnegative().max(0xFFFFFFFF);
const StateHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const NimiqAddressInputSchema = z.string().min(36).max(64).regex(/^[A-Za-z0-9 ]+$/);
export const NormalizedNimiqAddressSchema = z.string().regex(
    /^NQ[0-9]{2}(?: [0-9A-HJ-NP-VXY]{4}){8}$/
);
const AuthorizationIdSchema = z.string().length(32).regex(/^[A-Za-z0-9_-]+$/);
const RewardRecordIdSchema = z.string().min(16).max(64).regex(/^[A-Za-z0-9_-]+$/);
const RewardTokenSchema = z.string().length(43).regex(/^[A-Za-z0-9_-]+$/);
const LunaStringSchema = z.string().regex(/^(0|[1-9][0-9]{0,19})$/);

export const IdentityBeginRequestSchema = z.object({
    requestId: RequestIdSchema,
    address: NimiqAddressInputSchema
}).strict();

export const IdentityCompleteRequestSchema = z.object({
    requestId: RequestIdSchema,
    authorizationId: AuthorizationIdSchema,
    address: NormalizedNimiqAddressSchema,
    publicKey: z.string().length(64).regex(/^[0-9a-fA-F]+$/),
    signature: z.string().length(128).regex(/^[0-9a-fA-F]+$/)
}).strict();

export const IdentityCancelRequestSchema = z.object({
    requestId: RequestIdSchema,
    authorizationId: AuthorizationIdSchema
}).strict();

export const RewardInfoRequestSchema = z.object({
    requestId: RequestIdSchema
}).strict();

export const RewardReserveRequestSchema = z.object({
    requestId: RequestIdSchema,
    sequence: SequenceSchema,
    calling: z.enum(['wizard', 'thief', 'warrior'])
}).strict();

export const RewardClaimRequestSchema = z.object({
    requestId: RequestIdSchema,
    entitlementId: RewardRecordIdSchema,
    claimNonce: RewardTokenSchema,
    idempotencyKey: z.string().min(16).max(64).regex(/^[A-Za-z0-9_-]+$/)
}).strict();

export const RewardStatusRequestSchema = z.object({
    requestId: RequestIdSchema,
    entitlementId: RewardRecordIdSchema.optional()
}).strict();

export const SessionOpenRequestSchema = z.discriminatedUnion('action', [
    z.object({
        requestId: RequestIdSchema,
        action: z.literal('create')
    }).strict(),
    z.object({
        requestId: RequestIdSchema,
        action: z.literal('resume'),
        token: z.string().regex(SESSION_TOKEN_PATTERN)
    }).strict()
]);

export const ChallengeCreateRequestSchema = z.object({
    requestId: RequestIdSchema,
    sequence: SequenceSchema,
    mode: z.literal('practice'),
    calling: z.enum(['wizard', 'thief', 'warrior'])
}).strict().or(z.object({
    requestId: RequestIdSchema,
    sequence: SequenceSchema,
    mode: z.literal('reward'),
    calling: z.enum(['wizard', 'thief', 'warrior']),
    eligibility: z.object({
        challengeId: ChallengeIdSchema,
        token: RewardTokenSchema
    }).strict()
}).strict());

export const ProtocolCommandSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('move'),
        direction: z.union([z.literal(-1), z.literal(0), z.literal(1)])
    }).strict(),
    z.object({
        type: z.literal('select_relic'),
        relicId: z.string().min(1).max(32).regex(/^[a-z][a-z0-9_-]*$/)
    }).strict(),
    z.object({
        type: z.literal('aim'),
        angleMilliDegrees: z.number().int().min(-90_000).max(90_000),
        powerPermille: z.number().int().min(0).max(1_000)
    }).strict(),
    z.object({ type: z.literal('fire') }).strict()
]);

export const CommandSubmitRequestSchema = z.object({
    requestId: RequestIdSchema,
    sequence: SequenceSchema,
    challengeId: ChallengeIdSchema,
    expectedTurn: z.number().int().nonnegative().max(0xFFFF),
    command: ProtocolCommandSchema
}).strict();

export const ChallengeLeaveRequestSchema = z.object({
    requestId: RequestIdSchema,
    sequence: SequenceSchema,
    challengeId: ChallengeIdSchema
}).strict();

export const ChallengePauseRequestSchema = z.object({
    requestId: RequestIdSchema,
    sequence: SequenceSchema,
    challengeId: ChallengeIdSchema,
    paused: z.boolean()
}).strict();

export const ProtocolErrorSchema = z.object({
    code: z.enum([
        'BAD_REQUEST',
        'UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FEATURE_UNAVAILABLE',
        'CHALLENGE_NOT_FOUND',
        'CHALLENGE_CLOSED',
        'REPLAY_CONFLICT',
        'STALE_SEQUENCE',
        'SEQUENCE_GAP',
        'RATE_LIMITED',
        'PAYLOAD_TOO_LARGE',
        'COMMAND_REJECTED',
        'NOT_YOUR_TURN',
        'LATE_TURN',
        'REWARD_UNAVAILABLE',
        'REWARD_INELIGIBLE',
        'REWARD_CONFLICT',
        'REWARD_PAUSED',
        'INTERNAL_ERROR'
    ]),
    message: z.string().min(1).max(160),
    retryable: z.boolean()
}).strict();

const AckMetadataShape = {
    protocolVersion: z.literal(PROTOCOL_VERSION),
    serverTimeMs: z.number().int().nonnegative(),
    requestId: RequestIdSchema
};

export function ProtocolSuccessAckSchema<T extends z.ZodType>(data: T) {
    return z.object({
        ...AckMetadataShape,
        ok: z.literal(true),
        data
    }).strict();
}

export const ProtocolFailureAckSchema = z.object({
    ...AckMetadataShape,
    ok: z.literal(false),
    error: ProtocolErrorSchema
}).strict();

export const WalletIdentitySchema = z.object({
    address: NormalizedNimiqAddressSchema,
    authorizedAt: z.string().datetime()
}).strict();

export const SessionOpenDataSchema = z.object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    serverTimeMs: z.number().int().nonnegative(),
    sessionId: z.string().min(16).max(64),
    token: z.string().regex(SESSION_TOKEN_PATTERN),
    resumed: z.boolean(),
    expiresAt: z.string().datetime(),
    identity: WalletIdentitySchema.optional()
}).strict();

export const IdentityBeginDataSchema = z.object({
    authorizationId: AuthorizationIdSchema,
    address: NormalizedNimiqAddressSchema,
    message: z.string().min(64).max(1024).regex(/^[\x20-\x7E\n]+$/),
    expiresAt: z.string().datetime()
}).strict();

export const IdentityCompleteDataSchema = SessionOpenDataSchema.extend({
    identity: WalletIdentitySchema
});

export const IdentityCancelDataSchema = z.object({
    cancelled: z.literal(true)
}).strict();

export const RewardPublicStateSchema = z.enum([
    'disabled',
    'available',
    'paused',
    'exhausted',
    'temporarily_unavailable'
]);

export const RewardPayoutStateSchema = z.enum([
    'reserved',
    'in_progress',
    'lost',
    'forfeited',
    'expired',
    'cancelled',
    'claimable',
    'queued',
    'signed',
    'broadcast_unknown',
    'included',
    'finalized',
    'manual_review'
]);

export const RewardInfoDataSchema = z.object({
    status: RewardPublicStateSchema,
    challengeDay: z.string().date(),
    rewardLuna: LunaStringSchema,
    reservationSeconds: z.number().int().positive().max(3600),
    turnLimit: z.number().int().positive().max(64)
}).strict();

export const RewardReservationDataSchema = z.object({
    reservationId: RewardRecordIdSchema,
    challengeId: ChallengeIdSchema,
    eligibilityToken: RewardTokenSchema,
    challengeDay: z.string().date(),
    rewardLuna: LunaStringSchema,
    recipient: NormalizedNimiqAddressSchema,
    calling: z.enum(['wizard', 'thief', 'warrior']),
    expiresAt: z.string().datetime()
}).strict();

export const RewardUpdateDataSchema = z.object({
    entitlementId: RewardRecordIdSchema,
    challengeId: ChallengeIdSchema,
    challengeDay: z.string().date(),
    rewardLuna: LunaStringSchema,
    recipient: NormalizedNimiqAddressSchema,
    state: RewardPayoutStateSchema,
    claimNonce: RewardTokenSchema.optional(),
    transactionHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    finalizedAt: z.string().datetime().optional(),
    message: z.string().min(1).max(200)
}).strict();

const SimulationUnitSchema = z.object({
    id: z.enum(['player', 'loomkeeper']),
    calling: z.enum(['wizard', 'thief', 'warrior', 'loomkeeper']),
    x: z.number().int().min(-4096).max(4096),
    y: z.number().int().min(-4096).max(4096),
    facing: z.union([z.literal(-1), z.literal(1)]),
    stitching: z.number().int().min(0).max(100),
    alive: z.boolean()
}).strict();

const ProjectileSummaryFields = {
    startX: z.number().int().min(-4096).max(4096),
    startY: z.number().int().min(-4096).max(4096),
    endX: z.number().int().min(-4096).max(4096),
    endY: z.number().int().min(-4096).max(4096),
    flightTicks: z.number().int().nonnegative().max(300),
    impact: z.enum(['terrain', 'player', 'loomkeeper', 'world_exit', 'lifetime']),
    trace: z.array(z.object({
        x: z.number().int().min(-4096).max(4096),
        y: z.number().int().min(-4096).max(4096)
    }).strict()).min(2).max(41)
};

const LegacyProjectileSummarySchema = z.object(ProjectileSummaryFields).strict();
const CurrentProjectileSummarySchema = z.object({
    relicId: z.enum(['threadball', 'needlepoint', 'spoolburst']),
    ...ProjectileSummaryFields
}).strict();

const HistoricalTerrainSchema = z.object({
    width: z.literal(128),
    height: z.literal(72),
    cellSize: z.literal(8),
    words: z.array(Uint32Schema).length(288)
}).strict();

const V4TerrainSchema = z.object({
    width: z.literal(256),
    height: z.literal(72),
    cellSize: z.literal(8),
    words: z.array(Uint32Schema).length(576)
}).strict();

const SimulationSnapshotFields = {
    seed: Uint32Schema,
    rngState: Uint32Schema,
    tick: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    turn: z.number().int().nonnegative().max(16),
    activeActor: z.enum(['player', 'loomkeeper']),
    turnDeadlineTick: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    phase: z.enum(['awaiting_command', 'finished']),
    winner: z.enum(['player', 'loomkeeper', 'draw']).nullable(),
    finishReason: z.enum(['unravelled', 'turn_limit']).nullable(),
    movementRemaining: z.number().int().min(0).max(64),
    aim: z.object({
        angleMilliDegrees: z.number().int().min(-90_000).max(90_000),
        powerPermille: z.number().int().min(0).max(1_000)
    }).strict().nullable(),
    units: z.tuple([SimulationUnitSchema, SimulationUnitSchema])
};

const LegacySimulationSnapshotSchema = z.object({
    formatVersion: z.literal(1),
    rulesetId: z.literal('nimble-knots-artillery-v1'),
    rulesetVersion: z.literal(1),
    ...SimulationSnapshotFields,
    terrain: HistoricalTerrainSchema,
    selectedRelic: z.literal('threadball'),
    lastProjectile: LegacyProjectileSummarySchema.nullable()
}).strict();

const V2SimulationSnapshotSchema = z.object({
    formatVersion: z.literal(2),
    rulesetId: z.literal('nimble-knots-artillery-v2'),
    rulesetVersion: z.literal(2),
    ...SimulationSnapshotFields,
    terrain: HistoricalTerrainSchema,
    selectedRelic: z.enum(['threadball', 'needlepoint', 'spoolburst']),
    lastProjectile: CurrentProjectileSummarySchema.nullable()
}).strict();

const V3SimulationSnapshotSchema = z.object({
    formatVersion: z.literal(3),
    rulesetId: z.literal('nimble-knots-artillery-v3'),
    rulesetVersion: z.literal(3),
    ...SimulationSnapshotFields,
    terrain: HistoricalTerrainSchema,
    selectedRelic: z.enum(['threadball', 'needlepoint', 'spoolburst']),
    lastProjectile: CurrentProjectileSummarySchema.nullable()
}).strict();

const V4SimulationSnapshotSchema = z.object({
    formatVersion: z.literal(4),
    rulesetId: z.literal('nimble-knots-artillery-v4'),
    rulesetVersion: z.literal(4),
    ...SimulationSnapshotFields,
    terrain: V4TerrainSchema,
    selectedRelic: z.enum(['threadball', 'needlepoint', 'spoolburst']),
    lastProjectile: CurrentProjectileSummarySchema.nullable()
}).strict();

const V5SimulationSnapshotSchema = z.object({
    formatVersion: z.literal(5),
    rulesetId: z.literal('nimble-knots-artillery-v5'),
    rulesetVersion: z.literal(5),
    ...SimulationSnapshotFields,
    terrain: V4TerrainSchema,
    selectedRelic: z.enum(['threadball', 'needlepoint', 'spoolburst']),
    lastProjectile: CurrentProjectileSummarySchema.nullable()
}).strict();

const V6SimulationSnapshotSchema = z.object({
    formatVersion: z.literal(6),
    rulesetId: z.literal('nimble-knots-artillery-v6'),
    rulesetVersion: z.literal(6),
    ...SimulationSnapshotFields,
    terrain: V4TerrainSchema,
    selectedRelic: z.enum(['threadball', 'needlepoint', 'spoolburst']),
    lastProjectile: CurrentProjectileSummarySchema.nullable()
}).strict();

const V7SimulationSnapshotSchema = z.object({
    formatVersion: z.literal(7),
    rulesetId: z.literal('nimble-knots-artillery-v7'),
    rulesetVersion: z.literal(7),
    ...SimulationSnapshotFields,
    terrain: V4TerrainSchema,
    selectedRelic: z.enum(['threadball', 'needlepoint', 'spoolburst']),
    lastProjectile: CurrentProjectileSummarySchema.nullable()
}).strict();

export const SimulationSnapshotSchema = z.discriminatedUnion('formatVersion', [
    LegacySimulationSnapshotSchema,
    V2SimulationSnapshotSchema,
    V3SimulationSnapshotSchema,
    V4SimulationSnapshotSchema,
    V5SimulationSnapshotSchema,
    V6SimulationSnapshotSchema,
    V7SimulationSnapshotSchema
]);

const ChallengeSnapshotFields = {
    protocolVersion: z.literal(PROTOCOL_VERSION),
    serverTimeMs: z.number().int().nonnegative(),
    sessionId: z.string().min(16).max(64),
    challengeId: ChallengeIdSchema,
    mode: z.enum(['practice', 'reward']),
    calling: z.enum(['wizard', 'thief', 'warrior']),
    loomkeeperDifficulty: z.enum(['gentle', 'standard', 'sharp']),
    status: z.enum(['active', 'left', 'expired', 'completed']),
    paused: z.boolean(),
    revision: z.number().int().nonnegative(),
    nextSequence: SequenceSchema,
    expiresAt: z.string().datetime(),
    stateHash: StateHashSchema
};

export const ChallengeSnapshotSchema = z.union([
    z.object({
        ...ChallengeSnapshotFields,
        loomkeeperPolicyId: z.literal('nimble-knots-loomkeeper-v1'),
        simulation: LegacySimulationSnapshotSchema
    }).strict(),
    z.object({
        ...ChallengeSnapshotFields,
        loomkeeperPolicyId: z.literal('nimble-knots-loomkeeper-v2'),
        simulation: z.union([
            V2SimulationSnapshotSchema,
            V3SimulationSnapshotSchema,
            V4SimulationSnapshotSchema,
            V5SimulationSnapshotSchema,
            V6SimulationSnapshotSchema,
            V7SimulationSnapshotSchema
        ])
    }).strict()
]);

export const ChallengeResultSchema = z.object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    serverTimeMs: z.number().int().nonnegative(),
    sessionId: z.string().min(16).max(64),
    challengeId: ChallengeIdSchema,
    outcome: z.enum(['left', 'expired', 'player_win', 'loomkeeper_win', 'draw']),
    revision: z.number().int().nonnegative(),
    nextSequence: SequenceSchema,
    finalTick: z.number().int().nonnegative().nullable(),
    finalStateHash: StateHashSchema.nullable()
}).strict();

export const ProtocolErrorEventSchema = z.object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    serverTimeMs: z.number().int().nonnegative(),
    error: ProtocolErrorSchema
}).strict();

export const SessionOpenAckSchema = z.union([
    ProtocolSuccessAckSchema(SessionOpenDataSchema),
    ProtocolFailureAckSchema
]);
export const IdentityBeginAckSchema = z.union([
    ProtocolSuccessAckSchema(IdentityBeginDataSchema),
    ProtocolFailureAckSchema
]);
export const IdentityCompleteAckSchema = z.union([
    ProtocolSuccessAckSchema(IdentityCompleteDataSchema),
    ProtocolFailureAckSchema
]);
export const IdentityCancelAckSchema = z.union([
    ProtocolSuccessAckSchema(IdentityCancelDataSchema),
    ProtocolFailureAckSchema
]);
export const RewardInfoAckSchema = z.union([
    ProtocolSuccessAckSchema(RewardInfoDataSchema),
    ProtocolFailureAckSchema
]);
export const RewardReserveAckSchema = z.union([
    ProtocolSuccessAckSchema(RewardReservationDataSchema),
    ProtocolFailureAckSchema
]);
export const RewardClaimAckSchema = z.union([
    ProtocolSuccessAckSchema(RewardUpdateDataSchema),
    ProtocolFailureAckSchema
]);
export const RewardStatusAckSchema = RewardClaimAckSchema;
export const ChallengeCreateAckSchema = z.union([
    ProtocolSuccessAckSchema(ChallengeSnapshotSchema),
    ProtocolFailureAckSchema
]);
export const CommandSubmitAckSchema = ChallengeCreateAckSchema;
export const ChallengePauseAckSchema = ChallengeCreateAckSchema;
export const ChallengeLeaveAckSchema = z.union([
    ProtocolSuccessAckSchema(ChallengeResultSchema),
    ProtocolFailureAckSchema
]);

export type SessionOpenRequest = z.infer<typeof SessionOpenRequestSchema>;
export type IdentityBeginRequest = z.infer<typeof IdentityBeginRequestSchema>;
export type IdentityCompleteRequest = z.infer<typeof IdentityCompleteRequestSchema>;
export type IdentityCancelRequest = z.infer<typeof IdentityCancelRequestSchema>;
export type IdentityBeginData = z.infer<typeof IdentityBeginDataSchema>;
export type IdentityCompleteData = z.infer<typeof IdentityCompleteDataSchema>;
export type WalletIdentity = z.infer<typeof WalletIdentitySchema>;
export type RewardInfoData = z.infer<typeof RewardInfoDataSchema>;
export type RewardReservationData = z.infer<typeof RewardReservationDataSchema>;
export type RewardUpdateData = z.infer<typeof RewardUpdateDataSchema>;
export type RewardPayoutState = z.infer<typeof RewardPayoutStateSchema>;
export type ChallengeCreateRequest = z.infer<typeof ChallengeCreateRequestSchema>;
export type CommandSubmitRequest = z.infer<typeof CommandSubmitRequestSchema>;
export type ChallengeLeaveRequest = z.infer<typeof ChallengeLeaveRequestSchema>;
export type ChallengePauseRequest = z.infer<typeof ChallengePauseRequestSchema>;
export type ProtocolError = z.infer<typeof ProtocolErrorSchema>;
export type SessionOpenData = z.infer<typeof SessionOpenDataSchema>;
export type ChallengeSnapshot = z.infer<typeof ChallengeSnapshotSchema>;
export type ChallengeResult = z.infer<typeof ChallengeResultSchema>;
export type SimulationSnapshot = z.infer<typeof SimulationSnapshotSchema>;

export type ProtocolAck<T> =
    | {
        protocolVersion: typeof PROTOCOL_VERSION;
        serverTimeMs: number;
        ok: true;
        requestId: string;
        data: T;
    }
    | {
        protocolVersion: typeof PROTOCOL_VERSION;
        serverTimeMs: number;
        ok: false;
        requestId: string;
        error: ProtocolError;
    };

export const protocolEvents = {
    sessionOpen: 'v1:session.open',
    identityBegin: 'v1:identity.begin',
    identityComplete: 'v1:identity.complete',
    identityCancel: 'v1:identity.cancel',
    rewardInfo: 'v1:reward.info',
    rewardReserve: 'v1:reward.reserve',
    rewardClaim: 'v1:reward.claim',
    rewardStatus: 'v1:reward.status',
    rewardUpdate: 'v1:reward.update',
    challengeCreate: 'v1:challenge.create',
    commandSubmit: 'v1:command.submit',
    challengePause: 'v1:challenge.pause',
    challengeLeave: 'v1:challenge.leave',
    snapshot: 'v1:challenge.snapshot',
    result: 'v1:challenge.result',
    error: 'v1:protocol.error'
} as const;
