import { z } from 'zod';

export const PROTOCOL_VERSION = 1 as const;
export const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const RequestIdSchema = z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/);
const SequenceSchema = z.number().int().nonnegative().max(0xFFFFFFFF);
const ChallengeIdSchema = z.string().min(16).max(64).regex(/^[A-Za-z0-9_-]+$/);

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
    command: ProtocolCommandSchema
}).strict();

export const ChallengeLeaveRequestSchema = z.object({
    requestId: RequestIdSchema,
    sequence: SequenceSchema,
    challengeId: ChallengeIdSchema
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

export const ChallengeSnapshotSchema = z.object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    serverTimeMs: z.number().int().nonnegative(),
    sessionId: z.string().min(16).max(64),
    challengeId: ChallengeIdSchema,
    mode: z.enum(['practice', 'reward']),
    calling: z.enum(['wizard', 'thief', 'warrior']),
    status: z.enum(['active', 'left', 'expired']),
    revision: z.number().int().nonnegative(),
    nextSequence: SequenceSchema,
    expiresAt: z.string().datetime()
}).strict();

export const ChallengeResultSchema = z.object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    serverTimeMs: z.number().int().nonnegative(),
    sessionId: z.string().min(16).max(64),
    challengeId: ChallengeIdSchema,
    outcome: z.enum(['left', 'expired']),
    revision: z.number().int().nonnegative(),
    nextSequence: SequenceSchema
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
export const ChallengeLeaveAckSchema = z.union([
    ProtocolSuccessAckSchema(ChallengeResultSchema),
    ProtocolFailureAckSchema
]);

export type SessionOpenRequest = z.infer<typeof SessionOpenRequestSchema>;
export type ChallengeCreateRequest = z.infer<typeof ChallengeCreateRequestSchema>;
export type CommandSubmitRequest = z.infer<typeof CommandSubmitRequestSchema>;
export type ChallengeLeaveRequest = z.infer<typeof ChallengeLeaveRequestSchema>;
export type ProtocolError = z.infer<typeof ProtocolErrorSchema>;
export type SessionOpenData = z.infer<typeof SessionOpenDataSchema>;
export type ChallengeSnapshot = z.infer<typeof ChallengeSnapshotSchema>;
export type ChallengeResult = z.infer<typeof ChallengeResultSchema>;

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
    challengeLeave: 'v1:challenge.leave',
    snapshot: 'v1:challenge.snapshot',
    result: 'v1:challenge.result',
    error: 'v1:protocol.error'
} as const;
