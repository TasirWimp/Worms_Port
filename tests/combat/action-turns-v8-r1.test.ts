import assert from 'node:assert/strict';
import test from 'node:test';
import { UnifiedMovementInputController, type MovementFactsR1 } from '../../client/src/combat/input';
import { clientPointToGame } from '../../client/src/lib/sideways';
import { createActionTurnsV8Fixture } from '../../client/src/combat/fixture';
import { V8SnapshotBuffer, V8PresentationFeedback, wizardAnimationFor, projectCombatV8 } from '../../client/src/combat/presentation';
import { WIZARD_ANIMATION_KEYS } from '../../client/src/combat/approved-assets';
import { ChallengeSnapshotV8FamilySchema } from '../../shared/protocol-v8';

const pad = { x: 100, y: 200, width: 112, height: 112 };
const origin = { x: 156, y: 256 };
const ready: MovementFactsR1 = { grounded: true, facing: 1, heldDirection: 0, lane: 'ready' };
function gesture(x = origin.x) {
    const input = new UnifiedMovementInputController();
    assert.equal(input.beginMovement(1, { x, y: origin.y }, pad), true);
    return input;
}
function move(input: UnifiedMovementInputController, dx: number, dy: number, facts = ready, now = 0) {
    input.moveMovement(1, { x: origin.x + dx, y: origin.y + dy }, facts, now);
    const intent = input.movementIntent(facts, now);
    if (intent) input.submittedMovementIntent(intent);
    return intent;
}

test('V8 r1 stationary side taps face only; center and displacement history cannot become taps', () => {
    for (const [x, direction] of [[124, -1], [188, 1], [156, null]] as const) {
        const input = gesture(x);
        assert.equal(input.finishMovement(1)?.face, direction);
        assert.equal(input.ownedPointer(), null);
        assert.equal(input.finishMovement(1), null);
    }
    const dragged = gesture();
    move(dragged, 30, 0); move(dragged, 0, 0);
    assert.deepEqual(dragged.finishMovement(1), { face: null, release: true });
    const jitter = gesture(124);
    jitter.moveMovement(1, { x: 134, y: 256 }, ready, 1);
    jitter.moveMovement(1, { x: 124, y: 256 }, ready, 2);
    assert.equal(jitter.finishMovement(1)?.release, true, 'exact 10px is not a tap');
});

test('V8 r1 walking is immediate at10px, clamped beyond-ring, and center/reversal retain one finger', () => {
    const input = gesture();
    assert.equal(move(input, 9.99, 0), null);
    assert.deepEqual(move(input, 10, 0), { type: 'walk_start', direction: 1 });
    assert.equal(move(input, 9999, 500, { ...ready, heldDirection: 1 }), null);
    assert.deepEqual(move(input, 0, 0, { ...ready, heldDirection: 1 }), { type: 'walk_stop' });
    assert.equal(input.ownedPointer()?.id, 1);
    assert.deepEqual(move(input, -10, 0), { type: 'walk_start', direction: -1 });
    assert.deepEqual(move(input, 10, 0, { ...ready, heldDirection: -1 }), { type: 'walk_start', direction: 1 });
});

test('V8 r1 simultaneous diagonal crossing is one atomic jump and pure up captures facing', () => {
    for (const [dx, facing, direction] of [[40, -1, 1], [-40, 1, -1], [0, -1, -1]] as const) {
        const input = gesture();
        assert.deepEqual(move(input, dx, -24, { ...ready, facing }), { type: 'jump', direction });
        assert.equal(move(input, -dx, -80), null);
        assert.deepEqual(input.finishMovement(1), { face: null, release: true });
    }
});

test('V8 r1 live-up eligibility waits only for a current locomotion flight, not a stored payload', () => {
    const input = gesture();
    assert.deepEqual(move(input, 20, 0), { type: 'walk_start', direction: 1 });
    assert.equal(move(input, 20, -30, { ...ready, lane: 'locomotion' }, 10), null);
    input.moveMovement(1, { x: origin.x - 30, y: origin.y - 35 }, { ...ready, lane: 'locomotion' }, 100);
    assert.deepEqual(input.movementIntent({ ...ready, heldDirection: 1 }, 259), { type: 'jump', direction: -1 });
    input.submittedMovementIntent({ type: 'jump', direction: -1 });
    assert.equal(input.movementIntent(ready, 260), null);
});

