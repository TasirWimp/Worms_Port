import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    canonicalJson,
    compareCanonicalText,
    deepSortJson,
    sha256Digest,
    sha256Text,
    type JsonValue
} from '../canonical';

/**
 * This module is deliberately independent of the Stage B executor. It reads
 * only committed result bytes and reconstructs every Stage C claim from the
 * retained endpoint records. Do not add simulation, cut, route-generator, or
 * Stage B assessor imports here.
 */

export const STAGE_C_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export const STAGE_B_PREREGISTRATION_SOURCE_COMMIT =
    '65b2153714f237964354da3791fe4af4694a0594';
export const STAGE_B_PREREGISTRATION_TERMINAL_COMMIT =
    '6e88418a6a90281976dd5f6dcf2e6db55d9e4009';
export const STAGE_B_EXECUTION_SOURCE_COMMIT =
    '439bba3d92a4b4ab3216ad3fa987e90b983dd2c0';
export const STAGE_B_RESULT_COMMIT =
    'd340a2286598a1fd399dfa23ba55426185f0e96d';
export const STAGE_B_TERMINAL_EVIDENCE_COMMIT =
    '6e47d42b691effe5d34c5c050302def40ae40181';
export const STAGE_B_RESULT_DIGEST =
    'db073dfe67e0687253fe284832b45fad051b463edfd2e8ac9d3fb862b86c3a11';
export const STAGE_B_RESULT_BLOB = '2452a19b700fd6c6965fdb20a27824cf386070c9';

export const STAGE_C_REGISTRATION_PATH =
    'analysis/crpm_world/navigation/wp-015d2r-stage-c-reconstruction-registration-v1.json';
export const STAGE_C_CONTRACT_PATH =
    'docs/planning/wp-015d2r-stage-c-independent-reconstruction-and-chart-revision-contract-v1.md';
export const STAGE_C_RECONSTRUCTOR_PATH =
    'analysis/crpm_world/navigation/reconstruct-wp-015d2r-stage-c-return-v1.ts';
export const STAGE_C_RUNNER_PATH = 'scripts/run-wp-015d2r-stage-c-return-v1.ts';
export const STAGE_C_TEST_PATH = 'tests/crpm-world/wp-015d2r-stage-c-return-v1.test.ts';
export const STAGE_C_EVIDENCE_PATH = 'docs/evidence/wp-015d2u.json';
export const STAGE_C_RESULT_PATH = 'docs/evidence/wp-015d2r-stage-c-v1/result.json';
export const STAGE_C_REPORT_PATH =
    'docs/planning/wp-015d2r-stage-c-independent-reconstruction-and-chart-revision-report-v1.md';
export const STAGE_C_REVIEW_RETURN_PATH =
    'docs/evidence/wp-015d2r-stage-c-v1/review-return.json';
export const STAGE_B_RESULT_PATH = 'docs/evidence/wp-015d2r-stage-b-v1/result.json';
export const STAGE_A_RETURN_PATH = 'docs/evidence/wp-015d2r/review-return.json';
export const D2Q_RETURN_PATH = 'docs/evidence/wp-015d2q/review-return.json';

export const STAGE_C_SOURCE_OUTPUTS = Object.freeze([
    STAGE_C_EVIDENCE_PATH,
    STAGE_C_CONTRACT_PATH,
    STAGE_C_REGISTRATION_PATH,
    STAGE_C_RECONSTRUCTOR_PATH,
    STAGE_C_RUNNER_PATH,
    STAGE_C_TEST_PATH
]);
export const STAGE_C_RESULT_OUTPUTS = Object.freeze([
    STAGE_C_RESULT_PATH,
    STAGE_C_REPORT_PATH
]);
export const STAGE_C_REVIEW_OUTPUTS = Object.freeze([STAGE_C_REVIEW_RETURN_PATH]);
export const STAGE_C_ALL_OUTPUTS: string[] = [
    ...STAGE_C_SOURCE_OUTPUTS,
    ...STAGE_C_RESULT_OUTPUTS,
    ...STAGE_C_REVIEW_OUTPUTS
];

const D2Q_SOURCE_COMMIT = '85f6ea945bd2b5b2aacb6b61cc2af52fe0c09ebb';
const D2Q_RETURN_COMMIT = '4fc88d947a98d737cbcdfd22d31d36c4bd5843eb';
const D2Q_RESULT_DIGEST =
    'b538f5b6da82dc3b6655a9c0d89404e3b20592191886a9bb4280d6fe481d1615';
const D2Q_RETURN_BLOB = 'f992202b2be4d8e47e293a81325537ee28474f47';
const D2Q_CASE_ROWS_CANONICAL_DIGEST =
    '2202151c88d85e922b303bebd61d43c52279d571f1fe2087260ec27c31a9129d';
const D2Q_ABLATION_ROWS_CANONICAL_DIGEST =
    '675b829933fc5e20ed893eacdfb718a928ba5397d438be3181922b1fa1b53a7c';
const D2Q_REOPENING_CONDITION =
    'A changed source, case, target, cut, support, command, horizon, owner boundary or missing recoverable artifact requires a newly authorized child; this registration never widens silently.';
const STAGE_A_RETURN_BLOB = '1a55777608da47b20b4bb06128edaa7e9ed90e1a';
const STAGE_A_RETURN_COMMIT = '4bcb213c9a1a2619d8699f3fed275e6afa71f03e';
const STAGE_C_RESULT_STOP_STATEMENT =
    'WP-015D2R Stage C reconstruction stopped for durable result review; witness re-entry remains pending.' as const;
const STAGE_C_STOP_STATEMENT =
    'WP-015D2R Stage C stopped; no successor world execution opened.' as const;

/** Exact immutable predecessor manifest; registration cannot substitute another valid 15-row set. */
export const STAGE_C_EXPECTED_SOURCE_BINDINGS = Object.freeze([
    { id: 'STAGE_B_PREREGISTRATION_CONTRACT', commit: STAGE_B_PREREGISTRATION_SOURCE_COMMIT,
        path: 'docs/planning/wp-015d2r-stage-b-one-next-command-search-contract-v1.md', mode: '100644',
        blob: '6140b390d8e073378e57c90c2d2cd8c2dac20f79', sha256: '37d9fa6d566ead810b83c19fc29f72363beb6c6fc734e74e04e1b408eb024dd5',
        role: 'immutable_human_stage_b_preregistration' },
    { id: 'STAGE_B_PREREGISTRATION_MACHINE', commit: STAGE_B_PREREGISTRATION_SOURCE_COMMIT,
        path: 'analysis/crpm_world/navigation/wp-015d2r-stage-b-one-next-command-search-registration-v1.json', mode: '100644',
        blob: 'd8d6b5a6c52fb421fb77ab4cb32a2d1f48ed03aa', sha256: 'b02ee74661e7c9a6b48c3f9917ea12d6889840800a3e0036518de3a933961087',
        role: 'immutable_machine_stage_b_preregistration' },
    { id: 'STAGE_B_PREREGISTRATION_EVIDENCE', commit: STAGE_B_PREREGISTRATION_TERMINAL_COMMIT,
        path: 'docs/evidence/wp-015d2s.json', mode: '100644',
        blob: '416c137f9360967badedb100fa9d3851749763af', sha256: 'f27c7de5045257f794814f42698541ef357a856ec53bc196096971fb61474738',
        role: 'immutable_preregistration_terminal_evidence' },
    { id: 'STAGE_B_PRIMARY_BUILDER_PROHIBITED_INPUT', commit: STAGE_B_EXECUTION_SOURCE_COMMIT,
        path: 'analysis/crpm_world/navigation/assess-wp-015d2r-stage-b-one-next-command-search-v1.ts', mode: '100644',
        blob: '1fea48debecd32c23f2fdd0f51355aeb169f7834', sha256: '759bf2b459a500ccb14f5a9ba6e26bcd64e64a1f31d2ba63cb760b707575366c',
        role: 'preserved_predecessor_identity_never_reconstruction_answer' },
    { id: 'STAGE_B_RUNNER_PROHIBITED_EXECUTION', commit: STAGE_B_EXECUTION_SOURCE_COMMIT,
        path: 'scripts/run-wp-015d2r-stage-b-one-next-command-search-v1.ts', mode: '100644',
        blob: '042b1ce1a49d24763e93b8521f1112b826f4aa1b', sha256: 'ddca5c4864ac883c894b82115d0a473bd94bf6649d254d4b0b1e920c014e9f6d',
        role: 'preserved_predecessor_identity_never_executed' },
    { id: 'STAGE_B_FOCUSED_TESTS_PRESERVED', commit: STAGE_B_EXECUTION_SOURCE_COMMIT,
        path: 'tests/crpm-world/wp-015d2r-stage-b-one-next-command-search-v1.test.ts', mode: '100644',
        blob: '01a081de0420909b2ca8846884f407f635657551', sha256: '0487dfbabff4d1761b4bfaa09ca359f71a10f9293c775cbd5b6993eb73c73f66',
        role: 'preserved_predecessor_validation_not_stage_c_reconstruction' },
    { id: 'STAGE_B_DURABLE_RESULT', commit: STAGE_B_RESULT_COMMIT,
        path: STAGE_B_RESULT_PATH, mode: '100644', blob: STAGE_B_RESULT_BLOB,
        sha256: '947e951f1f155931d066322df8e7b1748c282b812dca8355bf31d08be23f19ff',
        semanticDigest: STAGE_B_RESULT_DIGEST, role: 'sole_stage_c_reconstruction_data_input' },
    { id: 'STAGE_B_HUMAN_REPORT', commit: STAGE_B_RESULT_COMMIT,
        path: 'docs/planning/wp-015d2r-stage-b-one-next-command-search-report-v1.md', mode: '100644',
        blob: '10a753c0c7d1f7d271f2b6f8fd47daa8fc898b46', sha256: '2b540c70635d325d5423073da49d7d3582e1c52dbb9e300f02848bbee63b6962',
        role: 'human_predecessor_report_for_parity_only' },
    { id: 'STAGE_B_TERMINAL_WORK_EVIDENCE', commit: STAGE_B_TERMINAL_EVIDENCE_COMMIT,
        path: 'docs/evidence/wp-015d2t.json', mode: '100644',
        blob: '74a08801666a214cfdf53bbc2d7b98aee43b7343', sha256: '59a5de10635aeeebbef9ac55aca18e1f906676075f8db0e015bad607ee3801fb',
        role: 'immutable_stage_b_terminal_evidence' },
    { id: 'STAGE_A_NAVIGATOR_CONTRACT', commit: STAGE_A_RETURN_COMMIT,
        path: 'docs/planning/wp-015d2r-residue-driven-round-trip-navigator-contract.md', mode: '100644',
        blob: '38f27751d97c6087bb1e314c6ecc31611435a974', sha256: '956ab24cdf152d7db3185784b5d012c407ab5f4b23cee7366077df9a3703874b',
        role: 'immutable_stage_a_witness_and_return_contract' },
    { id: 'STAGE_A_CANDIDATE_REGISTRY', commit: STAGE_A_RETURN_COMMIT,
        path: 'docs/planning/wp-015d2r-residue-driven-round-trip-candidate-registry.json', mode: '100644',
        blob: 'd3002ef29f748964a4bfcdce4199d8075a6f57ce', sha256: 'e88b4f76404cca15dadad14a5b24ae5509ff8ea715449533e897aa3d22cc5106',
        role: 'immutable_stage_a_chart_and_source_bindings' },
    { id: 'STAGE_A_REVIEW_RETURN', commit: STAGE_A_RETURN_COMMIT,
        path: STAGE_A_RETURN_PATH, mode: '100644', blob: STAGE_A_RETURN_BLOB,
        sha256: '5989e11341ca41bdc2387a3830a67d9cfc2a7f3677a5860c7fb1e8915c2add6d',
        role: 'immutable_stage_a_durable_return' },
    { id: 'D2Q_COMMAND_GATE_RETURN', commit: D2Q_RETURN_COMMIT,
        path: D2Q_RETURN_PATH, mode: '100644', blob: D2Q_RETURN_BLOB,
        sha256: 'e951bbdf74bfceb781f20794ebde5786e848b5992c8de2aeab8486dde447e308',
        semanticDigest: D2Q_RESULT_DIGEST, role: 'immutable_command_gate_anchor_recovered_without_replay' },
    { id: 'THIN_V4_CUT_SOURCE', commit: '3a3cca8c720f89251cad56029b9f7b1c69d87146',
        path: 'analysis/crpm_world/cuts/v4-cuts.ts', mode: '100644',
        blob: '769d6fc2ca689eeedfe9bba680b9d24aa37fc67e', sha256: '0e404a6316630ee12203889bf9c2ea97357865a12832a1252f5b1c2274f2a3f2',
        role: 'exact_alias_producing_cut_source_bytes' },
    { id: 'CANONICAL_JSON_UTILITY', commit: '3a3cca8c720f89251cad56029b9f7b1c69d87146',
        path: 'analysis/crpm_world/canonical.ts', mode: '100644',
        blob: 'f52effc9560d9cc2fb2227080208f4e99a58ca52', sha256: 'df093ac1934f4ed88ba02986399b09276c2a696e55c8f415a3bd6018767d5e67',
        role: 'generic_canonicalization_utility_only' }
]);

export const STAGE_C_EXPECTED_INDEPENDENT_RECONSTRUCTION_BOUNDARY = Object.freeze({
    input:
        'Read and authenticate only the Git-object bytes of STAGE_B_DURABLE_RESULT at d340a2286598a1fd399dfa23ba55426185f0e96d for reconstructed endpoint, class, pair, cross-tab, witness, carrier and chart facts. Other bindings are immutable provenance and parity inputs.',
    implementationClass: 'reconstruction_independent',
    evidenceClass: 'correlated_reuse',
    covarianceRule:
        'The Stage C implementation path must be independent of the Stage B builder, but every mathematical fact is reconstructed from the same Stage B observations and remains correlated_reuse, never empirically independent.',
    allowedSemanticDependency:
        'analysis/crpm_world/canonical.ts may supply generic canonical JSON only; Node standard-library hashing, Git object reads, strict JSON parsing and ordinary collection operations are allowed.',
    forbiddenImports: [
        'analysis/crpm_world/navigation/assess-wp-015d2r-stage-b-one-next-command-search-v1.ts',
        'scripts/run-wp-015d2r-stage-b-one-next-command-search-v1.ts',
        'analysis/crpm_world/adapters/v4-authority-adapter.ts',
        'shared/simulation.ts'
    ],
    forbiddenActions: [
        'rerun Stage B or its verifier as the reconstruction answer',
        'enumerate or regenerate route words',
        'call createSimulation, applySimulationCommand, tickSimulation or any authority adapter',
        'import, invoke, spawn, copy or transliterate the primary Stage B semantic builder',
        'read ignored Stage B raw JSONL as a substitute for the committed durable result',
        'replay the calibration sentinel or D2Q cases',
        'mutate any predecessor, cut, schema, authority, adapter, sealed executor, gameplay, dependency, CRPM or product file'
    ]
});

export const STAGE_C_EXPECTED_REGISTRATION_FIXED_FRAME = Object.freeze({
    level: 'L4+',
    world: 'Worms_Port V4 bounded analytical world at the bound predecessor bytes',
    cutStance:
        'source equivalence under thin_visible_duel_v0@2; D2Q authority_v4@2 remains a distinct immutable command-gate anchor',
    protectedFamily: [
        'D2Q command-gate actor/expectedTurn and accepted/mutated/error/event distinctions recoverable from immutable provenance',
        'the complete registered Stage B one-next-command target over all 274 eligible endpoint occurrences',
        'route and exact-state provenance sufficient for audit re-entry without promotion to live recursive state',
        'explicit residue, reopening conditions and successor stop'
    ],
    d2qProtectedReadout: {
        sourceResultDigest: D2Q_RESULT_DIGEST,
        caseRowsCanonicalDigest: D2Q_CASE_ROWS_CANONICAL_DIGEST,
        ablationRowsCanonicalDigest: D2Q_ABLATION_ROWS_CANONICAL_DIGEST,
        caseCount: 4,
        requiredCaseFields: [
            'caseId',
            'edgeDigest',
            'evidenceClass',
            'inputUnchanged',
            'mathematicalPlacementImplication',
            'observedClass',
            'readout',
            'reopeningCondition',
            'requestDigest',
            'sourceReadoutMatches',
            'targetDigest',
            'unchangedRejection',
            'verdict',
            'witnessDigest'
        ],
        requiredDecodedReadoutFields: [
            'accepted',
            'authoritativeEvents',
            'error',
            'eventsDigest',
            'movementRemaining',
            'mutated',
            'playerX',
            'postStateDigest',
            'preStateDigest',
            'revision'
        ],
        requiredFieldAblationControls: [
            'fieldId and exact omittedFieldIds',
            'full, ablated and restored class identities',
            'primary, equality and error-only controls where registered',
            'all seven derived frame checks',
            'sourceFactsPass, actuallyOmitted and restorationRecovers',
            'verdict, evidenceClass, mathematicalPlacementImplication and reopeningCondition'
        ],
        caseVerdicts: {
            'CMD-VALID-01': 'accepted_true_mutated_true_error_null_moved_event',
            'CMD-TURN-01': 'accepted_false_mutated_false_LATE_TURN',
            'CMD-ACTOR-01': 'accepted_false_mutated_false_NOT_YOUR_TURN',
            'CMD-PRECEDENCE-01': 'accepted_false_mutated_false_LATE_TURN'
        },
        fieldVerdicts: {
            actor: 'target_relevant_on_declared_V4_command_gate',
            expectedTurn: 'target_relevant_on_declared_V4_command_gate'
        },
        recoveryRule:
            'Strictly parse the authenticated D2Q return bytes, independently derive a normalized four-case table containing every required case control and every decoded readout field, derive the complete actor/expectedTurn ablation controls and verdict table, and compare each value with the immutable registered row digests and source rows without importing or executing D2Q. Artifact presence, blob equality, row-digest equality or result-digest equality alone is insufficient without the value-by-value normalized rows. The derived rows remain the command-gate anchor, not Stage B source-equivalence classes.'
    },
    K_target: {
        id: 'K_WPV4_ONE_COMMAND_COMPLETE_V1',
        domain:
            'Every one of the 274 committed eligible endpoint occurrences and every unordered pair within an equal thin_visible_duel_v0@2 source class.',
        readout: [
            'accepted',
            'mutated',
            'error normalized as null or exact code/message',
            'ordered exact authoritativeEvents',
            'post-command movementRemaining'
        ],
        equality:
            'Exact decoded equality with numeric tolerance 0. Digests identify retained bytes but never replace decoded comparison.',
        excludes: [
            'route history',
            'pre-command revision',
            'post-command revision',
            'pre-command exact state digest',
            'post-command exact state digest'
        ]
    },
    routes: 'Only route records already retained inside the committed Stage B result; no route generation or replay.',
    horizon: 'Exactly the already-observed single next MOVE +1 readout; no further authority call.',
    support:
        'Authenticated Stage B result bytes, exact Stage A/D2Q provenance bindings, independent reconstruction code and destructive validation.',
    tolerance: 0,
    oracleInputBoundary:
        'No authority, gameplay, hidden executor, Stage B semantic helper, player observation, timing, external oracle or uncommitted raw file may contribute an answer.'
});

export const STAGE_C_EXPECTED = Object.freeze({
    endpointCount: 274,
    sourceClassCount: 9,
    aliasedClassCount: 7,
    pairCount: 7_378,
    targetRelevantPairCount: 1_113,
    outcomes: Object.freeze({
        frame_support_failure: 0,
        command_semantic_split: 1_099,
        continuation_support_split: 14,
        provenance_exact_state_only_split: 2_983,
        no_target_relevant_split: 3_282
    }),
    qSupportEqualityPairCount: 6_265,
    qSupportCounterexampleCount: 0,
    qCommandEqualityPairCount: 6_279,
    qCommandSemanticCounterexampleCount: 0,
    qCommandContinuationCounterexampleCount: 14
});

export const STAGE_C_PRIMARY_OUTCOMES = Object.freeze([
    'frame_support_failure',
    'command_semantic_split',
    'continuation_support_split',
    'provenance_exact_state_only_split',
    'no_target_relevant_split'
] as const);

export type StageCPrimaryOutcome = typeof STAGE_C_PRIMARY_OUTCOMES[number];
export type StageCCarrierRole =
    | 'live_carrier'
    | 'target_relative_support'
    | 'provenance'
    | 're_entry_support'
    | 'unresolved';

type StageBProjection = Readonly<{
    cutId: string;
    cutVersion: number;
    classKey: string;
    projectedValue: JsonValue;
}>;

type StageBReadout = Readonly<{
    accepted: boolean;
    mutated: boolean;
    error: null | { code: string; message: string };
    authoritativeEvents: JsonValue[];
    eventsDigest: string;
}>;

export type StageCEndpoint = Readonly<{
    rowType: 'eligible_endpoint';
    endpointId: string;
    wordIndex: number;
    routeId: string;
    seed: number;
    calling: string;
    rulesetId: string;
    endpointDepth: number;
    directions: number[];
    sourceProjection: StageBProjection;
    preCommandStateDigest: string;
    preCommandRevision: number;
    preCommandMovementRemaining: number;
    actor: string;
    expectedTurn: number;
    command: { type: string; direction: number };
    readout: StageBReadout;
    postCommandStateDigest: string;
    postCommandRevision: number;
    postCommandMovementRemaining: number;
    postCommandProjection: StageBProjection;
    endpointInputUnchanged: boolean;
    frameOk: boolean;
}>;

export type StageCReconstructedPair = Readonly<{
    rowType: 'alias_pair';
    pairId: string;
    classKey: string;
    projectedValue: JsonValue;
    leftEndpointId: string;
    rightEndpointId: string;
    leftRouteId: string;
    rightRouteId: string;
    leftEndpointDepth: number;
    rightEndpointDepth: number;
    leftDirections: number[];
    rightDirections: number[];
    preCommandMovementRemainingPair: [number, number];
    postCommandMovementRemainingPair: [number, number];
    equality: {
        commandSemanticEqual: boolean;
        postMovementRemainingEqual: boolean;
        preRevisionEqual: boolean;
        postRevisionEqual: boolean;
        preStateDigestEqual: boolean;
        postStateDigestEqual: boolean;
        routeHistoryEqual: boolean;
    };
    primaryOutcome: StageCPrimaryOutcome;
    targetRelevant: boolean;
}>;

export type StageCCrossTabRow = Readonly<{
    endpointOrder: 'canonical_route_id_left_right';
    endpointDepthPair: [number, number];
    depthRelation: 'same_depth' | 'cross_depth';
    preCommandMovementRemainingPair: [number, number];
    postCommandMovementRemainingPair: [number, number];
    knownRouteLengthMovementBudgetPattern: boolean;
    primaryOutcome: StageCPrimaryOutcome;
    pairCount: number;
}>;

type GitChangeRow = Readonly<{
    path: string;
    status: string;
    oldMode: string;
    newMode: string;
    oldBlob: string;
    newBlob: string;
}>;

export type StageCRangeAudit = Readonly<{
    baseCommit: string;
    resultCommit: string;
    allowedPaths: string[];
    commits: { commit: string; parent: string; rows: GitChangeRow[] }[];
    endpointRows: GitChangeRow[];
    rangeDigest: string;
}>;

export type SourceIdentityRow = Readonly<{
    path: string;
    mode: '100644';
    blob: string;
    sha256: string;
}>;

export type StageCCandidateAssessment = Readonly<{
    candidateId: string;
    coordinates: string[];
    protectedTarget: string;
    groupCount: number;
    equalityPairCount: number;
    partitionIdentityDigest: string;
    counterexampleCount: number;
    counterexamplePairIdsDigest: string;
    verdict: string;
    nonVacuous: boolean;
    scopeGuard: string;
}>;

export type StageCD2QClassPartition = Readonly<{
    digest: string;
    members: string[][];
}>;

export type StageCD2QPairControl = Readonly<{
    ablatedProjectionEqual: boolean;
    caseIds: string[];
    errorEqual: boolean;
    eventsEqual: boolean;
    evidenceClass: 'correlated_reuse';
    fullProjectionEqual: boolean;
    kind: 'primary_pair' | 'conditional_equal_target' | 'equal_post_state_different_error';
    mathematicalPlacementImplication: 'none';
    postStateEqual: boolean;
    reopeningCondition: string;
    restorationRecovers: boolean;
    restoredProjectionEqual: boolean;
    targetDigests: string[];
    targetEqual: boolean;
    verdict: 'target_relevant_on_declared_V4_command_gate' | 'no_omission_witness_found';
}>;

export type StageCResult = Readonly<{
    schemaVersion: 1;
    resultId: 'wp-015d2r-stage-c-independent-reconstruction-and-chart-revision-v1';
    registrationId: 'WP-015D2R:stage-c-independent-reconstruction-and-chart-revision:v1';
    packageId: 'WP-015D2R';
    supportWorkPackageId: 'WP-015D2U';
    stage: 'stage_c';
    source: {
        sourceCommit: string;
        terminalBoundaryCommit: typeof STAGE_B_TERMINAL_EVIDENCE_COMMIT;
        registration: SourceIdentityRow;
        contract: SourceIdentityRow;
        implementationRows: SourceIdentityRow[];
        predecessorBindingCount: number;
        predecessorBindingsDigest: string;
        sourceRange: StageCRangeAudit;
        sourceDigest: string;
    };
    predecessor: {
        preregistrationSourceCommit: typeof STAGE_B_PREREGISTRATION_SOURCE_COMMIT;
        preregistrationTerminalCommit: typeof STAGE_B_PREREGISTRATION_TERMINAL_COMMIT;
        executionSourceCommit: typeof STAGE_B_EXECUTION_SOURCE_COMMIT;
        resultCommit: typeof STAGE_B_RESULT_COMMIT;
        terminalEvidenceCommit: typeof STAGE_B_TERMINAL_EVIDENCE_COMMIT;
        resultPath: typeof STAGE_B_RESULT_PATH;
        resultBlob: typeof STAGE_B_RESULT_BLOB;
        resultGitByteSha256: string;
        resultDigest: typeof STAGE_B_RESULT_DIGEST;
        evidenceClass: 'correlated_reuse';
    };
    fixedFrame: {
        level: 'L4+';
        cutStance: string;
        protectedFamily: string;
        K_target: {
            id: 'K_WPV4_ONE_COMMAND_COMPLETE_V1';
            commandSemanticReadout: string[];
            continuationSupportReadout: ['postCommandMovementRemaining'];
            equality: 'exact_canonical_equality';
            finiteDomainOnly: true;
        };
        world: string;
        domain: string;
        routes: string;
        horizon: string;
        support: string[];
        tolerance: 0;
        oracleInputBoundary: string;
    };
    reconstruction: {
        implementationClass: 'reconstruction_independent';
        mathematicalEvidenceClass: 'correlated_reuse';
        endpointCount: number;
        endpointIdentityDigest: string;
        endpointRowsMatchCount: number;
        sourceClassCount: number;
        aliasedClassCount: number;
        classSummaries: {
            classKey: string;
            memberCount: number;
            pairCount: number;
            endpointIdentityDigest: string;
        }[];
        pairCount: number;
        pairIdentityDigest: string;
        targetRelevantPairIdentityDigest: string;
        reconstructedPairRowsDigest: string;
        predecessorPairRowsDigest: string;
        predecessorPairRowsMatchCount: number;
        primaryOutcomeCounts: Record<StageCPrimaryOutcome, number>;
        targetRelevantPairCount: number;
        targetRelevantUnequalPreCommandMovementRemainingCount: number;
        targetRelevantEqualPreCommandMovementRemainingCount: number;
        targetRelevantSameDepthCount: number;
        crossTab: StageCCrossTabRow[];
        crossTabRowsDigest: string;
        crossTabDigest: string;
        predecessorCrossTabMatches: boolean;
    };
    candidateAssessments: {
        thinOnly: StageCCandidateAssessment;
        Q_support: StageCCandidateAssessment;
        Q_command: StageCCandidateAssessment & {
            continuationSupportCounterexampleCount: number;
            continuationSupportCounterexamplePairIdsDigest: string;
        };
        admissibilityOnly: StageCCandidateAssessment;
        routeHistory: StageCCandidateAssessment;
        revisionProxy: StageCCandidateAssessment;
        exactState: StageCCandidateAssessment;
    };
    routeDepthMovementBudgetCoformation: {
        rows: {
            endpointDepth: number;
            endpointCount: number;
            preCommandMovementRemainingValues: number[];
            postCommandMovementRemainingValues: number[];
            nextMoveAdmissibilityValues: boolean[];
            preCommandRevisionValues: number[];
        }[];
        allTargetRelevantPairsCrossDepth: boolean;
        allTargetRelevantPairsCrossPreCommandBudget: boolean;
        interpretation: 'co_formed_on_this_finite_domain_not_causal';
        nonClaims: string[];
    };
    witnessReturn: {
        executionWitness: 'present';
        evidenceClass: 'correlated_reuse';
        navigatorAdmission: 'pending' | 'reviewed_bounded' | 'not_admitted';
        candidateCarrierSufficiency:
            | 'sufficient_for_complete_registered_one_command_target_on_finite_domain_nonunique'
            | 'unresolved';
        W_status: 'present';
        W: Record<string, JsonValue>;
        Omega_W_status: 'evaluated_exact' | 'frame_support_failure';
        Omega_W: Record<string, JsonValue>;
        P_W_status: 'observed' | 'failed_reconstruction';
        P_W: Record<string, JsonValue>;
        N_W_status: 'observed' | 'incomplete_negative_retention';
        N_W: Record<string, JsonValue>;
        J_W: 'complete_for_bounded_registered_one_command_audit' | 'incomplete';
        J_W_boundary: {
            auditTarget: 'complete_for_bounded_registered_one_command_audit';
            stateMaterialSeparationDigest: string;
            liveRecursiveState: 'absent_not_established';
            recursiveContinuationClosure: false;
        };
        thinCutCompleteness: 'intentionally_incomplete';
        auditEvidenceCompleteness: 'complete_for_registered_finite_domain';
    };
    protectedCoreRecovery: {
        status: 'recovered_from_immutable_provenance_without_replay';
        d2qSourceCommit: typeof D2Q_SOURCE_COMMIT;
        d2qResultDigest: typeof D2Q_RESULT_DIGEST;
        d2qReturnBlob: typeof D2Q_RETURN_BLOB;
        caseRowsCanonicalDigest: typeof D2Q_CASE_ROWS_CANONICAL_DIGEST;
        ablationRowsCanonicalDigest: typeof D2Q_ABLATION_ROWS_CANONICAL_DIGEST;
        caseIds: string[];
        caseReadouts: {
            caseId: string;
            edgeDigest: string;
            evidenceClass: 'correlated_reuse';
            inputUnchanged: true;
            mathematicalPlacementImplication: 'none';
            observedClass: string;
            accepted: boolean;
            mutated: boolean;
            error: null | { code: string; message: string };
            authoritativeEvents: JsonValue[];
            eventsDigest: string;
            movementRemaining: number;
            playerX: number;
            revision: number;
            preStateDigest: string;
            postStateDigest: string;
            reopeningCondition: string;
            requestDigest: string;
            targetDigest: string;
            unchangedRejection: boolean;
            verdict: 'matched_source_prediction';
            sourceReadoutMatches: true;
            witnessDigest: string;
        }[];
        fieldVerdicts: {
            actor: 'target_relevant_on_declared_V4_command_gate';
            expectedTurn: 'target_relevant_on_declared_V4_command_gate';
        };
        ablationControls: {
            ablationId: 'ABL-ACTOR' | 'ABL-EXPECTED-TURN';
            fieldId: 'actor' | 'expectedTurn';
            roleFamily: 'command_input_coordinate';
            rentScope: 'declared_target';
            canonicalSourceRowDigest: string;
            omittedFieldIds: string[];
            contextDigest: string;
            stageDigest: string;
            fullClasses: StageCD2QClassPartition;
            ablatedClasses: StageCD2QClassPartition;
            restoredClasses: StageCD2QClassPartition;
            aliasPairs: { caseIds: string[]; targetEqual: boolean }[];
            equalTargetControls: { caseIds: string[]; targetEqual: boolean }[];
            primaryControl: StageCD2QPairControl;
            equalityControl: StageCD2QPairControl | null;
            errorOnlyControl: StageCD2QPairControl | null;
            frameChecks: Record<string, boolean>;
            actuallyOmitted: boolean;
            sourceFactsPass: boolean;
            restorationRecovers: boolean;
            evidenceClass: 'correlated_reuse';
            mathematicalPlacementImplication: 'none';
            reopeningCondition: string;
            derivedVerdict: 'target_relevant_on_declared_V4_command_gate' | 'unresolved';
        }[];
        matchedSourcePredictionCount: 4;
        conditionalActorTurnScopePreserved: true;
    };
    carrierRoles: {
        field: string;
        primaryRole: StageCCarrierRole;
        boundedFinding: string;
        promotionGuard: string;
    }[];
    stateMaterialSeparation: {
        auditPredecessorProvenance: {
            status: 'authenticated' | 'unresolved';
            bindingCount: number;
            bindingsDigest: string;
            includes: string[];
        };
        domainTransitionProvenance: {
            status: 'route_history_and_revision_only' | 'unresolved';
            routeHistoryRole: StageCCarrierRole;
            revisionRole: StageCCarrierRole;
        };
        reEntryMaterial: {
            status: 'exact_state_digest_only' | 'unresolved';
            exactStateDigestRole: StageCCarrierRole;
        };
        liveRecursiveState: {
            status: 'absent_not_established';
            recursiveContinuationClosure: false;
        };
        preCommandBudget: {
            status: 'bounded_one_command_live_carrier' | 'unresolved';
            role: StageCCarrierRole;
            recursiveState: false;
        };
    };
    tauReturn: {
        transitionId: 'TAU-WPV4-RETURN-01A';
        obligations: { obligationId: string; passed: boolean; evidenceDigest: string }[];
        semanticObligationsPass: boolean;
        durableReviewObligationPass: boolean;
        status: 'licensed_for_bounded_stage_c_reentry_only' | 'candidate_unlicensed';
        licenseScope: string;
        productAuthority: 'none';
        mathematicalPlacementImplication: 'none';
    };
    chartRevision: {
        revisionId: 'WP-015D2R:stage-c-chart-revision:v1';
        status: 'candidate_revision_pending_review' | 'reviewed_bounded' | 'not_accepted';
        strengthenedRoutes: { routeId: string; status: string; basis: string }[];
        demotedRoutes: { routeId: string; status: string; basis: string }[];
        splitCarrierRoles: { coordinate: string; role: StageCCarrierRole; scope: string }[];
        shoalsAndDeadEnds: string[];
        residueCarriedForward: string[];
        recommendedNextTransition: null | {
            transitionId: 'TAU-WPV4-QSUPPORT-LONGER-HORIZON-01';
            status: 'recommended_for_separate_preregistration_only';
            derivedFromResidue: string;
            executionOpened: false;
        };
        explicitStop: null | string;
    };
    governance: {
        pilotActivation: 'required';
        productAuthority: 'none';
        mathematicalPlacementImplication: 'none';
        playerObservationTiming: 'closed';
        gameplayChange: false;
        p5: 'closed';
        successorWorldExecution: 'closed';
        globalMinimalityClaim: false;
        allSeedClosureClaim: false;
        recursiveContinuationClosureClaim: false;
        causalRouteDepthClaim: false;
        landfallClaim: false;
    };
    digests: {
        sourceDigest: string;
        predecessorResultDigest: typeof STAGE_B_RESULT_DIGEST;
        reconstructionDigest: string;
        witnessDigest: string;
        carrierDigest: string;
        chartDigest: string;
        parityDigest: string;
    };
    semanticReconstructionReadiness: 'ready_for_committed_review' | 'not_ready';
    hardGatesPass: boolean;
    stopStatement: typeof STAGE_C_RESULT_STOP_STATEMENT;
    resultDigest: string;
}>;

