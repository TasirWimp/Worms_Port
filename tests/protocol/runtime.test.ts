import assert from 'node:assert/strict';
import test from 'node:test';

import { io as connectClient, type Socket } from 'socket.io-client';

import {
    ChallengeResultSchema,
    ChallengeSnapshotSchema,
    ProtocolFailureAckSchema,
    ProtocolSuccessAckSchema,
    SessionOpenDataSchema,
    protocolEvents
} from '../../shared/protocol';
import { createRuntimeServer, type RuntimeServer } from '../../server/src/runtime';
import { Room } from '../../server/src/room/class';
import { Game } from '../../server/src/game/class';
import { GameWatcher } from '../../server/src/game/watcher';
import { SessionRegistry } from '../../server/src/session/registry';
import { SimulationCoordinator } from '../../server/src/simulation/coordinator';
import { SIM_RULES } from '../../shared/simulation';
import { V8_R1_RULESET_ID } from '../../shared/simulation-v8';
import { ChallengeCreateAckV8Schema, protocolEventsV8 } from '../../shared/protocol-v8';
import { CandidateAckV9Schema, ChallengeCreateAckV9Schema, protocolEventsV9 } from '../../shared/protocol-v9';
import { V9_RULESET_ID } from '../../shared/simulation-v9';

type Ack = Record<string, any>;

test('versioned creation shares selection and keeps cross-endpoint caches separate', async () => {
    for (const candidate of [false, true]) {
        const { runtime, url } = await start(candidate ? { sessionRegistry: {
            simulationRulesetId: V8_R1_RULESET_ID, simulationTickIntervalMs: false,
            v8TestOnly: { nowUs: () => 0 } } } : {});
        const socket = await connect(url);
        try {
            await openSession(socket);
            const request = { requestId: 'shared_creation_01', sequence: 0, mode: 'practice', calling: 'wizard' };
            const created = await emitAck(socket, protocolEventsV8.create, request);
            assert.equal(ChallengeCreateAckV8Schema.safeParse(created).success, true);
            assert.equal(created.ok, true);
            assert.equal(created.data.kind, candidate ? 'v8' : 'legacy');
            assert.deepEqual(await emitAck(socket, protocolEventsV8.create, request), created);
            const legacy = await emitAck(socket, protocolEvents.challengeCreate, request);
            assert.equal(legacy.protocolVersion, 1);
            assert.equal(legacy.ok, false);
            assert.equal(legacy.error.code, candidate ? 'FEATURE_UNAVAILABLE' : 'REPLAY_CONFLICT');
            assert.equal(runtime.sessions.getBound(socket.id!)!.challenges.size, 1);
            assert.equal(runtime.sessions.getBound(socket.id!)!.nextSequence, 1);
        } finally { await closeAll(runtime, [socket]); }
    }
});

test('versioned creation refusals retain strict V8 acknowledgements and consume no authority', async () => {
    const { runtime, url } = await start({ sessionRegistry: { simulationRulesetId: V8_R1_RULESET_ID,
        simulationTickIntervalMs: false, v8TestOnly: { nowUs: () => 0 } } });
    const socket = await connect(url);
    try {
        const request = { requestId: 'guard_creation_01', sequence: 0, mode: 'practice', calling: 'wizard' };
        const unauthorized = await emitAck(socket, protocolEventsV8.create, request);
        assert.equal(ChallengeCreateAckV8Schema.safeParse(unauthorized).success, true);
        assert.equal(unauthorized.error.code, 'UNAUTHORIZED');
        await openSession(socket);
        for (const [payload, code] of [[{ ...request, rulesetId: V8_R1_RULESET_ID }, 'BAD_REQUEST'],
            [{ ...request, padding: 'x'.repeat(1024) }, 'PAYLOAD_TOO_LARGE']] as const) {
            const ack = await emitAck(socket, protocolEventsV8.create, payload);
            assert.equal(ChallengeCreateAckV8Schema.safeParse(ack).success, true);
            assert.equal(ack.error.code, code);
        }
        let limited = false;
        for (let index = 0; index < 90; index++) {
            const ack = await emitAck(socket, protocolEventsV8.create,
                { ...request, requestId: `guard_rate_${index}`, sequence: 1 });
            assert.equal(ChallengeCreateAckV8Schema.safeParse(ack).success, true);
            limited ||= ack.error.code === 'RATE_LIMITED';
        }
        assert.equal(limited, true);
        assert.equal(runtime.sessions.getBound(socket.id!)!.nextSequence, 0);
        assert.equal(runtime.sessions.getBound(socket.id!)!.challenges.size, 0);
    } finally { await closeAll(runtime, [socket]); }
});

test('V9 candidate keeps strict ownership, sequence/cursor, pause and reconnect resync separate from V7', async () => {
    const { runtime, url } = await start({ sessionRegistry: { simulationRulesetId: V9_RULESET_ID,
        simulationTickIntervalMs: false, v9TestOnly: { nowUs: () => 0 } } });
    const sockets: Socket[] = [];
    try {
        const original = await connect(url); sockets.push(original);
        const opened = await openSession(original, 'v9_candidate_open_01');
        const malformed = await emitAck(original, protocolEventsV9.create, {
            requestId: 'v9_candidate_bad_01', sequence: 0, mode: 'practice', calling: 'wizard'
        });
        assert.equal(CandidateAckV9Schema.safeParse(malformed).success, true);
        assert.equal(malformed.ok, false);
        const created = await emitAck(original, protocolEventsV9.create, {
            requestId: 'v9_candidate_create_01', sequence: 0, mode: 'practice', calling: 'wizard',
            rulesetId: V9_RULESET_ID, automationId: 'wp-015d3b-v9d-v1'
        });
        assert.equal(ChallengeCreateAckV9Schema.safeParse(created).success, true);
        assert.equal(created.ok, true);
        assert.equal(created.data.nextSequence, 1);
        const paused = await emitAck(original, protocolEventsV9.pause, {
            requestId: 'v9_candidate_pause_01', sequence: 1, challengeId: created.data.challengeId,
            rulesetId: V9_RULESET_ID, automationId: 'wp-015d3b-v9d-v1', paused: true
        });
        assert.equal(CandidateAckV9Schema.safeParse(paused).success, true);
        assert.equal(paused.ok, true);
        assert.equal(paused.data.paused, true);
        const wrongCursor = await emitAck(original, protocolEventsV9.input, {
            requestId: 'v9_candidate_input_01', challengeId: created.data.challengeId,
            rulesetId: V9_RULESET_ID, automationId: 'wp-015d3b-v9d-v1', inputSequence: 1,
            expectedTurn: 0, expectedPhase: 'action', inputEpoch: 0, intent: { type: 'face', direction: 1 }
        });
        assert.equal(CandidateAckV9Schema.safeParse(wrongCursor).success, true);
        assert.equal(wrongCursor.ok, false);
        assert.equal(wrongCursor.error.code, 'SEQUENCE_GAP');
        original.close();
        await new Promise(resolve => setTimeout(resolve, 10));
        const resumed = await connect(url); sockets.push(resumed);
        const resync = new Promise<any>(resolve => resumed.once(protocolEventsV9.snapshot, resolve));
        const reopened = await emitAck(resumed, protocolEvents.sessionOpen, {
            requestId: 'v9_candidate_resume_01', action: 'resume', token: opened.token
        });
        assert.equal(reopened.ok, true);
        const fresh = await resync;
        assert.equal(fresh.challengeId, created.data.challengeId);
        assert.equal(fresh.paused, true);
        assert.equal(fresh.nextSequence, 2);
    } finally { await closeAll(runtime, sockets); }
});

test('V9 serialized input rechecks transport ownership after catch-up yields', async () => {
    let nowUs = 0;
    let release!: () => void;
    let yielded!: () => void;
    const yieldStarted = new Promise<void>(resolve => { yielded = resolve; });
    const registry = new SessionRegistry({ simulationRulesetId: V9_RULESET_ID, simulationTickIntervalMs: false,
        v9TestOnly: { nowUs: () => nowUs, yieldBatch: () => { yielded(); return new Promise<void>(resolve => { release = resolve; }); } } });
    try {
        registry.create('v9_owned_socket_01');
        const session = registry.getBound('v9_owned_socket_01')!;
        const created = registry.createChallengeAutomatedV9(session, 'practice', 'wizard');
        assert.equal('code' in created, false);
        if ('code' in created) return;
        nowUs = 250_000;
        const pending = registry.submitInputV9(session, {
            requestId: 'v9_post_await_input_01', challengeId: created.challengeId,
            rulesetId: V9_RULESET_ID, automationId: 'wp-015d3b-v9d-v1', inputSequence: 0,
            expectedTurn: 0, expectedPhase: 'action', inputEpoch: 0, intent: { type: 'face', direction: 1 }
        });
        await yieldStarted;
        registry.disconnect('v9_owned_socket_01');
        release();
        const response = await pending;
        assert.equal(response.ok, false);
        if (!response.ok) assert.equal(response.error.code, 'UNAUTHORIZED');
        assert.equal(registry.inputCursorV9(session, created.challengeId), 0);
    } finally { registry.dispose(); }
});

