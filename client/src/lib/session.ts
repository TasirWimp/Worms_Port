import type { Socket } from 'socket.io-client';
import { z } from 'zod';

import {
    protocolEvents,
    PROTOCOL_VERSION,
    ProtocolFailureAckSchema,
    ProtocolSuccessAckSchema,
    SESSION_TOKEN_PATTERN,
    SessionOpenDataSchema,
    type ProtocolAck,
    type SessionOpenData,
    type SessionOpenRequest
} from '../../../shared/protocol';

const SESSION_TOKEN_KEY = 'nimble-knots.session-token';
const ACTIVE_GAME_KEY = 'nimble-knots.active-game';
const ACK_TIMEOUT_MS = 5000;
const sessionReady = new WeakMap<Socket, Promise<SessionOpenData>>();
const sessionOpening = new WeakMap<Socket, Promise<SessionOpenData>>();
const sessionReconnectRegistered = new WeakSet<Socket>();
type ActionTurnsV8Buffer = { snapshots: unknown[]; results: unknown[] };
const actionTurnsV8Buffers = new WeakMap<Socket, ActionTurnsV8Buffer>();

class SessionAckTimeout extends Error {}

const sessionAckSchema = z.union([
    ProtocolSuccessAckSchema(SessionOpenDataSchema),
    ProtocolFailureAckSchema
]);

export async function bootstrapSession (socket: Socket): Promise<SessionOpenData>
{
    // Capture the dedicated resume events before the V1 session acknowledgement.
    // These two wire names are intentionally literal: bootstrap must not import
    // the lazy V8 validator/engine into ordinary V7 startup. The adapter validates
    // every buffered value; this bounded buffer confers no combat authority.
    if (!actionTurnsV8Buffers.has(socket)) {
        const buffer: ActionTurnsV8Buffer = { snapshots: [], results: [] };
        actionTurnsV8Buffers.set(socket, buffer);
        const append = (values: unknown[], value: unknown) => {
            values.push(value);
            if (values.length > 8) values.shift();
        };
        socket.on('v8:challenge.snapshot', value => append(buffer.snapshots, value));
        socket.on('v8:challenge.result', value => append(buffer.results, value));
        socket.on('disconnect', () => { buffer.snapshots.length = 0; buffer.results.length = 0; });
    }
    await waitForConnection(socket);
    if (!sessionReconnectRegistered.has(socket)) {
        sessionReconnectRegistered.add(socket);
        socket.on('connect', () => {
            const resumed = ensureSession(socket);
            void resumed.catch((error) => {
                console.error('Failed to resume the server session after reconnect.', error);
            });
        });
    }
    return ensureSession(socket);
}

/** Drained only by the injected V8 adapter; legacy session schemas stay exact. */
export function takeActionTurnsV8SessionEvents(socket: Socket): ActionTurnsV8Buffer {
    const buffer = actionTurnsV8Buffers.get(socket);
    return buffer ? { snapshots: buffer.snapshots.splice(0), results: buffer.results.splice(0) }
        : { snapshots: [], results: [] };
}

export function whenSessionReady (socket: Socket): Promise<SessionOpenData>
{
    const ready = sessionReady.get(socket);
    if (!ready) {
        return Promise.reject(new Error('The server session has not been bootstrapped.'));
    }
    return ready;
}

export function adoptSession(socket: Socket, session: SessionOpenData): SessionOpenData
{
    sessionStorage.setItem(SESSION_TOKEN_KEY, session.token);
    const ready = Promise.resolve(structuredClone(session));
    sessionReady.set(socket, ready);
    return structuredClone(session);
}

export async function reconnectSession(socket: Socket): Promise<SessionOpenData>
{
    socket.disconnect();
    // Publish the pending readiness before connect listeners run. They must not
    // observe the previous connection's already-resolved session promise.
    const reconnecting = (async () => {
        await waitForConnection(socket);
        return ensureSession(socket);
    })();
    sessionReady.set(socket, reconnecting);
    socket.connect();
    return reconnecting;
}

