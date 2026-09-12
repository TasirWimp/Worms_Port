import { readFile } from 'fs/promises';

import {
    Address,
    KeyPair,
    PrivateKey,
    TransactionBuilder
} from '@nimiq/core';

import { peiRequestCommitmentV0, type PeiRequestV0 } from '../../../shared/pei-v0';
import type { PeiEarnTransferV0 } from './proxy-runtime';
import type { PeiProxyTransferConfigV0 } from './proxy-config';
import type { PeiProxyTransferStoreV0 } from './transfer-store';

export type PreparedPeiTransferV0 = {
    serializedTransaction: string;
    transactionHash: string;
    validityStartHeight: number;
};

export interface PeiEarnTransferAdapterV0 {
    prepare(request: PeiRequestV0, requestCommitment: string): Promise<PreparedPeiTransferV0>;
    broadcast(serializedTransaction: string): Promise<void>;
    close?(): void;
}

export class DurablePeiEarnTransferV0 implements PeiEarnTransferV0 {
    public constructor(
        private readonly store: PeiProxyTransferStoreV0,
        private readonly adapter: PeiEarnTransferAdapterV0,
        private readonly paused: boolean,
        private readonly now: () => Date = () => new Date()
    ) {}

    public async initialize(): Promise<void> {
        await this.store.initialize();
    }

    public async send(request: PeiRequestV0, commitment: string): Promise<string> {
        if (this.paused) throw new Error('PEI helper transfers are paused.');
        if (request.action !== 'earn' || await peiRequestCommitmentV0(request) !== commitment) {
            throw new Error('PEI helper received an invalid earn transfer request.');
        }
        return this.store.withRequestLock(commitment, async (locked) => {
            let transfer = await locked.get(commitment);
            if (!transfer) {
                const prepared = await this.adapter.prepare(request, commitment);
                transfer = await locked.saveSigned({
                    requestCommitment: commitment,
                    signedTransaction: prepared.serializedTransaction,
                    transactionHash: prepared.transactionHash,
                    validityStartHeight: prepared.validityStartHeight
                }, this.now());
            }
            try {
                await this.adapter.broadcast(transfer.signedTransaction);
            } catch {
                // Submission can be ambiguous. The exact persisted bytes are reused on retry.
            }
            await locked.markBroadcastUnknown(commitment, this.now());
            return transfer.transactionHash;
        });
    }

    public async close(): Promise<void> {
        this.adapter.close?.();
        await this.store.close();
    }
}

export class NimiqRpcPeiEarnTransferAdapterV0 implements PeiEarnTransferAdapterV0 {
    private constructor(
        private readonly config: PeiProxyTransferConfigV0,
        private readonly keyPair: KeyPair,
        private readonly networkId: number
    ) {}

    public static async create(
        config: PeiProxyTransferConfigV0
    ): Promise<NimiqRpcPeiEarnTransferAdapterV0> {
        const keyHex = (await readFile(config.privateKeyFile, 'utf8')).trim();
        if (!/^[a-fA-F0-9]{64}$/.test(keyHex)) {
            throw new Error('The PEI proxy secret file must contain one 32-byte hex private key.');
        }
        const privateKey = PrivateKey.fromHex(keyHex);
        const keyPair = KeyPair.derive(privateKey);
        privateKey.free();
        const address = keyPair.toAddress();
        const signer = address.toUserFriendlyAddress();
        address.free();
        if (signer !== config.proxyAddress) {
            keyPair.free();
            throw new Error('The PEI proxy private key does not match PEI_PROXY_ADDRESS.');
        }
        return new NimiqRpcPeiEarnTransferAdapterV0(
            config,
            keyPair,
            config.network === 'main-albatross' ? 24 : 5
        );
    }

    public async prepare(
        request: PeiRequestV0,
        requestCommitment: string
    ): Promise<PreparedPeiTransferV0> {
        const data = new TextEncoder().encode(requestCommitment);
        if (data.byteLength > 64) throw new Error('The PEI request commitment exceeds 64 bytes.');
        const health = await this.health();
        const value = BigInt(request.minAmountLuna);
        if (health.balance < value + this.config.feeLuna) {
            throw new Error('The PEI helper wallet balance is too low.');
        }
        const sender = this.keyPair.toAddress();
        let recipient: Address | undefined;
        try {
            recipient = Address.fromUserFriendlyAddress(request.subject);
            const transaction = TransactionBuilder.newBasicWithData(
                sender,
                recipient,
                data,
                value,
                this.config.feeLuna,
                health.height,
                this.networkId
            );
            try {
                transaction.sign(this.keyPair, undefined);
                transaction.verify(this.networkId);
                return {
                    serializedTransaction: Buffer.from(transaction.serialize()).toString('hex'),
                    transactionHash: transaction.hash().toLowerCase(),
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

    public close(): void {
        this.keyPair.free();
    }

    private async health(): Promise<{ height: number; balance: bigint }> {
        if (await this.rpc('isConsensusEstablished', []) !== true) {
            throw new Error('The PEI RPC has no consensus.');
        }
        const height = await this.blockNumber();
        const block = record(await this.rpc('getBlockByNumber', [height, false]));
        const expectedNetwork = this.config.network === 'main-albatross'
            ? 'MainAlbatross'
            : 'TestAlbatross';
        if (block.network !== expectedNetwork) throw new Error('The PEI RPC is on the wrong network.');
        const timestamp = block.timestamp;
        if (typeof timestamp !== 'number' || !Number.isSafeInteger(timestamp) || timestamp < 0) {
            throw new Error('The PEI RPC returned an invalid head timestamp.');
        }
        const timestampMs = timestamp < 1_000_000_000_000 ? timestamp * 1_000 : timestamp;
        if (Math.abs(Date.now() - timestampMs) > 10 * 60_000) {
            throw new Error('The PEI RPC head is stale.');
        }
        const account = record(await this.rpc('getAccountByAddress', [this.config.proxyAddress]));
        const balance = account.balance;
        if (typeof balance !== 'number' || !Number.isSafeInteger(balance) || balance < 0) {
            throw new Error('The PEI RPC returned an invalid helper balance.');
        }
        return { height, balance: BigInt(balance) };
    }

    private async blockNumber(): Promise<number> {
        const value = await this.rpc('getBlockNumber', []);
        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
            throw new Error('The PEI RPC returned an invalid height.');
        }
        return value;
    }

    private async rpc(method: string, params: unknown[]): Promise<unknown> {
        const response = await fetch(this.config.rpcUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
            signal: AbortSignal.timeout(8_000)
        });
        if (!response.ok) throw new Error(`The PEI RPC returned HTTP ${response.status}.`);
        const body = await response.text();
        if (body.length > 1_000_000) throw new Error('The PEI RPC response exceeded 1 MB.');
        let decoded: unknown;
        try {
            decoded = JSON.parse(body);
        } catch {
            throw new Error('The PEI RPC returned invalid JSON.');
        }
        const payload = record(decoded);
        if (payload.jsonrpc !== '2.0' || payload.id !== 1 || payload.error) {
            throw new Error('The PEI RPC returned an error.');
        }
        const result = record(payload.result);
        if (!('data' in result)) throw new Error('The PEI RPC response omitted result.data.');
        return result.data;
    }
}

function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('The PEI RPC returned an invalid object.');
    }
    return value as Record<string, unknown>;
}