test('V9 neutral cancel/release are owned opaque cursor fences and never consume input sequence', async () => {
    const registry = new SessionRegistry({ simulationRulesetId: V9_RULESET_ID, simulationTickIntervalMs: false,
        v9TestOnly: { nowUs: () => 0 } });
    try {
        registry.create('v9_neutral_owner_socket');
        registry.create('v9_neutral_foreign_socket');
        const owner = registry.getBound('v9_neutral_owner_socket')!;
        const foreign = registry.getBound('v9_neutral_foreign_socket')!;
        const created = registry.createChallengeAutomatedV9(owner, 'practice', 'wizard');
        assert.equal('code' in created, false);
        if ('code' in created) return;
        const started = await registry.submitInputV9(owner, {
            requestId: 'v9_neutral_walk_start_01', challengeId: created.challengeId,
            rulesetId: V9_RULESET_ID, automationId: 'wp-015d3b-v9d-v1', inputSequence: 0,
            expectedTurn: 0, expectedPhase: 'action', inputEpoch: 0, intent: { type: 'walk_start', direction: 1 }
        });
        assert.equal(started.ok, true);
        const state = registry.activeSnapshotV9(owner)!.simulation;
        const foreignResponse = await registry.cancelInputV9(foreign, {
            requestId: 'v9_neutral_foreign_01', challengeId: created.challengeId,
            rulesetId: V9_RULESET_ID, automationId: 'wp-015d3b-v9d-v1', expectedTurn: state.turn, inputEpoch: state.inputEpoch
        });
        assert.equal(foreignResponse.ok, false);
        assert.equal(foreignResponse.nextInputSequence, 0);
        const cancelled = await registry.cancelInputV9(owner, {
            requestId: 'v9_neutral_cancel_01', challengeId: created.challengeId,
            rulesetId: V9_RULESET_ID, automationId: 'wp-015d3b-v9d-v1', expectedTurn: state.turn, inputEpoch: state.inputEpoch
        });
        assert.equal(cancelled.ok, true);
        assert.equal(cancelled.nextInputSequence, 1);
        const replay = registry.replayForChallengeV9(owner, created.challengeId)!;
        assert.equal(replay.records.some(record => record.operation.kind === 'barrier' && record.operation.barrier.reason === 'cancel'), true);
        const staleRelease = await registry.releaseInputV9(owner, {
            requestId: 'v9_neutral_release_01', challengeId: created.challengeId,
            rulesetId: V9_RULESET_ID, automationId: 'wp-015d3b-v9d-v1', expectedTurn: state.turn, inputEpoch: state.inputEpoch
        });
        assert.equal(staleRelease.ok, true);
        assert.equal(staleRelease.nextInputSequence, 1);
    } finally { registry.dispose(); }
});

async function start(options: Parameters<typeof createRuntimeServer>[0] = {}) {
    const runtime = createRuntimeServer({ allowMissingOrigin: true, ...options });
    const port = await runtime.listen();
    return { runtime, url: `http://127.0.0.1:${port}` };
}

function connect(url: string, origin?: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
        const socket = connectClient(url, {
            transports: ['websocket'],
            reconnection: false,
            timeout: 1_000,
            extraHeaders: origin ? { Origin: origin } : undefined
        });
        const timer = setTimeout(() => {
            socket.close();
            reject(new Error('Socket connection timed out.'));
        }, 2_000);
        socket.once('connect', () => {
            clearTimeout(timer);
            resolve(socket);
        });
        socket.once('connect_error', (error) => {
            clearTimeout(timer);
            socket.close();
            reject(error);
        });
    });
}

function rejectedConnection(
    url: string,
    origin?: string,
    extraHeaders: Record<string, string> = {}
): Promise<void> {
    return new Promise((resolve, reject) => {
        const socket = connectClient(url, {
            transports: ['websocket'],
            reconnection: false,
            timeout: 1_000,
            extraHeaders: { ...extraHeaders, ...(origin ? { Origin: origin } : {}) }
        });
        const timer = setTimeout(() => {
            socket.close();
            reject(new Error('Hostile origin was not rejected in time.'));
        }, 2_000);
        socket.once('connect', () => {
            clearTimeout(timer);
            socket.close();
            reject(new Error('Hostile origin connected.'));
        });
        socket.once('connect_error', () => {
            clearTimeout(timer);
            socket.close();
            resolve();
        });
    });
}

function emitAck(socket: Socket, event: string, payload: unknown): Promise<Ack> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error(`Acknowledgement timed out for ${event}.`)),
            1_500
        );
        socket.emit(event, payload, (response: Ack) => {
            clearTimeout(timer);
            resolve(response);
        });
    });
}

async function openSession(socket: Socket, requestId = 'session_01') {
    const ack = await emitAck(socket, protocolEvents.sessionOpen, {
        requestId,
        action: 'create'
    });
    assert.equal(ProtocolSuccessAckSchema(SessionOpenDataSchema).safeParse(ack).success, true);
    assert.equal(ack.ok, true);
    return ack.data;
}

async function closeAll(runtime: RuntimeServer, sockets: Socket[]) {
    for (const socket of sockets) {
        socket.close();
    }
    await runtime.close();
}

test('runtime allows configured origins and rejects hostile origins', async () => {
    const { runtime, url } = await start({ allowedOrigins: ['https://allowed.example'] });
    const sockets: Socket[] = [];
    try {
        sockets.push(await connect(url, 'https://allowed.example'));
        await rejectedConnection(url, 'https://hostile.example');
    } finally {
        await closeAll(runtime, sockets);
    }
});

test('runtime rejects missing origins by default and expires unauthenticated sockets', async () => {
    const strictRuntime = createRuntimeServer();
    const strictPort = await strictRuntime.listen();
    try {
        await rejectedConnection(`http://127.0.0.1:${strictPort}`);
        await rejectedConnection(`http://127.0.0.1:${strictPort}`, undefined, {
            Referer: `http://127.0.0.1:${strictPort}/`,
            'Sec-Fetch-Site': 'same-origin'
        });
    } finally {
        await strictRuntime.close();
    }

    const { runtime, url } = await start({ sessionOpenTimeoutMs: 20 });
    const socket = await connect(url);
    try {
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Unauthenticated socket stayed open.')), 250);
            socket.once('disconnect', () => {
                clearTimeout(timer);
                resolve();
            });
        });
        assert.equal(socket.connected, false);
    } finally {
        await closeAll(runtime, [socket]);
    }
});

test('a lost resume acknowledgement can recover the same session with the stored token', async () => {
    let now = 1_700_000_000_000;
    const { runtime, url } = await start({
        sessionRegistry: {
            now: () => now,
            tokenRecoveryMs: 10,
            sweepIntervalMs: 60_000
        }
    });
    const sockets: Socket[] = [];
    try {
        const original = await connect(url);
        sockets.push(original);
        const opened = await openSession(original);

        const lostAckSocket = await connect(url);
        sockets.push(lostAckSocket);
        const resumed = await emitAck(lostAckSocket, protocolEvents.sessionOpen, {
            requestId: 'lost_ack_resume_01',
            action: 'resume',
            token: opened.token
        });
        assert.equal(resumed.ok, true);
        assert.equal(resumed.data.sessionId, opened.sessionId);
        lostAckSocket.close();
        await new Promise((resolve) => setTimeout(resolve, 10));
        now += 5;

        const recoveredSocket = await connect(url);
        sockets.push(recoveredSocket);
        const recovered = await emitAck(recoveredSocket, protocolEvents.sessionOpen, {
            requestId: 'lost_ack_resume_02',
            action: 'resume',
            token: opened.token
        });
        assert.equal(recovered.ok, true);
        assert.equal(recovered.data.sessionId, opened.sessionId);
        assert.notEqual(recovered.data.token, opened.token);
        assert.notEqual(recovered.data.token, resumed.data.token);
        recoveredSocket.close();
        await new Promise((resolve) => setTimeout(resolve, 10));
        now += 6;

        const expiredRecoverySocket = await connect(url);
        sockets.push(expiredRecoverySocket);
        const expiredRecovery = await emitAck(expiredRecoverySocket, protocolEvents.sessionOpen, {
            requestId: 'lost_ack_resume_03',
            action: 'resume',
            token: opened.token
        });
        assert.equal(expiredRecovery.ok, false);
        assert.equal(expiredRecovery.error.code, 'SESSION_EXPIRED');
    } finally {
        await closeAll(runtime, sockets);
    }
});

