import assert from 'node:assert/strict';
import test from 'node:test';

import { LiveSimulationCoordinatorV10 } from '../../server/src/simulation/coordinator-v10-live';
import { compileChapterObservationV10R8 } from '../../server/src/simulation/loomkeeper-chapter-observation-v10-r8';
import { ReplayRecordV10Schema, type ReplayRecordV10 } from '../../shared/protocol-v10';
import { CoordinatorReplayV10R8Schema } from '../../shared/protocol-v10-live';
import { V10_R6_DYNAMICS } from '../../shared/simulation-v10';
import { createSimulationV10R8, type SimulationStateV10R8, type V10R8ObjectiveMode } from '../../shared/simulation-v10-r8';

const beforeHash = 'a'.repeat(64);
const afterHash = 'b'.repeat(64);

function intent(index: number, expectedTurn: number, value: ReplayRecordV10['operation'] & { kind: 'intent' }): ReplayRecordV10 {
    return ReplayRecordV10Schema.parse({ index, operation: { ...value, expectedTurn }, stateHash: afterHash });
}

function chapterStates(mode: V10R8ObjectiveMode, turn = 1): { before: SimulationStateV10R8; after: SimulationStateV10R8 } {
    const before = createSimulationV10R8(4, 'wizard', mode);
    before.turn = turn - 1;
    before.activeActor = 'player';
    const after = structuredClone(before);
    after.turn = turn;
    after.activeActor = 'loomkeeper';
    return { before, after };
}

test('WP-027 chapter observations preserve each whole-match mode and attributable player facts', () => {
    for (const [mode, roles] of [
        ['collect', ['collector', 'collector']],
        ['defend', ['chest_defender', 'chest_attacker']],
        ['claim', ['chest_attacker', 'chest_defender']]
    ] as const) {
        const { before, after } = chapterStates(mode);
        after.units[0].xFp += 20 * 256;
        after.units[1].stitching -= 4;
        after.terrainRevision += 1;
        const records = [
            intent(0, 0, { kind: 'intent', actor: 'player', intent: { type: 'walk_start', direction: 1 }, expectedTurn: 0, expectedPhase: 'action', expectedEpoch: 0 }),
            intent(1, 0, { kind: 'intent', actor: 'player', intent: { type: 'jump', direction: 0 }, expectedTurn: 0, expectedPhase: 'action', expectedEpoch: 0 }),
            intent(2, 0, { kind: 'intent', actor: 'player', intent: { type: 'select_relic', relicId: 'spoolburst' }, expectedTurn: 0, expectedPhase: 'action', expectedEpoch: 0 }),
            intent(3, 0, { kind: 'intent', actor: 'player', intent: { type: 'aim', angleMilliDegrees: 0, powerPermille: 600 }, expectedTurn: 0, expectedPhase: 'action', expectedEpoch: 0 }),
            intent(4, 0, { kind: 'intent', actor: 'player', intent: { type: 'fire', aimId: 1 }, expectedTurn: 0, expectedPhase: 'action', expectedEpoch: 0 }),
            intent(5, 0, { kind: 'intent', actor: 'loomkeeper', intent: { type: 'walk_start', direction: -1 }, expectedTurn: 0, expectedPhase: 'action', expectedEpoch: 0 })
        ];
        const observation = compileChapterObservationV10R8({ before, after, beforeStateHash: beforeHash, afterStateHash: afterHash, replayRecords: records });
        assert.equal(observation.mode, mode);
        assert.deepEqual([observation.playerRole, observation.loomkeeperRole], roles);
        assert.equal(observation.opening, true);
        assert.deepEqual(observation.playerAction.walkDirections, ['right']);
        assert.equal(observation.playerAction.neutralJumps, 1);
        assert.deepEqual(observation.playerAction.shots, ['spoolburst']);
        assert.equal(observation.observedChange.playerMovement.x, 20);
        assert.equal(observation.observedChange.loomkeeperStitching, -4);
        assert.equal(observation.observedChange.terrainRevision, 1);
        assert.deepEqual([observation.basis.firstPlayerRecord, observation.basis.lastPlayerRecord], [0, 4]);
        assert.deepEqual(compileChapterObservationV10R8({ before: structuredClone(before), after: structuredClone(after), beforeStateHash: beforeHash, afterStateHash: afterHash, replayRecords: structuredClone(records) }), observation);
    }
});

