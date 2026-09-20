import type { StrategicDecisionBriefV10R8 } from './loomkeeper-strategy-v10-r8';

const SHARED_GAME_CONTRACT = [
    'NIMble Knots is a turn-based 2D tactics game on destructible terrain.',
    'A human player and the AI Loomkeeper alternate turns. Each legal candidate is one complete server-simulated Loomkeeper turn, including movement, jumping, weapon use and resulting physics.',
    'An actor is eliminated when its stitching is exhausted or it falls out of the arena. Destroyed terrain changes support, routes and landings.',
    'Coins and chests are physical objective objects. Weapons cannot destroy them, but they fall when terrain support disappears and can fall out of the arena.',
    'The battlefield is the current before-state. Each candidate worldDelta is that candidate predicted after-state relative to the battlefield.',
    'A locally weaker action can be correct when it preserves or creates a stronger multi-turn route.'
] as const;

const MODE_GAME_CONTRACT: Readonly<Record<StrategicDecisionBriefV10R8['objective']['mode'], string>> = Object.freeze({
    collect: 'Mode Collect: both actors compete for scattered coins. Either actor wins immediately by gaining an unbeatable coin lead or eliminating the opponent. When all coins resolve or the 16-turn limit is reached, higher score wins and equal score draws.',
    defend: "Mode Defend: the player defends the player's chest and the Loomkeeper attacks it. The Loomkeeper wins by touching the chest, dropping it out of the arena or eliminating the player. The player wins by eliminating the Loomkeeper or keeping the chest active through the 16-turn limit.",
    claim: "Mode Claim: the player attacks the Loomkeeper's chest and the Loomkeeper defends it. The player wins by touching the chest, dropping it out of the arena or eliminating the Loomkeeper. The Loomkeeper wins by eliminating the player or keeping the chest active through the 16-turn limit."
});

const DECISION_INSTRUCTION = [
    'You choose one strategic candidate for the Loomkeeper in NIMble Knots.',
    'Use only facts and identifiers present in the supplied bounded brief.',
    'Choose exactly one legal candidate or abstain. Never invent an action, object, route, target, or observation.',
    'Candidate identifiers and list positions carry no preference.',
    'Each worldDelta describes that candidate after the current battlefield; use its ASCII runs and structured after-facts.',
    'An ASCII delta run is y:xStart-xEnd:before>after for one changed row span.',
    'Prefer continuing a feasible committed strategy through its declared temporary cost.',
    'Repair or switch only when current evidence invalidates that strategy or protects a more valuable future option.',
    'Keep reason and watchFor concise, non-empty and no longer than 160 characters each.',
    'Your output is advice only. The server validates it and alone owns execution.'
] as const;

export function strategicSystemInstructionV10R8(brief: StrategicDecisionBriefV10R8): string {
    return [...SHARED_GAME_CONTRACT, MODE_GAME_CONTRACT[brief.objective.mode], ...DECISION_INSTRUCTION].join('\n');
}

export function strategicUserPromptV10R8(brief: StrategicDecisionBriefV10R8): string {
    return JSON.stringify({
        instruction: 'Select the best current candidate for the multi-turn strategy, or abstain when the brief is insufficient.',
        brief
    });
}

export function strategicResponseSchemaV10R8(
    brief: StrategicDecisionBriefV10R8
): Readonly<Record<string, unknown>> {
    const selected = {
        type: 'object',
        additionalProperties: false,
        properties: {
            candidateId: { type: 'string', enum: brief.legalCandidates.map(candidate => candidate.candidateId) },
            strategy: { type: 'string', enum: ['continue', 'refine', 'repair', 'switch', 'complete'] },
            targetId: { type: 'string', enum: [...brief.strategyVocabulary.targetIds] },
            milestoneId: { type: 'string', enum: [...brief.strategyVocabulary.milestoneIds] },
            horizonOwnTurns: { type: 'integer', minimum: 1, maximum: 8 },
            reason: {
                type: 'string',
                description: 'Required concise justification using only brief facts; 1 to 160 characters.'
            },
            watchFor: {
                type: 'string',
                description: 'Required concise observation that could change the plan; 1 to 160 characters.'
            }
        },
        required: ['candidateId', 'strategy', 'targetId', 'milestoneId', 'horizonOwnTurns', 'reason', 'watchFor']
    };
    const abstained = {
        type: 'object',
        additionalProperties: false,
        properties: {
            candidateId: { type: 'null' },
            strategy: { type: 'null' },
            targetId: { type: 'null' },
            milestoneId: { type: 'null' },
            horizonOwnTurns: { type: 'null' },
            reason: {
                type: 'string',
                description: 'Required concise explanation of the information gap; 1 to 160 characters.'
            },
            watchFor: { type: 'null' }
        },
        required: ['candidateId', 'strategy', 'targetId', 'milestoneId', 'horizonOwnTurns', 'reason', 'watchFor']
    };
    return Object.freeze({ anyOf: Object.freeze([selected, abstained]) });
}