test('temporary disconnect preserves room membership until session rebind', async () => {
    const { runtime, url } = await start();
    const sockets: Socket[] = [];
    try {
        const original = await connect(url);
        sockets.push(original);
        const opened = await openSession(original);
        const roomId = (await (await fetch(`${url}/.room.join_id`)).text()).trim();
        assert.equal((await emitAck(original, 'client:room#join', {
            requestId: 'grace_room_join_01',
            roomId
        })).ok, true);
        original.close();
        await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal((await (await fetch(
            `${url}/.room.get_players/id=${roomId}`
        )).json()).length, 1);

        const resumedSocket = await connect(url);
        sockets.push(resumedSocket);
        const resumed = await emitAck(resumedSocket, protocolEvents.sessionOpen, {
            requestId: 'grace_resume_01',
            action: 'resume',
            token: opened.token
        });
        assert.equal(resumed.ok, true);
        assert.equal((await emitAck(resumedSocket, 'client:room#join', {
            requestId: 'grace_room_join_02',
            roomId
        })).ok, true);
        assert.equal((await (await fetch(
            `${url}/.room.get_players/id=${roomId}`
        )).json()).length, 1);
    } finally {
        await closeAll(runtime, sockets);
    }
});

test('resuming into a different room removes the old authoritative membership', async () => {
    const { runtime, url } = await start();
    const sockets: Socket[] = [];
    try {
        const original = await connect(url);
        sockets.push(original);
        const opened = await openSession(original);
        const firstRoomId = (await (await fetch(`${url}/.room.join_id`)).text()).trim();
        const secondRoomId = new Room().id;
        assert.equal((await emitAck(original, 'client:room#join', {
            requestId: 'move_room_join_01',
            roomId: firstRoomId
        })).ok, true);
        original.close();
        await new Promise((resolve) => setTimeout(resolve, 10));

        const resumedSocket = await connect(url);
        sockets.push(resumedSocket);
        assert.equal((await emitAck(resumedSocket, protocolEvents.sessionOpen, {
            requestId: 'move_room_resume_01',
            action: 'resume',
            token: opened.token
        })).ok, true);
        assert.equal((await emitAck(resumedSocket, 'client:room#join', {
            requestId: 'move_room_join_02',
            roomId: secondRoomId
        })).ok, true);

        const firstPlayers = await (await fetch(
            `${url}/.room.get_players/id=${firstRoomId}`
        )).json();
        const secondPlayers = await (await fetch(
            `${url}/.room.get_players/id=${secondRoomId}`
        )).json();
        assert.deepEqual(firstPlayers, []);
        assert.equal(secondPlayers.length, 1);
    } finally {
        await closeAll(runtime, sockets);
    }
});

test('session tokens are opaque, rotate on resume, and invalidate the old token', async () => {
    const { runtime, url } = await start();
    const sockets: Socket[] = [];
    try {
        const first = await connect(url);
        sockets.push(first);
        const opened = await openSession(first);
        assert.notEqual(opened.token, first.id);
        assert.notEqual(opened.sessionId, first.id);
        const originalToken = opened.token;
        const sessionId = opened.sessionId;
        const roomId = (await (await fetch(`${url}/.room.join_id`)).text()).trim();
        const initialRoomJoin = await emitAck(first, 'client:room#join', {
            requestId: 'resume_room_01',
            roomId
        });
        assert.equal(initialRoomJoin.ok, true);
        const replaced = new Promise<void>((resolve) => first.once('disconnect', () => resolve()));

        const resumedSocket = await connect(url);
        sockets.push(resumedSocket);
        const resumed = await emitAck(resumedSocket, protocolEvents.sessionOpen, {
            requestId: 'session_02',
            action: 'resume',
            token: originalToken
        });
        assert.equal(ProtocolSuccessAckSchema(SessionOpenDataSchema).safeParse(resumed).success, true);
        assert.equal(resumed.data.resumed, true);
        assert.equal(resumed.data.sessionId, sessionId);
        assert.notEqual(resumed.data.token, originalToken);
        await replaced;
        assert.equal(first.connected, false);
        const reboundRoom = await emitAck(resumedSocket, 'client:room#join', {
            requestId: 'resume_room_02',
            roomId
        });
        assert.equal(reboundRoom.ok, true);

        const staleSocket = await connect(url);
        sockets.push(staleSocket);
        const stale = await emitAck(staleSocket, protocolEvents.sessionOpen, {
            requestId: 'session_03',
            action: 'resume',
            token: originalToken
        });
        assert.equal(ProtocolFailureAckSchema.safeParse(stale).success, true);
        assert.equal(stale.error.code, 'SESSION_EXPIRED');
    } finally {
        await closeAll(runtime, sockets);
    }
});

test('legacy adapters require a bound session and reject caller-supplied identity', async () => {
    const { runtime, url } = await start();
    const socket = await connect(url);
    try {
        const unauthenticated = await emitAck(socket, 'client:room#join', {
            requestId: 'legacy_unauth_01',
            roomId: 'not-a-room'
        });
        assert.equal(unauthenticated.ok, false);

        await openSession(socket);
        const roomId = (await (await fetch(`${url}/.room.join_id`)).text()).trim();
        const forgedRoom = await emitAck(socket, 'client:room#join', {
            requestId: 'legacy_forge_01',
            roomId,
            socketId: 'caller-controlled'
        });
        assert.equal(forgedRoom.ok, false);
        assert.equal(forgedRoom.error.code, 'BAD_REQUEST');

        const joined = await emitAck(socket, 'client:room#join', {
            requestId: 'legacy_join_01',
            roomId
        });
        assert.equal(joined.ok, true);
        assert.equal(typeof joined.data.me, 'string');

        const forgedGame = await emitAck(socket, 'client:game#join', {
            requestId: 'legacy_game_01',
            gameId: roomId,
            socketId: socket.id
        });
        assert.equal(forgedGame.ok, false);
        assert.equal(forgedGame.error.code, 'BAD_REQUEST');
    } finally {
        await closeAll(runtime, [socket]);
    }
});

test('malformed, extra, and oversized events fail closed without echoing secrets', async () => {
    const { runtime, url } = await start();
    const socket = await connect(url);
    try {
        await openSession(socket);
        const extra = await emitAck(socket, protocolEvents.challengeCreate, {
            requestId: 'malformed_01',
            sequence: 0,
            mode: 'practice',
            calling: 'wizard',
            token: 'must-not-be-echoed'
        });
        assert.equal(ProtocolFailureAckSchema.safeParse(extra).success, true);
        assert.equal(extra.error.code, 'BAD_REQUEST');
        assert.doesNotMatch(JSON.stringify(extra), /must-not-be-echoed/);

        const malformed = await emitAck(socket, protocolEvents.commandSubmit, null);
        assert.equal(malformed.error.code, 'BAD_REQUEST');

        const malformedId = await emitAck(socket, protocolEvents.sessionOpen, {
            requestId: '!',
            action: 'create'
        });
        assert.equal(ProtocolFailureAckSchema.safeParse(malformedId).success, true);
        assert.equal(malformedId.requestId, 'invalid-request');

        const oversized = await emitAck(socket, protocolEvents.challengeCreate, {
            requestId: 'oversize_01',
            sequence: 0,
            mode: 'practice',
            calling: 'wizard',
            padding: 'x'.repeat(13 * 1024)
        });
        assert.equal(oversized.error.code, 'PAYLOAD_TOO_LARGE');
        assert.doesNotMatch(JSON.stringify(oversized), /x{64}/);
    } finally {
        await closeAll(runtime, [socket]);
    }
});

