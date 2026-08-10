import { WorldCutDefinitionSchema } from '../schemas';
import type { ScenarioDomain, WorldCutDefinition } from '../types';

export const V4_SUPPORT_TWIN_SEED = 0xC0FFEE11;
export const V4_CUT_VERSION = 1;

export const V4_CUT_IDS = Object.freeze({
    authority: 'authority_v4',
    thinVisibleDuel: 'thin_visible_duel_v0',
    boundedCommandSupport: 'bounded_command_support_v1',
    replay: 'replay_v4',
    worldDesign: 'world_design_v0'
} as const);

export type V4CutId = typeof V4_CUT_IDS[keyof typeof V4_CUT_IDS];
export type V4SimulationStateCutId =
    | typeof V4_CUT_IDS.authority
    | typeof V4_CUT_IDS.thinVisibleDuel
    | typeof V4_CUT_IDS.boundedCommandSupport;

function domain(
    scenarioId: string,
    actionFamilies: string[],
    constraints: string[]
): ScenarioDomain {
    return {
        schemaVersion: 1,
        scenarioIds: [scenarioId],
        actionFamilies,
        policyFamilies: ['declared-command-sequence'],
        seeds: [V4_SUPPORT_TWIN_SEED],
        constraints
    };
}

function cut(definition: Omit<WorldCutDefinition, 'schemaVersion' | 'cutVersion'>): WorldCutDefinition {
    return WorldCutDefinitionSchema.parse({
        schemaVersion: 1,
        cutVersion: V4_CUT_VERSION,
        ...definition
    });
}

