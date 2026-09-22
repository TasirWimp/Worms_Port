import { hashCanonicalV10Value } from '../../../shared/simulation-v10';
import type { V10R8ObjectiveMode } from '../../../shared/simulation-v10-r8';
import {
    ChapterStoryProposalV10R8Schema,
    type ChapterStoryProposalV10R8
} from '../../../shared/chapter-v10-r8';
import type { StrategicDecisionBriefV10R8 } from './loomkeeper-strategy-v10-r8';
import type { ChapterObservationV10R8 } from './loomkeeper-chapter-observation-v10-r8';
import { MODE_GAME_CONTRACT } from './loomkeeper-strategy-prompt-v10-r8';

export const V10_R8_CHAPTER_STORY_REVISION = 'v10-r8-chapter-story-r1' as const;

export const MODE_POSTURES_V10_R8 = Object.freeze({
    collect: ['contest_coin', 'deny_coin_route', 'shape_coin_route', 'pressure_player', 'survive'],
    defend: ['approach_chest', 'open_chest_route', 'dislodge_chest', 'pressure_player', 'survive'],
    claim: ['hold_chest', 'deny_chest_route', 'intercept_player', 'pressure_player', 'survive']
} as const);

export { ChapterStoryProposalV10R8Schema } from '../../../shared/chapter-v10-r8';
export type { ChapterStoryProposalV10R8 } from '../../../shared/chapter-v10-r8';

export type ChapterStoryFactV10R8 = Readonly<{ id: string; text: string }>;
export type ChapterStoryBriefV10R8 = Readonly<{
    revision: typeof V10_R8_CHAPTER_STORY_REVISION;
    mode: V10R8ObjectiveMode;
    stateHash: string;
    basisId: string;
    observation: Omit<ChapterObservationV10R8, 'priorLoomkeeper'> &
        Readonly<{ priorLoomkeeper: Readonly<{ turn: number; action: string | null; result: string | null }> | null }>;
    facts: readonly ChapterStoryFactV10R8[];
    objective: StrategicDecisionBriefV10R8['objective'];
    currentStrategy: StrategicDecisionBriefV10R8['currentStrategy'];
    priorReading: ChapterStoryProposalV10R8['playerReading'];
    world: Readonly<{
        actors: StrategicDecisionBriefV10R8['battlefield']['actors'];
        objects: StrategicDecisionBriefV10R8['battlefield']['objects'];
        relationships: StrategicDecisionBriefV10R8['battlefield']['relationships'];
    }>;
    targetIds: readonly string[];
    allowedPostures: readonly string[];
}>;

export type FrozenChapterStoryV10R8 = Readonly<{
    briefHash: string;
    proposalHash: string;
    proposal: ChapterStoryProposalV10R8;
}>;

/** Explicit projection: legal candidates and fallback identity never enter this port. */
export function buildChapterStoryBriefV10R8(input: Readonly<{
    decisionBrief: StrategicDecisionBriefV10R8;
    observation: ChapterObservationV10R8;
    priorReading?: ChapterStoryProposalV10R8['playerReading'];
}>): ChapterStoryBriefV10R8 {
    const { decisionBrief, observation } = input;
    if (observation.mode !== decisionBrief.objective.mode ||
        observation.basis.afterStateHash !== decisionBrief.stateHash) {
        throw new Error('The observed chapter does not match the current R8 decision frame.');
    }
    const mode = observation.mode;
    const { priorLoomkeeper, ...observedWithoutCandidateId } = observation;
    const brief: ChapterStoryBriefV10R8 = Object.freeze({
        revision: V10_R8_CHAPTER_STORY_REVISION,
        mode,
        stateHash: decisionBrief.stateHash,
        basisId: hashCanonicalV10Value({
            revision: V10_R8_CHAPTER_STORY_REVISION,
            stateHash: decisionBrief.stateHash,
            observation
        }),
        observation: Object.freeze({
            ...observedWithoutCandidateId,
            priorLoomkeeper: priorLoomkeeper ? Object.freeze({
                turn: priorLoomkeeper.turn,
                action: candidateHiddenPriorText(priorLoomkeeper.action, priorLoomkeeper.selectedCandidateId),
                result: candidateHiddenPriorText(priorLoomkeeper.result, priorLoomkeeper.selectedCandidateId)
            }) : null
        }),
        facts: observedChapterFactsV10R8(observation),
        objective: decisionBrief.objective,
        currentStrategy: decisionBrief.currentStrategy,
        priorReading: input.priorReading ?? null,
        world: Object.freeze({
            actors: decisionBrief.battlefield.actors,
            objects: decisionBrief.battlefield.objects,
            relationships: decisionBrief.battlefield.relationships
        }),
        targetIds: decisionBrief.strategyVocabulary.targetIds,
        allowedPostures: MODE_POSTURES_V10_R8[mode]
    });
    if (/\bc(?:0[1-9]|1[0-2])\b/.test(JSON.stringify(brief))) {
        throw new Error('The candidate-hidden story brief contains a candidate identity.');
    }
    return brief;
}