test('pending connection and oversized-invalid budgets fail closed', async () => {
    const { runtime, url } = await start({
        maxPendingConnections: 1,
        sessionOpenTimeoutMs: 500
    });
    const first = await connect(url);
    const second = connectClient(url, {
        transports: ['websocket'],
        reconnection: false
    });
    try {
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Excess pending connection survived.')), 250);
            second.once('disconnect', () => {
                clearTimeout(timer);
                resolve();
            });
            second.once('connect_error', () => {
                clearTimeout(timer);
                resolve();
            });
        });

        await openSession(first);
        const disconnected = new Promise<void>((resolve) => first.once('disconnect', () => resolve()));
        for (let index = 0; index < 5; index += 1) {
            const response = await emitAck(first, protocolEvents.challengeCreate, {
                requestId: `oversized_${index}`,
                sequence: 0,
                mode: 'practice',
                calling: 'wizard',
                padding: 'x'.repeat(13 * 1024)
            });
            assert.equal(response.error.code, 'PAYLOAD_TOO_LARGE');
        }
        first.emit(protocolEvents.challengeCreate, {
            requestId: 'oversized_5',
            sequence: 0,
            mode: 'practice',
            calling: 'wizard',
            padding: 'x'.repeat(13 * 1024)
        });
        await disconnected;
        assert.equal(first.connected, false);
    } finally {
        second.close();
        await closeAll(runtime, [first]);
    }
});

test('unconfigured identity and reward challenges remain unavailable', async () => {
    const { runtime, url } = await start();
    const socket = await connect(url);
    try {
        await openSession(socket);
        const identity = await emitAck(socket, protocolEvents.identityBegin, {
            requestId: 'identity_disabled_001',
            address: 'NQ46 KLJE 5TMF 4Y1A 1255 CJHJ YG1S H0NU T604'
        });
        assert.equal(identity.ok, false);
        assert.equal(identity.error.code, 'FEATURE_UNAVAILABLE');
        const reward = await emitAck(socket, protocolEvents.challengeCreate, {
            requestId: 'reward_001',
            sequence: 0,
            mode: 'reward',
            calling: 'thief',
            eligibility: {
                challengeId: 'reward_challenge_01',
                token: 'e'.repeat(43)
            }
        });
        assert.equal(ProtocolFailureAckSchema.safeParse(reward).success, true);
        assert.equal(reward.error.code, 'REWARD_UNAVAILABLE');

        const practice = await emitAck(socket, protocolEvents.challengeCreate, {
            requestId: 'practice_01',
            sequence: 0,
            mode: 'practice',
            calling: 'thief'
        });
        assert.equal(ProtocolSuccessAckSchema(ChallengeSnapshotSchema).safeParse(practice).success, true);
        assert.equal(practice.data.mode, 'practice');
    } finally {
        await closeAll(runtime, [socket]);
    }
});

test('ordered commands are idempotent and reject conflicts, gaps, and stale sequences', async () => {
    const { runtime, url } = await start();
    const socket = await connect(url);
    try {
        await openSession(socket);
        const created = await emitAck(socket, protocolEvents.challengeCreate, {
            requestId: 'practice_01',
            sequence: 0,
            mode: 'practice',
            calling: 'warrior'
        });
        const command = {
            requestId: 'command_01',
            sequence: 1,
            challengeId: created.data.challengeId,
            expectedTurn: 0,
            command: { type: 'move', direction: 1 }
        };
        const accepted = await emitAck(socket, protocolEvents.commandSubmit, command);
        assert.equal(accepted.ok, true);
        assert.equal(accepted.data.revision, 1);

        const duplicate = await emitAck(socket, protocolEvents.commandSubmit, command);
        assert.deepEqual(duplicate, accepted);

        const conflict = await emitAck(socket, protocolEvents.commandSubmit, {
            ...command,
            command: { type: 'move', direction: -1 }
        });
        assert.equal(conflict.error.code, 'REPLAY_CONFLICT');

        const gap = await emitAck(socket, protocolEvents.commandSubmit, {
            requestId: 'command_03',
            sequence: 3,
            challengeId: created.data.challengeId,
            expectedTurn: 0,
            command: { type: 'fire' }
        });
        assert.equal(gap.error.code, 'SEQUENCE_GAP');

        const stale = await emitAck(socket, protocolEvents.commandSubmit, {
            requestId: 'command_00',
            sequence: 0,
            challengeId: created.data.challengeId,
            expectedTurn: 0,
            command: { type: 'fire' }
        });
        assert.equal(stale.error.code, 'STALE_SEQUENCE');

        const next = await emitAck(socket, protocolEvents.commandSubmit, {
            requestId: 'command_02',
            sequence: 2,
            challengeId: created.data.challengeId,
            expectedTurn: 0,
            command: { type: 'aim', angleMilliDegrees: 45_000, powerPermille: 700 }
        });
        assert.equal(next.ok, true);
        assert.equal(next.data.revision, 2);
    } finally {
        await closeAll(runtime, [socket]);
    }
});

test('challenge expiry emits one terminal result and remains consistently closed', async () => {
    let now = 1_700_000_000_000;
    const { runtime, url } = await start({
        sessionRegistry: {
            now: () => now,
            challengeTtlMs: 10,
            sweepIntervalMs: 60_000
        }
    });
    const socket = await connect(url);
    try {
        await openSession(socket);
        const created = await emitAck(socket, protocolEvents.challengeCreate, {
            requestId: 'expiry_create_01',
            sequence: 0,
            mode: 'practice',
            calling: 'wizard'
        });
        const expiredResult = new Promise<any>((resolve) => {
            socket.once(protocolEvents.result, resolve);
        });
        now += 11;
        runtime.sessions.sweep();
        const result = await expiredResult;
        assert.equal(ChallengeResultSchema.safeParse(result).success, true);
        assert.equal(result.challengeId, created.data.challengeId);
        assert.equal(result.outcome, 'expired');
        assert.equal(result.revision, 1);

        const command = await emitAck(socket, protocolEvents.commandSubmit, {
            requestId: 'expiry_command_01',
            sequence: 1,
            challengeId: created.data.challengeId,
            expectedTurn: 0,
            command: { type: 'fire' }
        });
        assert.equal(command.ok, false);
        assert.equal(command.error.code, 'CHALLENGE_CLOSED');
    } finally {
        await closeAll(runtime, [socket]);
    }
});

test('creating after elapsed challenge expiry emits once and retains a closed tombstone', async () => {
    let now = 1_700_000_000_000;
    const { runtime, url } = await start({
        sessionRegistry: {
            now: () => now,
            challengeTtlMs: 10,
            sweepIntervalMs: 60_000
        }
    });
    const socket = await connect(url);
    try {
        await openSession(socket);
        const first = await emitAck(socket, protocolEvents.challengeCreate, {
            requestId: 'rollover_create_01',
            sequence: 0,
            mode: 'practice',
            calling: 'wizard'
        });
        const results: any[] = [];
        socket.on(protocolEvents.result, (result) => results.push(result));
        now += 11;
        const second = await emitAck(socket, protocolEvents.challengeCreate, {
            requestId: 'rollover_create_02',
            sequence: 1,
            mode: 'practice',
            calling: 'thief'
        });
        assert.equal(second.ok, true);
        assert.notEqual(second.data.challengeId, first.data.challengeId);
        assert.equal(results.length, 1);
        assert.equal(results[0].challengeId, first.data.challengeId);
        assert.equal(results[0].outcome, 'expired');
        assert.equal(results[0].nextSequence, second.data.nextSequence);

        const oldCommand = await emitAck(socket, protocolEvents.commandSubmit, {
            requestId: 'rollover_command_01',
            sequence: 2,
            challengeId: first.data.challengeId,
            expectedTurn: 0,
            command: { type: 'fire' }
        });
        assert.equal(oldCommand.ok, false);
        assert.equal(oldCommand.error.code, 'CHALLENGE_CLOSED');
        runtime.sessions.sweep();
        assert.equal(results.length, 1);
    } finally {
        await closeAll(runtime, [socket]);
    }
});

test('a started room cannot reappear as a joinable phantom lobby', async () => {
    const { runtime, url } = await start();
    const sockets: Socket[] = [];
    try {
        const roomId = (await (await fetch(`${url}/.room.join_id`)).text()).trim();
        for (let index = 0; index < 4; index += 1) {
            const socket = await connect(url);
            sockets.push(socket);
            await openSession(socket, `phantom_session_${index}`);
            assert.equal((await emitAck(socket, 'client:room#join', {
                requestId: `phantom_join_${index}`,
                roomId
            })).ok, true);
            assert.equal((await emitAck(socket, 'client:room#ready', {
                requestId: `phantom_ready_${index}`,
                ready: true
            })).ok, true);
        }
        const started = new Promise<{ gameId: string }>((resolve) => {
            sockets[0].once('server:game#start', resolve);
        });
        assert.equal((await emitAck(sockets[0], 'client:room#start', {
            requestId: 'phantom_start_01'
        })).ok, true);
        assert.equal((await started).gameId, roomId);

        assert.equal((await emitAck(sockets[0], 'client:room#leave', {
            requestId: 'phantom_leave_01'
        })).ok, true);
        const canJoin = await (await fetch(`${url}/.room.can_join/id=${roomId}`)).json();
        assert.equal(canJoin.response, false);

        const newRoomId = new Room().id;
        const secondLobby = await emitAck(sockets[0], 'client:room#join', {
            requestId: 'phantom_second_lobby_01',
            roomId: newRoomId
        });
        assert.equal(secondLobby.ok, true);
        assert.equal(secondLobby.data.activeGameId, roomId);
        assert.deepEqual(await (await fetch(
            `${url}/.room.get_players/id=${newRoomId}`
        )).json(), []);
    } finally {
        await closeAll(runtime, sockets);
    }
});

