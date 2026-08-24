import { WorldCutDefinitionSchema } from '../../schemas';
import type { WorldCutDefinition } from '../../types';
import {
    D2E_ACTION_FAMILY,
    D2E_CUT,
    D2E_EXPLICIT_EXCLUSIONS,
    D2E_POLICY_FAMILY,
    D2E_PROTECTED_FAMILY,
    D2E_SCENARIO_IDS,
    D2E_SEED
} from './registry';

export const D2E_I2_CUT_DEFINITION: WorldCutDefinition = WorldCutDefinitionSchema.parse({
    schemaVersion: 1,
    cutId: D2E_CUT.id,
    cutVersion: D2E_CUT.version,
    sourceCarrierKind: 'tactical-analysis',
    projectionDescription: 'Retain the exact spawn-centered I2 tactical support required to witness movement-created Needlepoint entry, the opponent response, an already-in-band control, comparator reports, and the excluded-start horizon warning.',
    admissibleDomain: {
        schemaVersion: 1,
        scenarioIds: D2E_SCENARIO_IDS,
        actionFamilies: [D2E_ACTION_FAMILY],
        policyFamilies: [D2E_POLICY_FAMILY],
        seeds: [D2E_SEED],
        constraints: [
            'Production spawn authority remains distance 640; other registered starts are analytical boundary pressure carriers.',
            'Each start crosses both first actors, both mirrors, and all 25 ordered pairs of the five registered base policies under the existing 16-turn horizon.',
            'A full-resource start at 769 is excluded from the admissible domain and retained only as a blocking horizon warning.',
            ...D2E_EXPLICIT_EXCLUSIONS
        ]
    },
    protectedFamily: D2E_PROTECTED_FAMILY,
    includedSupport: [
        'config-schema-seed-and-source-identity',
        'production-spawn-and-pressure-start-identity',
        'first-actor-mirror-policy-pair-and-horizon',
        'pre-move-and-post-entry-position-and-distance',
        'relic-action-legality-damage-and-stitching',
        'seam-pin-cooldown-resource-status-and-expiry',
        'opponent-next-ordinary-response',
        'recurrence-terminal-report-and-comparator-digests',
        'excluded-start-769-horizon-warning',
        'source-implementation-request-result-and-witness-digests'
    ],
    intentionallyForgottenDistinctions: D2E_EXPLICIT_EXCLUSIONS,
    excludedClaims: [
        'This bounded cut does not claim continuation completeness outside the exact registered I2 start/policy/mirror/actor/seed/horizon domain.',
        'Admission parity, a 57-percent aggregate, or route redistribution cannot establish gameplay quality, global balance, V5 approval, or product authority.',
        'A compact witness retains a reversible full-carrier/report reference and is not the full tactical relation.'
    ],
    deterministicContinuationClaim: 'bounded'
});

