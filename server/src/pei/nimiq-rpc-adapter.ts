import { Policy } from '@nimiq/core';

import type { PeiChainAdapterV0, PeiChainTransactionV0 } from './verifier';

export class NimiqRpcPeiChainAdapterV0 implements PeiChainAdapterV0 {
    public constructor(private readonly rpcUrl: string) {
        const url = new URL(rpcUrl);
        if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
            throw new Error('PEI_RPC_URL must use HTTPS outside loopback.');
        }
    }

    public async transaction(transactionHash: string): Promise<PeiChainTransactionV0 | undefined> {
        let raw: unknown;
        try {
            raw = await this.rpc('getTransactionByHash', [transactionHash]);
        } catch (error) {
            if (error instanceof PeiRpcError && error.notFound) return undefined;
            throw error;
        }
        const outer = record(raw);
        const transaction = outer.transaction && typeof outer.transaction === 'object'
            ? record(outer.transaction)
            : outer;
        const executionResult = typeof outer.executionResult === 'boolean'
            ? outer.executionResult
            : transaction.executionResult;
        const hash = stringField(transaction, ['hash']).toLowerCase();
        const sender = stringField(transaction, ['from', 'sender']);
        const recipient = stringField(transaction, ['to', 'recipient']);
        const value = integerField(transaction, ['value']);
        const networkId = integerField(transaction, ['networkId']);
        const network = networkId === 24
            ? 'main-albatross'
            : networkId === 5
                ? 'test-albatross'
                : 'unknown';
        const blockNumber = optionalIntegerField(transaction, ['blockNumber', 'blockHeight']);
        const head = blockNumber === undefined ? undefined : await this.blockNumber();
        return {
            hash,
            network,
            sender,
            recipient,
            valueLuna: String(value),
            data: recipientData(transaction.recipientData),
            executionState: blockNumber === undefined
                ? 'pending'
                : executionResult === false
                    ? 'failed'
                    : executionResult === true
                        ? 'success'
                        : 'failed',
            finalized: blockNumber !== undefined && head !== undefined &&
                head >= Policy.macroBlockAfter(blockNumber)
        };
    }

    private async blockNumber(): Promise<number> {
        const value = await this.rpc('getBlockNumber', []);
        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
            throw new Error('Nimiq RPC returned an invalid head height.');
        }
        return value;
    }

    private async rpc(method: string, params: unknown[]): Promise<unknown> {
        const response = await fetch(this.rpcUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
            signal: AbortSignal.timeout(8_000)
        });
        if (!response.ok) throw new Error(`Nimiq RPC returned HTTP ${response.status}.`);
        const body = await response.text();
        if (body.length > 1_000_000) throw new Error('Nimiq RPC response exceeded 1 MB.');
        let decoded: unknown;
        try {
            decoded = JSON.parse(body);
        } catch {
            throw new Error('Nimiq RPC returned invalid JSON.');
        }
        const payload = record(decoded);
        if (payload.jsonrpc !== '2.0' || payload.id !== 1) {
            throw new Error('Nimiq RPC response metadata did not match the request.');
        }
        if (payload.error) {
            const description = JSON.stringify(payload.error).toLowerCase();
            throw new PeiRpcError(/not found|unknown transaction/.test(description));
        }
        const result = record(payload.result);
        if (!('data' in result)) throw new Error('Nimiq RPC response omitted result.data.');
        return result.data;
    }
}

class PeiRpcError extends Error {
    public constructor(public readonly notFound: boolean) {
        super('Nimiq RPC returned an error.');
    }
}

function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Nimiq RPC returned an invalid object.');
    }
    return value as Record<string, unknown>;
}

function stringField(value: Record<string, unknown>, names: string[]): string {
    for (const name of names) if (typeof value[name] === 'string') return value[name] as string;
    throw new Error(`Nimiq RPC omitted ${names.join('/')}.`);
}

function integerField(value: Record<string, unknown>, names: string[]): number {
    const result = optionalIntegerField(value, names);
    if (result === undefined) throw new Error(`Nimiq RPC omitted ${names.join('/')}.`);
    return result;
}

function optionalIntegerField(value: Record<string, unknown>, names: string[]): number | undefined {
    for (const name of names) {
        const candidate = value[name];
        if (typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate >= 0) {
            return candidate;
        }
    }
    return undefined;
}

function recipientData(value: unknown): string {
    let bytes: Uint8Array;
    if (Array.isArray(value) && value.length <= 64 && value.every((item) =>
        typeof item === 'number' && Number.isInteger(item) && item >= 0 && item <= 255)) {
        bytes = Uint8Array.from(value);
    } else if (typeof value === 'string' && /^(?:[a-fA-F0-9]{2}){0,64}$/.test(value)) {
        bytes = Uint8Array.from(Buffer.from(value, 'hex'));
    } else {
        throw new Error('Nimiq RPC returned invalid recipientData.');
    }
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        throw new Error('Nimiq transaction data is not valid UTF-8.');
    }
}