test('an offline room member resumes directly into a game started in their absence', async () => {
    const { runtime, url } = await start();
    const sockets: Socket[] = [];
    try {
        const roomId = (await (await fetch(`${url}/.room.join_id`)).text()).trim();
        const sessions: any[] = [];
        for (let index = 0; index < 4; index += 1) {
            const socket = await connect(url);
            sockets.push(socket);
            sessions.push(await openSession(socket, `offline_game_session_${index}`));
            assert.equal((await emitAck(socket, 'client:room#join', {
                requestId: `offline_game_join_${index}`,
                roomId
            })).ok, true);
            assert.equal((await emitAck(socket, 'client:room#ready', {
                requestId: `offline_game_ready_${index}`,
                ready: true
            })).ok, true);
        }

        sockets[1].close();
        await new Promise((resolve) => setTimeout(resolve, 10));
        const started = new Promise<{ gameId: string }>((resolve) => {
            sockets[0].once('server:game#start', resolve);
        });
        assert.equal((await emitAck(sockets[0], 'client:room#start', {
            requestId: 'offline_game_start_01'
        })).ok, true);
        assert.equal((await started).gameId, roomId);

        const resumedSocket = await connect(url);
        sockets.push(resumedSocket);
        assert.equal((await emitAck(resumedSocket, protocolEvents.sessionOpen, {
            requestId: 'offline_game_resume_01',
            action: 'resume',
            token: sessions[1].token
        })).ok, true);
        const redirect = await emitAck(resumedSocket, 'client:room#join', {
            requestId: 'offline_game_room_rebind_01',
            roomId
        });
        assert.equal(redirect.ok, true);
        assert.equal(redirect.data.activeGameId, roomId);
        const reboundGame = await emitAck(resumedSocket, 'client:game#join', {
            requestId: 'offline_game_rebind_01',
            gameId: redirect.data.activeGameId
        });
        assert.equal(reboundGame.ok, true);
    } finally {
        await closeAll(runtime, sockets);
    }
});

test('event floods are rate limited without disconnecting a valid session', async () => {
    const { runtime, url } = await start();
    const socket = await connect(url);
    try {
        await openSession(socket);
        const requests = Array.from({ length: 60 }, (_, index) => emitAck(
            socket,
            protocolEvents.challengeCreate,
            {
                requestId: `flood_${String(index).padStart(3, '0')}`,
                sequence: 0,
                mode: 'practice',
                calling: 'wizard'
            }
        ));
        const responses = await Promise.all(requests);
        assert.equal(responses.some(
            (response) => !response.ok && response.error.code === 'RATE_LIMITED'
        ), true);
        assert.equal(socket.connected, true);
    } finally {
        await closeAll(runtime, [socket]);
    }
});

test('disconnect expiry and runtime close release session and server state', async () => {
    let now = 1_700_000_000_000;
    const { runtime, url } = await start({
        sessionRegistry: {
            now: () => now,
            reconnectGraceMs: 10,
            sweepIntervalMs: 60_000
        }
    });
    const socket = await connect(url);
    await openSession(socket);
    assert.equal(runtime.sessions.size, 1);
    socket.close();
    await new Promise((resolve) => setTimeout(resolve, 20));
    now += 11;
    runtime.sessions.sweep();
    assert.equal(runtime.sessions.size, 0);

    await runtime.close();
    await runtime.close();
    assert.equal(runtime.httpServer.listening, false);
});

test('live session expiry disconnects the socket and tears down legacy membership', async () => {
    let now = 1_700_000_000_000;
    const { runtime, url } = await start({
        sessionRegistry: {
            now: () => now,
            sessionTtlMs: 10,
            sweepIntervalMs: 60_000
        }
    });
    const socket = await connect(url);
    try {
        const opened = await openSession(socket);
        const roomId = (await (await fetch(`${url}/.room.join_id`)).text()).trim();
        assert.equal((await emitAck(socket, 'client:room#join', {
            requestId: 'expiry_room_01',
            roomId
        })).ok, true);
        const defensiveDuplicateRoom = new Room();
        assert.equal(defensiveDuplicateRoom.add_player(opened.sessionId), true);
        const duplicateGameRoomOne = new Room();
        const duplicateGameRoomTwo = new Room();
        assert.equal(duplicateGameRoomOne.add_player(opened.sessionId), true);
        assert.equal(duplicateGameRoomTwo.add_player(opened.sessionId), true);
        new Game(duplicateGameRoomOne);
        new Game(duplicateGameRoomTwo);
        assert.equal(GameWatcher.instance.hasPlayer(opened.sessionId), true);
        const disconnected = new Promise<void>((resolve) => socket.once('disconnect', () => resolve()));
        now += 11;
        runtime.sessions.sweep();
        await disconnected;
        assert.equal(runtime.sessions.size, 0);
        const players = await (await fetch(`${url}/.room.get_players/id=${roomId}`)).json();
        assert.deepEqual(players, []);
        const duplicatePlayers = await (await fetch(
            `${url}/.room.get_players/id=${defensiveDuplicateRoom.id}`
        )).json();
        assert.deepEqual(duplicatePlayers, []);
        assert.equal(GameWatcher.instance.hasPlayer(opened.sessionId), false);
    } finally {
        await closeAll(runtime, [socket]);
    }
});

test('session closure cleans legacy membership even before replacement rebind', async () => {
    let now = 1_700_000_000_000;
    const { runtime, url } = await start({
        sessionRegistry: {
            now: () => now,
            reconnectGraceMs: 10,
            sweepIntervalMs: 60_000
        }
    });
    const original = await connect(url);
    const sockets = [original];
    try {
        const opened = await openSession(original);
        const roomId = (await (await fetch(`${url}/.room.join_id`)).text()).trim();
        assert.equal((await emitAck(original, 'client:room#join', {
            requestId: 'orphan_room_01',
            roomId
        })).ok, true);

        const replacement = await connect(url);
        sockets.push(replacement);
        const resumed = await emitAck(replacement, protocolEvents.sessionOpen, {
            requestId: 'orphan_resume_01',
            action: 'resume',
            token: opened.token
        });
        assert.equal(resumed.ok, true);
        replacement.close();
        await new Promise((resolve) => setTimeout(resolve, 10));
        now += 11;
        runtime.sessions.sweep();

        const players = await (await fetch(`${url}/.room.get_players/id=${roomId}`)).json();
        assert.deepEqual(players, []);
    } finally {
        await closeAll(runtime, sockets);
    }
});

