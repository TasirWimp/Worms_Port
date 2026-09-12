import assert from 'node:assert/strict';
import test from 'node:test';
import { SessionRegistry } from '../../server/src/session/registry';
import { LiveSimulationCoordinatorV10 } from '../../server/src/simulation/coordinator-v10-live';
import { VersionedSimulationCoordinator } from '../../server/src/simulation/versioned-coordinator';
import { ChallengeCreateV10Schema } from '../../shared/protocol-v10-live';
import { CoordinatorReplayV10Schema } from '../../shared/protocol-v10';
import { V10_AUTOMATION_ID } from '../../shared/combat-version';
import { V10_R5_RULESET_ID } from '../../shared/simulation-v10';

const request = { requestId: 'volcanic_request_001', sequence: 0, mode: 'practice', calling: 'wizard', rulesetId: V10_R5_RULESET_ID, automationId: V10_AUTOMATION_ID };

test('volcanic live admission rejects rewards, old versions and forged extras', () => {
    assert.equal(ChallengeCreateV10Schema.safeParse(request).success, true);
    for (const change of [{ mode: 'reward' }, { rulesetId: 'nimble-knots-artillery-v10-r4' }, { eligibilityToken: 'a'.repeat(43) }, { automationId: undefined }])
        assert.equal(ChallengeCreateV10Schema.safeParse({ ...request, ...change }).success, false);
    const registry = new SessionRegistry({ practiceV10: true, v10TestOnly: { nowUs: () => 0 } });
    try {
        registry.create('socket-one'); const session = registry.getBound('socket-one')!;
        assert.equal(registry.admitChallengeAutomatedV10(session, 'reward')?.code, 'FEATURE_UNAVAILABLE');
        assert.equal(registry.admitChallengeAutomatedV10(session, 'practice', 'forged-reservation')?.code, 'FEATURE_UNAVAILABLE');
    } finally { registry.dispose(); }
});

test('volcanic live ownership, duplicate input, pause, cold resume and fresh match remain fenced', async () => {
    const registry = new SessionRegistry({ practiceV10: true, seedSource: () => 4, v10TestOnly: { nowUs: () => 0 } });
    try {
        const opened = registry.create('socket-one'); assert.ok(!('code' in opened));
        registry.create('socket-two');
        const session = registry.getBound('socket-one')!, foreign = registry.getBound('socket-two')!;
        const created = registry.createChallengeAutomatedV10(session, 'practice', 'wizard'); assert.ok(!('code' in created));
        assert.equal(created.simulation.terrainProfileId, 'volcanic-ruin');
        assert.equal(registry.hasActiveCombat(session), true);
        assert.equal((registry.createChallenge(session, 'practice', 'wizard') as any).code, 'COMMAND_REJECTED');
        assert.equal((registry.submitCommand(session, created.challengeId, { type: 'fire' }, 0) as any).code, 'COMMAND_REJECTED');
        assert.equal(registry.admitChallengeAutomatedV10(session, 'practice')?.code, 'COMMAND_REJECTED');
        const packet = { requestId: 'volcanic_input_001', challengeId: created.challengeId, rulesetId: V10_R5_RULESET_ID, automationId: V10_AUTOMATION_ID,
            inputSequence: 0, expectedTurn: created.simulation.turn, expectedPhase: created.simulation.phase, inputEpoch: created.simulation.inputEpoch,
            intent: { type: 'aim', angleMilliDegrees: 30000, powerPermille: 500 } };
        assert.equal((await registry.submitInputV10(foreign, packet)).ok, false);
        const accepted = await registry.submitInputV10(session, packet); assert.equal(accepted.ok, true);
        assert.deepEqual(await registry.submitInputV10(session, packet), accepted);
        assert.equal((await registry.submitInputV10(session, { ...packet, intent: { ...packet.intent, powerPermille: 600 } })).ok, false);
        const paused = await registry.setChallengePausedV10(session, created.challengeId, true); assert.ok(!('code' in paused)); assert.equal(paused.paused, true);
        registry.disconnect('socket-one');
        const resumed = registry.resume(opened.token, 'socket-replacement'); assert.ok(resumed.data);
        assert.equal(registry.getBound('socket-one'), undefined);
        const current = registry.activeSnapshotV10(session)!;
        assert.equal(current.challengeId, created.challengeId); assert.equal(current.paused, true); assert.equal(current.simulation.aim, null);
        const unpaused = await registry.setChallengePausedV10(session, created.challengeId, false); assert.ok(!('code' in unpaused));
        assert.equal(registry.leaveChallengeV10(session, created.challengeId).outcome, 'left');
        const next = registry.createChallengeAutomatedV10(session, 'practice', 'thief'); assert.ok(!('code' in next));
        assert.notEqual(next.challengeId, created.challengeId); assert.equal(next.simulation.rulesetId, V10_R5_RULESET_ID);
        assert.equal(next.calling, 'thief');
    } finally { registry.dispose(); }
});

test('volcanic live replay regenerates AI, binds terrain, and refuses foundation relabelling', () => {
    const live = new LiveSimulationCoordinatorV10({ nowUs: () => 0 });
    const dispatcher = new VersionedSimulationCoordinator();
    try {
        const created = live.createAutomated('volcanic_replay_match', 'volcanic_replay_owner', 4, 'wizard');
        live.advance(created.challengeId, 510);
        const replay = live.replay(created.challengeId)!;
        assert.ok('chosenPlans' in replay); assert.ok(replay.chosenPlans.length > 0);
        assert.ok(replay.chosenPlans.every(plan => plan.status !== 'work_failure'));
        assert.equal(CoordinatorReplayV10Schema.safeParse(replay).success, false);
        assert.equal(dispatcher.reconstructAndVerify(replay).stateHash, live.get(created.challengeId)!.stateHash);
        assert.throws(() => dispatcher.reconstructAndVerify({ ...replay, recipeRevision: 'forged' } as any));
        assert.throws(() => dispatcher.reconstructAndVerify({ ...replay, chosenPlans: [] } as any));
        assert.throws(() => dispatcher.reconstructAndVerify(replay, { challengeId: created.challengeId, sessionId: 'different_owner_001' }));
    } finally { live.dispose(); dispatcher.dispose(); }
});

test('volcanic expiry closes authority and preserves its final replay for settlement', () => {
    let now = 1000000; let settled = 0;
    const registry = new SessionRegistry({ now: () => now, challengeTtlMs: 1000, practiceV10: true,
        v10TestOnly: { nowUs: () => 0 }, onChallengeSettledV10: () => settled++ });
    try {
        registry.create('expiry-socket'); const session = registry.getBound('expiry-socket')!;
        const created = registry.createChallengeAutomatedV10(session, 'practice', 'wizard'); assert.ok(!('code' in created));
        now += 1001; registry.sweep();
        assert.equal(registry.activeSnapshotV10(session)!.status, 'expired');
        assert.equal(registry.hasActiveCombat(session), false); assert.equal(settled, 1);
        registry.sweep(); assert.equal(settled, 1);
    } finally { registry.dispose(); }
});
