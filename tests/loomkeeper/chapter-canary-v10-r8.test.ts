import assert from 'node:assert/strict';
import test from 'node:test';

import { LiveSimulationCoordinatorV10 } from '../../server/src/simulation/coordinator-v10-live';
import { MistralChapterStoryAdapterV10R8 } from
    '../../server/src/simulation/loomkeeper-chapter-provider-v10-r8';
import { CoordinatorReplayV10R8Schema } from '../../shared/protocol-v10-live';
import { V10_R8_CHAPTER_POLICY_ID } from '../../shared/chapter-v10-r8';
import { V10_R6_DYNAMICS } from '../../shared/simulation-v10';
import type { V10R8ObjectiveMode } from '../../shared/simulation-v10-r8';
import type { ChapterStoryBriefV10R8 } from
    '../../server/src/simulation/loomkeeper-chapter-story-v10-r8';

const API_KEY = 'wp027-chapter-local-test-key';

function chapterReply(init: RequestInit | undefined): Response {
    const wire = JSON.parse(String(init?.body));
    const user = JSON.parse(wire.messages[1].content);
    const brief = user.brief;
    const mode = brief.mode as V10R8ObjectiveMode;
    const posture = mode === 'collect' ? 'contest_coin' : mode === 'defend' ? 'approach_chest' : 'hold_chest';
    const targetId = mode === 'collect' ? 'coin-1' : mode === 'defend' ? 'player-chest' : 'loomkeeper-chest';
    assert.equal(JSON.stringify(wire).includes('legalCandidates'), false);
    assert.equal(JSON.stringify(wire).includes('deterministicFallback'), false);
    return Response.json({
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
            chapterClosure: 'The witnessed player turn ended without changing the match frame.',
            playerReading: null,
            intention: { posture, targetId, horizonOwnTurns: 2,
                reason: 'Continue the active match objective.', watchFor: 'Whether the target remains active.' }
        }) } }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }
    });
}

async function firstChapter(mode: V10R8ObjectiveMode, response: 'valid' | 'unavailable') {
    let calls = 0;
    const adapter = new MistralChapterStoryAdapterV10R8(API_KEY, async (_input, init) => {
        calls += 1;
        return response === 'valid' ? chapterReply(init) : new Response('unavailable', { status: 503 });
    });
    const live = new LiveSimulationCoordinatorV10({ nowUs: () => 0, chapterAdapter: adapter });
    const verifier = new LiveSimulationCoordinatorV10();
    const challengeId = `wp027_canary_${mode}_${response}_01`;
    try {
        live.createAutomated(challengeId, 'wp027_canary_owner_01', 4, 'wizard', { objectiveMode: mode });
        live.advance(challengeId, V10_R6_DYNAMICS.actionTicks + 60);
        let replay = CoordinatorReplayV10R8Schema.parse(live.replay(challengeId));
        let executingReplay: typeof replay | undefined;
        let executingStateHash: string | undefined;
        assert.equal(replay.strategyPolicyId, V10_R8_CHAPTER_POLICY_ID);
        for (let attempt = 0; attempt < 500 && replay.strategicTurns[0]?.status !== 'committed'; attempt += 1) {
            live.advance(challengeId, 6);
            await new Promise<void>(resolve => setImmediate(resolve));
            replay = CoordinatorReplayV10R8Schema.parse(live.replay(challengeId));
            if (!executingReplay && replay.strategicTurns[0]?.status === 'executing') {
                executingReplay = structuredClone(replay);
                executingStateHash = live.get(challengeId)?.stateHash;
            }
        }
        const turn = replay.strategicTurns[0];
        assert.equal(turn?.status, 'committed');
        assert.equal(calls, 1);
        assert.equal(turn?.chapter?.carrier?.mode, mode);
        assert.equal(turn?.chapter?.carrier?.selectedCandidateId, turn?.selectedCandidateId);
        assert.ok(executingReplay, 'the canary must retain its selected turn before the observed result');
        const resumed = await verifier.reconstructAndVerifyAsync(executingReplay);
        assert.equal(resumed.stateHash, executingStateHash);
        const reconstructed = await verifier.reconstructAndVerifyAsync(replay);
        assert.equal(reconstructed.stateHash, live.get(challengeId)?.stateHash);
        assert.equal(calls, 1, 'replay must not call the provider');
        return { replay, turn };
    } finally {
        live.dispose();
        verifier.dispose();
    }
}

test('WP-027 chapter canary authorizes and reconstructs one observed turn in every mode', async () => {
    for (const mode of ['collect', 'defend', 'claim'] as const) {
        const { replay, turn } = await firstChapter(mode, 'valid');
        assert.equal(turn.decisionSource, 'server_matcher');
        assert.equal(turn.chapter?.carrier?.decisionSource, 'server_matcher');
        assert.ok(turn.chapter?.story);
        assert.equal(turn.chapter?.carrier?.storyHash, turn.chapter?.storyHash);
        const changed = structuredClone(replay);
        changed.strategicTurns[0].chapter!.carrier!.selectedCandidateId =
            turn.selectedCandidateId === 'c01' ? 'c02' : 'c01';
        assert.equal(CoordinatorReplayV10R8Schema.safeParse(changed).success, false,
            'committed carrier tampering must fail before reconstruction');
    }
});

test('WP-027 chapter canary uses a recorded deterministic fallback after provider failure', async () => {
    const { turn } = await firstChapter('collect', 'unavailable');
    assert.equal(turn.operationalOutcome, 'provider_error');
    assert.equal(turn.decisionSource, 'deterministic_fallback');
    assert.equal(turn.chapter?.story, null);
    assert.equal(turn.chapter?.carrier?.decisionSource, 'deterministic_fallback');
});

test('WP-027 chapter provider enforces the whole-window deadline even if transport ignores abort', async () => {
    const brief = { mode: 'collect', facts: [], targetIds: ['coin-1'],
        allowedPostures: ['contest_coin'] } as unknown as ChapterStoryBriefV10R8;
    let calls = 0;
    let signal: AbortSignal | undefined;
    const adapter = new MistralChapterStoryAdapterV10R8(API_KEY, async (_input, init) => {
        calls += 1;
        signal = init?.signal ?? undefined;
        return new Promise<Response>(() => undefined);
    }, 25);
    const result = await adapter.request('wp027_chapter_timeout_01', brief, 5);
    assert.equal(result.outcome, 'timeout');
    assert.equal(result.frozenStory, null);
    assert.equal(result.timingMs.preparation, 5);
    assert.equal(calls, 1);
    assert.equal(signal?.aborted, true);
});