export function getActiveGameId ()
{
    return sessionStorage.getItem(ACTIVE_GAME_KEY);
}

export function setActiveGameId (gameId: string)
{
    sessionStorage.setItem(ACTIVE_GAME_KEY, gameId);
}

export function clearActiveGameId ()
{
    sessionStorage.removeItem(ACTIVE_GAME_KEY);
}

function ensureSession (socket: Socket): Promise<SessionOpenData>
{
    const pending = sessionOpening.get(socket);
    if (pending) {
        return pending;
    }
    const opening = openSession(socket, true);
    sessionOpening.set(socket, opening);
    sessionReady.set(socket, opening);
    void opening.then(
        () => {
            if (sessionOpening.get(socket) === opening) {
                sessionOpening.delete(socket);
            }
        },
        () => {
            if (sessionOpening.get(socket) === opening) {
                sessionOpening.delete(socket);
            }
        }
    );
    return opening;
}

async function openSession (
    socket: Socket,
    allowAckRecovery: boolean
): Promise<SessionOpenData>
{
    const storedToken = sessionStorage.getItem(SESSION_TOKEN_KEY);
    const token = storedToken && SESSION_TOKEN_PATTERN.test(storedToken)
        ? storedToken
        : null;
    if (storedToken && !token) {
        sessionStorage.removeItem(SESSION_TOKEN_KEY);
    }
    const request = token
        ? { requestId: requestId(), action: 'resume' as const, token }
        : { requestId: requestId(), action: 'create' as const };

    let response: ProtocolAck<SessionOpenData>;
    try {
        response = await emitSessionOpen(socket, request);
    } catch (error) {
        if (request.action === 'resume' && allowAckRecovery && error instanceof SessionAckTimeout) {
            socket.disconnect();
            socket.connect();
            await waitForConnection(socket);
            return openSession(socket, false);
        }
        throw error;
    }
    if (response.ok === false) {
        if (request.action === 'resume'
            && (response.error.code === 'UNAUTHORIZED'
                || response.error.code === 'SESSION_EXPIRED')) {
            sessionStorage.removeItem(SESSION_TOKEN_KEY);
            clearActiveGameId();
            return openSession(socket, allowAckRecovery);
        }
        throw new Error(`${response.error.code}: ${response.error.message}`);
    }

    return adoptSession(socket, response.data);
}

async function emitSessionOpen (
    socket: Socket,
    request: SessionOpenRequest
): Promise<ProtocolAck<SessionOpenData>> {
    const rawAck = await new Promise<unknown>((resolve, reject) => {
        socket.timeout(ACK_TIMEOUT_MS).emit(
            protocolEvents.sessionOpen,
            request,
            (timeoutError: Error | null, ack: unknown) => {
                if (timeoutError) {
                    reject(new SessionAckTimeout(
                        'Session acknowledgement timed out after 5 seconds.'
                    ));
                } else {
                    resolve(ack);
                }
            }
        );
    });

    const parsed = sessionAckSchema.safeParse(rawAck);
    if (!parsed.success
        || parsed.data.protocolVersion !== PROTOCOL_VERSION
        || parsed.data.requestId !== request.requestId) {
        throw new Error('Server returned an invalid session acknowledgement.');
    }
    return parsed.data;
}

async function waitForConnection (socket: Socket)
{
    if (socket.connected) {
        return;
    }

    await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
            cleanup();
            reject(new Error('Socket connection timed out after 5 seconds.'));
        }, ACK_TIMEOUT_MS);
        const cleanup = () => {
            window.clearTimeout(timeout);
            socket.off('connect', onConnect);
            socket.off('connect_error', onError);
        };
        const onConnect = () => {
            cleanup();
            resolve();
        };
        const onError = (error: Error) => {
            cleanup();
            reject(error);
        };

        socket.once('connect', onConnect);
        socket.once('connect_error', onError);
    });
}

function requestId ()
{
    return crypto.randomUUID().replaceAll('-', '');
}
