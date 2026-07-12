import type { Application } from 'express';
import type { Server } from 'socket.io';
import { z } from 'zod';

import { GameWatcher } from './watcher';
import { dummy } from './dummy';
import { failure, success } from '../protocol/errors';
import type { SessionRegistry } from '../session/registry';

const RequestIdSchema = z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/);
const GameIdSchema = z.string().min(1).max(96).regex(/^[A-Za-z0-9-]+$/);
const JoinSchema = z.object({ requestId: RequestIdSchema, gameId: GameIdSchema }).strict();
const ReadySchema = z.object({ requestId: RequestIdSchema }).strict();

export function setup_game_api(_app: Application, io: Server, sessions: SessionRegistry) {
    setup_socket_events(io, sessions);
    GameWatcher.instance.use(io);
}

function setup_socket_events(io: Server, sessions: SessionRegistry) {
    io.on('connection', (socket) => {
        var game = dummy;
        socket
            .on('client:game#join', (payload: unknown, ack?: Function) => {
                const parsed = JoinSchema.safeParse(payload);
                const session = sessions.getBound(socket.id);
                if (!parsed.success || !session || typeof ack !== 'function') {
                    ack?.(failure('invalid-request', 'BAD_REQUEST', 'Invalid legacy game join.'));
                    return;
                }
                game = GameWatcher.instance.get(parsed.data.gameId);
                const channel = parsed.data.gameId;
                socket.join(channel);
                if (game.join(session.id, session.id)) {
                    ack(success(parsed.data.requestId, {
                        scheme: game.get_scheme(),
                        me: game.get_me(session.id)
                    }));
                } else {
                    socket.leave(channel);
                    ack(failure(
                        parsed.data.requestId,
                        'BAD_REQUEST',
                        `Failed to join game ${parsed.data.gameId}.`
                    ));
                }
            })
            .on('client:game#ready', (payload: unknown, ack?: Function) => {
                const parsed = ReadySchema.safeParse(payload);
                if (!parsed.success || !sessions.getBound(socket.id) || typeof ack !== 'function') {
                    ack?.(failure('invalid-request', 'BAD_REQUEST', 'Invalid legacy game ready event.'));
                    return;
                }
                const session = sessions.getBound(socket.id);
                if (session) {
                    game.set_ready(session.id);
                }
                ack(success(parsed.data.requestId, {}));
            });
    });
}
