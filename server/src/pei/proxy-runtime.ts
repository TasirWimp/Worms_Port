import express from 'express';
import http from 'http';
import path from 'path';

import {
    decodePeiProofV0,
    decodePeiRequestV0,
    peiProofHashV0,
    peiRequestCommitmentV0,
    type PeiProofV0,
    type PeiRequestV0
} from '../../../shared/pei-v0';
import { normalizeNimiqAddress } from '../identity/crypto';
import { requestAuthenticationMatches, type PeiRuntimeConfigV0 } from './runtime-contract';
import { verifyPeiProofV0, type PeiChainAdapterV0 } from './verifier';

export interface PeiEarnTransferV0 {
    send(request: PeiRequestV0, requestCommitment: string): Promise<string>;
    initialize?(): Promise<void>;
    close?(): Promise<void>;
}

export function createPeiProxyRuntimeV0(options: {
    clientDir: string;
    config: PeiRuntimeConfigV0;
    earnTransfer: PeiEarnTransferV0;
    chainAdapter: PeiChainAdapterV0;
    now?: () => Date;
}) {
    const app = express();
    const server = new http.Server(app);
    const now = options.now ?? (() => new Date());
    const attempts = new Map<string, Promise<string>>();
    app.disable('x-powered-by');
    app.use((_, response, next) => {
        response.setHeader('Content-Security-Policy', [
            "default-src 'self'",
            "base-uri 'none'",
            "object-src 'none'",
            "frame-ancestors 'none'",
            "form-action 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "connect-src 'self'"
        ].join('; '));
        response.setHeader('Referrer-Policy', 'no-referrer');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('X-Frame-Options', 'DENY');
        response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        response.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(), payment=()');
        next();
    });
    app.use(express.json({ limit: '8kb', strict: true }));
    app.get('/api/pei/config', (_, response) => {
        response.setHeader('Cache-Control', 'no-store');
        response.json({
            network: options.config.network,
            requesterOrigin: options.config.requesterOrigin,
            proxyAddress: options.config.proxyAddress,
            earnAmountLuna: options.config.earnAmountLuna,
            spendAmountLuna: options.config.spendAmountLuna
        });
    });
    app.post('/api/pei/authorize', (request, response) => {
        response.setHeader('Cache-Control', 'no-store');
        try {
            const { peiRequest } = authorizedRequest(request.body, options.config, now);
            response.json({ authorized: true, action: peiRequest.action });
        } catch (error) {
            response.status(400).json({
                error: error instanceof Error ? error.message : 'Invalid PEI authorization.'
            });
        }
    });
    app.post('/api/pei/earn', async (request, response) => {
        response.setHeader('Cache-Control', 'no-store');
        try {
            const { peiRequest } = authorizedRequest(request.body, options.config, now);
            if (peiRequest.action !== 'earn') throw new Error('PEI earn requires an earn request.');
            const commitment = await peiRequestCommitmentV0(peiRequest);
            let transfer = attempts.get(commitment);
            if (!transfer) {
                transfer = options.earnTransfer.send(peiRequest, commitment).catch((error) => {
                    attempts.delete(commitment);
                    throw error;
                });
                attempts.set(commitment, transfer);
                const eviction = setTimeout(() => {
                    if (attempts.get(commitment) === transfer) attempts.delete(commitment);
                }, Math.max(0, peiRequest.expiresAt * 1_000 - now().getTime()));
                eviction.unref();
            }
            const transactionHash = await transfer;
            if (!/^[a-f0-9]{64}$/.test(transactionHash)) {
                attempts.delete(commitment);
                throw new Error('The PEI earn signer returned an invalid transaction hash.');
            }
            response.json({ transactionHash });
        } catch (error) {
            response.status(400).json({
                error: error instanceof Error ? error.message : 'PEI earn failed.'
            });
        }
    });
    app.post('/api/pei/verify', async (request, response) => {
        response.setHeader('Cache-Control', 'no-store');
        try {
            const value = request.body as Record<string, unknown> | undefined;
            const requiredKeys = ['requestCarrier', 'authorization', 'transactionHash'];
            const allowedKeys = [...requiredKeys, 'parentCarrier'];
            if (!value || requiredKeys.some((key) => !(key in value)) ||
                Object.keys(value).some((key) => !allowedKeys.includes(key)) ||
                typeof value.transactionHash !== 'string' ||
                !/^[a-fA-F0-9]{64}$/.test(value.transactionHash)) {
                throw new Error('Invalid PEI verification request.');
            }
            const { peiRequest } = authorizedRequest({
                requestCarrier: value.requestCarrier,
                authorization: value.authorization
            }, options.config, now);
            let expectedParentHash: string | undefined;
            if (peiRequest.action === 'spend') {
                if (typeof value.parentCarrier !== 'string') {
                    throw new Error('The accepted earn proof is required for spend verification.');
                }
                const parent = decodePeiProofV0(value.parentCarrier);
                validateParent(parent, peiRequest);
                expectedParentHash = await peiProofHashV0(parent);
            } else if (value.parentCarrier !== undefined) {
                throw new Error('Earn verification must not carry a parent proof.');
            }
            const proof: PeiProofV0 = {
                protocol: 'pei',
                version: 0,
                request: peiRequest,
                txHash: value.transactionHash.toLowerCase()
            };
            const result = await verifyPeiProofV0(
                proof,
                peiRequest.action,
                {
                    adapter: options.chainAdapter,
                    config: options.config,
                    nowSeconds: Math.floor(now().getTime() / 1_000),
                    expectedSubject: peiRequest.subject
                },
                expectedParentHash
            );
            if (result.status === 'inconclusive' &&
                result.reason === 'transaction_not_found' &&
                peiRequest.action === 'earn') {
                await options.earnTransfer.send(
                    peiRequest,
                    await peiRequestCommitmentV0(peiRequest)
                );
            }
            if (result.status === 'invalid') {
                response.status(400).json({ error: `PEI transaction is invalid (${result.reason}).` });
                return;
            }
            response.json(result.status === 'valid'
                ? { status: 'final' }
                : { status: 'pending', reason: result.reason });
        } catch (error) {
            response.status(400).json({
                error: error instanceof Error ? error.message : 'PEI verification failed.'
            });
        }
    });
    app.get('/', (_, response) => response.sendFile(path.join(options.clientDir, 'pei-proxy.html')));
    app.use('/', express.static(options.clientDir, { index: false }));

    let closed = false;
    let initialized = false;
    return {
        app,
        httpServer: server,
        async listen(port = 0, host = '127.0.0.1'): Promise<number> {
            if (!initialized) {
                await options.earnTransfer.initialize?.();
                initialized = true;
            }
            return new Promise((resolve, reject) => {
                server.once('error', reject);
                server.listen(port, host, () => {
                    server.off('error', reject);
                    const address = server.address();
                    resolve(typeof address === 'object' && address ? address.port : port);
                });
            });
        },
        async close(): Promise<void> {
            if (closed) return Promise.resolve();
            closed = true;
            if (server.listening) {
                await new Promise<void>((resolve, reject) => server.close((error) =>
                    error ? reject(error) : resolve()
                ));
            }
            await options.earnTransfer.close?.();
        }
    };
}

