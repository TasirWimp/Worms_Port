import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Transaction } from '@nimiq/core';

import {
    DurablePeiEarnTransferV0,
    NimiqRpcPeiEarnTransferAdapterV0,
    type PeiEarnTransferAdapterV0,
    type PreparedPeiTransferV0
} from '../../server/src/pei/earn-transfer';
import { MemoryPeiProxyTransferStoreV0 } from '../../server/src/pei/transfer-store';
import { peiRequestCommitmentV0 } from '../../shared/pei-v0';
import { PEI_EARN_TX, peiFixture } from './fixtures';
import { createTestSigner, privateKeyForProject } from '../support/nimiq-signer';

test('earn transfer persists exact signed bytes before ambiguous broadcast and reuses them', async () => {
    const fixture = await peiFixture();
    const request = fixture.earnProof.request;
    const commitment = await peiRequestCommitmentV0(request);
    const store = new MemoryPeiProxyTransferStoreV0();
    const firstAdapter = new FakeEarnAdapter(true);
    const first = new DurablePeiEarnTransferV0(store, firstAdapter, false);
    const hashes = await Promise.all([
        first.send(request, commitment),
        first.send(request, commitment)
    ]);
    assert.deepEqual(hashes, [PEI_EARN_TX, PEI_EARN_TX]);
    assert.equal(firstAdapter.preparations, 1);
    assert.deepEqual(new Set(firstAdapter.broadcasts), new Set(['signed-pei-transaction']));
    assert.equal((await store.get(commitment))?.state, 'broadcast_unknown');

    const restartAdapter = new FakeEarnAdapter(false);
    const restarted = new DurablePeiEarnTransferV0(store, restartAdapter, false);
    assert.equal(await restarted.send(request, commitment), PEI_EARN_TX);
    assert.equal(restartAdapter.preparations, 0);
    assert.deepEqual(restartAdapter.broadcasts, ['signed-pei-transaction']);
});

test('paused earn helper refuses signing and first broadcast', async () => {
    const fixture = await peiFixture();
    const request = fixture.earnProof.request;
    const commitment = await peiRequestCommitmentV0(request);
    const adapter = new FakeEarnAdapter(false);
    const transfer = new DurablePeiEarnTransferV0(
        new MemoryPeiProxyTransferStoreV0(), adapter, true
    );
    await assert.rejects(transfer.send(request, commitment), /paused/);
    assert.equal(adapter.preparations, 0);
    assert.deepEqual(adapter.broadcasts, []);
});

test('server-only Nimiq signer commits the exact request into a valid transaction', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'nimble-knots-pei-'));
    const keyFile = path.join(directory, 'proxy-key');
    const proxyKey = privateKeyForProject('pei-proxy-signer');
    const signer = createTestSigner(proxyKey);
    const originalFetch = globalThis.fetch;
    await writeFile(keyFile, proxyKey, { encoding: 'utf8', mode: 0o600 });
    globalThis.fetch = async (_input, init) => {
        const request = JSON.parse(String(init?.body)) as { method: string };
        const data = request.method === 'isConsensusEstablished'
            ? true
            : request.method === 'getBlockNumber'
                ? 100
                : request.method === 'getBlockByNumber'
                    ? { network: 'MainAlbatross', timestamp: Date.now() }
                    : { balance: 1_000_000 };
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { data } }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });
    };
    let adapter: NimiqRpcPeiEarnTransferAdapterV0 | undefined;
    try {
        adapter = await NimiqRpcPeiEarnTransferAdapterV0.create({
            network: 'main-albatross',
            proxyAddress: signer.address,
            feeLuna: 0n,
            privateKeyFile: keyFile,
            rpcUrl: 'https://rpc.example',
            paused: false
        });
        const fixture = await peiFixture();
        const request = { ...fixture.earnProof.request, minAmountLuna: '100000' };
        const commitment = await peiRequestCommitmentV0(request);
        const prepared = await adapter.prepare(request, commitment);
        const transaction = Transaction.deserialize(Buffer.from(prepared.serializedTransaction, 'hex'));
        try {
            const sender = transaction.sender;
            const recipient = transaction.recipient;
            try {
                assert.equal(sender.toUserFriendlyAddress(), signer.address);
                assert.equal(recipient.toUserFriendlyAddress(), request.subject);
            } finally {
                sender.free();
                recipient.free();
            }
            assert.equal(transaction.value, 100_000n);
            assert.equal(transaction.networkId, 24);
            assert.equal(new TextDecoder().decode(transaction.data), commitment);
            assert.equal(transaction.hash().toLowerCase(), prepared.transactionHash);
            transaction.verify(24);
        } finally {
            transaction.free();
        }
    } finally {
        adapter?.close();
        globalThis.fetch = originalFetch;
        signer.dispose();
        await rm(directory, { recursive: true, force: true });
    }
});

class FakeEarnAdapter implements PeiEarnTransferAdapterV0 {
    public preparations = 0;
    public readonly broadcasts: string[] = [];

    public constructor(private readonly failFirstBroadcast: boolean) {}

    public async prepare(): Promise<PreparedPeiTransferV0> {
        this.preparations += 1;
        return {
            serializedTransaction: 'signed-pei-transaction',
            transactionHash: PEI_EARN_TX,
            validityStartHeight: 100
        };
    }

    public async broadcast(serializedTransaction: string): Promise<void> {
        this.broadcasts.push(serializedTransaction);
        if (this.failFirstBroadcast && this.broadcasts.length === 1) {
            throw new Error('synthetic ambiguous broadcast');
        }
    }
}
