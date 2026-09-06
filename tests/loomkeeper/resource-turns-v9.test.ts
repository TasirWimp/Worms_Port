import assert from 'node:assert/strict';
import test from 'node:test';

import { V9_AUTOMATION_ID } from '../../shared/combat-version';
import { advanceSimulationTicksV9, applySimulationBarrierV9, applySimulationIntentV9, cloneSimulationV9, hashSimulationStateV9, V9_RULESET_ID } from '../../shared/simulation-v9';
import { LoomkeeperExecutionV9, LoomkeeperPlannerV9, prefixFor } from '../../shared/loomkeeper-v9';
import { SimulationCoordinatorV9 } from '../../server/src/simulation/coordinator-v9';
import { setTerrainSolid } from '../../shared/simulation';

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

test('V9D real-clock planning reaches all 30 charged batches, casts, hands off, and reconstructs without debt loss', async t => {
    let epoch: number | undefined;
    const batches: number[] = []; let maximumDebt = 0;
    const coordinator = new SimulationCoordinatorV9({
        nowUs: () => epoch === undefined ? 0 : Math.floor((performance.now() - epoch) * 1_000),
        plannerFactory: state => {
            const planner = new LoomkeeperPlannerV9(state); const step = planner.step.bind(planner);
            planner.step = () => { const started = performance.now(); try { return step(); } finally { batches.push(performance.now() - started); } };
            return planner;
        }
    });
    try {
        const id = 'v9_real_clock_cadence'; coordinator.createAutomated(id, 'v9_real_clock_session', 1, 'wizard');
        coordinator.advance(id, 450); epoch = performance.now();
        while (coordinator.get(id)!.state.tick < 480 && !coordinator.get(id)!.unavailable) {
            await new Promise(resolve => setTimeout(resolve, 10));
            const elapsedTicks = Math.floor((performance.now() - epoch) * 30 / 1_000);
            maximumDebt = Math.max(maximumDebt, elapsedTicks - (coordinator.get(id)!.state.tick - 450));
            await coordinator.catchUp(id);
            assert.ok(performance.now() - epoch < 5_000, 'real-clock planning exceeded the bounded observation window');
        }
        const planned = coordinator.get(id)!;
        assert.equal(planned.unavailable, false); assert.equal(batches.length, 30);
        assert.equal((coordinator.replay(id) as any).chosenPlans.length, 1);
        assert.ok((coordinator.replay(id) as any).records.some((record: any) => record.operation.kind === 'intent' && record.operation.actor === 'loomkeeper'));
        const debtAtSelection = coordinator.dueTicks(id);
        while (coordinator.get(id)!.state.phase !== 'finished' && coordinator.get(id)!.state.turn === 1) coordinator.advance(id, 1);
        const handoff = coordinator.get(id)!; const replay = coordinator.replay(id)!;
        assert.equal(handoff.unavailable, false); assert.equal(handoff.state.turn, 2, 'the selected AI cast reaches ordinary handoff');
        assert.equal(coordinator.dueTicks(id), debtAtSelection, 'direct authority completion does not erase scheduler debt');
        const verifier = new SimulationCoordinatorV9();
        assert.equal(verifier.reconstructAndVerify(replay, { challengeId: replay.challengeId, sessionId: replay.sessionId }).stateHash, handoff.stateHash);
        verifier.dispose();
        t.diagnostic(`real-clock batches=30 maxDebt=${maximumDebt} maxBatchMs=${Math.max(...batches).toFixed(3)} debtAtSelection=${debtAtSelection}`);
    } finally { coordinator.dispose(); }
});

