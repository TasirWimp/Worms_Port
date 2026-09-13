import assert from 'node:assert/strict';
import test from 'node:test';
import { io } from 'socket.io-client';

import { bootstrapSession } from '../../client/src/lib/session';
import { PracticeClient } from '../../client/src/practice/client';
import { createRuntimeServer } from '../../server/src/runtime';
import { CURRENT_V10_RULESET_ID } from '../../shared/simulation-v10';

test('current Practice client owns only the volcanic V10 lifecycle', async () => {
    installSessionStorage();
    const runtime = createRuntimeServer({
        allowMissingOrigin: true,
        sessionRegistry: {
            practiceV10: true,
            seedSource: () => 4,
            v10TestOnly: { nowUs: () => 0 }
        }
    });
    const port = await runtime.listen();
    const socket = io(`http://127.0.0.1:${port}`, { transports: ['websocket'] });
    let client: PracticeClient | undefined;
    try {
        client = await PracticeClient.connect(socket, await bootstrapSession(socket));
        const first = await client.startCombat('wizard');
        assert.equal(first.protocolVersion, 10);
        assert.equal(first.rulesetId, CURRENT_V10_RULESET_ID);
        assert.equal(first.mode, 'practice');

        const args = await client.combatArgs(first);
        assert.equal(args.kind, 'v10');
        if (args.kind !== 'v10') throw new Error('Expected current V10 scene arguments.');
        await args.setPaused(true);
        assert.equal(args.paused(), true);
        await args.setPaused(false);
        assert.equal(args.paused(), false);

        const next = await client.retryCombat('thief');
        assert.notEqual(next.challengeId, first.challengeId);
        assert.equal(next.protocolVersion, 10);
        assert.equal(next.rulesetId, CURRENT_V10_RULESET_ID);
        assert.equal(next.calling, 'thief');
    } finally {
        client?.dispose();
        socket.close();
        await runtime.close();
    }
});

function installSessionStorage(): void {
    const values = new Map<string, string>();
    Object.assign(globalThis, {
        window: { setTimeout, clearTimeout },
        sessionStorage: {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, value),
            removeItem: (key: string) => values.delete(key),
            clear: () => values.clear(),
            key: (index: number) => [...values.keys()][index] ?? null,
            get length() { return values.size; }
        }
    });
}
