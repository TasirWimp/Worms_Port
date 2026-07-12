import assert from 'node:assert/strict';
import test from 'node:test';

import { io as connectClient, type Socket } from 'socket.io-client';

import {
    ChallengeLeaveAckSchema,
    ProtocolFailureAckSchema,
    SessionOpenAckSchema,
    protocolEvents
} from '../../shared/protocol';
import { createRuntimeServer } from '../../server/src/runtime';

type Ack = Record<string, any>;

test('live replay-limit rejection preserves the session and permits an orderly leave', async () => {
    const runtime = createRuntimeServer({
        allowMissingOrigin: true,
        sessionRegistry: {
            simulationTickIntervalMs: false,
            simulationMaxReplayRecords: 2,
            seedSource: () => 0xC0FFEE11
        }
    });
    const port = await runtime.listen();
    const socket = await connect(`http://127.0.0.1:${port}`);
    try {
        const opened = await emitAck(socket, protocolEvents.sessionOpen, {
            requestId: 'limit_session_01', action: 'create'
        });
        assert.equal(SessionOpenAckSchema.safeParse(opened).success, true);
        assert.equal(opened.ok, true);

        const created = await emitAck(socket, protocolEvents.challengeCreate, {
            requestId: 'limit_create_01', sequence: 0,
            mode: 'practice', calling: 'wizard'
        });
        assert.equal(created.ok, true);
        const challengeId = created.data.challengeId;
        const initialTurn = created.data.simulation.turn;

        const aim = await emitAck(socket, protocolEvents.commandSubmit, {
            requestId: 'limit_aim_01', sequence: 1, challengeId,
            expectedTurn: initialTurn,
            command: { type: 'aim', angleMilliDegrees: 30_000, powerPermille: 500 }
        });
        assert.equal(aim.ok, true);
        const select = await emitAck(socket, protocolEvents.commandSubmit, {
            requestId: 'limit_select_01', sequence: 2, challengeId,
            expectedTurn: initialTurn,
            command: { type: 'select_relic', relicId: 'threadball' }
        });
        assert.equal(select.ok, true);

        const rejected = await emitAck(socket, protocolEvents.commandSubmit, {
            requestId: 'limit_move_01', sequence: 3, challengeId,
            expectedTurn: initialTurn,
            command: { type: 'move', direction: 0 }
        });
        assert.equal(ProtocolFailureAckSchema.safeParse(rejected).success, true);
        assert.equal(rejected.ok, false);
        assert.equal(rejected.error.code, 'COMMAND_REJECTED');
        assert.equal(socket.connected, true);

        const left = await emitAck(socket, protocolEvents.challengeLeave, {
            requestId: 'limit_leave_01', sequence: 4, challengeId
        });
        assert.equal(ChallengeLeaveAckSchema.safeParse(left).success, true);
        assert.equal(left.ok, true);
        assert.equal(socket.connected, true);
    } finally {
        socket.close();
        await runtime.close();
    }
});

function connect(url: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
        const socket = connectClient(url, {
            transports: ['websocket'], reconnection: false, timeout: 1_000
        });
        const timer = setTimeout(() => reject(new Error('Connection timed out.')), 2_000);
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

function emitAck(socket: Socket, event: string, payload: unknown): Promise<Ack> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Ack timed out for ${event}.`)), 1_500);
        socket.emit(event, payload, (response: Ack) => {
            clearTimeout(timer);
            resolve(response);
        });
    });
}
