import { createHmac, timingSafeEqual } from 'crypto';

import type { PeiVerifierConfigV0 } from './verifier';

/** Configuration shared by the game coordinator and the standalone PEI helper. */
export type PeiRuntimeConfigV0 = PeiVerifierConfigV0 & {
    proxyOrigin: string;
    returnUri: string;
    requestAuthSecret: string;
    requestTtlSeconds: number;
};

export function authenticateRequest(requestCarrier: string, secret: string): string {
    return createHmac('sha256', Buffer.from(secret, 'base64url'))
        .update(requestCarrier, 'utf8')
        .digest('base64url');
}

export function requestAuthenticationMatches(
    requestCarrier: string,
    presented: string,
    secret: string
): boolean {
    if (!/^[A-Za-z0-9_-]{43}$/.test(presented)) return false;
    const expected = Buffer.from(authenticateRequest(requestCarrier, secret), 'base64url');
    const actual = Buffer.from(presented, 'base64url');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}
