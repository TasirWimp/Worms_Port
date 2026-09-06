import assert from 'node:assert/strict';
import test from 'node:test';

import { V9_AUTOMATION_ID } from '../../shared/combat-version';
import { V9_RULESET_ID } from '../../shared/simulation-v9';
import { LoomkeeperPlannerV9, prefixFor } from '../../shared/loomkeeper-v9';
import { SimulationCoordinatorV9 } from '../../server/src/simulation/coordinator-v9';

function coordinatorAtLoomkeeperAction(): SimulationCoordinatorV9 {
    const coordinator = new SimulationCoordinatorV9();
    coordinator.createAutomated('v9_automated_challenge', 'v9_automated_session', 1, 'wizard');
    // The player takes no action; ordinary V9 history hands off to the Loomkeeper.
    while (coordinator.get('v9_automated_challenge')!.state.activeActor !== 'loomkeeper') coordinator.advance('v9_automated_challenge', 1);
    return coordinator;
}

test('V9D records an automated plan before the charged prefix can debit authority', () => {
    const coordinator = coordinatorAtLoomkeeperAction();
    const entry = (coordinator as any).matches.get('v9_automated_challenge');
    entry.state.units[1].thread = 4;
    entry.state.units[1].stitching = 45;
    const before = coordinator.get('v9_automated_challenge')!.state;

    coordinator.advance('v9_automated_challenge', 29);
    const tick29 = coordinator.get('v9_automated_challenge')!.state;
    assert.equal(tick29.units[1].thread, before.units[1].thread);
    assert.equal(tick29.utilityUsed, false);
    assert.equal(tick29.inputEpoch, before.inputEpoch);
    assert.deepEqual((coordinator.replay('v9_automated_challenge') as any).chosenPlans, []);

    coordinator.advance('v9_automated_challenge', 1);
    const proof = coordinator.replay('v9_automated_challenge') as any;
    const selected = proof.chosenPlans.at(-1);
    assert.equal(proof.formatVersion, 9);
    assert.equal(proof.rulesetId, V9_RULESET_ID);
    assert.equal(proof.automationId, V9_AUTOMATION_ID);
    assert.equal(selected.status, 'selected');
    assert.equal(selected.prefix, 'threadguard');
    const prefixIndex = proof.records.findIndex((record: any) => record.operation.kind === 'intent' && record.operation.intent.type === 'threadguard');
    assert.ok(prefixIndex >= 0);
    assert.ok(proof.records.findIndex((record: any) => record.operation.kind === 'ticks') >= 0);
    assert.equal(coordinator.get('v9_automated_challenge')!.state.units[1].thread, 2);
    assert.equal(coordinator.get('v9_automated_challenge')!.state.utilityUsed, true);
    coordinator.dispose();
});

test('V9D reconstruction regenerates the automation envelope and rejects stripping or tampering', () => {
    const coordinator = coordinatorAtLoomkeeperAction();
    coordinator.advance('v9_automated_challenge', 30);
    const proof = coordinator.replay('v9_automated_challenge') as any;
    const verifier = new SimulationCoordinatorV9();
    assert.doesNotThrow(() => verifier.reconstructAndVerify(proof, { challengeId: proof.challengeId, sessionId: proof.sessionId }));
    const stripped = structuredClone(proof); delete stripped.automationId; delete stripped.chosenPlans;
    // A stripped envelope can still reconstruct only as ordinary V9 combat history;
    // callers must inspect the strict automated shape before treating it as proof.
    const ordinary = verifier.reconstructAndVerify(stripped, { challengeId: proof.challengeId, sessionId: proof.sessionId });
    assert.equal('automationId' in ordinary, false);
    const changed = structuredClone(proof); changed.chosenPlans[0].ordinal = (changed.chosenPlans[0].ordinal + 1) % 180;
    assert.throws(() => verifier.reconstructAndVerify(changed, { challengeId: proof.challengeId, sessionId: proof.sessionId }));
    coordinator.dispose(); verifier.dispose();
});

test('V9D prefix predicate uses inclusive Guard health and fixed-point Leap separation', () => {
    const coordinator = coordinatorAtLoomkeeperAction();
    const state = coordinator.get('v9_automated_challenge')!.state;
    state.units[1].thread = 4; state.units[1].stitching = 44;
    state.units[1].xFp = 480 * 256; state.units[0].xFp = 480 * 256 + 640 * 256 + 1;
    assert.equal(prefixFor(state), 'threadguard');
    state.units[1].stitching = 46;
    assert.equal(prefixFor(state), 'threadleap');
    state.units[0].xFp = 480 * 256 + 640 * 256;
    assert.equal(prefixFor(state), 'none');
    coordinator.dispose();
});

