import assert from 'node:assert/strict';
import test from 'node:test';

import { createResourceTurnsV9Fixture, type V9FixtureClock } from '../../client/src/combat/resource-turns-v9-fixture';
import { appendV9DamageReceipts, projectCombatV9Resources, v9OffenseAllowed } from '../../client/src/combat/presentation';
import { UnifiedMovementInputController } from '../../client/src/combat/input';
import { ResourceTurnsV9Controls } from '../../client/src/combat/resource-turns-v9-controls';
import { V9PreviewListenerCleanup } from '../../client/src/combat/contracts';

type FakePointerHandler = (event: PointerEvent) => void;
class FakeElement {
    public readonly dataset: DOMStringMap = {} as DOMStringMap; public readonly style = {} as CSSStyleDeclaration;
    public className = ''; public textContent = ''; public disabled = false; public onclick: (() => void) | null = null;
    public clientWidth = 120; public clientHeight = 120; public parentElement: FakeElement | null = null;
    private readonly nodes = new Map<string, FakeElement>(); private readonly handlers = new Map<string, FakePointerHandler[]>(); private readonly attributes = new Map<string, string>();
    public set innerHTML(_value: string) { /* Controls query their named elements after construction. */ }
    public appendChild(child: FakeElement): FakeElement { child.parentElement = this; return child; }
    public remove(): void { this.parentElement = null; }
    public querySelector<T extends Element>(selector: string): T | null { return this.node(selector) as unknown as T; }
    public querySelectorAll<T extends Element>(selector: string): NodeListOf<T> {
        const values = selector === 'button' ? [...this.nodes.entries()].filter(([key]) => key.includes('button') || key.includes('face') || key.includes('guard') || key.includes('leap') || key.includes('relic')).map(([, node]) => node) : [];
        return values as unknown as NodeListOf<T>;
    }
    public addEventListener(type: string, handler: FakePointerHandler): void { this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]); }
    public removeEventListener(type: string, handler: FakePointerHandler): void { this.handlers.set(type, (this.handlers.get(type) ?? []).filter(item => item !== handler)); }
    public dispatch(type: string, pointerId: number, x: number, y: number): void { for (const handler of this.handlers.get(type) ?? []) handler({ button: 0, pointerId, clientX: x, clientY: y } as PointerEvent); }
    public setPointerCapture(_pointerId: number): void { /* The mock has no native pointer registry. */ }
    public toggleAttribute(name: string, force?: boolean): void { if (force) this.attributes.set(name, ''); else this.attributes.delete(name); }
    public setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
    public getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
    public hasAttribute(name: string): boolean { return this.attributes.has(name); }
    public getBoundingClientRect(): DOMRect { return { x: 0, y: 0, top: 0, left: 0, right: 120, bottom: 120, width: 120, height: 120, toJSON: () => ({}) } as DOMRect; }
    private node(selector: string): FakeElement { let node = this.nodes.get(selector); if (!node) { node = new FakeElement(); node.parentElement = this; this.nodes.set(selector, node); } return node; }
}

function installControlDom(): { parent: HTMLElement; restore: () => void } {
    const original = globalThis.document;
    const parent = new FakeElement(); const document = { documentElement: new FakeElement(), createElement: () => new FakeElement() } as unknown as Document;
    Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
    return { parent: parent as unknown as HTMLElement, restore: () => Object.defineProperty(globalThis, 'document', { configurable: true, value: original }) };
}

class FakeSceneListenerTarget {
    private readonly handlers = new Map<string, ((...args: any[]) => void)[]>();
    public addEventListener(type: string, handler: (...args: any[]) => void): void { this.on(type, handler); }
    public removeEventListener(type: string, handler: (...args: any[]) => void): void { this.off(type, handler); }
    public on(type: string, handler: (...args: any[]) => void): void { this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]); }
    public once(type: string, handler: (...args: any[]) => void): void { this.on(type, handler); }
    public off(type: string, handler: (...args: any[]) => void): void { this.handlers.set(type, (this.handlers.get(type) ?? []).filter(item => item !== handler)); }
    public emit(type: string): void { for (const handler of this.handlers.get(type) ?? []) handler(); }
}

