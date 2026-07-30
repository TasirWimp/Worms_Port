import { createHash } from 'crypto';
import { readFile } from 'fs/promises';

import {
    Address,
    KeyPair,
    Policy,
    PrivateKey,
    TransactionBuilder
} from '@nimiq/core';

import type { RewardUpdateData } from '../../../shared/protocol';
import { entitlementUpdate, type RewardConfig, type RewardEntitlement, type RewardStore } from './types';

export type PreparedTransaction = {
    serializedTransaction: string;
    transactionHash: string;
    validityStartHeight: number;
};

export type ChainTransactionStatus =
    | { state: 'absent'; headHeight: number }
    | {
        state: 'included';
        headHeight: number;
        includedHeight: number;
        finalized: boolean;
    };

export type RewardPayoutAdapter = {
    prepare(entitlement: RewardEntitlement): Promise<PreparedTransaction>;
    broadcast(serializedTransaction: string): Promise<void>;
    status(transactionHash: string): Promise<ChainTransactionStatus>;
    validityWindowBlocks(): number;
    close?(): void;
};

export type RewardPayoutWorkerOptions = {
    intervalMs?: number;
    batchSize?: number;
    now?: () => Date;
    onUpdate?: (update: RewardUpdateData) => void;
};

export class RewardPayoutWorker {
    private readonly intervalMs: number;
    private readonly batchSize: number;
    private readonly now: () => Date;
    private readonly onUpdate?: (update: RewardUpdateData) => void;
    private timer?: NodeJS.Timeout;
    private running?: Promise<void>;
    private stopped = false;

    public constructor(
        private readonly store: RewardStore,
        private readonly adapter: RewardPayoutAdapter,
        private readonly config: RewardConfig,
        options: RewardPayoutWorkerOptions = {}
    ) {
        this.intervalMs = options.intervalMs ?? 10_000;
        this.batchSize = options.batchSize ?? 10;
        this.now = options.now ?? (() => new Date());
        this.onUpdate = options.onUpdate;
    }

    public start(): void {
        if (this.timer || this.stopped) return;
        this.timer = setInterval(() => this.kick(), this.intervalMs);
        this.timer.unref();
        this.kick();
    }

    public kick(): void {
        if (this.running || this.stopped) return;
        this.running = this.runOnce().finally(() => {
            this.running = undefined;
        });
    }

    public async close(): Promise<void> {
        this.stopped = true;
        if (this.timer) clearInterval(this.timer);
        this.timer = undefined;
        await this.running;
        this.adapter.close?.();
    }

    public async runOnce(): Promise<void> {
        await this.store.withPayoutLease(async () => {
            if (!this.config.paused) {
                for (const entitlement of await this.store.listQueued(this.batchSize)) {
                    await this.signQueued(entitlement);
                }
            }
            for (const entitlement of await this.store.listReconcilable(this.batchSize)) {
                await this.reconcile(entitlement);
            }
        });
    }

    private async signQueued(entitlement: RewardEntitlement): Promise<void> {
        try {
            if (entitlement.rewardLuna !== this.config.rewardLuna ||
                entitlement.rewardLuna <= 0n ||
                entitlement.rewardLuna > this.config.dailyBudgetLuna) {
                throw new PayoutAdapterError(
                    'stored_policy_mismatch',
                    'Stored payout intent does not match the fixed reward policy.'
                );
            }
            const prepared = await this.adapter.prepare(entitlement);
            const signed = await this.store.markSigned({
                entitlementId: entitlement.id,
                ...prepared,
                now: this.now()
            });
            this.emit(signed);
        } catch (error) {
            const reviewed = await this.store.markManualReview(
                entitlement.id,
                payoutReason(error, 'signing_failed'),
                this.now()
            );
            this.emit(reviewed);
        }
    }

    private async reconcile(entitlement: RewardEntitlement): Promise<void> {
        let current = entitlement;
        if (current.state === 'signed') {
            if (this.config.paused) {
                const status = await this.safeStatus(current);
                if (status?.state !== 'included') return;
                current = await this.store.markIncluded(
                    current.id,
                    current.transactionHash!,
                    status.includedHeight,
                    this.now()
                );
                this.emit(current);
                if (status.finalized) {
                    const finalized = await this.store.markFinalized(current.id, this.now());
                    this.emit(finalized);
                }
                return;
            }
            try {
                await this.adapter.broadcast(current.signedTransaction!);
            } catch {
                // Submission failures are ambiguous after the request leaves this process.
            }
            current = await this.store.markBroadcastUnknown(current.id, this.now());
            this.emit(current);
        }
        if (current.state === 'broadcast_unknown') {
            const status = await this.safeStatus(current);
            if (!status) return;
            if (status.state === 'absent') {
                const expiry = (current.validityStartHeight ?? 0) +
                    this.adapter.validityWindowBlocks();
                if (status.headHeight > expiry) {
                    const reviewed = await this.store.markManualReview(
                        current.id,
                        'expired_absent',
                        this.now()
                    );
                    this.emit(reviewed);
                } else {
                    if (this.config.paused) return;
                    try {
                        await this.adapter.broadcast(current.signedTransaction!);
                    } catch {
                        // Re-broadcast the exact stored bytes on the next pass.
                    }
                }
                return;
            }
            current = await this.store.markIncluded(
                current.id,
                current.transactionHash!,
                status.includedHeight,
                this.now()
            );
            this.emit(current);
            if (status.finalized) {
                const finalized = await this.store.markFinalized(current.id, this.now());
                this.emit(finalized);
            }
            return;
        }
        if (current.state === 'included') {
            const status = await this.safeStatus(current);
            if (status?.state === 'included' && status.finalized) {
                const finalized = await this.store.markFinalized(current.id, this.now());
                this.emit(finalized);
            }
        }
    }

