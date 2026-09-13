import assert from 'node:assert/strict';
import test from 'node:test';
import { io } from 'socket.io-client';
import { bootstrapSession } from '../../client/src/lib/session';
import { ResourceTurnsV9Client, ResourceTurnsV9Lifecycle } from '../../client/src/practice/resource-turns-v9';
import { SimulationCoordinatorV9 } from '../../server/src/simulation/coordinator-v9';
import { createRuntimeServer } from '../../server/src/runtime';
import { V9_AUTOMATION_ID } from '../../shared/combat-version';
import { V9_RULESET_ID } from '../../shared/simulation-v9';
import { protocolEventsV9 } from '../../shared/protocol-v9';

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
    assert.equal(lifecycle.ready, true);
    assert.equal(lifecycle.canPause(), true);
    const before = lifecycle.generation; lifecycle.disconnect();
    assert.equal(lifecycle.generation, before + 1);
    assert.equal(lifecycle.ready, false);
    assert.equal(lifecycle.acceptSnapshot(snapshot('practice', 0), 'foreign_session'), undefined);
    assert.equal(lifecycle.pauseUnavailableReason(), 'Reconnect and wait for a fresh authoritative snapshot.');
    assert.equal(lifecycle.acceptSnapshot(snapshot('reward', 1), 'v9_client_session_01'), undefined);
    assert.equal(lifecycle.acceptSnapshot(snapshot('practice', 0), 'v9_client_session_01', true)?.nextSequence, 0);
    assert.equal(lifecycle.ready, true, 'only an exact owned resync restores input authority');
    const rewarded = new ResourceTurnsV9Lifecycle();
    rewarded.acceptSnapshot(snapshot('reward', 1), 'v9_client_session_01');
    assert.equal(rewarded.canPause(), false);
    assert.equal(rewarded.pauseUnavailableReason(), 'Rewarded candidate matches cannot pause.');
});

test('V9 candidate client uses tagged create/input/cancel/release/pause/leave acknowledgements', async () => {
    const values = new Map<string, string>();
    Object.assign(globalThis, { window: { setTimeout, clearTimeout }, sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key)
    } });
    const runtime = createRuntimeServer({ allowMissingOrigin: true, sessionRegistry: {
        simulationRulesetId: V9_RULESET_ID, simulationTickIntervalMs: false, v9TestOnly: { nowUs: () => 0 }
    } });
    const port = await runtime.listen(); const socket = io(`http://127.0.0.1:${port}`, { transports: ['websocket'] });
    let client: ResourceTurnsV9Client | undefined;
    try {
        const opened = await bootstrapSession(socket);
        client = new ResourceTurnsV9Client(socket, () => opened, { sessionId: opened.sessionId, nextSequence: 0 });
        const created = await client.start('practice', 'wizard');
        assert.equal(created.protocolVersion, 9);
        assert.equal(client.inputReady(), true);
        const faced = await client.submit({ type: 'face', direction: -1 });
        assert.equal(faced.simulation.units[0].facing, -1);
        await client.cancelInput();
        await client.releaseMovement();
        const paused = await client.setPaused(true);
        assert.equal(paused.paused, true);
        const result = await client.leave();
        assert.equal(result.outcome, 'left');
        const restarted = await client.start('practice', 'wizard');
        assert.notEqual(restarted.challengeId, created.challengeId);
        assert.equal(client.inputReady(), true, 'retry establishes fresh challenge ownership');
        const serverSocket = [...runtime.io.sockets.sockets.values()][0];
        serverSocket.emit(protocolEventsV9.result, result);
        await new Promise(resolve => setTimeout(resolve, 30));
        assert.equal(client.inputReady(), true, 'late result from old challenge cannot terminalize retry');
        await client.submit({ type: 'face', direction: 1 });
    } finally { client?.dispose(); socket.close(); await runtime.close(); }
});