export const STAGE_C_PILOT_ROLES = Object.freeze([
    'crpm_route_tracer',
    'crpm_covariance_auditor',
    'crpm_reentry_reviewer'
] as const);

export const STAGE_C_PILOT_REQUIRED_SOURCE_PATHS = Object.freeze([
    STAGE_C_REGISTRATION_PATH,
    STAGE_C_CONTRACT_PATH,
    STAGE_C_RECONSTRUCTOR_PATH,
    STAGE_C_TEST_PATH,
    STAGE_C_RESULT_PATH,
    STAGE_C_REPORT_PATH,
    STAGE_B_RESULT_PATH,
    D2Q_RETURN_PATH
]);
export const STAGE_C_REQUIRED_NONCLAIMS = Object.freeze([
    'empirical_independence',
    'causation',
    'global_or_unique_minimality',
    'all_seed_or_wider_domain_closure',
    'recursive_continuation_closure',
    'public_or_player_formation',
    'gameplay_authority',
    'ProductAuthority',
    'mathematical_placement',
    'P5',
    'landfall'
]);
const STAGE_C_PILOT_SUPPORT_OVERLAP =
    'same_committed_stage_c_result_report_and_correlated_predecessor_facts' as const;

export type StageCPilotBoundIdentities = Readonly<{
    source: Readonly<{
        commit: string;
        tree: string;
        digest: string;
    }>;
    resultCommit: Readonly<{
        commit: string;
        tree: string;
    }>;
    resultArtifact: SourceIdentityRow & Readonly<{
        semanticDigest: string;
        parityDigest: string;
    }>;
    reportArtifact: SourceIdentityRow & Readonly<{
        resultParityDigest: string;
    }>;
    ranges: Readonly<{
        sourceToResultDigest: string;
        entryToResultDigest: string;
    }>;
    predecessorStageBResult: SourceIdentityRow & Readonly<{
        commit: typeof STAGE_B_RESULT_COMMIT;
        semanticDigest: typeof STAGE_B_RESULT_DIGEST;
    }>;
}>;

export type StageCPostResultPilotSynthesis = Readonly<{
    schemaVersion: 1;
    boundSourceCommit: string;
    boundResultCommit: string;
    evidenceOverlap: 'correlated_reuse';
    decisionMethod: 'governing_synthesis_without_vote';
    roleReturns: ReadonlyArray<Readonly<{
        role: typeof STAGE_C_PILOT_ROLES[number];
        taskId: string;
        boundSourceCommit: string;
        boundResultCommit: string;
        boundIdentities: StageCPilotBoundIdentities;
        claimStatus: 'survived' | 'support_qualified';
        strongestLicensedClaim: 'support_qualified_for_bounded_stage_c_reentry_only';
        evidenceIndependence: 'correlated_reuse';
        sourcePaths: string[];
        supportOverlap: typeof STAGE_C_PILOT_SUPPORT_OVERLAP;
        preserved: string[];
        forgotten: string[];
        newlyVisible: string[];
        residual: string[];
        disagreements: string[];
        falsePromotionFindings: string[];
        reopeningConditions: string[];
        HT10: string;
        HT11: string;
        blockers: string[];
    }>>;
    governingSynthesis: Readonly<{
        currentHeadAndSourceBasis: string;
        pilotActivationDecisionAndReason: string;
        levelCutProtectedFamilyAndFrame: string;
        perAgentFindingsAndEvidenceOverlap: string;
        historicalStatusDrift: string;
        evidenceIndependenceBySupportPath: string;
        committedExactCompositionStatus: string;
        preservedForgottenNewlyVisibleResidual: string;
        disagreementsAndFalsePromotionFindings: string;
        HT10HT11TransferBackStatus: string;
        stopReopenDecisions: string;
        strongestLicensedClaim: string;
        explicitNonClaims: string[];
        disagreementDisposition:
            | 'no_substantive_disagreement'
            | 'substantive_disagreement_blocks_admission';
        licenseFacts: {
            sourceCommit: string;
            resultCommit: string;
            predecessorResultCommit: typeof STAGE_B_RESULT_COMMIT;
            predecessorResultDigest: typeof STAGE_B_RESULT_DIGEST;
            pilotActivation: 'required';
            level: 'L4+';
            cut: 'thin_visible_duel_v0@2';
            protectedTarget: 'K_WPV4_ONE_COMMAND_COMPLETE_V1';
            historicalStopsPreserved: true;
            committedExactComposition: 'recoverable';
            evidenceCovariance: 'correlated_reuse';
            strongestClaim: 'bounded_stage_c_reentry_only';
            stopMap: {
                projectedThinOnly: 'stopped';
                p3: 'closed';
                ht8: 'closed_except_recoverable_provenance';
                learnedSupportFormation: 'closed';
                successorWorldExecution: 'closed';
            };
            governance: {
                productAuthority: 'none';
                mathematicalPlacementImplication: 'none';
                playerObservationTiming: 'closed';
                gameplayChange: false;
                p5: 'closed';
                successorWorldExecution: 'closed';
            };
        };
        majorityVoteUsed: false;
        blockers: string[];
    }>;
}>;

export type StageCReviewReturn = Readonly<{
    schemaVersion: 1;
    returnId: 'wp-015d2r-stage-c-review-return-v1';
    packageId: 'WP-015D2R';
    supportWorkPackageId: 'WP-015D2U';
    stage: 'stage_c_review_return';
    sourceCommit: string;
    resultCommit: string;
    result: SourceIdentityRow & { semanticDigest: string };
    report: SourceIdentityRow & { parityDigest: string };
    resultRanges: {
        sourceToResult: StageCRangeAudit;
        entryToResult: StageCRangeAudit;
    };
    pilotReview: {
        activation: 'required';
        roles: ReadonlyArray<typeof STAGE_C_PILOT_ROLES[number]>;
        evidenceOverlap: 'correlated_reuse';
        synthesis: StageCPostResultPilotSynthesis;
        synthesisDigest: string;
        status: 'reviewed_bounded' | 'blocked';
    };
    semanticReadiness: 'confirmed';
    witnessReturn: StageCResult['witnessReturn'];
    tauReturn: StageCResult['tauReturn'];
    chartRevision: StageCResult['chartRevision'];
    governance: StageCResult['governance'];
    parityDigest: string;
    hardGatesPass: boolean;
    stopStatement: typeof STAGE_C_STOP_STATEMENT;
    returnDigest: string;
}>;

type StageBResultInput = {
    resultId: string;
    resultDigest: string;
    source: { commit: string };
    domain: Record<string, JsonValue>;
    primaryOutcomeCounts: Record<string, number>;
    targetRelevantPairCount: number;
    descriptiveCrossTab: {
        authority: string;
        interpretationGuard: string;
        rows: StageCCrossTabRow[];
    };
    records: {
        eligibleEndpoints: StageCEndpoint[];
        aliasPairs: StageCReconstructedPair[];
        frameSupportFailures: JsonValue[];
    };
    [key: string]: unknown;
};

function gitBytes(args: readonly string[], repositoryRoot = STAGE_C_ROOT): Buffer {
    return execFileSync('git', [...args], {
        cwd: repositoryRoot,
        encoding: 'buffer',
        maxBuffer: 48 * 1024 * 1024,
        windowsHide: true
    });
}

function gitText(args: readonly string[], repositoryRoot = STAGE_C_ROOT): string {
    return gitBytes(args, repositoryRoot).toString('utf8').trim();
}

function gitObjectExists(object: string, repositoryRoot = STAGE_C_ROOT): void {
    execFileSync('git', ['cat-file', '-e', `${object}^{commit}`], {
        cwd: repositoryRoot,
        stdio: 'pipe',
        windowsHide: true
    });
}

function exact(left: unknown, right: unknown): boolean {
    return canonicalJson(left) === canonicalJson(right);
}