test('V9D Leap prefix waits for landing, uses the fresh epoch, dwells fifteen ticks, and spends no candidate debit', () => {
    const coordinator = coordinatorAtLoomkeeperAction();
    try {
        const id = 'v9_automated_challenge'; const entry = (coordinator as any).matches.get(id);
        entry.state.units[1].thread = 4; entry.state.units[1].stitching = 46;
        entry.state.terrain.words.fill(0);
        for (let x = 0; x < 256; x += 1) setTerrainSolid(entry.state.terrain, x, 40, true);
        entry.state.units[1].xFp = 480 * 256; entry.state.units[0].xFp = (480 + 641) * 256;
        for (const unit of entry.state.units) {
            unit.yFp = 308 * 256; unit.vxFp = 0; unit.vyFp = 0; unit.grounded = true;
            unit.support = 40 * 256 + Math.floor((unit.xFp / 256 - 12) / 8);
        }
        const initialThread = entry.state.units[1].thread, initialEpoch = entry.state.inputEpoch;
        coordinator.advance(id, 30);
        const afterPrefix = coordinator.get(id)!;
        assert.equal((coordinator.replay(id) as any).chosenPlans.at(-1).prefix, 'threadleap');
        assert.equal(afterPrefix.state.units[1].thread, initialThread - 2, 'only the recorded utility spends Thread');
        assert.ok(afterPrefix.state.inputEpoch > initialEpoch, 'Leap creates a fresh authority epoch');
        let landedAt = -1, firedAt = -1;
        while (coordinator.get(id)!.state.turn === 1 && coordinator.get(id)!.state.phase !== 'finished') {
            const before = coordinator.get(id)!; coordinator.advance(id, 1); const after = coordinator.get(id)!;
            if (landedAt < 0 && after.state.phase === 'action' && after.state.units.every(unit => unit.grounded && unit.vxFp === 0 && unit.vyFp === 0)) landedAt = after.state.tick;
            const operations = (coordinator.replay(id) as any).records as any[];
            const fire = operations.find(record => record.operation.kind === 'intent' && record.operation.intent.type === 'fire');
            if (fire) { firedAt = after.state.tick; break; }
            assert.equal(after.state.units[1].thread <= initialThread - 2, true, 'no speculative candidate debit occurs before Fire');
            if (after.state.tick - before.state.tick !== 1) break;
        }
        const records = (coordinator.replay(id) as any).records as any[];
        const aimRecord = records.find(record => record.operation.kind === 'intent' && record.operation.intent.type === 'aim');
        const fireRecord = records.find(record => record.operation.kind === 'intent' && record.operation.intent.type === 'fire');
        assert.ok(landedAt >= 0 && aimRecord && fireRecord && firedAt >= 0);
        const fireIndex = records.indexOf(fireRecord), ticksBetween = records.slice(records.indexOf(aimRecord) + 1, fireIndex)
            .filter(record => record.operation.kind === 'ticks').reduce((total, record) => total + record.operation.count, 0);
        assert.ok(ticksBetween >= 15, 'Fire cannot precede the fixed fifteen-tick dwell');
    } finally { coordinator.dispose(); }
});

