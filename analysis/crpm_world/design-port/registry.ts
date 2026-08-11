import { V4_RULESET_ID } from '../../../shared/simulation';

import { SIMULATION_AUTHORITY_ADAPTER_VERSION } from '../adapters/v4-authority-adapter';
import { getCutDefinition } from '../cuts/registry';
import {
    D2A_PRESSURE_SEED,
    D2A_TACTICAL_CUT_ID,
    D2A_TACTICAL_PROTECTED_FAMILY
} from '../cuts/d2a-cuts';
import { V4_CUT_IDS } from '../cuts/v4-cuts';

export const OFFLINE_DESIGN_PROFILE_VERSION = 1;
export const OFFLINE_DESIGN_REQUEST_VERSION = 1;
export const D2A_ADAPTER_VERSION = 1;
export const D2A_PRESSURE_POLICY_FAMILY = 'registered-pressure-suite';
export const D2A_PRESSURE_ACTION_FAMILY = 'd2a-pressure-export';
export const REGISTERED_PRESSURE_SEED = D2A_PRESSURE_SEED;
export const REGISTERED_PRESSURE_DISTANCES = Object.freeze([448, 512, 576, 640, 704] as const);

export const OFFLINE_ADAPTER_IDS = Object.freeze({
    v4Authority: 'v4_authority',
    d2aTactical: 'd2a_tactical'
} as const);

export type OfflineAdapterId = typeof OFFLINE_ADAPTER_IDS[keyof typeof OFFLINE_ADAPTER_IDS];

export const FORBIDDEN_DESIGN_PORTS = Object.freeze([
    'live-activation',
    'protocol-mutation',
    'reward-mutation',
    'client-mutation',
    'server-mutation',
    'runtime-simulation-mutation',
    'socketio-event',
    'network-endpoint'
] as const);

const COMMON_ALLOWED_PORTS = [
    'analysis-result',
    'transition-witness',
    'diagnostic-profile',
    'scalar-probes',
    'residual-ledger'
] as const;

export type D2AConfigRegistration = Readonly<{
    caseId: 'f2' | 'f3' | 'f4' | 'h2' | 'h3';
    configId: string;
    schemaVersion: number;
    sourcePath: string;
    reportDigest: string;
    mandatoryEvidenceProbes: readonly string[];
}>;

export const D2A_CONFIG_REGISTRATIONS: readonly D2AConfigRegistration[] = Object.freeze([
    {
        caseId: 'f2',
        configId: 'v5-range-damage-forward-seam-pin-escape-slack-spun-cocoon-threadball-unweave-candidate-f2',
        schemaVersion: 8,
        sourcePath: 'analysis/tactical_model/configs/v5-range-damage-forward-seam-pin-escape-slack-spun-cocoon-threadball-unweave-candidate-f2.json',
        reportDigest: '6a2ac3a1b8bc13c299ebf20a926eb5af0ac5e3fb057a841febc2f13fcb5ffbea',
        mandatoryEvidenceProbes: ['f2.recurrence_matches', 'f2.turn_limit_results']
    },
    {
        caseId: 'f3',
        configId: 'v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-threadback-unweave-candidate-f3',
        schemaVersion: 9,
        sourcePath: 'analysis/tactical_model/configs/v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-threadback-unweave-candidate-f3.json',
        reportDigest: '9f5cd9574cc88fb2e885b631a7f9119a105ccdeb323eae1b1f0299e989a30332',
        mandatoryEvidenceProbes: ['f3.threadback_distance', 'f3.escape_slack_spent', 'f3.first_actor_win_rate']
    },
    {
        caseId: 'f4',
        configId: 'v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4',
        schemaVersion: 11,
        sourcePath: 'analysis/tactical_model/configs/v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4.json',
        reportDigest: '414e42735e97717f36b7583ffa80cb8130bf812259d598084416c4fd192247a6',
        mandatoryEvidenceProbes: [
            'f4.forced_opening_actions',
            'f4.recurrence_matches',
            'f4.turn_limit_results',
            'f4.first_actor_win_rate',
            'f4.distance_704_first_actor_win_rate'
        ]
    },
    {
        caseId: 'h2',
        configId: 'v5-range-damage-forward-seam-pin-escape-slack-opening-weave-paid-second-actor-candidate-h2',
        schemaVersion: 13,
        sourcePath: 'analysis/tactical_model/configs/v5-range-damage-forward-seam-pin-escape-slack-opening-weave-paid-second-actor-candidate-h2.json',
        reportDigest: 'f47fa00f6731254c62a115214e370ebdc363429499b9d2891b1c3cf0c0bc705c',
        mandatoryEvidenceProbes: [
            'h2.aggregate_first_actor_win_rate',
            ...REGISTERED_PRESSURE_DISTANCES.map((distance) => `h2.distance_${distance}_first_actor_win_rate`)
        ]
    },
    {
        caseId: 'h3',
        configId: 'v5-range-damage-forward-seam-pin-escape-slack-counterable-opening-weave-candidate-h3',
        schemaVersion: 14,
        sourcePath: 'analysis/tactical_model/configs/v5-range-damage-forward-seam-pin-escape-slack-counterable-opening-weave-candidate-h3.json',
        reportDigest: '4f148ce8ec2d50598ca7638b9cd74c820eb3cb3b7b2934a09867df51f2745d14',
        mandatoryEvidenceProbes: [
            'h3.aggregate_first_actor_win_rate',
            ...REGISTERED_PRESSURE_DISTANCES.map((distance) => `h3.distance_${distance}_forced_opening_actions`)
        ]
    }
]);