test('V8 r1 live-up eligibility expires at250ms and every invalidation forbids later landing/release dispatch', () => {
    for (const reason of ['deadline', 'lower', 'airborne', 'interrupt', 'release', 'blocked'] as const) {
        const input = gesture();
        move(input, 0, -30, { ...ready, lane: reason === 'blocked' ? 'blocked' : 'locomotion' }, 10);
        if (reason === 'lower') move(input, 0, -20, { ...ready, lane: 'locomotion' }, 20);
        if (reason === 'airborne') input.observeGrounded(false);
        if (reason === 'interrupt') input.interrupt();
        if (reason === 'release') input.finishMovement(1);
        input.observeGrounded(true);
        assert.equal(input.movementIntent(ready, reason === 'deadline' ? 260 : 30), null, reason);
        input.moveMovement(1, { x: origin.x, y: origin.y - 40 }, ready, 300);
        assert.equal(input.movementIntent(ready, 300), null, `${reason} cannot re-arm`);
    }
});

test('V8 r1 airborne gestures never steer or buffer a walk/hop for landing', () => {
    const input = gesture();
    assert.equal(move(input, -40, -30, { ...ready, grounded: false }), null);
    input.observeGrounded(true);
    assert.equal(input.movementIntent(ready, 100), null);
    assert.equal(move(input, -40, -40), null, 'the first upward opportunity was discarded');
});

test('V8 r1 release outside and wrong pointer have no late gesture action', () => {
    const input = gesture(); move(input, 9999, 0);
    assert.equal(input.finishMovement(2), null);
    assert.equal(input.ownedPointer()?.id, 1);
    assert.deepEqual(input.finishMovement(1), { face: null, release: true });
    assert.equal(input.movementIntent(ready, 1), null);
    assert.equal(input.moveMovement(1, { x: 0, y: 0 }, ready, 1), false);
});

test('V8 r1 logical up and sides preserve right/left/off sideways axes', () => {
    const rect = { left: 10, top: 20, right: 400, bottom: 864, width: 390, height: 844 };
    for (const [mode, from, to] of [
        ['off', { x: 150, y: 250 }, { x: 180, y: 220 }],
        ['right', { x: 150, y: 250 }, { x: 180, y: 280 }],
        ['left', { x: 150, y: 250 }, { x: 120, y: 220 }]
    ] as const) {
        const a = clientPointToGame(from, rect, mode === 'off' ? null : mode);
        const b = clientPointToGame(to, rect, mode === 'off' ? null : mode);
        assert.equal(b.x - a.x, 30); assert.equal(b.y - a.y, -30);
    }
});

test('V8 r1 fixture uses exact identity, directed hop, soft release and hard interruption', async () => {
    let now = 0; let pump = () => {};
    const args = await createActionTurnsV8Fixture(1, 'wizard', {
        now: () => now, every: callback => { pump = callback; return () => {}; }
    }, 'nimble-knots-artillery-v8-r1');
    let current = args.snapshot; const off = args.onSnapshot!(snapshot => { current = snapshot; });
    assert.equal(ChallengeSnapshotV8FamilySchema.safeParse(current).success, true);
    assert.equal(current.rulesetId, 'nimble-knots-artillery-v8-r1');
    await assert.rejects(args.submitIntent({ type: 'jump' }), /intent/i);
    await args.submitIntent({ type: 'jump', direction: -1 });
    const epoch = current.simulation.inputEpoch;
    await args.releaseMovement!();
    assert.equal(current.simulation.inputEpoch, epoch + 1);
    assert.equal(current.simulation.units[0].vxFp, -256);
    const x = current.simulation.units[0].xFp;
    now += 100.001; pump();
    assert.ok(current.simulation.units[0].xFp < x);
    await args.cancelInput(); const stopped = current.simulation.units[0].xFp;
    now += 100.001; pump();
    assert.equal(current.simulation.units[0].xFp, stopped);
    off();
});