function createClock(): V9FixtureClock & { advance: (milliseconds: number) => void; elapse: (milliseconds: number) => void; flush: (times: number) => void } {
    let now = 0;
    let callback: (() => void) | undefined;
    return {
        now: () => now,
        every: next => { callback = next; return () => { if (callback === next) callback = undefined; }; },
        advance: milliseconds => { now += milliseconds; callback?.(); },
        elapse: milliseconds => { now += milliseconds; },
        flush: times => { for (let index = 0; index < times; index += 1) callback?.(); }
    };
}

function advanceThirtyTicks(clock: ReturnType<typeof createClock>): void {
    clock.advance(1_000);
    // The fixture intentionally limits each callback to six ticks. Four zero-time
    // callbacks finish this exact 30-tick credit without inventing another clock source.
    clock.flush(4);
}

test('V9 local fixture exposes authoritative Thread and local-only preview facts', async () => {
    const clock = createClock();
    const fixture = await createResourceTurnsV9Fixture(1, 'wizard', clock);
    const initial = fixture.snapshot;
    assert.equal(initial.units[0].thread, 3);
    assert.equal(initial.units[1].thread, 0);
    const view = projectCombatV9Resources(initial);
    assert.equal(view.player.thread, '3/9');
    assert.deepEqual(view.relics, {
        threadball: { cost: 2, affordable: true }, needlepoint: { cost: 3, affordable: true },
        spoolburst: { cost: 5, affordable: false }
    });
    fixture.destroy();
});

test('V9 fixture submits Guard once, preserves an authority rejection, and expires shield only after authority turns', async () => {
    const clock = createClock();
    const fixture = await createResourceTurnsV9Fixture(1, 'wizard', clock);
    const seen: number[] = [];
    const stop = fixture.onSnapshot(snapshot => { seen.push(snapshot.units[0].thread); snapshot.units[0].thread = 9; });
    try {
        await fixture.submit({ type: 'threadguard' });
        assert.deepEqual([fixture.snapshot.units[0].thread, fixture.snapshot.units[0].shield], [1, 24]);
        await assert.rejects(fixture.submit({ type: 'threadleap', direction: 1 }), /Utility is not legal/);
        assert.deepEqual([fixture.snapshot.units[0].thread, fixture.snapshot.units[0].shield], [1, 24],
            'a rejected utility cannot locally debit Thread or replace the shield');
        assert.equal(seen.at(-1), 1, 'published state is deep-cloned from authority');

        // Player action expires at tick 450, Loomkeeper's unattended action at 900;
        // turn two is the first authority point at which the Guard expiry may clear.
        for (let batch = 0; batch < 30; batch += 1) advanceThirtyTicks(clock);
        assert.equal(fixture.snapshot.turn, 2);
        assert.equal(fixture.snapshot.units[0].shield, 0);
        assert.equal(fixture.snapshot.units[0].shieldExpiresTurn, null);
    } finally { stop(); fixture.destroy(); }
});

test('V9 local fixture pauses an accepted airborne Threadleap, resumes through the pure barrier, and lands', async () => {
    const clock = createClock();
    const fixture = await createResourceTurnsV9Fixture(1, 'wizard', clock);
    const stop = fixture.onSnapshot(() => {});
    try {
        await fixture.submit({ type: 'threadleap', direction: 1 });
        const leaping = fixture.snapshot;
        assert.equal(leaping.units[0].grounded, false);
        assert.equal(leaping.units[0].vxFp, 512);
        await fixture.setPaused(true);
        const interrupted = fixture.snapshot;
        assert.equal(interrupted.units[0].vxFp, 0, 'the committed pause barrier removes hidden horizontal drive');
        const pausedTick = interrupted.tick;
        clock.advance(10_000);
        assert.equal(fixture.snapshot.tick, pausedTick, 'paused wall time cannot create simulation ticks');
        const idempotentRevision = fixture.snapshot.revision;
        await fixture.setPaused(true);
        assert.equal(fixture.snapshot.revision, idempotentRevision, 'an idempotent pause sends no barrier');
        await fixture.setPaused(false);
        for (let batch = 0; batch < 4 && !fixture.snapshot.units[0].grounded; batch += 1) advanceThirtyTicks(clock);
        assert.equal(fixture.snapshot.units[0].grounded, true);
        assert.equal(fixture.snapshot.units[0].reinforcedLeap, false);
    } finally { stop(); fixture.destroy(); }
});

