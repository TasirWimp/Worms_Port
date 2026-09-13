import { normalizeNimiqAddress } from '../identity/crypto';
import type { PeiRuntimeConfigV0 } from './coordinator';

const MAINNET_ACKNOWLEDGEMENT = 'I_UNDERSTAND_MAINNET_PEI_TRANSFERS';

export type PeiProxyTransferConfigV0 = {
    network: 'test-albatross' | 'main-albatross';
    proxyAddress: string;
    feeLuna: bigint;
    dailyBudgetLuna: bigint;
    privateKeyFile: string;
    rpcUrl: string;
    paused: boolean;
};

export function peiProxyTransferConfigFromEnvironment(
    pei: PeiRuntimeConfigV0,
    environment: NodeJS.ProcessEnv = process.env
): PeiProxyTransferConfigV0 {
    if (pei.network !== 'test-albatross' && pei.network !== 'main-albatross') {
        throw new Error('The PEI proxy requires a supported Nimiq network.');
    }
    const privateKeyFile = required(environment.PEI_PROXY_PRIVATE_KEY_FILE,
        'PEI_PROXY_PRIVATE_KEY_FILE');
    const rpcUrl = rpc(required(environment.PEI_RPC_URL, 'PEI_RPC_URL'));
    const feeLuna = nonnegativeLuna(environment.PEI_PROXY_FEE_LUNA ?? '0',
        'PEI_PROXY_FEE_LUNA');
    const paused = boolean(environment.PEI_PROXY_PAUSED ?? 'true', 'PEI_PROXY_PAUSED');
    const dailyBudgetLuna = nonnegativeLuna(
        environment.PEI_PROXY_DAILY_BUDGET_LUNA ?? '0',
        'PEI_PROXY_DAILY_BUDGET_LUNA'
    );
    if (!paused && dailyBudgetLuna < BigInt(pei.earnAmountLuna)) {
        throw new Error('PEI_PROXY_DAILY_BUDGET_LUNA must fund at least one PEI earn transfer.');
    }
    if (pei.network === 'main-albatross' &&
        environment.PEI_MAINNET_ACKNOWLEDGEMENT?.trim() !== MAINNET_ACKNOWLEDGEMENT) {
        throw new Error(
            `Mainnet PEI transfers require PEI_MAINNET_ACKNOWLEDGEMENT=${MAINNET_ACKNOWLEDGEMENT}.`
        );
    }
    return {
        network: pei.network,
        proxyAddress: normalizeNimiqAddress(pei.proxyAddress),
        feeLuna,
        dailyBudgetLuna,
        privateKeyFile,
        rpcUrl,
        paused
    };
}

export function assertPeiProxyQualityTestEnvironment(
    environment: NodeJS.ProcessEnv = process.env
): void {
    if (environment.WP014_QUALITY_TEST !== 'true') return;
    const blocked = [
        'PEI_PROXY_PRIVATE_KEY_FILE',
        'PEI_MAINNET_ACKNOWLEDGEMENT'
    ].filter((name) => environment[name]?.trim());
    if (blocked.length > 0) {
        throw new Error(`Quality tests refuse PEI transfer authority: ${blocked.join(', ')}.`);
    }
}

function required(value: string | undefined, name: string): string {
    const normalized = value?.trim();
    if (!normalized) throw new Error(`${name} is required by the PEI proxy.`);
    return normalized;
}

function rpc(value: string): string {
    const url = new URL(value);
    const loopback = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if ((!loopback && url.protocol !== 'https:') ||
        (loopback && !['http:', 'https:'].includes(url.protocol)) ||
        url.username || url.password) {
        throw new Error('PEI_RPC_URL must use HTTPS outside loopback and contain no credentials.');
    }
    return url.toString();
}

function nonnegativeLuna(value: string, name: string): bigint {
    if (!/^(0|[1-9][0-9]{0,19})$/.test(value)) {
        throw new Error(`${name} must be a nonnegative integer Luna string.`);
    }
    const parsed = BigInt(value);
    if (parsed > 0xFFFF_FFFF_FFFF_FFFFn) throw new Error(`${name} exceeds the Nimiq u64 range.`);
    return parsed;
}

function boolean(value: string, name: string): boolean {
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error(`${name} must be true or false.`);
}