test('V8 r1 gesture boundaries cancel live-up eligibility, and presentation cannot mix identities', async () => {
    const args = await createActionTurnsV8Fixture(1, 'wizard', { now: () => 0, every: () => () => {} }, 'nimble-knots-artillery-v8-r1');
    for (const field of ['challengeId', 'turn', 'phase', 'epoch', 'actor', 'paused', 'status'] as const) {
        const input = gesture(); input.synchronize(args.snapshot);
        move(input, 0, -30, { ...ready, lane: 'locomotion' });
        const next = structuredClone(args.snapshot);
        if (field === 'challengeId') next.challengeId += 'x';
        if (field === 'turn') next.simulation.turn++;
        if (field === 'phase') next.simulation.phase = 'retreat';
        if (field === 'epoch') next.simulation.inputEpoch++;
        if (field === 'actor') next.simulation.activeActor = 'loomkeeper';
        if (field === 'paused') next.paused = true;
        if (field === 'status') next.status = 'expired';
        assert.equal(input.synchronize(next), true);
        assert.equal(input.movementIntent(ready, 10), null);
    }
    const buffer = new V8SnapshotBuffer(); buffer.accept(args.snapshot, 0);
    const old = (await createActionTurnsV8Fixture(1, 'wizard', { now: () => 0, every: () => () => {} })).snapshot;
    old.simulation.revision = 100;
    assert.equal(buffer.accept(old, 100).accepted, false);
});

test('V8 r1 fixture expires at the129th lifecycle release instead of silently ignoring the cap', async () => {
    const args = await createActionTurnsV8Fixture(1, 'wizard', { now: () => 0, every: () => () => {} }, 'nimble-knots-artillery-v8-r1');
    for (let i = 0; i < 128; i++) {
        const state = await args.releaseMovement!();
        assert.ok(state); assert.equal(state.simulation.phase, 'action');
    }
    const expired = await args.releaseMovement!();
    assert.ok(expired); assert.equal(expired.simulation.phase, 'finished');
    assert.equal(expired.simulation.winner, 'draw'); assert.equal(expired.simulation.finishReason, 'simulation_limit');
});

test('V8D hit receipts last 2500ms while reporting newest authoritative health for either actor', async () => {
    const before = (await createActionTurnsV8Fixture(1, 'wizard', { now: () => 0, every: () => () => {} }, 'nimble-knots-artillery-v8-r1')).snapshot;
    const next = structuredClone(before); next.simulation.revision++;
    next.simulation.units[0].stitching = 81; next.simulation.units[1].stitching = 68;
    const feedback = new V8PresentationFeedback();
    feedback.observe(before, next, 100, true);
    assert.equal(feedback.message(next, 2599), 'You −19 · 81 Stitching | Loomkeeper −32 · 68 Stitching');
    const latest = structuredClone(next); latest.simulation.units[0].stitching = 77;
    assert.match(feedback.message(latest, 200), /You −19 · 77 Stitching/);
    feedback.observe(next, next, 2000, true);
    assert.equal(feedback.message(next, 2600), '', 'duplicate never extends receipt');
    assert.equal(before.simulation.units[0].stitching, 100);
});

test('V8D observed defeat waits for actual completion and 1000ms aftermath only once', async () => {
    const before = (await createActionTurnsV8Fixture(1, 'wizard', { now: () => 0, every: () => () => {} }, 'nimble-knots-artillery-v8-r1')).snapshot;
    for (const actor of [0, 1] as const) {
        const next = structuredClone(before); next.simulation.revision++;
        next.status = 'completed'; next.simulation.phase = 'finished'; next.simulation.finishReason = 'unravelled';
        next.simulation.units[actor].alive = false; next.simulation.units[actor].stitching = 0;
        const feedback = new V8PresentationFeedback(); feedback.observe(before, next, 100, true);
        assert.equal(feedback.resultReadyAt(next, 500), Infinity);
        const duplicate = structuredClone(next); duplicate.simulation.revision++;
        feedback.observe(next, duplicate, 2500, true);
        const id = next.simulation.units[actor].id;
        feedback.advanceDefeat({ [id]: { key: WIZARD_ANIMATION_KEYS.unravel, frame: 23, complete: false } }, 3100);
        assert.equal(feedback.resultReadyAt(duplicate, 3100), Infinity, 'wall time cannot complete a slow engine animation');
        assert.deepEqual(feedback.defeatedActors(4100), [id]);
        feedback.advanceDefeat({ [id]: { key: WIZARD_ANIMATION_KEYS.unravel, frame: 25, complete: true } }, 4200);
        assert.equal(feedback.resultReadyAt(duplicate, 4200), 5200);
        feedback.advanceDefeat({ [id]: { key: WIZARD_ANIMATION_KEYS.unravel, frame: 25, complete: true } }, 4900);
        assert.equal(feedback.resultReadyAt(duplicate, 5199), 5200, 'duplicate completion cannot extend aftermath');
        assert.deepEqual(feedback.defeatedActors(5199), [id]);
        assert.deepEqual(feedback.defeatedActors(5200), []);
        feedback.clear(); assert.equal(feedback.resultReadyAt(next, 600), 600);
        feedback.observe(before, next, 700, false);
        assert.equal(feedback.resultReadyAt(next, 700), 700, 'unseen death has no playback delay');
        feedback.observe(next, next, 800, true);
        assert.equal(feedback.resultReadyAt(next, 800), 800, 'already-dead reconnect is not a new death');
        const other = structuredClone(next); other.challengeId += 'next'; other.simulation.revision++;
        feedback.observe(before, other, 900, true);
        assert.equal(feedback.message(other, 900), '', 'new challenge cannot inherit damage');
    }
});

