import type { StrategicDecisionBriefV10R8, StrategicPathAtlasV10R8 } from './loomkeeper-strategy-v10-r8';

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

/** Mistral-only presentation: legal complete-turn paths and exact after-facts without the full pixel/ASCII field. */
export function strategicPathSystemInstructionV10R8(brief: StrategicDecisionBriefV10R8): string {
    return [...SHARED_GAME_CONTRACT, MODE_GAME_CONTRACT[brief.objective.mode],
        'You choose one legal Loomkeeper candidate ID, or abstain when essential facts are missing.',
        'The path sheet has one lane per candidate. Purple is the simulated actor path, black its start, orange the shot vector, red its impact and removed-terrain marks, blue the player, gold coins and green chests. Vertical displacement is magnified and clipped; structured coordinates are exact.',
        'Each path waypoint is sampled from that candidate complete-turn rollout. Use the accompanying structured after-facts for exact values.',
        'A one-turn path does not prove a future route remains reachable. Treat uncomputed future support and reachability as unknown.',
        'Candidate identifiers and list positions carry no preference. Never invent an action, route, target or observation.',
        'Prefer continuing a feasible committed strategy through its declared temporary cost. Repair or switch only when evidence invalidates it or protects a more valuable future option.',
        'Keep reason and watchFor non-empty and at most 160 characters each. Your output is advice only; the server alone validates and executes.'
    ].join('\n');
}

export function strategicPathUserPromptV10R8(
    brief: StrategicDecisionBriefV10R8,
    atlas: StrategicPathAtlasV10R8
): string {
    if (atlas.basisId !== brief.basisId || atlas.paths.length !== brief.legalCandidates.length ||
        atlas.paths.some((path, index) => path.candidateId !== brief.legalCandidates[index].candidateId)) {
        throw new Error('Strategic path atlas does not match the current brief.');
    }
    return JSON.stringify({
        instruction: 'Select the best current candidate for the multi-turn strategy, or abstain when the supplied facts are insufficient.',
        objective: brief.objective,
        strategyVocabulary: brief.strategyVocabulary,
        battlefield: {
            actors: brief.battlefield.actors,
            objects: brief.battlefield.objects,
            relationships: brief.battlefield.relationships
        },
        currentStrategy: brief.currentStrategy,
        recentChanges: brief.recentChanges,
        legalCandidates: brief.legalCandidates.map((candidate, index) => ({
            candidateId: candidate.candidateId,
            families: candidate.families,
            path: atlas.paths[index],
            action: candidate.action,
            immediate: candidate.immediate,
            opportunities: candidate.opportunities,
            risks: candidate.risks,
            uncertainty: candidate.uncertainty,
            after: {
                actors: candidate.worldDelta.actorsAfter,
                objects: candidate.worldDelta.objectsAfter,
                committedTarget: candidate.worldDelta.committedTargetAfter
            }
        }))
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

/** Mistral strict output requires one top-level object; runtime validation retains the exact union. */
export function strategicMistralResponseSchemaV10R8(
    brief: StrategicDecisionBriefV10R8
): Readonly<Record<string, unknown>> {
    const nullable = (schema: Readonly<Record<string, unknown>>) => Object.freeze({
        anyOf: Object.freeze([schema, Object.freeze({ type: 'null' })])
    });
    return Object.freeze({
        type: 'object',
        additionalProperties: false,
        properties: Object.freeze({
            candidateId: nullable(Object.freeze({
                type: 'string', enum: brief.legalCandidates.map(candidate => candidate.candidateId)
            })),
            strategy: nullable(Object.freeze({
                type: 'string', enum: ['continue', 'refine', 'repair', 'switch', 'complete']
            })),
            targetId: nullable(Object.freeze({
                type: 'string', enum: [...brief.strategyVocabulary.targetIds]
            })),
            milestoneId: nullable(Object.freeze({
                type: 'string', enum: [...brief.strategyVocabulary.milestoneIds]
            })),
            horizonOwnTurns: nullable(Object.freeze({
                type: 'integer', minimum: 1, maximum: 8
            })),
            reason: Object.freeze({
                type: 'string',
                description: 'Required concise justification or abstention explanation; 1 to 160 characters.'
            }),
            watchFor: nullable(Object.freeze({
                type: 'string',
                description: 'Concise observation that could change a selected plan; 1 to 160 characters.'
            }))
        }),
        required: Object.freeze([
            'candidateId', 'strategy', 'targetId', 'milestoneId', 'horizonOwnTurns', 'reason', 'watchFor'
        ])
    });
}