test('V9 fixture translates INTENT_LIMIT, terminalizes a saturated lifecycle, and ignores a stale callback after teardown', async () => {
    const clock = createClock();
    const fixture = await createResourceTurnsV9Fixture(1, 'wizard', clock);
    const stop = fixture.onSnapshot(() => {});
    try {
        for (let index = 0; index < 512; index += 1)
            await fixture.submit({ type: 'face', direction: index % 2 ? -1 : 1 });
        const beforeLimit = fixture.snapshot;
        await assert.rejects(fixture.submit({ type: 'face', direction: 1 }), /Turn intent budget exhausted/);
        assert.deepEqual(fixture.snapshot, beforeLimit,
            'an unchanged INTENT_LIMIT barrier preserves the returned authority state');
    } finally { stop(); fixture.destroy(); }

    const afterDestroy = fixture.snapshot;
    advanceThirtyTicks(clock);
    assert.deepEqual(fixture.snapshot, afterDestroy, 'the cancelled callback cannot publish or advance after teardown');

    const lifecycleClock = createClock();
    const lifecycleFixture = await createResourceTurnsV9Fixture(1, 'wizard', lifecycleClock);
    const release = lifecycleFixture.onSnapshot(() => {});
    try {
        for (let index = 0; index < 64; index += 1) {
            await lifecycleFixture.setPaused(true);
            await lifecycleFixture.setPaused(false);
        }
        await assert.rejects(lifecycleFixture.setPaused(true), /lifecycle safety limit/);
        assert.equal(lifecycleFixture.snapshot.phase, 'finished');
        assert.equal(lifecycleFixture.snapshot.finishReason, 'simulation_limit');
    } finally { release(); lifecycleFixture.destroy(); }

    const debtClock = createClock();
    const debtFixture = await createResourceTurnsV9Fixture(1, 'wizard', debtClock);
    const unsubscribe = debtFixture.onSnapshot(() => {});
    try {
        debtClock.advance(1_034);
        assert.equal(debtFixture.snapshot.phase, 'finished');
        assert.equal(debtFixture.snapshot.finishReason, 'simulation_limit');
    } finally { unsubscribe(); debtFixture.destroy(); }
});

test('V9 fixture rejects retained post-destroy entry points without ticking or publishing', async () => {
    const clock = createClock(); const fixture = await createResourceTurnsV9Fixture(1, 'wizard', clock);
    let published = 0; fixture.onSnapshot(() => { published += 1; }); fixture.destroy();
    const before = fixture.snapshot; advanceThirtyTicks(clock);
    await assert.rejects(fixture.submit({ type: 'threadguard' }), /Preview is closed/);
    await assert.rejects(fixture.setPaused(true), /Preview is closed/);
    fixture.onSnapshot(() => { published += 1; });
    assert.deepEqual(fixture.snapshot, before); assert.equal(published, 0);
});

test('V9 retained movement controller stops at center and expires a stale hop before polling', () => {
    const controller = new UnifiedMovementInputController();
    const pad = { x: 0, y: 0, width: 120, height: 120 };
    const walking = { grounded: true, facing: 1 as const, heldDirection: 1 as const, lane: 'ready' as const };
    assert.equal(controller.beginMovement(1, { x: 60, y: 60 }, pad), true);
    controller.moveMovement(1, { x: 60, y: 60 }, walking, 0);
    assert.deepEqual(controller.movementIntent(walking, 0), { type: 'walk_stop' });
    controller.interrupt();
    assert.equal(controller.beginMovement(2, { x: 60, y: 60 }, pad), true);
    controller.moveMovement(2, { x: 82, y: 28 }, { ...walking, heldDirection: 0 }, 0);
    assert.equal(controller.movementIntent({ ...walking, heldDirection: 0 }, 1_000), null,
        'the frozen controller rejects a hop after its 250ms eligibility deadline');

    controller.interrupt();
    assert.equal(controller.beginMovement(3, { x: 60, y: 60 }, pad), true);
    controller.moveMovement(3, { x: 82, y: 28 }, { ...walking, heldDirection: 0 }, 0);
    const hop = controller.movementIntent({ ...walking, heldDirection: 0 }, 10);
    assert.deepEqual(hop, { type: 'jump', direction: 1 });
    controller.submittedMovementIntent(hop!);
    assert.equal(controller.movementIntent({ ...walking, heldDirection: 0 }, 11), null,
        'a submitted hop is consumed and cannot be replayed by the retained hold');
});