function assertHex(value: unknown, length: number, label: string): asserts value is string {
    assert.equal(typeof value, 'string', `${label} must be a string.`);
    assert(new RegExp(`^[0-9a-f]{${length}}$`).test(value as string),
        `${label} must be lowercase hexadecimal.`);
}

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
    assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object.`);
}

function assertExactKeys(value: unknown, keys: readonly string[], label: string): void {
    assertObject(value, label);
    assert.deepEqual(
        Object.keys(value).sort(compareCanonicalText),
        [...keys].sort(compareCanonicalText),
        `${label} keys drifted.`
    );
}

function assertUnique(values: readonly string[], label: string): void {
    assert.equal(new Set(values).size, values.length, label);
}

/** JSON.parse accepts duplicate object members; Stage C does not. */
export function parseStageCStrictJson(text: string): unknown {
    assert(text.length <= 32 * 1024 * 1024, 'JSON input exceeds the Stage C reader bound.');
    let offset = 0;
    const whitespace = () => {
        while (offset < text.length && /\s/.test(text[offset] ?? '')) offset += 1;
    };
    const parseString = (): string => {
        assert.equal(text[offset], '"', 'Expected a JSON string.');
        const start = offset;
        offset += 1;
        while (offset < text.length) {
            const character = text[offset];
            offset += 1;
            if (character === '\\') {
                assert(offset < text.length, 'Truncated JSON string escape.');
                offset += 1;
            } else if (character === '"') {
                return JSON.parse(text.slice(start, offset)) as string;
            }
        }
        throw new TypeError('Unterminated JSON string.');
    };
    const parseValue = (depth: number): void => {
        assert(depth <= 128, 'JSON nesting exceeds the Stage C reader bound.');
        whitespace();
        const character = text[offset];
        if (character === '{') {
            offset += 1;
            whitespace();
            const keys = new Set<string>();
            if (text[offset] !== '}') {
                while (true) {
                    whitespace();
                    const key = parseString();
                    assert(!keys.has(key), `Duplicate JSON object member: ${key}`);
                    keys.add(key);
                    whitespace();
                    assert.equal(text[offset], ':', 'Expected a JSON object colon.');
                    offset += 1;
                    parseValue(depth + 1);
                    whitespace();
                    if (text[offset] === '}') break;
                    assert.equal(text[offset], ',', 'Expected a JSON object comma.');
                    offset += 1;
                }
            }
            offset += 1;
            return;
        }
        if (character === '[') {
            offset += 1;
            whitespace();
            if (text[offset] !== ']') {
                while (true) {
                    parseValue(depth + 1);
                    whitespace();
                    if (text[offset] === ']') break;
                    assert.equal(text[offset], ',', 'Expected a JSON array comma.');
                    offset += 1;
                }
            }
            offset += 1;
            return;
        }
        if (character === '"') {
            parseString();
            return;
        }
        const remainder = text.slice(offset);
        const scalar = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(remainder);
        assert(scalar, `Invalid JSON value at byte ${offset}.`);
        offset += scalar[0].length;
    };
    whitespace();
    parseValue(0);
    whitespace();
    assert.equal(offset, text.length, 'Trailing content after JSON value.');
    return JSON.parse(text) as unknown;
}

function gitPathIdentity(commit: string, path: string, repositoryRoot = STAGE_C_ROOT): SourceIdentityRow {
    const line = gitText(['ls-tree', commit, '--', path], repositoryRoot);
    const match = /^(\d{6}) blob ([0-9a-f]{40})\t(.+)$/.exec(line);
    assert(match, `Missing or non-blob Git source: ${commit}:${path}`);
    assert.equal(match[1], '100644', `Unexpected mode for ${path}.`);
    assert.equal(match[3], path, `Git source path mismatch for ${path}.`);
    const bytes = gitBytes(['show', `${commit}:${path}`], repositoryRoot);
    return {
        path,
        mode: '100644',
        blob: match[2],
        sha256: createHash('sha256').update(bytes).digest('hex')
    };
}

function commitParents(commit: string, repositoryRoot = STAGE_C_ROOT): string[] {
    const line = gitText(['show', '-s', '--format=%P', commit], repositoryRoot);
    return line === '' ? [] : line.split(' ');
}

export function parseStageCRawDiff(raw: Buffer | string): GitChangeRow[] {
    const fields = (typeof raw === 'string' ? raw : raw.toString('utf8')).split('\0');
    if (fields.at(-1) === '') fields.pop();
    const rows: GitChangeRow[] = [];
    for (let index = 0; index < fields.length;) {
        const header = fields[index] ?? '';
        index += 1;
        const match = /^:(\d{6}) (\d{6}) ([0-9a-f]{40}) ([0-9a-f]{40}) ([A-Z][0-9]*)$/.exec(header);
        assert(match, `Unparseable Git raw-diff header: ${header}`);
        const path = fields[index];
        index += 1;
        assert(path, 'Git raw-diff path is absent.');
        assert(!match[5].startsWith('R') && !match[5].startsWith('C'),
            'Renames and copies are outside the Stage C output contract.');
        rows.push({
            path: path.replaceAll('\\', '/'),
            status: match[5],
            oldMode: match[1],
            newMode: match[2],
            oldBlob: match[3],
            newBlob: match[4]
        });
    }
    return rows.sort((left, right) => compareCanonicalText(left.path, right.path));
}

function rawDiff(base: string, result: string, repositoryRoot = STAGE_C_ROOT): GitChangeRow[] {
    return parseStageCRawDiff(
        gitBytes([
            'diff', '--raw', '--no-abbrev', '-z', '-M', '-C', '--find-copies-harder', base, result
        ], repositoryRoot)
    );
}

export function validateStageCChangeRows(
    rows: readonly GitChangeRow[],
    allowedPaths: readonly string[],
    phase: 'endpoint' | 'intermediate' = 'endpoint'
): void {
    const allowed = new Set(allowedPaths);
    assert.equal(allowed.size, allowedPaths.length, 'Duplicate allowed Stage C output path.');
    assertUnique(rows.map((row) => row.path), 'Duplicate Stage C changed path.');
    for (const row of rows) {
        assert(allowed.has(row.path), `Undeclared Stage C changed path: ${row.path}`);
        assert(phase === 'intermediate' ? ['A', 'M'].includes(row.status) : row.status === 'A',
            `Prohibited Stage C ${phase} path status ${row.status}: ${row.path}`);
        assert.equal(row.newMode, '100644', `Prohibited Stage C mode: ${row.path}`);
        assert.notEqual(row.newBlob, '0000000000000000000000000000000000000000',
            `Stage C ${phase} output has a zero new blob: ${row.path}`);
        if (row.status === 'A') {
            assert.equal(row.oldMode, '000000',
                `Stage C added output unexpectedly has an old mode: ${row.path}`);
            assert.equal(row.oldBlob, '0000000000000000000000000000000000000000');
        } else {
            assert.equal(row.status, 'M');
            assert.equal(row.oldMode, '100644',
                `Stage C modified output has a prohibited old mode: ${row.path}`);
            assert.notEqual(row.oldBlob, '0000000000000000000000000000000000000000',
                `Stage C modified output has a zero old blob: ${row.path}`);
        }
    }
}

/** Audits every commit as well as the endpoint diff so transient paths cannot disappear. */
export function auditStageCRange(
    baseCommit: string,
    resultCommit: string,
    allowedPaths: readonly string[],
    repositoryRoot = STAGE_C_ROOT
): StageCRangeAudit {
    assertHex(baseCommit, 40, 'Stage C range base');
    assertHex(resultCommit, 40, 'Stage C range result');
    gitObjectExists(baseCommit, repositoryRoot);
    gitObjectExists(resultCommit, repositoryRoot);
    execFileSync('git', ['merge-base', '--is-ancestor', baseCommit, resultCommit], {
        cwd: repositoryRoot,
        stdio: 'pipe',
        windowsHide: true
    });
    const allowed = new Set(allowedPaths);
    assert.equal(allowed.size, allowedPaths.length, 'Duplicate allowed Stage C output path.');
    const commitList = gitText(
        ['rev-list', '--reverse', '--ancestry-path', `${baseCommit}..${resultCommit}`],
        repositoryRoot
    );
    const commits = commitList === '' ? [] : commitList.split(/\r?\n/);
    let prior = baseCommit;
    const commitRows = commits.map((commit) => {
        const parents = commitParents(commit, repositoryRoot);
        assert.equal(parents.length, 1, `Stage C range contains a merge commit: ${commit}`);
        assert.equal(parents[0], prior,
            `Stage C ancestry path is not one exact first-parent chain at ${commit}.`);
        const rows = rawDiff(parents[0], commit, repositoryRoot);
        validateStageCChangeRows(rows, allowedPaths, 'intermediate');
        const row = { commit, parent: parents[0], rows };
        prior = commit;
        return row;
    });
    assert.equal(prior, resultCommit,
        'Stage C ancestry path does not terminate at the declared result commit.');
    const endpointRows = rawDiff(baseCommit, resultCommit, repositoryRoot);
    validateStageCChangeRows(endpointRows, allowedPaths, 'endpoint');
    const unsigned = {
        baseCommit,
        resultCommit,
        allowedPaths: [...allowedPaths],
        commits: commitRows,
        endpointRows
    };
    return { ...unsigned, rangeDigest: sha256Digest(unsigned) };
}

export type StageCLifecyclePhase = 'source' | 'result' | 'review' | 'terminal' | 'complete';

/** Applies the exact per-transition path/status contract, not just an allow-list. */
export function auditStageCLifecycleRange(
    phase: StageCLifecyclePhase,
    baseCommit: string,
    resultCommit: string,
    repositoryRoot = STAGE_C_ROOT
): StageCRangeAudit {
    const expected = phase === 'source'
        ? STAGE_C_SOURCE_OUTPUTS
        : phase === 'result'
            ? STAGE_C_RESULT_OUTPUTS
            : phase === 'review'
                ? STAGE_C_REVIEW_OUTPUTS
                : phase === 'terminal'
                    ? [STAGE_C_EVIDENCE_PATH]
                    : STAGE_C_ALL_OUTPUTS;
    if (phase !== 'terminal') {
        const audit = auditStageCRange(baseCommit, resultCommit, expected, repositoryRoot);
        assert.deepEqual(
            audit.endpointRows.map((row) => row.path),
            [...expected].sort(compareCanonicalText),
            `Stage C ${phase} endpoint does not match its exact declared path set.`
        );
        return audit;
    }

    gitObjectExists(baseCommit, repositoryRoot);
    gitObjectExists(resultCommit, repositoryRoot);
    execFileSync('git', ['merge-base', '--is-ancestor', baseCommit, resultCommit], {
        cwd: repositoryRoot, stdio: 'pipe', windowsHide: true
    });
    const commitList = gitText(
        ['rev-list', '--reverse', '--ancestry-path', `${baseCommit}..${resultCommit}`],
        repositoryRoot
    );
    const commits = commitList === '' ? [] : commitList.split(/\r?\n/);
    let prior = baseCommit;
    const commitRows = commits.map((commit) => {
        const parents = commitParents(commit, repositoryRoot);
        assert.equal(parents.length, 1, `Stage C terminal range contains a merge: ${commit}`);
        assert.equal(parents[0], prior,
            `Stage C terminal ancestry is not one exact first-parent chain at ${commit}.`);
        const rows = rawDiff(parents[0], commit, repositoryRoot);
        assert.deepEqual(rows.map((row) => row.path), [STAGE_C_EVIDENCE_PATH]);
        for (const row of rows) {
            assert.equal(row.status, 'M');
            assert.equal(row.oldMode, '100644');
            assert.equal(row.newMode, '100644');
            assert.notEqual(row.oldBlob, '0000000000000000000000000000000000000000');
            assert.notEqual(row.newBlob, '0000000000000000000000000000000000000000');
        }
        const row = { commit, parent: parents[0], rows };
        prior = commit;
        return row;
    });
    assert.equal(prior, resultCommit,
        'Stage C terminal ancestry does not terminate at the declared result commit.');
    const endpointRows = rawDiff(baseCommit, resultCommit, repositoryRoot);
    assert.deepEqual(endpointRows.map((row) => row.path), [STAGE_C_EVIDENCE_PATH]);
    assert.equal(endpointRows[0]?.status, 'M');
    assert.equal(endpointRows[0]?.oldMode, '100644');
    assert.equal(endpointRows[0]?.newMode, '100644');
    assert.notEqual(endpointRows[0]?.oldBlob, '0000000000000000000000000000000000000000');
    assert.notEqual(endpointRows[0]?.newBlob, '0000000000000000000000000000000000000000');
    const unsigned = {
        baseCommit,
        resultCommit,
        allowedPaths: [STAGE_C_EVIDENCE_PATH],
        commits: commitRows,
        endpointRows
    };
    return { ...unsigned, rangeDigest: sha256Digest(unsigned) };
}

function verifyPredecessorCommitChain(repositoryRoot: string): void {
    const chain = [
        STAGE_B_PREREGISTRATION_SOURCE_COMMIT,
        STAGE_B_PREREGISTRATION_TERMINAL_COMMIT,
        STAGE_B_EXECUTION_SOURCE_COMMIT,
        STAGE_B_RESULT_COMMIT,
        STAGE_B_TERMINAL_EVIDENCE_COMMIT
    ];
    chain.forEach((commit) => gitObjectExists(commit, repositoryRoot));
    for (let index = 1; index < chain.length; index += 1) {
        assert(commitParents(chain[index], repositoryRoot).includes(chain[index - 1]),
            `Stage B predecessor chain drifted at ${chain[index]}.`);
    }
}

const ENDPOINT_KEYS = Object.freeze([
    'actor', 'calling', 'command', 'directions', 'endpointDepth', 'endpointId',
    'endpointInputUnchanged', 'expectedTurn', 'frameOk', 'postCommandMovementRemaining',
    'postCommandProjection', 'postCommandRevision', 'postCommandStateDigest',
    'preCommandMovementRemaining', 'preCommandRevision', 'preCommandStateDigest', 'readout',
    'routeId', 'rowType', 'rulesetId', 'seed', 'sourceProjection', 'wordIndex'
]);

const PAIR_KEYS = Object.freeze([
    'classKey', 'equality', 'leftDirections', 'leftEndpointDepth', 'leftEndpointId',
    'leftRouteId', 'pairId', 'postCommandMovementRemainingPair',
    'preCommandMovementRemainingPair', 'primaryOutcome', 'projectedValue', 'rightDirections',
    'rightEndpointDepth', 'rightEndpointId', 'rightRouteId', 'rowType', 'targetRelevant'
]);

function derivedSourceClassKey(endpoint: StageCEndpoint): string {
    return `cut-${sha256Digest({
        cutId: endpoint.sourceProjection.cutId,
        cutVersion: endpoint.sourceProjection.cutVersion,
        projectedValue: endpoint.sourceProjection.projectedValue
    })}`;
}

function validateEndpointIdentities(endpoint: StageCEndpoint, label: string): void {
    const expectedClassKey = derivedSourceClassKey(endpoint);
    assert.equal(endpoint.sourceProjection.classKey, expectedClassKey,
        `${label} source class identity does not match its exact projected value.`);
    const expectedRouteId = `route-${sha256Digest({
        seed: endpoint.seed,
        calling: endpoint.calling,
        rulesetId: endpoint.rulesetId,
        directions: endpoint.directions
    })}`;
    assert.equal(endpoint.routeId, expectedRouteId,
        `${label} route identity does not match its retained route coordinates.`);
    const expectedEndpointId = `endpoint-${sha256Digest({
        routeId: endpoint.routeId,
        sourceProjection: endpoint.sourceProjection,
        preCommandStateDigest: endpoint.preCommandStateDigest
    })}`;
    assert.equal(endpoint.endpointId, expectedEndpointId,
        `${label} endpoint identity does not match its retained endpoint coordinates.`);
}

function validateEndpoint(endpoint: StageCEndpoint, index: number): void {
    assertExactKeys(endpoint, ENDPOINT_KEYS, `Stage B endpoint ${index}`);
    assert.equal(endpoint.rowType, 'eligible_endpoint');
    assertHex(endpoint.endpointId.replace(/^endpoint-/, ''), 64, `endpoint ${index} ID`);
    assertHex(endpoint.routeId.replace(/^route-/, ''), 64, `endpoint ${index} route ID`);
    assert([2, 4, 8].includes(endpoint.endpointDepth), `Endpoint ${index} depth is outside the registered domain.`);
    assert.equal(endpoint.directions.length, endpoint.endpointDepth);
    assert(endpoint.directions.every((direction) => direction === -1 || direction === 1));
    assert.equal(endpoint.sourceProjection.cutId, 'thin_visible_duel_v0');
    assert.equal(endpoint.sourceProjection.cutVersion, 2);
    assert.equal(endpoint.frameOk, true);
    assert.equal(endpoint.endpointInputUnchanged, true);
    assert.equal(endpoint.command.type, 'move');
    assert.equal(endpoint.command.direction, 1);
    assert.equal(typeof endpoint.readout.accepted, 'boolean');
    assert.equal(typeof endpoint.readout.mutated, 'boolean');
    assert(Array.isArray(endpoint.readout.authoritativeEvents));
    assertHex(endpoint.preCommandStateDigest, 64, `endpoint ${index} pre-state digest`);
    assertHex(endpoint.postCommandStateDigest, 64, `endpoint ${index} post-state digest`);
    validateEndpointIdentities(endpoint, `Endpoint ${index}`);
}

function validatePredecessorResult(value: unknown): StageBResultInput {
    assertObject(value, 'Stage B result');
    assert.equal(value.resultId, 'wp-015d2r-stage-b-one-next-command-search-v1');
    assert.equal(value.resultDigest, STAGE_B_RESULT_DIGEST);
    const unsigned = { ...value };
    delete unsigned.resultDigest;
    assert.equal(sha256Digest(unsigned), STAGE_B_RESULT_DIGEST,
        'Stage B canonical result digest does not match the bound digest.');
    const result = value as StageBResultInput;
    assert.equal(result.source.commit, STAGE_B_EXECUTION_SOURCE_COMMIT);
    assert.equal(result.domain.complete, true);
    assert.equal(result.domain.naturallyReachableEndpointCount, STAGE_C_EXPECTED.endpointCount);
    assert.equal(result.domain.sourceClassCount, STAGE_C_EXPECTED.sourceClassCount);
    assert.equal(result.domain.eligibleAliasClassCount, STAGE_C_EXPECTED.aliasedClassCount);
    assert.equal(result.domain.eligiblePairCount, STAGE_C_EXPECTED.pairCount);
    assert(Array.isArray(result.records.eligibleEndpoints));
    assert(Array.isArray(result.records.aliasPairs));
    assert(Array.isArray(result.records.frameSupportFailures));
    assert.equal(result.records.frameSupportFailures.length, 0);
    assert.equal(result.records.eligibleEndpoints.length, STAGE_C_EXPECTED.endpointCount);
    assert.equal(result.records.aliasPairs.length, STAGE_C_EXPECTED.pairCount);
    result.records.eligibleEndpoints.forEach(validateEndpoint);
    result.records.aliasPairs.forEach((pair, index) => {
        assertExactKeys(pair, PAIR_KEYS, `Stage B alias pair ${index}`);
        assert.equal(pair.rowType, 'alias_pair');
        assertHex(pair.pairId.replace(/^pair-/, ''), 64, `pair ${index} ID`);
        assert(STAGE_C_PRIMARY_OUTCOMES.includes(pair.primaryOutcome));
    });
    assertUnique(result.records.eligibleEndpoints.map((row) => row.endpointId), 'Duplicate Stage B endpoint ID.');
    assertUnique(result.records.eligibleEndpoints.map((row) => row.routeId), 'Duplicate Stage B route ID.');
    assertUnique(result.records.aliasPairs.map((row) => row.pairId), 'Duplicate Stage B pair ID.');
    return result;
}

export type LoadedStageBResult = Readonly<{
    result: StageBResultInput;
    bytes: Buffer;
    blob: typeof STAGE_B_RESULT_BLOB;
    gitByteSha256: string;
}>;

/** Loads only the immutable Git blob. The worktree and ignored raw output are not consulted. */
export function loadBoundStageBResult(repositoryRoot = STAGE_C_ROOT): LoadedStageBResult {
    verifyPredecessorCommitChain(repositoryRoot);
    const identity = gitPathIdentity(STAGE_B_RESULT_COMMIT, STAGE_B_RESULT_PATH, repositoryRoot);
    assert.equal(identity.blob, STAGE_B_RESULT_BLOB, 'Stage B result blob identity drifted.');
    const terminalIdentity = gitPathIdentity(
        STAGE_B_TERMINAL_EVIDENCE_COMMIT,
        STAGE_B_RESULT_PATH,
        repositoryRoot
    );
    assert.deepEqual(terminalIdentity, identity, 'Stage B result changed before terminal evidence.');
    const bytes = gitBytes(['show', `${STAGE_B_RESULT_COMMIT}:${STAGE_B_RESULT_PATH}`], repositoryRoot);
    const text = bytes.toString('utf8');
    const result = validatePredecessorResult(parseStageCStrictJson(text));
    assert.equal(text, `${canonicalJson(result)}\n`, 'Stage B committed result bytes are not canonical JSON.');
    return {
        result,
        bytes,
        blob: STAGE_B_RESULT_BLOB,
        gitByteSha256: createHash('sha256').update(bytes).digest('hex')
    };
}

function sourceProjectionKey(endpoint: StageCEndpoint): string {
    return canonicalJson({
        cutId: endpoint.sourceProjection.cutId,
        cutVersion: endpoint.sourceProjection.cutVersion,
        projectedValue: endpoint.sourceProjection.projectedValue
    });
}

function commandSemanticTarget(endpoint: StageCEndpoint): JsonValue {
    return deepSortJson({
        accepted: endpoint.readout.accepted,
        mutated: endpoint.readout.mutated,
        error: endpoint.readout.error,
        authoritativeEvents: endpoint.readout.authoritativeEvents
    });
}

function completeRegisteredTarget(endpoint: StageCEndpoint): JsonValue {
    return deepSortJson({
        commandSemanticReadout: commandSemanticTarget(endpoint),
        postCommandMovementRemaining: endpoint.postCommandMovementRemaining
    });
}

function nextMoveAdmissibility(endpoint: StageCEndpoint): boolean {
    return endpoint.readout.accepted;
}

export function reconstructPair(left: StageCEndpoint, right: StageCEndpoint): StageCReconstructedPair {
    validateEndpointIdentities(left, 'Left endpoint');
    validateEndpointIdentities(right, 'Right endpoint');
    assert.equal(sourceProjectionKey(left), sourceProjectionKey(right),
        'Cannot reconstruct an alias pair across source classes.');
    const classKey = derivedSourceClassKey(left);
    assert.equal(classKey, derivedSourceClassKey(right),
        'Cannot reconstruct an alias pair across derived source-class identities.');
    const equality = {
        commandSemanticEqual: exact(commandSemanticTarget(left), commandSemanticTarget(right)),
        postMovementRemainingEqual:
            left.postCommandMovementRemaining === right.postCommandMovementRemaining,
        preRevisionEqual: left.preCommandRevision === right.preCommandRevision,
        postRevisionEqual: left.postCommandRevision === right.postCommandRevision,
        preStateDigestEqual: left.preCommandStateDigest === right.preCommandStateDigest,
        postStateDigestEqual: left.postCommandStateDigest === right.postCommandStateDigest,
        routeHistoryEqual: exact(left.directions, right.directions)
    };
    const primaryOutcome: StageCPrimaryOutcome = !left.frameOk || !right.frameOk
        ? 'frame_support_failure'
        : !equality.commandSemanticEqual
            ? 'command_semantic_split'
            : !equality.postMovementRemainingEqual
                ? 'continuation_support_split'
                : !equality.preRevisionEqual || !equality.postRevisionEqual ||
                    !equality.preStateDigestEqual || !equality.postStateDigestEqual
                    ? 'provenance_exact_state_only_split'
                    : 'no_target_relevant_split';
    const pairId = `pair-${sha256Digest({
        classKey,
        leftEndpointId: left.endpointId,
        rightEndpointId: right.endpointId
    })}`;
    return {
        rowType: 'alias_pair',
        pairId,
        classKey,
        projectedValue: left.sourceProjection.projectedValue,
        leftEndpointId: left.endpointId,
        rightEndpointId: right.endpointId,
        leftRouteId: left.routeId,
        rightRouteId: right.routeId,
        leftEndpointDepth: left.endpointDepth,
        rightEndpointDepth: right.endpointDepth,
        leftDirections: [...left.directions],
        rightDirections: [...right.directions],
        preCommandMovementRemainingPair: [
            left.preCommandMovementRemaining,
            right.preCommandMovementRemaining
        ],
        postCommandMovementRemainingPair: [
            left.postCommandMovementRemaining,
            right.postCommandMovementRemaining
        ],
        equality,
        primaryOutcome,
        targetRelevant:
            primaryOutcome === 'command_semantic_split' ||
            primaryOutcome === 'continuation_support_split'
    };
}

export function reconstructAliasPairs(endpoints: readonly StageCEndpoint[]): {
    pairs: StageCReconstructedPair[];
    classSummaries: StageCResult['reconstruction']['classSummaries'];
    sourceClassCount: number;
    aliasedClassCount: number;
} {
    const classes = new Map<string, StageCEndpoint[]>();
    for (const [index, endpoint] of endpoints.entries()) {
        validateEndpoint(endpoint, index);
        const key = derivedSourceClassKey(endpoint);
        const members = classes.get(key) ?? [];
        members.push(endpoint);
        classes.set(key, members);
    }
    const pairs: StageCReconstructedPair[] = [];
    const classSummaries: StageCResult['reconstruction']['classSummaries'] = [];
    let aliasedClassCount = 0;
    for (const [key, unsortedMembers] of [...classes.entries()].sort(([left], [right]) =>
        compareCanonicalText(left, right))) {
        const members = [...unsortedMembers].sort((left, right) =>
            compareCanonicalText(left.routeId, right.routeId));
        assertUnique(members.map((member) => member.endpointId), `Duplicate endpoint in class ${key}.`);
        if (members.length > 1) aliasedClassCount += 1;
        let pairCount = 0;
        for (let leftIndex = 0; leftIndex < members.length - 1; leftIndex += 1) {
            for (let rightIndex = leftIndex + 1; rightIndex < members.length; rightIndex += 1) {
                pairs.push(reconstructPair(members[leftIndex], members[rightIndex]));
                pairCount += 1;
            }
        }
        classSummaries.push({
            classKey: key,
            memberCount: members.length,
            pairCount,
            endpointIdentityDigest: sha256Digest(
                members.map((member) => member.endpointId).sort(compareCanonicalText)
            )
        });
    }
    pairs.sort((left, right) => compareCanonicalText(left.pairId, right.pairId));
    assertUnique(pairs.map((pair) => pair.pairId), 'Duplicate independently reconstructed pair ID.');
    classSummaries.sort((left, right) => compareCanonicalText(left.classKey, right.classKey));
    return { pairs, classSummaries, sourceClassCount: classes.size, aliasedClassCount };
}

export function buildStageCCrossTab(pairs: readonly StageCReconstructedPair[]): StageCCrossTabRow[] {
    const cells = new Map<string, StageCCrossTabRow>();
    for (const pair of pairs) {
        const endpointDepthPair: [number, number] = [
            pair.leftEndpointDepth,
            pair.rightEndpointDepth
        ];
        const preCommandMovementRemainingPair: [number, number] = [
            pair.preCommandMovementRemainingPair[0],
            pair.preCommandMovementRemainingPair[1]
        ];
        const postCommandMovementRemainingPair: [number, number] = [
            pair.postCommandMovementRemainingPair[0],
            pair.postCommandMovementRemainingPair[1]
        ];
        const depthDelta = endpointDepthPair[1] - endpointDepthPair[0];
        const preBudgetDelta = preCommandMovementRemainingPair[1] -
            preCommandMovementRemainingPair[0];
        const row: StageCCrossTabRow = {
            endpointOrder: 'canonical_route_id_left_right',
            endpointDepthPair,
            depthRelation: endpointDepthPair[0] === endpointDepthPair[1]
                ? 'same_depth'
                : 'cross_depth',
            preCommandMovementRemainingPair,
            postCommandMovementRemainingPair,
            knownRouteLengthMovementBudgetPattern:
                depthDelta !== 0 && preBudgetDelta !== 0 && depthDelta * preBudgetDelta < 0,
            primaryOutcome: pair.primaryOutcome,
            pairCount: 1
        };
        const stableKey = canonicalJson({
            endpointOrder: row.endpointOrder,
            endpointDepthPair: row.endpointDepthPair,
            depthRelation: row.depthRelation,
            preCommandMovementRemainingPair: row.preCommandMovementRemainingPair,
            postCommandMovementRemainingPair: row.postCommandMovementRemainingPair,
            knownRouteLengthMovementBudgetPattern: row.knownRouteLengthMovementBudgetPattern,
            primaryOutcome: row.primaryOutcome
        });
        const current = cells.get(stableKey);
        cells.set(stableKey, current ? { ...current, pairCount: current.pairCount + 1 } : row);
    }
    return [...cells.entries()]
        .sort(([left], [right]) => compareCanonicalText(left, right))
        .map(([, row]) => row);
}

function outcomeCounts(pairs: readonly StageCReconstructedPair[]): Record<StageCPrimaryOutcome, number> {
    const counts = Object.fromEntries(STAGE_C_PRIMARY_OUTCOMES.map((outcome) => [outcome, 0])) as
        Record<StageCPrimaryOutcome, number>;
    for (const pair of pairs) counts[pair.primaryOutcome] += 1;
    return counts;
}

function enumerateEqualityPairs(
    endpoints: readonly StageCEndpoint[],
    keyOf: (endpoint: StageCEndpoint) => JsonValue,
    targetOf: (endpoint: StageCEndpoint) => JsonValue
): {
    groupCount: number;
    equalityPairCount: number;
    partitionIdentityDigest: string;
    counterexamplePairIds: string[];
} {
    const groups = new Map<string, StageCEndpoint[]>();
    for (const endpoint of endpoints) {
        const key = canonicalJson(keyOf(endpoint));
        const members = groups.get(key) ?? [];
        members.push(endpoint);
        groups.set(key, members);
    }
    let equalityPairCount = 0;
    const counterexamplePairIds: string[] = [];
    const partitionRows = [...groups.values()].map((members) =>
        members.map((member) => member.endpointId).sort(compareCanonicalText)
    ).sort((left, right) => compareCanonicalText(canonicalJson(left), canonicalJson(right)));
    for (const members of groups.values()) {
        const ordered = [...members].sort((left, right) => compareCanonicalText(left.routeId, right.routeId));
        for (let leftIndex = 0; leftIndex < ordered.length - 1; leftIndex += 1) {
            for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
                const left = ordered[leftIndex];
                const right = ordered[rightIndex];
                equalityPairCount += 1;
                if (!exact(targetOf(left), targetOf(right))) {
                    counterexamplePairIds.push(`candidate-pair-${sha256Digest({
                        leftEndpointId: left.endpointId,
                        rightEndpointId: right.endpointId
                    })}`);
                }
            }
        }
    }
    counterexamplePairIds.sort(compareCanonicalText);
    return {
        groupCount: groups.size,
        equalityPairCount,
        partitionIdentityDigest: sha256Digest(partitionRows),
        counterexamplePairIds
    };
}

function assessCandidate(
    candidateId: string,
    coordinates: string[],
    protectedTarget: string,
    endpoints: readonly StageCEndpoint[],
    keyOf: (endpoint: StageCEndpoint) => JsonValue,
    targetOf: (endpoint: StageCEndpoint) => JsonValue,
    passingVerdict: string,
    failingVerdict: string
): StageCCandidateAssessment {
    const assessment = enumerateEqualityPairs(endpoints, keyOf, targetOf);
    const nonVacuous = assessment.equalityPairCount > 0;
    const counterexampleCount = assessment.counterexamplePairIds.length;
    return {
        candidateId,
        coordinates,
        protectedTarget,
        groupCount: assessment.groupCount,
        equalityPairCount: assessment.equalityPairCount,
        partitionIdentityDigest: assessment.partitionIdentityDigest,
        counterexampleCount,
        counterexamplePairIdsDigest: sha256Digest(assessment.counterexamplePairIds),
        verdict: nonVacuous && counterexampleCount === 0 ? passingVerdict : failingVerdict,
        nonVacuous,
        scopeGuard:
            'Finite registered Stage B endpoint domain only; no global minimality, all-seed, public-formation, or recursive-closure inference.'
    };
}

export function expectedStageCD2QCaseReadouts():
StageCResult['protectedCoreRecovery']['caseReadouts'] {
    const unchanged = {
        evidenceClass: 'correlated_reuse' as const,
        inputUnchanged: true as const,
        mathematicalPlacementImplication: 'none' as const,
        authoritativeEvents: [] as JsonValue[],
        eventsDigest: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
        movementRemaining: 64,
        playerX: 512,
        revision: 0,
        preStateDigest: 'f319a603ccc9f1cce95a4affb0ab54219bf8963c620e88fc3a07de52cf496f4d',
        postStateDigest: 'f319a603ccc9f1cce95a4affb0ab54219bf8963c620e88fc3a07de52cf496f4d',
        reopeningCondition: D2Q_REOPENING_CONDITION,
        unchangedRejection: true,
        verdict: 'matched_source_prediction' as const,
        sourceReadoutMatches: true as const
    };
    return [
        {
            caseId: 'CMD-ACTOR-01',
            edgeDigest: 'd7eb8825279b42ad2921fb62b8344d63f88266f9246a188a8d71a04c2bbe0e4d',
            observedClass: 'NOT_YOUR_TURN',
            accepted: false,
            mutated: false,
            error: { code: 'NOT_YOUR_TURN', message: 'The actor does not own the active turn.' },
            requestDigest: '1a61bd958905f4c08dee31b63452c0ec0722639a4fde14bbbb981aa83dee008e',
            targetDigest: '42f3119c064167c6cc59e17cf9c19b4f8d82a2adaebbf5878529b1974b370e50',
            witnessDigest: '17762c5acf311193e550215289b50f07c9f543f93d737dba82397bbb520bc529',
            ...unchanged
        },
        {
            caseId: 'CMD-PRECEDENCE-01',
            edgeDigest: 'c0c254cd7957a048bfcb7bc8d1057c6884733639ac8bc59cc1325d75dbc3d0b8',
            observedClass: 'LATE_TURN',
            accepted: false,
            mutated: false,
            error: { code: 'LATE_TURN', message: 'The command targets a different turn.' },
            requestDigest: 'c2c0e7f7aea2a05eec927d9b041077d8baf1d12b8be6c8b1ad8ba84fb7d420ef',
            targetDigest: '4e460b7362b961ac62fff60143de79d995afac99fea1d5ba1ad97c9b4d4e12ce',
            witnessDigest: '524b5c8248934d0ad91e6f9e78b143929d3789775d6ab813e4dbdb4ea7a6c6ad',
            ...unchanged
        },
        {
            caseId: 'CMD-TURN-01',
            edgeDigest: 'b66701e3b967d716379ebdafccebed0987d09e728982e33674df86802115d06e',
            observedClass: 'LATE_TURN',
            accepted: false,
            mutated: false,
            error: { code: 'LATE_TURN', message: 'The command targets a different turn.' },
            requestDigest: '07e846dd187260f1cef8fdc447388e6de120f35fd7a8dcb433997bf1022462f8',
            targetDigest: '4e460b7362b961ac62fff60143de79d995afac99fea1d5ba1ad97c9b4d4e12ce',
            witnessDigest: '89abdd324140096929b799ff468c4ae38593e1d097fc387a182acb3ad3cdc5a2',
            ...unchanged
        },
        {
            caseId: 'CMD-VALID-01',
            edgeDigest: '4aea30fd5b45cc3d9b42bf4973aa2f20f3702375a8415407cda4c61f711aba74',
            evidenceClass: 'correlated_reuse',
            inputUnchanged: true,
            mathematicalPlacementImplication: 'none',
            observedClass: 'accepted_move',
            accepted: true,
            mutated: true,
            error: null,
            authoritativeEvents: [{ actor: 'player', type: 'moved', x: 520, y: 308 }],
            eventsDigest: 'ba0d81ab95b73d737e68d70ba9a074ce74bf4b0e2125151d83fe3169c8902785',
            movementRemaining: 56,
            playerX: 520,
            revision: 1,
            preStateDigest: 'f319a603ccc9f1cce95a4affb0ab54219bf8963c620e88fc3a07de52cf496f4d',
            postStateDigest: 'c046a4e1a93d27ce98860541048d43289e78f68f8857697784a68430902061be',
            reopeningCondition: D2Q_REOPENING_CONDITION,
            requestDigest: 'fa49c031d24229b353e644cbc50ec443948b5f97f400746d2543f4cfb0f08ec6',
            targetDigest: '8b6ee549325ed8b913a2b3d9c4ead0a6a9ae2fe372381c97c8a191ab04d375ec',
            unchangedRejection: false,
            verdict: 'matched_source_prediction',
            sourceReadoutMatches: true,
            witnessDigest: 'e50fb632daae3e0181908b285cbedabdc0872e1c2b4c982152fa2b8996343a78'
        }
    ];
}

export function expectedStageCD2QAblationControls():
StageCResult['protectedCoreRecovery']['ablationControls'] {
    const fullClasses: StageCD2QClassPartition = {
        digest: 'b54ff53965a4fcf93e019f5df9eca03304407c1be89a6e1071e911789b09097b',
        members: [
            ['CMD-VALID-01'], ['CMD-TURN-01'], ['CMD-ACTOR-01'], ['CMD-PRECEDENCE-01']
        ]
    };
    const primary = (
        caseIds: string[],
        targetDigests: string[]
    ): StageCD2QPairControl => ({
        ablatedProjectionEqual: true,
        caseIds,
        errorEqual: false,
        eventsEqual: false,
        evidenceClass: 'correlated_reuse',
        fullProjectionEqual: false,
        kind: 'primary_pair',
        mathematicalPlacementImplication: 'none',
        postStateEqual: false,
        reopeningCondition: D2Q_REOPENING_CONDITION,
        restorationRecovers: true,
        restoredProjectionEqual: false,
        targetDigests,
        targetEqual: false,
        verdict: 'target_relevant_on_declared_V4_command_gate'
    });
    const common = {
        roleFamily: 'command_input_coordinate' as const,
        rentScope: 'declared_target' as const,
        contextDigest: '4e9e3c1bc006c17562edd74e92927fb709a31cac249d75f00c478ae1c799865a',
        fullClasses,
        restoredClasses: fullClasses,
        frameChecks: {
            exactContextKeys: true,
            noHiddenOracleAdded: true,
            routeHorizonUnchanged: true,
            targetDomainUnchanged: true,
            toleranceUnchanged: true,
            unrelatedSupportHeldFixed: true,
            worldCutUnchanged: true
        },
        sourceFactsPass: true,
        actuallyOmitted: true,
        restorationRecovers: true,
        evidenceClass: 'correlated_reuse' as const,
        mathematicalPlacementImplication: 'none' as const,
        reopeningCondition: D2Q_REOPENING_CONDITION,
        derivedVerdict: 'target_relevant_on_declared_V4_command_gate' as const
    };
    return [
        {
            ablationId: 'ABL-ACTOR',
            fieldId: 'actor',
            canonicalSourceRowDigest:
                '286d72d10b6d41de604b7332ceae3567b8ea36beb8e774e046388c5efe720a81',
            omittedFieldIds: ['actor'],
            stageDigest: 'fa833f70337d2572bc04c016ee4e1eaae620937d851fd10043b5cb2e1d257b66',
            ablatedClasses: {
                digest: 'b9ac2377eb541f4b240f8a2f8508ce2ac95d35f08dbb183043cdc5516de1895a',
                members: [
                    ['CMD-VALID-01', 'CMD-ACTOR-01'],
                    ['CMD-TURN-01', 'CMD-PRECEDENCE-01']
                ]
            },
            aliasPairs: [
                { caseIds: ['CMD-VALID-01', 'CMD-ACTOR-01'], targetEqual: false }
            ],
            equalTargetControls: [
                { caseIds: ['CMD-TURN-01', 'CMD-PRECEDENCE-01'], targetEqual: true }
            ],
            primaryControl: primary(
                ['CMD-VALID-01', 'CMD-ACTOR-01'],
                [
                    '8b6ee549325ed8b913a2b3d9c4ead0a6a9ae2fe372381c97c8a191ab04d375ec',
                    '42f3119c064167c6cc59e17cf9c19b4f8d82a2adaebbf5878529b1974b370e50'
                ]
            ),
            equalityControl: {
                ablatedProjectionEqual: true,
                caseIds: ['CMD-TURN-01', 'CMD-PRECEDENCE-01'],
                errorEqual: true,
                eventsEqual: true,
                evidenceClass: 'correlated_reuse',
                fullProjectionEqual: false,
                kind: 'conditional_equal_target',
                mathematicalPlacementImplication: 'none',
                postStateEqual: true,
                reopeningCondition: D2Q_REOPENING_CONDITION,
                restorationRecovers: true,
                restoredProjectionEqual: false,
                targetDigests: [
                    '4e460b7362b961ac62fff60143de79d995afac99fea1d5ba1ad97c9b4d4e12ce',
                    '4e460b7362b961ac62fff60143de79d995afac99fea1d5ba1ad97c9b4d4e12ce'
                ],
                targetEqual: true,
                verdict: 'no_omission_witness_found'
            },
            errorOnlyControl: null,
            ...common
        },
        {
            ablationId: 'ABL-EXPECTED-TURN',
            fieldId: 'expectedTurn',
            canonicalSourceRowDigest:
                '7da88d94001bced328e4db5e0193749cdf619a9ad56a58b8e4c482d3a1f928d3',
            omittedFieldIds: ['expectedTurn'],
            stageDigest: 'd55f84c5db91dab507dcc3819cf64307a288a6d5c9b498c834e2ac4cf737e114',
            ablatedClasses: {
                digest: 'd46146209bd2ce5258763b4f3c25bd7326fc5c1b329a285300d0d21a3671eb53',
                members: [
                    ['CMD-VALID-01', 'CMD-TURN-01'],
                    ['CMD-ACTOR-01', 'CMD-PRECEDENCE-01']
                ]
            },
            aliasPairs: [
                { caseIds: ['CMD-VALID-01', 'CMD-TURN-01'], targetEqual: false },
                { caseIds: ['CMD-ACTOR-01', 'CMD-PRECEDENCE-01'], targetEqual: false }
            ],
            equalTargetControls: [],
            primaryControl: primary(
                ['CMD-VALID-01', 'CMD-TURN-01'],
                [
                    '8b6ee549325ed8b913a2b3d9c4ead0a6a9ae2fe372381c97c8a191ab04d375ec',
                    '4e460b7362b961ac62fff60143de79d995afac99fea1d5ba1ad97c9b4d4e12ce'
                ]
            ),
            equalityControl: null,
            errorOnlyControl: {
                ablatedProjectionEqual: true,
                caseIds: ['CMD-ACTOR-01', 'CMD-PRECEDENCE-01'],
                errorEqual: false,
                eventsEqual: true,
                evidenceClass: 'correlated_reuse',
                fullProjectionEqual: false,
                kind: 'equal_post_state_different_error',
                mathematicalPlacementImplication: 'none',
                postStateEqual: true,
                reopeningCondition: D2Q_REOPENING_CONDITION,
                restorationRecovers: true,
                restoredProjectionEqual: false,
                targetDigests: [
                    '42f3119c064167c6cc59e17cf9c19b4f8d82a2adaebbf5878529b1974b370e50',
                    '4e460b7362b961ac62fff60143de79d995afac99fea1d5ba1ad97c9b4d4e12ce'
                ],
                targetEqual: false,
                verdict: 'target_relevant_on_declared_V4_command_gate'
            },
            ...common
        }
    ];
}

export function reconstructD2QProtectedCore(
    repositoryRoot = STAGE_C_ROOT
): StageCResult['protectedCoreRecovery'] {
    const identity = gitPathIdentity(D2Q_RETURN_COMMIT, D2Q_RETURN_PATH, repositoryRoot);
    assert.equal(identity.blob, D2Q_RETURN_BLOB, 'D2Q return blob drifted.');
    const value = parseStageCStrictJson(
        gitBytes(['show', `${D2Q_RETURN_COMMIT}:${D2Q_RETURN_PATH}`], repositoryRoot)
            .toString('utf8')
    );
    assertObject(value, 'D2Q return');
    const source = value.source;
    assertObject(source, 'D2Q return source');
    assert.equal(source.commit, D2Q_SOURCE_COMMIT);
    const projection = value.projection;
    assertObject(projection, 'D2Q projection');
    assert.equal(projection.sourceCommit, D2Q_SOURCE_COMMIT);
    assert.equal(projection.resultDigest, D2Q_RESULT_DIGEST);
    assert(Array.isArray(projection.cases), 'D2Q case results are absent.');
    const cases = projection.cases as Record<string, unknown>[];
    const canonicalCaseRows = [...cases].sort((left, right) =>
        compareCanonicalText(String(left.caseId), String(right.caseId)));
    const caseRowsCanonicalDigest = sha256Digest(canonicalCaseRows);
    assert.equal(caseRowsCanonicalDigest, D2Q_CASE_ROWS_CANONICAL_DIGEST,
        'D2Q complete four-case canonical provenance rows drifted.');
    const expectedIds = ['CMD-ACTOR-01', 'CMD-PRECEDENCE-01', 'CMD-TURN-01', 'CMD-VALID-01'];
    const caseIds = cases.map((row) => String(row.caseId)).sort(compareCanonicalText);
    assert.deepEqual(caseIds, expectedIds);
    const expectedCaseReadouts = expectedStageCD2QCaseReadouts();
    const expectedById = new Map(expectedCaseReadouts.map((row) => [row.caseId, row]));
    const caseReadouts = cases.map((row) => {
        assertExactKeys(row, [
            'caseId', 'edgeDigest', 'evidenceClass', 'inputUnchanged',
            'mathematicalPlacementImplication', 'observedClass', 'readout',
            'reopeningCondition', 'requestDigest', 'sourceReadoutMatches', 'targetDigest',
            'unchangedRejection', 'verdict', 'witnessDigest'
        ], `D2Q ${String(row.caseId)} case row`);
        const readout = row.readout;
        assertObject(readout, `D2Q ${String(row.caseId)} readout`);
        assertExactKeys(readout, [
            'accepted', 'authoritativeEvents', 'error', 'eventsDigest', 'movementRemaining',
            'mutated', 'playerX', 'postStateDigest', 'preStateDigest', 'revision'
        ], `D2Q ${String(row.caseId)} decoded readout`);
        const error = readout.error;
        if (error !== null) {
            assertObject(error, `D2Q ${String(row.caseId)} error`);
            assertExactKeys(error, ['code', 'message'], `D2Q ${String(row.caseId)} error`);
            assert.equal(typeof error.code, 'string');
            assert.equal(typeof error.message, 'string');
        }
        assert(Array.isArray(readout.authoritativeEvents));
        for (const field of ['accepted', 'mutated'] as const) {
            assert.equal(typeof readout[field], 'boolean',
                `D2Q ${String(row.caseId)} ${field} must be Boolean.`);
        }
        for (const field of ['movementRemaining', 'playerX', 'revision'] as const) {
            assert.equal(typeof readout[field], 'number',
                `D2Q ${String(row.caseId)} ${field} must be numeric.`);
            assert(Number.isFinite(readout[field]));
        }
        for (const field of [
            'eventsDigest', 'preStateDigest', 'postStateDigest'
        ] as const) assertHex(readout[field], 64, `D2Q ${String(row.caseId)} ${field}`);
        for (const field of ['edgeDigest', 'requestDigest', 'targetDigest', 'witnessDigest'] as const) {
            assertHex(row[field], 64, `D2Q ${String(row.caseId)} ${field}`);
        }
        assert.equal(typeof row.observedClass, 'string');
        assert.equal(typeof row.reopeningCondition, 'string');
        assert.equal(typeof row.inputUnchanged, 'boolean');
        assert.equal(typeof row.unchangedRejection, 'boolean');
        const expected = expectedById.get(String(row.caseId));
        assert(expected, `Unexpected D2Q case: ${String(row.caseId)}`);
        const authoritativeEvents = deepSortJson(readout.authoritativeEvents) as JsonValue[];
        assert.equal(readout.eventsDigest, sha256Digest(authoritativeEvents),
            `D2Q ${String(row.caseId)} event digest does not derive from decoded events.`);
        const normalized: StageCResult['protectedCoreRecovery']['caseReadouts'][number] = {
            caseId: String(row.caseId),
            edgeDigest: String(row.edgeDigest),
            evidenceClass: row.evidenceClass as 'correlated_reuse',
            inputUnchanged: row.inputUnchanged as true,
            mathematicalPlacementImplication: row.mathematicalPlacementImplication as 'none',
            observedClass: String(row.observedClass),
            accepted: readout.accepted as boolean,
            mutated: readout.mutated as boolean,
            error: error === null
                ? null
                : { code: String(error.code), message: String(error.message) },
            authoritativeEvents,
            eventsDigest: String(readout.eventsDigest),
            movementRemaining: readout.movementRemaining as number,
            playerX: readout.playerX as number,
            revision: readout.revision as number,
            preStateDigest: String(readout.preStateDigest),
            postStateDigest: String(readout.postStateDigest),
            reopeningCondition: String(row.reopeningCondition),
            requestDigest: String(row.requestDigest),
            targetDigest: String(row.targetDigest),
            unchangedRejection: row.unchangedRejection as boolean,
            verdict: 'matched_source_prediction' as const,
            sourceReadoutMatches: row.sourceReadoutMatches as true,
            witnessDigest: String(row.witnessDigest)
        };
        const derivedUnchangedRejection = !normalized.accepted && !normalized.mutated &&
            normalized.authoritativeEvents.length === 0 &&
            normalized.preStateDigest === normalized.postStateDigest;
        assert.equal(normalized.unchangedRejection, derivedUnchangedRejection,
            `D2Q ${normalized.caseId} unchanged-rejection control is not derived.`);
        assert.equal(canonicalJson(normalized), canonicalJson(expected),
            `D2Q ${normalized.caseId} normalized decoded row drifted.`);
        return normalized;
    }).sort((left, right) => compareCanonicalText(left.caseId, right.caseId));
    const ablations = projection.ablations;
    assert(Array.isArray(ablations), 'D2Q ablation records are absent.');
    const actorAblation = (ablations as Record<string, unknown>[]).find((row) => row.fieldId === 'actor');
    const turnAblation = (ablations as Record<string, unknown>[]).find((row) => row.fieldId === 'expectedTurn');
    assert(actorAblation && turnAblation, 'D2Q actor/turn conditional scope is unrecoverable.');
    const canonicalAblationRows = [actorAblation, turnAblation].sort((left, right) =>
        compareCanonicalText(String(left.fieldId), String(right.fieldId)));
    const ablationRowsCanonicalDigest = sha256Digest(canonicalAblationRows);
    assert.equal(ablationRowsCanonicalDigest, D2Q_ABLATION_ROWS_CANONICAL_DIGEST,
        'D2Q actor/expectedTurn complete ablation-control rows drifted.');
    const normalizeAblation = (
        row: Record<string, unknown>,
        fieldId: 'actor' | 'expectedTurn'
    ): StageCResult['protectedCoreRecovery']['ablationControls'][number] => {
        assertExactKeys(row, [
            'ablationId', 'fieldId', 'roleFamily', 'rentScope', 'omittedFieldIds',
            'contextDigest', 'stageDigest', 'fullClasses', 'ablatedClasses', 'restoredClasses',
            'aliasPairs', 'equalTargetControls', 'primaryControl', 'equalityControl',
            'errorOnlyControl', 'frameChecks', 'sourceFactsPass', 'actuallyOmitted',
            'restorationRecovers', 'verdict', 'evidenceClass',
            'mathematicalPlacementImplication', 'reopeningCondition'
        ], `D2Q ${fieldId} ablation row`);
        const normalizePartition = (
            value: unknown,
            label: string
        ): StageCD2QClassPartition => {
            assertExactKeys(value, ['digest', 'members'], label);
            const partition = value as Record<string, unknown>;
            assertHex(partition.digest, 64, `${label} digest`);
            assert(Array.isArray(partition.members), `${label} members must be an array.`);
            const members = partition.members.map((member, index) => {
                assert(Array.isArray(member), `${label} members[${index}] must be an array.`);
                for (const caseId of member) assert.equal(typeof caseId, 'string');
                return [...member] as string[];
            });
            return { digest: partition.digest, members };
        };
        const normalizeCasePairs = (
            value: unknown,
            label: string
        ): { caseIds: string[]; targetEqual: boolean }[] => {
            assert(Array.isArray(value), `${label} must be an array.`);
            return value.map((pair, index) => {
                assertExactKeys(pair, ['caseIds', 'targetEqual'], `${label}[${index}]`);
                const typed = pair as Record<string, unknown>;
                assert(Array.isArray(typed.caseIds));
                for (const caseId of typed.caseIds) assert.equal(typeof caseId, 'string');
                assert.equal(typeof typed.targetEqual, 'boolean');
                return {
                    caseIds: [...typed.caseIds] as string[],
                    targetEqual: typed.targetEqual as boolean
                };
            });
        };
        const normalizePairControl = (
            value: unknown,
            label: string
        ): StageCD2QPairControl | null => {
            if (value === null) return null;
            assertExactKeys(value, [
                'ablatedProjectionEqual', 'caseIds', 'errorEqual', 'eventsEqual',
                'evidenceClass', 'fullProjectionEqual', 'kind',
                'mathematicalPlacementImplication', 'postStateEqual', 'reopeningCondition',
                'restorationRecovers', 'restoredProjectionEqual', 'targetDigests',
                'targetEqual', 'verdict'
            ], label);
            const control = value as Record<string, unknown>;
            assert(Array.isArray(control.caseIds));
            assert(Array.isArray(control.targetDigests));
            for (const caseId of control.caseIds) assert.equal(typeof caseId, 'string');
            for (const digest of control.targetDigests) assertHex(digest, 64, `${label} target digest`);
            for (const field of [
                'ablatedProjectionEqual', 'errorEqual', 'eventsEqual', 'fullProjectionEqual',
                'postStateEqual', 'restorationRecovers', 'restoredProjectionEqual', 'targetEqual'
            ]) assert.equal(typeof control[field], 'boolean', `${label}.${field} must be Boolean.`);
            return {
                ablatedProjectionEqual: control.ablatedProjectionEqual as boolean,
                caseIds: [...control.caseIds] as string[],
                errorEqual: control.errorEqual as boolean,
                eventsEqual: control.eventsEqual as boolean,
                evidenceClass: control.evidenceClass as 'correlated_reuse',
                fullProjectionEqual: control.fullProjectionEqual as boolean,
                kind: control.kind as StageCD2QPairControl['kind'],
                mathematicalPlacementImplication:
                    control.mathematicalPlacementImplication as 'none',
                postStateEqual: control.postStateEqual as boolean,
                reopeningCondition: String(control.reopeningCondition),
                restorationRecovers: control.restorationRecovers as boolean,
                restoredProjectionEqual: control.restoredProjectionEqual as boolean,
                targetDigests: [...control.targetDigests] as string[],
                targetEqual: control.targetEqual as boolean,
                verdict: control.verdict as StageCD2QPairControl['verdict']
            };
        };
        assert(Array.isArray(row.omittedFieldIds));
        for (const omitted of row.omittedFieldIds) assert.equal(typeof omitted, 'string');
        assertObject(row.frameChecks, `D2Q ${fieldId} frame checks`);
        assertExactKeys(row.frameChecks, [
            'exactContextKeys', 'noHiddenOracleAdded', 'routeHorizonUnchanged',
            'targetDomainUnchanged', 'toleranceUnchanged', 'unrelatedSupportHeldFixed',
            'worldCutUnchanged'
        ], `D2Q ${fieldId} frame checks`);
        const frameChecks = Object.fromEntries(Object.entries(row.frameChecks)
            .map(([key, checked]) => [key, checked === true]));
        const normalized: StageCResult['protectedCoreRecovery']['ablationControls'][number] = {
            ablationId: row.ablationId as 'ABL-ACTOR' | 'ABL-EXPECTED-TURN',
            fieldId,
            roleFamily: row.roleFamily as 'command_input_coordinate',
            rentScope: row.rentScope as 'declared_target',
            canonicalSourceRowDigest: sha256Digest(row),
            omittedFieldIds: (row.omittedFieldIds as unknown[]).map(String),
            contextDigest: String(row.contextDigest),
            stageDigest: String(row.stageDigest),
            fullClasses: normalizePartition(row.fullClasses, `D2Q ${fieldId} full classes`),
            ablatedClasses:
                normalizePartition(row.ablatedClasses, `D2Q ${fieldId} ablated classes`),
            restoredClasses:
                normalizePartition(row.restoredClasses, `D2Q ${fieldId} restored classes`),
            aliasPairs: normalizeCasePairs(row.aliasPairs, `D2Q ${fieldId} alias pairs`),
            equalTargetControls: normalizeCasePairs(
                row.equalTargetControls,
                `D2Q ${fieldId} equal-target controls`
            ),
            primaryControl: normalizePairControl(
                row.primaryControl,
                `D2Q ${fieldId} primary control`
            ) as StageCD2QPairControl,
            equalityControl: normalizePairControl(
                row.equalityControl,
                `D2Q ${fieldId} equality control`
            ),
            errorOnlyControl: normalizePairControl(
                row.errorOnlyControl,
                `D2Q ${fieldId} error-only control`
            ),
            frameChecks,
            actuallyOmitted: row.actuallyOmitted === true,
            sourceFactsPass: row.sourceFactsPass === true,
            restorationRecovers: row.restorationRecovers === true,
            evidenceClass: row.evidenceClass as 'correlated_reuse',
            mathematicalPlacementImplication: row.mathematicalPlacementImplication as 'none',
            reopeningCondition: String(row.reopeningCondition),
            derivedVerdict: 'unresolved' as
                'target_relevant_on_declared_V4_command_gate' | 'unresolved'
        };
        const expected = expectedStageCD2QAblationControls()
            .find((candidate) => candidate.fieldId === fieldId);
        assert(expected, `Missing immutable expected D2Q ${fieldId} ablation control.`);
        const { derivedVerdict: _expectedVerdict, ...expectedStructural } = expected;
        const { derivedVerdict: _normalizedVerdict, ...normalizedStructural } = normalized;
        const structuralPass = exact(normalizedStructural, expectedStructural);
        normalized.derivedVerdict = structuralPass
            ? 'target_relevant_on_declared_V4_command_gate'
            : 'unresolved';
        assert.equal(row.verdict, normalized.derivedVerdict,
            `D2Q ${fieldId} declared verdict does not match the independently derived control.`);
        assert.equal(canonicalJson(normalized), canonicalJson(expected),
            `D2Q ${fieldId} complete normalized ablation control drifted.`);
        return normalized;
    };
    const ablationControls = [
        normalizeAblation(actorAblation, 'actor'),
        normalizeAblation(turnAblation, 'expectedTurn')
    ];
    assert(ablationControls.every((row) =>
        row.derivedVerdict === 'target_relevant_on_declared_V4_command_gate'));
    const conditionalActorTurnScopePreserved =
        caseRowsCanonicalDigest === D2Q_CASE_ROWS_CANONICAL_DIGEST &&
        ablationRowsCanonicalDigest === D2Q_ABLATION_ROWS_CANONICAL_DIGEST &&
        exact(caseReadouts, expectedStageCD2QCaseReadouts()) &&
        exact(ablationControls, expectedStageCD2QAblationControls()) &&
        ablationControls.every((row) =>
            row.derivedVerdict === 'target_relevant_on_declared_V4_command_gate');
    assert(conditionalActorTurnScopePreserved);
    const matchedSourcePredictionCount = caseReadouts.filter((row, index) =>
        exact(row, expectedCaseReadouts[index])).length;
    assert.equal(matchedSourcePredictionCount, 4);
    return {
        status: 'recovered_from_immutable_provenance_without_replay',
        d2qSourceCommit: D2Q_SOURCE_COMMIT,
        d2qResultDigest: D2Q_RESULT_DIGEST,
        d2qReturnBlob: D2Q_RETURN_BLOB,
        caseRowsCanonicalDigest,
        ablationRowsCanonicalDigest,
        caseIds,
        caseReadouts,
        fieldVerdicts: {
            actor: ablationControls[0].derivedVerdict as
                'target_relevant_on_declared_V4_command_gate',
            expectedTurn: ablationControls[1].derivedVerdict as
                'target_relevant_on_declared_V4_command_gate'
        },
        ablationControls,
        matchedSourcePredictionCount: matchedSourcePredictionCount as 4,
        conditionalActorTurnScopePreserved: conditionalActorTurnScopePreserved as true
    };
}

function verifyStageAReturnBoundary(repositoryRoot: string): void {
    const identity = gitPathIdentity(STAGE_A_RETURN_COMMIT, STAGE_A_RETURN_PATH, repositoryRoot);
    assert.equal(identity.blob, STAGE_A_RETURN_BLOB, 'Stage A return blob drifted.');
    const value = parseStageCStrictJson(
        gitBytes(['show', `${STAGE_A_RETURN_COMMIT}:${STAGE_A_RETURN_PATH}`], repositoryRoot)
            .toString('utf8')
    );
    assertObject(value, 'Stage A return');
    const projection = value.projection;
    assertObject(projection, 'Stage A review-return projection');
    const selectedTransition = projection.selectedTransition;
    assertObject(selectedTransition, 'Stage A selected transition');
    assert.equal(selectedTransition.transitionId, 'TAU-WPV4-RETURN-01A');
    const reversibility = selectedTransition.reversibility;
    assertObject(reversibility, 'Stage A reversibility obligation');
    assert.equal(reversibility.status, 'declared_not_earned');
}

export function validateStageCRegistration(value: unknown): Record<string, unknown> {
    assertObject(value, 'Stage C registration');
    assert.equal(value.schemaVersion, 1);
    assert.equal(value.registrationId,
        'WP-015D2R:stage-c-independent-reconstruction-and-chart-revision:v1');
    assert.equal(value.packageId, 'WP-015D2R');
    assert.equal(value.supportWorkPackageId, 'WP-015D2U');
    assert.equal(value.stage, 'stage_c');
    const sourceBoundary = value.sourceBoundary;
    assertObject(sourceBoundary, 'Stage C registration source boundary');
    const sourceHead = sourceBoundary.sourceHead;
    assertObject(sourceHead, 'Stage C registration source head');
    assert.equal(sourceHead.commit, STAGE_B_TERMINAL_EVIDENCE_COMMIT);
    const requiredCommits = sourceBoundary.requiredCommits;
    assertObject(requiredCommits, 'Stage C required commits');
    assert.equal(requiredCommits.stageBPreregistrationSource,
        STAGE_B_PREREGISTRATION_SOURCE_COMMIT);
    assert.equal(requiredCommits.stageBPreregistrationTerminal,
        STAGE_B_PREREGISTRATION_TERMINAL_COMMIT);
    assert.equal(requiredCommits.stageBExecutionSource, STAGE_B_EXECUTION_SOURCE_COMMIT);
    assert.equal(requiredCommits.stageBResult, STAGE_B_RESULT_COMMIT);
    assert.equal(requiredCommits.stageBTerminalEvidence, STAGE_B_TERMINAL_EVIDENCE_COMMIT);
    assert.equal(sourceBoundary.stageBResultDigest, STAGE_B_RESULT_DIGEST);
    assert(Array.isArray(sourceBoundary.sourceBindings), 'Stage C source bindings are absent.');
    const bindings = sourceBoundary.sourceBindings as Record<string, unknown>[];
    assert.equal(bindings.length, 15, 'Stage C must bind exactly fifteen predecessor source rows.');
    assertUnique(bindings.map((row) => String(row.id)), 'Duplicate Stage C source-binding ID.');
    assertUnique(bindings.map((row) => `${String(row.commit)}:${String(row.path)}`),
        'Duplicate Stage C source-binding commit/path.');
    assert(exact(bindings, STAGE_C_EXPECTED_SOURCE_BINDINGS),
        'Stage C source-binding manifest differs from the exact preregistered 15-row manifest.');

    const independent = value.independentReconstructionBoundary;
    assertObject(independent, 'Stage C independent reconstruction boundary');
    assert(exact(independent, STAGE_C_EXPECTED_INDEPENDENT_RECONSTRUCTION_BOUNDARY),
        'Stage C independent reconstruction boundary drifted.');

    const fixedFrame = value.fixedFrame;
    assertObject(fixedFrame, 'Stage C fixed frame');
    assert(exact(fixedFrame, STAGE_C_EXPECTED_REGISTRATION_FIXED_FRAME),
        'Stage C complete fixed frame drifted.');

    const obligations = value.reconstructionObligations;
    assertObject(obligations, 'Stage C reconstruction obligations');
    assert.equal(obligations.eligibleEndpointCount, STAGE_C_EXPECTED.endpointCount);
    assert.equal(obligations.sourceClassCount, STAGE_C_EXPECTED.sourceClassCount);
    assert.deepEqual(obligations.sourceClassSizesSorted, [1, 1, 8, 8, 29, 29, 61, 61, 76]);
    assert.equal(obligations.aliasedSourceClassCount, STAGE_C_EXPECTED.aliasedClassCount);
    assert.equal(obligations.pairCount, STAGE_C_EXPECTED.pairCount);
    assert.deepEqual(obligations.primaryOutcomeCounts, STAGE_C_EXPECTED.outcomes);
    assert.equal(obligations.targetRelevantPairCount, STAGE_C_EXPECTED.targetRelevantPairCount);

    const candidates = value.carrierCandidates;
    assertObject(candidates, 'Stage C carrier candidates');
    for (const candidateName of ['thinOnlyBaseline', 'Q_support', 'Q_command']) {
        assertObject(candidates[candidateName], `Stage C ${candidateName}`);
    }
    const qSupport = candidates.Q_support as Record<string, unknown>;
    assert.equal(qSupport.groupCount, 17);
    assert.equal(qSupport.equalCandidatePairCount, STAGE_C_EXPECTED.qSupportEqualityPairCount);
    assert.equal(qSupport.KTargetCounterexampleCount, 0);
    const qCommand = candidates.Q_command as Record<string, unknown>;
    assert.equal(qCommand.groupCount, 14);
    assert.equal(qCommand.equalCandidatePairCount, STAGE_C_EXPECTED.qCommandEqualityPairCount);
    assert.equal(qCommand.commandSemanticCounterexampleCount, 0);
    assert.equal(qCommand.continuationSupportCounterexampleCount, 14);

    const roleContract = value.carrierRoleContract;
    assertObject(roleContract, 'Stage C carrier-role contract');
    assert.deepEqual(roleContract.enum,
        ['live_carrier', 'target_relative_support', 'provenance', 're_entry_support', 'unresolved']);
    assert.deepEqual(roleContract.expectedOnExactDerivation, {
        movementRemaining: 'live_carrier',
        'move admissibility': 'target_relative_support',
        'route history': 'provenance',
        revision: 'provenance',
        'exact state digest': 're_entry_support'
    });
    assertObject(value.stateMaterialSeparationContract,
        'Stage C state-material separation contract');
    assert(exact(value.stateMaterialSeparationContract, {
        auditPredecessorProvenance: {
            statusOnExactDerivation: 'authenticated',
            otherwise: 'unresolved',
            basis:
                'All fifteen exact predecessor bindings, including immutable Stage A and D2Q material, authenticate and their ordered identity digest matches; never live recursive state.'
        },
        domainTransitionProvenance: {
            statusOnExactDerivation: 'route_history_and_revision_only',
            otherwise: 'unresolved',
            basis:
                'Route history and revision both derive the provenance role and remain transition provenance, not target carrier coordinates.'
        },
        reEntryMaterial: {
            statusOnExactDerivation: 'exact_state_digest_only',
            otherwise: 'unresolved',
            basis:
                'Exact state digest derives re_entry_support and is retained for exact audit recovery only.'
        },
        liveRecursiveState: {
            status: 'absent_not_established',
            recursiveContinuationClosure: false
        },
        preCommandBudget: {
            statusOnExactDerivation: 'bounded_one_command_live_carrier',
            otherwise: 'unresolved',
            recursiveState: false
        },
        derivationRule:
            'Derive all categories from authenticated source identities, recovered D2Q/Stage A structure, carrier-role evidence and candidate partitions. Bind the ledger into W/Omega/P/N/J, Tau, chart and parity; a category mutation must withdraw readiness rather than be absorbed by a generic provenance label.'
    }), 'Stage C state-material separation contract drifted.');
    const pilot = value.pilotSynthesis;
    assertObject(pilot, 'Stage C pilot synthesis contract');
    assert.deepEqual(pilot.requiredRoles, STAGE_C_PILOT_ROLES);
    assert(Array.isArray(pilot.requiredPerRoleReturnFields));
    assert.equal((pilot.requiredPerRoleReturnFields as unknown[]).length, 6);
    assert(String((pilot.requiredPerRoleReturnFields as unknown[])[0]).includes(
        'per-role boundIdentities object'),
    'Stage C pilot contract does not require exact per-role bound identities.');

    const output = value.outputContract;
    assertObject(output, 'Stage C output contract');
    assert.deepEqual(output.sourceOutputs, [...STAGE_C_SOURCE_OUTPUTS]);
    assert.deepEqual(output.resultOutputs, [...STAGE_C_RESULT_OUTPUTS]);
    assert.deepEqual(output.reviewReturnOutputs, [...STAGE_C_REVIEW_OUTPUTS]);
    assert.deepEqual(output.allowedOutputs, [...STAGE_C_ALL_OUTPUTS]);
    assert.deepEqual(output.ignoredOrRawOutputsAllowed, []);
    assert.equal(output.baseCommit, STAGE_B_TERMINAL_EVIDENCE_COMMIT);
    assert.equal(output.requiredStatus, 'A');
    assert.equal(output.requiredMode, '100644');
    assert.equal(output.existingPathChangesAllowed, false);
    assertObject(output.lifecycle, 'Stage C output lifecycle');
    assert(exact(output.lifecycle, {
        sourceStage:
            'From entry commit to source commit, add exactly all six sourceOutputs as A/100644; resultOutputs and reviewReturnOutputs remain absent.',
        resultStage:
            'From source commit to result commit, add exactly both resultOutputs as A/100644; all sourceOutputs remain byte-identical and the review return remains absent.',
        reviewReturnStage:
            'From result commit to review-return commit, add exactly the one reviewReturnOutputs path as A/100644 after committed-result/range/parity/three-role review; all earlier outputs remain byte-identical.',
        terminalCloseoutStage:
            'From review-return commit to terminal commit, modify only docs/evidence/wp-015d2u.json as M/100644 to record the committed review return and completed checks; every other allowed output remains byte-identical.',
        failureBeforeResultReservation:
            'Any source authentication, frame, reconstruction, negative-retention, witness or candidate-chart hard-gate failure stops before creating either result output. Retain the failure in command/test evidence and docs/evidence/wp-015d2u.json; do not publish a not_ready result/report pair.',
        entryToTerminalEndpoint:
            'Relative to 6e47d42b691effe5d34c5c050302def40ae40181, exactly all nine allowedOutputs must be A/100644. No other endpoint path may change.',
        intermediateStatusRule:
            'docs/evidence/wp-015d2u.json is A in the source commit and M only in the terminal closeout; source contract, registration, reconstructor, runner and test are A only at source; result and report are A only at result; review return is A only after result review. Renames, deletes, copies with rename status, type changes, nonregular modes and any undeclared path are forbidden.'
    }), 'Stage C output lifecycle drifted.');

    const reviewReturn = value.reviewReturnContract;
    assertObject(reviewReturn, 'Stage C review-return contract');
    assert.equal(reviewReturn.path, STAGE_C_REVIEW_RETURN_PATH);
    assertObject(reviewReturn.preReviewResultState, 'Stage C pre-review result state');
    assert(exact(reviewReturn.preReviewResultState, {
        semanticReconstructionReadiness:
            'ready_for_committed_review; source/authentication/semantic hard-gate failure stops before result/report reservation and is retained in WP-015D2U instead of publishing a not_ready result',
        navigatorAdmission: 'pending',
        tauStatus: 'candidate_unlicensed',
        chartStatus: 'candidate_revision_pending_review'
    }));
    assertObject(reviewReturn.passState, 'Stage C review pass state');
    assert(exact(reviewReturn.passState, {
        semanticReconstructionReadiness: 'ready_for_committed_review',
        navigatorAdmission: 'reviewed_bounded',
        tauStatus: 'licensed_for_bounded_stage_c_reentry_only',
        chartStatus: 'reviewed_bounded',
        successor: 'recommendation_only_or_explicit_stop',
        successorWorldExecution: 'closed'
    }));
    assertObject(reviewReturn.failureState, 'Stage C review failure state');
    assert(exact(reviewReturn.failureState, {
        navigatorAdmission: 'not_admitted',
        tauStatus: 'candidate_unlicensed',
        chartStatus: 'not_accepted',
        successorWorldExecution: 'closed'
    }));

    const governedStop = value.governedStop;
    assertObject(governedStop, 'Stage C governed stop');
    assert.equal(governedStop.stopStatement, STAGE_C_STOP_STATEMENT);
    assert.equal(governedStop.productAuthority, 'none');
    assert.equal(governedStop.mathematicalPlacementImplication, 'none');
    assert.equal(governedStop.playerObservationTiming, 'closed');
    assert.equal(governedStop.gameplayChange, false);
    assert.equal(governedStop.p5, 'closed');
    assert.equal(governedStop.successorWorldExecution, 'closed');
    return value;
}

export function verifyStageCSourceBindings(
    registration: Record<string, unknown>,
    repositoryRoot = STAGE_C_ROOT
): { count: number; digest: string } {
    const sourceBoundary = registration.sourceBoundary as Record<string, unknown>;
    const sourceHead = sourceBoundary.sourceHead as Record<string, unknown>;
    assert.equal(
        gitText(['rev-parse', `${String(sourceHead.commit)}^{tree}`], repositoryRoot),
        sourceHead.tree,
        'Stage C source-head tree drifted.'
    );
    const required = sourceBoundary.requiredCommits as Record<string, unknown>;
    for (const [commitKey, treeKey] of [
        ['stageBPreregistrationSource', 'stageBPreregistrationSourceTree'],
        ['stageBPreregistrationTerminal', 'stageBPreregistrationTerminalTree'],
        ['stageBExecutionSource', 'stageBExecutionSourceTree'],
        ['stageBResult', 'stageBResultTree'],
        ['stageBTerminalEvidence', 'stageBTerminalEvidenceTree']
    ] as const) {
        const commit = String(required[commitKey]);
        assert.equal(gitText(['rev-parse', `${commit}^{tree}`], repositoryRoot), required[treeKey],
            `Stage C required tree drifted: ${treeKey}`);
    }
    const bindings = sourceBoundary.sourceBindings as Record<string, unknown>[];
    const authenticated = bindings.map((binding) => {
        const commit = String(binding.commit);
        const path = String(binding.path);
        const actual = gitPathIdentity(commit, path, repositoryRoot);
        assert.equal(actual.mode, binding.mode, `Source-binding mode drifted: ${binding.id}`);
        assert.equal(actual.blob, binding.blob, `Source-binding blob drifted: ${binding.id}`);
        assert.equal(actual.sha256, binding.sha256, `Source-binding SHA-256 drifted: ${binding.id}`);
        return deepSortJson(binding);
    });
    return { count: authenticated.length, digest: sha256Digest(authenticated) };
}

export function readAuthenticatedStageCRegistration(
    sourceCommit: string,
    repositoryRoot = STAGE_C_ROOT
): { value: Record<string, unknown>; identity: SourceIdentityRow; bindingCount: number; bindingsDigest: string } {
    const identity = gitPathIdentity(sourceCommit, STAGE_C_REGISTRATION_PATH, repositoryRoot);
    const value = validateStageCRegistration(parseStageCStrictJson(
        gitBytes(['show', `${sourceCommit}:${STAGE_C_REGISTRATION_PATH}`], repositoryRoot).toString('utf8')
    ));
    const bindings = verifyStageCSourceBindings(value, repositoryRoot);
    return {
        value,
        identity,
        bindingCount: bindings.count,
        bindingsDigest: bindings.digest
    };
}

function buildSourceIdentity(sourceCommit: string, repositoryRoot: string): StageCResult['source'] {
    assertHex(sourceCommit, 40, 'Stage C source commit');
    gitObjectExists(sourceCommit, repositoryRoot);
    const authenticatedRegistration = readAuthenticatedStageCRegistration(sourceCommit, repositoryRoot);
    const registration = authenticatedRegistration.identity;
    const contract = gitPathIdentity(sourceCommit, STAGE_C_CONTRACT_PATH, repositoryRoot);
    const implementationRows = [
        STAGE_C_RECONSTRUCTOR_PATH,
        STAGE_C_RUNNER_PATH,
        STAGE_C_TEST_PATH,
        STAGE_C_EVIDENCE_PATH
    ].map((path) => gitPathIdentity(sourceCommit, path, repositoryRoot));
    const sourceRange = auditStageCRange(
        STAGE_B_TERMINAL_EVIDENCE_COMMIT,
        sourceCommit,
        STAGE_C_SOURCE_OUTPUTS,
        repositoryRoot
    );
    assert.deepEqual(
        sourceRange.endpointRows.map((row) => row.path),
        [...STAGE_C_SOURCE_OUTPUTS].sort(compareCanonicalText),
        'Stage C source range does not contain exactly the six declared source outputs.'
    );
    const unsigned = {
        sourceCommit,
        terminalBoundaryCommit: STAGE_B_TERMINAL_EVIDENCE_COMMIT as
            typeof STAGE_B_TERMINAL_EVIDENCE_COMMIT,
        registration,
        contract,
        implementationRows,
        predecessorBindingCount: authenticatedRegistration.bindingCount,
        predecessorBindingsDigest: authenticatedRegistration.bindingsDigest,
        sourceRange
    };
    return { ...unsigned, sourceDigest: sha256Digest(unsigned) };
}

function buildCoformation(endpoints: readonly StageCEndpoint[], pairs: readonly StageCReconstructedPair[]):
StageCResult['routeDepthMovementBudgetCoformation'] {
    const depths = [...new Set(endpoints.map((endpoint) => endpoint.endpointDepth))].sort((a, b) => a - b);
    const rows = depths.map((endpointDepth) => {
        const members = endpoints.filter((endpoint) => endpoint.endpointDepth === endpointDepth);
        return {
            endpointDepth,
            endpointCount: members.length,
            preCommandMovementRemainingValues:
                [...new Set(members.map((row) => row.preCommandMovementRemaining))].sort((a, b) => a - b),
            postCommandMovementRemainingValues:
                [...new Set(members.map((row) => row.postCommandMovementRemaining))].sort((a, b) => a - b),
            nextMoveAdmissibilityValues:
                [...new Set(members.map(nextMoveAdmissibility))].sort(),
            preCommandRevisionValues:
                [...new Set(members.map((row) => row.preCommandRevision))].sort((a, b) => a - b)
        };
    });
    const relevant = pairs.filter((pair) => pair.targetRelevant);
    return {
        rows,
        allTargetRelevantPairsCrossDepth:
            relevant.every((pair) => pair.leftEndpointDepth !== pair.rightEndpointDepth),
        allTargetRelevantPairsCrossPreCommandBudget:
            relevant.every((pair) =>
                pair.preCommandMovementRemainingPair[0] !== pair.preCommandMovementRemainingPair[1]),
        interpretation: 'co_formed_on_this_finite_domain_not_causal',
        nonClaims: [
            'No causal identification of route depth or movementRemaining.',
            'No unique or global carrier minimality.',
            'No all-seed closure.',
            'No recursive continuation closure.'
        ]
    };
}

export type StageCCarrierRoleDerivationInput = Readonly<{
    pairCount: number;
    allReconstructedRoutePairsDiffer: boolean;
    sourceBindingsAuthenticated: boolean;
    Q_support: StageCCandidateAssessment;
    Q_command: StageCCandidateAssessment & { continuationSupportCounterexampleCount: number };
    routeHistoryCandidate?: StageCCandidateAssessment;
    revisionCandidate: StageCCandidateAssessment;
    exactStateCandidate: StageCCandidateAssessment;
}>;

export function deriveStageCCarrierRoles(
    input: StageCCarrierRoleDerivationInput
): StageCResult['carrierRoles'] {
    const movementPass = input.sourceBindingsAuthenticated && input.Q_support.nonVacuous &&
        input.Q_support.equalityPairCount === STAGE_C_EXPECTED.qSupportEqualityPairCount &&
        input.Q_support.counterexampleCount === 0;
    const admissibilityPass = input.sourceBindingsAuthenticated && input.Q_command.nonVacuous &&
        input.Q_command.equalityPairCount === STAGE_C_EXPECTED.qCommandEqualityPairCount &&
        input.Q_command.counterexampleCount === 0 &&
        input.Q_command.continuationSupportCounterexampleCount ===
            STAGE_C_EXPECTED.qCommandContinuationCounterexampleCount;
    const routePass = input.sourceBindingsAuthenticated &&
        input.pairCount === STAGE_C_EXPECTED.pairCount &&
        input.allReconstructedRoutePairsDiffer && input.routeHistoryCandidate !== undefined &&
        input.routeHistoryCandidate.groupCount === STAGE_C_EXPECTED.endpointCount &&
        input.routeHistoryCandidate.equalityPairCount === 0 &&
        !input.routeHistoryCandidate.nonVacuous;
    const revisionPass = input.sourceBindingsAuthenticated && input.revisionCandidate.nonVacuous &&
        input.revisionCandidate.groupCount === input.Q_support.groupCount &&
        input.revisionCandidate.equalityPairCount === input.Q_support.equalityPairCount &&
        input.revisionCandidate.partitionIdentityDigest === input.Q_support.partitionIdentityDigest &&
        input.revisionCandidate.counterexampleCount === 0;
    const exactStatePass = input.sourceBindingsAuthenticated &&
        input.exactStateCandidate.nonVacuous && input.exactStateCandidate.groupCount === 27 &&
        input.exactStateCandidate.equalityPairCount === 3_282 &&
        input.exactStateCandidate.counterexampleCount === 0;
    return [
        {
            field: 'movementRemaining',
            primaryRole: movementPass ? 'live_carrier' : 'unresolved',
            boundedFinding: movementPass
                ? 'Pre-command movementRemaining added to the thin projection is sufficient for the complete registered one-command target on this finite domain.'
                : 'The non-vacuous Q_support implication did not pass exactly.',
            promotionGuard: 'Target-relative and nonunique; public formation and recursive closure remain unresolved.'
        },
        {
            field: 'move admissibility',
            primaryRole: admissibilityPass ? 'target_relative_support' : 'unresolved',
            boundedFinding: admissibilityPass
                ? 'Next-move admissibility added to the thin projection preserves command semantics but leaves fourteen continuation-support splits.'
                : 'The command-semantic implication or retained continuation split did not pass exactly.',
            promotionGuard: 'It is not a carrier for exact post-command movementRemaining.'
        },
        {
            field: 'route history',
            primaryRole: routePass ? 'provenance' : 'unresolved',
            boundedFinding: routePass
                ? 'Exact route history recovers endpoint provenance but makes equality testing vacuous.'
                : 'The full reconstructed pair domain did not establish distinct retained route histories.',
            promotionGuard: 'A singleton key cannot establish a useful or minimal live carrier.'
        },
        {
            field: 'revision',
            primaryRole: revisionPass ? 'provenance' : 'unresolved',
            boundedFinding: revisionPass
                ? 'Revision is co-formed with depth and budget on this finite domain.'
                : 'The revision proxy did not reproduce the finite Q_support partition and target implication.',
            promotionGuard: 'Finite proxy agreement does not establish semantic carrier status or causation.'
        },
        {
            field: 'exact state digest',
            primaryRole: exactStatePass ? 're_entry_support' : 'unresolved',
            boundedFinding: exactStatePass
                ? 'Exact state digests authenticate re-entry and retained result identity.'
                : 'Authenticated, non-vacuous exact-state re-entry support was not established.',
            promotionGuard: 'The over-thick digest is not licensed as a live or minimal continuation carrier.'
        }
    ];
}

export function deriveStageCStateMaterialSeparation(
    source: StageCResult['source'],
    roles: StageCResult['carrierRoles']
): StageCResult['stateMaterialSeparation'] {
    const roleMap = Object.fromEntries(roles.map((row) => [row.field, row.primaryRole]));
    const expectedBindingsDigest = sha256Digest(
        STAGE_C_EXPECTED_SOURCE_BINDINGS.map((binding) => deepSortJson(binding))
    );
    const predecessorPass = source.predecessorBindingCount === 15 &&
        source.predecessorBindingsDigest === expectedBindingsDigest;
    const domainPass = roleMap['route history'] === 'provenance' && roleMap.revision === 'provenance';
    const reentryPass = roleMap['exact state digest'] === 're_entry_support';
    const budgetPass = roleMap.movementRemaining === 'live_carrier';
    return {
        auditPredecessorProvenance: {
            status: predecessorPass ? 'authenticated' : 'unresolved',
            bindingCount: source.predecessorBindingCount,
            bindingsDigest: source.predecessorBindingsDigest,
            includes: STAGE_C_EXPECTED_SOURCE_BINDINGS.map((binding) => binding.id)
        },
        domainTransitionProvenance: {
            status: domainPass ? 'route_history_and_revision_only' : 'unresolved',
            routeHistoryRole: roleMap['route history'] ?? 'unresolved',
            revisionRole: roleMap.revision ?? 'unresolved'
        },
        reEntryMaterial: {
            status: reentryPass ? 'exact_state_digest_only' : 'unresolved',
            exactStateDigestRole: roleMap['exact state digest'] ?? 'unresolved'
        },
        liveRecursiveState: {
            status: 'absent_not_established',
            recursiveContinuationClosure: false
        },
        preCommandBudget: {
            status: budgetPass ? 'bounded_one_command_live_carrier' : 'unresolved',
            role: roleMap.movementRemaining ?? 'unresolved',
            recursiveState: false
        }
    };
}

export function stageCStateMaterialSeparationPass(
    value: StageCResult['stateMaterialSeparation'],
    sourceBindingsAuthenticated: boolean,
    roles: StageCResult['carrierRoles']
): boolean {
    const roleMap = Object.fromEntries(roles.map((row) => [row.field, row.primaryRole]));
    const expectedBindingsDigest = sha256Digest(
        STAGE_C_EXPECTED_SOURCE_BINDINGS.map((binding) => deepSortJson(binding))
    );
    return sourceBindingsAuthenticated &&
        value.auditPredecessorProvenance.status === 'authenticated' &&
        value.auditPredecessorProvenance.bindingCount === STAGE_C_EXPECTED_SOURCE_BINDINGS.length &&
        value.auditPredecessorProvenance.bindingsDigest === expectedBindingsDigest &&
        exact(
            value.auditPredecessorProvenance.includes,
            STAGE_C_EXPECTED_SOURCE_BINDINGS.map((binding) => binding.id)
        ) &&
        value.domainTransitionProvenance.status === 'route_history_and_revision_only' &&
        value.domainTransitionProvenance.routeHistoryRole === 'provenance' &&
        value.domainTransitionProvenance.revisionRole === 'provenance' &&
        roleMap['route history'] === 'provenance' && roleMap.revision === 'provenance' &&
        value.reEntryMaterial.status === 'exact_state_digest_only' &&
        value.reEntryMaterial.exactStateDigestRole === 're_entry_support' &&
        roleMap['exact state digest'] === 're_entry_support' &&
        value.liveRecursiveState.status === 'absent_not_established' &&
        value.liveRecursiveState.recursiveContinuationClosure === false &&
        value.preCommandBudget.status === 'bounded_one_command_live_carrier' &&
        value.preCommandBudget.role === 'live_carrier' &&
        value.preCommandBudget.recursiveState === false &&
        roleMap.movementRemaining === 'live_carrier';
}

const STAGE_C_RESIDUE = Object.freeze([
    'longer-horizon behavior of thin-plus-budget equality classes',
    'other seeds, route families, commands, aim/fire, and tick horizons',
    'public formation from declared player-visible inputs and support',
    'global minimality and alternative carrier comparison',
    'credible player response, timing, gameplay authority, and ProductAuthority'
]);

export type StageCChartDerivationInput = Readonly<{
    thinOnly: StageCCandidateAssessment;
    Q_support: StageCCandidateAssessment;
    Q_command: StageCCandidateAssessment & { continuationSupportCounterexampleCount: number };
    admissibilityOnly: StageCCandidateAssessment;
    routeHistory: StageCCandidateAssessment;
    revisionProxy: StageCCandidateAssessment;
    exactState: StageCCandidateAssessment;
    sourceBindingsAuthenticated: boolean;
    stateMaterialSeparation: StageCResult['stateMaterialSeparation'];
    roles: StageCResult['carrierRoles'];
    tauReturn: StageCResult['tauReturn'];
    residue?: readonly string[];
    reviewDisposition?: 'pending' | 'reviewed_bounded' | 'not_admitted';
}>;

export function deriveStageCChartRevision(
    input: StageCChartDerivationInput
): StageCResult['chartRevision'] {
    const stateMaterialPass = stageCStateMaterialSeparationPass(
        input.stateMaterialSeparation,
        input.sourceBindingsAuthenticated,
        input.roles
    );
    const qSupportPass = stateMaterialPass && input.Q_support.nonVacuous &&
        input.Q_support.groupCount === 17 &&
        input.Q_support.equalityPairCount === 6_265 && input.Q_support.counterexampleCount === 0;
    const qCommandPass = stateMaterialPass && input.Q_command.nonVacuous &&
        input.Q_command.groupCount === 14 && input.Q_command.equalityPairCount === 6_279 &&
        input.Q_command.counterexampleCount === 0 &&
        input.Q_command.continuationSupportCounterexampleCount === 14;
    const thinOnlyFailureWitness = stateMaterialPass && input.thinOnly.nonVacuous &&
        input.thinOnly.groupCount === 9 && input.thinOnly.equalityPairCount === 7_378 &&
        input.thinOnly.counterexampleCount === 1_113;
    const admissibilityOnlyFailureWitness = stateMaterialPass && input.admissibilityOnly.nonVacuous &&
        input.admissibilityOnly.groupCount === 2 &&
        input.admissibilityOnly.equalityPairCount === 32_556 &&
        input.admissibilityOnly.counterexampleCount === 130;
    const routeHistoryVacuityWitness = stateMaterialPass && input.routeHistory.groupCount === 274 &&
        input.routeHistory.equalityPairCount === 0 && !input.routeHistory.nonVacuous;
    const revisionCoformationWitness = stateMaterialPass && input.revisionProxy.nonVacuous &&
        input.revisionProxy.groupCount === input.Q_support.groupCount &&
        input.revisionProxy.equalityPairCount === input.Q_support.equalityPairCount &&
        input.revisionProxy.partitionIdentityDigest === input.Q_support.partitionIdentityDigest &&
        input.revisionProxy.counterexampleCount === 0;
    const exactStateReentryWitness = stateMaterialPass && input.sourceBindingsAuthenticated &&
        input.exactState.nonVacuous && input.exactState.groupCount === 27 &&
        input.exactState.equalityPairCount === 3_282 && input.exactState.counterexampleCount === 0;
    const strengthenedRoutes: StageCResult['chartRevision']['strengthenedRoutes'] = [];
    const demotedRoutes: StageCResult['chartRevision']['demotedRoutes'] = [];
    if (stateMaterialPass &&
        input.tauReturn.status === 'licensed_for_bounded_stage_c_reentry_only') {
        strengthenedRoutes.push({
            routeId: 'TAU-WPV4-RETURN-01A',
            status: 'strengthened_to_bounded_reentry_route',
            basis: 'Every derived Tau return obligation passed; the route remains bounded to Stage C re-entry.'
        });
    } else {
        demotedRoutes.push({
            routeId: 'TAU-WPV4-RETURN-01A',
            status: 'candidate_unlicensed',
            basis: 'At least one derived Stage C return obligation failed.'
        });
    }
    if (qSupportPass) {
        strengthenedRoutes.push({
            routeId: 'Q_SUPPORT_THIN_PLUS_PRE_COMMAND_MOVEMENT_REMAINING',
            status: input.Q_support.verdict,
            basis: `${input.Q_support.equalityPairCount} non-vacuous equality pairs and ${input.Q_support.counterexampleCount} complete-target counterexamples.`
        });
    } else {
        demotedRoutes.push({
            routeId: 'Q_SUPPORT_THIN_PLUS_PRE_COMMAND_MOVEMENT_REMAINING',
            status: 'unresolved',
            basis: 'The non-vacuous complete-target implication did not pass.'
        });
    }
    if (qCommandPass) {
        strengthenedRoutes.push({
            routeId: 'Q_COMMAND_THIN_PLUS_NEXT_MOVE_ADMISSIBILITY_COMMAND_SEMANTIC_SUBTARGET',
            status: input.Q_command.verdict,
            basis: `Command semantics close, while ${input.Q_command.continuationSupportCounterexampleCount} exact movementRemaining splits remain.`
        });
    } else {
        demotedRoutes.push({
            routeId: 'Q_COMMAND_THIN_PLUS_NEXT_MOVE_ADMISSIBILITY_COMMAND_SEMANTIC_SUBTARGET',
            status: 'unresolved',
            basis: 'The command-semantic implication or retained continuation residue did not pass.'
        });
    }
    demotedRoutes.push({
        routeId: 'Q_COMMAND_THIN_PLUS_NEXT_MOVE_ADMISSIBILITY_COMPLETE_K_TARGET',
        status: qCommandPass
            ? 'demoted_insufficient_for_complete_continuation_support_target'
            : 'unresolved',
        basis: qCommandPass
            ? 'Fourteen retained post-command movementRemaining counterexamples block complete K_target sufficiency.'
            : 'The exact command-subtarget/continuation split was not reconstructed.'
    });
    demotedRoutes.push(
        {
            routeId: 'THIN_VISIBLE_DUEL_ONLY',
            status: thinOnlyFailureWitness
                ? 'demoted_insufficient_for_registered_target'
                : 'unresolved',
            basis: thinOnlyFailureWitness
                ? `${input.thinOnly.counterexampleCount} target-relevant alias pairs remain.`
                : 'The exact thin-only failure witness did not reconstruct.'
        },
        {
            routeId: 'NEXT_MOVE_ADMISSIBILITY_ONLY',
            status: admissibilityOnlyFailureWitness
                ? 'demoted_without_thin_source_context'
                : 'unresolved',
            basis: admissibilityOnlyFailureWitness
                ? 'Admissibility alone does not preserve complete command semantics.'
                : 'The exact admissibility-only failure witness did not reconstruct.'
        },
        {
            routeId: 'EXACT_ROUTE_HISTORY_AS_LIVE_CARRIER',
            status: routeHistoryVacuityWitness ? 'demoted_vacuous' : 'unresolved',
            basis: routeHistoryVacuityWitness
                ? 'Exact route histories produce no equality pairs.'
                : 'The exact route-history singleton partition did not reconstruct.'
        },
        {
            routeId: 'REVISION_AS_SEMANTIC_CARRIER',
            status: revisionCoformationWitness ? 'demoted_coformed_proxy' : 'unresolved',
            basis: revisionCoformationWitness
                ? 'Revision induces the exact Q_support partition but has no independent semantic witness.'
                : 'Revision did not reproduce the exact Q_support equivalence partition.'
        },
        {
            routeId: 'EXACT_STATE_DIGEST_AS_LIVE_CARRIER',
            status: exactStateReentryWitness ? 'demoted_overthick_reentry_only' : 'unresolved',
            basis: exactStateReentryWitness
                ? 'Exact state identity is useful for recovery but not a target-minimal public carrier.'
                : 'Exact-state re-entry support did not pass its authenticated finite controls.'
        }
    );
    const residue = input.residue ?? STAGE_C_RESIDUE;
    const successorSupported = input.tauReturn.semanticObligationsPass && stateMaterialPass &&
        input.reviewDisposition !== 'not_admitted' && exact(residue, STAGE_C_RESIDUE) && qSupportPass;
    return {
        revisionId: 'WP-015D2R:stage-c-chart-revision:v1',
        status: !stateMaterialPass || input.reviewDisposition === 'not_admitted'
            ? 'not_accepted'
            : input.tauReturn.status === 'licensed_for_bounded_stage_c_reentry_only'
            ? 'reviewed_bounded'
            : input.tauReturn.semanticObligationsPass
                ? 'candidate_revision_pending_review'
                : 'not_accepted',
        strengthenedRoutes,
        demotedRoutes,
        splitCarrierRoles: input.roles.map((row) => ({
            coordinate: row.field,
            role: stateMaterialPass ? row.primaryRole : 'unresolved',
            scope: stateMaterialPass
                ? row.boundedFinding
                : 'State-material separation failed; this chart role is withdrawn.'
        })),
        shoalsAndDeadEnds: [
            'Route depth, pre-command movementRemaining, revision, and admissibility are perfectly co-formed at the observed depth strata.',
            'The thin cut remains intentionally incomplete even though the registered finite audit is complete.',
            'Public/player formation is unwitnessed and player observation/timing stays closed.',
            'Exact route and state identities can overfit by collapsing useful equality classes.',
            'One-command closure does not imply recursive continuation closure.',
            stateMaterialPass
                ? 'Audit predecessor provenance, domain-transition provenance, re-entry material, and bounded live carrier state remain distinct; live recursive state is absent.'
                : 'State-material role separation is unresolved; no re-entry or successor route may be accepted.'
        ],
        residueCarriedForward: [...residue],
        recommendedNextTransition: successorSupported
            ? {
                transitionId: 'TAU-WPV4-QSUPPORT-LONGER-HORIZON-01',
                status: 'recommended_for_separate_preregistration_only',
                derivedFromResidue:
                    'Test whether the returned thin-plus-pre-command-budget carrier remains sufficient at a separately bounded longer command horizon.',
                executionOpened: false
            }
            : null,
        explicitStop: successorSupported
            ? null
            : input.reviewDisposition === 'not_admitted'
                ? 'No successor recommendation is licensed because the durable navigator review did not admit re-entry.'
                : 'No successor recommendation is licensed because semantic readiness or exact residue retention failed.'
    };
}

export type StageCTauDerivationInput = Readonly<{
    source: StageCResult['source'];
    fixedFrame: StageCResult['fixedFrame'];
    reconstruction: StageCResult['reconstruction'];
    thinOnly: StageCCandidateAssessment;
    Q_support: StageCCandidateAssessment;
    Q_command: StageCCandidateAssessment & { continuationSupportCounterexampleCount: number };
    coformation: StageCResult['routeDepthMovementBudgetCoformation'];
    protectedCore: StageCResult['protectedCoreRecovery'];
    witnessReturn: StageCResult['witnessReturn'];
    roles: StageCResult['carrierRoles'];
    stateMaterialSeparation: StageCResult['stateMaterialSeparation'];
    governance: StageCResult['governance'];
    residue: readonly string[];
    durableReview?: Readonly<{
        resultCommit: string;
        resultIdentity: SourceIdentityRow & { semanticDigest: string };
        reportIdentity: SourceIdentityRow & { parityDigest: string };
        sourceToResultRange: StageCRangeAudit;
        entryToResultRange: StageCRangeAudit;
        committedResultCanonicalDigest: string;
        reconstructedResultCanonicalDigest: string;
        expectedResultSemanticDigest: string;
        expectedResultParityDigest: string;
        committedReportSha256: string;
        renderedReportSha256: string;
        pilotBoundIdentities: StageCPilotBoundIdentities;
        pilotSynthesis: StageCPostResultPilotSynthesis;
    }>;
}>;

export function deriveStageCWitnessPayloads(
    input: Pick<StageCTauDerivationInput,
        'source' | 'reconstruction' | 'thinOnly' | 'Q_support' | 'Q_command' |
        'coformation' | 'protectedCore' | 'roles'> & { fixedFrame: StageCResult['fixedFrame'] }
        & { stateMaterialSeparation: StageCResult['stateMaterialSeparation'] }
): Pick<StageCResult['witnessReturn'], 'W' | 'Omega_W' | 'P_W' | 'N_W' |
    'J_W_boundary' | 'candidateCarrierSufficiency'> {
    const stateMaterialSeparationDigest = sha256Digest(input.stateMaterialSeparation);
    const stateMaterialPass = stageCStateMaterialSeparationPass(
        input.stateMaterialSeparation,
        input.source.predecessorBindingCount === STAGE_C_EXPECTED_SOURCE_BINDINGS.length,
        input.roles
    );
    const qSupportNonunique = stateMaterialPass && input.Q_support.nonVacuous &&
        input.Q_support.groupCount === 17 && input.Q_support.equalityPairCount === 6_265 &&
        input.Q_support.counterexampleCount === 0 &&
        input.stateMaterialSeparation.domainTransitionProvenance.status ===
            'route_history_and_revision_only' &&
        input.stateMaterialSeparation.domainTransitionProvenance.revisionRole === 'provenance';
    const candidateCarrierSufficiency = qSupportNonunique &&
        input.Q_support.groupCount === 17 && input.Q_support.equalityPairCount === 6_265 &&
        input.Q_support.counterexampleCount === 0 && input.Q_command.nonVacuous &&
        input.Q_command.groupCount === 14 && input.Q_command.equalityPairCount === 6_279 &&
        input.Q_command.counterexampleCount === 0 &&
        input.Q_command.continuationSupportCounterexampleCount === 14
        ? 'sufficient_for_complete_registered_one_command_target_on_finite_domain_nonunique'
        : 'unresolved';
    return {
        candidateCarrierSufficiency,
        W: deepSortJson({
            kind: 'durable_stage_b_execution_witness_reconstructed_in_stage_c',
            sourceCommit: STAGE_B_EXECUTION_SOURCE_COMMIT,
            resultCommit: STAGE_B_RESULT_COMMIT,
            terminalEvidenceCommit: STAGE_B_TERMINAL_EVIDENCE_COMMIT,
            resultDigest: STAGE_B_RESULT_DIGEST,
            endpointCount: input.reconstruction.endpointCount,
            endpointIdentityDigest: input.reconstruction.endpointIdentityDigest,
            endpointRowsMatchCount: input.reconstruction.endpointRowsMatchCount,
            pairCount: input.reconstruction.pairCount,
            pairIdentityDigest: input.reconstruction.pairIdentityDigest,
            predecessorPairRowsMatchCount: input.reconstruction.predecessorPairRowsMatchCount,
            targetRelevantPairCount: input.reconstruction.targetRelevantPairCount,
            witnessPairIdentityDigest: input.reconstruction.targetRelevantPairIdentityDigest,
            stateMaterialSeparationDigest
        }) as Record<string, JsonValue>,
        Omega_W: deepSortJson({
            fixedFrame: input.fixedFrame,
            stateMaterialSeparationDigest
        }) as Record<string, JsonValue>,
        P_W: deepSortJson({
            sourceBindingCount: input.source.predecessorBindingCount,
            exactReconstruction: {
                endpoints: input.reconstruction.endpointCount,
                endpointRowsMatch: input.reconstruction.endpointRowsMatchCount,
                endpointIdentityDigest: input.reconstruction.endpointIdentityDigest,
                sourceClasses: input.reconstruction.sourceClassCount,
                aliasedClasses: input.reconstruction.aliasedClassCount,
                pairs: input.reconstruction.pairCount,
                pairRowsMatch: input.reconstruction.predecessorPairRowsMatchCount,
                pairIdentityDigest: input.reconstruction.pairIdentityDigest,
                primaryOutcomeCounts: input.reconstruction.primaryOutcomeCounts,
                crossTabRowCount: input.reconstruction.crossTab.length,
                crossTabDigest: input.reconstruction.crossTabDigest
            },
            targetConstraints: {
                targetRelevantPairs: input.reconstruction.targetRelevantPairCount,
                unequalPreCommandMovementRemaining:
                    input.reconstruction.targetRelevantUnequalPreCommandMovementRemainingCount,
                equalPreCommandMovementRemaining:
                    input.reconstruction.targetRelevantEqualPreCommandMovementRemainingCount,
                sameDepth: input.reconstruction.targetRelevantSameDepthCount
            },
            qSupport: {
                equalityPairCount: input.Q_support.equalityPairCount,
                completeTargetCounterexampleCount: input.Q_support.counterexampleCount,
                partitionIdentityDigest: input.Q_support.partitionIdentityDigest
            },
            qCommand: {
                equalityPairCount: input.Q_command.equalityPairCount,
                commandSemanticCounterexampleCount: input.Q_command.counterexampleCount,
                continuationSupportCounterexampleCount:
                    input.Q_command.continuationSupportCounterexampleCount,
                partitionIdentityDigest: input.Q_command.partitionIdentityDigest
            },
            d2qProtectedCoreRecovered: stageCD2QProtectedCorePass(input.protectedCore),
            stateMaterialSeparation: input.stateMaterialSeparation,
            stateMaterialSeparationDigest
        }) as Record<string, JsonValue>,
        N_W: deepSortJson({
            thinOnlyCompleteTargetCounterexampleCount: input.thinOnly.counterexampleCount,
            qCommandContinuationSupportCounterexampleCount:
                input.Q_command.continuationSupportCounterexampleCount,
            sameDepthTargetRelevantPairCount:
                input.reconstruction.targetRelevantSameDepthCount,
            equalPreBudgetTargetRelevantPairCount:
                input.reconstruction.targetRelevantEqualPreCommandMovementRemainingCount,
            evidenceClass: 'correlated_reuse',
            qSupportNonunique,
            routeDepthBudgetAdmissibilityRevisionCovariance: input.coformation.rows,
            covarianceInterpretation: input.coformation.interpretation,
            stateMaterialSeparation: input.stateMaterialSeparation,
            stateMaterialSeparationDigest,
            unresolvedOutsideBoundary: [
                'longer horizons and recursive continuation',
                'other seeds, routes, commands, aim/fire, and tick progression',
                'player-public observation, formation, and timing',
                'causation, global minimality, mathematical placement, and ProductAuthority'
            ]
        }) as Record<string, JsonValue>,
        J_W_boundary: {
            auditTarget: 'complete_for_bounded_registered_one_command_audit',
            stateMaterialSeparationDigest,
            liveRecursiveState: 'absent_not_established',
            recursiveContinuationClosure: false
        }
    };
}

function embeddedRangePass(
    range: StageCRangeAudit,
    baseCommit: string,
    resultCommit: string,
    expectedPaths: readonly string[]
): boolean {
    try {
        const sortedExpected = [...expectedPaths].sort(compareCanonicalText);
        if (range.baseCommit !== baseCommit || range.resultCommit !== resultCommit ||
            !exact([...range.allowedPaths].sort(compareCanonicalText), sortedExpected) ||
            !exact(range.endpointRows.map((row) => row.path), sortedExpected)) return false;
        validateStageCChangeRows(range.endpointRows, expectedPaths, 'endpoint');
        let prior = baseCommit;
        for (const commit of range.commits) {
            if (commit.parent !== prior) return false;
            validateStageCChangeRows(commit.rows, expectedPaths, 'intermediate');
            prior = commit.commit;
        }
        if (prior !== resultCommit) return false;
        const unsigned = {
            baseCommit: range.baseCommit,
            resultCommit: range.resultCommit,
            allowedPaths: range.allowedPaths,
            commits: range.commits,
            endpointRows: range.endpointRows
        };
        return range.rangeDigest === sha256Digest(unsigned);
    } catch {
        return false;
    }
}

function exactRegularIdentity(identity: SourceIdentityRow, expectedPath: string): boolean {
    return identity.path === expectedPath && identity.mode === '100644' &&
        /^[0-9a-f]{40}$/.test(identity.blob) &&
        identity.blob !== '0000000000000000000000000000000000000000' &&
        /^[0-9a-f]{64}$/.test(identity.sha256);
}

function closedStageCGovernance(governance: StageCResult['governance']): boolean {
    return governance.pilotActivation === 'required' && governance.productAuthority === 'none' &&
        governance.mathematicalPlacementImplication === 'none' &&
        governance.playerObservationTiming === 'closed' && governance.gameplayChange === false &&
        governance.p5 === 'closed' && governance.successorWorldExecution === 'closed' &&
        governance.globalMinimalityClaim === false && governance.allSeedClosureClaim === false &&
        governance.recursiveContinuationClosureClaim === false &&
        governance.causalRouteDepthClaim === false && governance.landfallClaim === false;
}

export function stageCD2QProtectedCorePass(
    core: StageCResult['protectedCoreRecovery']
): boolean {
    const expectedCases = expectedStageCD2QCaseReadouts();
    const expectedControls = expectedStageCD2QAblationControls();
    const decodedCaseValuesPass = core.caseReadouts.every((row) => {
        const eventsDigestDerived = row.eventsDigest === sha256Digest(row.authoritativeEvents);
        const unchangedRejectionDerived = row.unchangedRejection ===
            (!row.accepted && !row.mutated && row.authoritativeEvents.length === 0 &&
                row.preStateDigest === row.postStateDigest);
        return eventsDigestDerived && unchangedRejectionDerived && row.inputUnchanged &&
            row.evidenceClass === 'correlated_reuse' &&
            row.mathematicalPlacementImplication === 'none' &&
            row.reopeningCondition === D2Q_REOPENING_CONDITION &&
            row.sourceReadoutMatches && row.verdict === 'matched_source_prediction';
    });
    const ablationValuesPass = core.ablationControls.every((row) =>
        row.sourceFactsPass && row.actuallyOmitted && row.restorationRecovers &&
        row.evidenceClass === 'correlated_reuse' &&
        row.mathematicalPlacementImplication === 'none' &&
        row.reopeningCondition === D2Q_REOPENING_CONDITION &&
        exact(row.fullClasses, row.restoredClasses) &&
        row.primaryControl.restorationRecovers &&
        row.primaryControl.reopeningCondition === D2Q_REOPENING_CONDITION &&
        Object.keys(row.frameChecks).length === 7 && Object.values(row.frameChecks).every(Boolean) &&
        row.derivedVerdict === 'target_relevant_on_declared_V4_command_gate');
    return core.status === 'recovered_from_immutable_provenance_without_replay' &&
        core.d2qSourceCommit === D2Q_SOURCE_COMMIT &&
        core.d2qResultDigest === D2Q_RESULT_DIGEST && core.d2qReturnBlob === D2Q_RETURN_BLOB &&
        core.caseRowsCanonicalDigest === D2Q_CASE_ROWS_CANONICAL_DIGEST &&
        core.ablationRowsCanonicalDigest === D2Q_ABLATION_ROWS_CANONICAL_DIGEST &&
        exact(core.caseIds, expectedCases.map((row) => row.caseId)) &&
        decodedCaseValuesPass && exact(core.caseReadouts, expectedCases) &&
        exact(core.fieldVerdicts, {
            actor: 'target_relevant_on_declared_V4_command_gate',
            expectedTurn: 'target_relevant_on_declared_V4_command_gate'
        }) && core.ablationControls.length === 2 && ablationValuesPass &&
        exact(core.ablationControls, expectedControls) &&
        core.matchedSourcePredictionCount === 4 &&
        core.conditionalActorTurnScopePreserved;
}

export function deriveStageCTauReturn(input: StageCTauDerivationInput): StageCResult['tauReturn'] {
    const sourceRangeExact = exact(
        input.source.sourceRange.endpointRows.map((row) => row.path),
        [...STAGE_C_SOURCE_OUTPUTS].sort(compareCanonicalText)
    );
    const witnessBoundary = {
        executionWitness: input.witnessReturn.executionWitness,
        evidenceClass: input.witnessReturn.evidenceClass,
        W_status: input.witnessReturn.W_status,
        Omega_W_status: input.witnessReturn.Omega_W_status,
        P_W_status: input.witnessReturn.P_W_status,
        N_W_status: input.witnessReturn.N_W_status,
        J_W: input.witnessReturn.J_W,
        J_W_boundary: input.witnessReturn.J_W_boundary,
        thinCutCompleteness: input.witnessReturn.thinCutCompleteness,
        auditEvidenceCompleteness: input.witnessReturn.auditEvidenceCompleteness
    };
    const expectedWitness = deriveStageCWitnessPayloads({
        source: input.source,
        reconstruction: input.reconstruction,
        thinOnly: input.thinOnly,
        Q_support: input.Q_support,
        Q_command: input.Q_command,
        coformation: input.coformation,
        protectedCore: input.protectedCore,
        fixedFrame: input.fixedFrame,
        roles: input.roles,
        stateMaterialSeparation: input.stateMaterialSeparation
    });
    const negativeWitnessPass = input.witnessReturn.N_W_status === 'observed' &&
        exact(input.witnessReturn.N_W, expectedWitness.N_W);
    const witnessPass = exact(witnessBoundary, {
        executionWitness: 'present',
        evidenceClass: 'correlated_reuse',
        W_status: 'present',
        Omega_W_status: 'evaluated_exact',
        P_W_status: 'observed',
        N_W_status: 'observed',
        J_W: 'complete_for_bounded_registered_one_command_audit',
        J_W_boundary: expectedWitness.J_W_boundary,
        thinCutCompleteness: 'intentionally_incomplete',
        auditEvidenceCompleteness: 'complete_for_registered_finite_domain'
    }) && input.witnessReturn.candidateCarrierSufficiency ===
        expectedWitness.candidateCarrierSufficiency &&
        exact(input.witnessReturn.W, expectedWitness.W) &&
        exact(input.witnessReturn.Omega_W, expectedWitness.Omega_W) &&
        exact(input.witnessReturn.P_W, expectedWitness.P_W) && negativeWitnessPass;
    const roleMap = Object.fromEntries(input.roles.map((row) => [row.field, row.primaryRole]));
    const rolePass = exact(roleMap, {
        movementRemaining: 'live_carrier',
        'move admissibility': 'target_relative_support',
        'route history': 'provenance',
        revision: 'provenance',
        'exact state digest': 're_entry_support'
    });
    const governancePass = closedStageCGovernance(input.governance);
    const residuePass = exact(input.residue, STAGE_C_RESIDUE);
    const stateMaterialPass = exact(
        input.stateMaterialSeparation,
        deriveStageCStateMaterialSeparation(input.source, input.roles)
    ) && input.stateMaterialSeparation.auditPredecessorProvenance.status === 'authenticated' &&
        input.stateMaterialSeparation.domainTransitionProvenance.status ===
            'route_history_and_revision_only' &&
        input.stateMaterialSeparation.reEntryMaterial.status === 'exact_state_digest_only' &&
        input.stateMaterialSeparation.liveRecursiveState.status === 'absent_not_established' &&
        input.stateMaterialSeparation.preCommandBudget.status ===
            'bounded_one_command_live_carrier' &&
        input.stateMaterialSeparation.preCommandBudget.recursiveState === false;
    const semanticObligations = [
        {
            obligationId: 'AUTHENTICATE_EXACT_SOURCE_BINDINGS',
            passed: input.source.predecessorBindingCount === 15 && sourceRangeExact,
            evidenceDigest: sha256Digest({
                count: input.source.predecessorBindingCount,
                digest: input.source.predecessorBindingsDigest,
                sourceRange: input.source.sourceRange.rangeDigest
            })
        },
        {
            obligationId: 'INDEPENDENT_EXACT_RECONSTRUCTION',
            passed:
                input.reconstruction.implementationClass === 'reconstruction_independent' &&
                input.reconstruction.endpointRowsMatchCount === STAGE_C_EXPECTED.endpointCount &&
                input.reconstruction.pairCount === STAGE_C_EXPECTED.pairCount &&
                input.reconstruction.predecessorPairRowsMatchCount === STAGE_C_EXPECTED.pairCount &&
                input.reconstruction.predecessorCrossTabMatches,
            evidenceDigest: input.reconstruction.reconstructedPairRowsDigest
        },
        {
            obligationId: 'DERIVE_TARGET_RELEVANT_CONSTRAINTS',
            passed:
                input.reconstruction.targetRelevantPairCount === STAGE_C_EXPECTED.targetRelevantPairCount &&
                input.reconstruction.targetRelevantUnequalPreCommandMovementRemainingCount ===
                    STAGE_C_EXPECTED.targetRelevantPairCount &&
                input.reconstruction.targetRelevantEqualPreCommandMovementRemainingCount === 0 &&
                input.reconstruction.targetRelevantSameDepthCount === 0,
            evidenceDigest: sha256Digest({
                targetRelevantPairCount: input.reconstruction.targetRelevantPairCount,
                unequalPreBudget:
                    input.reconstruction.targetRelevantUnequalPreCommandMovementRemainingCount,
                equalPreBudget:
                    input.reconstruction.targetRelevantEqualPreCommandMovementRemainingCount,
                sameDepth: input.reconstruction.targetRelevantSameDepthCount
            })
        },
        {
            obligationId: 'D2Q_PROTECTED_CORE_RECOVERED_WITHOUT_REPLAY',
            passed: stageCD2QProtectedCorePass(input.protectedCore),
            evidenceDigest: sha256Digest(input.protectedCore)
        },
        {
            obligationId: 'PRESERVE_ONE_COMMAND_RESULT_AND_SPLIT_ROLES',
            passed:
                exact(input.reconstruction.primaryOutcomeCounts, STAGE_C_EXPECTED.outcomes) && rolePass,
            evidenceDigest: sha256Digest({
                primaryOutcomeCounts: input.reconstruction.primaryOutcomeCounts,
                roleMap
            })
        },
        {
            obligationId: 'WITNESS_BOUNDARY_REPAIRED',
            passed: witnessPass,
            evidenceDigest: sha256Digest({ witnessBoundary, expectedWitness })
        },
        {
            obligationId: 'STATE_MATERIAL_ROLES_SEPARATED',
            passed: stateMaterialPass,
            evidenceDigest: sha256Digest(input.stateMaterialSeparation)
        },
        {
            obligationId: 'NONVACUOUS_CARRIER_CONTROLS_PASS',
            passed:
                input.Q_support.nonVacuous && input.Q_support.equalityPairCount === 6_265 &&
                input.Q_support.counterexampleCount === 0 && input.Q_command.nonVacuous &&
                input.Q_command.equalityPairCount === 6_279 &&
                input.Q_command.counterexampleCount === 0 &&
                input.Q_command.continuationSupportCounterexampleCount === 14,
            evidenceDigest: sha256Digest({ Q_support: input.Q_support, Q_command: input.Q_command })
        },
        {
            obligationId: 'NEGATIVE_RESIDUE_RETAINED',
            passed: negativeWitnessPass && residuePass,
            evidenceDigest: sha256Digest({ N_W: input.witnessReturn.N_W, residue: input.residue })
        },
        {
            obligationId: 'GOVERNED_OUTPUT_AND_ANTI_PROMOTION_BOUNDARY_PRESERVED',
            passed: governancePass && sourceRangeExact,
            evidenceDigest: sha256Digest({ governance: input.governance, sourceRangeExact })
        }
    ];
    const semanticObligationsPass = semanticObligations.every((obligation) => obligation.passed);
    let pilotSynthesisPass = false;
    if (input.durableReview !== undefined) {
        try {
            const checked = validateStageCPostResultPilotSynthesis(
                input.durableReview.pilotSynthesis,
                input.source.sourceCommit,
                input.durableReview.resultCommit,
                input.durableReview.pilotBoundIdentities
            );
            pilotSynthesisPass = canonicalJson(checked) ===
                canonicalJson(input.durableReview.pilotSynthesis) &&
                stageCPilotSynthesisAdmissionPass(
                    checked,
                    input.source.sourceCommit,
                    input.durableReview.resultCommit,
                    input.durableReview.pilotBoundIdentities
                );
        } catch {
            pilotSynthesisPass = false;
        }
    }
    const durable = input.durableReview;
    const resultIdentityPass = durable !== undefined &&
        exactRegularIdentity(durable.resultIdentity, STAGE_C_RESULT_PATH) &&
        durable.resultIdentity.semanticDigest === durable.expectedResultSemanticDigest;
    const reportIdentityPass = durable !== undefined &&
        exactRegularIdentity(durable.reportIdentity, STAGE_C_REPORT_PATH) &&
        durable.reportIdentity.parityDigest === durable.expectedResultParityDigest &&
        durable.reportIdentity.sha256 === durable.committedReportSha256;
    const sourceToResultRangePass = durable !== undefined && embeddedRangePass(
        durable.sourceToResultRange,
        input.source.sourceCommit,
        durable.resultCommit,
        STAGE_C_RESULT_OUTPUTS
    );
    const entryToResultRangePass = durable !== undefined && embeddedRangePass(
        durable.entryToResultRange,
        STAGE_B_TERMINAL_EVIDENCE_COMMIT,
        durable.resultCommit,
        [...STAGE_C_SOURCE_OUTPUTS, ...STAGE_C_RESULT_OUTPUTS]
    );
    const executableParityPass = durable !== undefined &&
        durable.committedResultCanonicalDigest === durable.reconstructedResultCanonicalDigest;
    const reportParityPass = durable !== undefined &&
        durable.committedReportSha256 === durable.renderedReportSha256;
    const durableReviewObligationPass = resultIdentityPass && reportIdentityPass &&
        sourceToResultRangePass && entryToResultRangePass && executableParityPass &&
        reportParityPass && pilotSynthesisPass && governancePass;
    const durableReviewEvidence = durable === undefined
        ? { status: 'pending_durable_result_review' }
        : {
            resultIdentity: durable.resultIdentity,
            reportIdentity: durable.reportIdentity,
            sourceToResultRangeDigest: durable.sourceToResultRange.rangeDigest,
            entryToResultRangeDigest: durable.entryToResultRange.rangeDigest,
            committedResultCanonicalDigest: durable.committedResultCanonicalDigest,
            reconstructedResultCanonicalDigest: durable.reconstructedResultCanonicalDigest,
            committedReportSha256: durable.committedReportSha256,
            renderedReportSha256: durable.renderedReportSha256,
            pilotBoundIdentities: durable.pilotBoundIdentities,
            pilotSynthesisDigest: sha256Digest(durable.pilotSynthesis),
            derivedChecks: {
                resultIdentityPass,
                reportIdentityPass,
                sourceToResultRangePass,
                entryToResultRangePass,
                executableParityPass,
                reportParityPass,
                pilotSynthesisPass,
                closedGovernancePass: governancePass
            }
        };
    const durableReviewObligation = {
        obligationId: 'DURABLE_RESULT_REVIEW_RANGE_PARITY_AND_PILOT',
        passed: durableReviewObligationPass,
        evidenceDigest: sha256Digest(durableReviewEvidence)
    };
    const obligations = [...semanticObligations, durableReviewObligation];
    const passed = semanticObligationsPass && durableReviewObligationPass;
    return {
        transitionId: 'TAU-WPV4-RETURN-01A',
        obligations,
        semanticObligationsPass,
        durableReviewObligationPass,
        status: passed ? 'licensed_for_bounded_stage_c_reentry_only' : 'candidate_unlicensed',
        licenseScope:
            'Only the source-bound Stage C navigator return over the complete registered finite one-command domain; no gameplay, public formation, ProductAuthority, placement, or successor execution.',
        productAuthority: 'none',
        mathematicalPlacementImplication: 'none'
    };
}

export function expectedStageCResultFixedFrame(): StageCResult['fixedFrame'] {
    return {
        level: 'L4+',
        cutStance: 'post-execution independent reconstruction of thin_visible_duel_v0@2 aliases',
        protectedFamily:
            'immutable D2Q command-gate core plus complete registered Stage B one-command target and explicit residue',
        K_target: {
            id: 'K_WPV4_ONE_COMMAND_COMPLETE_V1',
            commandSemanticReadout: ['accepted', 'mutated', 'error', 'authoritativeEvents'],
            continuationSupportReadout: ['postCommandMovementRemaining'],
            equality: 'exact_canonical_equality',
            finiteDomainOnly: true
        },
        world: 'nimble-knots-artillery-v4 authority evidence retained by Stage B',
        domain: '274 naturally reachable registered endpoints and all 7,378 within-thin-class pairs',
        routes: 'committed retained route histories only; no enumeration or replay in Stage C',
        horizon: 'one registered next move command; zero tick calls',
        support: [
            'committed Stage B endpoint and pair records',
            'exact thin_visible_duel_v0@2 source projection',
            'pre- and post-command movementRemaining',
            'command event/error readout',
            'immutable D2Q and Stage A provenance'
        ],
        tolerance: 0,
        oracleInputBoundary:
            'Only committed Stage B result bytes and immutable provenance enter reconstruction; no authority call, route generation, ignored raw output, or primary Stage B semantic helper.'
    };
}

export function reconstructStageCReturn(
    sourceCommit: string,
    repositoryRoot = STAGE_C_ROOT
): StageCResult {
    verifyStageAReturnBoundary(repositoryRoot);
    const source = buildSourceIdentity(sourceCommit, repositoryRoot);
    const loaded = loadBoundStageBResult(repositoryRoot);
    const endpoints = loaded.result.records.eligibleEndpoints;
    const predecessorPairs = [...loaded.result.records.aliasPairs]
        .sort((left, right) => compareCanonicalText(left.pairId, right.pairId));
    const independentlyReconstructed = reconstructAliasPairs(endpoints);
    const pairs = independentlyReconstructed.pairs;
    const predecessorById = new Map(predecessorPairs.map((pair) => [pair.pairId, pair]));
    assert.equal(predecessorById.size, predecessorPairs.length);
    const predecessorPairRowsMatchCount = pairs.filter((pair) =>
        exact(pair, predecessorById.get(pair.pairId))).length;
    const crossTab = buildStageCCrossTab(pairs);
    const primaryOutcomeCounts = outcomeCounts(pairs);
    const targetRelevant = pairs.filter((pair) => pair.targetRelevant);

    const thinOnly = assessCandidate(
        'THIN_VISIBLE_DUEL_ONLY',
        ['thin_visible_duel_v0@2 projection'],
        'complete registered one-command target',
        endpoints,
        (endpoint) => deepSortJson({ thinProjection: endpoint.sourceProjection.projectedValue }),
        completeRegisteredTarget,
        'sufficient_on_finite_domain',
        'insufficient_for_complete_registered_one_command_target'
    );
    const qSupport = assessCandidate(
        'Q_SUPPORT_THIN_PLUS_PRE_COMMAND_MOVEMENT_REMAINING',
        ['thin_visible_duel_v0@2 projection', 'preCommandMovementRemaining'],
        'complete registered one-command target',
        endpoints,
        (endpoint) => deepSortJson({
            thinProjection: endpoint.sourceProjection.projectedValue,
            preCommandMovementRemaining: endpoint.preCommandMovementRemaining
        }),
        completeRegisteredTarget,
        'sufficient_for_complete_registered_one_command_target_on_finite_domain_nonunique',
        'insufficient_for_complete_registered_one_command_target'
    );
    const qCommandBase = assessCandidate(
        'Q_COMMAND_THIN_PLUS_NEXT_MOVE_ADMISSIBILITY',
        ['thin_visible_duel_v0@2 projection', 'nextMoveAdmissibility'],
        'registered command-semantic target only',
        endpoints,
        (endpoint) => deepSortJson({
            thinProjection: endpoint.sourceProjection.projectedValue,
            nextMoveAdmissibility: nextMoveAdmissibility(endpoint)
        }),
        commandSemanticTarget,
        'sufficient_for_registered_command_semantics_only_not_continuation_support',
        'insufficient_for_registered_command_semantics'
    );
    const qCommandContinuation = enumerateEqualityPairs(
        endpoints,
        (endpoint) => deepSortJson({
            thinProjection: endpoint.sourceProjection.projectedValue,
            nextMoveAdmissibility: nextMoveAdmissibility(endpoint)
        }),
        (endpoint) => endpoint.postCommandMovementRemaining
    );
    const qCommand = {
        ...qCommandBase,
        continuationSupportCounterexampleCount: qCommandContinuation.counterexamplePairIds.length,
        continuationSupportCounterexamplePairIdsDigest:
            sha256Digest(qCommandContinuation.counterexamplePairIds)
    };
    const admissibilityOnly = assessCandidate(
        'NEXT_MOVE_ADMISSIBILITY_ONLY',
        ['nextMoveAdmissibility'],
        'registered command-semantic target only',
        endpoints,
        (endpoint) => nextMoveAdmissibility(endpoint),
        commandSemanticTarget,
        'sufficient_for_registered_command_semantics_only',
        'insufficient_without_thin_source_context'
    );
    const routeHistoryCandidate = assessCandidate(
        'EXACT_ROUTE_HISTORY',
        ['exact retained route history'],
        'complete registered one-command target',
        endpoints,
        (endpoint) => deepSortJson({ directions: endpoint.directions }),
        completeRegisteredTarget,
        'unexpected_nonvacuous_route_partition',
        'vacuous_exact_route_identity'
    );
    const revisionCandidate = assessCandidate(
        'THIN_PLUS_PRE_COMMAND_REVISION_PROXY',
        ['thin_visible_duel_v0@2 projection', 'preCommandRevision'],
        'complete registered one-command target',
        endpoints,
        (endpoint) => deepSortJson({
            thinProjection: endpoint.sourceProjection.projectedValue,
            preCommandRevision: endpoint.preCommandRevision
        }),
        completeRegisteredTarget,
        'finite_proxy_matches_q_support_partition',
        'unresolved_revision_proxy'
    );
    const exactStateCandidate = assessCandidate(
        'THIN_PLUS_PRE_COMMAND_EXACT_STATE_DIGEST',
        ['thin_visible_duel_v0@2 projection', 'preCommandStateDigest'],
        'complete registered one-command target',
        endpoints,
        (endpoint) => deepSortJson({
            thinProjection: endpoint.sourceProjection.projectedValue,
            preCommandStateDigest: endpoint.preCommandStateDigest
        }),
        completeRegisteredTarget,
        'reentry_support_on_authenticated_finite_domain',
        'unresolved_exact_state_reentry_support'
    );

    assert.equal(endpoints.length, STAGE_C_EXPECTED.endpointCount);
    assert.equal(independentlyReconstructed.sourceClassCount, STAGE_C_EXPECTED.sourceClassCount);
    assert.equal(independentlyReconstructed.aliasedClassCount, STAGE_C_EXPECTED.aliasedClassCount);
    assert.equal(pairs.length, STAGE_C_EXPECTED.pairCount);
    assert.deepEqual(primaryOutcomeCounts, STAGE_C_EXPECTED.outcomes);
    assert.equal(targetRelevant.length, STAGE_C_EXPECTED.targetRelevantPairCount);
    assert.equal(predecessorPairRowsMatchCount, STAGE_C_EXPECTED.pairCount);
    assert.equal(qSupport.equalityPairCount, STAGE_C_EXPECTED.qSupportEqualityPairCount);
    assert.equal(qSupport.counterexampleCount, STAGE_C_EXPECTED.qSupportCounterexampleCount);
    assert.equal(qCommand.equalityPairCount, STAGE_C_EXPECTED.qCommandEqualityPairCount);
    assert.equal(qCommand.counterexampleCount, STAGE_C_EXPECTED.qCommandSemanticCounterexampleCount);
    assert.equal(
        qCommand.continuationSupportCounterexampleCount,
        STAGE_C_EXPECTED.qCommandContinuationCounterexampleCount
    );

    const reconstruction: StageCResult['reconstruction'] = {
        implementationClass: 'reconstruction_independent',
        mathematicalEvidenceClass: 'correlated_reuse',
        endpointCount: endpoints.length,
        endpointIdentityDigest:
            sha256Digest(endpoints.map((row) => row.endpointId).sort(compareCanonicalText)),
        endpointRowsMatchCount: endpoints.length,
        sourceClassCount: independentlyReconstructed.sourceClassCount,
        aliasedClassCount: independentlyReconstructed.aliasedClassCount,
        classSummaries: independentlyReconstructed.classSummaries,
        pairCount: pairs.length,
        pairIdentityDigest: sha256Digest(pairs.map((row) => row.pairId)),
        targetRelevantPairIdentityDigest:
            sha256Digest(targetRelevant.map((row) => row.pairId).sort(compareCanonicalText)),
        reconstructedPairRowsDigest: sha256Digest(pairs),
        predecessorPairRowsDigest: sha256Digest(predecessorPairs),
        predecessorPairRowsMatchCount,
        primaryOutcomeCounts,
        targetRelevantPairCount: targetRelevant.length,
        targetRelevantUnequalPreCommandMovementRemainingCount:
            targetRelevant.filter((pair) =>
                pair.preCommandMovementRemainingPair[0] !== pair.preCommandMovementRemainingPair[1]
            ).length,
        targetRelevantEqualPreCommandMovementRemainingCount:
            targetRelevant.filter((pair) =>
                pair.preCommandMovementRemainingPair[0] === pair.preCommandMovementRemainingPair[1]
            ).length,
        targetRelevantSameDepthCount:
            targetRelevant.filter((pair) => pair.leftEndpointDepth === pair.rightEndpointDepth).length,
        crossTab,
        crossTabRowsDigest: sha256Digest(crossTab),
        crossTabDigest: sha256Digest({
            authority: loaded.result.descriptiveCrossTab.authority,
            interpretationGuard: loaded.result.descriptiveCrossTab.interpretationGuard,
            rows: crossTab
        }),
        predecessorCrossTabMatches: exact(crossTab, loaded.result.descriptiveCrossTab.rows)
    };
    assert.equal(reconstruction.targetRelevantUnequalPreCommandMovementRemainingCount, 1_113);
    assert.equal(reconstruction.targetRelevantEqualPreCommandMovementRemainingCount, 0);
    assert.equal(reconstruction.targetRelevantSameDepthCount, 0);
    assert.equal(reconstruction.predecessorCrossTabMatches, true);

    const fixedFrame = expectedStageCResultFixedFrame();
    const coformation = buildCoformation(endpoints, pairs);
    const protectedCoreRecovery = reconstructD2QProtectedCore(repositoryRoot);
    const roles = deriveStageCCarrierRoles({
        pairCount: pairs.length,
        allReconstructedRoutePairsDiffer:
            pairs.every((pair) => pair.equality.routeHistoryEqual === false),
        sourceBindingsAuthenticated: source.predecessorBindingCount === 15,
        Q_support: qSupport,
        Q_command: qCommand,
        routeHistoryCandidate,
        revisionCandidate,
        exactStateCandidate
    });
    const stateMaterialSeparation = deriveStageCStateMaterialSeparation(source, roles);
    const witnessPayloads = deriveStageCWitnessPayloads({
        source,
        reconstruction,
        thinOnly,
        Q_support: qSupport,
        Q_command: qCommand,
        coformation,
        protectedCore: protectedCoreRecovery,
        fixedFrame,
        roles,
        stateMaterialSeparation
    });
    const witnessBeforeAdmission: StageCResult['witnessReturn'] = {
        executionWitness: 'present',
        evidenceClass: 'correlated_reuse',
        navigatorAdmission: 'pending',
        candidateCarrierSufficiency: witnessPayloads.candidateCarrierSufficiency,
        W_status: 'present',
        W: witnessPayloads.W,
        Omega_W_status: 'evaluated_exact',
        Omega_W: witnessPayloads.Omega_W,
        P_W_status: 'observed',
        P_W: witnessPayloads.P_W,
        N_W_status: 'observed',
        N_W: witnessPayloads.N_W,
        J_W: 'complete_for_bounded_registered_one_command_audit',
        J_W_boundary: witnessPayloads.J_W_boundary,
        thinCutCompleteness: 'intentionally_incomplete',
        auditEvidenceCompleteness: 'complete_for_registered_finite_domain'
    };
    const governance: StageCResult['governance'] = {
        pilotActivation: 'required',
        productAuthority: 'none',
        mathematicalPlacementImplication: 'none',
        playerObservationTiming: 'closed',
        gameplayChange: false,
        p5: 'closed',
        successorWorldExecution: 'closed',
        globalMinimalityClaim: false,
        allSeedClosureClaim: false,
        recursiveContinuationClosureClaim: false,
        causalRouteDepthClaim: false,
        landfallClaim: false
    };
    const tauReturn = deriveStageCTauReturn({
        source,
        fixedFrame,
        reconstruction,
        thinOnly,
        Q_support: qSupport,
        Q_command: qCommand,
        coformation,
        protectedCore: protectedCoreRecovery,
        witnessReturn: witnessBeforeAdmission,
        roles,
        stateMaterialSeparation,
        governance,
        residue: STAGE_C_RESIDUE
    });
    const witnessReturn: StageCResult['witnessReturn'] = {
        ...witnessBeforeAdmission,
        navigatorAdmission: tauReturn.status === 'licensed_for_bounded_stage_c_reentry_only'
            ? 'reviewed_bounded'
            : 'pending'
    };
    const chartRevision = deriveStageCChartRevision({
        thinOnly,
        Q_support: qSupport,
        Q_command: qCommand,
        admissibilityOnly,
        routeHistory: routeHistoryCandidate,
        revisionProxy: revisionCandidate,
        exactState: exactStateCandidate,
        sourceBindingsAuthenticated: source.predecessorBindingCount === 15,
        stateMaterialSeparation,
        roles,
        tauReturn,
        residue: STAGE_C_RESIDUE
    });
    const witnessDigest = sha256Digest(witnessReturn);
    const candidateAssessments = {
        thinOnly,
        Q_support: qSupport,
        Q_command: qCommand,
        admissibilityOnly,
        routeHistory: routeHistoryCandidate,
        revisionProxy: revisionCandidate,
        exactState: exactStateCandidate
    };
    const digests: StageCResult['digests'] = {
        sourceDigest: source.sourceDigest,
        predecessorResultDigest: STAGE_B_RESULT_DIGEST as typeof STAGE_B_RESULT_DIGEST,
        reconstructionDigest: sha256Digest({ reconstruction, coformation }),
        witnessDigest,
        carrierDigest: sha256Digest({
            candidateAssessments,
            roles,
            stateMaterialSeparation,
            tauReturn
        }),
        chartDigest: sha256Digest(chartRevision),
        parityDigest: sha256Digest({
            reconstruction: {
                endpointCount: reconstruction.endpointCount,
                sourceClassCount: reconstruction.sourceClassCount,
                aliasedClassCount: reconstruction.aliasedClassCount,
                pairCount: reconstruction.pairCount,
                primaryOutcomeCounts: reconstruction.primaryOutcomeCounts,
                targetRelevantPairCount: reconstruction.targetRelevantPairCount,
                crossTabDigest: reconstruction.crossTabDigest
            },
            candidateAssessments,
            witnessReturn,
            roles,
            stateMaterialSeparation,
            tauReturn,
            chartRevision,
            governance,
            stopStatement: STAGE_C_RESULT_STOP_STATEMENT
        })
    };
    const hardGatesPass =
        reconstruction.endpointCount === STAGE_C_EXPECTED.endpointCount &&
        reconstruction.sourceClassCount === STAGE_C_EXPECTED.sourceClassCount &&
        reconstruction.aliasedClassCount === STAGE_C_EXPECTED.aliasedClassCount &&
        reconstruction.pairCount === STAGE_C_EXPECTED.pairCount &&
        reconstruction.predecessorPairRowsMatchCount === STAGE_C_EXPECTED.pairCount &&
        reconstruction.predecessorCrossTabMatches &&
        reconstruction.targetRelevantEqualPreCommandMovementRemainingCount === 0 &&
        reconstruction.targetRelevantSameDepthCount === 0 &&
        qSupport.nonVacuous && qSupport.counterexampleCount === 0 &&
        qCommand.nonVacuous && qCommand.counterexampleCount === 0 &&
        qCommand.continuationSupportCounterexampleCount === 14 &&
        stageCStateMaterialSeparationPass(
            stateMaterialSeparation,
            source.predecessorBindingCount === 15,
            roles
        ) &&
        tauReturn.semanticObligationsPass && !tauReturn.durableReviewObligationPass &&
        tauReturn.status === 'candidate_unlicensed' &&
        governance.productAuthority === 'none' &&
        governance.mathematicalPlacementImplication === 'none' &&
        governance.successorWorldExecution === 'closed';

    const unsigned: Omit<StageCResult, 'resultDigest'> = {
        schemaVersion: 1,
        resultId: 'wp-015d2r-stage-c-independent-reconstruction-and-chart-revision-v1',
        registrationId: 'WP-015D2R:stage-c-independent-reconstruction-and-chart-revision:v1',
        packageId: 'WP-015D2R',
        supportWorkPackageId: 'WP-015D2U',
        stage: 'stage_c',
        source,
        predecessor: {
            preregistrationSourceCommit: STAGE_B_PREREGISTRATION_SOURCE_COMMIT,
            preregistrationTerminalCommit: STAGE_B_PREREGISTRATION_TERMINAL_COMMIT,
            executionSourceCommit: STAGE_B_EXECUTION_SOURCE_COMMIT,
            resultCommit: STAGE_B_RESULT_COMMIT,
            terminalEvidenceCommit: STAGE_B_TERMINAL_EVIDENCE_COMMIT,
            resultPath: STAGE_B_RESULT_PATH,
            resultBlob: STAGE_B_RESULT_BLOB,
            resultGitByteSha256: loaded.gitByteSha256,
            resultDigest: STAGE_B_RESULT_DIGEST,
            evidenceClass: 'correlated_reuse'
        },
        fixedFrame,
        reconstruction,
        candidateAssessments,
        routeDepthMovementBudgetCoformation: coformation,
        witnessReturn,
        protectedCoreRecovery,
        carrierRoles: roles,
        stateMaterialSeparation,
        tauReturn,
        chartRevision,
        governance,
        digests,
        semanticReconstructionReadiness:
            hardGatesPass ? 'ready_for_committed_review' : 'not_ready',
        hardGatesPass,
        stopStatement: STAGE_C_RESULT_STOP_STATEMENT
    };
    return JSON.parse(canonicalJson({
        ...unsigned,
        resultDigest: sha256Digest(unsigned)
    })) as StageCResult;
}

export function validateStageCResult(value: unknown): StageCResult {
    assertObject(value, 'Stage C result');
    assert.equal(value.schemaVersion, 1);
    assert.equal(value.resultId, 'wp-015d2r-stage-c-independent-reconstruction-and-chart-revision-v1');
    assert.equal(value.registrationId,
        'WP-015D2R:stage-c-independent-reconstruction-and-chart-revision:v1');
    assert.equal(value.packageId, 'WP-015D2R');
    assert.equal(value.supportWorkPackageId, 'WP-015D2U');
    assert.equal(value.stage, 'stage_c');
    assert.equal(value.stopStatement, STAGE_C_RESULT_STOP_STATEMENT);
    assert.equal(value.hardGatesPass, true);
    assertHex(value.resultDigest, 64, 'Stage C result digest');
    const unsigned = { ...value };
    delete unsigned.resultDigest;
    assert.equal(sha256Digest(unsigned), value.resultDigest, 'Stage C result digest drifted.');
    const result = value as unknown as StageCResult;
    assert.equal(result.source.predecessorBindingCount, 15);
    assert.deepEqual(
        result.source.sourceRange.endpointRows.map((row) => row.path),
        [...STAGE_C_SOURCE_OUTPUTS].sort(compareCanonicalText)
    );
    const { sourceDigest, ...sourceUnsigned } = result.source;
    assert.equal(sourceDigest, sha256Digest(sourceUnsigned));
    assert.equal(result.predecessor.resultDigest, STAGE_B_RESULT_DIGEST);
    assert.equal(result.predecessor.resultCommit, STAGE_B_RESULT_COMMIT);
    assert.equal(result.predecessor.resultBlob, STAGE_B_RESULT_BLOB);
    assert.equal(result.predecessor.resultGitByteSha256,
        '947e951f1f155931d066322df8e7b1748c282b812dca8355bf31d08be23f19ff');
    assert.equal(result.fixedFrame.K_target.id, 'K_WPV4_ONE_COMMAND_COMPLETE_V1');
    assert.equal(result.fixedFrame.K_target.finiteDomainOnly, true);
    assert.equal(result.fixedFrame.K_target.equality, 'exact_canonical_equality');
    assert.equal(result.fixedFrame.tolerance, 0);
    assert.equal(canonicalJson(result.fixedFrame), canonicalJson(expectedStageCResultFixedFrame()),
        'Stage C result fixed frame drifted from the exact registered execution frame.');
    assert.equal(result.reconstruction.endpointCount, STAGE_C_EXPECTED.endpointCount);
    assert.equal(result.reconstruction.endpointRowsMatchCount, STAGE_C_EXPECTED.endpointCount);
    assert.equal(result.reconstruction.endpointIdentityDigest,
        'e475c1cc0528755ff57f24a703f94d516ab459360472ff8d6769c91c8a0d2523');
    assert.equal(result.reconstruction.sourceClassCount, STAGE_C_EXPECTED.sourceClassCount);
    assert.equal(result.reconstruction.aliasedClassCount, STAGE_C_EXPECTED.aliasedClassCount);
    assert.equal(result.reconstruction.classSummaries.length, 9);
    assertUnique(result.reconstruction.classSummaries.map((row) => row.classKey),
        'Duplicate Stage C class summary.');
    assert.deepEqual(
        result.reconstruction.classSummaries.map((row) => row.memberCount).sort((a, b) => a - b),
        [1, 1, 8, 8, 29, 29, 61, 61, 76]
    );
    for (const row of result.reconstruction.classSummaries) {
        assert.equal(row.pairCount, row.memberCount * (row.memberCount - 1) / 2);
        assertHex(row.endpointIdentityDigest, 64, `Stage C class ${row.classKey} digest`);
    }
    assert.equal(result.reconstruction.pairCount, STAGE_C_EXPECTED.pairCount);
    assert.equal(result.reconstruction.pairIdentityDigest,
        '5a65211087e9efdd16388d92f72c0356cc3d7de2048d92969e4f6b261f34298c');
    assert.equal(result.reconstruction.targetRelevantPairIdentityDigest,
        '02b4c88d0aeeeffdbd2effae782180464e514d73c740f9f58d561825fe2a8ee1');
    assert.equal(result.reconstruction.reconstructedPairRowsDigest,
        '93623752748f00ff46070e52e7812f9489136c4ad34307c324814b5198dce321');
    assert.equal(result.reconstruction.predecessorPairRowsDigest,
        result.reconstruction.reconstructedPairRowsDigest);
    assert.equal(result.reconstruction.predecessorPairRowsMatchCount, STAGE_C_EXPECTED.pairCount);
    assert.deepEqual(result.reconstruction.primaryOutcomeCounts, STAGE_C_EXPECTED.outcomes);
    assert.equal(result.reconstruction.targetRelevantPairCount, 1_113);
    assert.equal(result.reconstruction.targetRelevantUnequalPreCommandMovementRemainingCount, 1_113);
    assert.equal(result.reconstruction.targetRelevantEqualPreCommandMovementRemainingCount, 0);
    assert.equal(result.reconstruction.targetRelevantSameDepthCount, 0);
    assert.equal(result.reconstruction.crossTab.length, 10);
    assertUnique(result.reconstruction.crossTab.map((row) => canonicalJson({ ...row, pairCount: 0 })),
        'Duplicate Stage C cross-tab coordinate row.');
    assert.equal(result.reconstruction.crossTab.reduce((sum, row) => sum + row.pairCount, 0), 7_378);
    assert.equal(result.reconstruction.crossTabRowsDigest,
        sha256Digest(result.reconstruction.crossTab));
    assert.equal(result.reconstruction.crossTabDigest,
        '5247cba5743f97aa05a4e60b4bfed3426d5de2446b1bcdb903e3a518fd64e293');
    assert.equal(result.reconstruction.predecessorCrossTabMatches, true);

    assert.equal(result.candidateAssessments.thinOnly.groupCount, 9);
    assert.equal(result.candidateAssessments.thinOnly.equalityPairCount, 7_378);
    assert.equal(result.candidateAssessments.thinOnly.counterexampleCount, 1_113);
    assert.equal(result.candidateAssessments.Q_support.counterexampleCount, 0);
    assert.equal(result.candidateAssessments.Q_support.groupCount, 17);
    assert.equal(result.candidateAssessments.Q_support.equalityPairCount, 6_265);
    assert.equal(result.candidateAssessments.Q_support.nonVacuous, true);
    assert.equal(result.candidateAssessments.Q_support.verdict,
        'sufficient_for_complete_registered_one_command_target_on_finite_domain_nonunique');
    assert.equal(result.candidateAssessments.Q_command.counterexampleCount, 0);
    assert.equal(result.candidateAssessments.Q_command.groupCount, 14);
    assert.equal(result.candidateAssessments.Q_command.equalityPairCount, 6_279);
    assert.equal(result.candidateAssessments.Q_command.continuationSupportCounterexampleCount, 14);
    assert.equal(result.candidateAssessments.Q_command.verdict,
        'sufficient_for_registered_command_semantics_only_not_continuation_support');
    assert.equal(result.candidateAssessments.admissibilityOnly.groupCount, 2);
    assert.equal(result.candidateAssessments.admissibilityOnly.equalityPairCount, 32_556);
    assert.equal(result.candidateAssessments.admissibilityOnly.counterexampleCount, 130);
    const candidateExpected = [
        [result.candidateAssessments.thinOnly, 'THIN_VISIBLE_DUEL_ONLY', 9, 7_378,
            '9bfc59cb44a6d71f4809d054f896bb915e45b43f24c17f1ed52675a37265ea60', 1_113,
            '3e5c6d4a6facab070c925dc29d0fdb160d00c9698587ca6ebacdf3d787f8e875', true],
        [result.candidateAssessments.Q_support,
            'Q_SUPPORT_THIN_PLUS_PRE_COMMAND_MOVEMENT_REMAINING', 17, 6_265,
            'b5cf78dd613a8cbf93bd9a6b2c201b8d618f3103a8e7b0ace87fd1353660779c', 0,
            '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945', true],
        [result.candidateAssessments.Q_command,
            'Q_COMMAND_THIN_PLUS_NEXT_MOVE_ADMISSIBILITY', 14, 6_279,
            'dc8adbfa8e322961368bcfb577d527debbb12223253fb29de4e49a6a491108c6', 0,
            '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945', true],
        [result.candidateAssessments.admissibilityOnly, 'NEXT_MOVE_ADMISSIBILITY_ONLY', 2, 32_556,
            '9119ba2976213b075aa90052768879986b8e89c293ab8a9252c9b9d5954e84b7', 130,
            'e4028a733419eee17418a7702acf6f155529081095e58883bc592b4148487099', true],
        [result.candidateAssessments.routeHistory, 'EXACT_ROUTE_HISTORY', 274, 0,
            '8636fec44c0c1e49f7ff8f15b11036591e5e032c02e6be8d26dd474525a59dd2', 0,
            '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945', false],
        [result.candidateAssessments.revisionProxy, 'THIN_PLUS_PRE_COMMAND_REVISION_PROXY', 17, 6_265,
            'b5cf78dd613a8cbf93bd9a6b2c201b8d618f3103a8e7b0ace87fd1353660779c', 0,
            '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945', true],
        [result.candidateAssessments.exactState, 'THIN_PLUS_PRE_COMMAND_EXACT_STATE_DIGEST', 27, 3_282,
            '73c697dee3ea418bd9fefeb5ef10ff0ca3b31166270d42ea521b1add05ad5873', 0,
            '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945', true]
    ] as const;
    for (const [candidate, candidateId, groupCount, equalityPairCount, partitionDigest,
        counterexampleCount, counterexampleDigest, nonVacuous] of candidateExpected) {
        assert.equal(candidate.candidateId, candidateId);
        assert.equal(candidate.groupCount, groupCount);
        assert.equal(candidate.equalityPairCount, equalityPairCount);
        assert.equal(candidate.partitionIdentityDigest, partitionDigest);
        assert.equal(candidate.counterexampleCount, counterexampleCount);
        assert.equal(candidate.counterexamplePairIdsDigest, counterexampleDigest);
        assert.equal(candidate.nonVacuous, nonVacuous);
        assert.equal(candidate.scopeGuard,
            'Finite registered Stage B endpoint domain only; no global minimality, all-seed, public-formation, or recursive-closure inference.');
    }
    assert.equal(result.candidateAssessments.Q_command.continuationSupportCounterexamplePairIdsDigest,
        '881ef1533f6c57a49ac3fc04cbb37c26c53e6960501770893b8ca8687762009e');
    assert(exact(result.candidateAssessments.thinOnly.coordinates,
        ['thin_visible_duel_v0@2 projection']));
    assert(exact(result.candidateAssessments.Q_support.coordinates,
        ['thin_visible_duel_v0@2 projection', 'preCommandMovementRemaining']));
    assert(exact(result.candidateAssessments.Q_command.coordinates,
        ['thin_visible_duel_v0@2 projection', 'nextMoveAdmissibility']));
    assert(exact(result.candidateAssessments.admissibilityOnly.coordinates,
        ['nextMoveAdmissibility']));
    assert(exact(result.candidateAssessments.routeHistory.coordinates,
        ['exact retained route history']));
    assert(exact(result.candidateAssessments.revisionProxy.coordinates,
        ['thin_visible_duel_v0@2 projection', 'preCommandRevision']));
    assert(exact(result.candidateAssessments.exactState.coordinates,
        ['thin_visible_duel_v0@2 projection', 'preCommandStateDigest']));
    assert.equal(result.candidateAssessments.thinOnly.verdict,
        'insufficient_for_complete_registered_one_command_target');
    assert.equal(result.candidateAssessments.admissibilityOnly.verdict,
        'insufficient_without_thin_source_context');
    assert.equal(result.candidateAssessments.routeHistory.verdict,
        'vacuous_exact_route_identity');
    assert.equal(result.candidateAssessments.revisionProxy.verdict,
        'finite_proxy_matches_q_support_partition');
    assert.equal(result.candidateAssessments.exactState.verdict,
        'reentry_support_on_authenticated_finite_domain');
    for (const candidate of [
        result.candidateAssessments.thinOnly,
        result.candidateAssessments.Q_support,
        result.candidateAssessments.routeHistory,
        result.candidateAssessments.revisionProxy,
        result.candidateAssessments.exactState
    ]) assert.equal(candidate.protectedTarget, 'complete registered one-command target');
    for (const candidate of [
        result.candidateAssessments.Q_command,
        result.candidateAssessments.admissibilityOnly
    ]) assert.equal(candidate.protectedTarget, 'registered command-semantic target only');
    assert.deepEqual(result.routeDepthMovementBudgetCoformation.rows, [
        {
            endpointDepth: 2, endpointCount: 3,
            preCommandMovementRemainingValues: [48],
            postCommandMovementRemainingValues: [40],
            nextMoveAdmissibilityValues: [true], preCommandRevisionValues: [2]
        },
        {
            endpointDepth: 4, endpointCount: 16,
            preCommandMovementRemainingValues: [32],
            postCommandMovementRemainingValues: [24],
            nextMoveAdmissibilityValues: [true], preCommandRevisionValues: [4]
        },
        {
            endpointDepth: 8, endpointCount: 255,
            preCommandMovementRemainingValues: [0],
            postCommandMovementRemainingValues: [0],
            nextMoveAdmissibilityValues: [false], preCommandRevisionValues: [8]
        }
    ]);
    assert.equal(result.routeDepthMovementBudgetCoformation.allTargetRelevantPairsCrossDepth, true);
    assert.equal(
        result.routeDepthMovementBudgetCoformation.allTargetRelevantPairsCrossPreCommandBudget,
        true
    );
    assert.equal(result.routeDepthMovementBudgetCoformation.interpretation,
        'co_formed_on_this_finite_domain_not_causal');
    assert.equal(result.witnessReturn.W_status, 'present');
    assert.equal(result.witnessReturn.executionWitness, 'present');
    assert.equal(result.witnessReturn.evidenceClass, 'correlated_reuse');
    assert.equal(result.witnessReturn.navigatorAdmission, 'pending');
    assert.equal(result.witnessReturn.Omega_W_status, 'evaluated_exact');
    assert.equal(result.witnessReturn.P_W_status, 'observed');
    assert.equal(result.witnessReturn.N_W_status, 'observed');
    assert.equal(result.witnessReturn.J_W, 'complete_for_bounded_registered_one_command_audit');
    assert.equal(result.witnessReturn.J_W_boundary.auditTarget,
        'complete_for_bounded_registered_one_command_audit');
    assert.equal(result.witnessReturn.J_W_boundary.stateMaterialSeparationDigest,
        sha256Digest(result.stateMaterialSeparation));
    assert.equal(result.witnessReturn.J_W_boundary.liveRecursiveState,
        'absent_not_established');
    assert.equal(result.witnessReturn.J_W_boundary.recursiveContinuationClosure, false);
    assert.equal(result.witnessReturn.thinCutCompleteness, 'intentionally_incomplete');
    assert.equal(result.witnessReturn.auditEvidenceCompleteness,
        'complete_for_registered_finite_domain');
    assert.equal(stageCD2QProtectedCorePass(result.protectedCoreRecovery), true);
    assertUnique(result.carrierRoles.map((row) => row.field), 'Duplicate Stage C carrier-role row.');
    const expectedRoles = deriveStageCCarrierRoles({
        pairCount: result.reconstruction.pairCount,
        allReconstructedRoutePairsDiffer:
            result.candidateAssessments.routeHistory.groupCount === STAGE_C_EXPECTED.endpointCount &&
            result.candidateAssessments.routeHistory.equalityPairCount === 0,
        sourceBindingsAuthenticated: result.source.predecessorBindingCount === 15,
        Q_support: result.candidateAssessments.Q_support,
        Q_command: result.candidateAssessments.Q_command,
        routeHistoryCandidate: result.candidateAssessments.routeHistory,
        revisionCandidate: result.candidateAssessments.revisionProxy,
        exactStateCandidate: result.candidateAssessments.exactState
    });
    assert.equal(canonicalJson(result.carrierRoles), canonicalJson(expectedRoles),
        'Stage C carrier roles are not derived from the exact candidate partitions.');
    assert.deepEqual(Object.fromEntries(result.carrierRoles.map((row) => [row.field, row.primaryRole])), {
        movementRemaining: 'live_carrier',
        'move admissibility': 'target_relative_support',
        'route history': 'provenance',
        revision: 'provenance',
        'exact state digest': 're_entry_support'
    });
    const expectedStateMaterialSeparation = deriveStageCStateMaterialSeparation(
        result.source,
        result.carrierRoles
    );
    assert.equal(
        canonicalJson(result.stateMaterialSeparation),
        canonicalJson(expectedStateMaterialSeparation),
        'Stage C state-material separation is not derived from authenticated source and carrier roles.'
    );
    assert.equal(stageCStateMaterialSeparationPass(
        result.stateMaterialSeparation,
        result.source.predecessorBindingCount === STAGE_C_EXPECTED_SOURCE_BINDINGS.length,
        result.carrierRoles
    ), true, 'Stage C state-material separation did not pass its exact bounded controls.');
    assert.equal(result.semanticReconstructionReadiness, 'ready_for_committed_review');
    assert.equal(result.tauReturn.semanticObligationsPass, true);
    assert.equal(result.tauReturn.durableReviewObligationPass, false);
    assert.equal(result.tauReturn.status, 'candidate_unlicensed');
    assert.equal(canonicalJson(result.tauReturn), canonicalJson(deriveStageCTauReturn({
        source: result.source,
        fixedFrame: result.fixedFrame,
        reconstruction: result.reconstruction,
        thinOnly: result.candidateAssessments.thinOnly,
        Q_support: result.candidateAssessments.Q_support,
        Q_command: result.candidateAssessments.Q_command,
        coformation: result.routeDepthMovementBudgetCoformation,
        protectedCore: result.protectedCoreRecovery,
        witnessReturn: result.witnessReturn,
        roles: result.carrierRoles,
        stateMaterialSeparation: result.stateMaterialSeparation,
        governance: result.governance,
        residue: result.chartRevision.residueCarriedForward
    })));
    assert.equal(canonicalJson(result.chartRevision), canonicalJson(deriveStageCChartRevision({
        thinOnly: result.candidateAssessments.thinOnly,
        Q_support: result.candidateAssessments.Q_support,
        Q_command: result.candidateAssessments.Q_command,
        admissibilityOnly: result.candidateAssessments.admissibilityOnly,
        routeHistory: result.candidateAssessments.routeHistory,
        revisionProxy: result.candidateAssessments.revisionProxy,
        exactState: result.candidateAssessments.exactState,
        sourceBindingsAuthenticated: result.source.predecessorBindingCount === 15,
        stateMaterialSeparation: result.stateMaterialSeparation,
        roles: result.carrierRoles,
        tauReturn: result.tauReturn,
        residue: result.chartRevision.residueCarriedForward
    })));
    assert.equal(result.chartRevision.status, 'candidate_revision_pending_review');
    assert.equal(
        result.chartRevision.strengthenedRoutes.some((row) => row.routeId === 'TAU-WPV4-RETURN-01A'),
        false
    );
    assert.equal(result.governance.productAuthority, 'none');
    assert.equal(result.governance.mathematicalPlacementImplication, 'none');
    assert.equal(result.governance.playerObservationTiming, 'closed');
    assert.equal(result.governance.gameplayChange, false);
    assert.equal(result.governance.p5, 'closed');
    assert.equal(result.governance.successorWorldExecution, 'closed');
    assert.equal(result.digests.sourceDigest, result.source.sourceDigest);
    assert.equal(result.digests.predecessorResultDigest, STAGE_B_RESULT_DIGEST);
    assert.equal(result.digests.reconstructionDigest, sha256Digest({
        reconstruction: result.reconstruction,
        coformation: result.routeDepthMovementBudgetCoformation
    }));
    assert.equal(result.digests.witnessDigest, sha256Digest(result.witnessReturn));
    assert.equal(result.digests.carrierDigest, sha256Digest({
        candidateAssessments: result.candidateAssessments,
        roles: result.carrierRoles,
        stateMaterialSeparation: result.stateMaterialSeparation,
        tauReturn: result.tauReturn
    }));
    assert.equal(result.digests.chartDigest, sha256Digest(result.chartRevision));
    assert.equal(result.digests.parityDigest, sha256Digest({
        reconstruction: {
            endpointCount: result.reconstruction.endpointCount,
            sourceClassCount: result.reconstruction.sourceClassCount,
            aliasedClassCount: result.reconstruction.aliasedClassCount,
            pairCount: result.reconstruction.pairCount,
            primaryOutcomeCounts: result.reconstruction.primaryOutcomeCounts,
            targetRelevantPairCount: result.reconstruction.targetRelevantPairCount,
            crossTabDigest: result.reconstruction.crossTabDigest
        },
        candidateAssessments: result.candidateAssessments,
        witnessReturn: result.witnessReturn,
        roles: result.carrierRoles,
        stateMaterialSeparation: result.stateMaterialSeparation,
        tauReturn: result.tauReturn,
        chartRevision: result.chartRevision,
        governance: result.governance,
        stopStatement: result.stopStatement
    }));
    return result;
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
    assert.equal(typeof value, 'string', `${label} must be a string.`);
    assert((value as string).trim().length > 0, `${label} must not be empty.`);
}

function assertStringArray(value: unknown, label: string, allowEmpty = false): asserts value is string[] {
    assert(Array.isArray(value), `${label} must be an array.`);
    assert(allowEmpty || value.length > 0, `${label} must not be empty.`);
    for (const [index, row] of value.entries()) assertNonEmptyString(row, `${label}[${index}]`);
}

export function validateStageCPilotBoundIdentities(
    value: unknown,
    sourceCommit: string,
    resultCommit: string,
    expected?: StageCPilotBoundIdentities
): StageCPilotBoundIdentities {
    assertExactKeys(value, [
        'source', 'resultCommit', 'resultArtifact', 'reportArtifact', 'ranges',
        'predecessorStageBResult'
    ], 'Stage C pilot bound identities');
    const identities = value as unknown as StageCPilotBoundIdentities;
    assertExactKeys(identities.source, ['commit', 'tree', 'digest'],
        'Stage C pilot source identity');
    assert.equal(identities.source.commit, sourceCommit);
    assertHex(identities.source.tree, 40, 'Stage C pilot source tree');
    assertHex(identities.source.digest, 64, 'Stage C pilot source digest');
    assertExactKeys(identities.resultCommit, ['commit', 'tree'],
        'Stage C pilot result-commit identity');
    assert.equal(identities.resultCommit.commit, resultCommit);
    assertHex(identities.resultCommit.tree, 40, 'Stage C pilot result tree');
    assertExactKeys(identities.resultArtifact,
        ['path', 'mode', 'blob', 'sha256', 'semanticDigest', 'parityDigest'],
        'Stage C pilot result artifact identity');
    assert(exactRegularIdentity(identities.resultArtifact, STAGE_C_RESULT_PATH));
    assertHex(identities.resultArtifact.semanticDigest, 64,
        'Stage C pilot result semantic digest');
    assertHex(identities.resultArtifact.parityDigest, 64,
        'Stage C pilot result parity digest');
    assertExactKeys(identities.reportArtifact,
        ['path', 'mode', 'blob', 'sha256', 'resultParityDigest'],
        'Stage C pilot report artifact identity');
    assert(exactRegularIdentity(identities.reportArtifact, STAGE_C_REPORT_PATH));
    assert.equal(identities.reportArtifact.resultParityDigest,
        identities.resultArtifact.parityDigest);
    assertExactKeys(identities.ranges,
        ['sourceToResultDigest', 'entryToResultDigest'],
        'Stage C pilot range identities');
    assertHex(identities.ranges.sourceToResultDigest, 64,
        'Stage C pilot source-to-result range digest');
    assertHex(identities.ranges.entryToResultDigest, 64,
        'Stage C pilot entry-to-result range digest');
    assertExactKeys(identities.predecessorStageBResult,
        ['path', 'mode', 'blob', 'sha256', 'commit', 'semanticDigest'],
        'Stage C pilot predecessor identity');
    assert(exactRegularIdentity(identities.predecessorStageBResult, STAGE_B_RESULT_PATH));
    assert.equal(identities.predecessorStageBResult.commit, STAGE_B_RESULT_COMMIT);
    assert.equal(identities.predecessorStageBResult.blob, STAGE_B_RESULT_BLOB);
    assert.equal(identities.predecessorStageBResult.sha256,
        '947e951f1f155931d066322df8e7b1748c282b812dca8355bf31d08be23f19ff');
    assert.equal(identities.predecessorStageBResult.semanticDigest, STAGE_B_RESULT_DIGEST);
    if (expected !== undefined) {
        assert.equal(canonicalJson(identities), canonicalJson(expected),
            'Stage C pilot bound identities differ from the committed audit facts.');
    }
    return JSON.parse(canonicalJson(identities)) as StageCPilotBoundIdentities;
}

export function validateStageCPostResultPilotSynthesis(
    value: unknown,
    sourceCommit: string,
    resultCommit: string,
    expectedBoundIdentities?: StageCPilotBoundIdentities
): StageCPostResultPilotSynthesis {
    assertObject(value, 'Stage C post-result pilot synthesis');
    assertExactKeys(value, [
        'schemaVersion', 'boundSourceCommit', 'boundResultCommit', 'evidenceOverlap',
        'decisionMethod', 'roleReturns', 'governingSynthesis'
    ], 'Stage C post-result pilot synthesis');
    assert.equal(value.schemaVersion, 1);
    assert.equal(value.boundSourceCommit, sourceCommit);
    assert.equal(value.boundResultCommit, resultCommit);
    assert.equal(value.evidenceOverlap, 'correlated_reuse');
    assert.equal(value.decisionMethod, 'governing_synthesis_without_vote');
    assert(Array.isArray(value.roleReturns), 'Pilot role returns are absent.');
    const roleReturns = value.roleReturns as Record<string, unknown>[];
    assert.equal(roleReturns.length, 3, 'Exactly three post-result pilot returns are required.');
    assertUnique(roleReturns.map((row) => String(row.role)), 'Duplicate pilot role.');
    assertUnique(roleReturns.map((row) => String(row.taskId)), 'Duplicate pilot task ID.');
    assert.deepEqual(
        roleReturns.map((row) => String(row.role)).sort(compareCanonicalText),
        [...STAGE_C_PILOT_ROLES].sort(compareCanonicalText)
    );
    const expectedTaskIds: Record<string, string> = {
        crpm_route_tracer: '/root/stage_c_route_trace',
        crpm_covariance_auditor: '/root/stage_c_covariance',
        crpm_reentry_reviewer: '/root/stage_c_reentry'
    };
    for (const row of roleReturns) {
        assertExactKeys(row, [
            'role', 'taskId', 'boundSourceCommit', 'boundResultCommit', 'boundIdentities',
            'claimStatus', 'strongestLicensedClaim', 'evidenceIndependence', 'sourcePaths',
            'supportOverlap', 'preserved', 'forgotten', 'newlyVisible', 'residual',
            'disagreements', 'falsePromotionFindings', 'reopeningConditions', 'HT10', 'HT11',
            'blockers'
        ], `Stage C ${String(row.role)} pilot return`);
        assert.equal(row.taskId, expectedTaskIds[String(row.role)],
            `Unexpected task identity for ${String(row.role)}.`);
        assert.equal(row.boundSourceCommit, sourceCommit);
        assert.equal(row.boundResultCommit, resultCommit);
        validateStageCPilotBoundIdentities(
            row.boundIdentities,
            sourceCommit,
            resultCommit,
            expectedBoundIdentities
        );
        assert(['survived', 'support_qualified'].includes(String(row.claimStatus)));
        assert.equal(row.strongestLicensedClaim,
            'support_qualified_for_bounded_stage_c_reentry_only');
        assert.equal(row.evidenceIndependence, 'correlated_reuse');
        assertStringArray(row.sourcePaths, `${String(row.role)} sourcePaths`);
        assert(exact(
            [...(row.sourcePaths as string[])].sort(compareCanonicalText),
            [...STAGE_C_PILOT_REQUIRED_SOURCE_PATHS].sort(compareCanonicalText)
        ), `${String(row.role)} source paths differ from the exact pilot boundary.`);
        assert.equal(row.supportOverlap, STAGE_C_PILOT_SUPPORT_OVERLAP);
        for (const field of [
            'preserved', 'forgotten', 'newlyVisible', 'residual', 'falsePromotionFindings',
            'reopeningConditions'
        ]) assertStringArray(row[field], `${String(row.role)} ${field}`);
        assertStringArray(row.disagreements, `${String(row.role)} disagreements`, true);
        assertNonEmptyString(row.HT10, `${String(row.role)} HT10`);
        assertNonEmptyString(row.HT11, `${String(row.role)} HT11`);
        assert.equal(row.HT10, 'survived_exact_bounded_reconstruction');
        assert.equal(row.HT11, 'supports_bounded_review_decision_only');
        assertStringArray(row.blockers, `${String(row.role)} blockers`, true);
    }
    const boundIdentityRows = roleReturns.map((row) => row.boundIdentities);
    assert(boundIdentityRows.every((row) =>
        canonicalJson(row) === canonicalJson(boundIdentityRows[0])),
    'Every Stage C pilot role must bind the same exact committed identities.');
    const synthesis = value.governingSynthesis;
    assertObject(synthesis, 'Stage C governing synthesis');
    assertExactKeys(synthesis, [
        'currentHeadAndSourceBasis', 'pilotActivationDecisionAndReason',
        'levelCutProtectedFamilyAndFrame', 'perAgentFindingsAndEvidenceOverlap',
        'historicalStatusDrift', 'evidenceIndependenceBySupportPath',
        'committedExactCompositionStatus', 'preservedForgottenNewlyVisibleResidual',
        'disagreementsAndFalsePromotionFindings', 'HT10HT11TransferBackStatus',
        'stopReopenDecisions', 'strongestLicensedClaim', 'explicitNonClaims',
        'disagreementDisposition', 'licenseFacts', 'majorityVoteUsed', 'blockers'
    ], 'Stage C governing synthesis');
    for (const field of [
        'currentHeadAndSourceBasis', 'pilotActivationDecisionAndReason',
        'levelCutProtectedFamilyAndFrame', 'perAgentFindingsAndEvidenceOverlap',
        'historicalStatusDrift', 'evidenceIndependenceBySupportPath',
        'committedExactCompositionStatus', 'preservedForgottenNewlyVisibleResidual',
        'disagreementsAndFalsePromotionFindings', 'HT10HT11TransferBackStatus',
        'stopReopenDecisions', 'strongestLicensedClaim'
    ]) assertNonEmptyString(synthesis[field], `governingSynthesis.${field}`);
    assertStringArray(synthesis.explicitNonClaims, 'governingSynthesis.explicitNonClaims');
    assert(exact(
        [...(synthesis.explicitNonClaims as string[])].sort(compareCanonicalText),
        [...STAGE_C_REQUIRED_NONCLAIMS].sort(compareCanonicalText)
    ), 'Stage C governing synthesis does not preserve the exact nonclaim set.');
    assert(['no_substantive_disagreement', 'substantive_disagreement_blocks_admission']
        .includes(String(synthesis.disagreementDisposition)),
    'Stage C governing synthesis lacks an explicit disagreement disposition.');
    const hasDisagreement = roleReturns.some((row) =>
        (row.disagreements as unknown[]).length > 0);
    assert.equal(
        synthesis.disagreementDisposition,
        hasDisagreement
            ? 'substantive_disagreement_blocks_admission'
            : 'no_substantive_disagreement',
        'Stage C disagreement disposition does not match the reviewer-authored returns.'
    );
    assertObject(synthesis.licenseFacts, 'Stage C structured license facts');
    assert(exact(synthesis.licenseFacts, {
        sourceCommit,
        resultCommit,
        predecessorResultCommit: STAGE_B_RESULT_COMMIT,
        predecessorResultDigest: STAGE_B_RESULT_DIGEST,
        pilotActivation: 'required',
        level: 'L4+',
        cut: 'thin_visible_duel_v0@2',
        protectedTarget: 'K_WPV4_ONE_COMMAND_COMPLETE_V1',
        historicalStopsPreserved: true,
        committedExactComposition: 'recoverable',
        evidenceCovariance: 'correlated_reuse',
        strongestClaim: 'bounded_stage_c_reentry_only',
        stopMap: {
            projectedThinOnly: 'stopped',
            p3: 'closed',
            ht8: 'closed_except_recoverable_provenance',
            learnedSupportFormation: 'closed',
            successorWorldExecution: 'closed'
        },
        governance: {
            productAuthority: 'none',
            mathematicalPlacementImplication: 'none',
            playerObservationTiming: 'closed',
            gameplayChange: false,
            p5: 'closed',
            successorWorldExecution: 'closed'
        }
    }), 'Stage C structured license facts drifted from the closed bounded frame.');
    assert.equal(synthesis.majorityVoteUsed, false,
        'Majority voting cannot promote a Stage C return.');
    assertStringArray(synthesis.blockers, 'governingSynthesis.blockers', true);
    const canonical = canonicalJson(value).toLowerCase();
    assert(!canonical.includes('empirically_independent'),
        'Pilot synthesis cannot promote correlated evidence to empirical independence.');
    assert(!canonical.includes('majority_vote_used":true'),
        'Pilot synthesis cannot use a majority vote.');
    for (const forbiddenPromotion of [
        /productauthority (?:proved|granted|licensed|accepted)/,
        /global (?:or unique )?minimality (?:proved|established|licensed)/,
        /successor (?:world )?(?:opened|executed)/,
        /mathematical placement (?:proved|granted|licensed)/,
        /landfall (?:proved|achieved|licensed)/
    ]) assert(!forbiddenPromotion.test(canonical),
        `Pilot synthesis contains a prohibited promotion claim: ${String(forbiddenPromotion)}`);
    return JSON.parse(canonicalJson(value)) as StageCPostResultPilotSynthesis;
}

export function stageCPilotSynthesisAdmissionPass(
    value: unknown,
    sourceCommit: string,
    resultCommit: string,
    expectedBoundIdentities?: StageCPilotBoundIdentities
): boolean {
    const checked = validateStageCPostResultPilotSynthesis(
        value,
        sourceCommit,
        resultCommit,
        expectedBoundIdentities
    );
    return checked.roleReturns.every((row) =>
        row.blockers.length === 0 && row.disagreements.length === 0) &&
        checked.governingSynthesis.blockers.length === 0 &&
        checked.governingSynthesis.disagreementDisposition === 'no_substantive_disagreement';
}

function readCommittedStageCResult(
    resultCommit: string,
    repositoryRoot: string
): { result: StageCResult; text: string; identity: SourceIdentityRow } {
    gitObjectExists(resultCommit, repositoryRoot);
    const identity = gitPathIdentity(resultCommit, STAGE_C_RESULT_PATH, repositoryRoot);
    const text = gitBytes(['show', `${resultCommit}:${STAGE_C_RESULT_PATH}`], repositoryRoot)
        .toString('utf8');
    const result = validateStageCResult(parseStageCStrictJson(text));
    assert.equal(text, `${canonicalJson(result)}\n`, 'Committed Stage C result is not canonical JSON.');
    return { result, text, identity };
}

export function buildStageCPilotBoundIdentities(
    resultCommit: string,
    repositoryRoot = STAGE_C_ROOT
): StageCPilotBoundIdentities {
    assertHex(resultCommit, 40, 'Stage C pilot result commit');
    const committed = readCommittedStageCResult(resultCommit, repositoryRoot);
    const sourceToResult = auditStageCLifecycleRange(
        'result',
        committed.result.source.sourceCommit,
        resultCommit,
        repositoryRoot
    );
    const entryToResult = auditStageCRange(
        STAGE_B_TERMINAL_EVIDENCE_COMMIT,
        resultCommit,
        [...STAGE_C_SOURCE_OUTPUTS, ...STAGE_C_RESULT_OUTPUTS],
        repositoryRoot
    );
    const reportIdentity = gitPathIdentity(resultCommit, STAGE_C_REPORT_PATH, repositoryRoot);
    return assembleStageCPilotBoundIdentities(
        committed.result,
        resultCommit,
        committed.identity,
        reportIdentity,
        sourceToResult,
        entryToResult,
        repositoryRoot
    );
}

function assembleStageCPilotBoundIdentities(
    result: StageCResult,
    resultCommit: string,
    resultIdentity: SourceIdentityRow,
    reportIdentity: SourceIdentityRow,
    sourceToResult: StageCRangeAudit,
    entryToResult: StageCRangeAudit,
    repositoryRoot: string
): StageCPilotBoundIdentities {
    const predecessorIdentity = gitPathIdentity(
        STAGE_B_RESULT_COMMIT,
        STAGE_B_RESULT_PATH,
        repositoryRoot
    );
    const value: StageCPilotBoundIdentities = {
        source: {
            commit: result.source.sourceCommit,
            tree: gitText(
                ['rev-parse', `${result.source.sourceCommit}^{tree}`],
                repositoryRoot
            ),
            digest: result.source.sourceDigest
        },
        resultCommit: {
            commit: resultCommit,
            tree: gitText(['rev-parse', `${resultCommit}^{tree}`], repositoryRoot)
        },
        resultArtifact: {
            ...resultIdentity,
            semanticDigest: result.resultDigest,
            parityDigest: result.digests.parityDigest
        },
        reportArtifact: {
            ...reportIdentity,
            resultParityDigest: result.digests.parityDigest
        },
        ranges: {
            sourceToResultDigest: sourceToResult.rangeDigest,
            entryToResultDigest: entryToResult.rangeDigest
        },
        predecessorStageBResult: {
            ...predecessorIdentity,
            commit: STAGE_B_RESULT_COMMIT,
            semanticDigest: STAGE_B_RESULT_DIGEST
        }
    };
    return validateStageCPilotBoundIdentities(
        value,
        result.source.sourceCommit,
        resultCommit
    );
}

export function buildStageCReviewReturn(
    resultCommit: string,
    pilotSynthesisInput: unknown,
    repositoryRoot = STAGE_C_ROOT
): StageCReviewReturn {
    assertHex(resultCommit, 40, 'Stage C result commit');
    const committed = readCommittedStageCResult(resultCommit, repositoryRoot);
    const result = committed.result;
    assert.equal(result.semanticReconstructionReadiness, 'ready_for_committed_review');
    assert.equal(result.witnessReturn.navigatorAdmission, 'pending');
    assert.equal(result.tauReturn.status, 'candidate_unlicensed');
    assert.equal(result.chartRevision.status, 'candidate_revision_pending_review');
    assert.equal(
        result.chartRevision.strengthenedRoutes.some((row) => row.routeId === 'TAU-WPV4-RETURN-01A'),
        false
    );
    const reconstructed = reconstructStageCReturn(result.source.sourceCommit, repositoryRoot);
    const committedResultCanonicalDigest = sha256Text(canonicalJson(result));
    const reconstructedResultCanonicalDigest = sha256Text(canonicalJson(reconstructed));
    assert.equal(committedResultCanonicalDigest, reconstructedResultCanonicalDigest,
        'Committed Stage C result failed executable parity.');

    const reportIdentity = gitPathIdentity(resultCommit, STAGE_C_REPORT_PATH, repositoryRoot);
    const reportText = gitBytes(['show', `${resultCommit}:${STAGE_C_REPORT_PATH}`], repositoryRoot)
        .toString('utf8');
    const renderedReport = renderStageCReport(result);
    assert.equal(reportText, renderedReport,
        'Committed Stage C report/result parity failed.');
    const sourceToResult = auditStageCLifecycleRange(
        'result', result.source.sourceCommit, resultCommit, repositoryRoot
    );
    const entryToResult = auditStageCRange(
        STAGE_B_TERMINAL_EVIDENCE_COMMIT,
        resultCommit,
        [...STAGE_C_SOURCE_OUTPUTS, ...STAGE_C_RESULT_OUTPUTS],
        repositoryRoot
    );
    assert.deepEqual(
        entryToResult.endpointRows.map((row) => row.path),
        [...STAGE_C_SOURCE_OUTPUTS, ...STAGE_C_RESULT_OUTPUTS].sort(compareCanonicalText),
        'Stage C entry-to-result range is not exactly the eight pre-review outputs.'
    );
    const pilotBoundIdentities = assembleStageCPilotBoundIdentities(
        result,
        resultCommit,
        committed.identity,
        reportIdentity,
        sourceToResult,
        entryToResult,
        repositoryRoot
    );
    const pilotSynthesis = validateStageCPostResultPilotSynthesis(
        pilotSynthesisInput,
        result.source.sourceCommit,
        resultCommit,
        pilotBoundIdentities
    );
    const pilotAdmissionPass = stageCPilotSynthesisAdmissionPass(
        pilotSynthesis,
        result.source.sourceCommit,
        resultCommit,
        pilotBoundIdentities
    );
    const pilotReview: StageCReviewReturn['pilotReview'] = {
        activation: 'required',
        roles: STAGE_C_PILOT_ROLES,
        evidenceOverlap: 'correlated_reuse',
        synthesis: pilotSynthesis,
        synthesisDigest: sha256Digest(pilotSynthesis),
        status: pilotAdmissionPass ? 'reviewed_bounded' : 'blocked'
    };
    const durableReviewEvidence: NonNullable<StageCTauDerivationInput['durableReview']> = {
        resultCommit,
        resultIdentity: { ...committed.identity, semanticDigest: result.resultDigest },
        reportIdentity: { ...reportIdentity, parityDigest: result.digests.parityDigest },
        sourceToResultRange: sourceToResult,
        entryToResultRange: entryToResult,
        committedResultCanonicalDigest,
        reconstructedResultCanonicalDigest,
        expectedResultSemanticDigest: result.resultDigest,
        expectedResultParityDigest: result.digests.parityDigest,
        committedReportSha256: reportIdentity.sha256,
        renderedReportSha256: sha256Text(renderedReport),
        pilotBoundIdentities,
        pilotSynthesis
    };
    const witnessReturn: StageCReviewReturn['witnessReturn'] = {
        ...result.witnessReturn,
        navigatorAdmission: pilotAdmissionPass ? 'reviewed_bounded' : 'not_admitted'
    };
    const tauReturn = deriveStageCTauReturn({
        source: result.source,
        fixedFrame: result.fixedFrame,
        reconstruction: result.reconstruction,
        thinOnly: result.candidateAssessments.thinOnly,
        Q_support: result.candidateAssessments.Q_support,
        Q_command: result.candidateAssessments.Q_command,
        coformation: result.routeDepthMovementBudgetCoformation,
        protectedCore: result.protectedCoreRecovery,
        witnessReturn,
        roles: result.carrierRoles,
        stateMaterialSeparation: result.stateMaterialSeparation,
        governance: result.governance,
        residue: result.chartRevision.residueCarriedForward,
        durableReview: durableReviewEvidence
    });
    assert.equal(tauReturn.semanticObligationsPass, true);
    assert.equal(tauReturn.durableReviewObligationPass, pilotAdmissionPass);
    assert.equal(tauReturn.status, pilotAdmissionPass
        ? 'licensed_for_bounded_stage_c_reentry_only'
        : 'candidate_unlicensed');
    const chartRevision = deriveStageCChartRevision({
        thinOnly: result.candidateAssessments.thinOnly,
        Q_support: result.candidateAssessments.Q_support,
        Q_command: result.candidateAssessments.Q_command,
        admissibilityOnly: result.candidateAssessments.admissibilityOnly,
        routeHistory: result.candidateAssessments.routeHistory,
        revisionProxy: result.candidateAssessments.revisionProxy,
        exactState: result.candidateAssessments.exactState,
        sourceBindingsAuthenticated: result.source.predecessorBindingCount === 15,
        stateMaterialSeparation: result.stateMaterialSeparation,
        roles: result.carrierRoles,
        tauReturn,
        residue: result.chartRevision.residueCarriedForward,
        reviewDisposition: pilotAdmissionPass ? 'reviewed_bounded' : 'not_admitted'
    });
    assert.equal(chartRevision.status, pilotAdmissionPass ? 'reviewed_bounded' : 'not_accepted');
    assert.equal(
        chartRevision.strengthenedRoutes.some((row) => row.routeId === 'TAU-WPV4-RETURN-01A'),
        pilotAdmissionPass
    );
    const parityDigest = sha256Digest({
        resultDigest: result.resultDigest,
        resultParityDigest: result.digests.parityDigest,
        reportSha256: reportIdentity.sha256,
        pilotSynthesisDigest: pilotReview.synthesisDigest,
        witnessReturn,
        tauReturn,
        chartRevision,
        governance: result.governance
    });
    const hardGatesPass = tauReturn.semanticObligationsPass &&
        tauReturn.durableReviewObligationPass &&
        tauReturn.obligations.every((row) => row.passed) &&
        witnessReturn.navigatorAdmission === 'reviewed_bounded' &&
        pilotReview.status === 'reviewed_bounded' &&
        chartRevision.status === 'reviewed_bounded' &&
        chartRevision.strengthenedRoutes.some((row) => row.routeId === 'TAU-WPV4-RETURN-01A') &&
        closedStageCGovernance(result.governance);
    const unsigned: Omit<StageCReviewReturn, 'returnDigest'> = {
        schemaVersion: 1,
        returnId: 'wp-015d2r-stage-c-review-return-v1',
        packageId: 'WP-015D2R',
        supportWorkPackageId: 'WP-015D2U',
        stage: 'stage_c_review_return',
        sourceCommit: result.source.sourceCommit,
        resultCommit,
        result: { ...committed.identity, semanticDigest: result.resultDigest },
        report: { ...reportIdentity, parityDigest: result.digests.parityDigest },
        resultRanges: { sourceToResult, entryToResult },
        pilotReview,
        semanticReadiness: 'confirmed',
        witnessReturn,
        tauReturn: tauReturn as StageCReviewReturn['tauReturn'],
        chartRevision,
        governance: result.governance,
        parityDigest,
        hardGatesPass,
        stopStatement: STAGE_C_STOP_STATEMENT
    };
    return JSON.parse(canonicalJson({
        ...unsigned,
        returnDigest: sha256Digest(unsigned)
    })) as StageCReviewReturn;
}

export function validateStageCReviewReturn(
    value: unknown,
    result?: StageCResult
): StageCReviewReturn {
    assertObject(value, 'Stage C review return');
    assert.equal(value.schemaVersion, 1);
    assert.equal(value.returnId, 'wp-015d2r-stage-c-review-return-v1');
    assert.equal(value.packageId, 'WP-015D2R');
    assert.equal(value.supportWorkPackageId, 'WP-015D2U');
    assert.equal(value.stage, 'stage_c_review_return');
    assertHex(value.sourceCommit, 40, 'Stage C review source commit');
    assertHex(value.resultCommit, 40, 'Stage C review result commit');
    assertHex(value.returnDigest, 64, 'Stage C review-return digest');
    const unsigned = { ...value };
    delete unsigned.returnDigest;
    assert.equal(sha256Digest(unsigned), value.returnDigest, 'Stage C review-return digest drifted.');
    const review = value as unknown as StageCReviewReturn;
    validateStageCPostResultPilotSynthesis(
        review.pilotReview.synthesis,
        review.sourceCommit,
        review.resultCommit
    );
    const pilotBoundIdentities = review.pilotReview.synthesis.roleReturns[0].boundIdentities;
    const pilotAdmissionPass = stageCPilotSynthesisAdmissionPass(
        review.pilotReview.synthesis,
        review.sourceCommit,
        review.resultCommit
    );
    assert.equal(review.pilotReview.activation, 'required');
    assert.deepEqual(review.pilotReview.roles, STAGE_C_PILOT_ROLES);
    assert.equal(review.pilotReview.evidenceOverlap, 'correlated_reuse');
    assert.equal(review.pilotReview.synthesisDigest, sha256Digest(review.pilotReview.synthesis));
    assert.equal(review.pilotReview.status, pilotAdmissionPass ? 'reviewed_bounded' : 'blocked');
    assert(exactRegularIdentity(review.result, STAGE_C_RESULT_PATH),
        'Stage C review result identity is not an exact regular-file identity.');
    assert(exactRegularIdentity(review.report, STAGE_C_REPORT_PATH),
        'Stage C review report identity is not an exact regular-file identity.');
    assert.equal(review.result.path, STAGE_C_RESULT_PATH);
    assert.equal(review.report.path, STAGE_C_REPORT_PATH);
    assert.equal(pilotBoundIdentities.source.commit, review.sourceCommit);
    assert.equal(pilotBoundIdentities.resultCommit.commit, review.resultCommit);
    assert.equal(canonicalJson(pilotBoundIdentities.resultArtifact), canonicalJson({
        ...review.result,
        parityDigest: review.report.parityDigest
    }));
    const { parityDigest: reviewResultParityDigest, ...reviewReportIdentity } = review.report;
    assert.equal(canonicalJson(pilotBoundIdentities.reportArtifact), canonicalJson({
        ...reviewReportIdentity,
        resultParityDigest: reviewResultParityDigest
    }));
    assert.equal(pilotBoundIdentities.ranges.sourceToResultDigest,
        review.resultRanges.sourceToResult.rangeDigest);
    assert.equal(pilotBoundIdentities.ranges.entryToResultDigest,
        review.resultRanges.entryToResult.rangeDigest);
    assert(embeddedRangePass(
        review.resultRanges.sourceToResult,
        review.sourceCommit,
        review.resultCommit,
        STAGE_C_RESULT_OUTPUTS
    ), 'Stage C source-to-result embedded range failed its exact contract.');
    assert(embeddedRangePass(
        review.resultRanges.entryToResult,
        STAGE_B_TERMINAL_EVIDENCE_COMMIT,
        review.resultCommit,
        [...STAGE_C_SOURCE_OUTPUTS, ...STAGE_C_RESULT_OUTPUTS]
    ), 'Stage C entry-to-result embedded range failed its exact contract.');
    assert.equal(review.semanticReadiness, 'confirmed');
    assert.equal(review.witnessReturn.navigatorAdmission,
        pilotAdmissionPass ? 'reviewed_bounded' : 'not_admitted');
    assert.equal(review.tauReturn.semanticObligationsPass, true);
    assert.equal(review.tauReturn.durableReviewObligationPass, pilotAdmissionPass);
    assert.equal(review.tauReturn.status, pilotAdmissionPass
        ? 'licensed_for_bounded_stage_c_reentry_only'
        : 'candidate_unlicensed');
    assert.equal(review.tauReturn.obligations.every((row) => row.passed), pilotAdmissionPass);
    assert.equal(review.chartRevision.status, pilotAdmissionPass
        ? 'reviewed_bounded'
        : 'not_accepted');
    assert.equal(review.chartRevision.strengthenedRoutes.some((row) =>
        row.routeId === 'TAU-WPV4-RETURN-01A'), pilotAdmissionPass);
    assert.equal(review.governance.productAuthority, 'none');
    assert.equal(review.governance.mathematicalPlacementImplication, 'none');
    assert.equal(review.governance.playerObservationTiming, 'closed');
    assert.equal(review.governance.gameplayChange, false);
    assert.equal(review.governance.p5, 'closed');
    assert.equal(review.governance.successorWorldExecution, 'closed');
    assert.equal(review.parityDigest, sha256Digest({
        resultDigest: review.result.semanticDigest,
        resultParityDigest: review.report.parityDigest,
        reportSha256: review.report.sha256,
        pilotSynthesisDigest: review.pilotReview.synthesisDigest,
        witnessReturn: review.witnessReturn,
        tauReturn: review.tauReturn,
        chartRevision: review.chartRevision,
        governance: review.governance
    }), 'Stage C review parity digest drifted.');
    assert.equal(review.stopStatement, STAGE_C_STOP_STATEMENT);
    if (result !== undefined) {
        assert.equal(result.resultDigest, review.result.semanticDigest);
        assert.equal(result.source.sourceCommit, review.sourceCommit);
        assert.equal(result.semanticReconstructionReadiness, 'ready_for_committed_review');
        assert.equal(pilotBoundIdentities.source.digest, result.source.sourceDigest);
        assert.equal(pilotBoundIdentities.resultArtifact.semanticDigest, result.resultDigest);
        assert.equal(pilotBoundIdentities.resultArtifact.parityDigest,
            result.digests.parityDigest);
        const committedResultCanonicalDigest = sha256Text(canonicalJson(result));
        const expectedTau = deriveStageCTauReturn({
            source: result.source,
            fixedFrame: result.fixedFrame,
            reconstruction: result.reconstruction,
            thinOnly: result.candidateAssessments.thinOnly,
            Q_support: result.candidateAssessments.Q_support,
            Q_command: result.candidateAssessments.Q_command,
            coformation: result.routeDepthMovementBudgetCoformation,
            protectedCore: result.protectedCoreRecovery,
            witnessReturn: review.witnessReturn,
            roles: result.carrierRoles,
            stateMaterialSeparation: result.stateMaterialSeparation,
            governance: result.governance,
            residue: result.chartRevision.residueCarriedForward,
            durableReview: {
                resultCommit: review.resultCommit,
                resultIdentity: review.result,
                reportIdentity: review.report,
                sourceToResultRange: review.resultRanges.sourceToResult,
                entryToResultRange: review.resultRanges.entryToResult,
                committedResultCanonicalDigest,
                reconstructedResultCanonicalDigest: committedResultCanonicalDigest,
                expectedResultSemanticDigest: result.resultDigest,
                expectedResultParityDigest: result.digests.parityDigest,
                committedReportSha256: review.report.sha256,
                renderedReportSha256: sha256Text(renderStageCReport(result)),
                pilotBoundIdentities,
                pilotSynthesis: review.pilotReview.synthesis
            }
        });
        assert.equal(canonicalJson(review.tauReturn), canonicalJson(expectedTau));
        const expectedChart = deriveStageCChartRevision({
            thinOnly: result.candidateAssessments.thinOnly,
            Q_support: result.candidateAssessments.Q_support,
            Q_command: result.candidateAssessments.Q_command,
            admissibilityOnly: result.candidateAssessments.admissibilityOnly,
            routeHistory: result.candidateAssessments.routeHistory,
            revisionProxy: result.candidateAssessments.revisionProxy,
            exactState: result.candidateAssessments.exactState,
            sourceBindingsAuthenticated: result.source.predecessorBindingCount === 15,
            stateMaterialSeparation: result.stateMaterialSeparation,
            roles: result.carrierRoles,
            tauReturn: review.tauReturn,
            residue: result.chartRevision.residueCarriedForward,
            reviewDisposition: pilotAdmissionPass ? 'reviewed_bounded' : 'not_admitted'
        });
        assert.equal(canonicalJson(review.chartRevision), canonicalJson(expectedChart));
    }
    const hardGatesPass = review.semanticReadiness === 'confirmed' &&
        review.witnessReturn.navigatorAdmission === 'reviewed_bounded' &&
        review.pilotReview.status === 'reviewed_bounded' &&
        review.tauReturn.semanticObligationsPass && review.tauReturn.durableReviewObligationPass &&
        review.tauReturn.obligations.every((row) => row.passed) &&
        review.tauReturn.status === 'licensed_for_bounded_stage_c_reentry_only' &&
        review.chartRevision.status === 'reviewed_bounded' &&
        review.chartRevision.strengthenedRoutes.some((row) =>
            row.routeId === 'TAU-WPV4-RETURN-01A') &&
        closedStageCGovernance(review.governance);
    assert.equal(review.hardGatesPass, hardGatesPass,
        'Stage C review hard-gate status is not derived from its review obligations.');
    assert.equal(hardGatesPass, pilotAdmissionPass,
        'Stage C review admission does not match the structured pilot disposition.');
    return review;
}

export function stageCReviewReturnText(review: StageCReviewReturn): string {
    return `${canonicalJson(review)}\n`;
}

export function verifyStageCStoredReviewReturn(
    repositoryRoot = STAGE_C_ROOT,
    reviewCommit?: string
): StageCReviewReturn {
    const text = readFileSync(resolve(repositoryRoot, STAGE_C_REVIEW_RETURN_PATH), 'utf8');
    const parsed = validateStageCReviewReturn(parseStageCStrictJson(text));
    const committed = readCommittedStageCResult(parsed.resultCommit, repositoryRoot);
    const expected = buildStageCReviewReturn(
        parsed.resultCommit,
        parsed.pilotReview.synthesis,
        repositoryRoot
    );
    assert.equal(canonicalJson(parsed), canonicalJson(expected),
        'Stored Stage C review return failed full derivation parity.');
    assert.equal(text, stageCReviewReturnText(parsed), 'Stored Stage C review return is not canonical JSON.');
    validateStageCReviewReturn(parsed, committed.result);
    if (reviewCommit !== undefined) {
        const range = auditStageCLifecycleRange(
            'review', parsed.resultCommit, reviewCommit, repositoryRoot
        );
        assert.equal(range.endpointRows.length, 1);
        const committedText = gitBytes(
            ['show', `${reviewCommit}:${STAGE_C_REVIEW_RETURN_PATH}`],
            repositoryRoot
        ).toString('utf8');
        assert.equal(committedText, text, 'Committed/working Stage C review-return bytes differ.');
    }
    return parsed;
}

function reportTable(rows: readonly (readonly string[])[]): string {
    return rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
}

export function renderStageCReport(result: StageCResult): string {
    const outcomes = STAGE_C_PRIMARY_OUTCOMES.map((outcome) =>
        `- \`${outcome}\`: ${result.reconstruction.primaryOutcomeCounts[outcome]}`).join('\n');
    const crossTabRows = result.reconstruction.crossTab.map((row) => [
        `${row.endpointDepthPair[0]}/${row.endpointDepthPair[1]}`,
        row.depthRelation,
        `${row.preCommandMovementRemainingPair[0]}/${row.preCommandMovementRemainingPair[1]}`,
        `${row.postCommandMovementRemainingPair[0]}/${row.postCommandMovementRemainingPair[1]}`,
        row.primaryOutcome,
        String(row.pairCount)
    ]);
    const roles = result.carrierRoles.map((row) =>
        `- \`${row.field}\`: \`${row.primaryRole}\` — ${row.boundedFinding}`
    ).join('\n');
    const obligations = result.tauReturn.obligations.map((row) =>
        `- \`${row.obligationId}\`: ${row.passed ? 'pass' : 'fail'} (\`${row.evidenceDigest}\`)`
    ).join('\n');
    const d2qRows = result.protectedCoreRecovery.caseReadouts.map((row) =>
        `- \`${row.caseId}\`: accepted \`${row.accepted}\`, mutated \`${row.mutated}\`, error \`${row.error?.code ?? 'null'}\`, events \`${row.eventsDigest}\`, movementRemaining \`${row.movementRemaining}\`, playerX \`${row.playerX}\`, revision \`${row.revision}\`, pre/post \`${row.preStateDigest}\` / \`${row.postStateDigest}\`; row controls inputUnchanged \`${row.inputUnchanged}\`, evidence \`${row.evidenceClass}\`, placement \`${row.mathematicalPlacementImplication}\`, verdict \`${row.verdict}\`, source match \`${row.sourceReadoutMatches}\`.`
    ).join('\n');
    const d2qAblationRows = result.protectedCoreRecovery.ablationControls.map((row) =>
        `- \`${row.ablationId}\` / \`${row.fieldId}\`: full \`${row.fullClasses.digest}\`, ablated \`${row.ablatedClasses.digest}\`, restored \`${row.restoredClasses.digest}\`; primary \`${row.primaryControl.verdict}\`, equality \`${row.equalityControl?.verdict ?? 'not_applicable'}\`, error-only \`${row.errorOnlyControl?.verdict ?? 'not_applicable'}\`, derived \`${row.derivedVerdict}\`.`
    ).join('\n');
    const strengthenedChartRows = result.chartRevision.strengthenedRoutes.map((row) =>
        `- strengthened \`${row.routeId}\`: \`${row.status}\``).join('\n');
    const demotedChartRows = result.chartRevision.demotedRoutes.map((row) =>
        `- demoted \`${row.routeId}\`: \`${row.status}\``).join('\n');
    return `# WP-015D2R Stage C Independent Reconstruction And Chart Revision Report v1

## Bound result

- Stage B result commit: \`${result.predecessor.resultCommit}\`
- Stage B result digest: \`${result.predecessor.resultDigest}\`
- Stage C source commit: \`${result.source.sourceCommit}\`
- Stage C source digest: \`${result.source.sourceDigest}\`
- Stage C result digest: \`${result.resultDigest}\`
- Semantic reconstruction readiness: \`${result.semanticReconstructionReadiness}\`
- Implementation path: \`${result.reconstruction.implementationClass}\`
- Mathematical evidence: \`${result.reconstruction.mathematicalEvidenceClass}\`

Stage C read only the committed Stage B result blob. It did not enumerate routes, call the authority simulation, read ignored raw outputs, or import the Stage B semantic builder.

## Exact reconstruction

- Endpoints: ${result.reconstruction.endpointCount}
- Thin source classes: ${result.reconstruction.sourceClassCount}; aliased classes: ${result.reconstruction.aliasedClassCount}
- Pair identities: ${result.reconstruction.pairCount}; exact predecessor-row matches: ${result.reconstruction.predecessorPairRowsMatchCount}
- Target-relevant pairs: ${result.reconstruction.targetRelevantPairCount}
- Target-relevant pairs with unequal pre-command \`movementRemaining\`: ${result.reconstruction.targetRelevantUnequalPreCommandMovementRemainingCount}
- Target-relevant pairs with equal pre-command \`movementRemaining\`: ${result.reconstruction.targetRelevantEqualPreCommandMovementRemainingCount}
- Same-depth target-relevant pairs: ${result.reconstruction.targetRelevantSameDepthCount}
- Cross-tab digest: \`${result.reconstruction.crossTabDigest}\`

${outcomes}

| depth pair | relation | pre-budget pair | post-budget pair | outcome | count |
| --- | --- | --- | --- | --- | ---: |
${reportTable(crossTabRows)}

## Candidate carriers

- \`Q_support = (thin_visible_duel_v0@2, pre-command movementRemaining)\`: ${result.candidateAssessments.Q_support.equalityPairCount} equality pairs, ${result.candidateAssessments.Q_support.counterexampleCount} complete-target counterexamples; \`${result.candidateAssessments.Q_support.verdict}\`.
- \`Q_command = (thin_visible_duel_v0@2, next-move admissibility)\`: ${result.candidateAssessments.Q_command.equalityPairCount} equality pairs, ${result.candidateAssessments.Q_command.counterexampleCount} command-semantic counterexamples, and ${result.candidateAssessments.Q_command.continuationSupportCounterexampleCount} separate continuation-support counterexamples.
- Thin-only: ${result.candidateAssessments.thinOnly.counterexampleCount} complete-target counterexamples.
- Admissibility-only: \`${result.candidateAssessments.admissibilityOnly.verdict}\`.

The finite result licenses no causal, unique-minimal, global, all-seed, public-formation, or recursive-continuation inference. Route depth, movement budget, admissibility, and revision are co-formed in the observed strata.

## Witness re-entry

- execution witness: \`${result.witnessReturn.executionWitness}\`
- evidence class: \`${result.witnessReturn.evidenceClass}\`
- navigator admission: \`${result.witnessReturn.navigatorAdmission}\`
- candidate sufficiency: \`${result.witnessReturn.candidateCarrierSufficiency}\`
- \`W\`: \`${result.witnessReturn.W_status}\`
- \`Omega_W\`: \`${result.witnessReturn.Omega_W_status}\`
- observed \`P_W\`: \`${result.witnessReturn.P_W_status}\`
- observed \`N_W\`: \`${result.witnessReturn.N_W_status}\`
- \`J_W\`: \`${result.witnessReturn.J_W}\`
- \`J_W\` state-material ledger: \`${result.witnessReturn.J_W_boundary.stateMaterialSeparationDigest}\`; live recursive state \`${result.witnessReturn.J_W_boundary.liveRecursiveState}\`
- thin-cut completeness: \`${result.witnessReturn.thinCutCompleteness}\`

The bounded audit is complete. The thin cut is not.

## D2Q protected-core recovery

- Status: \`${result.protectedCoreRecovery.status}\`
- Source commit: \`${result.protectedCoreRecovery.d2qSourceCommit}\`
- Result digest: \`${result.protectedCoreRecovery.d2qResultDigest}\`
- Return blob: \`${result.protectedCoreRecovery.d2qReturnBlob}\`
- Complete case-row digest: \`${result.protectedCoreRecovery.caseRowsCanonicalDigest}\`
- Complete actor/turn ablation-row digest: \`${result.protectedCoreRecovery.ablationRowsCanonicalDigest}\`
- Matched readouts: ${result.protectedCoreRecovery.matchedSourcePredictionCount}

${d2qRows}

${d2qAblationRows}

- \`actor\`: \`${result.protectedCoreRecovery.fieldVerdicts.actor}\`
- \`expectedTurn\`: \`${result.protectedCoreRecovery.fieldVerdicts.expectedTurn}\`

## Carrier role split

${roles}

## State-material separation

- Audit predecessor provenance: \`${result.stateMaterialSeparation.auditPredecessorProvenance.status}\` (${result.stateMaterialSeparation.auditPredecessorProvenance.bindingCount} exact bindings).
- Domain-transition provenance: \`${result.stateMaterialSeparation.domainTransitionProvenance.status}\`.
- Re-entry material: \`${result.stateMaterialSeparation.reEntryMaterial.status}\`.
- Live recursive state: \`${result.stateMaterialSeparation.liveRecursiveState.status}\`.
- Pre-command budget: \`${result.stateMaterialSeparation.preCommandBudget.status}\`; recursive state \`${result.stateMaterialSeparation.preCommandBudget.recursiveState}\`.

## TAU-WPV4-RETURN-01A

${obligations}

Status: \`${result.tauReturn.status}\`. All semantic obligations passed, but durable result review, range/parity authentication, and final navigator admission remain pending. ProductAuthority and mathematical placement remain \`none\`.

## Chart revision and residue

The initial chart does not strengthen \`TAU-WPV4-RETURN-01A\` before durable review. It strengthens only semantically ready candidate routes and demotes thin-only, admissibility-only, exact-route, revision-proxy, and exact-state-as-live-carrier routes according to their recorded failure modes. ${result.chartRevision.recommendedNextTransition
        ? `The residue-derived successor recommendation is \`${result.chartRevision.recommendedNextTransition.transitionId}\`, status \`${result.chartRevision.recommendedNextTransition.status}\`.`
        : `Successor status: ${result.chartRevision.explicitStop}.`} It is not an opened execution.

