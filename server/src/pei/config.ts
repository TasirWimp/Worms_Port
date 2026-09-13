import { normalizeNimiqAddress } from '../identity/crypto';
import type { PeiRuntimeConfigV0 } from './runtime-contract';

export function peiConfigFromEnvironment(
    environment: NodeJS.ProcessEnv = process.env,
    expectedNetwork?: string
): PeiRuntimeConfigV0 | undefined {
    if ((environment.PEI_ENABLED ?? 'false').trim() !== 'true') return undefined;
    const network = required(environment.PEI_NETWORK, 'PEI_NETWORK');
    if (!['main-albatross', 'test-albatross'].includes(network)) {
        throw new Error('PEI_NETWORK must be main-albatross or test-albatross.');
    }
    if (expectedNetwork && network !== expectedNetwork) {
        throw new Error('PEI_NETWORK must match the reward network.');
    }
    const requesterOrigin = exactOrigin(
        required(environment.PEI_RETURN_ORIGIN, 'PEI_RETURN_ORIGIN'),
        'PEI_RETURN_ORIGIN'
    );
    const proxyOrigin = exactOrigin(
        required(environment.PEI_PROXY_ORIGIN, 'PEI_PROXY_ORIGIN'),
        'PEI_PROXY_ORIGIN'
    );
    if (proxyOrigin === requesterOrigin) {
        throw new Error('PEI_PROXY_ORIGIN must identify a separate Mini App origin.');
    }
    const proxyAddress = normalizeNimiqAddress(required(
        environment.PEI_PROXY_ADDRESS,
        'PEI_PROXY_ADDRESS'
    ));
    const requestTtlSeconds = integer(
        required(environment.PEI_REQUEST_TTL_SECONDS, 'PEI_REQUEST_TTL_SECONDS'),
        'PEI_REQUEST_TTL_SECONDS',
        300,
        1_800
    );
    const earnAmountLuna = luna(required(environment.PEI_EARN_MIN_LUNA, 'PEI_EARN_MIN_LUNA'), 'PEI_EARN_MIN_LUNA');
    const spendAmountLuna = luna(required(environment.PEI_SPEND_MIN_LUNA, 'PEI_SPEND_MIN_LUNA'), 'PEI_SPEND_MIN_LUNA');
    const requestAuthSecret = required(environment.PEI_REQUEST_AUTH_SECRET, 'PEI_REQUEST_AUTH_SECRET');
    const secretBytes = /^[A-Za-z0-9_-]{43}$/.test(requestAuthSecret)
        ? Buffer.from(requestAuthSecret, 'base64url')
        : undefined;
    if (!secretBytes || secretBytes.length !== 32 ||
        secretBytes.toString('base64url') !== requestAuthSecret) {
        throw new Error('PEI_REQUEST_AUTH_SECRET must be 32 random Base64URL bytes.');
    }
    return {
        network,
        requesterOrigin,
        proxyOrigin,
        proxyAddress,
        returnUri: `${requesterOrigin}/#pei-return`,
        allowedReturnUris: [`${requesterOrigin}/#pei-return`],
        earnAmountLuna,
        spendAmountLuna,
        requestTtlSeconds,
        requestAuthSecret,
        maximumRequestTtlSeconds: requestTtlSeconds,
        clockSkewSeconds: 30,
        requireFinality: true
    };
}

function required(value: string | undefined, name: string): string {
    const normalized = value?.trim();
    if (!normalized) throw new Error(`${name} is required when PEI is enabled.`);
    return normalized;
}

function exactOrigin(value: string, name: string): string {
    const url = new URL(value);
    const loopback = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if ((!loopback && url.protocol !== 'https:') ||
        (loopback && !['http:', 'https:'].includes(url.protocol)) ||
        url.username || url.password || url.origin !== value || url.pathname !== '/' ||
        url.search || url.hash) {
        throw new Error(`${name} must be an exact HTTPS origin (HTTP is allowed only on loopback).`);
    }
    return url.origin;
}

function integer(value: string, name: string, minimum: number, maximum: number): number {
    if (!/^[0-9]+$/.test(value)) throw new Error(`${name} must be an integer.`);
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
    }
    return parsed;
}

function luna(value: string, name: string): string {
    if (!/^[1-9][0-9]{0,15}$/.test(value) || BigInt(value) > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error(`${name} must be a positive JavaScript-safe Luna integer string.`);
    }
    return value;
}
