import assert from 'node:assert/strict';
import test from 'node:test';

import {
    canonicalJson,
    deepSortJson,
    sha256Digest
} from '../../analysis/crpm_world/canonical';

test('canonical JSON sorts object keys recursively and preserves array order', () => {
    const value = {
        zeta: 3,
        alpha: {
            zebra: true,
            beta: ['second', 'first']
        },
        '2': 'two',
        '10': 'ten'
    };

    assert.equal(
        canonicalJson(value),
        '{"10":"ten","2":"two","alpha":{"beta":["second","first"],"zebra":true},"zeta":3}'
    );
});

test('canonical helpers do not mutate caller data', () => {
    const value = {
        outer: { z: 1, a: 2 },
        ordered: [{ z: 3, a: 4 }, 'tail']
    };
    const snapshot = structuredClone(value);
    const sorted = deepSortJson(value);

    assert.deepEqual(value, snapshot);
    assert.notEqual(sorted, value);
    assert.notEqual((sorted as { outer: object }).outer, value.outer);
    assert.equal(canonicalJson(value), canonicalJson(snapshot));
});

test('equivalent object-key orders have the same canonical digest', () => {
    const left = { beta: { two: 2, one: 1 }, alpha: true };
    const right = { alpha: true, beta: { one: 1, two: 2 } };

    assert.equal(sha256Digest(left), sha256Digest(right));
    assert.match(sha256Digest(left), /^[0-9a-f]{64}$/);
});

test('meaningful list-order changes produce different canonical digests', () => {
    assert.notEqual(
        sha256Digest({ steps: ['move', 'cast'] }),
        sha256Digest({ steps: ['cast', 'move'] })
    );
});

test('canonical JSON rejects nondeterministic or non-JSON values', () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const sparse = new Array(1);
    const accessor = {};
    Object.defineProperty(accessor, 'value', { enumerable: true, get: () => 1 });

    for (const value of [
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        -0,
        Number.MAX_SAFE_INTEGER + 1,
        undefined,
        1n,
        Symbol('not-json'),
        () => true,
        new Date('2026-08-10T00:00:00.000Z'),
        sparse,
        cyclic,
        accessor,
        { createdAt: '2026-08-10T00:00:00.000Z' },
        { nested: { timestamp: 1_700_000_000_000 } },
        { when: 'soon' },
        { value: '2026-08-10T00:00:00.000Z' }
    ]) {
        assert.throws(() => canonicalJson(value));
    }
});

test('finite decimals and deterministic simulation counters remain admissible', () => {
    assert.equal(
        canonicalJson({ ratio: 0.488, revision: 0, tick: 1_024 }),
        '{"ratio":0.488,"revision":0,"tick":1024}'
    );
});
