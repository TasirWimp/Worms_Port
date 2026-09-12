import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { io, type Socket } from 'socket.io-client';

import { protocolEvents } from '../../shared/protocol';
import {
    ChallengeCreateAckV10Schema,
    protocolEventsV10
} from '../../shared/protocol-v10-live';
import { V10_AUTOMATION_ID } from '../../shared/combat-version';
import { V10_R5_RULESET_ID } from '../../shared/simulation-v10';
import { createRuntimeServer } from '../../server/src/runtime';
import { MemoryRewardStore } from '../../server/src/reward/memory-store';
import { RewardService } from '../../server/src/reward/service';
import { RewardStoreError, type RewardConfig } from '../../server/src/reward/types';

const DAY = '2026-09-12';
const NOW = new Date(`${DAY}T12:00:00.000Z`);
const WALLET = 'NQ46 KLJE 5TMF 4Y1A 1255 CJHJ YG1S H0NU T604';
const OTHER_WALLET = 'NQ57 WZKS E7RF G7SV 8F7F YG5E E2L3 1X3G RKXA';
const QUALIFICATION_DIGEST = digest('verified-pei-journey');

test('PEI-required Daily binds a trusted qualification and consumes it only at start', async () => {
    const store = new MemoryRewardStore();
    const service = serviceFor(store);
    const credential = await service.issuePeiQualification({
        walletAddress: WALLET,
        qualificationDigest: QUALIFICATION_DIGEST,
        expiresAt: new Date(NOW.getTime() + 600_000)
    });
    await assert.rejects(
        service.reserve(identity(WALLET), 'wizard'),
        rewardError('ineligible')
    );

    const reservation = await service.reserve(identity(WALLET), 'wizard', credential);
    assert.equal(reservation.challengeDay, DAY);
    assert.equal(
        (await store.peiQualificationStatus(credential.grantId, WALLET))?.consumedAt,
        undefined
    );

    const started = await service.start(
        identity(WALLET),
        reservation.challengeId,
        reservation.eligibilityToken
    );
    assert.equal(started.state, 'in_progress');
    assert.equal(started.peiAdmissionGrantId, credential.grantId);
    const consumed = await store.peiQualificationStatus(credential.grantId, WALLET);
    assert.equal(consumed?.entitlementId, started.id);
    assert.equal(consumed?.consumedAt?.toISOString(), NOW.toISOString());
});

test('PEI admission rejects wallet, token, day, expiry, and replay mismatches', async () => {
    let now = new Date(NOW);
    const store = new MemoryRewardStore();
    const service = serviceFor(store, () => now, 2);
    const credential = await service.issuePeiQualification({
        walletAddress: WALLET,
        qualificationDigest: QUALIFICATION_DIGEST,
        expiresAt: new Date(NOW.getTime() + 600_000)
    });

    await assert.rejects(
        service.reserve(identity(OTHER_WALLET), 'wizard', credential),
        rewardError('ineligible')
    );
    await assert.rejects(
        service.reserve(identity(WALLET), 'wizard', { ...credential, token: 'x'.repeat(43) }),
        rewardError('ineligible')
    );

    const reservation = await service.reserve(identity(WALLET), 'wizard', credential);
    await service.start(identity(WALLET), reservation.challengeId, reservation.eligibilityToken);
    await service.completeMatch({
        protocolVersion: 1,
        serverTimeMs: NOW.getTime(),
        sessionId: 'pei_admission_session_01',
        challengeId: reservation.challengeId,
        outcome: 'left',
        revision: 0,
        nextSequence: 0,
        finalTick: null,
        finalStateHash: null
    });
    await assert.rejects(
        service.reserve(identity(WALLET), 'wizard', credential),
        rewardError('ineligible')
    );

    now = new Date('2026-09-13T00:01:00.000Z');
    await assert.rejects(
        service.reserve(identity(WALLET), 'wizard', credential),
        rewardError('ineligible')
    );
    await assert.rejects(
        service.issuePeiQualification({
            walletAddress: WALLET,
            qualificationDigest: QUALIFICATION_DIGEST,
            expiresAt: new Date(now.getTime() + 1)
        }),
        rewardError('expired')
    );
});