test('protocol commands mutate authoritative simulation once and reconstruct from replay', async () => {
    const { runtime, url } = await start({
        sessionRegistry: { seedSource: () => 1, simulationTickIntervalMs: false }
    });
    const socket = await connect(url);
    try {
        await openSession(socket);
        const created = await emitAck(socket, protocolEvents.challengeCreate, {
            requestId: 'simulation_create_01',
            sequence: 0,
            mode: 'practice',
            calling: 'wizard'
        });
        assert.equal(ChallengeSnapshotSchema.safeParse(created.data).success, true);
        assert.equal(created.data.simulation.rulesetId, 'nimble-knots-artillery-v7');
        assert.equal(created.data.simulation.rulesetVersion, 7);
        assert.equal(created.data.loomkeeperPolicyId, 'nimble-knots-loomkeeper-v2');
        assert.ok(Buffer.byteLength(JSON.stringify(created.data), 'utf8') <= 8 * 1024);
        const initialHash = created.data.stateHash;
        const initialRevision = created.data.revision;

        const late = await emitAck(socket, protocolEvents.commandSubmit, {
            requestId: 'simulation_late_01',
            sequence: 1,
            challengeId: created.data.challengeId,
            expectedTurn: 2,
            command: { type: 'move', direction: 1 }
        });
        assert.equal(late.ok, false);
        assert.equal(late.error.code, 'LATE_TURN');

        const movedPayload = {
            requestId: 'simulation_move_01',
            sequence: 2,
            challengeId: created.data.challengeId,
            expectedTurn: 0,
            command: { type: 'move', direction: 1 }
        };
        const moved = await emitAck(socket, protocolEvents.commandSubmit, movedPayload);
        assert.equal(moved.ok, true);
        assert.notEqual(moved.data.stateHash, initialHash);
        assert.equal(moved.data.revision, initialRevision + 1);
        assert.equal(moved.data.simulation.units[0].x, created.data.simulation.units[0].x + 8);
        const duplicate = await emitAck(socket, protocolEvents.commandSubmit, movedPayload);
        assert.deepEqual(duplicate, moved);

        const selected = await emitAck(socket, protocolEvents.commandSubmit, {
            requestId: 'simulation_relic_01',
            sequence: 3,
            challengeId: created.data.challengeId,
            expectedTurn: 0,
            command: { type: 'select_relic', relicId: 'spoolburst' }
        });
        assert.equal(selected.ok, true);
        assert.equal(selected.data.simulation.selectedRelic, 'spoolburst');
        assert.equal(ChallengeSnapshotSchema.safeParse(selected.data).success, true);

        const session = runtime.sessions.getBound(socket.id!);
        assert.ok(session);
        const replay = runtime.sessions.replayForChallenge(session, created.data.challengeId);
        assert.ok(replay);
        assert.equal(replay.records.length, 2);
        const verifier = new SimulationCoordinator();
        try {
            const reconstructed = verifier.reconstructAndVerify(replay);
            assert.equal(reconstructed.stateHash, selected.data.stateHash);
        } finally {
            verifier.dispose();
        }
    } finally {
        await closeAll(runtime, [socket]);
    }
});

test('deterministic Practice seed cycling is isolated per session', () => {
    const seeds = [1, 0xDEADBEEF];
    const calls: { sessionId: string; practiceIndex: number }[] = [];
    const registry = new SessionRegistry({
        simulationTickIntervalMs: false,
        seedSource: (sessionId, practiceIndex) => {
            calls.push({ sessionId, practiceIndex });
            return seeds[practiceIndex % seeds.length];
        }
    });
    try {
        assert.equal('code' in registry.create('seed-socket-a'), false);
        assert.equal('code' in registry.create('seed-socket-b'), false);
        const sessionA = registry.getBound('seed-socket-a');
        const sessionB = registry.getBound('seed-socket-b');
        assert.ok(sessionA);
        assert.ok(sessionB);

        const firstA = registry.createChallenge(sessionA, 'practice', 'wizard');
        assert.equal('code' in firstA, false);
        if ('code' in firstA) return;
        assert.equal(firstA.simulation.seed, seeds[0]);
        registry.leaveChallenge(sessionA, firstA.challengeId);

        const secondA = registry.createChallenge(sessionA, 'practice', 'wizard');
        assert.equal('code' in secondA, false);
        if ('code' in secondA) return;
        assert.equal(secondA.simulation.seed, seeds[1]);

        const firstB = registry.createChallenge(sessionB, 'practice', 'wizard');
        assert.equal('code' in firstB, false);
        if ('code' in firstB) return;
        assert.equal(firstB.simulation.seed, seeds[0]);
        assert.deepEqual(calls, [
            { sessionId: sessionA.id, practiceIndex: 0 },
            { sessionId: sessionA.id, practiceIndex: 1 },
            { sessionId: sessionB.id, practiceIndex: 0 }
        ]);
    } finally {
        registry.dispose();
    }
});

test('player fire produces one automated Loomkeeper resolution and records only its chosen plan', async () => {
    const { runtime, url } = await start({
        sessionRegistry: { seedSource: () => 1, simulationTickIntervalMs: false }
    });
    const socket = await connect(url);
    try {
        await openSession(socket);
        const created = await emitAck(socket, protocolEvents.challengeCreate, {
            requestId: 'ai_create_01', sequence: 0,
            mode: 'practice', calling: 'wizard'
        });
        await emitAck(socket, protocolEvents.commandSubmit, {
            requestId: 'ai_aim_01', sequence: 1,
            challengeId: created.data.challengeId, expectedTurn: 0,
            command: { type: 'aim', angleMilliDegrees: 35_000, powerPermille: 700 }
        });
        const automatedSnapshots: any[] = [];
        const automated = new Promise<any>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Loomkeeper snapshot timed out.')), 1_000);
            socket.on(protocolEvents.snapshot, (snapshot) => {
                if (snapshot.challengeId === created.data.challengeId &&
                    (snapshot.simulation.turn === 2 || snapshot.simulation.phase === 'finished')) {
                    automatedSnapshots.push(snapshot);
                    clearTimeout(timer);
                    resolve(snapshot);
                }
            });
        });
        const firePayload = {
            requestId: 'ai_fire_01', sequence: 2,
            challengeId: created.data.challengeId, expectedTurn: 0,
            command: { type: 'fire' }
        };
        const fired = await emitAck(socket, protocolEvents.commandSubmit, firePayload);
        assert.equal(fired.ok, true);
        assert.equal(fired.data.simulation.rulesetId, 'nimble-knots-artillery-v7');
        assert.equal(fired.data.simulation.rulesetVersion, 7);
        assert.equal(fired.data.simulation.activeActor, 'loomkeeper');
        assert.equal(fired.data.simulation.turn, 1);
        const reply = await automated;
        assert.equal(reply.loomkeeperPolicyId, 'nimble-knots-loomkeeper-v2');
        if (reply.simulation.phase === 'finished') {
            assert.equal(reply.simulation.activeActor, 'loomkeeper');
            assert.equal(reply.simulation.turn, 1);
        } else {
            assert.equal(reply.simulation.activeActor, 'player');
            assert.equal(reply.simulation.turn, 2);
        }

        const session = runtime.sessions.getBound(socket.id!);
        assert.ok(session);
        const replay = runtime.sessions.replayForChallenge(session, created.data.challengeId)!;
        const aiCommands = replay.records.filter(
            (record) => record.operation.kind === 'command' && record.operation.actor === 'loomkeeper'
        );
        assert.equal(aiCommands.length > 0, true);
        assert.equal(aiCommands.at(-1)?.operation.kind, 'command');
        if (aiCommands.at(-1)?.operation.kind === 'command') {
            assert.equal(aiCommands.at(-1)!.operation.command.type, 'fire');
        }

        const replayLength = replay.records.length;
        assert.deepEqual(await emitAck(socket, protocolEvents.commandSubmit, firePayload), fired);
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.equal(automatedSnapshots.length, 2);
        assert.equal(automatedSnapshots.at(-1).stateHash, reply.stateHash);
        assert.equal(automatedSnapshots.at(-1).simulation.phase, reply.simulation.phase);
        assert.equal(automatedSnapshots.at(-1).simulation.turn, reply.simulation.turn);
        assert.equal(
            runtime.sessions.replayForChallenge(session, created.data.challengeId)!.records.length,
            replayLength
        );
    } finally {
        await closeAll(runtime, [socket]);
    }
});

test('duplicate success resyncs the current transport cursor after an immutable rejection', async () => {
    const { runtime, url } = await start({
        sessionRegistry: { simulationTickIntervalMs: false }
    });
    const socket = await connect(url);
    try {
        await openSession(socket);
        const created = await emitAck(socket, protocolEvents.challengeCreate, {
            requestId: 'cursor_create_01', sequence: 0,
            mode: 'practice', calling: 'wizard'
        });
        const movePayload = {
            requestId: 'cursor_move_01', sequence: 1,
            challengeId: created.data.challengeId, expectedTurn: 0,
            command: { type: 'move', direction: -1 }
        };
        const moved = await emitAck(socket, protocolEvents.commandSubmit, movePayload);
        const rejected = await emitAck(socket, protocolEvents.commandSubmit, {
            requestId: 'cursor_reject_01', sequence: 2,
            challengeId: created.data.challengeId, expectedTurn: 0,
            command: { type: 'fire' }
        });
        assert.equal(rejected.ok, false);

        const resynced = new Promise<any>((resolve) => socket.once(protocolEvents.snapshot, resolve));
        assert.deepEqual(await emitAck(socket, protocolEvents.commandSubmit, movePayload), moved);
        const snapshot = await resynced;
        assert.equal(snapshot.stateHash, moved.data.stateHash);
        assert.equal(snapshot.nextSequence, 3);
    } finally {
        await closeAll(runtime, [socket]);
    }
});

