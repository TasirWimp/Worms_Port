import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulationV8 } from '../../shared/simulation-v8';
import type { ChallengeSnapshotV8 } from '../../shared/protocol-v8';
import { ActionTurnsInputController } from '../../client/src/combat/input';
import { V8SnapshotBuffer, projectCombatV8 } from '../../client/src/combat/presentation';
import { computeV8ExtraControls, computeCombatLayout } from '../../client/src/combat/layout';
import { createActionTurnsV8Fixture } from '../../client/src/combat/fixture';

function snapshot(): ChallengeSnapshotV8 {
    const simulation = createSimulationV8(1, 'wizard');
    return { protocolVersion: 8, serverTimeMs: 0, sessionId: 'v8fixturesession00',
        challengeId: 'v8fixturechallenge', rulesetId: 'nimble-knots-artillery-v8',
        loomkeeperPolicyId: 'nimble-knots-loomkeeper-v3', loomkeeperProfileId: 'standard-v8-0',
        nextInputSequence: 0, nextSequence: 0, mode: 'practice', calling: 'wizard',
        status: 'active', paused: false, expiresAt: '2099-01-01T00:00:00.000Z',
        stateHash: '0'.repeat(64), simulation: { ...simulation, lastProjectile: null,
            terrain: { width: 256, height: 72, cellSize: 8, words: simulation.terrain.words } } };
}

test('V8 owned overlong hold survives same-epoch authority and releases outside', () => {
    const input = new ActionTurnsInputController();
    const first = snapshot(); input.synchronize(first);
    assert.equal(input.begin('movement', 1, { x: 0, y: 0 }, 48), true);
    input.move(1, { x: 9999, y: 5000 });
    assert.equal(input.movementDirection(), 1);
    const next = structuredClone(first); next.simulation.tick = 3; next.simulation.revision++;
    assert.equal(input.synchronize(next), false);
    assert.equal(input.ownedPointer()?.id, 1);
    assert.equal(input.releaseMovement(1), true);
    assert.equal(input.ownedPointer(), null);
    assert.equal(input.releaseMovement(1), false);
});

test('V8 all ownership boundaries discard old gesture and aim; fresh press is needed', () => {
    for (const mutate of [
        (s: ChallengeSnapshotV8) => { s.challengeId += 'x'; },
        (s: ChallengeSnapshotV8) => { s.simulation.turn++; },
        (s: ChallengeSnapshotV8) => { s.simulation.inputEpoch++; },
        (s: ChallengeSnapshotV8) => { s.simulation.phase = 'retreat'; },
        (s: ChallengeSnapshotV8) => { s.simulation.activeActor = 'loomkeeper'; },
        (s: ChallengeSnapshotV8) => { s.paused = true; },
        (s: ChallengeSnapshotV8) => { s.status = 'expired'; }
    ]) {
        const input = new ActionTurnsInputController(); const s = snapshot(); input.synchronize(s);
        input.begin('movement', 1, { x: 0, y: 0 }, 48);
        input.move(1, { x: -500, y: 0 }); mutate(s);
        assert.equal(input.synchronize(s), true);
        assert.equal(input.ownedPointer(), null); assert.equal(input.lockedAim, null);
        assert.equal(input.move(1, { x: 100, y: 0 }), false);
    }
});

test('V8 interruption clears gesture and does not revive it on ordinary snapshots', () => {
    const input = new ActionTurnsInputController(); const s = snapshot(); input.synchronize(s);
    input.begin('movement', 1, { x: 0, y: 0 }, 48); input.interrupt();
    input.synchronize(s); assert.equal(input.ownedPointer(), null);
    assert.equal(input.movementDirection(), 0);
});

test('V8 projection retains 1/256 remainder without mutating authority', () => {
    const s = snapshot(); s.simulation.units[0].xFp++;
    const original = structuredClone(s);
    for (let i = 0; i < 100; i++) {
        const view = projectCombatV8(s.simulation);
        assert.equal(view.units[0].x * 256, s.simulation.units[0].xFp);
        assert.equal('movementRemaining' in view, false);
    }
    assert.deepEqual(s, original);
});

