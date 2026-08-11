import { WorldCutDefinitionSchema } from '../schemas';
import type { WorldCutDefinition } from '../types';

export const D2A_TACTICAL_CUT_ID = 'd2a_tactical_recurrence_v1';
export const D2A_TACTICAL_CUT_VERSION = 2;
export const D2A_PRESSURE_SEED = 3_237_998_097;

export const D2A_TACTICAL_PROTECTED_FAMILY = Object.freeze([
    'The exact registered D2A configuration, scenario family, policies, actions, report digest, and historical status remain recoverable.',
    'D2A evidence remains analytical only and cannot activate gameplay or acquire product authority.'
] as const);

export const D2A_CUT_DEFINITIONS: readonly WorldCutDefinition[] = Object.freeze([
    WorldCutDefinitionSchema.parse({
        schemaVersion: 1,
        cutId: D2A_TACTICAL_CUT_ID,
        cutVersion: D2A_TACTICAL_CUT_VERSION,
        sourceCarrierKind: 'tactical-analysis',
        projectionDescription: 'Retain the registered D2A tactical carrier and recurrence support for one source-bound historical pressure configuration.',
        admissibleDomain: {
            schemaVersion: 1,
            scenarioIds: [
                'd2a-f2-distance-448', 'd2a-f2-distance-512', 'd2a-f2-distance-576', 'd2a-f2-distance-640', 'd2a-f2-distance-704',
                'd2a-f3-distance-448', 'd2a-f3-distance-512', 'd2a-f3-distance-576', 'd2a-f3-distance-640', 'd2a-f3-distance-704',
                'd2a-f4-distance-448', 'd2a-f4-distance-512', 'd2a-f4-distance-576', 'd2a-f4-distance-640', 'd2a-f4-distance-704',
                'd2a-h2-distance-448', 'd2a-h2-distance-512', 'd2a-h2-distance-576', 'd2a-h2-distance-640', 'd2a-h2-distance-704',
                'd2a-h3-distance-448', 'd2a-h3-distance-512', 'd2a-h3-distance-576', 'd2a-h3-distance-640', 'd2a-h3-distance-704'
            ],
            actionFamilies: ['d2a-pressure-export'],
            policyFamilies: ['registered-pressure-suite'],
            seeds: [D2A_PRESSURE_SEED],
            constraints: [
                'Only the five source-locked historical D2A pressure configurations are registered.',
                'Terrain, ballistics, player behavior, UI, replay, reward, and runtime mutation remain excluded.'
            ]
        },
        protectedFamily: [...D2A_TACTICAL_PROTECTED_FAMILY],
        includedSupport: [
            'config-identity',
            'report-digest',
            'scenario-distance',
            'policy-family',
            'tactical-carrier',
            'recurrence-key',
            'historical-candidate-status'
        ],
        intentionallyForgottenDistinctions: [
            'Terrain, aim, trajectory, splash, player skill, live Loomkeeper, UI, replay, rewards, and production state.'
        ],
        excludedClaims: [
            'The D2A cut is analytical only and is not a shared gameplay state or production authority.',
            'A historical pressure result cannot be promoted by selecting fewer probes or supplying caller-authored acceptance metadata.'
        ],
        deterministicContinuationClaim: 'bounded'
    })
]);
