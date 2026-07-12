/// <reference path="../../../shared/types.d.ts"/>

import { z } from 'zod';
import { ProtocolFailureAckSchema, ProtocolSuccessAckSchema } from '../../../shared/protocol';

const legacyErrorSchema = z.object({ error: z.string().min(1) }).strict();
const roomJoinAckSchema = z.union([
    legacyErrorSchema,
    z.object({ me: z.string().min(1) }).strict(),
    z.object({ activeGameId: z.string().min(1) }).strict()
]);
const playerSchemeSchema = z.object({
    relics: z.array(z.object({
        name: z.string(),
        amount: z.number(),
        delay: z.number()
    }).strict()),
    knotkin_count: z.number(),
    knotkin_stitching: z.number(),
    knotkin_names: z.array(z.array(z.string()))
}).strict();
const gameJoinAckSchema = z.union([
    legacyErrorSchema,
    z.object({
        me: z.object({}).strict(),
        scheme: z.object({
            player_limit: z.number(),
            player_scheme: playerSchemeSchema
        }).strict()
    }).strict()
]);

export function $ (id: string) {
    return document.getElementById(id);
}

export type ErrType = { error: string };

export function is_error<T> (obj: ErrType | T) : obj is ErrType {
    return (obj as ErrType).error !== undefined;
}

export async function request (
    href: string,
    type: 'blob' | 'buffer' | 'json' | 'text'
) {
    let res = await fetch(href);
    switch (type) {
        case 'text':
            return res.text();
        case 'json':
            return res.json();
        case 'blob':
            return res.blob();
        case 'buffer':
            return res.arrayBuffer();
    }
}

export function emitWithAck (
    socket: import('socket.io-client').Socket,
    event: string,
    payload: object
) {
    const requestId = crypto.randomUUID().replaceAll('-', '');
    return new Promise<unknown>((resolve, reject) => {
        socket.timeout(5000).emit(
            event,
            { ...payload, requestId },
            (timeoutError: Error | null, ack: unknown) => {
                if (timeoutError) {
                    reject(new Error(`${event} acknowledgement timed out after 5 seconds.`));
                } else {
                    const parsed = z.union([
                        ProtocolSuccessAckSchema(z.unknown()),
                        ProtocolFailureAckSchema
                    ]).safeParse(ack);
                    if (!parsed.success || parsed.data.requestId !== requestId) {
                        reject(new Error(`${event} returned an invalid acknowledgement.`));
                    } else if ('error' in parsed.data) {
                        resolve({ error: parsed.data.error.message });
                    } else {
                        resolve(parsed.data.data);
                    }
                }
            }
        );
    });
}

export function parseRoomJoinAck (
    ack: unknown
): ErrType | { me: string } | { activeGameId: string }
{
    const result = roomJoinAckSchema.safeParse(ack);
    if (!result.success) {
        throw new Error('Server returned an invalid room acknowledgement.');
    }
    return result.data;
}

export function parseGameJoinAck (
    ack: unknown
): ErrType | { me: PublicPlayerInfo, scheme: Scheme } {
    const result = gameJoinAckSchema.safeParse(ack);
    if (!result.success) {
        throw new Error('Server returned an invalid game acknowledgement.');
    }
    return result.data;
}
