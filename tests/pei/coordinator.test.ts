import assert from 'node:assert/strict';
import test from 'node:test';

import {
    authenticateRequest,
    PeiCoordinatorV0,
    requestAuthenticationMatches,
    type PeiRuntimeConfigV0
} from '../../server/src/pei/coordinator';
import { createPeiProxyRuntimeV0 } from '../../server/src/pei/proxy-runtime';
import { MemoryPeiJourneyStoreV0 } from '../../server/src/pei/store';
import { MemoryRewardStore } from '../../server/src/reward/memory-store';
import { RewardService } from '../../server/src/reward/service';
import type { RewardConfig } from '../../server/src/reward/types';
import {
    decodePeiProofV0,
    decodePeiRequestV0,
    encodePeiJourneyV0,
    encodePeiProofV0,
    peiRequestCommitmentV0,
    type PeiProofV0
} from '../../shared/pei-v0';
import {
    PEI_EARN_TX,
    PEI_NOW_SECONDS,
    PEI_PROXY_ADDRESS,
    PEI_SPEND_TX,
    PEI_WALLET,
    SyntheticPeiChain
} from './fixtures';

const runtimeConfig = (): PeiRuntimeConfigV0 => ({
    network: 'main-albatross',
    requesterOrigin: 'https://knots.example',
    proxyOrigin: 'https://helper.example',
    proxyAddress: PEI_PROXY_ADDRESS,
    returnUri: 'https://knots.example/#pei-return',
    allowedReturnUris: ['https://knots.example/#pei-return'],
    earnAmountLuna: '1',
    spendAmountLuna: '1',
    requestAuthSecret: 'U'.repeat(43),
    requestTtlSeconds: 600,
    maximumRequestTtlSeconds: 600,
    clockSkewSeconds: 30,
    requireFinality: true
});

test('coordinator binds both browser crossings and issues one durable receipt', async () => {
    const chain = new SyntheticPeiChain();
    const store = new MemoryRewardStore();
    const rewards = rewardService(store);
    const nonces = ['B'.repeat(43), 'C'.repeat(43)];
    const coordinator = new PeiCoordinatorV0({
        config: runtimeConfig(),
        adapter: chain,
        rewards,
        now: () => new Date(PEI_NOW_SECONDS * 1_000),
        nonceSource: () => nonces.shift()!
    });
    const earnLaunch = await coordinator.begin('pei_coordinator_session_01', PEI_WALLET);
    assert.equal(earnLaunch.step, 'earn');
    const earnParts = new URL(earnLaunch.launchUrl).hash.split('/');
    const earnRequest = decodePeiRequestV0(earnParts[2]);
    assert.equal(requestAuthenticationMatches(earnParts[2], earnParts[3], runtimeConfig().requestAuthSecret), true);
    const earnCommitment = await peiRequestCommitmentV0(earnRequest);
    chain.transactions.set(PEI_EARN_TX, {
        hash: PEI_EARN_TX, network: earnRequest.network, sender: PEI_PROXY_ADDRESS,
        recipient: PEI_WALLET, valueLuna: '1', data: earnCommitment,
        executionState: 'success', finalized: true
    });
    const earnProof: PeiProofV0 = {
        protocol: 'pei', version: 0, request: earnRequest, txHash: PEI_EARN_TX
    };
    const spendLaunch = await coordinator.acceptEarn(
        'pei_coordinator_session_01', PEI_WALLET, encodePeiProofV0(earnProof)
    );
    assert.equal(spendLaunch.step, 'spend');
    const spendParts = new URL(spendLaunch.launchUrl).hash.split('/');
    assert.deepEqual(decodePeiProofV0(spendParts[4]), earnProof);
    const spendRequest = decodePeiRequestV0(spendParts[2]);
    const spendCommitment = await peiRequestCommitmentV0(spendRequest);
    chain.transactions.set(PEI_SPEND_TX, {
        hash: PEI_SPEND_TX, network: spendRequest.network, sender: PEI_WALLET,
        recipient: PEI_PROXY_ADDRESS, valueLuna: '1', data: spendCommitment,
        executionState: 'success', finalized: true
    });
    const qualified = await coordinator.complete(
        'pei_coordinator_session_01',
        PEI_WALLET,
        encodePeiJourneyV0({
            protocol: 'pei', version: 0,
            proofs: [earnProof, {
                protocol: 'pei', version: 0, request: spendRequest, txHash: PEI_SPEND_TX
            }]
        })
    );
    assert.equal(qualified.step, 'qualified');
    assert.deepEqual(qualified.edges, ['earned', 'spent']);
    assert.deepEqual(qualified.transactionHashes, [PEI_EARN_TX, PEI_SPEND_TX]);
    assert.equal((await store.peiReceiptStatus(
        qualified.receipt.id, PEI_WALLET
    ))?.qualificationDigest.length, 43);
    await assert.rejects(
        coordinator.complete('pei_coordinator_session_01', PEI_WALLET, 'broken')
    );
});

