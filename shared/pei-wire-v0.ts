import { z } from 'zod';

import {
    PEI_MAX_JOURNEY_CARRIER_BYTES,
    PEI_MAX_PROOF_CARRIER_BYTES
} from './pei-v0';

const RequestIdSchema = z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/);
const SequenceSchema = z.number().int().nonnegative().max(0xFFFFFFFF);
const CarrierSchema = (maximumBytes: number) => z.string().min(1)
    .max(Math.ceil(maximumBytes * 4 / 3))
    .regex(/^[A-Za-z0-9_-]+$/);
export const PeiBeginRequestSchema = z.object({
    requestId: RequestIdSchema,
    sequence: SequenceSchema
}).strict();

export const PeiReturnRequestSchema = z.discriminatedUnion('kind', [
    z.object({
        requestId: RequestIdSchema,
        sequence: SequenceSchema,
        kind: z.literal('earn'),
        carrier: CarrierSchema(PEI_MAX_PROOF_CARRIER_BYTES)
    }).strict(),
    z.object({
        requestId: RequestIdSchema,
        sequence: SequenceSchema,
        kind: z.literal('journey'),
        carrier: CarrierSchema(PEI_MAX_JOURNEY_CARRIER_BYTES)
    }).strict()
]);

export const PeiLaunchDataSchema = z.object({
    step: z.enum(['earn', 'spend']),
    launchUrl: z.string().url().max(12_000),
    expiresAt: z.string().datetime()
}).strict();

export const PeiQualifiedDataSchema = z.object({
    step: z.literal('qualified'),
    receipt: z.object({
        id: z.string().min(16).max(64).regex(/^[A-Za-z0-9_-]+$/),
        issuedAt: z.string().datetime()
    }).strict(),
    edges: z.tuple([z.literal('earned'), z.literal('spent')]),
    transactionHashes: z.tuple([
        z.string().regex(/^[a-f0-9]{64}$/),
        z.string().regex(/^[a-f0-9]{64}$/)
    ])
}).strict();

const FailureSchema = z.object({
    protocolVersion: z.literal(1),
    serverTimeMs: z.number().int().nonnegative(),
    requestId: RequestIdSchema,
    ok: z.literal(false),
    error: z.object({
        code: z.string().min(1).max(64),
        message: z.string().min(1).max(200),
        retryable: z.boolean()
    }).strict()
}).strict();

const success = <T extends z.ZodType>(data: T) => z.object({
    protocolVersion: z.literal(1),
    serverTimeMs: z.number().int().nonnegative(),
    requestId: RequestIdSchema,
    ok: z.literal(true),
    data
}).strict();

export const PeiBeginAckSchema = z.union([success(PeiLaunchDataSchema), FailureSchema]);
export const PeiReturnAckSchema = z.union([
    success(z.union([PeiLaunchDataSchema, PeiQualifiedDataSchema])),
    FailureSchema
]);

export type PeiLaunchData = z.infer<typeof PeiLaunchDataSchema>;
export type PeiQualifiedData = z.infer<typeof PeiQualifiedDataSchema>;
export type PeiReturnKind = z.infer<typeof PeiReturnRequestSchema>['kind'];

export const peiProtocolEventsV0 = {
    begin: 'v1:pei.begin',
    returned: 'v1:pei.return'
} as const;
