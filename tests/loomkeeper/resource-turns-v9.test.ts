import assert from 'node:assert/strict';
import test from 'node:test';

import { V9_AUTOMATION_ID } from '../../shared/combat-version';
import { V9_RULESET_ID } from '../../shared/simulation-v9';
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