${strengthenedChartRows}
${demotedChartRows}

Residue remains longer horizons, other seeds/routes/commands, public formation, player observation and timing, aim/fire, global minimality, gameplay authority, and ProductAuthority.

## Governed stop

ProductAuthority: \`none\`. Mathematical placement implication: \`none\`. Player observation/timing: \`closed\`. Gameplay change: \`false\`. P5: \`closed\`. Successor world execution: \`closed\`.

No successor world execution opened.

WP-015D2R Stage C reconstruction stopped for durable result review;
witness re-entry remains pending.
`;
}

export function verifyStageCStoredOutput(
    repositoryRoot = STAGE_C_ROOT,
    resultCommit?: string
): StageCResult {
    const resultText = readFileSync(resolve(repositoryRoot, STAGE_C_RESULT_PATH), 'utf8');
    const result = validateStageCResult(parseStageCStrictJson(resultText));
    assert.equal(resultText, `${canonicalJson(result)}\n`, 'Stored Stage C result is not canonical JSON.');
    assert.equal(
        readFileSync(resolve(repositoryRoot, STAGE_C_REPORT_PATH), 'utf8'),
        renderStageCReport(result),
        'Stage C report/result parity failed.'
    );
    const reconstructed = reconstructStageCReturn(result.source.sourceCommit, repositoryRoot);
    assert.equal(canonicalJson(result), canonicalJson(reconstructed),
        'Stored Stage C result does not match independent reconstruction.');
    if (resultCommit !== undefined) {
        assertHex(resultCommit, 40, 'Stage C result commit');
        const range = auditStageCRange(
            result.source.sourceCommit,
            resultCommit,
            STAGE_C_RESULT_OUTPUTS,
            repositoryRoot
        );
        assert.equal(range.endpointRows.length, 2);
        assert.deepEqual(
            range.endpointRows.map((row) => row.path),
            [...STAGE_C_RESULT_OUTPUTS].sort(compareCanonicalText),
            'Stage C result range does not contain exactly the two declared result outputs.'
        );
        for (const path of STAGE_C_RESULT_OUTPUTS) {
            const committed = gitBytes(['show', `${resultCommit}:${path}`], repositoryRoot).toString('utf8');
            const working = readFileSync(resolve(repositoryRoot, path), 'utf8');
            assert.equal(working, committed, `Stage C committed/working bytes differ: ${path}`);
        }
    }
    return result;
}

export function stageCResultText(result: StageCResult): string {
    return `${canonicalJson(result)}\n`;
}

export function stageCReportDigest(result: StageCResult): string {
    return sha256Text(renderStageCReport(result));
}
