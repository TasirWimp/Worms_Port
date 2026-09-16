import assert from 'node:assert/strict';
import test from 'node:test';

import { appendV9DamageReceipts, createResourceTurnsV9Fixture, liveProjectileTraceV9, planV9Presentation, projectCombatV9Resources, trajectoryPreviewV9, type V9FixtureClock, v9OffenseAllowed } from '../../client/src/combat/resource-turns-v9-fixture';
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

test('V9 clone-only trajectory and authority receipt presentation never mutate the V9 state', async () => {
    const fixture = await createResourceTurnsV9Fixture(1, 'wizard', createClock());
    try {
        const before = fixture.snapshot;
        const trace = trajectoryPreviewV9(before, { angleMilliDegrees: 25_000, powerPermille: 700 });
        assert.ok(trace.length > 1, 'the visual preview has a V9-generated trajectory');
        assert.deepEqual(fixture.snapshot, before, 'trajectory projection cannot debit Thread, advance ticks, or alter authority');
        const moving = structuredClone(before); moving.revision += 1; moving.heldDirection = 1; moving.units[0].xFp += 128;
        assert.equal(planV9Presentation(before, moving, true)[0]?.visual.kind, 'movement');
        const displaced = structuredClone(before); displaced.revision += 1; displaced.units[0].xFp += 128;
        displaced.activeActor = 'loomkeeper';
        assert.equal(planV9Presentation(before, displaced, true)[0]?.visual.kind, undefined,
            'blast or settling displacement cannot masquerade as player walking during the Loomkeeper turn');
        const live = structuredClone(before);
        live.projectile = { actor: 'player', relicId: 'threadball', xFp: 100 * 256 + 64, yFp: 80 * 256 + 128,
            vxFp: 1, vyFp: 1, flightTicks: 1, startX: 96, startY: 80, trace: [{ x: 96, y: 80 }] };
        const projected = liveProjectileTraceV9(live.projectile);
        assert.deepEqual(projected.at(-1), { x: 100.25, y: 80.5 }, 'the copied render trace ends at the live fixed-point projectile');
        assert.deepEqual(live.projectile.trace, [{ x: 96, y: 80 }], 'presentation cannot mutate the authoritative trace');
    } finally { fixture.destroy(); }
});

