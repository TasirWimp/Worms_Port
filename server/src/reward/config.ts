import { NormalizedNimiqAddressSchema } from '../../../shared/protocol';
import type { RewardConfig, RewardMode } from './types';

const MAINNET_ACKNOWLEDGEMENT = 'I_UNDERSTAND_MAINNET_PAYOUTS';
const REPEAT_MAINNET_ACKNOWLEDGEMENT = 'I_UNDERSTAND_REPEAT_MAINNET_REWARDS';

export function assertRewardQualityTestEnvironment(
    environment: NodeJS.ProcessEnv = process.env
): void {
    if (environment.WP014_QUALITY_TEST !== 'true') return;
    const mode = (environment.REWARD_MODE ?? 'disabled').trim();
    if (mode === 'testnet' || mode === 'mainnet') {
        throw new Error('WP-014 quality tests refuse chain reward modes.');
    }
    const blocked = [
        'REWARD_PRIVATE_KEY_FILE',
        'REWARD_RPC_URL',
        'NIMIQ_RECOVERY_WORDS',
        'REWARD_MAINNET_ACKNOWLEDGEMENT',
        'REWARD_TEST_WALLET_ADDRESS',
        'REWARD_TEST_DAILY_ATTEMPT_LIMIT',
        'REWARD_TEST_REPEAT_ACKNOWLEDGEMENT'
    ].filter((name) => optionalTrimmed(environment[name]));
    if (blocked.length > 0) {
        throw new Error(
            `WP-014 quality tests refuse payout authority: ${blocked.join(', ')}.`
        );
    }
    const databaseUrl = optionalTrimmed(environment.DATABASE_URL);
    const memoryStore = environment.REWARD_TEST_MEMORY_STORE === 'true';
    if (databaseUrl && memoryStore) {
        throw new Error('WP-014 quality tests cannot combine PostgreSQL and the memory store.');
    }
    if (databaseUrl) {
        if (mode !== 'record-only') {
            throw new Error('WP-014 PostgreSQL quality tests require record-only rewards.');
        }
        const url = new URL(databaseUrl);
        const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' ||
            url.hostname === '::1';
        const databaseName = decodeURIComponent(url.pathname.slice(1));
        if (!['postgres:', 'postgresql:'].includes(url.protocol) || !loopback ||
            !/^nimble_knots_wp014_[a-z0-9_]+$/.test(databaseName)) {
            throw new Error(
                'WP-014 quality tests require a loopback PostgreSQL URL with a ' +
                'nimble_knots_wp014_* disposable database.'
            );
        }
    } else if (mode === 'record-only' && !memoryStore) {
        throw new Error(
            'WP-014 record-only quality tests require an explicit memory or disposable PostgreSQL store.'
        );
    }
}

export function rewardConfigFromEnvironment(
    environment: NodeJS.ProcessEnv = process.env
): RewardConfig {
    const mode = rewardMode(environment.REWARD_MODE);
    const rewardLuna = positiveBigInt(environment.REWARD_LUNA ?? '100000', 'REWARD_LUNA');
    const dailyBudgetLuna = positiveBigInt(
        environment.REWARD_DAILY_BUDGET_LUNA ?? '1000000',
        'REWARD_DAILY_BUDGET_LUNA'
    );
    if (dailyBudgetLuna < rewardLuna) {
        throw new Error('REWARD_DAILY_BUDGET_LUNA must cover at least one fixed reward.');
    }
    const feeLuna = nonnegativeBigInt(
        environment.REWARD_FEE_LUNA ?? '0',
        'REWARD_FEE_LUNA'
    );
    const reservationSeconds = boundedInteger(
        environment.REWARD_RESERVATION_SECONDS ?? '180',
        'REWARD_RESERVATION_SECONDS',
        30,
        3600
    );
    const claimSeconds = boundedInteger(
        environment.REWARD_CLAIM_SECONDS ?? '600',
        'REWARD_CLAIM_SECONDS',
        60,
        3600
    );
    const turnLimit = boundedInteger(
        environment.REWARD_TURN_LIMIT ?? '16',
        'REWARD_TURN_LIMIT',
        1,
        64
    );
    if (turnLimit !== 16) {
        throw new Error(
            'REWARD_TURN_LIMIT must be 16 for the pinned artillery ruleset.'
        );
    }
    const network = environment.REWARD_NETWORK === 'test-albatross'
        ? 'test-albatross'
        : environment.REWARD_NETWORK === 'main-albatross'
            ? 'main-albatross'
            : mode === 'mainnet'
                ? 'main-albatross'
                : 'test-albatross';
    const expectedSignerAddress = optionalAddress(
        environment.REWARD_EXPECTED_SIGNER_ADDRESS,
        'REWARD_EXPECTED_SIGNER_ADDRESS'
    );
    const privateKeyFile = optionalTrimmed(environment.REWARD_PRIVATE_KEY_FILE);
    const rpcUrl = optionalRpcUrl(environment.REWARD_RPC_URL);
    const operatorAcknowledgement = optionalTrimmed(
        environment.REWARD_MAINNET_ACKNOWLEDGEMENT
    );
    const testWalletAddress = optionalAddress(
        environment.REWARD_TEST_WALLET_ADDRESS,
        'REWARD_TEST_WALLET_ADDRESS'
    );
    const rawTestDailyAttemptLimit = optionalTrimmed(
        environment.REWARD_TEST_DAILY_ATTEMPT_LIMIT
    );
    const testDailyAttemptLimit = rawTestDailyAttemptLimit
        ? boundedInteger(
            rawTestDailyAttemptLimit,
            'REWARD_TEST_DAILY_ATTEMPT_LIMIT',
            2,
            5
        )
        : 1;
    if ((testWalletAddress && !rawTestDailyAttemptLimit) ||
        (!testWalletAddress && rawTestDailyAttemptLimit)) {
        throw new Error(
            'REWARD_TEST_WALLET_ADDRESS and REWARD_TEST_DAILY_ATTEMPT_LIMIT must be set together.'
        );
    }
    const peiRequired = strictBoolean(environment.PEI_ENABLED, 'PEI_ENABLED');

    if (mode === 'testnet' || mode === 'mainnet') {
        if (!expectedSignerAddress || !privateKeyFile || !rpcUrl) {
            throw new Error(
                'Enabled chain payouts require REWARD_EXPECTED_SIGNER_ADDRESS, ' +
                'REWARD_PRIVATE_KEY_FILE, and REWARD_RPC_URL.'
            );
        }
    }
    if (mode === 'testnet' && network !== 'test-albatross') {
        throw new Error('Testnet reward mode requires REWARD_NETWORK=test-albatross.');
    }
    if (mode === 'mainnet') {
        if (network !== 'main-albatross') {
            throw new Error('Mainnet reward mode requires REWARD_NETWORK=main-albatross.');
        }
        if (operatorAcknowledgement !== MAINNET_ACKNOWLEDGEMENT) {
            throw new Error(
                `Mainnet rewards require REWARD_MAINNET_ACKNOWLEDGEMENT=${MAINNET_ACKNOWLEDGEMENT}.`
            );
        }
        if (testWalletAddress && optionalTrimmed(
            environment.REWARD_TEST_REPEAT_ACKNOWLEDGEMENT
        ) !== REPEAT_MAINNET_ACKNOWLEDGEMENT) {
            throw new Error(
                'Mainnet repeat-attempt testing requires ' +
                `REWARD_TEST_REPEAT_ACKNOWLEDGEMENT=${REPEAT_MAINNET_ACKNOWLEDGEMENT}.`
            );
        }
    }

    return {
        mode,
        rewardLuna,
        feeLuna,
        dailyBudgetLuna,
        reservationTtlMs: reservationSeconds * 1000,
        claimTtlMs: claimSeconds * 1000,
        turnLimit,
        paused: environment.REWARD_PAUSED === 'true',
        network,
        testDailyAttemptLimit,
        peiRequired,
        ...(expectedSignerAddress ? { expectedSignerAddress } : {}),
        ...(privateKeyFile ? { privateKeyFile } : {}),
        ...(rpcUrl ? { rpcUrl } : {}),
        ...(operatorAcknowledgement ? { operatorAcknowledgement } : {}),
        ...(testWalletAddress ? { testWalletAddress } : {})
    };
}

