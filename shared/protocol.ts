import { z } from 'zod';

export const PROTOCOL_VERSION = 1 as const;
export const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const RequestIdSchema = z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/);
const SequenceSchema = z.number().int().nonnegative().max(0xFFFFFFFF);
const ChallengeIdSchema = z.string().min(16).max(64).regex(/^[A-Za-z0-9_-]+$/);
const Uint32Schema = z.number().int().nonnegative().max(0xFFFFFFFF);
const StateHashSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const SignedSessionProofSchema = z.object({
    address: z.string().min(1).max(128).regex(/^[A-Za-z0-9 ]+$/),
    challenge: z.string().min(16).max(512),
    signature: z.string().min(32).max(512).regex(/^[A-Za-z0-9_-]+$/)
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
    }).strict(),
    z.object({
        requestId: RequestIdSchema,
        action: z.literal('authorize'),
        proof: SignedSessionProofSchema
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
        token: z.string().min(16).max(512).regex(/^[A-Za-z0-9._~-]+$/)
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

export const SessionOpenDataSchema = z.object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    serverTimeMs: z.number().int().nonnegative(),
    sessionId: z.string().min(16).max(64),
    token: z.string().regex(SESSION_TOKEN_PATTERN),
    resumed: z.boolean(),
    expiresAt: z.string().datetime()
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
    units: z.tuple([SimulationUnitSchema, SimulationUnitSchema]),
    terrain: z.object({
        width: z.literal(128),
        height: z.literal(72),
        cellSize: z.literal(8),
        words: z.array(Uint32Schema).length(288)
    }).strict()
};

const LegacySimulationSnapshotSchema = z.object({
    formatVersion: z.literal(1),
    rulesetId: z.literal('nimble-knots-artillery-v1'),
    rulesetVersion: z.literal(1),
    ...SimulationSnapshotFields,
    selectedRelic: z.literal('threadball'),
    lastProjectile: LegacyProjectileSummarySchema.nullable()
}).strict();

const CurrentSimulationSnapshotSchema = z.object({
    formatVersion: z.literal(2),
    rulesetId: z.literal('nimble-knots-artillery-v2'),
    rulesetVersion: z.literal(2),
    ...SimulationSnapshotFields,
    selectedRelic: z.enum(['threadball', 'needlepoint', 'spoolburst']),
    lastProjectile: CurrentProjectileSummarySchema.nullable()
}).strict();

export const SimulationSnapshotSchema = z.discriminatedUnion('formatVersion', [
    LegacySimulationSnapshotSchema,
    CurrentSimulationSnapshotSchema
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
        simulation: CurrentSimulationSnapshotSchema
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
    challengeCreate: 'v1:challenge.create',
    commandSubmit: 'v1:command.submit',
    challengePause: 'v1:challenge.pause',
    challengeLeave: 'v1:challenge.leave',
    snapshot: 'v1:challenge.snapshot',
    result: 'v1:challenge.result',
    error: 'v1:protocol.error'
} as const;
