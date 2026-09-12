import { z } from 'zod';

export const PEI_PROTOCOL = 'pei' as const;
export const PEI_VERSION = 0 as const;
export const PEI_REQUESTER = 'nimble-knots' as const;
export const PEI_PROXY = 'pei-proxy' as const;
export const PEI_DIGEST_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const PEI_TX_HASH_PATTERN = /^[a-f0-9]{64}$/;
export const PEI_MAX_REQUEST_CARRIER_BYTES = 4_096;
export const PEI_MAX_PROOF_CARRIER_BYTES = 8_192;
export const PEI_MAX_JOURNEY_CARRIER_BYTES = 16_384;

const NormalizedAddressSchema = z.string().regex(
    /^NQ[0-9]{2}(?: [0-9A-HJ-NP-VXY]{4}){8}$/
);
const OriginSchema = z.string().max(256).url();
const ReturnUriSchema = z.string().max(512).url();
const DigestSchema = z.string().regex(PEI_DIGEST_PATTERN);
const PositiveLunaSchema = z.string().regex(/^[1-9][0-9]{0,19}$/);

export const PeiRequestV0Schema = z.object({
    protocol: z.literal(PEI_PROTOCOL),
    version: z.literal(PEI_VERSION),
    requester: z.literal(PEI_REQUESTER),
    requesterOrigin: OriginSchema,
    proxy: z.literal(PEI_PROXY),
    network: z.string().min(1).max(32).regex(/^[a-z0-9-]+$/),
    subject: NormalizedAddressSchema,
    action: z.enum(['earn', 'spend']),
    nonce: DigestSchema,
    issuedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    expiresAt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    parentProofHash: DigestSchema.nullable(),
    returnUri: ReturnUriSchema,
    minAmountLuna: PositiveLunaSchema
}).strict().superRefine((request, context) => {
    if (request.expiresAt <= request.issuedAt) {
        context.addIssue({ code: 'custom', path: ['expiresAt'], message: 'expiresAt must follow issuedAt' });
    }
    if (/^A{43}$/.test(request.nonce)) {
        context.addIssue({ code: 'custom', path: ['nonce'], message: 'nonce must not encode zero bytes' });
    }
    if (request.action === 'earn' && request.parentProofHash !== null) {
        context.addIssue({ code: 'custom', path: ['parentProofHash'], message: 'earn must not have a parent' });
    }
    if (request.action === 'spend' && request.parentProofHash === null) {
        context.addIssue({ code: 'custom', path: ['parentProofHash'], message: 'spend requires a parent' });
    }
});

export const PeiProofV0Schema = z.object({
    protocol: z.literal(PEI_PROTOCOL),
    version: z.literal(PEI_VERSION),
    request: PeiRequestV0Schema,
    txHash: z.string().regex(PEI_TX_HASH_PATTERN)
}).strict();

export const PeiJourneyV0Schema = z.object({
    protocol: z.literal(PEI_PROTOCOL),
    version: z.literal(PEI_VERSION),
    proofs: z.tuple([PeiProofV0Schema, PeiProofV0Schema])
}).strict();

export type PeiRequestV0 = z.infer<typeof PeiRequestV0Schema>;
export type PeiProofV0 = z.infer<typeof PeiProofV0Schema>;
export type PeiJourneyV0 = z.infer<typeof PeiJourneyV0Schema>;
export type PeiActionV0 = PeiRequestV0['action'];

export class PeiCodecError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'PeiCodecError';
    }
}

export function canonicalPeiRequestV0(value: PeiRequestV0): string {
    const request = parse(PeiRequestV0Schema, value, 'PEI request');
    return JSON.stringify({
        protocol: request.protocol,
        version: request.version,
        requester: request.requester,
        requesterOrigin: request.requesterOrigin,
        proxy: request.proxy,
        network: request.network,
        subject: request.subject,
        action: request.action,
        nonce: request.nonce,
        issuedAt: request.issuedAt,
        expiresAt: request.expiresAt,
        parentProofHash: request.parentProofHash,
        returnUri: request.returnUri,
        minAmountLuna: request.minAmountLuna
    });
}