test('V9D charges the complete 180-slot lattice before selection and keeps the charged boundary at tick 30', () => {
    const coordinator = coordinatorAtLoomkeeperAction();
    const entry = (coordinator as any).matches.get('v9_automated_challenge');
    entry.state.units[1].thread = 4;
    entry.state.units[1].stitching = 45;
    const detached = new LoomkeeperPlannerV9(structuredClone(entry.state));
    for (let tick = 0; tick < 29; tick += 1) detached.step();
    assert.equal(detached.planningTicks, 29);
    assert.equal(detached.evaluatedCandidates, 174);
    assert.equal(detached.rolloutTicks <= 189_000, true);
    coordinator.advance('v9_automated_challenge', 29);
    assert.deepEqual((coordinator.replay('v9_automated_challenge') as any).chosenPlans, []);
    detached.step();
    assert.equal(detached.planningTicks, 30);
    assert.equal(detached.evaluatedCandidates, 180);
    assert.equal(detached.selection.status, 'selected');
    coordinator.advance('v9_automated_challenge', 1);
    const scheduled = (coordinator.replay('v9_automated_challenge') as any).chosenPlans.at(-1);
    assert.deepEqual(scheduled, { turn: 1, ...detached.selection });
    coordinator.dispose();
});

test('V9D shared immutable prefixes preserve the frozen selected plan and automated replay trace', () => {
    const cached = new SimulationCoordinatorV9();
    const uncached = new SimulationCoordinatorV9({ plannerFactory: state => new LoomkeeperPlannerV9(state, { reuseIdenticalPrefixes: false }) });
    try {
        for (const coordinator of [cached, uncached]) {
            coordinator.createAutomated('v9_prefix_parity', 'v9_prefix_parity_session', 1, 'wizard');
            while (coordinator.get('v9_prefix_parity')!.state.activeActor !== 'loomkeeper') coordinator.advance('v9_prefix_parity', 1);
            // Stop at this AI turn's handoff so the trace contains one full
            // charged selection/execution but cannot begin a second AI plan.
            while (coordinator.get('v9_prefix_parity')!.state.phase !== 'finished' &&
                coordinator.get('v9_prefix_parity')!.state.activeActor === 'loomkeeper') coordinator.advance('v9_prefix_parity', 1);
        }
        const cachedReplay = cached.replay('v9_prefix_parity') as any;
        const uncachedReplay = uncached.replay('v9_prefix_parity') as any;
        assert.deepEqual(cachedReplay.chosenPlans, uncachedReplay.chosenPlans);
        assert.deepEqual(cachedReplay.records, uncachedReplay.records);
        assert.deepEqual(cached.get('v9_prefix_parity')!.state, uncached.get('v9_prefix_parity')!.state);
        assert.ok(cachedReplay.chosenPlans.length > 0, 'the compared trace reaches a real charged selection');
    } finally { cached.dispose(); uncached.dispose(); }
});

test('V9D published automated snapshots follow the charged batch without a duplicate intermediate callback', () => {
    const updates: number[] = [];
    const coordinator = new SimulationCoordinatorV9({ onTransition: update => updates.push(update.state.tick) });
    coordinator.createAutomated('v9_callback_challenge', 'v9_callback_session', 1, 'wizard');
    while (coordinator.get('v9_callback_challenge')!.state.activeActor !== 'loomkeeper') coordinator.advance('v9_callback_challenge', 1);
    updates.length = 0;
    coordinator.advance('v9_callback_challenge', 30);
    assert.deepEqual(updates, [...new Set(updates)]);
    assert.ok(updates.includes(coordinator.get('v9_callback_challenge')!.state.tick));
    assert.ok(updates.every((tick) => tick % 3 === 0));
    coordinator.dispose();
});

test('V9D selection capacity failure terminalizes before a live prefix debit', () => {
    const probe = coordinatorAtLoomkeeperAction();
    const initialBytes = Buffer.byteLength(JSON.stringify(probe.replay('v9_automated_challenge')), 'utf8');
    probe.dispose();
    const coordinator = new SimulationCoordinatorV9({ maxReplayBytes: initialBytes + 512 });
    coordinator.createAutomated('v9_capacity_challenge', 'v9_capacity_session', 1, 'wizard');
    while (coordinator.get('v9_capacity_challenge')!.state.activeActor !== 'loomkeeper') coordinator.advance('v9_capacity_challenge', 1);
    const entry = (coordinator as any).matches.get('v9_capacity_challenge'); entry.state.units[1].thread = 4; entry.state.units[1].stitching = 45;
    coordinator.advance('v9_capacity_challenge', 30);
    const state = coordinator.get('v9_capacity_challenge')!.state;
    assert.equal(state.units[1].thread, 4);
    assert.equal(state.utilityUsed, false);
    assert.equal(state.phase, 'finished');
    assert.deepEqual((coordinator.replay('v9_capacity_challenge') as any).chosenPlans, []);
    coordinator.dispose();
});