function strictBoolean(value: string | undefined, name: string): boolean {
    const normalized = (value ?? 'false').trim();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    throw new Error(`${name} must be true or false.`);
}

function rewardMode(value: string | undefined): RewardMode {
    const normalized = (value ?? 'disabled').trim();
    if (normalized === 'disabled' || normalized === 'record-only' ||
        normalized === 'testnet' || normalized === 'mainnet') {
        return normalized;
    }
    throw new Error(
        'REWARD_MODE must be disabled, record-only, testnet, or mainnet.'
    );
}

function positiveBigInt(value: string, name: string): bigint {
    if (!/^[1-9][0-9]{0,19}$/.test(value)) {
        throw new Error(`${name} must be a positive integer Luna string.`);
    }
    const parsed = BigInt(value);
    if (parsed > 0xFFFF_FFFF_FFFF_FFFFn) {
        throw new Error(`${name} exceeds the Nimiq u64 range.`);
    }
    return parsed;
}

function nonnegativeBigInt(value: string, name: string): bigint {
    if (!/^(0|[1-9][0-9]{0,19})$/.test(value)) {
        throw new Error(`${name} must be a nonnegative integer Luna string.`);
    }
    const parsed = BigInt(value);
    if (parsed > 0xFFFF_FFFF_FFFF_FFFFn) {
        throw new Error(`${name} exceeds the Nimiq u64 range.`);
    }
    return parsed;
}

function boundedInteger(value: string, name: string, minimum: number, maximum: number): number {
    if (!/^[0-9]+$/.test(value)) {
        throw new Error(`${name} must be an integer.`);
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
    }
    return parsed;
}

function optionalAddress(value: string | undefined, name: string): string | undefined {
    const trimmed = optionalTrimmed(value);
    if (!trimmed) return undefined;
    const compact = trimmed.replace(/\s/g, '').toUpperCase();
    const normalized = compact.length === 36
        ? [compact.slice(0, 4), ...(compact.slice(4).match(/.{4}/g) ?? [])].join(' ')
        : trimmed;
    const parsed = NormalizedNimiqAddressSchema.safeParse(normalized);
    if (!parsed.success) {
        throw new Error(`${name} must be a valid compact or spaced Nimiq address.`);
    }
    return parsed.data;
}

function optionalRpcUrl(value: string | undefined): string | undefined {
    const normalized = optionalTrimmed(value);
    if (!normalized) return undefined;
    const url = new URL(normalized);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' ||
        url.hostname === '::1';
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
        throw new Error('REWARD_RPC_URL must use HTTPS outside local development.');
    }
    if (url.username || url.password || url.hash) {
        throw new Error('REWARD_RPC_URL must not contain credentials or a fragment.');
    }
    return url.toString();
}

function optionalTrimmed(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed || undefined;
}