export function canonicalPeiProofV0(value: PeiProofV0): string {
    const proof = parse(PeiProofV0Schema, value, 'PEI proof');
    return `{"protocol":"pei","version":0,"request":${canonicalPeiRequestV0(proof.request)},"txHash":${JSON.stringify(proof.txHash)}}`;
}

export function canonicalPeiJourneyV0(value: PeiJourneyV0): string {
    const journey = parse(PeiJourneyV0Schema, value, 'PEI journey');
    return `{"protocol":"pei","version":0,"proofs":[${canonicalPeiProofV0(journey.proofs[0])},${canonicalPeiProofV0(journey.proofs[1])}]}`;
}

export function encodePeiRequestV0(value: PeiRequestV0): string {
    return encodeCarrier(canonicalPeiRequestV0(value));
}

export function encodePeiProofV0(value: PeiProofV0): string {
    return encodeCarrier(canonicalPeiProofV0(value));
}

export function encodePeiJourneyV0(value: PeiJourneyV0): string {
    return encodeCarrier(canonicalPeiJourneyV0(value));
}

export function decodePeiRequestV0(carrier: string): PeiRequestV0 {
    return decodeCarrier(carrier, PEI_MAX_REQUEST_CARRIER_BYTES, PeiRequestV0Schema, 'PEI request');
}

export function decodePeiProofV0(carrier: string): PeiProofV0 {
    return decodeCarrier(carrier, PEI_MAX_PROOF_CARRIER_BYTES, PeiProofV0Schema, 'PEI proof');
}

export function decodePeiJourneyV0(carrier: string): PeiJourneyV0 {
    return decodeCarrier(carrier, PEI_MAX_JOURNEY_CARRIER_BYTES, PeiJourneyV0Schema, 'PEI journey');
}

export async function peiRequestCommitmentV0(request: PeiRequestV0): Promise<string> {
    return sha256Base64Url(canonicalPeiRequestV0(request));
}

export async function peiProofHashV0(proof: PeiProofV0): Promise<string> {
    return sha256Base64Url(canonicalPeiProofV0(proof));
}

export async function peiJourneyHashV0(journey: PeiJourneyV0): Promise<string> {
    return sha256Base64Url(canonicalPeiJourneyV0(journey));
}

export async function sha256Base64Url(value: string | Uint8Array): Promise<string> {
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
    const digestInput = new Uint8Array(bytes.byteLength);
    digestInput.set(bytes);
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', digestInput));
    return base64UrlEncode(digest);
}

export function newPeiNonceV0(): string {
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    return base64UrlEncode(bytes);
}

export function base64UrlEncode(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

export function base64UrlDecode(value: string, maximumBytes: number): Uint8Array {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0 ||
        !/^[A-Za-z0-9_-]+$/.test(value) || value.length > Math.ceil(maximumBytes * 4 / 3)) {
        throw new PeiCodecError('Malformed or oversized Base64URL carrier.');
    }
    const padding = (4 - value.length % 4) % 4;
    let binary: string;
    try {
        binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padding));
    } catch {
        throw new PeiCodecError('Malformed Base64URL carrier.');
    }
    if (binary.length > maximumBytes) throw new PeiCodecError('PEI carrier is too large.');
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (base64UrlEncode(bytes) !== value) throw new PeiCodecError('PEI carrier is not canonical Base64URL.');
    return bytes;
}

function encodeCarrier(canonicalJson: string): string {
    return base64UrlEncode(new TextEncoder().encode(canonicalJson));
}

function decodeCarrier<T>(
    carrier: string,
    maximumBytes: number,
    schema: z.ZodType<T>,
    label: string
): T {
    const bytes = base64UrlDecode(carrier, maximumBytes);
    let text: string;
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        throw new PeiCodecError(`${label} is not valid UTF-8.`);
    }
    let value: unknown;
    try {
        value = JSON.parse(text);
    } catch {
        throw new PeiCodecError(`${label} is not valid JSON.`);
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new PeiCodecError(`${label} does not match PEI v0.`);
    return parsed.data;
}

function parse<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new PeiCodecError(`${label} does not match PEI v0.`);
    return parsed.data;
}