test('duplicate success resyncs to a replacement challenge without mutating it', async () => {
    const { runtime, url } = await start({ sessionRegistry: { simulationTickIntervalMs: false } });
    const socket = await connect(url);
    try {
        await openSession(socket);
        const first = await emitAck(socket, protocolEvents.challengeCreate, {
            requestId: 'replace_create_a', sequence: 0, mode: 'practice', calling: 'wizard'
        });
        const movePayload = {
            requestId: 'replace_move_a', sequence: 1,
            challengeId: first.data.challengeId, expectedTurn: 0,
            command: { type: 'move', direction: -1 }
        };
        const moved = await emitAck(socket, protocolEvents.commandSubmit, movePayload);
        await emitAck(socket, protocolEvents.challengeLeave, {
            requestId: 'replace_leave_a', sequence: 2, challengeId: first.data.challengeId
        });
        const second = await emitAck(socket, protocolEvents.challengeCreate, {
            requestId: 'replace_create_b', sequence: 3, mode: 'practice', calling: 'thief'
        });
        const resynced = new Promise<any>((resolve) => socket.once(protocolEvents.snapshot, resolve));
        assert.deepEqual(await emitAck(socket, protocolEvents.commandSubmit, movePayload), moved);
        const snapshot = await resynced;
        assert.equal(snapshot.challengeId, second.data.challengeId);
        assert.equal(snapshot.stateHash, second.data.stateHash);
        assert.equal(snapshot.nextSequence, 4);
    } finally {
        await closeAll(runtime, [socket]);
    }
});

test('session resume emits the complete current simulation snapshot', async () => {
    const { runtime, url } = await start({
        sessionRegistry: { seedSource: () => 0xC0FFEE11, simulationTickIntervalMs: false }
    });
    const sockets: Socket[] = [];
    try {
        const original = await connect(url);
        sockets.push(original);
        const opened = await openSession(original);
        const created = await emitAck(original, protocolEvents.challengeCreate, {
            requestId: 'simulation_resume_create_01',
            sequence: 0,
            mode: 'practice',
            calling: 'thief'
        });
        const moved = await emitAck(original, protocolEvents.commandSubmit, {
            requestId: 'simulation_resume_move_01',
            sequence: 1,
            challengeId: created.data.challengeId,
            expectedTurn: 0,
            command: { type: 'move', direction: -1 }
        });
        original.close();
        await new Promise((resolve) => setTimeout(resolve, 10));

        const resumedSocket = await connect(url);
        sockets.push(resumedSocket);
        const snapshotEvent = new Promise<any>((resolve) => {
            resumedSocket.once(protocolEvents.snapshot, resolve);
        });
        const resumed = await emitAck(resumedSocket, protocolEvents.sessionOpen, {
            requestId: 'simulation_resume_session_01',
            action: 'resume',
            token: opened.token
        });
        assert.equal(resumed.ok, true);
        const rebound = await snapshotEvent;
        assert.equal(ChallengeSnapshotSchema.safeParse(rebound).success, true);
        assert.equal(rebound.stateHash, moved.data.stateHash);
        assert.deepEqual(rebound.simulation, moved.data.simulation);
        assert.equal(rebound.nextSequence, 2);
    } finally {
        await closeAll(runtime, sockets);
    }
});

test('authoritative victory emits one final result and duplicate fire is inert', async () => {
    const { runtime, url } = await start({
        sessionRegistry: {
            seedSource: () => 1,
            simulationTickIntervalMs: false,
            loomkeeperEnabled: false
        }
    });
    const socket = await connect(url);
    try {
        await openSession(socket);
        const created = await emitAck(socket, protocolEvents.challengeCreate, {
            requestId: 'victory_create_01',
            sequence: 0,
            mode: 'practice',
            calling: 'warrior'
        });
        const session = runtime.sessions.getBound(socket.id!);
        assert.ok(session);
        let sequence = 1;
        for (let shot = 1; shot <= 4; shot += 1) {
            const expectedTurn = (shot - 1) * 2;
            await emitAck(socket, protocolEvents.commandSubmit, {
                requestId: `victory_aim_0${shot}`, sequence: sequence++,
                challengeId: created.data.challengeId, expectedTurn,
                command: { type: 'aim', angleMilliDegrees: 35_000, powerPermille: 1_000 }
            });
            const fired = await emitAck(socket, protocolEvents.commandSubmit, {
                requestId: `victory_fire_0${shot}`, sequence: sequence++,
                challengeId: created.data.challengeId, expectedTurn,
                command: { type: 'fire' }
            });
            assert.equal(fired.data.status, 'active');
            const afterTimeout = runtime.sessions.advanceChallengeTicks(
                session,
                created.data.challengeId,
                SIM_RULES.turnTicks
            );
            assert.equal('code' in afterTimeout, false);
        }
        await emitAck(socket, protocolEvents.commandSubmit, {
            requestId: 'victory_aim_05', sequence: sequence++,
            challengeId: created.data.challengeId, expectedTurn: 8,
            command: { type: 'aim', angleMilliDegrees: 35_000, powerPermille: 1_000 }
        });
        const results: any[] = [];
        socket.on(protocolEvents.result, (result) => results.push(result));
        const finalPayload = {
            requestId: 'victory_fire_05', sequence,
            challengeId: created.data.challengeId, expectedTurn: 8,
            command: { type: 'fire' }
        };
        const final = await emitAck(socket, protocolEvents.commandSubmit, finalPayload);
        assert.equal(final.ok, true);
        assert.equal(final.data.status, 'completed');
        assert.equal(final.data.simulation.winner, 'player');
        await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal(results.length, 1);
        assert.equal(ChallengeResultSchema.safeParse(results[0]).success, true);
        assert.equal(results[0].outcome, 'player_win');
        assert.equal(results[0].finalStateHash, final.data.stateHash);
        assert.deepEqual(await emitAck(socket, protocolEvents.commandSubmit, finalPayload), final);
        await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal(results.length, 1);
    } finally {
        await closeAll(runtime, [socket]);
    }
});

test('resume prefers a newer active challenge over a completed tombstone', async () => {
    const { runtime, url } = await start({
        sessionRegistry: { seedSource: () => 1, simulationTickIntervalMs: false }
    });
    const sockets: Socket[] = [];
    try {
        const original = await connect(url);
        sockets.push(original);
        const opened = await openSession(original);
        const completed = await emitAck(original, protocolEvents.challengeCreate, {
            requestId: 'active_preference_create_01', sequence: 0,
            mode: 'practice', calling: 'wizard'
        });
        const session = runtime.sessions.getBound(original.id!);
        assert.ok(session);
        runtime.sessions.advanceChallengeTicks(
            session,
            completed.data.challengeId,
            SIM_RULES.turnTicks * SIM_RULES.maximumTurns
        );
        const active = await emitAck(original, protocolEvents.challengeCreate, {
            requestId: 'active_preference_create_02', sequence: 1,
            mode: 'practice', calling: 'thief'
        });
        assert.notEqual(active.data.challengeId, completed.data.challengeId);
        original.close();
        await new Promise((resolve) => setTimeout(resolve, 10));

        const resumedSocket = await connect(url);
        sockets.push(resumedSocket);
        const snapshotEvent = new Promise<any>((resolve) => {
            resumedSocket.once(protocolEvents.snapshot, resolve);
        });
        assert.equal((await emitAck(resumedSocket, protocolEvents.sessionOpen, {
            requestId: 'active_preference_resume_01', action: 'resume', token: opened.token
        })).ok, true);
        const rebound = await snapshotEvent;
        assert.equal(rebound.challengeId, active.data.challengeId);
        assert.equal(rebound.status, 'active');
    } finally {
        await closeAll(runtime, sockets);
    }
});

