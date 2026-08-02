import assert from 'node:assert/strict';
import test from 'node:test';

import { PostgresRewardStore } from '../../server/src/reward/postgres-store';

test('idle PostgreSQL client failures are handled with a sanitized diagnostic', async () => {
    const store = new PostgresRewardStore(
        'postgresql://test:private-password@database.example/nimble_knots_test'
    );
    const diagnostics: unknown[][] = [];
    const original = console.error;
    console.error = (...values: unknown[]) => diagnostics.push(values);
    try {
        const pool = store as unknown as {
            pool: { emit(event: 'error', error: Error): boolean };
        };
        assert.equal(
            pool.pool.emit('error', new Error('database.example private-password')),
            true
        );
        assert.deepEqual(diagnostics, [['Reward database idle connection was lost.']]);
        assert.doesNotMatch(JSON.stringify(diagnostics), /database\.example|private-password/);
    } finally {
        console.error = original;
        await store.close();
    }
});
