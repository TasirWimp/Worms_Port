import assert from 'node:assert/strict';
import test from 'node:test';
import { SessionRegistry } from '../../server/src/session/registry';
import { LiveSimulationCoordinatorV10 } from '../../server/src/simulation/coordinator-v10-live';
import { VersionedSimulationCoordinator } from '../../server/src/simulation/versioned-coordinator';
import { ChallengeCreateV10Schema, CoordinatorReplayV10AutomatedSchema } from '../../shared/protocol-v10-live';
import { CoordinatorReplayV10Schema } from '../../shared/protocol-v10';
import { V10_AUTOMATION_ID, V10_R6_AUTOMATION_ID } from '../../shared/combat-version';
import {
    CURRENT_V10_RULESET_ID, V10_R6_DYNAMICS, V10_R6_RULESET_ID, V10_R7_RULESET_ID,
    hashTerrainV10R7
} from '../../shared/simulation-v10';
import { LoomkeeperPlannerV10 } from '../../shared/loomkeeper-v10';

const request = { requestId: 'volcanic_request_001', sequence: 0, mode: 'practice', calling: 'wizard', rulesetId: CURRENT_V10_RULESET_ID, automationId: V10_AUTOMATION_ID };

test('volcanic live admission strictly separates standard Daily from the wallet-free Practice profile', async () => {
    assert.equal(ChallengeCreateV10Schema.safeParse(request).success, true);
    const rewardRequest = { ...request, mode: 'reward', challengeId: 'daily_reward_challenge_01', eligibilityToken: 'a'.repeat(43) };
    assert.equal(ChallengeCreateV10Schema.safeParse(rewardRequest).success, true);
    for (const change of [{ rulesetId: 'nimble-knots-artillery-v10-r4' }, { eligibilityToken: 'short' }, { automationId: undefined }])
        assert.equal(ChallengeCreateV10Schema.safeParse({ ...rewardRequest, ...change }).success, false);
    for (const change of [{ challengeId: 'daily_reward_challenge_01' }, { eligibilityToken: 'a'.repeat(43) }])
        assert.equal(ChallengeCreateV10Schema.safeParse({ ...request, ...change }).success, false);
    const registry = new SessionRegistry({ practiceV10: true, v10TestOnly: { nowUs: () => 0 } });
    try {
        registry.create('socket-one'); const session = registry.getBound('socket-one')!;
        assert.equal(registry.admitChallengeAutomatedV10(session, 'reward')?.code, 'BAD_REQUEST');
        assert.equal(registry.admitChallengeAutomatedV10(session, 'practice', 'forged-reservation')?.code, 'BAD_REQUEST');
        assert.equal(registry.admitChallengeAutomatedV10(session, 'reward', 'daily_reward_challenge_01'), undefined);
        const created = registry.createChallengeAutomatedV10(session, 'reward', 'wizard', {
            challengeId: 'daily_reward_challenge_01', seed: 4
        });
        assert.ok(!('code' in created));
        assert.equal(created.mode, 'reward');
        assert.equal((await registry.setChallengePausedV10(session, created.challengeId, true) as any).code, 'COMMAND_REJECTED');
    } finally { registry.dispose(); }
    const practiceOnly = new SessionRegistry({ practiceV10: true, v10PracticeOnly: true, v10TestOnly: { nowUs: () => 0 } });
    try {
        practiceOnly.create('socket-two'); const session = practiceOnly.getBound('socket-two')!;
        assert.equal(practiceOnly.admitChallengeAutomatedV10(session, 'reward', 'daily_reward_challenge_02')?.code, 'FEATURE_UNAVAILABLE');
    } finally { practiceOnly.dispose(); }
});