test('WP-027 later chapter binds prior Loomkeeper outcome and objective resolution', () => {
    const { before, after } = chapterStates('collect', 3);
    after.objective = {
        ...after.objective,
        scores: { player: 1, loomkeeper: 0 },
        objects: after.objective.objects.map((object, index) => index === 0
            ? { ...object, status: 'collected' as const, resolvedBy: 'player' as const } : object)
    };
    const priorLoomkeeper = { turn: 1, selectedCandidateId: 'c03', observedStateHash: beforeHash,
        action: 'Loomkeeper approached the coin.', result: 'The coin remained active.' };
    const observation = compileChapterObservationV10R8({
        before, after, beforeStateHash: beforeHash, afterStateHash: afterHash,
        replayRecords: [intent(12, 2, { kind: 'intent', actor: 'player', intent: { type: 'threadguard' }, expectedTurn: 2, expectedPhase: 'action', expectedEpoch: 0 })],
        priorLoomkeeper
    });
    assert.equal(observation.opening, false);
    assert.deepEqual(observation.priorLoomkeeper, priorLoomkeeper);
    assert.equal(observation.playerAction.threadguards, 1);
    assert.equal(observation.observedChange.playerScore, 1);
    assert.deepEqual(observation.observedChange.objectives, [{ id: 'coin-1', from: 'active', to: 'collected', resolvedBy: 'player' }]);
    assert.throws(() => compileChapterObservationV10R8({
        before, after, beforeStateHash: beforeHash, afterStateHash: afterHash, replayRecords: [],
        priorLoomkeeper: { ...priorLoomkeeper, observedStateHash: afterHash }
    }), /does not match/);
});

test('WP-027 private R8 coordinator emits a source-bound opening chapter without changing replay authority', async () => {
    const observations: ReturnType<typeof compileChapterObservationV10R8>[] = [];
    const live = new LiveSimulationCoordinatorV10({ nowUs: () => 0,
        onChapterObserved: observation => observations.push(observation) });
    const verifier = new LiveSimulationCoordinatorV10();
    const challengeId = 'wp027_chapter_replay_01';
    try {
        live.createAutomated(challengeId, 'wp027_chapter_owner_01', 4, 'wizard', { objectiveMode: 'claim' });
        live.advance(challengeId, V10_R6_DYNAMICS.actionTicks + 60);
        assert.equal(observations.length, 1);
        assert.equal(observations[0].mode, 'claim');
        assert.equal(observations[0].opening, true);
        const replay = CoordinatorReplayV10R8Schema.parse(live.replay(challengeId));
        assert.ok(replay.records.some(record => record.stateHash === observations[0].basis.afterStateHash),
            'the chapter must bind the player-turn replay state, even when the coordinator advances further');
        for (let attempt = 0; attempt < 400 &&
            CoordinatorReplayV10R8Schema.parse(live.replay(challengeId)).strategicTurns[0]?.status !== 'committed'; attempt += 1) {
            live.advance(challengeId, 6);
        }
        const firstCommitted = CoordinatorReplayV10R8Schema.parse(live.replay(challengeId)).strategicTurns[0];
        assert.equal(firstCommitted?.status, 'committed');
        live.advance(challengeId, V10_R6_DYNAMICS.actionTicks + 60);
        assert.equal(observations.length, 2);
        assert.equal(observations[1].opening, false);
        assert.equal(observations[1].priorLoomkeeper?.selectedCandidateId, firstCommitted.selectedCandidateId);
        assert.equal(observations[1].priorLoomkeeper?.observedStateHash, firstCommitted.observedStateHash);
        const replayAfterTwoChapters = CoordinatorReplayV10R8Schema.parse(live.replay(challengeId));
        const reconstructed = await verifier.reconstructAndVerifyAsync(replayAfterTwoChapters);
        assert.equal(reconstructed.stateHash, live.get(challengeId)?.stateHash);
    } finally {
        live.dispose();
        verifier.dispose();
    }
});
