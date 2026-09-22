import { LiveSimulationCoordinatorV10 } from '../server/src/simulation/coordinator-v10-live';
import {
    buildChapterStoryBriefV10R8, type ChapterStoryBriefV10R8
} from '../server/src/simulation/loomkeeper-chapter-story-v10-r8';
import {
    buildStrategicDecisionBoundaryV10R8, type StrategicDecisionBoundaryV10R8
} from '../server/src/simulation/loomkeeper-strategy-v10-r8';
import type { ChapterObservationV10R8 } from '../server/src/simulation/loomkeeper-chapter-observation-v10-r8';
import { LoomkeeperPlannerV10R8 } from '../shared/loomkeeper-v10-r8';
import { V10_R6_DYNAMICS, type SimulationIntentV10 } from '../shared/simulation-v10';
import { V10_R8_RULESET_ID, type SimulationStateV10R8, type V10R8ObjectiveMode } from '../shared/simulation-v10-r8';
import { V10_R8_STRATEGY_POLICY_ID } from '../shared/strategic-voyage-v10-r8';

export const WP027_CHAPTER_FIXTURE_VERSION = 'v10-r8-chapter-shadow-fixtures-r1' as const;

/** Source-state, observation/story basis, and legal-atlas basis frozen before provider inspection. */
export const WP027_CHAPTER_FIXTURE_PINS = Object.freeze({
    'collect-opening': ['2f75dfb5d8386835163014b3b80e2b9083fe23a7ba1cf47b628c45f5de741b09', '4622ad95068206d9888aff3a295b1eefbf471e6f1fa12409c9fd6b91e1c10452', '75c3e67a0858cd9846c8529b716d5278341e66493a80d43eddf079859505e3ad'],
    'collect-followup': ['a18716263ed79187194494735d44d9870da2c3d5f9e3f2afa92f7fe63d01f6f0', 'a0f22319549d3c32a4980cc2865859518336024e4a2c75cdafe140752d3fe6cb', '63fd6831a24f2ff274baa2a0428f6a9e0f45d6725b6749c8a4970031177cb231'],
    'defend-opening': ['1128c933606bcccb66ed8b7a80120ae49aa58d048c798d53331528411de61475', '46b364fcc68edefd61303f9f04ea5958d12a93df039e4744c528993d7c162716', '975511445e042378c95fe377ee98f8521611cda18c44f2ade30d80a0cb0ea78f'],
    'claim-opening': ['f2e45a181a5ca66c6cd7641c09b85bdaaa9f0b7a492a733a1601e293725d8a0c', 'a5902b3acf30ba27c2abbcc39cc137923827d541c4d378cdc6b740f7b85b6aaa', 'b243e75cebc1949351b2cdf94723050452daba4e076dff8ed643dba3856e4d1c'],
    'claim-followup': ['0fcaf8784131e94bb948959d761d35bddd9cc035ec51fcbcba8ac04a832c5874', 'd35a116eb6fe054f12b1159263a7eea0376e5192c2fdccfac1952ffbc313dccb', 'b4c169c9f3a8946c69e77499742cca915cc701f701357b55a7d06860c8437419']
} as const);

export type Wp027ChapterFixture = Readonly<{
    id: string;
    mode: V10R8ObjectiveMode;
    chapterIndex: 1 | 2;
    observation: ChapterObservationV10R8;
    storyBrief: ChapterStoryBriefV10R8;
    boundary: StrategicDecisionBoundaryV10R8;
}>;

type Capture = Readonly<{ observation: ChapterObservationV10R8; state: SimulationStateV10R8 }>;

/** Five fixed, server-produced chapters; no model calls or gameplay authority changes. */
export function createWp027ChapterFixtures(): readonly Wp027ChapterFixture[] {
    const fixtures: Wp027ChapterFixture[] = [];
    for (const mode of ['collect', 'defend', 'claim'] as const) {
        const challengeId = `wp027_chapter_fixture_${mode}_01`;
        const captures: Capture[] = [];
        let live!: LiveSimulationCoordinatorV10;
        live = new LiveSimulationCoordinatorV10({ nowUs: () => 0,
            onChapterObserved: observation => {
                const snapshot = live.get(challengeId);
                if (!snapshot || snapshot.state.rulesetId !== V10_R8_RULESET_ID) {
                    throw new Error('A chapter fixture lost its authoritative R8 state.');
                }
                captures.push({ observation, state: structuredClone(snapshot.state) });
            } });
        try {
            live.createAutomated(challengeId, `wp027_chapter_owner_${mode}_01`, 4, 'wizard', { objectiveMode: mode });
            playerAct(live, challengeId, mode, 1);
            live.advance(challengeId, V10_R6_DYNAMICS.actionTicks + 60);
            if (captures.length !== 1) throw new Error(`Missing ${mode} opening chapter.`);
            fixtures.push(fixtureFromCapture(`${mode}-opening`, mode, 1, captures[0], live, challengeId));
            if (mode === 'defend') continue;
            for (let attempt = 0; attempt < 400; attempt += 1) {
                const replay = live.replay(challengeId);
                if (replay && 'strategicTurns' in replay && replay.strategicTurns[0]?.status === 'committed') break;
                live.advance(challengeId, 6);
            }
            const replay = live.replay(challengeId);
            if (!replay || !('strategicTurns' in replay) || replay.strategicTurns[0]?.status !== 'committed') {
                throw new Error(`Missing ${mode} committed Loomkeeper turn.`);
            }
            playerAct(live, challengeId, mode, 2);
            live.advance(challengeId, V10_R6_DYNAMICS.actionTicks + 60);
            if (captures.length !== 2) throw new Error(`Missing ${mode} follow-up chapter.`);
            fixtures.push(fixtureFromCapture(`${mode}-followup`, mode, 2, captures[1], live, challengeId));
        } finally {
            live.dispose();
        }
    }
    if (fixtures.length !== Object.keys(WP027_CHAPTER_FIXTURE_PINS).length) {
        throw new Error('The frozen chapter fixture count changed.');
    }
    for (const fixture of fixtures) assertWp027ChapterFixturePin(fixture);
    return Object.freeze(fixtures);
}