    private async safeStatus(
        entitlement: RewardEntitlement
    ): Promise<ChainTransactionStatus | undefined> {
        try {
            return await this.adapter.status(entitlement.transactionHash!);
        } catch {
            return undefined;
        }
    }

    private emit(entitlement: RewardEntitlement): void {
        this.onUpdate?.(entitlementUpdate(entitlement));
    }
}

export class RecordOnlyPayoutAdapter implements RewardPayoutAdapter {
    public async prepare(entitlement: RewardEntitlement): Promise<PreparedTransaction> {
        const serializedTransaction = Buffer.from(JSON.stringify({
            entitlementId: entitlement.id,
            recipient: entitlement.walletAddress,
            rewardLuna: entitlement.rewardLuna.toString()
        }), 'utf8').toString('hex');
        return {
            serializedTransaction,
            transactionHash: createHash('sha256')
                .update(serializedTransaction, 'hex')
                .digest('hex'),
            validityStartHeight: 1
        };
    }

    public async broadcast(_serializedTransaction: string): Promise<void> {}

    public async status(_transactionHash: string): Promise<ChainTransactionStatus> {
        return {
            state: 'included',
            headHeight: 60,
            includedHeight: 1,
            finalized: true
        };
    }

    public validityWindowBlocks(): number {
        return Policy.TRANSACTION_VALIDITY_WINDOW_BLOCKS;
    }
}

export class NimiqRpcPayoutAdapter implements RewardPayoutAdapter {
    private constructor(
        private readonly config: RewardConfig,
        private readonly keyPair: KeyPair,
        private readonly networkId: number
    ) {}

    public static async create(config: RewardConfig): Promise<NimiqRpcPayoutAdapter> {
        if (!config.privateKeyFile || !config.expectedSignerAddress || !config.rpcUrl) {
            throw new Error('Nimiq payout configuration is incomplete.');
        }
        const keyHex = (await readFile(config.privateKeyFile, 'utf8')).trim();
        if (!/^[a-fA-F0-9]{64}$/.test(keyHex)) {
            throw new Error('The Nimiq payout secret file must contain one 32-byte hex private key.');
        }
        const privateKey = PrivateKey.fromHex(keyHex);
        const keyPair = KeyPair.derive(privateKey);
        privateKey.free();
        const address = keyPair.toAddress();
        const signer = address.toUserFriendlyAddress();
        address.free();
        if (signer !== config.expectedSignerAddress) {
            keyPair.free();
            throw new Error('The payout private key does not match the expected signer address.');
        }
        return new NimiqRpcPayoutAdapter(
            config,
            keyPair,
            config.network === 'main-albatross' ? 24 : 5
        );
    }

    public async prepare(entitlement: RewardEntitlement): Promise<PreparedTransaction> {
        const health = await this.health();
        const required = entitlement.rewardLuna + this.config.feeLuna;
        if (health.balance < required) {
            throw new PayoutAdapterError('insufficient_funds', 'Payout hot-wallet balance is low.');
        }
        const sender = this.keyPair.toAddress();
        let recipient: Address | undefined;
        try {
            recipient = Address.fromUserFriendlyAddress(entitlement.walletAddress);
            const transaction = TransactionBuilder.newBasic(
                sender,
                recipient,
                entitlement.rewardLuna,
                this.config.feeLuna,
                health.height,
                this.networkId
            );
            try {
                transaction.sign(this.keyPair, undefined);
                transaction.verify(this.networkId);
                const serializedTransaction = Buffer.from(transaction.serialize()).toString('hex');
                const transactionHash = transaction.hash().toLowerCase();
                return {
                    serializedTransaction,
                    transactionHash,
                    validityStartHeight: health.height
                };
            } finally {
                transaction.free();
            }
        } finally {
            sender.free();
            recipient?.free();
        }
    }

    public async broadcast(serializedTransaction: string): Promise<void> {
        await this.rpc('sendRawTransaction', [serializedTransaction]);
    }

