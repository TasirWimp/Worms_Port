import type { Application } from 'express';
import type { Server } from 'socket.io';
import { z } from 'zod';

import { beautify } from '../util/id-gen';

import { Room } from './class';
import { dummy } from './dummy';
import { RoomWatcher } from './watcher';
import { failure, success } from '../protocol/errors';
import type { SessionRegistry } from '../session/registry';
import { GameWatcher } from '../game/watcher';

const RequestIdSchema = z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/);
const RoomIdSchema = z.string().min(1).max(96).regex(/^[A-Za-z0-9-]+$/);
const JoinSchema = z.object({ requestId: RequestIdSchema, roomId: RoomIdSchema }).strict();
const ReadySchema = z.object({ requestId: RequestIdSchema, ready: z.boolean() }).strict();
const EmptySchema = z.object({ requestId: RequestIdSchema }).strict();

export function setup_room_api(app: Application, io: Server, sessions: SessionRegistry) {
    on_room_requests(app);
    on_room_events(io, sessions);
    RoomWatcher.instance.use(io, (playerId) => sessions.socketIdForSession(playerId));
}

function on_room_requests(application: Application) {
    application
        .get('/.room.can_join/id=:room_id', (req, res) => {
            res.send({
                response: RoomWatcher.instance
                    .can_join(req.params.room_id)
            } as CheckResponse);
        })
        .get('/.room.join_id', (_, res) => {
            if (!RoomWatcher.instance.has_lobbies()) {
                new Room();
            }
            res.send(RoomWatcher.instance.join_id());
        })
        .get('/.room.get_players/id=:room_id', (req, res) => {
            res.send(RoomWatcher.instance.get(req.params.room_id).get_players());
        });
}

function on_room_events(io: Server, sessions: SessionRegistry) {
    io.on('connection', (socket) => {
        let room = dummy;
        let roomChannel: string | undefined;
        socket
            .on('client:room#join', (payload: unknown, ack?: Function) => {
                const parsed = JoinSchema.safeParse(payload);
                const session = sessions.getBound(socket.id);
                if (!parsed.success || !session || typeof ack !== 'function') {
                    ack?.(failure('invalid-request', 'BAD_REQUEST', 'Invalid legacy room join.'));
                    return;
                }
                const activeGameId = GameWatcher.instance.gameIdForPlayer(session.id);
                if (activeGameId) {
                    ack(success(parsed.data.requestId, { activeGameId }));
                    return;
                }
                if (roomChannel) {
                    socket.leave(roomChannel);
                }
                RoomWatcher.instance.removePlayerExcept(session.id, parsed.data.roomId);
                room = RoomWatcher.instance.get(parsed.data.roomId);
                const channel = parsed.data.roomId;
                roomChannel = channel;
                socket.join(channel);
                if (room.player_index(session.id) !== -1 || room.add_player(session.id)) {
                    ack(success(parsed.data.requestId, { me: beautify(session.id) }));
                } else {
                    socket.leave(channel);
                    roomChannel = undefined;
                    ack(failure(
                        parsed.data.requestId,
                        'BAD_REQUEST',
                        `Failed to join room ${parsed.data.roomId}.`
                    ));
                }
            })
            .on('client:room#ready', (payload: unknown, ack?: Function) => {
                const parsed = ReadySchema.safeParse(payload);
                const session = sessions.getBound(socket.id);
                if (!parsed.success || !session || typeof ack !== 'function') {
                    ack?.(failure('invalid-request', 'BAD_REQUEST', 'Invalid legacy ready event.'));
                    return;
                }
                room.set_ready(session.id, parsed.data.ready);
                ack(success(parsed.data.requestId, {}));
            })
            .on('client:room#leave', (payload: unknown, ack?: Function) => {
                const parsed = EmptySchema.safeParse(payload);
                const session = sessions.getBound(socket.id);
                if (!parsed.success || !session || typeof ack !== 'function') {
                    ack?.(failure('invalid-request', 'BAD_REQUEST', 'Invalid legacy leave event.'));
                    return;
                }
                room.delete_player(session.id);
                if (roomChannel) {
                    socket.leave(roomChannel);
                }
                room = dummy;
                roomChannel = undefined;
                ack(success(parsed.data.requestId, {}));
            })
            .on('client:room#start', (payload: unknown, ack?: Function) => {
                const parsed = EmptySchema.safeParse(payload);
                const session = sessions.getBound(socket.id);
                if (!parsed.success || !session || typeof ack !== 'function') {
                    ack?.(failure('invalid-request', 'BAD_REQUEST', 'Invalid legacy start event.'));
                    return;
                }
                if (room.player_index(session.id) == 0) {
                    room.start_game();
                }
                ack(success(parsed.data.requestId, {}));
            });
    });
}