test('cancelled reservation leaves the admission credential reusable', async () => {
    const store = new MemoryRewardStore();
    const ids = [
        'pei_reward_challenge_01',
        'pei_entitlement_record_01',
        'pei_reward_challenge_02',
        'pei_entitlement_record_02'
    ];
    const service = serviceFor(store, () => NOW, 1, () => ids.shift()!);
    const credential = await service.issuePeiQualification({
        walletAddress: WALLET,
        qualificationDigest: QUALIFICATION_DIGEST,
        expiresAt: new Date(NOW.getTime() + 600_000)
    });
    const first = await service.reserve(identity(WALLET), 'wizard', credential);
    await service.cancelReservation(identity(WALLET), first.challengeId);
    assert.equal(
        (await store.peiQualificationStatus(credential.grantId, WALLET))?.consumedAt,
        undefined
    );
    const second = await service.reserve(identity(WALLET), 'wizard', credential);
    assert.notEqual(second.challengeId, first.challengeId);
    assert.equal((await service.start(
        identity(WALLET), second.challengeId, second.eligibilityToken
    )).state, 'in_progress');
});

test('socket admission reaches the authoritative V10 volcanic reward match', async () => {
    const store = new MemoryRewardStore();
    const service = serviceFor(store, () => NOW);
    const credential = await service.issuePeiQualification({
        walletAddress: WALLET,
        qualificationDigest: QUALIFICATION_DIGEST,
        expiresAt: new Date(NOW.getTime() + 600_000)
    });
    const runtime = createRuntimeServer({
        allowMissingOrigin: true,
        rewards: service,
        sessionRegistry: {
            practiceV10: true,
            v10TestOnly: { nowUs: () => 0 }
        }
    });
    const port = await runtime.listen();
    const socket = io(`http://127.0.0.1:${port}`, { transports: ['websocket'] });
    try {
        await once(socket, 'connect');
        await emitAck(socket, protocolEvents.sessionOpen, {
            requestId: 'pei_session_open_01',
            action: 'create'
        });
        const session = runtime.sessions.getBound(socket.id!);
        assert.ok(session);
        runtime.sessions.authorize(session, identity(WALLET));

        const withoutPei = await emitAck(socket, protocolEvents.rewardReserve, {
            requestId: 'pei_reserve_missing_01',
            sequence: 0,
            calling: 'wizard'
        });
        assert.equal(withoutPei.ok, false);
        assert.equal(withoutPei.error.code, 'REWARD_INELIGIBLE');

        const reserve = await emitAck(socket, protocolEvents.rewardReserve, {
            requestId: 'pei_reserve_valid_01',
            sequence: 1,
            calling: 'wizard',
            peiAdmission: {
                grantId: credential.grantId,
                token: credential.token
            }
        });
        assert.equal(reserve.ok, true);
        const created = await emitAck(socket, protocolEventsV10.create, {
            requestId: 'pei_v10_create_0001',
            sequence: 2,
            mode: 'reward',
            calling: 'wizard',
            challengeId: reserve.data.challengeId,
            eligibilityToken: reserve.data.eligibilityToken,
            rulesetId: V10_R5_RULESET_ID,
            automationId: V10_AUTOMATION_ID
        });
        assert.equal(ChallengeCreateAckV10Schema.safeParse(created).success, true);
        assert.equal(created.ok, true);
        assert.equal(created.data.mode, 'reward');
        assert.equal(created.data.rulesetId, V10_R5_RULESET_ID);
        assert.equal(
            (await store.peiQualificationStatus(credential.grantId, WALLET))?.entitlementId,
            reserve.data.reservationId
        );
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
    dailyAttemptLimit = 1,
    idSource = sequentialIds()
): RewardService {
    return new RewardService({
        ...config(),
        testWalletAddress: dailyAttemptLimit > 1 ? WALLET : undefined,
        testDailyAttemptLimit: dailyAttemptLimit
    }, store, {
        now,
        idSource,
        tokenSource: () => 'r'.repeat(43),
        seedSource: () => 7,
        peiGrantIdSource: () => 'pei_admission_grant_01',
        peiGrantTokenSource: () => 'p'.repeat(43)
    });
}

function config(): RewardConfig {
    return {
        mode: 'record-only',
        rewardLuna: 100_000n,
        feeLuna: 0n,
        dailyBudgetLuna: 200_000n,
        reservationTtlMs: 180_000,
        claimTtlMs: 600_000,
        turnLimit: 16,
        paused: false,
        network: 'test-albatross',
        testDailyAttemptLimit: 1,
        peiRequired: true
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