/** Refuse unknown internal prose instead of leaking a previous candidate identity to the story pass. */
function candidateHiddenPriorText(value: string | null, candidateId: string): string | null {
    if (value === null) return null;
    const prefix = value.startsWith(`${candidateId}: `) ? `${candidateId}: ` :
        value.startsWith(`${candidateId} `) ? `${candidateId} ` : null;
    if (!prefix) throw new Error('The prior Loomkeeper description has an unrecognized identity prefix.');
    return `Loomkeeper ${value.slice(prefix.length)}`;
}

export function observedChapterFactsV10R8(chapter: ChapterObservationV10R8): readonly ChapterStoryFactV10R8[] {
    const facts: ChapterStoryFactV10R8[] = [];
    const add = (id: string, text: string): void => { facts.push(Object.freeze({ id, text })); };
    if (chapter.priorLoomkeeper) add('prior.committed', `The previous Loomkeeper turn ${chapter.priorLoomkeeper.turn} was committed.`);
    for (const direction of chapter.playerAction.walkDirections) add(`player.walk.${direction}`, `The player held movement ${direction}.`);
    if (chapter.playerAction.jumps) add('player.jump', `The player jumped ${chapter.playerAction.jumps} time(s), including ${chapter.playerAction.neutralJumps} neutral jump(s).`);
    if (chapter.playerAction.threadleaps) add('player.threadleap', `The player used Threadleap ${chapter.playerAction.threadleaps} time(s).`);
    if (chapter.playerAction.threadguards) add('player.threadguard', `The player used Threadguard ${chapter.playerAction.threadguards} time(s).`);
    for (const relic of new Set(chapter.playerAction.shots)) add(`player.fire.${relic}`, `The player fired ${relic}.`);
    if (chapter.observedChange.playerMovement.x || chapter.observedChange.playerMovement.y) add('world.player_moved',
        `The player's position changed by (${chapter.observedChange.playerMovement.x}, ${chapter.observedChange.playerMovement.y}) world units.`);
    if (chapter.observedChange.loomkeeperMovement.x || chapter.observedChange.loomkeeperMovement.y) add('world.loomkeeper_moved',
        `The Loomkeeper's position changed by (${chapter.observedChange.loomkeeperMovement.x}, ${chapter.observedChange.loomkeeperMovement.y}) world units.`);
    if (chapter.observedChange.playerStitching) add('world.player_stitching', `Player stitching changed by ${chapter.observedChange.playerStitching}.`);
    if (chapter.observedChange.loomkeeperStitching) add('world.loomkeeper_stitching', `Loomkeeper stitching changed by ${chapter.observedChange.loomkeeperStitching}.`);
    if (chapter.observedChange.playerScore) add('world.player_score', `Player coin score changed by ${chapter.observedChange.playerScore}.`);
    if (chapter.observedChange.loomkeeperScore) add('world.loomkeeper_score', `Loomkeeper coin score changed by ${chapter.observedChange.loomkeeperScore}.`);
    if (chapter.observedChange.terrainRevision) add('world.terrain_changed',
        `Authoritative terrain revision changed by ${chapter.observedChange.terrainRevision}; the exact route consequence is not established here.`);
    for (const object of chapter.observedChange.objectives) add(`objective.${object.id}`,
        `${object.id} changed from ${object.from} to ${object.to}${object.resolvedBy ? ` by ${object.resolvedBy}` : ''}.`);
    if (facts.length === 0) add('world.no_material_change', 'No listed player action or material world change was observed in this chapter.');
    return Object.freeze(facts);
}

