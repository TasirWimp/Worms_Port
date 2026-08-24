import { compareCanonicalText, sha256Digest } from '../../canonical';

export const D2E_PROFILE_VERSION = 3 as const;
export const D2E_REQUEST_SCHEMA_VERSION = 1 as const;
export const D2E_RESULT_SCHEMA_VERSION = 1 as const;
export const D2E_WORLD_ADAPTER = Object.freeze({ id: 'd2e_i2_world_design', version: 1 } as const);
export const D2E_ANALYTICAL_ADAPTER = Object.freeze({ id: 'd2e_i2_analytical_export', version: 1 } as const);
export const D2E_CUT = Object.freeze({ id: 'd2e_i2_spawn_pressure_v1', version: 1 } as const);
export const D2E_CONFIG_ID = 'v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-entry-seam-pin-candidate-i2';
export const D2E_CONFIG_SCHEMA_VERSION = 16 as const;
export const D2E_CONFIG_PATH = 'analysis/tactical_model/configs/v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-entry-seam-pin-candidate-i2.json';
export const D2E_SOURCE_COMMIT = '9da87c9aeec8d9d34cfbb2ff053f69e4cf035d40';
export const D2E_CRPM_METHOD_COMMIT = '995236df60924f790506cf5badec3c102abf3fd1';
export const D2E_SEED = 3_237_998_097 as const;
export const D2E_MAXIMUM_TURNS = 16 as const;
export const D2E_PRODUCTION_SPAWN_REFERENCE = 640 as const;
export const D2E_EXCLUDED_INITIAL_CARRIER_DISTANCE = 769 as const;
export const D2E_STARTING_DISTANCES = Object.freeze([
    511, 512, 513,
    575, 576, 577,
    639, 640, 641,
    703, 704, 705
] as const);
export const D2E_ENTRY_WITNESS_DISTANCES = Object.freeze([641, 703, 704] as const);
export const D2E_POLICIES = Object.freeze([
    'aggressive_damage',
    'range_pressure',
    'retreat_kite',
    'deny_strongest',
    'preserve_spoolburst'
] as const);

export const D2E_ACTION_FAMILY = 'd2e-i2-pressure-export';
export const D2E_POLICY_FAMILY = 'base-policy-pair-matrix-v1';
export const D2E_SCENARIO_IDS = Object.freeze(
    D2E_STARTING_DISTANCES.map((distance) => `d2e-i2-start-${distance}`)
);

export const D2E_PROTECTED_FAMILY = Object.freeze([
    'I2 remains the exact WP-015D2D rule: movement-created Needlepoint retains movement, legality, and 30 damage while suppressing only its target Seam Pin and caster cooldown.',
    'C4, F4, H2, and I1 report identities and historical analytical dispositions remain recoverable and unchanged.',
    'The excluded full-resource start-769 horizon warning remains explicit and blocks broader starting-carrier or design-landfall claims.',
    'D2E remains analysis-only, leaves shared/simulation.ts authoritative, and cannot activate V5 or acquire product authority.'
] as const);

export const D2E_EXPLICIT_EXCLUSIONS = Object.freeze([
    'Terrain geometry and collision are unmodelled.',
    'Aim, trajectory, splash, and projectile physics are unmodelled.',
    'Player skill and live Loomkeeper behavior are unmodelled.',
    'UI, replay, reward, protocol, networking, assets, and runtime mutation are unmodelled and forbidden.'
] as const);

export const D2E_ALLOWED_PORTS = Object.freeze([
    'analysis-result',
    'transition-witness',
    'tactical-voyage',
    'residual-ledger',
    'diagnostic-profile',
    'scalar-probes',
    'horizon-warning',
    'comparator-evidence'
] as const);

export const D2E_FORBIDDEN_PORTS = Object.freeze([
    'live-activation',
    'v5-activation',
    'protocol-mutation',
    'replay-mutation',
    'reward-mutation',
    'wallet-mutation',
    'client-mutation',
    'server-mutation',
    'runtime-simulation-mutation',
    'socketio-event',
    'network-endpoint',
    'asset-mutation'
] as const);

export const D2E_MANDATORY_EVIDENCE_PROBES = Object.freeze([
    'i2.match_count',
    'i2.terminal_unravelled',
    'i2.terminal_turn_limit',
    'i2.forced_opening_scenarios',
    'i2.nonterminal_recurrence_matches',
    'i2.first_actor_win_rate',
    ...D2E_STARTING_DISTANCES.map((distance) => `i2.distance_${distance}_first_actor_win_rate`),
    'i2.entry_seam_pin_suppressions',
    'i2.affected_opening_route_first_actor_wins',
    'i2.affected_opening_route_second_actor_wins',
    'i2.affected_opening_route_turn_limits',
    'i2.movement_created_needlepoint_damage',
    'i2.target_seam_pin_turns',
    'i2.caster_seam_pin_cooldown',
    'i2.threadball_uses',
    'i2.needlepoint_uses',
    'i2.spoolburst_uses',
    'i2.escape_slack_spent',
    'i2.excluded_start_769_turn_limits',
    'f4.excluded_start_769_turn_limits'
].sort(compareCanonicalText));

export const D2E_REPORT_BINDINGS = Object.freeze({
    c4: '65a7e4f9300f9bcc51715a670760d0e74d5a25f09c1b70e5ff061b118d0e7dac',
    f4: '8e0605617d63b25474da6df059455d0c365b93f657bf0260295788a854cd17dd',
    h2: 'e99091ad9a75104c16136d55d73d95dc92dcca1d266369455efeb73c9316f2fe',
    i1: '1dbefbedf8aa55e68002b91b6ed6c743085f5edbe5655a97f146d8161b053fa4',
    i2: '31e341944d0490d531e989463804f8402c32c191e7dd1d4fe205081ef0ce099d'
} as const);

export const D2E_REPORT_BINDING_DIGEST = sha256Digest(D2E_REPORT_BINDINGS);

export const D2E_ADMISSION_REGISTRATION = Object.freeze({
    registrationId: 'wp-015d2e-i2-admission',
    registrationVersion: 1,
    profileVersion: D2E_PROFILE_VERSION,
    adapters: [D2E_WORLD_ADAPTER, D2E_ANALYTICAL_ADAPTER],
    config: {
        id: D2E_CONFIG_ID,
        schemaVersion: D2E_CONFIG_SCHEMA_VERSION,
        path: D2E_CONFIG_PATH,
        sourceCommit: D2E_SOURCE_COMMIT
    },
    cut: D2E_CUT,
    productionSpawnReference: D2E_PRODUCTION_SPAWN_REFERENCE,
    startingDistances: D2E_STARTING_DISTANCES,
    excludedInitialCarrierDistances: [D2E_EXCLUDED_INITIAL_CARRIER_DISTANCE],
    firstActors: ['player', 'loomkeeper'],
    mirrored: [false, true],
    policies: D2E_POLICIES,
    orderedPolicyPairCount: 25,
    seed: D2E_SEED,
    maximumTurns: D2E_MAXIMUM_TURNS,
    outputDetailLevel: 'witnesses',
    productAuthority: 'none',
    maximumMaturity: 'M2_local_use',
    reportBindings: D2E_REPORT_BINDINGS,
    reportBindingDigest: D2E_REPORT_BINDING_DIGEST
});
