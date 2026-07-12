import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export function issueToken(): string {
    return randomBytes(32).toString('base64url');
}

export function tokenDigest(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('base64url');
}

export function equalDigest(left: string, right: string): boolean {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
}

export function opaqueId(): string {
    return randomBytes(18).toString('base64url');
}
