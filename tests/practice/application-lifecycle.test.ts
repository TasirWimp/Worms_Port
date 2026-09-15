import assert from 'node:assert/strict';
import test from 'node:test';

import {
    APP_RESUME_EVENT,
    APP_SUSPEND_EVENT,
    ApplicationLifecycle,
    type LifecycleGame,
    type LifecycleSocket
} from '../../client/src/lib/application-lifecycle';

class FakeDocument extends EventTarget {
    public hidden = false;
    public readonly documentElement = { dataset: {} as Record<string, string> };
}

class FakeWindow extends EventTarget {}

class FakeSocket implements LifecycleSocket {
    public connected = true;
    public readonly calls: string[] = [];
    public connect(): void { this.calls.push('connect'); this.connected = true; }
    public disconnect(): void { this.calls.push('disconnect'); this.connected = false; }
}

class FakeGame implements LifecycleGame {
    public isPaused = false;
    public readonly calls: string[] = [];
    public pause(): void { this.calls.push('pause'); this.isPaused = true; }
    public resume(): void { this.calls.push('resume'); this.isPaused = false; }
    public stopLoop(): void { this.calls.push('stopLoop'); }
    public startLoop(): void { this.calls.push('startLoop'); }
}

test('hidden mini-app lifecycle stops transport and game until one foreground resume', () => {
    const pageDocument = new FakeDocument();
    const pageWindow = new FakeWindow();
    const socket = new FakeSocket();
    const game = new FakeGame();
    const events: string[] = [];
    let resumed = 0;
    pageWindow.addEventListener(APP_SUSPEND_EVENT, () => events.push('suspend'));
    pageWindow.addEventListener(APP_RESUME_EVENT, () => events.push('resume'));
    const lifecycle = new ApplicationLifecycle({
        pageDocument: pageDocument as unknown as Document,
        pageWindow: pageWindow as unknown as Window,
        onResume: () => { resumed += 1; }
    });
    lifecycle.attachSocket(socket);
    lifecycle.attachGame(game);

    assert.equal(pageDocument.documentElement.dataset.appLifecycle, 'active');
    pageDocument.hidden = true;
    pageDocument.dispatchEvent(new Event('visibilitychange'));
    pageWindow.dispatchEvent(new Event('pagehide'));
    assert.equal(pageDocument.documentElement.dataset.appLifecycle, 'suspended');
    assert.deepEqual(socket.calls, ['disconnect']);
    assert.deepEqual(game.calls, ['pause', 'stopLoop']);
    assert.deepEqual(events, ['suspend']);

    pageDocument.hidden = false;
    pageWindow.dispatchEvent(new Event('pageshow'));
    pageDocument.dispatchEvent(new Event('visibilitychange'));
    assert.equal(pageDocument.documentElement.dataset.appLifecycle, 'active');
    assert.deepEqual(socket.calls, ['disconnect', 'connect']);
    assert.deepEqual(game.calls, ['pause', 'stopLoop', 'resume', 'startLoop']);
    assert.deepEqual(events, ['suspend', 'resume']);
    assert.equal(resumed, 1);

    lifecycle.dispose();
    pageDocument.hidden = true;
    pageDocument.dispatchEvent(new Event('visibilitychange'));
    assert.deepEqual(socket.calls, ['disconnect', 'connect']);
    assert.deepEqual(game.calls, ['pause', 'stopLoop', 'resume', 'startLoop']);
});

test('resources attached while initially hidden stop immediately and resume together', () => {
    const pageDocument = new FakeDocument();
    pageDocument.hidden = true;
    const pageWindow = new FakeWindow();
    const socket = new FakeSocket();
    const game = new FakeGame();
    const lifecycle = new ApplicationLifecycle({
        pageDocument: pageDocument as unknown as Document,
        pageWindow: pageWindow as unknown as Window
    });

    lifecycle.attachSocket(socket);
    lifecycle.attachGame(game);
    assert.equal(pageDocument.documentElement.dataset.appLifecycle, 'suspended');
    assert.deepEqual(socket.calls, ['disconnect']);
    assert.deepEqual(game.calls, ['pause', 'stopLoop']);

    pageDocument.hidden = false;
    pageWindow.dispatchEvent(new Event('pageshow'));
    assert.deepEqual(socket.calls, ['disconnect', 'connect']);
    assert.deepEqual(game.calls, ['pause', 'stopLoop', 'resume', 'startLoop']);
    lifecycle.dispose();
});
