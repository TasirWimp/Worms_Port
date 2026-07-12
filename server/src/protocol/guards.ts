import type { IncomingMessage } from 'http';

export const MAX_TRANSPORT_BYTES = 16 * 1024;
export const MAX_EVENT_BYTES = 8 * 1024;

export class TokenBucket {
    private available: number;
    private updatedAt: number;

    public constructor(
        private readonly capacity: number,
        private readonly refillPerMillisecond: number,
        now = Date.now()
    ) {
        this.available = capacity;
        this.updatedAt = now;
    }

    public take(now = Date.now(), amount = 1): boolean {
        const elapsed = Math.max(0, now - this.updatedAt);
        this.available = Math.min(
            this.capacity,
            this.available + elapsed * this.refillPerMillisecond
        );
        this.updatedAt = now;
        if (this.available < amount) {
            return false;
        }
        this.available -= amount;
        return true;
    }
}

export function eventFits(payload: unknown): boolean {
    try {
        return Buffer.byteLength(JSON.stringify(payload), 'utf8') <= MAX_EVENT_BYTES;
    } catch {
        return false;
    }
}

export function configuredOrigins(value = process.env.ALLOWED_ORIGINS): Set<string> {
    return new Set(
        (value || '')
            .split(',')
            .map((origin) => origin.trim())
            .filter(Boolean)
            .map(normalizeOrigin)
    );
}

export function originAllowed(
    request: IncomingMessage,
    configured: Set<string>,
    allowMissingOrigin = false
): boolean {
    const origin = request.headers.origin;
    if (!origin) {
        return allowMissingOrigin;
    }

    let normalized: string;
    try {
        normalized = normalizeOrigin(origin);
    } catch {
        return false;
    }
    if (configured.has(normalized)) {
        return true;
    }

    return normalized === requestOrigin(request);
}

function requestOrigin(request: IncomingMessage): string | undefined {
    const host = request.headers.host;
    if (!host) return undefined;
    const forwarded = request.headers['x-forwarded-proto'];
    const protocol = typeof forwarded === 'string'
        ? forwarded.split(',')[0].trim()
        : (request.socket as typeof request.socket & { encrypted?: boolean }).encrypted
            ? 'https'
            : 'http';
    return `${protocol}://${host}`;
}

function normalizeOrigin(origin: string): string {
    const url = new URL(origin);
    return url.origin;
}