test('V8 interpolation has two samples, <=3 tick lag and never extrapolates', () => {
    const s = snapshot(); const buffer = new V8SnapshotBuffer(); buffer.accept(s, 0);
    const x = s.simulation.units[0].xFp;
    for (let tick = 3; tick <= 30; tick += 3) {
        const n = structuredClone(s); n.simulation.tick = tick; n.simulation.revision = tick;
        n.simulation.units[0].xFp = x + tick * 256; buffer.accept(n, tick * 1000 / 30);
        assert.ok(buffer.sampleCount <= 2);
        assert.equal(buffer.frame(tick * 1000 / 30).state.units[0].x, x / 256 + tick - 3);
    }
    assert.equal(buffer.frame(1100).state.units[0].x, x / 256 + 30);
    assert.equal(buffer.frame(1200).stale, false);
    assert.equal(buffer.frame(1200.01).stale, true);
    assert.equal(buffer.frame(2000).state.units[0].x, x / 256 + 30);
    const gap = structuredClone(s); gap.simulation.tick = 40; gap.simulation.revision = 40;
    gap.simulation.units[0].xFp = x + 40 * 256; buffer.accept(gap, 2100);
    assert.equal(buffer.sampleCount, 1);
    assert.equal(buffer.frame(2100).state.units[0].x, x / 256 + 40);
});

test('V8 phase, terminal and paused boundaries flush samples immediately; old packets do not refresh age', () => {
    const s = snapshot(); const buffer = new V8SnapshotBuffer(); buffer.accept(s, 0);
    const n = structuredClone(s); n.simulation.tick = 3; n.simulation.revision = 3;
    n.simulation.phase = 'retreat'; n.simulation.units[0].xFp += 768;
    assert.equal(buffer.accept(n, 100).boundary, true); assert.equal(buffer.sampleCount, 1);
    assert.equal(buffer.frame(100).state.units[0].x, n.simulation.units[0].xFp / 256);
    assert.equal(buffer.accept(s, 250).accepted, false); assert.equal(buffer.frame(301).stale, true);
    n.paused = true; n.simulation.revision++; buffer.accept(n, 350);
    assert.equal(buffer.frame(99999).stale, false);
    n.status = 'completed'; n.simulation.phase = 'finished'; n.simulation.revision++;
    buffer.accept(n, 100000); assert.equal(buffer.sampleCount, 1);
});

test('V8 Jump and free-facing controls stay >=48px and separated across safe phone layouts', () => {
    for (const [width, height] of [[360,640],[390,844],[412,915],[844,390],[800,300]]) {
        const layout = computeCombatLayout(width, height, { top: 11, right: 7, bottom: 13, left: 5 });
        const extra = computeV8ExtraControls(layout);
        const all = [...Object.values(extra), layout.movementZone, layout.aimZone, layout.actionZone];
        for (const rect of Object.values(extra)) {
            assert.ok(rect.width >= 48 && rect.height >= 48);
            assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height);
            for (const other of all.filter((r) => r !== rect)) {
                assert.equal(rect.x < other.x + other.width && rect.x + rect.width > other.x &&
                    rect.y < other.y + other.height && rect.y + rect.height > other.y, false);
            }
        }
    }
});

test('V8 same-tick revision acks and duplicate snapshots cannot reset lag or freshness', () => {
    const s = snapshot(); const buffer = new V8SnapshotBuffer(); buffer.accept(s, 0);
    s.simulation.tick = 3; s.simulation.revision = 3; s.simulation.units[0].xFp += 768;
    buffer.accept(s, 100);
    const at150 = buffer.frame(150).state.units[0].x;
    s.simulation.revision++; buffer.accept(s, 150);
    assert.equal(buffer.frame(150).state.units[0].x, at150);
    assert.equal(buffer.sampleCount, 2);
    assert.equal(buffer.accept(s, 290).accepted, false);
    assert.equal(buffer.frame(300).stale, false); assert.equal(buffer.frame(301).stale, true);
});