test('V9 controls retire a held gesture at an authority boundary and reject its stale completion', async () => {
    const dom = installControlDom(); const fixture = await createResourceTurnsV9Fixture(1, 'wizard', createClock());
    const attempts: string[] = [];
    try {
        const controls = new ResourceTurnsV9Controls(dom.parent, fixture.snapshot, {
            submit: async intent => { attempts.push(intent.type); return true; }, pause: () => {}, neutral: () => {}
        }, () => 0);
        const root = controls.root as unknown as FakeElement;
        const movement = root.querySelector<HTMLElement>('.movement-zone') as unknown as FakeElement;
        movement.dispatch('pointerdown', 91, 60, 60); movement.dispatch('pointermove', 91, 102, 60);
        controls.update({ ...fixture.snapshot, inputEpoch: fixture.snapshot.inputEpoch + 1 });
        movement.dispatch('pointerup', 91, 102, 60);
        assert.deepEqual(attempts, ['walk_start'], 'the pre-boundary pointer cannot submit a stale release');
        controls.destroy();
    } finally { fixture.destroy(); dom.restore(); }
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

test('V9 due-clock fences Fire before an ordinary tick, bounded debt, and a terminal deadline', async () => {
    const clock = createClock(); const fixture = await createResourceTurnsV9Fixture(1, 'wizard', clock);
    const stop = fixture.onSnapshot(() => {});
    try {
        await fixture.submit({ type: 'select_relic', relicId: 'threadball' });
        await fixture.submit({ type: 'aim', angleMilliDegrees: 20_000, powerPermille: 700 });
        const aimId = fixture.snapshot.aimId;
        clock.elapse(34);
        await fixture.submit({ type: 'fire', aimId });
        assert.equal(fixture.snapshot.tick, 1, 'Fire must process the due authority tick before its intent');
        assert.equal(fixture.snapshot.phase, 'projectile');
    } finally { stop(); fixture.destroy(); }

    const debtClock = createClock(); const debt = await createResourceTurnsV9Fixture(1, 'wizard', debtClock); const debtStop = debt.onSnapshot(() => {});
    try {
        await debt.submit({ type: 'select_relic', relicId: 'threadball' });
        await debt.submit({ type: 'aim', angleMilliDegrees: 20_000, powerPermille: 700 });
        const thread = debt.snapshot.units[0].thread, aimId = debt.snapshot.aimId;
        debtClock.elapse(400);
        await assert.rejects(debt.submit({ type: 'fire', aimId }), /catching up/);
        assert.equal(debt.snapshot.tick, 6, 'Fire cannot skip a six-tick catch-up fence');
        assert.equal(debt.snapshot.units[0].thread, thread, 'rejected Fire cannot debit Thread');
        assert.equal(debt.snapshot.projectile, null);
    } finally { debtStop(); debt.destroy(); }

    const deadlineClock = createClock(); const deadline = await createResourceTurnsV9Fixture(1, 'wizard', deadlineClock); const deadlineStop = deadline.onSnapshot(() => {});
    try {
        await deadline.submit({ type: 'select_relic', relicId: 'threadball' });
        await deadline.submit({ type: 'aim', angleMilliDegrees: 20_000, powerPermille: 700 });
        const thread = deadline.snapshot.units[0].thread, aimId = deadline.snapshot.aimId;
        deadlineClock.elapse(1_034);
        await assert.rejects(deadline.submit({ type: 'fire', aimId }), /ended|catching up/);
        assert.equal(deadline.snapshot.phase, 'finished');
        assert.equal(deadline.snapshot.units[0].thread, thread);
        assert.equal(deadline.snapshot.projectile, null);
    } finally { deadlineStop(); deadline.destroy(); }
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

test('V9 Attack selection submits immediately and fences duplicate Use until authority acknowledgement', async () => {
    const dom = installControlDom(); const fixture = await createResourceTurnsV9Fixture(1, 'wizard', createClock());
    const attempts: string[] = []; let acknowledge: ((accepted: boolean) => void) | undefined; let controls: ResourceTurnsV9Controls;
    let authority = structuredClone(fixture.snapshot);
    try {
        controls = new ResourceTurnsV9Controls(dom.parent, fixture.snapshot, {
            submit: intent => {
                attempts.push(intent.type);
                return new Promise(resolve => { acknowledge = accepted => {
                    if (accepted && intent.type === 'select_relic') authority = { ...authority, selectedRelic: intent.relicId, aim: null };
                    if (accepted && intent.type === 'aim') authority = { ...authority, aim: {
                        angleMilliDegrees: intent.angleMilliDegrees, powerPermille: intent.powerPermille
                    }, aimId: authority.aimId + 1 };
                    if (accepted) controls.update(authority);
                    resolve(accepted);
                }; });
            }, pause: () => {}, neutral: () => {}
        });
        const root = controls.root as unknown as FakeElement;
        const internal = controls as unknown as { selectRelic: (choice: 'threadball' | 'needlepoint') => void };
        const use = root.querySelector<HTMLButtonElement>('.fire-button')!;
        const actions = root.querySelector<HTMLButtonElement>('.v9-actions-button')!;
        const aim = root.querySelector<HTMLElement>('.aim-zone') as unknown as FakeElement;

        internal.selectRelic('needlepoint');
        assert.deepEqual(attempts, ['select_relic'], 'choosing an Attack immediately submits its cost-free selection');
        assert.equal(use.disabled, true); assert.equal(actions.disabled, true);
        assert.equal(aim.getAttribute('aria-disabled'), 'true', 'aim waits for the Relic authority acknowledgement');
        assert.equal(use.textContent, 'Selecting Needlepoint');
        aim.dispatch('pointerdown', 81, 60, 60); aim.dispatch('pointermove', 81, 96, 24); aim.dispatch('pointerup', 81, 96, 24);
        assert.deepEqual(attempts, ['select_relic'], 'a quick aim cannot race ahead of the pending Relic selection');
        use.onclick!();
        assert.deepEqual(attempts, ['select_relic'], 'Use cannot duplicate an in-flight selection');

        acknowledge!(true); await Promise.resolve(); await Promise.resolve();
        assert.equal(root.dataset.selectedRelic, 'needlepoint');
        assert.equal(aim.getAttribute('aria-disabled'), 'false', 'aim becomes available after the selection settles');
        assert.equal(use.disabled, true, 'Use waits for a fresh acknowledged aim after selection');
        assert.equal(root.querySelector<HTMLElement>('.combat-message')!.textContent, 'Needlepoint selected. Lock aim, then Use.');

        aim.dispatch('pointerdown', 82, 60, 60); aim.dispatch('pointermove', 82, 96, 24); aim.dispatch('pointerup', 82, 96, 24);
        assert.deepEqual(attempts, ['select_relic', 'aim']);
        acknowledge!(true); await Promise.resolve(); await Promise.resolve();
        assert.equal(root.dataset.selectedRelic, 'needlepoint', 'aim acknowledgement retains the selected Relic');
        assert.equal(root.dataset.aimLocked, 'true');
        assert.equal(use.disabled, false, 'the selected Relic can fire after its fresh aim is acknowledged');
        assert.equal(use.textContent, 'Use Needlepoint · 3');

        internal.selectRelic('threadball'); acknowledge!(false); await Promise.resolve(); await Promise.resolve();
        assert.equal(actions.disabled, false, 'a rejected selection returns control to a fresh gesture');
        assert.equal(root.querySelector<HTMLElement>('.combat-message')!.textContent, 'Authority rejected that action; use a fresh gesture.');
        controls.destroy();
    } finally { fixture.destroy(); dom.restore(); }
});

test('V9 controls derive action legality and lifecycle guidance from the latest authority snapshot', async () => {
    const dom = installControlDom(); const fixture = await createResourceTurnsV9Fixture(1, 'wizard', createClock());
    try {
        const controls = new ResourceTurnsV9Controls(dom.parent, fixture.snapshot, { submit: async () => true, pause: () => {}, neutral: () => {} });
        const root = controls.root as unknown as FakeElement;
        const state = structuredClone(fixture.snapshot);
        state.utilityUsed = true; state.units[0].thread = 1; state.phase = 'action'; state.activeActor = 'player';
        state.aim = { angleMilliDegrees: 20_000, powerPermille: 700 }; state.aimId++;
        controls.update(state);
        root.querySelector<HTMLElement>('.v9-actions-button')!.dispatch('click');
        const actions = root.querySelector<HTMLElement>('.v9-actions-button')!;
        assert.equal(actions.getAttribute('aria-disabled'), 'false', 'Attack remains available so its authoritative affordability can be explained');
        const use = root.querySelector<HTMLElement>('.fire-button')!;
        assert.equal(use.getAttribute('aria-disabled'), 'true', 'Use cannot submit a stale or unaffordable selection');
        assert.match((use as HTMLButtonElement).title, /Need 2 Thread for Threadball/, 'the armed Relic names its current affordability reason');
        assert.match(root.querySelector<HTMLElement>('.combat-message')!.textContent ?? '', /Need 2 Thread for Threadball/);

        state.heldDirection = 1; controls.update(state);
        assert.equal(use.getAttribute('aria-disabled'), 'true', 'walking keeps the armed Relic disabled');
        state.heldDirection = 0; state.phase = 'retreat'; controls.update(state);
        assert.equal(use.getAttribute('aria-disabled'), 'true', 'retreat cannot use the armed Relic');
        state.phase = 'action'; state.utilityUsed = false; state.units[0].thread = 3; controls.update(state);
        assert.equal(use.getAttribute('aria-disabled'), 'false', 'a fresh affordable action turn restores armed Use');

        state.activeActor = 'loomkeeper'; state.phase = 'action'; controls.update(state, [{ type: 'damage_resolved', actor: 'player', raw: 4, absorbed: 0, stitchingLost: 4 }]);
        assert.match(root.querySelector<HTMLElement>('.combat-message')!.textContent ?? '', /deferred to V9D/, 'waiting guidance survives retained receipts');
        state.phase = 'finished'; state.winner = 'player'; state.finishReason = 'unravelled'; controls.update(state);
        assert.match(root.querySelector<HTMLElement>('.combat-message')!.textContent ?? '', /You won by authoritative unravelled outcome/);
        controls.destroy();
    } finally { fixture.destroy(); dom.restore(); }
});

test('live combat leaves terminal retry and mode actions to the result scene', async () => {
    const dom = installControlDom(); const fixture = await createResourceTurnsV9Fixture(1, 'wizard', createClock());
    try {
        const controls = new ResourceTurnsV9Controls(dom.parent, fixture.snapshot, {
            submit: async () => true, pause: () => {}, neutral: () => {}, live: true,
            restart: () => {}, changeMode: () => {}
        });
        const terminal = structuredClone(fixture.snapshot);
        terminal.phase = 'finished'; terminal.winner = 'player'; terminal.finishReason = 'unravelled';
        controls.update(terminal);
        const root = controls.root as unknown as FakeElement;
        assert.equal((root.querySelector<HTMLElement>('.v9-pause-sheet') as any).hidden, true);
        assert.equal((root.querySelector<HTMLElement>('.v9-change-mode') as any).hidden, true);
        controls.destroy();
    } finally { fixture.destroy(); dom.restore(); }
});

test('V9 controls keep every affordable armed action positive across an authority tick', async () => {
    const dom = installControlDom(); const clock = createClock(); const fixture = await createResourceTurnsV9Fixture(1, 'wizard', clock);
    try {
        const controls = new ResourceTurnsV9Controls(dom.parent, fixture.snapshot, { submit: async () => true, pause: () => {}, neutral: () => {} });
        const root = controls.root as unknown as FakeElement;
        const armed = controls as unknown as { choice: 'threadguard' | 'threadleap' | 'threadball' | 'needlepoint' | null };
        const use = root.querySelector<HTMLButtonElement>('.fire-button')!;
        const message = root.querySelector<HTMLElement>('.combat-message')!;
        const stop = fixture.onSnapshot(snapshot => controls.update(snapshot));
        try {
            for (const [choice, label] of [['threadguard', 'Use Guard · 2 Thread'], ['threadleap', 'Use Leap · 2 Thread'], ['threadball', 'Use Threadball · 2'], ['needlepoint', 'Use Needlepoint · 3']] as const) {
                armed.choice = choice; controls.update(fixture.snapshot);
                assert.equal(use.disabled, false, `${label} remains enabled when its choice is legal`);
                assert.equal(use.title, '', `${label} has no contradictory unavailable title`);
                assert.equal(message.textContent, `${label} is ready.`, `${label} gives positive current guidance`);
                const beforeTick = fixture.snapshot.tick; clock.advance(34);
                assert.ok(fixture.snapshot.tick > beforeTick, 'the fixture published an authority tick');
                assert.equal(use.disabled, false, `${label} remains enabled after the authority tick`);
                assert.equal(use.title, '', `${label} stays free of unavailable guidance after the authority tick`);
                assert.equal(message.textContent, `${label} is ready.`, `${label} stays positively armed after the authority tick`);
            }
        } finally { stop(); controls.destroy(); }
    } finally { fixture.destroy(); dom.restore(); }
});

test('V9 controls let a legal pending replacement supersede an insufficient carried Relic', async () => {
    const dom = installControlDom(); const clock = createClock(); const fixture = await createResourceTurnsV9Fixture(1, 'wizard', clock);
    try {
        let controls: ResourceTurnsV9Controls;
        controls = new ResourceTurnsV9Controls(dom.parent, fixture.snapshot, {
            submit: async intent => { try { await fixture.submit(intent); return true; } catch { return false; } }, pause: () => {}, neutral: () => {}
        });
        const root = controls.root as unknown as FakeElement;
        const armed = controls as unknown as { choice: 'threadball' | 'needlepoint' | 'spoolburst' | 'threadguard' | null };
        const use = root.querySelector<HTMLButtonElement>('.fire-button')!;
        const message = root.querySelector<HTMLElement>('.combat-message')!;
        const stop = fixture.onSnapshot(snapshot => controls.update(snapshot));
        try {
            for (let batch = 0; batch < 30; batch += 1) advanceThirtyTicks(clock);
            assert.equal(fixture.snapshot.turn, 2, 'the carry-over begins on the second player turn');
            assert.equal(fixture.snapshot.activeActor, 'player');
            assert.equal(fixture.snapshot.units[0].thread, 6);

            await fixture.submit({ type: 'select_relic', relicId: 'spoolburst' });
            armed.choice = 'threadguard'; controls.update(fixture.snapshot);
            use.onclick!(); await Promise.resolve(); await Promise.resolve();
            assert.equal(fixture.snapshot.selectedRelic, 'spoolburst');
            assert.equal(fixture.snapshot.units[0].thread, 4, 'Guard leaves the carried Spoolburst unaffordable');

            await fixture.submit({ type: 'aim', angleMilliDegrees: 20_000, powerPermille: 700 });
            assert.equal(armed.choice, null, 'the authority boundary retires the used Guard choice');
            assert.equal(use.disabled, true);
            assert.match(use.title, /Need 5 Thread for Spoolburst/, 'no pending choice keeps the selected Relic reason');

            for (const [choice, label] of [['threadball', 'Use Threadball · 2'], ['needlepoint', 'Use Needlepoint · 3']] as const) {
                armed.choice = choice; controls.update(fixture.snapshot);
                assert.equal(use.disabled, false, `${label} supersedes the stale Spoolburst affordability`);
                assert.equal(use.title, '', `${label} has no stale unavailable title`);
                assert.equal(message.textContent, `${label} is ready.`, `${label} supplies its own positive guidance`);
                const beforeTick = fixture.snapshot.tick; clock.advance(34);
                assert.ok(fixture.snapshot.tick > beforeTick, 'the fixture published an authority tick');
                assert.equal(use.disabled, false, `${label} remains enabled after the authority tick`);
                assert.equal(use.title, '', `${label} remains free of the stale title after the authority tick`);
                assert.equal(message.textContent, `${label} is ready.`, `${label} retains current positive guidance after the authority tick`);
            }
        } finally { stop(); controls.destroy(); }
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
