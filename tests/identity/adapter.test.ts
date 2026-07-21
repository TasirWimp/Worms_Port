import assert from 'node:assert/strict';
import test from 'node:test';

import { NimiqPayIdentityAdapter } from '../../client/src/identity/adapter';

const ADDRESS = 'NQ46 KLJE 5TMF 4Y1A 1255 CJHJ YG1S H0NU T604';
const PUBLIC_KEY = '03a107bff3ce10be1d70dd18e74bc09967e4d6309ba50d5f1ddc8664125531b8';
const SIGNATURE = '82'.repeat(64);

function installBrowserGlobals(language = 'de-DE', hostLanguage?: string) {
    const events = new EventTarget();
    Object.assign(globalThis, {
        window: {
            setTimeout,
            clearTimeout,
            dispatchEvent: events.dispatchEvent.bind(events),
            addEventListener: events.addEventListener.bind(events),
            removeEventListener: events.removeEventListener.bind(events),
            ...(hostLanguage ? { nimiqPay: { language: hostLanguage } } : {})
        }
    });
    Object.defineProperty(globalThis, 'navigator', {
        value: { language },
        configurable: true
    });
}

function moduleWith(provider: Record<string, unknown>, deviceId = 'ab'.repeat(32)) {
    return {
        init: async () => provider,
        requestDeviceIdentifier: async () => deviceId
    } as any;
}

test('adapter remains lazy, uses host language, and validates approved accounts', async () => {
    installBrowserGlobals('de-DE', 'fr');
    let loads = 0;
    const provider = {
        listAccounts: async () => [ADDRESS, ADDRESS],
        sign: async () => ({ publicKey: PUBLIC_KEY, signature: SIGNATURE })
    };
    const adapter = new NimiqPayIdentityAdapter(async () => {
        loads += 1;
        await Promise.resolve();
        return moduleWith(provider);
    });
    assert.equal(loads, 0);
    assert.equal(adapter.hostLanguage(), 'fr');
    assert.equal(loads, 0);

    const accounts = await adapter.listAccounts();
    assert.equal(loads, 1);
    assert.deepEqual(accounts, { status: 'ready', value: [ADDRESS] });
    const signed = await adapter.sign('A'.repeat(64));
    assert.deepEqual(signed, {
        status: 'authorized',
        value: { publicKey: PUBLIC_KEY, signature: SIGNATURE }
    });
});

test('resolved provider errors, thrown rejection, and malformed results are normalized', async () => {
    installBrowserGlobals();
    const resolved = new NimiqPayIdentityAdapter(async () => moduleWith({
        listAccounts: async () => ({ error: { type: 'USER_REJECTED', message: 'Denied' } }),
        sign: async () => ({ publicKey: PUBLIC_KEY, signature: SIGNATURE })
    }));
    assert.deepEqual(await resolved.listAccounts(), {
        status: 'rejected',
        message: 'The Nimiq Pay request was cancelled.'
    });

    const thrown = new NimiqPayIdentityAdapter(async () => moduleWith({
        listAccounts: async () => { throw new Error('User cancelled'); },
        sign: async () => ({ publicKey: PUBLIC_KEY, signature: SIGNATURE })
    }));
    assert.equal((await thrown.listAccounts()).status, 'rejected');

    const malformed = new NimiqPayIdentityAdapter(async () => moduleWith({
        listAccounts: async () => [ADDRESS],
        sign: async () => ({ publicKey: 'bad', signature: 'bad' })
    }));
    assert.equal((await malformed.listAccounts()).status, 'ready');
    assert.equal((await malformed.sign('A'.repeat(64))).status, 'failed');
});

test('approval timeout settles without retry and optional device ID is not returned', async () => {
    installBrowserGlobals('en-US');
    let signCalls = 0;
    const provider = {
        listAccounts: async () => [ADDRESS],
        sign: async () => {
            signCalls += 1;
            return new Promise(() => undefined);
        }
    };
    const adapter = new NimiqPayIdentityAdapter(
        async () => moduleWith(provider),
        20,
        5
    );
    await adapter.listAccounts();
    const signed = await adapter.sign('A'.repeat(64));
    assert.equal(signed.status, 'timed_out');
    assert.equal(signCalls, 1);

    const device = await adapter.requestDeviceIdentifier('Optional abuse protection test.');
    assert.deepEqual(device, { status: 'ready', value: 'received' });
    assert.doesNotMatch(JSON.stringify(device), /abababab/);
});

test('standalone initialization failure is bounded and keeps Practice guidance truthful', async () => {
    installBrowserGlobals();
    let calls = 0;
    const adapter = new NimiqPayIdentityAdapter(async () => {
        calls += 1;
        throw new Error('Provider was not injected.');
    });
    const result = await adapter.listAccounts();
    assert.equal(result.status, 'unavailable');
    assert.equal(calls, 1);
    assert.match('message' in result ? result.message : '', /Practice remains available/);
});
