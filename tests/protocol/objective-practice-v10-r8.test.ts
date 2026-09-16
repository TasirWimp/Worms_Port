import assert from 'node:assert/strict';
import test from 'node:test';

import { SessionRegistry } from '../../server/src/session/registry';
import { LiveSimulationCoordinatorV10 } from '../../server/src/simulation/coordinator-v10-live';
import { VersionedSimulationCoordinator } from '../../server/src/simulation/versioned-coordinator';
import { V10_AUTOMATION_ID, V10_R8_AUTOMATION_ID } from '../../shared/combat-version';
import {
    ChallengeCreateV10Schema, ChallengeSnapshotV10Schema,
    CoordinatorReplayV10AutomatedSchema
} from '../../shared/protocol-v10-live';
import { CURRENT_V10_RULESET_ID, V10_R6_DYNAMICS } from '../../shared/simulation-v10';
import {
    V10_R8_OBJECTIVE_RECIPE_REVISION, V10_R8_RULESET_ID,
    type V10R8ObjectiveMode
} from '../../shared/simulation-v10-r8';

const r8Request = {
    requestId: 'objective_request_001', sequence: 0, mode: 'practice', calling: 'wizard',
    rulesetId: V10_R8_RULESET_ID, automationId: V10_R8_AUTOMATION_ID,
    objectiveMode: 'collect', objectiveRecipeRevision: V10_R8_OBJECTIVE_RECIPE_REVISION
} as const;

test('R8 Practice wire identity is exact while Daily remains R7', () => {
    assert.equal(ChallengeCreateV10Schema.safeParse(r8Request).success, true);
    for (const patch of [
        { objectiveMode: 'unknown' },
        { objectiveRecipeRevision: 'forged' },
        { automationId: V10_AUTOMATION_ID },
        { mode: 'reward', challengeId: 'objective_daily_001', eligibilityToken: 'a'.repeat(43) }
    ]) {
        assert.equal(ChallengeCreateV10Schema.safeParse({ ...r8Request, ...patch }).success, false);
    }
    assert.equal(ChallengeCreateV10Schema.safeParse({
        requestId: 'objective_daily_request', sequence: 0, mode: 'reward', calling: 'wizard',
        challengeId: 'objective_daily_001', eligibilityToken: 'a'.repeat(43),
        rulesetId: CURRENT_V10_RULESET_ID, automationId: V10_AUTOMATION_ID
    }).success, true);
});

test('R8 Practice resume restores the exact objective state and mode', async () => {
    const registry = new SessionRegistry({ practiceV10: true, seedSource: () => 4,
        v10TestOnly: { nowUs: () => 0 } });
    try {
        const opened = registry.create('objective-socket');
        assert.ok(!('code' in opened));
        const session = registry.getBound('objective-socket')!;
        const created = registry.createChallengeAutomatedV10(session, 'practice', 'wizard', undefined, 'defend');
        assert.ok(!('code' in created));
        assert.equal(created.rulesetId, V10_R8_RULESET_ID);
        if (created.rulesetId !== V10_R8_RULESET_ID) throw new Error('Expected R8 Practice.');
        assert.equal(created.automationId, V10_R8_AUTOMATION_ID);
        assert.equal(created.objectiveMode, 'defend');
        assert.equal(created.objectiveRecipeRevision, V10_R8_OBJECTIVE_RECIPE_REVISION);
        assert.equal(ChallengeSnapshotV10Schema.safeParse(created).success, true);
        const openingHash = created.simulation.objective.objectiveHash;
        const openingObjects = structuredClone(created.simulation.objective.objects);

        const paused = await registry.setChallengePausedV10(session, created.challengeId, true);
        assert.ok(!('code' in paused));
        registry.disconnect('objective-socket');
        assert.ok(registry.resume(opened.token, 'objective-replacement').data);
        const resumed = registry.activeSnapshotV10(session)!;
        assert.equal(resumed.rulesetId, V10_R8_RULESET_ID);
        if (resumed.rulesetId !== V10_R8_RULESET_ID) throw new Error('Expected resumed R8 Practice.');
        assert.equal(resumed.objectiveMode, 'defend');
        assert.equal(resumed.simulation.objective.objectiveHash, openingHash);
        assert.deepEqual(resumed.simulation.objective.objects, openingObjects);
        assert.equal(resumed.paused, true);
    } finally {
        registry.dispose();
    }
});

test('R8 Loomkeeper plans are replay-bound, legal and objective-sensitive', async () => {
    const live = new LiveSimulationCoordinatorV10({ nowUs: () => 0 });
    const verifier = new VersionedSimulationCoordinator();
    const ordinals = new Set<number>();
    try {
        for (const mode of ['defend', 'collect', 'claim'] as const satisfies readonly V10R8ObjectiveMode[]) {
            const id = `objective_replay_${mode}_01`;
            const created = live.createAutomated(id, `objective_owner_${mode}_01`, 4, 'wizard', { objectiveMode: mode });
            assert.equal(created.state.rulesetId, V10_R8_RULESET_ID);
            live.advance(id, V10_R6_DYNAMICS.actionTicks + 60);
            const replay = live.replay(id)!;
            assert.equal(CoordinatorReplayV10AutomatedSchema.safeParse(replay).success, true);
            assert.equal(replay.rulesetId, V10_R8_RULESET_ID);
            if (replay.rulesetId !== V10_R8_RULESET_ID) throw new Error('Expected R8 replay.');
            assert.equal(replay.objectiveMode, mode);
            assert.equal(replay.objectiveRecipeRevision, V10_R8_OBJECTIVE_RECIPE_REVISION);
            assert.ok(replay.chosenPlans.length > 0);
            assert.ok(replay.chosenPlans.every(plan => plan.status !== 'work_failure'));
            const selected = replay.chosenPlans.find(plan => plan.status === 'selected');
            assert.ok(selected?.ordinal !== null && selected?.ordinal !== undefined);
            ordinals.add(selected.ordinal);
            const reconstructed = await verifier.reconstructAndVerifyAsync(replay);
            assert.equal(reconstructed.stateHash, live.get(id)!.stateHash);
            assert.throws(() => verifier.reconstructAndVerify({
                ...replay, objectiveRecipeRevision: 'forged'
            } as any));
        }
        assert.ok(ordinals.size >= 2, 'the three objective roles must not collapse to one shot-only choice');
    } finally {
        live.dispose();
        verifier.dispose();
    }
});
