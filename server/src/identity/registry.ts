import { createHash, randomBytes, timingSafeEqual } from 'crypto';

import type {
    IdentityBeginData,
    ProtocolError,
    WalletIdentity
} from '../../../shared/protocol';
import {
    normalizeNimiqAddress,
    verifyNimiqSignedMessage
} from './crypto';

const DEFAULT_AUTHORIZATION_TTL_MS = 3 * 60_000;
const DEFAULT_MAX_PENDING = 1_000;
const DEFAULT_SWEEP_INTERVAL_MS = 15_000;
const RATE_WINDOW_MS = 60_000;
const MAX_RATE_KEYS = 10_000;

type PendingAuthorization = {
    id: string;
    sessionId: string;
    socketId: string;
    ipKey: string;
    address: string;
    addressKey: string;
    message: string;
    expiresAt: number;
};

type RateEntry = {
    count: number;
    resetAt: number;
};

export type IdentityAuthorizationOptions = {
    publicOrigin: string;
    network: string;
    now?: () => number;
    authorizationTtlMs?: number;
    maxPending?: number;
    sweepIntervalMs?: number | false;
    authorizationIdSource?: () => string;
    nonceSource?: () => string;
};

export type IdentityCompletion = WalletIdentity & {
    publicKeyHex: string;
};

export class IdentityAuthorizationRegistry {
    public readonly publicOrigin: string;
    public readonly network: string;
    private readonly pending = new Map<string, PendingAuthorization>();
    private readonly rates = new Map<string, RateEntry>();
    private readonly now: () => number;
    private readonly authorizationTtlMs: number;
    private readonly maxPending: number;
    private readonly authorizationIdSource: () => string;
    private readonly nonceSource: () => string;
    private readonly sweepTimer?: NodeJS.Timeout;

    public constructor(options: IdentityAuthorizationOptions) {
        this.publicOrigin = normalizePublicOrigin(options.publicOrigin);
        this.network = normalizeNetwork(options.network);
        this.now = options.now || Date.now;
        this.authorizationTtlMs = options.authorizationTtlMs ??
            DEFAULT_AUTHORIZATION_TTL_MS;
        this.maxPending = options.maxPending ?? DEFAULT_MAX_PENDING;
        this.authorizationIdSource = options.authorizationIdSource ||
            (() => randomBytes(24).toString('base64url'));
        this.nonceSource = options.nonceSource ||
            (() => randomBytes(32).toString('base64url'));
        if (this.authorizationTtlMs < 30_000 || this.authorizationTtlMs > 5 * 60_000) {
            throw new RangeError('Identity authorization TTL must be between 30 seconds and 5 minutes.');
        }
        if (this.maxPending < 1 || this.maxPending > 10_000) {
            throw new RangeError('Identity pending authorization limit is invalid.');
        }
        if (options.sweepIntervalMs !== false) {
            this.sweepTimer = setInterval(
                () => this.sweep(),
                options.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS
            );
            this.sweepTimer.unref();
        }
    }