export function assertWp027ChapterFixturePin(fixture: Wp027ChapterFixture): void {
    const expected = WP027_CHAPTER_FIXTURE_PINS[fixture.id as keyof typeof WP027_CHAPTER_FIXTURE_PINS];
    if (!expected || fixture.storyBrief.stateHash !== expected[0] ||
        fixture.storyBrief.basisId !== expected[1] || fixture.boundary.brief.basisId !== expected[2] ||
        fixture.observation.basis.afterStateHash !== expected[0]) {
        throw new Error(`Frozen chapter fixture ${fixture.id} changed before provider inspection.`);
    }
}

function playerAct(live: LiveSimulationCoordinatorV10, challengeId: string, mode: V10R8ObjectiveMode, chapter: 1 | 2): void {
    if (mode === 'defend') {
        submit(live, challengeId, { type: 'threadguard' });
        return;
    }
    const snapshot = live.get(challengeId);
    if (!snapshot || snapshot.state.rulesetId !== V10_R8_RULESET_ID || snapshot.state.phase !== 'action' ||
        snapshot.state.activeActor !== 'player') throw new Error('Player fixture is not in an action turn.');
    const target = snapshot.state.objective.objects[0];
    const toward = target.xFp >= snapshot.state.units[0].xFp ? 1 : -1;
    const direction = chapter === 1 ? toward : -toward;
    submit(live, challengeId, { type: 'walk_start', direction });
    live.advance(challengeId, chapter === 1 ? 40 : 24);
    submit(live, challengeId, { type: 'walk_stop' });
    if (chapter === 2) submit(live, challengeId, { type: 'jump', direction: 0 });
}

function submit(live: LiveSimulationCoordinatorV10, challengeId: string, intent: SimulationIntentV10): void {
    const snapshot = live.get(challengeId);
    if (!snapshot) throw new Error('A chapter fixture match is unavailable.');
    const update = live.apply(challengeId, 'player', intent, snapshot.state.turn, snapshot.state.phase, snapshot.state.inputEpoch);
    if (!update.transition.accepted) throw new Error(`The chapter fixture player intent ${intent.type} was rejected.`);
}

function fixtureFromCapture(
    id: string, mode: V10R8ObjectiveMode, chapterIndex: 1 | 2, capture: Capture,
    live: LiveSimulationCoordinatorV10, challengeId: string
): Wp027ChapterFixture {
    const replay = live.replay(challengeId);
    if (!replay || !('strategicTurns' in replay) || replay.strategyPolicyId !== V10_R8_STRATEGY_POLICY_ID) {
        throw new Error('A chapter fixture requires an R8 strategy replay.');
    }
    const planner = new LoomkeeperPlannerV10R8(capture.state);
    for (let step = 0; step < 30; step += 1) planner.step();
    if (planner.selection.status !== 'selected' || !planner.selectedCandidate()) {
        throw new Error('A chapter fixture has no deterministic fallback.');
    }
    const lastCommitted = replay.strategicTurns.filter(turn =>
        turn.status === 'committed' && turn.turn < capture.state.turn).at(-1);
    const boundary = buildStrategicDecisionBoundaryV10R8({
        challengeId, state: capture.state,
        deterministicFallback: { candidate: planner.selectedCandidate(), prefix: planner.selection.prefix },
        ...(lastCommitted?.committedVoyage ? { currentStrategy: lastCommitted.committedVoyage } : {})
    });
    const storyBrief = buildChapterStoryBriefV10R8({ decisionBrief: boundary.brief, observation: capture.observation });
    return Object.freeze({ id, mode, chapterIndex, observation: capture.observation, storyBrief, boundary });
}