export const V4_CUT_DEFINITIONS: readonly WorldCutDefinition[] = Object.freeze([
    cut({
        cutId: V4_CUT_IDS.authority,
        sourceCarrierKind: 'authority',
        projectionDescription: 'Retain a digest-backed reference to the complete canonical V4 authority carrier for the declared finite command domain.',
        admissibleDomain: domain(
            'v4-authority-c0ffee11',
            ['move', 'select_relic', 'aim', 'fire'],
            [
                'Only shared/simulation.ts V4 command transitions are authoritative.',
                'The registered seed is a finite witness domain, not an all-seed claim.'
            ]
        ),
        protectedFamily: [
            'The canonical V4 authority state remains recoverable by its source reference and digest.',
            'Command acceptance, mutation, state, events, and error remain owned by shared/simulation.ts.'
        ],
        includedSupport: [
            'complete-authority-state-digest',
            'authority-source-reference',
            'ruleset-identity',
            'revision'
        ],
        intentionallyForgottenDistinctions: [
            'Source-code layout and presentation-only detail outside the canonical authority carrier.'
        ],
        excludedClaims: [
            'No behavior beyond shared/simulation.ts is inferred.',
            'No finite registered seed proves equivalence over every V4 state or command history.'
        ],
        deterministicContinuationClaim: 'complete'
    }),
    cut({
        cutId: V4_CUT_IDS.thinVisibleDuel,
        sourceCarrierKind: 'player-public',
        projectionDescription: 'Retain only active actor, unit positions, and visible Stitching as a deliberately destructive control.',
        admissibleDomain: domain(
            'v4-movement-support-twin-c0ffee11',
            ['move'],
            ['One declared V4 move command is applied to each supplied full authority state.']
        ),
        protectedFamily: [
            'Only the tempting visible duel readout is compared.',
            'Any future split hidden by this readout must remain explicit aliasing residue.'
        ],
        includedSupport: ['active-actor', 'unit-position', 'unit-stitching'],
        intentionallyForgottenDistinctions: [
            'Movement budget, turn and revision counters, selected Relic, aim, alive flags, facing, phase, terrain, RNG state, projectile state, and terminal result.'
        ],
        excludedClaims: [
            'This cut is intentionally incomplete and cannot establish deterministic continuation.',
            'Matching visible duel readouts do not establish equal authority state, recurrence, or return.'
        ],
        deterministicContinuationClaim: 'relational'
    }),
    cut({
        cutId: V4_CUT_IDS.boundedCommandSupport,
        sourceCarrierKind: 'authority',
        projectionDescription: 'Retain exactly the authority support used by one declared V4 movement-command continuation family.',
        admissibleDomain: domain(
            'v4-movement-support-twin-c0ffee11',
            ['move'],
            [
                'The command family is movement only.',
                'Support is assessed only over supplied V4 states, actors, expected turns, and move declarations.'
            ]
        ),
        protectedFamily: [
            'Movement acceptance, mutation, resulting unit position and facing, and remaining movement budget are protected for the declared finite domain.',
            'Terrain and occupancy support remain digest- or field-backed and re-enterable.'
        ],
        includedSupport: [
            'ruleset-identity',
            'turn-number',
            'active-actor',
            'phase',
            'movement-budget',
            'terrain-digest',
            'terrain-bounds',
            'unit-position',
            'unit-facing',
            'unit-alive',
            'unit-occupancy',
            'actor-declaration',
            'expected-turn',
            'move-command'
        ],
        intentionallyForgottenDistinctions: [
            'Aim, selected Relic, last projectile, RNG cursor, tick, revision, Stitching, winner, and finish reason are outside this movement-only support claim.'
        ],
        excludedClaims: [
            'No fire, aim, Relic-selection, tick-advance, replay, or all-world continuation completeness is claimed.',
            'A passing finite assessment does not prove that this carrier is unique, minimal, or globally support-complete.'
        ],
        deterministicContinuationClaim: 'bounded'
    }),
    cut({
        cutId: V4_CUT_IDS.replay,
        sourceCarrierKind: 'replay',
        projectionDescription: 'Retain initial V4 authority state support, ordered replay operations, state hashes, and reconstruction semantics for one declared transcript.',
        admissibleDomain: domain(
            'v4-authoritative-transcript-c0ffee11',
            ['move', 'select_relic', 'aim', 'fire', 'tick-advance'],
            ['Only the declared ordered coordinator transcript and its state hashes are in scope.']
        ),
        protectedFamily: [
            'Replay operation order, command actor, expected turn, tick counts, and state hashes remain recoverable.',
            'Reconstruction continues to call the existing authority operations without changing replay ABI.'
        ],
        includedSupport: [
            'initial-authority-state',
            'ordered-operations',
            'command-actor',
            'expected-turn',
            'tick-count',
            'state-hash',
            'ruleset-identity',
            'reconstruction-semantics'
        ],
        intentionallyForgottenDistinctions: [
            'Ordered events are recomputed during reconstruction and are not serialized in existing replay records.'
        ],
        excludedClaims: [
            'No replay ABI change or general equivalence outside the declared transcript is claimed.',
            'A recomputed event comparison would require a separate transition-parity cut.'
        ],
        deterministicContinuationClaim: 'bounded'
    }),
    cut({
        cutId: V4_CUT_IDS.worldDesign,
        sourceCarrierKind: 'world-design',
        projectionDescription: 'Retain bounded offline design identity, exclusions, evidence references, and authority status without exposing a live mutation channel.',
        admissibleDomain: domain(
            'offline-world-design-c0ffee11',
            ['offline-world-design'],
            ['Strict registered adapters, configurations, cuts, and deterministic evidence references only.']
        ),
        protectedFamily: [
            'Profile, adapter or configuration identity, declared exclusions, evidence lineage, and product-authority status remain visible.',
            'The production and analysis import boundary remains unchanged.'
        ],
        includedSupport: [
            'profile-version',
            'adapter-identity',
            'configuration-identity',
            'declared-exclusions',
            'evidence-references',
            'product-authority-status'
        ],
        intentionallyForgottenDistinctions: [
            'Live authority state and executable mutation capabilities are not carried through this offline design cut.'
        ],
        excludedClaims: [
            'No live mutation channel, gameplay activation, V5 rule, or production authority is exposed.',
            'A shared result envelope does not establish shared dynamics or ontology.'
        ],
        deterministicContinuationClaim: 'none'
    })
]);
