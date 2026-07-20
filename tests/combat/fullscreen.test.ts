import assert from 'node:assert/strict';
import test from 'node:test';

import { canRequestFullscreen, toggleGameFullscreen } from '../../client/src/combat/fullscreen';

type FakeDocument = Parameters<typeof canRequestFullscreen>[0];
type FakeOrientation = NonNullable<Parameters<typeof toggleGameFullscreen>[1]>;

function fakeDocument(overrides: Partial<FakeDocument> = {}): FakeDocument {
    return {
        fullscreenEnabled: true,
        fullscreenElement: null,
        documentElement: { requestFullscreen: async () => {} },
        exitFullscreen: async () => {},
        ...overrides
    };
}

test('fullscreen capability requires the complete standard API', () => {
    assert.equal(canRequestFullscreen(fakeDocument()), true);
    assert.equal(canRequestFullscreen(fakeDocument({ fullscreenEnabled: false })), false);
    assert.equal(canRequestFullscreen(fakeDocument({ exitFullscreen: undefined })), false);
    assert.equal(canRequestFullscreen(fakeDocument({ documentElement: {} })), false);
});

test('fullscreen entry hides navigation UI before optionally locking landscape', async () => {
    const calls: string[] = [];
    const doc = fakeDocument({
        documentElement: {
            requestFullscreen: async (options) => {
                calls.push(`request:${options?.navigationUI}`);
            }
        }
    });
    const orientation: FakeOrientation = {
        lock: async (value) => { calls.push(`lock:${value}`); }
    };

    assert.deepEqual(await toggleGameFullscreen(doc, orientation), { status: 'entered' });
    assert.deepEqual(calls, ['request:hide', 'lock:landscape']);
});

test('orientation lock failure does not undo successful fullscreen entry', async () => {
    const orientation: FakeOrientation = {
        lock: async () => { throw new Error('host does not expose orientation lock'); }
    };
    assert.deepEqual(await toggleGameFullscreen(fakeDocument(), orientation), { status: 'entered' });
});

test('active fullscreen exits and releases an optional orientation lock', async () => {
    const calls: string[] = [];
    const doc = fakeDocument({
        fullscreenElement: {} as Element,
        exitFullscreen: async () => { calls.push('exit'); }
    });
    const orientation: FakeOrientation = {
        unlock: () => { calls.push('unlock'); }
    };

    assert.deepEqual(await toggleGameFullscreen(doc, orientation), { status: 'exited' });
    assert.deepEqual(calls, ['exit', 'unlock']);
});

test('unsupported hosts and rejected requests fail without throwing', async () => {
    assert.deepEqual(
        await toggleGameFullscreen(fakeDocument({ fullscreenEnabled: false }), {}),
        { status: 'unsupported' }
    );

    const rejection = new Error('permission denied');
    const result = await toggleGameFullscreen(fakeDocument({
        documentElement: { requestFullscreen: async () => { throw rejection; } }
    }), {});
    assert.deepEqual(result, { status: 'rejected', error: rejection });
});
