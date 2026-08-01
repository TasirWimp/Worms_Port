import assert from 'node:assert/strict';
import test from 'node:test';

import { io, type Socket } from 'socket.io-client';

import {
    ChallengeResultSchema,
    ChallengeSnapshotSchema,
    RewardInfoDataSchema,
    RewardReservationDataSchema,
    RewardUpdateDataSchema,
    protocolEvents
} from '../../shared/protocol';
import { createRuntimeServer } from '../../server/src/runtime';
import { MemoryRewardStore } from '../../server/src/reward/memory-store';
import { RewardService } from '../../server/src/reward/service';
import type { RewardConfig } from '../../server/src/reward/types';

test('authorized reward transport reserves, starts, and forfeits one durable attempt', async () => {
    const store = new MemoryRewardStore();
    const rewards = new RewardService(config(), store, {
        idSource: (() => {
            const ids = ['reward_challenge_01', 'entitlement_record_01'];
            return () => ids.shift()!;
        })(),
        tokenSource: () => 't'.repeat(43),
        seedSource: () => 7
    });
    const runtime = createRuntimeServer({
        allowedOrigins: ['http://127.0.0.1'],
        rewards
    });
    const port = await runtime.listen();
    const socket = io(`http://127.0.0.1:${port}`, {
        transports: ['websocket'],
        extraHeaders: { Origin: 'http://127.0.0.1' }
    });
    try {
        await once(socket, 'connect');
        await emitAck(socket, protocolEvents.sessionOpen, {
            requestId: 'session_open_01',
            action: 'create'
        });
        const session = runtime.sessions.getBound(socket.id!);
        assert.ok(session);
        runtime.sessions.authorize(session, {
            address: 'NQ46 KLJE 5TMF 4Y1A 1255 CJHJ YG1S H0NU T604',
            authorizedAt: new Date().toISOString()
        });

        const info = await emitAck(socket, protocolEvents.rewardInfo, {
            requestId: 'reward_info_01'
        });
        assert.equal(info.ok, true);
        assert.equal(RewardInfoDataSchema.safeParse(info.data).success, true);
        assert.equal(info.data.status, 'available');

        const reserve = await emitAck(socket, protocolEvents.rewardReserve, {
            requestId: 'reward_reserve_01',
            sequence: 0,
            calling: 'wizard'
        });
        assert.equal(reserve.ok, true);
        assert.equal(RewardReservationDataSchema.safeParse(reserve.data).success, true);

        const created = await emitAck(socket, protocolEvents.challengeCreate, {
            requestId: 'reward_start_01',
            sequence: 1,
            mode: 'reward',
            calling: 'wizard',
            eligibility: {
                challengeId: reserve.data.challengeId,
                token: reserve.data.eligibilityToken
            }
        });
        assert.equal(created.ok, true);
        assert.equal(ChallengeSnapshotSchema.safeParse(created.data).success, true);
        assert.equal(created.data.mode, 'reward');

        const updatePromise = once(socket, protocolEvents.rewardUpdate);
        const left = await emitAck(socket, protocolEvents.challengeLeave, {
            requestId: 'reward_leave_01',
            sequence: 2,
            challengeId: created.data.challengeId
        });
        assert.equal(left.ok, true);
        assert.equal(ChallengeResultSchema.safeParse(left.data).success, true);
        const update = await updatePromise;
        assert.equal(RewardUpdateDataSchema.safeParse(update).success, true);
        assert.equal(update.state, 'forfeited');
        assert.equal(
            (await store.status(reserve.data.reservationId, update.recipient))?.attemptConsumed,
            true
        );
    } finally {
        socket.close();
        await runtime.close();
    }
});

test('runtime responses include the production security headers', async () => {
    const runtime = createRuntimeServer({ allowedOrigins: ['http://127.0.0.1'] });
    const port = await runtime.listen();
    try {
        const response = await fetch(`http://127.0.0.1:${port}/`);
        assert.match(response.headers.get('content-security-policy') ?? '', /object-src 'none'/);
        assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
        assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
        assert.equal(response.headers.has('x-powered-by'), false);
    } finally {
        await runtime.close();
    }
});

function emitAck(socket: Socket, event: string, payload: unknown): Promise<any> {
    return new Promise((resolve) => socket.emit(event, payload, resolve));
}

function once(socket: Socket, event: string): Promise<any> {
    return new Promise((resolve) => socket.once(event, resolve));
}

function config(): RewardConfig {
    return {
        mode: 'record-only',
        rewardLuna: 100_000n,
        feeLuna: 0n,
        dailyBudgetLuna: 100_000n,
        reservationTtlMs: 60_000,
        claimTtlMs: 60_000,
        turnLimit: 16,
        paused: false,
        network: 'test-albatross',
        testDailyAttemptLimit: 1
    };
}