test('V9 preview uses one offensive authority predicate and keeps all damage receipts through event-free snapshots', async () => {
    const fixture = await createResourceTurnsV9Fixture(1, 'wizard', createClock());
    try {
        const initial = fixture.snapshot;
        assert.equal(v9OffenseAllowed(initial, false), true);
        assert.equal(v9OffenseAllowed({ ...initial, heldDirection: 1 }, false), false, 'walking disables aim, Relics, and Fire together');
        assert.equal(v9OffenseAllowed({ ...initial, phase: 'retreat' }, false), false, 'retreat cannot pause or start offense');
        assert.equal(v9OffenseAllowed(initial, true), false, 'paused authority cannot start offense');
        const receipts = appendV9DamageReceipts([], [
            { type: 'damage_resolved', actor: 'player', raw: 10, absorbed: 4, stitchingLost: 6 },
            { type: 'damage_resolved', actor: 'loomkeeper', raw: 7, absorbed: 7, stitchingLost: 0 }
        ]);
        assert.deepEqual(receipts, [
            'player · raw 10 · 4 shield absorbed · 6 Stitching lost',
            'loomkeeper · raw 7 · 7 shield absorbed · 0 Stitching lost'
        ]);
        assert.deepEqual(appendV9DamageReceipts(receipts, []), receipts,
            'an immediate event-free authority snapshot cannot clear prior receipts');
    } finally { fixture.destroy(); }
});

test('V9 fixture latches its catch-up decision across a reentrant authority publication', async () => {
    const clock = createClock(); const fixture = await createResourceTurnsV9Fixture(1, 'wizard', clock);
    let reentrant: Promise<unknown> | undefined;
    const stop = fixture.onSnapshot(() => { reentrant ??= fixture.submit({ type: 'face', direction: -1 }); });
    try {
        clock.elapse(400);
        await assert.rejects(fixture.submit({ type: 'face', direction: 1 }), /catching up/);
        await assert.rejects(reentrant, /catching up/);
        assert.equal(fixture.snapshot.tick, 6,
            'the nested listener cannot drain the remaining six ticks before the original rejection');
    } finally { stop(); fixture.destroy(); }
});

test('V9 controls directly gate aim, synchronize pad aria state, and remove retained listeners', async () => {
    const dom = installControlDom(); const fixture = await createResourceTurnsV9Fixture(1, 'wizard', createClock());
    const attempts: string[] = [];
    try {
        const controls = new ResourceTurnsV9Controls(dom.parent, fixture.snapshot, {
            submit: async intent => { attempts.push(intent.type); return true; }, pause: () => {}, neutral: () => {}
        }, () => 0);
        const root = controls.root as unknown as FakeElement;
        const aim = root.querySelector<HTMLElement>('.aim-zone') as unknown as FakeElement;
        controls.update({ ...fixture.snapshot, heldDirection: 1 });
        assert.equal(aim.hasAttribute('data-disabled'), true);
        assert.equal(aim.getAttribute('aria-disabled'), 'true');
        aim.dispatch('pointerdown', 70, 60, 60); aim.dispatch('pointerup', 70, 96, 24);
        assert.deepEqual(attempts, [], 'disabled aim cannot emit an intent');

        controls.update(fixture.snapshot);
        assert.equal(aim.hasAttribute('data-disabled'), false);
        assert.equal(aim.getAttribute('aria-disabled'), 'false');
        aim.dispatch('pointerdown', 71, 60, 60); aim.dispatch('pointermove', 71, 96, 24); aim.dispatch('pointerup', 71, 96, 24);
        assert.deepEqual(attempts, ['aim'], 'a permitted aim emits an authority intent');
        const movement = root.querySelector<HTMLElement>('.movement-zone') as unknown as FakeElement;
        controls.destroy(); aim.dispatch('pointerdown', 72, 60, 60); aim.dispatch('pointerup', 72, 96, 24);
        movement.dispatch('pointerdown', 73, 60, 60); movement.dispatch('pointermove', 73, 96, 60);
        assert.deepEqual(attempts, ['aim'], 'retained DOM references cannot submit after control teardown');
    } finally { fixture.destroy(); dom.restore(); }
});