test('V9D batch/catch-up parity retains no-plan and injected work-failure neutral handoff behavior', async () => {
    const batched = coordinatorAtLoomkeeperAction(), repeated = coordinatorAtLoomkeeperAction();
    const failed = new SimulationCoordinatorV9({ nowUs: () => 0, plannerFactory: () => { throw new Error('injected work failure'); } });
    let now = 0; const catchUp = new SimulationCoordinatorV9({ nowUs: () => now });
    try {
        const id = 'v9_automated_challenge'; batched.advance(id, 30); for (let index = 0; index < 30; index += 1) repeated.advance(id, 1);
        assert.deepEqual(batched.get(id)!.state, repeated.get(id)!.state);
        assert.deepEqual((batched.replay(id) as any).chosenPlans, (repeated.replay(id) as any).chosenPlans);
        const noPlan = coordinatorAtLoomkeeperAction(); const noPlanEntry = (noPlan as any).matches.get(id); noPlanEntry.state.units[1].thread = 0;
        noPlan.advance(id, 30); assert.deepEqual((noPlan.replay(id) as any).chosenPlans.at(-1), { turn: 1, prefix: 'none', status: 'no_legal_plan', ordinal: null });
        while (noPlan.get(id)!.state.turn === 1) noPlan.advance(id, 1);
        assert.equal(noPlan.get(id)!.state.turn, 2); noPlan.dispose();
        failed.createAutomated('v9_failed_plan_match', 'v9_failed_session', 1, 'wizard'); failed.advance('v9_failed_plan_match', 480);
        const failureReplay = failed.replay('v9_failed_plan_match') as any;
        assert.deepEqual(failureReplay.chosenPlans, [{ turn: 1, prefix: 'none', status: 'work_failure', ordinal: null }]);
        while (failed.get('v9_failed_plan_match')!.state.turn === 1) failed.advance('v9_failed_plan_match', 1);
        assert.equal(failed.get('v9_failed_plan_match')!.state.turn, 2); assert.throws(() => failed.reconstructAndVerify(failureReplay));
        catchUp.createAutomated('v9_catch_up_match', 'v9_catch_up_session', 1, 'wizard'); now = 200_000;
        await catchUp.catchUp('v9_catch_up_match'); assert.equal(catchUp.dueTicks('v9_catch_up_match'), 0);
        assert.equal(catchUp.get('v9_catch_up_match')!.state.tick, 6);
    } finally { batched.dispose(); repeated.dispose(); failed.dispose(); catchUp.dispose(); }
});

test('V9D detached planning and scheduled authority retain per-tick hashes through retreat and handoff', () => {
    const coordinator = coordinatorAtLoomkeeperAction();
    try {
        const id = 'v9_automated_challenge'; const source = cloneSimulationV9(coordinator.get(id)!.state);
        const planner = new LoomkeeperPlannerV9(source); for (let index = 0; index < 30; index += 1) planner.step();
        assert.equal(planner.selection.status, 'selected');
        let detached = advanceSimulationTicksV9(source, 30).state;
        const execution = new LoomkeeperExecutionV9(planner.selectedCandidate()!, planner.selection.prefix, detached);
        const detachedHashes: string[] = [], scheduledHashes: string[] = [], detachedOperations: Array<{ tick: number; operation: string }> = [];
        const drain = () => {
            for (let slot = 0; slot < 8; slot += 1) {
                const operation = execution.next(detached); if (!operation) break;
                const transition = operation.kind === 'intent'
                    ? applySimulationIntentV9(detached, 'loomkeeper', operation.intent, detached.turn, detached.phase, detached.inputEpoch)
                    : applySimulationBarrierV9(detached, operation.barrier);
                assert.ok(transition.accepted && transition.mutated);
                detachedOperations.push({ tick: detached.tick, operation: operation.kind === 'intent' ? operation.intent.type : operation.barrier.reason });
                detached = transition.state;
            }
        };
        coordinator.advance(id, 30); drain();
        detachedHashes.push(hashSimulationStateV9(detached)); scheduledHashes.push(coordinator.get(id)!.stateHash);
        while (detached.phase !== 'finished' && detached.turn === source.turn) {
            detached = advanceSimulationTicksV9(detached, 1).state; drain(); coordinator.advance(id, 1);
            detachedHashes.push(hashSimulationStateV9(detached)); scheduledHashes.push(coordinator.get(id)!.stateHash);
        }
        assert.deepEqual(detachedHashes, scheduledHashes);
        assert.ok(detachedOperations.some(item => item.operation === 'fire'));
        assert.ok(coordinator.replay(id)!.records.some(record => record.operation.kind === 'barrier' && record.operation.barrier.actor === 'loomkeeper'));
        const replay = coordinator.replay(id)!; const verifier = new SimulationCoordinatorV9();
        assert.equal(verifier.reconstructAndVerify(replay, { challengeId: replay.challengeId, sessionId: replay.sessionId }).stateHash, coordinator.get(id)!.stateHash);
        verifier.dispose();
    } finally { coordinator.dispose(); }
});