test('terminal transition while disconnected is delivered once on resume', async () => {
    const { runtime, url } = await start({
        sessionRegistry: { seedSource: () => 1, simulationTickIntervalMs: false }
    });
    const sockets: Socket[] = [];
    try {
        const original = await connect(url);
        sockets.push(original);
        const opened = await openSession(original);
        const created = await emitAck(original, protocolEvents.challengeCreate, {
            requestId: 'offline_terminal_create_01', sequence: 0,
            mode: 'practice', calling: 'warrior'
        });
        const session = runtime.sessions.getBound(original.id!);
        assert.ok(session);
        original.close();
        await new Promise((resolve) => setTimeout(resolve, 10));
        runtime.sessions.advanceChallengeTicks(
            session,
            created.data.challengeId,
            SIM_RULES.turnTicks * SIM_RULES.maximumTurns
        );

        const resumedSocket = await connect(url);
        sockets.push(resumedSocket);
        const snapshotEvent = new Promise<any>((resolve) => {
            resumedSocket.once(protocolEvents.snapshot, resolve);
        });
        const resultEvent = new Promise<any>((resolve) => {
            resumedSocket.once(protocolEvents.result, resolve);
        });
        assert.equal((await emitAck(resumedSocket, protocolEvents.sessionOpen, {
            requestId: 'offline_terminal_resume_01', action: 'resume', token: opened.token
        })).ok, true);
        const [snapshot, result] = await Promise.all([snapshotEvent, resultEvent]);
        assert.equal(snapshot.status, 'completed');
        assert.equal(snapshot.simulation.winner, 'draw');
        assert.equal(result.outcome, 'draw');
        assert.equal(result.finalStateHash, snapshot.stateHash);
        const reboundSession = runtime.sessions.getBound(resumedSocket.id!);
        assert.ok(reboundSession);
        assert.equal(runtime.sessions.takeChallengeResult(
            reboundSession,
            created.data.challengeId,
            snapshot.nextSequence
        ), undefined);
    } finally {
        await closeAll(runtime, sockets);
    }
});

test('simulation timeout routing targets only the owning session', async () => {
    const { runtime, url } = await start({
        sessionRegistry: {
            seedSource: () => 1,
            simulationTickIntervalMs: false,
            loomkeeperEnabled: false
        }
    });
    const first = await connect(url);
    const second = await connect(url);
    try {
        await openSession(first, 'routing_session_01');
        await openSession(second, 'routing_session_02');
        const firstChallenge = await emitAck(first, protocolEvents.challengeCreate, {
            requestId: 'routing_create_01', sequence: 0,
            mode: 'practice', calling: 'wizard'
        });
        await emitAck(second, protocolEvents.challengeCreate, {
            requestId: 'routing_create_02', sequence: 0,
            mode: 'practice', calling: 'thief'
        });
        const firstSnapshots: any[] = [];
        const secondSnapshots: any[] = [];
        first.on(protocolEvents.snapshot, (snapshot) => firstSnapshots.push(snapshot));
        second.on(protocolEvents.snapshot, (snapshot) => secondSnapshots.push(snapshot));
        const firstSession = runtime.sessions.getBound(first.id!);
        assert.ok(firstSession);
        runtime.sessions.advanceChallengeTicks(
            firstSession,
            firstChallenge.data.challengeId,
            SIM_RULES.turnTicks
        );
        await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal(firstSnapshots.length, 1);
        assert.equal(firstSnapshots[0].challengeId, firstChallenge.data.challengeId);
        assert.equal(secondSnapshots.length, 0);
    } finally {
        await closeAll(runtime, [first, second]);
    }
});

test('practice pause is authoritative, ordered, idempotent, and reconnect-safe', async () => {
    const { runtime, url } = await start({
        sessionRegistry: { seedSource: () => 1, simulationTickIntervalMs: false }
    });
    const sockets: Socket[] = [];
    try {
        const original = await connect(url);
        sockets.push(original);
        const opened = await openSession(original, 'pause_session_01');
        const created = await emitAck(original, protocolEvents.challengeCreate, {
            requestId: 'pause_create_01', sequence: 0,
            mode: 'practice', calling: 'wizard'
        });
        assert.equal(created.ok, true);
        assert.equal(created.data.paused, false);

        const pausePayload = {
            requestId: 'pause_set_01', sequence: 1,
            challengeId: created.data.challengeId, paused: true
        };
        const paused = await emitAck(original, protocolEvents.challengePause, pausePayload);
        assert.equal(paused.ok, true);
        assert.equal(paused.data.paused, true);
        assert.equal(paused.data.revision, created.data.revision + 1);
        assert.equal(paused.data.simulation.tick, created.data.simulation.tick);
        assert.deepEqual(await emitAck(original, protocolEvents.challengePause, pausePayload), paused);

        const session = runtime.sessions.getBound(original.id!);
        assert.ok(session);
        const blockedTicks = runtime.sessions.advanceChallengeTicks(
            session, created.data.challengeId, 30
        );
        assert.equal('code' in blockedTicks && blockedTicks.code, 'COMMAND_REJECTED');
        const blockedCommand = await emitAck(original, protocolEvents.commandSubmit, {
            requestId: 'pause_move_01', sequence: 2,
            challengeId: created.data.challengeId, expectedTurn: 0,
            command: { type: 'move', direction: 1 }
        });
        assert.equal(blockedCommand.ok, false);
        assert.equal(blockedCommand.error.code, 'COMMAND_REJECTED');

        original.close();
        await new Promise((resolve) => setTimeout(resolve, 10));
        const resumedSocket = await connect(url);
        sockets.push(resumedSocket);
        const snapshotEvent = new Promise<any>((resolve) => {
            resumedSocket.once(protocolEvents.snapshot, resolve);
        });
        const resumedSession = await emitAck(resumedSocket, protocolEvents.sessionOpen, {
            requestId: 'pause_resume_session_01', action: 'resume', token: opened.token
        });
        assert.equal(resumedSession.ok, true);
        const rebound = await snapshotEvent;
        assert.equal(rebound.paused, true);
        assert.equal(rebound.nextSequence, 3);

        const resumed = await emitAck(resumedSocket, protocolEvents.challengePause, {
            requestId: 'pause_set_02', sequence: 3,
            challengeId: created.data.challengeId, paused: false
        });
        assert.equal(resumed.ok, true);
        assert.equal(resumed.data.paused, false);
        assert.equal(resumed.data.revision, paused.data.revision + 1);
        const reboundSession = runtime.sessions.getBound(resumedSocket.id!);
        assert.ok(reboundSession);
        const advanced = runtime.sessions.advanceChallengeTicks(
            reboundSession, created.data.challengeId, 30
        );
        assert.equal('code' in advanced, false);
        if (!('code' in advanced)) {
            assert.equal(advanced.simulation.tick, 30);
            assert.equal(advanced.revision, resumed.data.revision + 1);
        }
    } finally {
        await closeAll(runtime, sockets);
    }
});

test('reconnect preserves a pending Loomkeeper handoff and rejects pause during it', async () => {
    const { runtime, url } = await start({
        sessionRegistry: {
            seedSource: () => 1,
            simulationTickIntervalMs: false,
            loomkeeperEnabled: false
        }
    });
    const sockets: Socket[] = [];
    try {
        const original = await connect(url);
        sockets.push(original);
        const opened = await openSession(original, 'handoff_session_01');
        const created = await emitAck(original, protocolEvents.challengeCreate, {
            requestId: 'handoff_create_01', sequence: 0,
            mode: 'practice', calling: 'thief'
        });
        await emitAck(original, protocolEvents.commandSubmit, {
            requestId: 'handoff_aim_01', sequence: 1,
            challengeId: created.data.challengeId, expectedTurn: 0,
            command: { type: 'aim', angleMilliDegrees: 35_000, powerPermille: 700 }
        });
        const fired = await emitAck(original, protocolEvents.commandSubmit, {
            requestId: 'handoff_fire_01', sequence: 2,
            challengeId: created.data.challengeId, expectedTurn: 0,
            command: { type: 'fire' }
        });
        assert.equal(fired.ok, true);
        assert.equal(fired.data.simulation.activeActor, 'loomkeeper');

        original.close();
        await new Promise((resolve) => setTimeout(resolve, 10));
        const resumedSocket = await connect(url);
        sockets.push(resumedSocket);
        const snapshotEvent = new Promise<any>((resolve) => {
            resumedSocket.once(protocolEvents.snapshot, resolve);
        });
        const resumedSession = await emitAck(resumedSocket, protocolEvents.sessionOpen, {
            requestId: 'handoff_resume_01', action: 'resume', token: opened.token
        });
        assert.equal(resumedSession.ok, true);
        const rebound = await snapshotEvent;
        assert.equal(rebound.challengeId, created.data.challengeId);
        assert.equal(rebound.stateHash, fired.data.stateHash);
        assert.equal(rebound.simulation.activeActor, 'loomkeeper');
        assert.equal(rebound.simulation.turn, 1);

        const pause = await emitAck(resumedSocket, protocolEvents.challengePause, {
            requestId: 'handoff_pause_01', sequence: 3,
            challengeId: created.data.challengeId, paused: true
        });
        assert.equal(pause.ok, false);
        assert.equal(pause.error.code, 'COMMAND_REJECTED');
        const reboundSession = runtime.sessions.getBound(resumedSocket.id!);
        assert.ok(reboundSession);
        assert.equal(runtime.sessions.activeSnapshot(reboundSession)!.paused, false);
    } finally {
        await closeAll(runtime, sockets);
    }
});
