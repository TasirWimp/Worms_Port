import assert from 'node:assert/strict';
import test from 'node:test';
import { ResourceTurnsV9Lifecycle } from '../../client/src/practice/resource-turns-v9';
import { SimulationCoordinatorV9 } from '../../server/src/simulation/coordinator-v9';
import { V9_AUTOMATION_ID } from '../../shared/combat-version';

function snapshot(mode: 'practice' | 'reward', sequence = 0) {
    const coordinator = new SimulationCoordinatorV9();
    const created = coordinator.createAutomated('v9_client_challenge_01', 'v9_client_session_01', 1, 'wizard');
    const value = { protocolVersion: 9 as const, serverTimeMs: 0, sessionId: created.sessionId, challengeId: created.challengeId,
        rulesetId: created.state.rulesetId, automationId: V9_AUTOMATION_ID, loomkeeperPolicyId: 'nimble-knots-loomkeeper-v4',
        loomkeeperProfileId: 'standard-v9-0', mode, calling: 'wizard' as const, status: 'active' as const, paused: false,
        nextSequence: sequence, nextInputSequence: 0, expiresAt: '2099-01-01T00:00:00.000Z', simulation: created.state, stateHash: created.stateHash };
    coordinator.dispose(); return value;
}
test('V9D client lifecycle retires stale ownership and distinguishes Practice from reward pause', () => {
    const lifecycle = new ResourceTurnsV9Lifecycle();
    assert.equal(lifecycle.acceptSnapshot(snapshot('practice'), 'v9_client_session_01')?.challengeId, 'v9_client_challenge_01');
    assert.equal(lifecycle.canPause(), true);
    const before = lifecycle.generation; lifecycle.disconnect();
    assert.equal(lifecycle.generation, before + 1);
    assert.equal(lifecycle.acceptSnapshot(snapshot('practice', 0), 'foreign_session'), undefined);
    assert.equal(lifecycle.pauseUnavailableReason(), 'Reconnect and wait for a fresh authoritative snapshot.');
    lifecycle.acceptSnapshot(snapshot('reward', 1), 'v9_client_session_01');
    assert.equal(lifecycle.canPause(), false);
    assert.equal(lifecycle.pauseUnavailableReason(), 'Rewarded candidate matches cannot pause.');
});
