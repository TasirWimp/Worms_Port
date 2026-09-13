import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { io, type Socket } from 'socket.io-client';

import { protocolEvents } from '../../shared/protocol';
import { ChallengeCreateAckV10Schema, protocolEventsV10 } from '../../shared/protocol-v10-live';
import { V10_AUTOMATION_ID } from '../../shared/combat-version';
import { V10_R5_RULESET_ID } from '../../shared/simulation-v10';
import { createRuntimeServer } from '../../server/src/runtime';
import { MemoryRewardStore } from '../../server/src/reward/memory-store';
import { RewardService } from '../../server/src/reward/service';
import { RewardStoreError, type RewardConfig } from '../../server/src/reward/types';

const DAY = '2026-09-12';
const NEXT_DAY = '2026-09-13';
const NOW = new Date(`${DAY}T12:00:00.000Z`);
const WALLET = 'NQ46 KLJE 5TMF 4Y1A 1255 CJHJ YG1S H0NU T604';
const OTHER_WALLET = 'NQ57 WZKS E7RF G7SV 8F7F YG5E E2L3 1X3G RKXA';

test('wallet receipts accumulate durably and the oldest is consumed only when Daily starts', async () => {
    let now = new Date(NOW);
    const store = new MemoryRewardStore();
    const service = serviceFor(
        store,
        () => now,
        sequentialIds(),
        ids('pei_receipt_record_01', 'pei_receipt_record_02')
    );

    const first = await service.issuePeiReceipt(qualification('journey-one', now));
    now = new Date(now.getTime() + 1_000);
    const second = await service.issuePeiReceipt(qualification('journey-two', now));
    assert.equal((await service.info(identity(WALLET))).availablePeiReceipts, 2);
    assert.equal((await service.info(identity(OTHER_WALLET))).availablePeiReceipts, 0);

    now = new Date(`${NEXT_DAY}T12:00:00.000Z`);
    assert.equal((await service.info(identity(WALLET))).availablePeiReceipts, 2);
    const reservation = await service.reserve(identity(WALLET), 'wizard');
    assert.equal((await service.info(identity(WALLET))).availablePeiReceipts, 1);
    assert.equal((await store.peiReceiptStatus(first.id, WALLET))?.consumedAt, undefined);

    const started = await service.start(
        identity(WALLET), reservation.challengeId, reservation.eligibilityToken
    );
    assert.equal(started.peiReceiptId, first.id);
    assert.equal((await store.peiReceiptStatus(first.id, WALLET))?.entitlementId, started.id);
    assert.equal((await store.peiReceiptStatus(second.id, WALLET))?.consumedAt, undefined);
    assert.equal((await service.info(identity(WALLET))).availablePeiReceipts, 1);
    await store.completeMatch({
        challengeId: reservation.challengeId,
        outcome: 'left',
        finalTick: null,
        finalStateHash: null,
        now
    });
    await assert.rejects(service.reserve(identity(WALLET), 'wizard'), rewardError('ineligible'));
});

test('replaying one verified journey is idempotent while distinct journeys create receipts', async () => {
    const store = new MemoryRewardStore();
    const service = serviceFor(
        store,
        () => NOW,
        sequentialIds(),
        ids('pei_receipt_record_01', 'pei_receipt_record_02', 'pei_receipt_record_03')
    );
    const first = await service.issuePeiReceipt(qualification('same-journey', NOW));
    const retry = await service.issuePeiReceipt(qualification('same-journey', NOW));
    const distinct = await service.issuePeiReceipt(qualification('other-journey', NOW));
    assert.equal(retry.id, first.id);
    assert.notEqual(distinct.id, first.id);
    assert.equal((await service.info(identity(WALLET))).availablePeiReceipts, 2);
});

test('reward pause blocks Daily but does not block independent receipt issuance', async () => {
    const store = new MemoryRewardStore();
    const service = new RewardService({ ...config(), paused: true }, store, {
        now: () => NOW,
        peiReceiptIdSource: () => 'pei_paused_receipt_01'
    });
    await service.issuePeiReceipt(qualification('paused-reward-journey', NOW));
    const info = await service.info(identity(WALLET));
    assert.equal(info.status, 'paused');
    assert.equal(info.availablePeiReceipts, 1);
    await assert.rejects(service.reserve(identity(WALLET), 'wizard'), rewardError('paused'));
});

test('cancelled reservation releases its receipt and an expired proof cannot issue one', async () => {
    const store = new MemoryRewardStore();
    const service = serviceFor(store, () => NOW);
    const receipt = await service.issuePeiReceipt(qualification('cancelled-journey', NOW));
    const first = await service.reserve(identity(WALLET), 'wizard');
    assert.equal((await service.info(identity(WALLET))).availablePeiReceipts, 0);
    await service.cancelReservation(identity(WALLET), first.challengeId);
    assert.equal((await service.info(identity(WALLET))).availablePeiReceipts, 1);
    const second = await service.reserve(identity(WALLET), 'wizard');
    assert.notEqual(second.challengeId, first.challengeId);
    assert.equal((await service.start(
        identity(WALLET), second.challengeId, second.eligibilityToken
    )).peiReceiptId, receipt.id);

    await assert.rejects(
        service.issuePeiReceipt({
            walletAddress: WALLET,
            qualificationDigest: digest('expired'),
            expiresAt: new Date(NOW.getTime() - 1)
        }),
        rewardError('expired')
    );
});

