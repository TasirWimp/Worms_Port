import assert from 'node:assert/strict';
import test from 'node:test';
import { Policy } from '@nimiq/core';

import { peiConfigFromEnvironment } from '../../server/src/pei/config';
import { NimiqRpcPeiChainAdapterV0 } from '../../server/src/pei/nimiq-rpc-adapter';
import {
    assertPeiProxyQualityTestEnvironment,
    peiProxyTransferConfigFromEnvironment
} from '../../server/src/pei/proxy-config';
import { PEI_EARN_TX, PEI_PROXY_ADDRESS, PEI_WALLET } from './fixtures';

test('PEI runtime environment is complete, cross-origin, network-bound and disabled by default', () => {
    assert.equal(peiConfigFromEnvironment({}), undefined);
    const environment: NodeJS.ProcessEnv = {
        PEI_ENABLED: 'true',
        PEI_NETWORK: 'main-albatross',
        PEI_RETURN_ORIGIN: 'https://knots.example',
        PEI_PROXY_ORIGIN: 'https://helper.example',
        PEI_PROXY_ADDRESS,
        PEI_REQUEST_TTL_SECONDS: '600',
        PEI_EARN_MIN_LUNA: '1',
        PEI_SPEND_MIN_LUNA: '1',
        PEI_REQUEST_AUTH_SECRET: 'U'.repeat(43)
    };
    const config = peiConfigFromEnvironment(environment, 'main-albatross');
    assert.equal(config?.returnUri, 'https://knots.example/#pei-return');
    assert.equal(config?.proxyOrigin, 'https://helper.example');
    for (const [name, value, message] of [
        ['PEI_PROXY_ORIGIN', 'https://knots.example', /separate Mini App origin/],
        ['PEI_RETURN_ORIGIN', 'http://knots.example', /exact HTTPS origin/],
        ['PEI_NETWORK', 'test-albatross', /match the reward network/],
        ['PEI_REQUEST_TTL_SECONDS', '60', /between 300 and 1800/],
        ['PEI_REQUEST_AUTH_SECRET', 'weak', /32 random Base64URL bytes/],
        ['PEI_SPEND_MIN_LUNA', String(BigInt(Number.MAX_SAFE_INTEGER) + 1n), /JavaScript-safe/]
    ] as const) {
        assert.throws(
            () => peiConfigFromEnvironment({ ...environment, [name]: value }, 'main-albatross'),
            message
        );
    }
});

test('mainnet helper authority is explicit, paused by default and excluded from quality runs', () => {
    const pei = peiConfigFromEnvironment({
        PEI_ENABLED: 'true',
        PEI_NETWORK: 'main-albatross',
        PEI_RETURN_ORIGIN: 'https://knots.example',
        PEI_PROXY_ORIGIN: 'https://helper.example',
        PEI_PROXY_ADDRESS,
        PEI_REQUEST_TTL_SECONDS: '600',
        PEI_EARN_MIN_LUNA: '100000',
        PEI_SPEND_MIN_LUNA: '100000',
        PEI_REQUEST_AUTH_SECRET: 'U'.repeat(43)
    })!;
    const authority: NodeJS.ProcessEnv = {
        PEI_PROXY_PRIVATE_KEY_FILE: 'C:\\secrets\\pei-key',
        PEI_RPC_URL: 'https://rpc.example',
        PEI_PROXY_FEE_LUNA: '0',
        PEI_MAINNET_ACKNOWLEDGEMENT: 'I_UNDERSTAND_MAINNET_PEI_TRANSFERS'
    };
    const config = peiProxyTransferConfigFromEnvironment(pei, authority);
    assert.equal(config.paused, true);
    assert.equal(config.feeLuna, 0n);
    assert.throws(
        () => peiProxyTransferConfigFromEnvironment(pei, {
            ...authority,
            PEI_MAINNET_ACKNOWLEDGEMENT: undefined
        }),
        /I_UNDERSTAND_MAINNET_PEI_TRANSFERS/
    );
    assert.throws(
        () => assertPeiProxyQualityTestEnvironment({
            ...authority,
            WP014_QUALITY_TEST: 'true'
        }),
        /refuse PEI transfer authority/
    );
});

test('Nimiq RPC adapter reads wrapped transaction bytes and macro-block finality', async () => {
    const originalFetch = globalThis.fetch;
    const commitment = 'Q'.repeat(43);
    const methods: string[] = [];
    globalThis.fetch = async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as { method: string };
        methods.push(body.method);
        const data = body.method === 'getBlockNumber'
            ? Policy.macroBlockAfter(100)
            : {
                transaction: {
                    hash: PEI_EARN_TX.toUpperCase(),
                    networkId: 24,
                    from: PEI_PROXY_ADDRESS,
                    to: PEI_WALLET,
                    value: 1,
                    recipientData: [...new TextEncoder().encode(commitment)],
                    blockNumber: 100
                },
                executionResult: true
            };
        return new Response(JSON.stringify({
            jsonrpc: '2.0', id: 1, result: { data }
        }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    try {
        const adapter = new NimiqRpcPeiChainAdapterV0('https://rpc.example');
        assert.deepEqual(await adapter.transaction(PEI_EARN_TX), {
            hash: PEI_EARN_TX,
            network: 'main-albatross',
            sender: PEI_PROXY_ADDRESS,
            recipient: PEI_WALLET,
            valueLuna: '1',
            data: commitment,
            executionState: 'success',
            finalized: true
        });
        assert.deepEqual(methods, ['getTransactionByHash', 'getBlockNumber']);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('Nimiq RPC not-found errors remain an inconclusive absence', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({
        jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'Unknown transaction' }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    try {
        const adapter = new NimiqRpcPeiChainAdapterV0('https://rpc.example');
        assert.equal(await adapter.transaction(PEI_EARN_TX), undefined);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