    public async status(transactionHash: string): Promise<ChainTransactionStatus> {
        const headHeight = await this.blockNumber();
        let transaction: unknown;
        try {
            transaction = await this.rpc('getTransactionByHash', [transactionHash]);
        } catch (error) {
            if (error instanceof RpcResponseError && error.notFound) {
                return { state: 'absent', headHeight };
            }
            throw error;
        }
        const record = objectRecord(transaction);
        if (typeof record.hash === 'string' &&
            record.hash.toLowerCase() !== transactionHash.toLowerCase()) {
            throw new PayoutAdapterError(
                'transaction_hash_mismatch',
                'The Nimiq RPC returned a different transaction hash.'
            );
        }
        const includedHeight = integerField(record, ['blockNumber', 'blockHeight']);
        if (includedHeight === undefined) return { state: 'absent', headHeight };
        if (record.executionResult === false) {
            throw new PayoutAdapterError(
                'execution_failed',
                'The included payout transaction did not execute successfully.'
            );
        }
        return {
            state: 'included',
            headHeight,
            includedHeight,
            finalized: headHeight >= Policy.macroBlockAfter(includedHeight)
        };
    }

    public validityWindowBlocks(): number {
        return Policy.TRANSACTION_VALIDITY_WINDOW_BLOCKS;
    }

    public close(): void {
        this.keyPair.free();
    }

    private async health(): Promise<{ height: number; balance: bigint }> {
        const consensus = await this.rpc('isConsensusEstablished', []);
        if (consensus !== true) {
            throw new PayoutAdapterError('no_consensus', 'The configured Nimiq RPC has no consensus.');
        }
        const height = await this.blockNumber();
        const block = objectRecord(await this.rpc('getBlockByNumber', [height, false]));
        const expectedNetwork = this.config.network === 'main-albatross'
            ? 'MainAlbatross'
            : 'TestAlbatross';
        if (block.network !== expectedNetwork) {
            throw new PayoutAdapterError('wrong_network', 'The configured Nimiq RPC is on the wrong network.');
        }
        const timestamp = block.timestamp;
        if (typeof timestamp !== 'number' || !Number.isSafeInteger(timestamp) ||
            timestamp < 0) {
            throw new PayoutAdapterError(
                'invalid_block_time',
                'The Nimiq RPC returned an invalid head timestamp.'
            );
        }
        const timestampMs = timestamp < 1_000_000_000_000
            ? timestamp * 1_000
            : timestamp;
        if (Math.abs(Date.now() - timestampMs) > 10 * 60_000) {
            throw new PayoutAdapterError(
                'stale_head',
                'The configured Nimiq RPC head is stale.'
            );
        }
        const account = objectRecord(await this.rpc(
            'getAccountByAddress',
            [this.config.expectedSignerAddress]
        ));
        const balance = account.balance;
        if (typeof balance !== 'number' || !Number.isSafeInteger(balance) || balance < 0) {
            throw new PayoutAdapterError('invalid_balance', 'The Nimiq RPC returned an invalid balance.');
        }
        return { height, balance: BigInt(balance) };
    }

    private async blockNumber(): Promise<number> {
        const value = await this.rpc('getBlockNumber', []);
        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
            throw new PayoutAdapterError('invalid_height', 'The Nimiq RPC returned an invalid height.');
        }
        return value;
    }

    private async rpc(method: string, params: unknown[]): Promise<unknown> {
        const response = await fetch(this.config.rpcUrl!, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
            signal: AbortSignal.timeout(8_000)
        });
        if (!response.ok) {
            throw new PayoutAdapterError('rpc_http_error', `Nimiq RPC returned HTTP ${response.status}.`);
        }
        const body = await response.text();
        if (body.length > 1_000_000) {
            throw new PayoutAdapterError(
                'rpc_response_too_large',
                'Nimiq RPC response exceeded the configured size limit.'
            );
        }
        let decoded: unknown;
        try {
            decoded = JSON.parse(body);
        } catch {
            throw new PayoutAdapterError(
                'rpc_shape_error',
                'Nimiq RPC returned invalid JSON.'
            );
        }
        const payload = objectRecord(decoded);
        if (payload.jsonrpc !== '2.0' || payload.id !== 1) {
            throw new PayoutAdapterError(
                'rpc_shape_error',
                'Nimiq RPC response metadata did not match the request.'
            );
        }
        if (payload.error) {
            const message = JSON.stringify(payload.error).toLowerCase();
            throw new RpcResponseError(message.includes('not found'));
        }
        const result = objectRecord(payload.result);
        if (!('data' in result)) {
            throw new PayoutAdapterError('rpc_shape_error', 'Nimiq RPC response omitted result.data.');
        }
        return result.data;
    }
}

export class PayoutAdapterError extends Error {
    public constructor(public readonly reasonCode: string, message: string) {
        super(message);
        this.name = 'PayoutAdapterError';
    }
}

class RpcResponseError extends Error {
    public constructor(public readonly notFound: boolean) {
        super('Nimiq RPC returned an error.');
    }
}

function payoutReason(error: unknown, fallback: string): string {
    return error instanceof PayoutAdapterError &&
        /^[a-z0-9_-]{1,64}$/.test(error.reasonCode)
        ? error.reasonCode
        : fallback;
}

function objectRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new PayoutAdapterError('rpc_shape_error', 'Nimiq RPC returned an invalid object.');
    }
    return value as Record<string, unknown>;
}

function integerField(
    record: Record<string, unknown>,
    fields: string[]
): number | undefined {
    for (const field of fields) {
        const value = record[field];
        if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
            return value;
        }
    }
    return undefined;
}