test('server-owned receipt reaches the authoritative V10 volcanic Daily match', async () => {
    const store = new MemoryRewardStore();
    const service = serviceFor(store, () => NOW);
    const receipt = await service.issuePeiReceipt(qualification('socket-journey', NOW));
    const runtime = createRuntimeServer({
        allowMissingOrigin: true,
        rewards: service,
        sessionRegistry: { practiceV10: true, v10TestOnly: { nowUs: () => 0 } }
    });
    const port = await runtime.listen();
    const socket = io(`http://127.0.0.1:${port}`, { transports: ['websocket'] });
    try {
        await once(socket, 'connect');
        await emitAck(socket, protocolEvents.sessionOpen, {
            requestId: 'pei_session_open_01', action: 'create'
        });
        const session = runtime.sessions.getBound(socket.id!);
        assert.ok(session);
        runtime.sessions.authorize(session, identity(WALLET));

        const info = await emitAck(socket, protocolEvents.rewardInfo, {
            requestId: 'pei_reward_info_01'
        });
        assert.equal(info.data.availablePeiReceipts, 1);
        const reserve = await emitAck(socket, protocolEvents.rewardReserve, {
            requestId: 'pei_reserve_valid_01', sequence: 0, calling: 'wizard'
        });
        assert.equal(reserve.ok, true);
        const created = await emitAck(socket, protocolEventsV10.create, {
            requestId: 'pei_v10_create_0001',
            sequence: 1,
            mode: 'reward',
            calling: 'wizard',
            challengeId: reserve.data.challengeId,
            eligibilityToken: reserve.data.eligibilityToken,
            rulesetId: V10_R5_RULESET_ID,
            automationId: V10_AUTOMATION_ID
        });
        assert.equal(ChallengeCreateAckV10Schema.safeParse(created).success, true);
        assert.equal(created.data.mode, 'reward');
        assert.equal((await store.peiReceiptStatus(receipt.id, WALLET))?.entitlementId,
            reserve.data.reservationId);
    } finally {
        socket.close();
        await runtime.close();
    }
});

test('PEI-disabled rewards preserve the accepted Daily reservation path', async () => {
    const store = new MemoryRewardStore();
    const service = new RewardService({ ...config(), peiRequired: false }, store, {
        now: () => NOW,
        idSource: ids('open_reward_challenge_01', 'open_entitlement_record_01'),
        tokenSource: () => 'r'.repeat(43),
        seedSource: () => 7
    });
    const reservation = await service.reserve(identity(WALLET), 'wizard');
    assert.equal((await service.start(
        identity(WALLET), reservation.challengeId, reservation.eligibilityToken
    )).state, 'in_progress');
});

function serviceFor(
    store: MemoryRewardStore,
    now: () => Date = () => NOW,
    idSource = sequentialIds(),
    peiReceiptIdSource: () => string = () => 'pei_receipt_record_01'
): RewardService {
    return new RewardService(config(), store, {
        now,
        idSource,
        tokenSource: () => 'r'.repeat(43),
        seedSource: () => 7,
        peiReceiptIdSource
    });
}

function qualification(value: string, now: Date) {
    return {
        walletAddress: WALLET,
        qualificationDigest: digest(value),
        expiresAt: new Date(now.getTime() + 60_000)
    };
}

function config(): RewardConfig {
    return {
        mode: 'record-only', rewardLuna: 100_000n, feeLuna: 0n,
        dailyBudgetLuna: 300_000n, reservationTtlMs: 180_000,
        claimTtlMs: 600_000, turnLimit: 16, paused: false,
        network: 'test-albatross', testDailyAttemptLimit: 1, peiRequired: true
    };
}

function identity(address: string) {
    return { address, authorizedAt: NOW.toISOString() };
}

function ids(...values: string[]): () => string {
    return () => values.shift()!;
}

function sequentialIds(): () => string {
    let sequence = 0;
    return () => `pei_reward_record_${String(sequence += 1).padStart(4, '0')}`;
}

function digest(value: string): string {
    return createHash('sha256').update(value).digest('base64url');
}

function rewardError(code: string) {
    return (error: unknown) => error instanceof RewardStoreError && error.code === code;
}

function once(socket: Socket, event: string): Promise<any> {
    return new Promise((resolve) => socket.once(event, resolve));
}

function emitAck(socket: Socket, event: string, payload: unknown): Promise<any> {
    return new Promise((resolve) => socket.emit(event, payload, resolve));
}
