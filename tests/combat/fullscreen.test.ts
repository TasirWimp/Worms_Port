import assert from 'node:assert/strict';
import test from 'node:test';

import { canRequestFullscreen, toggleGameFullscreen } from '../../client/src/combat/fullscreen';

type FakeDocument = Parameters<typeof canRequestFullscreen>[0];

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

test('fullscreen entry hides navigation UI without locking orientation', async () => {
    const calls: string[] = [];
    const doc = fakeDocument({
        documentElement: {
            requestFullscreen: async (options) => {
                calls.push(`request:${options?.navigationUI}`);
            }
        }
    });
    assert.deepEqual(await toggleGameFullscreen(doc), { status: 'entered' });
    assert.deepEqual(calls, ['request:hide']);
});

test('active fullscreen exits without changing orientation state', async () => {
    const calls: string[] = [];
    const doc = fakeDocument({
        fullscreenElement: {} as Element,
        exitFullscreen: async () => { calls.push('exit'); }
    });
    assert.deepEqual(await toggleGameFullscreen(doc), { status: 'exited' });
    assert.deepEqual(calls, ['exit']);
});

test('unsupported hosts and rejected requests fail without throwing', async () => {
    assert.deepEqual(
        await toggleGameFullscreen(fakeDocument({ fullscreenEnabled: false })),
        { status: 'unsupported' }
    );

    const rejection = new Error('permission denied');
    const result = await toggleGameFullscreen(fakeDocument({
        documentElement: { requestFullscreen: async () => { throw rejection; } }
    }));
    assert.deepEqual(result, { status: 'rejected', error: rejection });
});