    public begin(
        sessionId: string,
        socketId: string,
        remoteAddress: string,
        requestedAddress: string
    ): IdentityBeginData | ProtocolError {
        this.sweep();
        const ipKey = digestKey(remoteAddress || 'unknown');
        if (!this.takeRate(`begin:session:${sessionId}`, 6) ||
            !this.takeRate(`begin:ip:${ipKey}`, 20)) {
            return rateLimited();
        }
        let address: string;
        try {
            address = normalizeNimiqAddress(requestedAddress);
        } catch {
            return badRequest();
        }
        const addressKey = digestKey(address);
        if (!this.takeRate(`begin:address:${addressKey}`, 6)) {
            return rateLimited();
        }
        if (this.pending.size >= this.maxPending ||
            this.count((entry) => entry.sessionId === sessionId) >= 2 ||
            this.count((entry) => entry.addressKey === addressKey) >= 3 ||
            this.count((entry) => entry.ipKey === ipKey) >= 12) {
            return rateLimited();
        }

        const id = this.uniqueAuthorizationId();
        const now = this.now();
        const expiresAt = now + this.authorizationTtlMs;
        const message = buildCanonicalIdentityMessage({
            publicOrigin: this.publicOrigin,
            network: this.network,
            address,
            authorizationId: id,
            nonce: this.nonceSource(),
            issuedAt: new Date(now).toISOString(),
            expiresAt: new Date(expiresAt).toISOString(),
            sessionBinding: digestKey(sessionId),
            connectionBinding: digestKey(socketId)
        });
        this.pending.set(id, {
            id,
            sessionId,
            socketId,
            ipKey,
            address,
            addressKey,
            message,
            expiresAt
        });
        return {
            authorizationId: id,
            address,
            message,
            expiresAt: new Date(expiresAt).toISOString()
        };
    }

    public complete(
        sessionId: string,
        socketId: string,
        remoteAddress: string,
        authorizationId: string,
        address: string,
        publicKeyHex: string,
        signatureHex: string
    ): IdentityCompletion | ProtocolError {
        this.sweep();
        const pending = this.pending.get(authorizationId);
        if (!pending || pending.sessionId !== sessionId || pending.socketId !== socketId) {
            return unauthorized();
        }

        // Burn the owning attempt before rate checks, parsing, or cryptographic work.
        this.pending.delete(authorizationId);
        const ipKey = digestKey(remoteAddress || 'unknown');
        if (!this.takeRate(`complete:session:${sessionId}`, 10) ||
            !this.takeRate(`complete:ip:${ipKey}`, 30) ||
            !this.takeRate(`complete:address:${pending.addressKey}`, 10)) {
            return unauthorized();
        }
        if (pending.expiresAt <= this.now() || pending.ipKey !== ipKey ||
            !safeTextEqual(address, pending.address)) {
            return unauthorized();
        }

        const proof = verifyNimiqSignedMessage(
            pending.message,
            publicKeyHex,
            signatureHex
        );
        if (!proof || !safeTextEqual(proof.address, pending.address)) {
            return unauthorized();
        }
        return {
            address: proof.address,
            authorizedAt: new Date(this.now()).toISOString(),
            publicKeyHex: proof.publicKeyHex
        };
    }

    public cancelSocket(socketId: string): void {
        this.removeWhere((entry) => entry.socketId === socketId);
    }

    public consumeMalformedAttempt(
        sessionId: string,
        socketId: string,
        authorizationId: string
    ): void {
        const pending = this.pending.get(authorizationId);
        if (pending?.sessionId === sessionId && pending.socketId === socketId) {
            this.pending.delete(authorizationId);
        }
    }

    public cancelSession(sessionId: string): void {
        this.removeWhere((entry) => entry.sessionId === sessionId);
    }

    public sweep(): void {
        const now = this.now();
        this.removeWhere((entry) => entry.expiresAt <= now);
        for (const [key, entry] of this.rates) {
            if (entry.resetAt <= now) this.rates.delete(key);
        }
    }

    public dispose(): void {
        if (this.sweepTimer) clearInterval(this.sweepTimer);
        this.pending.clear();
        this.rates.clear();
    }

    public get size(): number {
        return this.pending.size;
    }

    private uniqueAuthorizationId(): string {
        for (let attempt = 0; attempt < 8; attempt += 1) {
            const id = this.authorizationIdSource();
            if (/^[A-Za-z0-9_-]{32}$/.test(id) && !this.pending.has(id)) return id;
        }
        throw new Error('Unable to create a unique identity authorization ID.');
    }

    private takeRate(key: string, limit: number): boolean {
        const now = this.now();
        let entry = this.rates.get(key);
        if (!entry || entry.resetAt <= now) {
            if (!entry && this.rates.size >= MAX_RATE_KEYS) return false;
            entry = { count: 0, resetAt: now + RATE_WINDOW_MS };
            this.rates.set(key, entry);
        }
        if (entry.count >= limit) return false;
        entry.count += 1;
        return true;
    }