export function validateChapterStoryV10R8(brief: ChapterStoryBriefV10R8, raw: unknown): FrozenChapterStoryV10R8 {
    const proposal = ChapterStoryProposalV10R8Schema.parse(raw);
    if (!(MODE_POSTURES_V10_R8[brief.mode] as readonly string[]).includes(proposal.intention.posture)) {
        throw new Error('The Loomkeeper intention does not belong to this match mode.');
    }
    if (!brief.targetIds.includes(proposal.intention.targetId)) throw new Error('The intention target is not active in this match.');
    const { posture, targetId } = proposal.intention;
    if (posture === 'survive' && targetId !== 'loomkeeper') {
        throw new Error('Survival must target the Loomkeeper.');
    }
    if (['pressure_player', 'intercept_player'].includes(posture) && targetId !== 'player') {
        throw new Error('Player pressure must target the player.');
    }
    if (['contest_coin', 'deny_coin_route', 'shape_coin_route'].includes(posture) && !/^coin-[1-7]$/.test(targetId)) {
        throw new Error('A coin intention must target an active coin.');
    }
    if (['approach_chest', 'open_chest_route', 'dislodge_chest'].includes(posture) && targetId !== 'player-chest') {
        throw new Error('A Defend attack must target the player chest.');
    }
    if (['hold_chest', 'deny_chest_route'].includes(posture) && targetId !== 'loomkeeper-chest') {
        throw new Error('A Claim defence must target the Loomkeeper chest.');
    }
    const factIds = new Set(brief.facts.map(fact => fact.id));
    if (proposal.playerReading && (new Set(proposal.playerReading.evidenceIds).size !== proposal.playerReading.evidenceIds.length ||
        proposal.playerReading.evidenceIds.some(id => !factIds.has(id) ||
            id === 'prior.committed' || id === 'world.no_material_change'))) {
        throw new Error('The player reading cites an absent or duplicate observation.');
    }
    return Object.freeze({
        briefHash: hashCanonicalV10Value(brief),
        proposalHash: hashCanonicalV10Value(proposal),
        proposal
    });
}

export function chapterStorySystemInstructionV10R8(mode: V10R8ObjectiveMode): string {
    return [
        'You are interpreting one observed chapter of an entire NIMble Knots match.',
        'The server-fixed game mode and player/Loomkeeper roles never change during this match.',
        MODE_GAME_CONTRACT[mode],
        'Close the observed exchange and give the Loomkeeper one intention for the next exchange.',
        'Player psychology is a tentative hypothesis, not a fact or permanent type. Cite only supplied fact IDs; offer an alternative reading and a counter-observation.',
        'A prior reading, if supplied, is tentative history. Reassess it against this chapter; do not treat its old citations as new observations.',
        'If evidence does not support a player reading, return playerReading=null. Never invent a route, future player response, objective result or action.',
        'Be terse: chapterClosure must be at most 180 characters; every other free-text field must be at most 110 characters. State only witnessed effects, not inferred causal outcomes.',
        'You do not see legal candidates now. Do not request or name a candidate. Your output cannot execute gameplay.'
    ].join('\n');
}