test('V9 scene-style snapshot render stays read-only while RAF refreshes one sustained held walk', async () => {
    const dom = installControlDom(); const clock = createClock(); const fixture = await createResourceTurnsV9Fixture(1, 'wizard', clock);
    const attempts: string[] = []; let frameNow = 0; let controls: ResourceTurnsV9Controls;
    try {
        controls = new ResourceTurnsV9Controls(dom.parent, fixture.snapshot, {
            submit: async intent => { attempts.push(intent.type); try { const next = await fixture.submit(intent); controls.update(next); return true; } catch { attempts.push(`${intent.type}:rejected`); return false; } },
            pause: () => {}, neutral: () => {}
        }, () => frameNow);
        // This mirrors ResourceTurnsV9Scene's onSnapshot path: update and render
        // now, but leave polling to the subsequent frame.
        const stop = fixture.onSnapshot((state, events) => { controls.update(state, events); });
        try {
            const movement = (controls.root as unknown as FakeElement).querySelector<HTMLElement>('.movement-zone') as unknown as FakeElement;
            movement.dispatch('pointerdown', 80, 60, 60); movement.dispatch('pointermove', 80, 96, 60);
            await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
            const epoch = fixture.snapshot.inputEpoch;
            for (let index = 0; index < 4; index += 1) {
                frameNow += 101; clock.advance(100); controls.pollMovement();
                await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
            }
            assert.equal(fixture.snapshot.heldDirection, 1);
            assert.equal(fixture.snapshot.inputEpoch, epoch, 'accepted refreshes retain the original movement epoch');
            assert.equal(attempts.filter(attempt => attempt === 'walk_start').length, 1);
            assert.equal(attempts.filter(attempt => attempt === 'walk_refresh').length, 4);
            assert.equal(attempts.some(attempt => attempt.endsWith(':rejected')), false,
                'snapshot publication did not poll or expire the live hold');
        } finally { stop(); }
    } finally { fixture.destroy(); dom.restore(); }
});

test('V9 fixture reaches the same authority state for one due batch or repeated due callbacks', async () => {
    const batchClock = createClock(), repeatedClock = createClock();
    const batch = await createResourceTurnsV9Fixture(1, 'wizard', batchClock), repeated = await createResourceTurnsV9Fixture(1, 'wizard', repeatedClock);
    const stopBatch = batch.onSnapshot(() => {}), stopRepeated = repeated.onSnapshot(() => {});
    try {
        batchClock.advance(200);
        for (let index = 0; index < 6; index += 1) repeatedClock.advance(34);
        assert.deepEqual(batch.snapshot, repeated.snapshot);
    } finally { stopBatch(); stopRepeated(); batch.destroy(); repeated.destroy(); }
});

test('V9 scene listener cleanup removes DOM, emitter, and shutdown callbacks on direct destroy', () => {
    const target = new FakeSceneListenerTarget(); const cleanup = new V9PreviewListenerCleanup(); let calls = 0;
    cleanup.dom(target, 'pointercancel', () => { calls += 1; });
    cleanup.emitter(target, 'resize', () => { calls += 1; });
    cleanup.once(target, 'shutdown', () => { calls += 1; });
    target.emit('pointercancel'); target.emit('resize'); assert.equal(calls, 2);
    cleanup.dispose(); target.emit('pointercancel'); target.emit('resize'); target.emit('shutdown');
    assert.equal(calls, 2, 'direct scene destruction leaves no retained callback able to neutralize or render');
});
