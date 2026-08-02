import os from 'os';

import type { RuntimeServer } from './runtime';
import { createRuntimeServer } from './runtime';
import { rewardConfigFromEnvironment } from './reward/config';
import {
    NimiqRpcPayoutAdapter,
    RecordOnlyPayoutAdapter,
    RewardPayoutWorker
} from './reward/payout';
import { PostgresRewardStore } from './reward/postgres-store';
import { MemoryRewardStore } from './reward/memory-store';
import { RewardService } from './reward/service';
import type { RewardStore } from './reward/types';

const port = Number(process.env.PORT) || 3000;
const sessionOpenRateCapacity = Number(process.env.SESSION_OPEN_RATE_CAPACITY);
const deterministicTestSeeds = process.env.NODE_ENV === 'test'
    ? parseTestSeeds(process.env.PRACTICE_TEST_SEEDS)
    : [];
let runtime: RuntimeServer | undefined;

void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});

async function main(): Promise<void> {
    const rewardConfig = rewardConfigFromEnvironment();
    const identity = identityOptionsFromEnvironment(rewardConfig.mode !== 'disabled');
    const store = rewardStoreFromEnvironment(rewardConfig.mode);
    let rewardWorker: RewardPayoutWorker | undefined;
    const rewardTestSeed = process.env.NODE_ENV === 'test'
        ? Number(process.env.REWARD_TEST_SEED)
        : Number.NaN;
    const rewards = new RewardService(rewardConfig, store, {
        onQueued: () => rewardWorker?.kick(),
        ...(Number.isSafeInteger(rewardTestSeed) &&
            rewardTestSeed >= 0 && rewardTestSeed <= 0xFFFFFFFF
            ? { seedSource: () => rewardTestSeed }
            : {})
    });
    let activeRuntime: RuntimeServer | undefined;
    if (store) {
        const adapter = rewardConfig.mode === 'record-only'
            ? new RecordOnlyPayoutAdapter()
            : await NimiqRpcPayoutAdapter.create(rewardConfig);
        rewardWorker = new RewardPayoutWorker(store, adapter, rewardConfig, {
            onUpdate: (update) => activeRuntime?.emitRewardUpdate(update)
        });
    }
    activeRuntime = createRuntimeServer({
        sessionOpenRateCapacity: Number.isFinite(sessionOpenRateCapacity) &&
            sessionOpenRateCapacity > 0
            ? sessionOpenRateCapacity
            : undefined,
        sessionRegistry: deterministicTestSeeds.length > 0 ? {
            seedSource: (_sessionId, practiceIndex) => deterministicTestSeeds[
                practiceIndex % deterministicTestSeeds.length
            ]
        } : undefined,
        identity,
        rewards,
        rewardWorker
    });
    runtime = activeRuntime;
    await activeRuntime.listen(port, '0.0.0.0');
    for (const ifaceinfo of Object.values(os.networkInterfaces())) {
        for (const iface of ifaceinfo || []) {
            if (!iface.internal && iface.family === 'IPv4') {
                console.log(`Listening on http://${iface.address}:${port}`);
            }
        }
    }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
        runtime?.close()
            .then(() => process.exit(0))
            .catch((error) => {
                console.error(error);
                process.exit(1);
            });
    });
}

function parseTestSeeds(value: string | undefined): number[] {
    if (!value) return [];
    return value.split(',').map((seed) => Number(seed.trim())).filter((seed) =>
        Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xFFFFFFFF
    );
}

function identityOptionsFromEnvironment(required: boolean) {
    const publicOrigin = (
        process.env.IDENTITY_PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL || ''
    ).trim();
    const network = (process.env.NIMIQ_NETWORK || '').trim();
    if (!publicOrigin && !network && !required) return false as const;
    if (!publicOrigin || !network) {
        throw new Error(
            'Identity requires both IDENTITY_PUBLIC_ORIGIN (or RENDER_EXTERNAL_URL) and NIMIQ_NETWORK.'
        );
    }
    return { publicOrigin, network };
}

function rewardStoreFromEnvironment(mode: ReturnType<
    typeof rewardConfigFromEnvironment
>['mode']): RewardStore | undefined {
    if (mode === 'disabled') return undefined;
    if (process.env.NODE_ENV === 'test' &&
        process.env.REWARD_TEST_MEMORY_STORE === 'true') {
        return new MemoryRewardStore();
    }
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) {
        throw new Error('Enabled rewards require DATABASE_URL for the durable reward ledger.');
    }
    return new PostgresRewardStore(connectionString);
}
