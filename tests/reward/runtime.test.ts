import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
import { V8_AUTOMATION_ID } from '../../shared/combat-version';
import { V8_R1_RULESET_ID } from '../../shared/simulation-v8';
import { protocolEventsV8, ChallengeCreateAckV8Schema } from '../../shared/protocol-v8';

for (const ending of ['disconnect-expiry', 'runtime-close'] as const) {
    test(`automated reward ${ending} settles once before replay deletion`, async () => {
        const store = new MemoryRewardStore();
        const ids = ['automated_reward_challenge', 'automated_reward_entitlement'];
        let now = Date.now();
        const rewards = new RewardService(config(), store, { idSource: () => ids.shift()!,
            tokenSource: () => 't'.repeat(43), seedSource: () => 1 });
        let settled = 0;
        const runtime = createRuntimeServer({ allowMissingOrigin: true, rewards,
            sessionRegistry: { now: () => now, challengeTtlMs: 1000, simulationRulesetId: V8_R1_RULESET_ID,
                simulationTickIntervalMs: false, v8TestOnly: { nowUs: () => 0 },
                onChallengeSettledV8: () => { settled += 1; } } });
        const port = await runtime.listen();
        const socket = io(`http://127.0.0.1:${port}`, { transports: ['websocket'] });
        try {
            await once(socket, 'connect');
            await emitAck(socket, protocolEvents.sessionOpen, { requestId: 'automated_session_open', action: 'create' });
            const session = runtime.sessions.getBound(socket.id!)!;
            const identity = { address: 'NQ46 KLJE 5TMF 4Y1A 1255 CJHJ YG1S H0NU T604', authorizedAt: new Date().toISOString() };
            runtime.sessions.authorize(session, identity);
            const reserve = await emitAck(socket, protocolEvents.rewardReserve,
                { requestId: 'automated_reserve_01', sequence: 0, calling: 'wizard' });
            const created = await emitAck(socket, protocolEventsV8.create, { requestId: 'automated_create_01',
                sequence: 1, mode: 'reward', calling: 'wizard', eligibility: {
                    challengeId: reserve.data.challengeId, token: reserve.data.eligibilityToken } });
            assert.equal(ChallengeCreateAckV8Schema.safeParse(created).success, true);
            assert.equal(created.ok, true);
            assert.equal(created.data.snapshot.automationId, V8_AUTOMATION_ID);
            if (ending === 'disconnect-expiry') {
                const disconnected = new Promise<void>(resolve => runtime.io.sockets.sockets.get(socket.id!)!.once('disconnect', () => resolve()));
                socket.disconnect(); await disconnected;
                now += 1001; runtime.sessions.sweep(); runtime.sessions.sweep();
                assert.equal(settled, 1);
                await runtime.close();
            } else { await runtime.close(); await runtime.close(); }
            assert.equal(settled, 1);
            const retained = await store.status(reserve.data.reservationId, identity.address);
            assert.equal(retained?.state, 'expired');
            assert.equal(retained?.finalTick, 0);
            assert.equal(retained?.replay && 'automationId' in retained.replay && retained.replay.automationId, V8_AUTOMATION_ID);
        } finally { socket.close(); await runtime.close(); }
    });
}

test('versioned reward creation refuses active Practice before consuming eligibility under V7 and r1', async () => {
    for (const candidate of [false, true]) {
        const store = new MemoryRewardStore();
        const ids = ['reserved_active_challenge', 'reserved_active_entitlement'];
        const rewards = new RewardService(config(), store, { idSource: () => ids.shift()!,
            tokenSource: () => 't'.repeat(43), seedSource: () => 1 });
        const runtime = createRuntimeServer({ allowMissingOrigin: true, rewards, sessionRegistry: {
            simulationTickIntervalMs: false, ...(candidate ? { simulationRulesetId: V8_R1_RULESET_ID,
                v8TestOnly: { nowUs: () => 0 } } : {}) } });
        const port = await runtime.listen();
        const socket = io(`http://127.0.0.1:${port}`, { transports: ['websocket'] });
        try {
            await once(socket, 'connect');
            await emitAck(socket, protocolEvents.sessionOpen, { requestId: 'active_session_open', action: 'create' });
            const session = runtime.sessions.getBound(socket.id!)!;
            const identity = { address: 'NQ46 KLJE 5TMF 4Y1A 1255 CJHJ YG1S H0NU T604', authorizedAt: new Date().toISOString() };
            runtime.sessions.authorize(session, identity);
            const reserve = await emitAck(socket, protocolEvents.rewardReserve,
                { requestId: 'active_reserve_01', sequence: 0, calling: 'wizard' });
            const eligibility = { challengeId: reserve.data.challengeId, token: reserve.data.eligibilityToken };
            if (candidate) {
                const old = await emitAck(socket, protocolEvents.challengeCreate, { requestId: 'old_reward_create',
                    sequence: 1, mode: 'reward', calling: 'wizard', eligibility });
                assert.equal(old.error.code, 'FEATURE_UNAVAILABLE');
                assert.equal((await store.status(reserve.data.reservationId, identity.address))?.state, 'reserved');
            }
            const practice = await emitAck(socket, protocolEventsV8.create,
                { requestId: 'active_practice_create', sequence: 1, mode: 'practice', calling: 'wizard' });
            const refused = await emitAck(socket, protocolEventsV8.create,
                { requestId: 'active_reward_refuse', sequence: 2, mode: 'reward', calling: 'wizard', eligibility });
            assert.equal(refused.ok, false);
            assert.equal(refused.error.code, 'BAD_REQUEST');
            const retained = await store.status(reserve.data.reservationId, identity.address);
            assert.equal(retained?.state, 'reserved'); assert.equal(retained?.attemptConsumed, false);
            const challengeId = practice.data.snapshot.challengeId;
            const left = await emitAck(socket, candidate ? protocolEventsV8.leave : protocolEvents.challengeLeave,
                { requestId: 'active_practice_leave', sequence: 3, challengeId,
                    ...(candidate ? { rulesetId: V8_R1_RULESET_ID, automationId: V8_AUTOMATION_ID } : {}) });
            assert.equal(left.ok, true);
            const created = await emitAck(socket, protocolEventsV8.create,
                { requestId: 'active_reward_create', sequence: 4, mode: 'reward', calling: 'wizard', eligibility });
            assert.equal(created.ok, true); assert.equal(created.data.snapshot.mode, 'reward');
            assert.equal((await store.status(reserve.data.reservationId, identity.address))?.state, 'in_progress');
        } finally { socket.close(); await runtime.close(); }
    }
});

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
    const clientDir = await mkdtemp(join(tmpdir(), 'nimble-knots-runtime-'));
    await writeFile(
        join(clientDir, 'index.html'),
        '<!doctype html><title>NIMble Knots test fixture</title>',
        'utf8'
    );
    const runtime = createRuntimeServer({
        allowedOrigins: ['http://127.0.0.1'],
        clientDir
    });
    const port = await runtime.listen();
    try {
        const response = await fetch(`http://127.0.0.1:${port}/`);
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-security-policy') ?? '', /object-src 'none'/);
        assert.match(response.headers.get('content-security-policy') ?? '', /img-src 'self' data: blob:/);
        assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
        assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
        assert.equal(response.headers.get('x-frame-options'), 'DENY');
        assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
        assert.match(response.headers.get('permissions-policy') ?? '', /payment=\(\)/);
        assert.equal(response.headers.has('x-powered-by'), false);
    } finally {
        await runtime.close();
        await rm(clientDir, { recursive: true, force: true });
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