test('accepted journey state survives coordinator and session replacement', async () => {
    const chain = new SyntheticPeiChain();
    const journeyStore = new MemoryPeiJourneyStoreV0();
    const rewards = rewardService(new MemoryRewardStore());
    const nonces = ['B'.repeat(43), 'C'.repeat(43), 'D'.repeat(43)];
    const makeCoordinator = () => new PeiCoordinatorV0({
        config: runtimeConfig(), adapter: chain, rewards, journeyStore,
        now: () => new Date(PEI_NOW_SECONDS * 1_000),
        nonceSource: () => nonces.shift()!
    });
    const first = makeCoordinator();
    const launch = await first.begin('old_session', PEI_WALLET);
    const [, , carrier] = new URL(launch.launchUrl).hash.split('/');
    const earnRequest = decodePeiRequestV0(carrier);
    const earnCommitment = await peiRequestCommitmentV0(earnRequest);
    chain.transactions.set(PEI_EARN_TX, {
        hash: PEI_EARN_TX, network: earnRequest.network, sender: PEI_PROXY_ADDRESS,
        recipient: PEI_WALLET, valueLuna: '1', data: earnCommitment,
        executionState: 'success', finalized: true
    });
    const earnProof: PeiProofV0 = {
        protocol: 'pei', version: 0, request: earnRequest, txHash: PEI_EARN_TX
    };
    const second = makeCoordinator();
    const spendLaunch = await second.acceptEarn(
        'replacement_session', PEI_WALLET, encodePeiProofV0(earnProof)
    );
    const spendRequest = decodePeiRequestV0(new URL(spendLaunch.launchUrl).hash.split('/')[2]);
    const duplicate = await makeCoordinator().acceptEarn(
        'another_session', PEI_WALLET, encodePeiProofV0(earnProof)
    );
    assert.deepEqual(
        decodePeiRequestV0(new URL(duplicate.launchUrl).hash.split('/')[2]),
        spendRequest
    );
    const spendCommitment = await peiRequestCommitmentV0(spendRequest);
    chain.transactions.set(PEI_SPEND_TX, {
        hash: PEI_SPEND_TX, network: spendRequest.network, sender: PEI_WALLET,
        recipient: PEI_PROXY_ADDRESS, valueLuna: '1', data: spendCommitment,
        executionState: 'success', finalized: true
    });
    const result = await makeCoordinator().complete(
        'fresh_session',
        PEI_WALLET,
        encodePeiJourneyV0({
            protocol: 'pei', version: 0,
            proofs: [earnProof, {
                protocol: 'pei', version: 0, request: spendRequest, txHash: PEI_SPEND_TX
            }]
        })
    );
    assert.equal(result.step, 'qualified');
});

test('helper authenticates both actions and deduplicates an earn request', async () => {
    const config = runtimeConfig();
    const chain = new SyntheticPeiChain();
    const coordinator = new PeiCoordinatorV0({
        config,
        adapter: chain,
        rewards: rewardService(new MemoryRewardStore()),
        now: () => new Date(PEI_NOW_SECONDS * 1_000),
        nonceSource: () => 'B'.repeat(43)
    });
    const launch = await coordinator.begin('pei_proxy_session_0001', PEI_WALLET);
    const [, , requestCarrier, authorization] = new URL(launch.launchUrl).hash.split('/');
    let sends = 0;
    const helper = createPeiProxyRuntimeV0({
        clientDir: process.cwd(), config,
        chainAdapter: chain,
        now: () => new Date(PEI_NOW_SECONDS * 1_000),
        earnTransfer: {
            send: async () => {
                sends += 1;
                return PEI_EARN_TX;
            }
        }
    });
    const port = await helper.listen();
    try {
        const post = (pathname: string, body: unknown) => fetch(`http://127.0.0.1:${port}${pathname}`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body)
        });
        assert.equal((await post('/api/pei/authorize', { requestCarrier, authorization })).status, 200);
        assert.equal((await post('/api/pei/authorize', {
            requestCarrier, authorization: 'Z'.repeat(43)
        })).status, 400);
        const [first, second] = await Promise.all([
            post('/api/pei/earn', { requestCarrier, authorization }),
            post('/api/pei/earn', { requestCarrier, authorization })
        ]);
        assert.deepEqual([first.status, second.status], [200, 200]);
        assert.equal(sends, 1);
        const earnRequest = decodePeiRequestV0(requestCarrier);
        const pending = await post('/api/pei/verify', {
            requestCarrier, authorization, transactionHash: PEI_EARN_TX
        });
        assert.equal(pending.status, 200);
        assert.deepEqual(await pending.json(), {
            status: 'pending', reason: 'transaction_not_found'
        });
        assert.equal(sends, 2);
        chain.transactions.set(PEI_EARN_TX, {
            hash: PEI_EARN_TX, network: earnRequest.network, sender: PEI_PROXY_ADDRESS,
            recipient: PEI_WALLET, valueLuna: '1',
            data: await peiRequestCommitmentV0(earnRequest),
            executionState: 'success', finalized: true
        });
        const verified = await post('/api/pei/verify', {
            requestCarrier, authorization, transactionHash: PEI_EARN_TX
        });
        assert.equal(verified.status, 200);
        assert.deepEqual(await verified.json(), { status: 'final' });
    } finally {
        await helper.close();
    }
});

test('request HMAC rejects malformed presentations without throwing', () => {
    const carrier = 'request_carrier';
    const secret = 'U'.repeat(43);
    const authentication = authenticateRequest(carrier, secret);
    assert.equal(requestAuthenticationMatches(carrier, authentication, secret), true);
    assert.equal(requestAuthenticationMatches(carrier, 'bad', secret), false);
});

function rewardService(store: MemoryRewardStore): RewardService {
    let receipt = 0;
    const config: RewardConfig = {
        mode: 'record-only', paused: false,
        network: 'main-albatross', rewardLuna: 100_000n, feeLuna: 0n,
        dailyBudgetLuna: 1_000_000n, reservationTtlMs: 300_000,
        claimTtlMs: 300_000, turnLimit: 16,
        testDailyAttemptLimit: 1, peiRequired: true
    };
    return new RewardService(config, store, {
        now: () => new Date(PEI_NOW_SECONDS * 1_000),
        peiReceiptIdSource: () => `pei_coordinator_receipt_${++receipt}`
    });
}