test('V8D double defeat requires both completions; missing or stalled animation has an explicit bounded fallback', async () => {
    const before = (await createActionTurnsV8Fixture(1, 'wizard', { now: () => 0, every: () => () => {} }, 'nimble-knots-artillery-v8-r1')).snapshot;
    const next = structuredClone(before); next.simulation.revision++;
    next.status = 'completed'; next.simulation.phase = 'finished'; next.simulation.finishReason = 'unravelled';
    for (const unit of next.simulation.units) { unit.alive = false; unit.stitching = 0; }
    const complete = { key: WIZARD_ANIMATION_KEYS.unravel, frame: 25, complete: true };
    const playing = { ...complete, complete: false };
    const feedback = new V8PresentationFeedback(); feedback.observe(before, next, 100, true);
    feedback.advanceDefeat({ player: complete, loomkeeper: playing }, 3100);
    assert.equal(feedback.resultReadyAt(next, 3100), Infinity, 'last frame while still playing is not completion');
    feedback.advanceDefeat({ player: complete, loomkeeper: complete }, 4000);
    assert.equal(feedback.resultReadyAt(next, 4000), 5000);
    assert.equal(feedback.defeatPlayback(4999), 'aftermath');
    assert.equal(feedback.defeatPlayback(5000), 'none');
    feedback.clear(); feedback.observe(before, next, 100, true);
    feedback.advanceDefeat({ player: complete, loomkeeper: complete }, 200);
    assert.equal(feedback.resultReadyAt(next, 200), 3100, 'nominal 2000ms remains a minimum');
    for (const missing of [false, true]) {
        feedback.clear(); feedback.observe(before, next, 100, true);
        const states = { player: playing, loomkeeper: missing ? { key: 'static', frame: 0, complete: false } : playing };
        feedback.advanceDefeat(states, 8099);
        assert.equal(feedback.resultReadyAt(next, 8099), missing ? 9099 : Infinity);
        feedback.advanceDefeat(states, 8100);
        assert.equal(feedback.defeatPlayback(8100), 'unavailable');
        assert.equal(feedback.resultReadyAt(next, 8100), missing ? 9099 : 9100);
        feedback.advanceDefeat({ player: complete, loomkeeper: complete }, 8500);
        assert.equal(feedback.defeatPlayback(8500), 'unavailable', 'fallback never fabricates completion');
        feedback.clear(); assert.equal(feedback.resultReadyAt(next, 8500), 8500);
    }
});

test('V8D airborne idle outranks walking and casting, while legacy and death animation remain intact', async () => {
    const state = (await createActionTurnsV8Fixture(1, 'wizard', { now: () => 0, every: () => () => {} }, 'nimble-knots-artillery-v8-r1')).snapshot.simulation;
    state.units[0].grounded = false; state.units[0].vyFp = -256;
    const unit = projectCombatV8(state).units[0];
    assert.equal(unit.grounded, false);
    for (const kind of ['movement', 'cast-charge', 'cast-formation', 'projectile'] as const) {
        const visual = { kind, actor: 'player' as const, relicId: 'threadball' as const, trace: [], stage: 'start' as const };
        assert.equal(wizardAnimationFor(unit, visual), WIZARD_ANIMATION_KEYS.idle, kind);
    }
    unit.grounded = true;
    assert.equal(wizardAnimationFor(unit, { kind: 'movement', actor: 'player' }), WIZARD_ANIMATION_KEYS.walk);
    delete unit.grounded;
    assert.equal(wizardAnimationFor(unit, { kind: 'movement', actor: 'player' }), WIZARD_ANIMATION_KEYS.walk, 'legacy unchanged');
    unit.alive = false; unit.grounded = false;
    assert.equal(wizardAnimationFor(unit), WIZARD_ANIMATION_KEYS.unravel);
});