function authorizedRequest(
    body: unknown,
    config: PeiRuntimeConfigV0,
    now: () => Date
): { peiRequest: PeiRequestV0 } {
    const value = body as Record<string, unknown> | undefined;
    if (!value || Object.keys(value).length !== 2 ||
        typeof value.requestCarrier !== 'string' ||
        typeof value.authorization !== 'string' ||
        !requestAuthenticationMatches(
            value.requestCarrier,
            value.authorization,
            config.requestAuthSecret
        )) {
        throw new Error('Invalid PEI request authorization.');
    }
    const peiRequest = decodePeiRequestV0(value.requestCarrier);
    validateRequest(peiRequest, config, Math.floor(now().getTime() / 1_000));
    return { peiRequest };
}

function validateParent(parent: PeiProofV0, request: PeiRequestV0): void {
    if (parent.request.action !== 'earn' ||
        normalizeNimiqAddress(parent.request.subject) !== normalizeNimiqAddress(request.subject)) {
        throw new Error('The earn proof does not belong to this spend request.');
    }
}

function validateRequest(
    request: PeiRequestV0,
    config: PeiRuntimeConfigV0,
    nowSeconds: number
): void {
    normalizeNimiqAddress(request.subject);
    if ((request.action === 'earn') !== (request.parentProofHash === null) ||
        request.network !== config.network ||
        request.requesterOrigin !== config.requesterOrigin ||
        request.returnUri !== config.returnUri ||
        request.minAmountLuna !== (request.action === 'earn'
            ? config.earnAmountLuna
            : config.spendAmountLuna) ||
        request.expiresAt <= nowSeconds || request.issuedAt > nowSeconds + config.clockSkewSeconds ||
        request.expiresAt - request.issuedAt > config.maximumRequestTtlSeconds) {
        throw new Error('PEI earn request does not match proxy policy.');
    }
}