    private count(predicate: (entry: PendingAuthorization) => boolean): number {
        let count = 0;
        for (const entry of this.pending.values()) {
            if (predicate(entry)) count += 1;
        }
        return count;
    }

    private removeWhere(predicate: (entry: PendingAuthorization) => boolean): void {
        for (const [id, entry] of this.pending) {
            if (predicate(entry)) this.pending.delete(id);
        }
    }
}

export type CanonicalIdentityMessageFields = {
    publicOrigin: string;
    network: string;
    address: string;
    authorizationId: string;
    nonce: string;
    issuedAt: string;
    expiresAt: string;
    sessionBinding: string;
    connectionBinding: string;
};

export function buildCanonicalIdentityMessage(fields: CanonicalIdentityMessageFields): string {
    const values = Object.values(fields);
    if (values.some((value) => !/^[\x20-\x7E]+$/.test(value)) ||
        !/^https?:\/\//.test(fields.publicOrigin) ||
        !/^[a-z0-9][a-z0-9_-]{1,31}$/.test(fields.network) ||
        !/^NQ[0-9]{2}(?: [0-9A-HJ-NP-VXY]{4}){8}$/.test(fields.address) ||
        !/^[A-Za-z0-9_-]{32}$/.test(fields.authorizationId) ||
        !/^[A-Za-z0-9_-]{43}$/.test(fields.nonce) ||
        !/^[A-Za-z0-9_-]{43}$/.test(fields.sessionBinding) ||
        !/^[A-Za-z0-9_-]{43}$/.test(fields.connectionBinding) ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(fields.issuedAt) ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(fields.expiresAt)) {
        throw new Error('Canonical identity message fields are invalid.');
    }
    const message = [
        'NIMble Knots Identity Authorization',
        'Version: 1',
        'Action: Sign in to NIMble Knots',
        `Origin: ${fields.publicOrigin}`,
        `Network: ${fields.network}`,
        `Address: ${fields.address}`,
        `Authorization: ${fields.authorizationId}`,
        `Nonce: ${fields.nonce}`,
        `Issued At: ${fields.issuedAt}`,
        `Expires At: ${fields.expiresAt}`,
        `Session: ${fields.sessionBinding}`,
        `Connection: ${fields.connectionBinding}`
    ].join('\n');
    if (message.length > 1024 || !/^[\x20-\x7E\n]+$/.test(message)) {
        throw new Error('Canonical identity message must be printable ASCII with LF endings.');
    }
    return message;
}

function normalizePublicOrigin(value: string): string {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) ||
        (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
        throw new Error('Identity public origin must use HTTPS outside local development.');
    }
    if (url.origin !== value.replace(/\/$/, '')) {
        throw new Error('Identity public origin must not contain a path, query, or credentials.');
    }
    return url.origin;
}

function normalizeNetwork(value: string): string {
    const network = value.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{1,31}$/.test(network)) {
        throw new Error('Nimiq network authorization domain is invalid.');
    }
    return network;
}

function digestKey(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('base64url');
}

function safeTextEqual(left: string, right: string): boolean {
    const a = Buffer.from(left, 'utf8');
    const b = Buffer.from(right, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
}

function badRequest(): ProtocolError {
    return {
        code: 'BAD_REQUEST',
        message: 'The identity authorization request is invalid.',
        retryable: false
    };
}

function rateLimited(): ProtocolError {
    return {
        code: 'RATE_LIMITED',
        message: 'Identity authorization is temporarily unavailable.',
        retryable: true
    };
}

function unauthorized(): ProtocolError {
    return {
        code: 'UNAUTHORIZED',
        message: 'Identity authorization failed. Start a new authorization attempt.',
        retryable: false
    };
}