test('V8 fixture walking has continuing snapshots, release neutralizes; Jump release has no barrier', async () => {
    let now = 0; let pump = () => {};
    const args = await createActionTurnsV8Fixture(1, 'wizard', {
        now: () => now, every: (callback) => { pump = callback; return () => { pump = () => {}; }; }
    });
    let current = args.snapshot; const unsubscribe = args.onSnapshot!((next) => { current = next; });
    const start = current.simulation.units[0].xFp;
    await args.submitIntent({ type: 'walk_start', direction: 1 });
    for (let i = 0; i < 30; i++) { now += 1000 / 30 + 0.001; pump(); }
    assert.equal(current.simulation.tick, 30);
    // The unchanged V7 opening has relief; contact may stop travel, not the hold.
    assert.ok(current.simulation.units[0].xFp > start);
    assert.ok(current.simulation.units[0].xFp <= start + 30 * 256);
    assert.equal(current.simulation.heldDirection, 1);
    assert.ok(current.simulation.acceptedIntentCount >= 10);
    await args.cancelInput(); const stopped = current.simulation.units[0].xFp;
    for (let i = 0; i < 3; i++) { now += 1000 / 30 + 0.001; pump(); }
    assert.equal(current.simulation.units[0].xFp, stopped);
    await args.submitIntent({ type: 'face', direction: -1 });
    const jumped = await args.submitIntent({ type: 'jump' });
    assert.equal(jumped.simulation.units[0].airDrive, 'jump');
    // No pad ownership/lease is created by the one-tap button, so normal up is inert.
    assert.equal(jumped.simulation.heldDirection, 0);
    for (let i = 0; i < 3; i++) { now += 1000 / 30 + 0.001; pump(); }
    assert.equal(current.simulation.units[0].xFp, stopped - 3 * 256);
    await args.cancelInput(); const cancelled = current.simulation.units[0].xFp;
    for (let i = 0; i < 3; i++) { now += 1000 / 30 + 0.001; pump(); }
    assert.equal(current.simulation.units[0].xFp, cancelled); unsubscribe();
});

test('V8 fixture permits 30 due ticks plus fraction, expires31; detached gestures never return', async () => {
    for (const [time, expired] of [[1000.01, false], [1033.334, true]] as const) {
        let now = 0; let pump = () => {};
        const args = await createActionTurnsV8Fixture(1, 'wizard', {
            now: () => now, every: (callback) => { pump = callback; return () => {}; }
        });
        let current = args.snapshot; const off = args.onSnapshot!((s) => { current = s; });
        await args.submitIntent({ type: 'walk_start', direction: 1 });
        now = time; pump();
        assert.equal(current.simulation.phase === 'finished', expired);
        if (!expired) assert.equal(current.simulation.tick, 6);
        off();
    }
    let now = 0; let pump = () => {};
    const args = await createActionTurnsV8Fixture(1, 'wizard', {
        now: () => now, every: (callback) => { pump = callback; return () => {}; }
    });
    const off = args.onSnapshot!(() => {}); await args.submitIntent({ type: 'walk_start', direction: 1 }); off();
    let current = args.snapshot; const offAgain = args.onSnapshot!((s) => { current = s; });
    now = 100; pump(); assert.equal(current.simulation.heldDirection, 0); offAgain();
});

test('V8 fixture rejects input and pause while catch-up debt remains, never queues Jump', async () => {
    for (const operation of ['jump', 'pause'] as const) {
        let now = 0; let pump = () => {};
        const args = await createActionTurnsV8Fixture(1, 'wizard', {
            now: () => now, every: (callback) => { pump = callback; return () => {}; }
        });
        let current = args.snapshot; const off = args.onSnapshot!((s) => { current = s; });
        now = 500;
        await assert.rejects(operation === 'jump' ? args.submitIntent({ type: 'jump' }) : args.setPaused!(true), /catching up/);
        assert.equal(current.simulation.tick, 6);
        assert.equal(current.simulation.units[0].airDrive, null); assert.equal(current.paused, false);
        pump(); pump(); assert.equal(current.simulation.tick, 15);
        assert.equal(current.simulation.units[0].airDrive, null);
        const next = await args.submitIntent({ type: 'jump' }); assert.equal(next.simulation.units[0].airDrive, 'jump');
        off();
    }
});
