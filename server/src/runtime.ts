import express from 'express';
import http from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';

import { protocolEvents } from '../../shared/protocol';

import { setup_game_api } from './game/api';
import { setupProtocol } from './protocol/socket';
import {
    configuredOrigins,
    MAX_TRANSPORT_BYTES,
    originAllowed
} from './protocol/guards';
import { setup_room_api } from './room/api';
import { Room } from './room/class';
import { RoomWatcher } from './room/watcher';
import { Game } from './game/class';
import { GameWatcher } from './game/watcher';
import { SessionRegistry, type SessionRegistryOptions } from './session/registry';
import { init_id_generator } from './util/id-gen';

import words from '../data/id-digits.json';

export type RuntimeServerOptions = {
    clientDir?: string;
    allowedOrigins?: string[];
    sessionRegistry?: SessionRegistryOptions;
    allowMissingOrigin?: boolean;
    sessionOpenTimeoutMs?: number;
    maxPendingConnections?: number;
    sessionOpenRateCapacity?: number;
};

let legacyRuntimeActive = false;

export function createRuntimeServer(options: RuntimeServerOptions = {}) {
    if (legacyRuntimeActive) {
        throw new Error('Only one legacy lobby runtime may exist in a process.');
    }
    init_id_generator(words, 3);
    const clientDir = options.clientDir || path.join(__dirname, '../../client/build/');
    const origins = options.allowedOrigins
        ? configuredOrigins(options.allowedOrigins.join(','))
        : configuredOrigins();
    const allowMissingOrigin = options.allowMissingOrigin ??
        process.env.ALLOW_MISSING_ORIGIN === 'true';
    RoomWatcher.instance.reset();
    GameWatcher.instance.reset();
    const app = express();
    const httpServer = new http.Server(app);
    const io = new SocketIOServer(httpServer, {
        maxHttpBufferSize: MAX_TRANSPORT_BYTES,
        pingInterval: 10_000,
        pingTimeout: 10_000,
        cors: { origin: true, methods: ['GET', 'POST'] },
        allowRequest: (request, callback) => callback(
            null,
            originAllowed(request, origins, allowMissingOrigin)
        )
    });
    const callerClosedHandler = options.sessionRegistry?.onSessionClosed;
    const callerChallengeExpiredHandler = options.sessionRegistry?.onChallengeExpired;
    const callerChallengeSnapshotHandler = options.sessionRegistry?.onChallengeSnapshot;
    const callerChallengeCompletedHandler = options.sessionRegistry?.onChallengeCompleted;
    const sessions = new SessionRegistry({
        ...options.sessionRegistry,
        onSessionClosed: (sessionId, socketId) => {
            RoomWatcher.instance.removePlayer(sessionId);
            GameWatcher.instance.hidePlayer(sessionId);
            callerClosedHandler?.(sessionId, socketId);
            if (socketId) {
                io.sockets.sockets.get(socketId)?.disconnect(true);
            }
        },
        onChallengeExpired: (result, socketId) => {
            if (socketId) {
                io.sockets.sockets.get(socketId)?.emit(protocolEvents.result, result);
            }
            callerChallengeExpiredHandler?.(result, socketId);
        },
        onChallengeSnapshot: (snapshot, socketId) => {
            if (socketId) {
                io.sockets.sockets.get(socketId)?.emit(protocolEvents.snapshot, snapshot);
            }
            callerChallengeSnapshotHandler?.(snapshot, socketId);
        },
        onChallengeCompleted: (result, socketId) => {
            if (socketId) {
                io.sockets.sockets.get(socketId)?.emit(protocolEvents.result, result);
            }
            callerChallengeCompletedHandler?.(result, socketId);
        }
    });

    app.use('/.', (request, response, next) => {
        if (!originAllowed(request, origins, true)) {
            response.status(403).send({ error: 'Origin is not allowed.' });
            return;
        }
        next();
    });
    app.use('/', express.static(clientDir));
    app.get('/', (_, response) => {
        response.sendFile(path.join(clientDir, 'index.html'));
    });

    setupProtocol(io, sessions, {
        sessionOpenTimeoutMs: options.sessionOpenTimeoutMs,
        maxPendingConnections: options.maxPendingConnections,
        sessionOpenRateCapacity: options.sessionOpenRateCapacity
    });
    setup_room_api(app, io, sessions);
    setup_game_api(app, io, sessions);
    RoomWatcher.instance.on('game_started', startLegacyGame);
    legacyRuntimeActive = true;

    let closed = false;
    const close = async () => {
        if (closed) {
            return;
        }
        closed = true;
        legacyRuntimeActive = false;
        RoomWatcher.instance.off('game_started', startLegacyGame);
        RoomWatcher.instance.reset();
        GameWatcher.instance.reset();
        sessions.dispose();
        await new Promise<void>((resolve, reject) => {
            io.close(() => {
                if (!httpServer.listening) {
                    resolve();
                    return;
                }
                httpServer.close((error) => error ? reject(error) : resolve());
            });
        });
    };

    const listen = (port = 0, host = '127.0.0.1') => new Promise<number>(
        (resolve, reject) => {
            httpServer.once('error', reject);
            httpServer.listen(port, host, () => {
                httpServer.off('error', reject);
                const address = httpServer.address();
                resolve(typeof address === 'object' && address ? address.port : port);
            });
        }
    );

    return { app, httpServer, io, sessions, listen, close };
}

function startLegacyGame(room: Room): void {
    new Game(room);
}

export type RuntimeServer = ReturnType<typeof createRuntimeServer>;