export type OfflineAdapterRegistration = Readonly<{
    id: OfflineAdapterId;
    version: number;
    baselineKind: 'ruleset' | 'd2a_config';
    rulesetsOrConfigs: readonly string[];
    cutIds: readonly string[];
    allowedPorts: readonly string[];
    mandatoryProtectedFamily: readonly string[];
    mandatoryEvidenceProbes: readonly string[];
}>;

const authorityCut = getCutDefinition(V4_CUT_IDS.authority);

const registrations: readonly OfflineAdapterRegistration[] = Object.freeze([
    {
        id: OFFLINE_ADAPTER_IDS.v4Authority,
        version: SIMULATION_AUTHORITY_ADAPTER_VERSION,
        baselineKind: 'ruleset',
        rulesetsOrConfigs: [V4_RULESET_ID],
        cutIds: [V4_CUT_IDS.authority],
        allowedPorts: [
            ...COMMON_ALLOWED_PORTS,
            'authority-transition',
            'projection-evidence',
            'replay-evidence'
        ],
        mandatoryProtectedFamily: authorityCut.protectedFamily,
        mandatoryEvidenceProbes: [
            'v4.accepted_commands',
            'v4.rejected_commands',
            'v4.mutated_commands',
            'v4.event_count'
        ]
    },
    {
        id: OFFLINE_ADAPTER_IDS.d2aTactical,
        version: D2A_ADAPTER_VERSION,
        baselineKind: 'd2a_config',
        rulesetsOrConfigs: D2A_CONFIG_REGISTRATIONS.map((item) => item.configId),
        cutIds: [D2A_TACTICAL_CUT_ID],
        allowedPorts: [
            ...COMMON_ALLOWED_PORTS,
            'tactical-voyage',
            'recurrence-evidence',
            'opening-search-evidence',
            'projection-evidence'
        ],
        mandatoryProtectedFamily: [...D2A_TACTICAL_PROTECTED_FAMILY],
        mandatoryEvidenceProbes: []
    }
]);

export function listOfflineAdapterRegistrations(): OfflineAdapterRegistration[] {
    return registrations.map((registration) => ({
        ...registration,
        rulesetsOrConfigs: [...registration.rulesetsOrConfigs],
        cutIds: [...registration.cutIds],
        allowedPorts: [...registration.allowedPorts],
        mandatoryProtectedFamily: [...registration.mandatoryProtectedFamily],
        mandatoryEvidenceProbes: [...registration.mandatoryEvidenceProbes]
    }));
}

export function getOfflineAdapterRegistration(id: string, version: number): OfflineAdapterRegistration {
    const registration = registrations.find((item) => item.id === id && item.version === version);
    if (!registration) {
        throw new RangeError(`Unknown offline world-design adapter ${id}@${version}.`);
    }
    return {
        ...registration,
        rulesetsOrConfigs: [...registration.rulesetsOrConfigs],
        cutIds: [...registration.cutIds],
        allowedPorts: [...registration.allowedPorts],
        mandatoryProtectedFamily: [...registration.mandatoryProtectedFamily],
        mandatoryEvidenceProbes: [...registration.mandatoryEvidenceProbes]
    };
}

export function getD2AConfigRegistration(configId: string): D2AConfigRegistration {
    const registration = D2A_CONFIG_REGISTRATIONS.find((item) => item.configId === configId);
    if (!registration) throw new RangeError(`Unknown registered D2A config ${configId}.`);
    return { ...registration, mandatoryEvidenceProbes: [...registration.mandatoryEvidenceProbes] };
}