test('volcanic live ownership, duplicate input, pause, cold resume and fresh match remain fenced', async () => {
    const registry = new SessionRegistry({ practiceV10: true, seedSource: () => 4, v10TestOnly: { nowUs: () => 0 } });
    try {
        const opened = registry.create('socket-one'); assert.ok(!('code' in opened));
        registry.create('socket-two');
        const session = registry.getBound('socket-one')!, foreign = registry.getBound('socket-two')!;
        const created = registry.createChallengeAutomatedV10(session, 'practice', 'wizard'); assert.ok(!('code' in created));
        assert.equal(created.rulesetId, V10_R7_RULESET_ID);
        assert.equal(created.automationId, V10_AUTOMATION_ID);
        assert.equal(created.simulation.terrainProfileId, 'volcanic-ruin');
        assert.equal(created.simulation.terrainRevision, 0);
        assert.equal(created.simulation.terrainHash, hashTerrainV10R7(created.simulation.terrain));
        assert.equal(registry.hasActiveCombat(session), true);
        assert.equal((registry.createChallenge(session, 'practice', 'wizard') as any).code, 'COMMAND_REJECTED');
        assert.equal((registry.submitCommand(session, created.challengeId, { type: 'fire' }, 0) as any).code, 'COMMAND_REJECTED');
        assert.equal(registry.admitChallengeAutomatedV10(session, 'practice')?.code, 'COMMAND_REJECTED');
        const packet = { requestId: 'volcanic_input_001', challengeId: created.challengeId, rulesetId: CURRENT_V10_RULESET_ID, automationId: V10_AUTOMATION_ID,
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
        assert.notEqual(next.challengeId, created.challengeId); assert.equal(next.simulation.rulesetId, CURRENT_V10_RULESET_ID);
        assert.equal(next.calling, 'thief');
    } finally { registry.dispose(); }
});

test('volcanic live replay regenerates AI cooperatively, binds terrain, and refuses foundation relabelling', async () => {
    const live = new LiveSimulationCoordinatorV10({ nowUs: () => 0 });
    const dispatcher = new VersionedSimulationCoordinator();
    try {
        const created = live.createAutomated('volcanic_replay_match', 'volcanic_replay_owner', 4, 'wizard');
        // Cross the longer R6 player action and allow the fixed 30-tick AI
        // planning charge plus execution to enter the retained replay.
        live.advance(created.challengeId, V10_R6_DYNAMICS.actionTicks + 60);
        const replay = live.replay(created.challengeId)!;
        assert.equal(replay.rulesetId, V10_R7_RULESET_ID);
        assert.equal('automationId' in replay && replay.automationId, V10_AUTOMATION_ID);
        assert.ok('chosenPlans' in replay); assert.ok(replay.chosenPlans.length > 0);
        assert.ok(replay.chosenPlans.every(plan => plan.status !== 'work_failure'));
        assert.equal(CoordinatorReplayV10Schema.safeParse(replay).success, false);
        let eventLoopProgressed = false;
        setImmediate(() => { eventLoopProgressed = true; });
        assert.equal((await dispatcher.reconstructAndVerifyAsync(replay)).stateHash, live.get(created.challengeId)!.stateHash);
        assert.equal(eventLoopProgressed, true);
        assert.throws(() => dispatcher.reconstructAndVerify({ ...replay, recipeRevision: 'forged' } as any));
        assert.throws(() => dispatcher.reconstructAndVerify({ ...replay, chosenPlans: [] } as any));
        assert.throws(() => dispatcher.reconstructAndVerify(replay, { challengeId: created.challengeId, sessionId: 'different_owner_001' }));
    } finally { live.dispose(); dispatcher.dispose(); }
});

test('R7 server replay preserves the exact destructible terrain revision and hash', () => {
    const live = new LiveSimulationCoordinatorV10({ nowUs: () => 0 });
    const dispatcher = new VersionedSimulationCoordinator();
    try {
        const created = live.createAutomated('r7_terrain_replay_match', 'r7_terrain_replay_owner', 4, 'wizard');
        const initialTerrainHash = created.state.terrainHash;
        let state = created.state;
        live.apply(created.challengeId, 'player', { type: 'aim', angleMilliDegrees: 0, powerPermille: 500 },
            state.turn, state.phase, state.inputEpoch);
        state = live.get(created.challengeId)!.state;
        live.apply(created.challengeId, 'player', { type: 'fire', aimId: state.aimId },
            state.turn, state.phase, state.inputEpoch);
        for (let tick = 0; tick < 300 && live.get(created.challengeId)!.state.terrainRevision === 0; tick += 1) {
            live.advance(created.challengeId, 1);
        }
        const changed = live.get(created.challengeId)!;
        assert.ok((changed.state.terrainRevision ?? 0) > 0);
        assert.notEqual(changed.state.terrainHash, initialTerrainHash);
        assert.equal(changed.state.terrainHash, hashTerrainV10R7(changed.state.terrain));

        const restored = dispatcher.reconstructAndVerify(live.replay(created.challengeId)!);
        assert.equal(restored.stateHash, changed.stateHash);
        assert.equal(restored.state.terrainRevision, changed.state.terrainRevision);
        assert.equal(restored.state.terrainHash, changed.state.terrainHash);
        assert.deepEqual(restored.state.terrain, changed.state.terrain);
    } finally { live.dispose(); dispatcher.dispose(); }
});

test('the current verifier reconstructs frozen R6 automated evidence without making R6 live again', () => {
    const r6 = new LiveSimulationCoordinatorV10({ nowUs: () => 0, replayIdentity: {
        rulesetId: V10_R6_RULESET_ID,
        automationId: V10_R6_AUTOMATION_ID
    } });
    const dispatcher = new VersionedSimulationCoordinator();
    try {
        const created = r6.createAutomated('frozen_r6_replay_match', 'frozen_r6_replay_owner', 4, 'wizard');
        const state = r6.get(created.challengeId)!.state;
        r6.apply(created.challengeId, 'player', { type: 'aim', angleMilliDegrees: 30_000, powerPermille: 500 },
            state.turn, state.phase, state.inputEpoch);
        const replay = r6.replay(created.challengeId)!;
        assert.equal(replay.rulesetId, V10_R6_RULESET_ID);
        assert.equal('automationId' in replay && replay.automationId, V10_R6_AUTOMATION_ID);
        assert.equal(CoordinatorReplayV10AutomatedSchema.safeParse(replay).success, true);
        assert.equal(dispatcher.reconstructAndVerify(replay).stateHash, r6.get(created.challengeId)!.stateHash);
        assert.equal(CoordinatorReplayV10AutomatedSchema.safeParse({
            ...replay,
            automationId: V10_AUTOMATION_ID
        }).success, false);
        assert.throws(() => dispatcher.reconstructAndVerify({ ...replay, automationId: V10_AUTOMATION_ID } as any));
    } finally { r6.dispose(); dispatcher.dispose(); }
});

test('measured V10 authority work cannot become clock debt for live matches', () => {
    let nowUs = 0;
    class MeasuredPlanner extends LoomkeeperPlannerV10 {
        public override step(): void { nowUs += 200_000; super.step(); }
    }
    const live = new LiveSimulationCoordinatorV10({
        nowUs: () => nowUs,
        plannerFactory: state => new MeasuredPlanner(state)
    });
    try {
        const busy = live.createAutomated('volcanic_busy_match', 'volcanic_busy_owner', 4, 'wizard');
        const peer = live.createAutomated('volcanic_peer_match', 'volcanic_peer_owner', 4, 'wizard');
        live.advance(busy.challengeId, V10_R6_DYNAMICS.actionTicks + 30);

        assert.equal(nowUs, 6_000_000);
        assert.equal(live.dueTicks(peer.challengeId), 0);
        const peerAfterWork = live.pump(peer.challengeId);
        assert.equal(peerAfterWork.unavailable, false);
        assert.equal(peerAfterWork.terminalResult, undefined);
        assert.equal(peerAfterWork.state.tick, 0);
    } finally { live.dispose(); }
});

test('R7 state publication is charged by logical ticks and external stalls still fail closed', () => {
    let nowUs = 0;
    const live = new LiveSimulationCoordinatorV10({
        nowUs: () => nowUs,
        onTransition: () => { nowUs += 100_000; }
    });
    try {
        const busy = live.createAutomated('r7_publication_match', 'r7_publication_owner', 4, 'wizard');
        const peer = live.createAutomated('r7_publication_peer', 'r7_publication_peer_owner', 4, 'wizard');
        live.advance(busy.challengeId, 33);
        assert.equal(live.dueTicks(busy.challengeId), 0);
        assert.equal(live.dueTicks(peer.challengeId), 0);
        assert.equal(live.pump(peer.challengeId).unavailable, false);

        nowUs += 1_100_000;
        const stopped = live.pump(peer.challengeId);
        assert.equal(stopped.unavailable, true);
        assert.equal(stopped.terminalResult?.stopReason, 'clock_debt');
    } finally { live.dispose(); }
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
