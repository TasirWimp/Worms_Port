import express from 'express';
import http from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';

import { protocolEvents } from '../../shared/protocol';

import { setup_game_api } from './game/api';
import {
    IdentityAuthorizationRegistry,
    type IdentityAuthorizationOptions
} from './identity/registry';
import { setupProtocol } from './protocol/socket';
import {
    configuredOrigins,
    MAX_TRANSPORT_BYTES,
    originAllowed
} from './protocol/guards';
import { setup_room_api } from './room/api';
import type { RewardPayoutWorker } from './reward/payout';
import type { RewardService } from './reward/service';
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
    identity?: IdentityAuthorizationOptions | false;
    rewards?: RewardService;
    rewardWorker?: RewardPayoutWorker;
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
    app.disable('x-powered-by');
    app.use((_, response, next) => {
        response.setHeader(
            'Content-Security-Policy',
            [
                "default-src 'self'",
                "base-uri 'self'",
                "object-src 'none'",
                "frame-ancestors 'none'",
                "form-action 'self'",
                "script-src 'self'",
                "style-src 'self' 'unsafe-inline'",
                "img-src 'self' data: blob:",
                "font-src 'self'",
                "connect-src 'self' ws: wss:"
            ].join('; ')
        );
        response.setHeader('Referrer-Policy', 'no-referrer');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('X-Frame-Options', 'DENY');
        response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        response.setHeader(
            'Permissions-Policy',
            'camera=(), geolocation=(), microphone=(), payment=()'
        );
        next();
    });
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
    const identity = options.identity
        ? new IdentityAuthorizationRegistry(options.identity)
        : undefined;
    let sessions!: SessionRegistry;
    const emitRewardUpdate = (update: Awaited<ReturnType<RewardService['status']>>) => {
        for (const socketId of sessions.socketIdsForWallet(update.recipient)) {
            io.sockets.sockets.get(socketId)?.emit(protocolEvents.rewardUpdate, update);
        }
    };
    const processRewardResult = (result: Parameters<NonNullable<
        SessionRegistryOptions['onChallengeCompleted']
    >>[0]) => {
        if (!options.rewards ||
            sessions.challengeMode(result.sessionId, result.challengeId) !== 'reward') return;
        const replay = sessions.replayForSessionChallenge(
            result.sessionId,
            result.challengeId
        );
        void options.rewards.completeMatch(result, replay).then((update) => {
            if (update) emitRewardUpdate(update);
        }).catch(() => {
            // The durable in-progress entitlement remains recoverable for operator review.
        });
    };
    sessions = new SessionRegistry({
        ...options.sessionRegistry,
        onSessionClosed: (sessionId, socketId) => {
            identity?.cancelSession(sessionId);
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
            processRewardResult(result);
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
            processRewardResult(result);
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
        sessionOpenRateCapacity: options.sessionOpenRateCapacity,
        identity,
        rewards: options.rewards
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
        identity?.dispose();
        await options.rewardWorker?.close();
        await options.rewards?.close();
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

    let initialized = false;
    const listen = async (port = 0, host = '127.0.0.1'): Promise<number> => {
        if (!initialized) {
            await options.rewards?.initialize();
            options.rewardWorker?.start();
            initialized = true;
        }
        return new Promise<number>((resolve, reject) => {
            httpServer.once('error', reject);
            httpServer.listen(port, host, () => {
                httpServer.off('error', reject);
                const address = httpServer.address();
                resolve(typeof address === 'object' && address ? address.port : port);
            });
        });
    };

    return {
        app,
        httpServer,
        io,
        sessions,
        identity,
        rewards: options.rewards,
        emitRewardUpdate,
        listen,
        close
    };
}

function startLegacyGame(room: Room): void {
    new Game(room);
}

export type RuntimeServer = ReturnType<typeof createRuntimeServer>;
