import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    SIM_RULES,
    V4_RULESET_ID,
    applySimulationCommand as applyBoundSimulationCommand,
    canonicalSimulationJson as canonicalBoundSimulationJson,
    createSimulation as createBoundSimulation,
    type PlayerCalling,
    type SimulationActor,
    type SimulationCommand,
    type SimulationState,
    type SimulationTransition
} from '../../../shared/simulation';
import {
    canonicalJson,
    compareCanonicalText,
    deepSortJson,
    sha256Digest,
    sha256Text,
    type JsonValue
} from '../canonical';
import { V4_CUT_IDS } from '../cuts/v4-cuts';
import { projectV4SimulationState as projectBoundV4SimulationState } from '../kernel/project-cut';

export const STAGE_B_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const STAGE_B_PREREGISTRATION_SOURCE_COMMIT = '65b2153714f237964354da3791fe4af4694a0594';
export const STAGE_B_PREREGISTRATION_TERMINAL_COMMIT = '6e88418a6a90281976dd5f6dcf2e6db55d9e4009';
export const STAGE_B_REGISTRATION_PATH =
    'analysis/crpm_world/navigation/wp-015d2r-stage-b-one-next-command-search-registration-v1.json';
export const STAGE_B_CONTRACT_PATH =
    'docs/planning/wp-015d2r-stage-b-one-next-command-search-contract-v1.md';
export const STAGE_B_RESULT_PATH = 'docs/evidence/wp-015d2r-stage-b-v1/result.json';
export const STAGE_B_REPORT_PATH =
    'docs/planning/wp-015d2r-stage-b-one-next-command-search-report-v1.md';

export const STAGE_B_RAW_PATHS = Object.freeze({
    routeAttempts: 'test-results/crpm-world/wp-015d2r-stage-b-v1/route-attempts.jsonl',
    rejectedPrefixes: 'test-results/crpm-world/wp-015d2r-stage-b-v1/rejected-prefixes.jsonl',
    eligibleEndpoints: 'test-results/crpm-world/wp-015d2r-stage-b-v1/eligible-endpoints.jsonl',
    aliasPairs: 'test-results/crpm-world/wp-015d2r-stage-b-v1/alias-pairs.jsonl',
    frameSupportFailures: 'test-results/crpm-world/wp-015d2r-stage-b-v1/frame-support-failures.jsonl'
});

export const STAGE_B_EXECUTION_SOURCE_PATHS = Object.freeze([
    'docs/evidence/wp-015d2t.json',
    'analysis/crpm_world/navigation/assess-wp-015d2r-stage-b-one-next-command-search-v1.ts',
    'scripts/run-wp-015d2r-stage-b-one-next-command-search-v1.ts',
    'tests/crpm-world/wp-015d2r-stage-b-one-next-command-search-v1.test.ts'
]);

const STAGE_B_REGISTRATION_BLOB = 'd8d6b5a6c52fb421fb77ab4cb32a2d1f48ed03aa';
const STAGE_B_REGISTRATION_SHA256 = 'b02ee74661e7c9a6b48c3f9917ea12d6889840800a3e0036518de3a933961087';
const STAGE_B_REGISTRATION_CANONICAL_DIGEST = '7b611815be524a78d41389d8ed45767c7630a7a63c16fc677f26d832493842e9';
const STAGE_B_CONTRACT_BLOB = '6140b390d8e073378e57c90c2d2cd8c2dac20f79';
const STAGE_B_CONTRACT_SHA256 = '37d9fa6d566ead810b83c19fc29f72363beb6c6fc734e74e04e1b408eb024dd5';
const STAGE_B_PREREGISTRATION_SOURCE_TREE = '4f0cc39665cd903c279fa5e9f415120edba53a97';
const STAGE_B_PREREGISTRATION_TERMINAL_TREE = '70a8c35a2fe102837577883c6dcc0581dce9e2b9';
const STAGE_B_PREREGISTRATION_SOURCE_DIGEST = '982f9684b27ccc8416e3759fd0cdc95cb07c69b1560f59ce5682a6152062dc13';
const STAGE_B_PREREGISTRATION_BINDINGS_DIGEST = '74598bc4b0b1e3a449969b4e4bb012ceef9fff52f50da56b1f5e410938d70647';
const STAGE_B_PREREGISTRATION_PARITY_DIGEST = 'fa96db39f416456d3932fc076d6b4ee7ac274139395250e4899be1a84e1001a4';
const STAGE_B_SEED = 3237998097;
const STAGE_B_CALLING = 'wizard' as const satisfies PlayerCalling;
const STAGE_B_DIRECTIONS = Object.freeze([-1, 1] as const);
const STAGE_B_DEPTHS = Object.freeze([2, 4, 8] as const);
const STAGE_B_CUT_ID = 'thin_visible_duel_v0';
const STAGE_B_CUT_VERSION = 2;
const STAGE_B_EXPECTED_CUT_DIGEST = '8323c4051e5e56e92852a0a2930e55c977d3493d1560b8403c4ca979cca6d8b1';
const STAGE_B_HOLDOUTS = Object.freeze([
    Object.freeze([1, -1] as const),
    Object.freeze([1, -1, 1, -1, 1, -1, 1, -1] as const)
]);

export const STAGE_B_PRIMARY_OUTCOMES = Object.freeze([
    'frame_support_failure',
    'command_semantic_split',
    'continuation_support_split',
    'provenance_exact_state_only_split',
    'no_target_relevant_split'
] as const);

const STAGE_B_CROSS_TAB_INTERPRETATION_GUARD =
    'All depth and movementRemaining pairs retain canonical route-ID left/right endpoint order. ' +
    'The known route-length/movement-budget pattern is derived only when endpoint depth and ' +
    'pre-command budget vary in opposite directions. MovementRemaining recurrence is descriptive ' +
    'pressure only. A post-command difference is a continuation-support-coordinate split, never ' +
    'recursive continuation closure.';

export type StageBDirection = -1 | 1;
export type StageBPrimaryOutcome = typeof STAGE_B_PRIMARY_OUTCOMES[number];

export type StageBSourceRow = Readonly<{
    id?: string;
    path: string;
    mode: string;
    blob: string;
    sha256: string;
    role?: string;
    sourceCommit?: string;
}>;

export type StageBRegistration = Readonly<{
    schemaVersion: number;
    packageId: string;
    supportWorkPackageId: string;
    childId: string;
    registrationId: string;
    registrationVersion: number;
    executable: boolean;
    status: string;
    entryBoundary: {
        stageASourceCommit: string;
        stageATerminalCommit: string;
        productAuthority: string;
        mathematicalPlacementImplication: string;
        p5Open: boolean;
    } & Record<string, JsonValue>;
    stageAFrozenArtifacts: StageBSourceRow[];
    immutableD2PAndD2QArtifacts: {
        boundCommit: string;
        rows: StageBSourceRow[];
    };
    sourceBindings: {
        boundCommit: string;
        rows: StageBSourceRow[];
    };
    aliasObservationCut: {
        cutId: string;
        cutVersion: number;
        canonicalName: string;
        cutDefinitionCanonicalDigest: string;
        cutDefinition: JsonValue;
        exactProjection: Record<string, JsonValue>;
        projectionSemantics: Record<string, JsonValue>;
    };
    immutableD2QAnchorChart: Record<string, JsonValue>;
    fixedFrame: Record<string, JsonValue>;
    routeDomain: {
        identity: string;
        definitionDeclaredComplete: boolean;
        seedSet: number[];
        calling: string;
        commandAlphabet: number[];
        forbiddenDirections: number[];
        eligibleEndpointDepths: number[];
        theoreticalAttemptedWordCountBeforeLegalityAndHoldout: number;
        actorExpectedTurnRule: {
            requiredValuesThroughoutThisDomain: { activeActor: string; turn: number };
        } & Record<string, JsonValue>;
    } & Record<string, JsonValue>;
    holdoutExclusion: {
        excludedOccurrences: {
            seed: number;
            calling: string;
            directions: number[];
            role: string;
        }[];
        maximumEligibleEndpointOccurrencesBeforeLegality: number;
    } & Record<string, JsonValue>;
    nextCommandAndDecoder: {
        nextCommand: { type: string; direction: number };
        horizonAuthorityCalls: number;
        horizonTickCalls: number;
        tolerance: { numeric: number } & Record<string, JsonValue>;
    } & Record<string, JsonValue>;
    outcomeContract: {
        primaryOutcomeEnumInPrecedenceOrder: string[];
        targetRelevant: Record<string, boolean>;
    } & Record<string, JsonValue>;
    prospectiveWitnessInterface: Record<string, JsonValue>;
    selectedTransition: {
        transitionId: string;
        status: string;
        decodabilityAcrossMove: string;
        witnessSupport: string;
        automaticLicenseFromTargetRelevantSplit: boolean;
    } & Record<string, JsonValue>;
    evidenceCovariance: { class: string } & Record<string, JsonValue>;
    outputContracts: {
        futureExecutionPass: {
            allowedTrackedOutputs: { path: string; status: string; mode: string; role: string }[];
            allowedIgnoredRawOutputs: string[];
            preregistrationFilesMutable: boolean;
            existingD2PD2QStageAOrSealedExecutorChangesAllowed: boolean;
            stageCReviewReturnIncluded: boolean;
        } & Record<string, JsonValue>;
    } & Record<string, JsonValue>;
}>;

export type StageBRegisteredWord = Readonly<{
    wordIndex: number;
    seed: number;
    calling: 'wizard';
    rulesetId: typeof V4_RULESET_ID;
    endpointDepth: 2 | 4 | 8;
    directions: StageBDirection[];
    routeId: string;
}>;

export type StageBNormalizedTransition = Readonly<{
    accepted: boolean;
    mutated: boolean;
    error: null | { code: string; message: string };
    authoritativeEvents: JsonValue[];
    eventsDigest: string;
}>;

export type StageBRouteAttempt = Readonly<{
    rowType: 'route_attempt';
    wordIndex: number;
    routeId: string;
    seed: number;
    calling: 'wizard';
    rulesetId: typeof V4_RULESET_ID;
    endpointDepth: 2 | 4 | 8;
    directions: StageBDirection[];
    disposition:
        | 'excluded_calibration_occurrence'
        | 'pruned_by_rejected_prefix'
        | 'rejected_prefix'
        | 'eligible_endpoint'
        | 'frame_support_failure';
    initializationCount: 0 | 1;
    prefixAuthorityCallCount: number;
    nextCommandAuthorityCallCount: 0 | 1;
    rejectedPrefix?: StageBDirection[];
    rejection?: StageBNormalizedTransition;
    failureRef?: string;
}>;

export type StageBRejectedPrefixRecord = Readonly<{
    rowType: 'rejected_prefix' | 'pruned_by_rejected_prefix';
    routeId: string;
    directions: StageBDirection[];
    rejectedPrefix: StageBDirection[];
    prefixDepth: number;
    actor?: SimulationActor;
    expectedTurn?: number;
    command?: { type: 'move'; direction: StageBDirection };
    preStateDigest?: string;
    postStateDigest?: string;
    inputUnchanged?: boolean;
    transition?: StageBNormalizedTransition;
}>;

export type StageBProjection = Readonly<{
    cutId: string;
    cutVersion: number;
    classKey: string;
    projectedValue: JsonValue;
}>;

export type StageBEndpointRecord = Readonly<{
    rowType: 'eligible_endpoint';
    endpointId: string;
    wordIndex: number;
    routeId: string;
    seed: number;
    calling: 'wizard';
    rulesetId: typeof V4_RULESET_ID;
    endpointDepth: 2 | 4 | 8;
    directions: StageBDirection[];
    sourceProjection: StageBProjection;
    preCommandStateDigest: string;
    preCommandRevision: number;
    preCommandMovementRemaining: number;
    actor: SimulationActor;
    expectedTurn: number;
    command: { type: 'move'; direction: 1 };
    readout: StageBNormalizedTransition;
    postCommandStateDigest: string;
    postCommandRevision: number;
    postCommandMovementRemaining: number;
    postCommandProjection: StageBProjection;
    endpointInputUnchanged: boolean;
    frameOk: boolean;
}>;

export type StageBPairEquality = Readonly<{
    commandSemanticEqual: boolean;
    postMovementRemainingEqual: boolean;
    preRevisionEqual: boolean;
    postRevisionEqual: boolean;
    preStateDigestEqual: boolean;
    postStateDigestEqual: boolean;
    routeHistoryEqual: boolean;
}>;

export type StageBAliasPairRecord = Readonly<{
    rowType: 'alias_pair';
    pairId: string;
    classKey: string;
    projectedValue: JsonValue;
    leftEndpointId: string;
    rightEndpointId: string;
    leftRouteId: string;
    rightRouteId: string;
    leftEndpointDepth: 2 | 4 | 8;
    rightEndpointDepth: 2 | 4 | 8;
    leftDirections: StageBDirection[];
    rightDirections: StageBDirection[];
    preCommandMovementRemainingPair: [number, number];
    postCommandMovementRemainingPair: [number, number];
    equality: StageBPairEquality;
    primaryOutcome: StageBPrimaryOutcome;
    targetRelevant: boolean;
}>;

export type StageBFrameSupportFailure = Readonly<{
    rowType: 'frame_support_failure';
    failureRef: string;
    stage: 'initialization' | 'route_prefix' | 'source_projection' | 'next_command' | 'retention';
    message: string;
    routeId?: string;
    directions?: StageBDirection[];
    prefixDepth?: number;
    evidence?: Readonly<{
        operation:
            | 'initialization'
            | 'route_prefix_authority'
            | 'route_prefix_transition_validation'
            | 'source_projection'
            | 'next_command_authority'
            | 'next_command_transition_validation'
            | 'post_command_projection';
        nextCommandAuthorityCallAttempted: boolean;
        prefixAuthorityCallAttempted?: boolean;
        actor?: SimulationActor;
        expectedTurn?: number;
        command?: { type: 'move'; direction: StageBDirection };
        preStateDigest?: string;
        sourceProjection?: StageBProjection;
        returnedAuthorityTransition?: JsonValue;
        normalizedTransition?: StageBNormalizedTransition;
        postStateDigest?: string;
        inputUnchanged?: boolean;
        returnedProjection?: JsonValue;
        postCommandProjection?: StageBProjection;
        thrown?: Readonly<{ name: string; message: string }>;
    }>;
}>;

export type StageBAuthorityDependencies = Readonly<{
    createSimulation: (seed: number, calling: PlayerCalling, rulesetId: typeof V4_RULESET_ID) => SimulationState;
    applySimulationCommand: (
        state: SimulationState,
        actor: SimulationActor,
        command: SimulationCommand,
        expectedTurn: number
    ) => SimulationTransition;
    projectV4SimulationState: (state: SimulationState) => StageBProjection;
    canonicalSimulationJson: (state: SimulationState) => string;
}>;

export type StageBExecution = Readonly<{
    registeredWords: StageBRegisteredWord[];
    routeAttempts: StageBRouteAttempt[];
    rejectedPrefixes: StageBRejectedPrefixRecord[];
    eligibleEndpoints: StageBEndpointRecord[];
    aliasPairs: StageBAliasPairRecord[];
    frameSupportFailures: StageBFrameSupportFailure[];
    sourceClassCount: number;
    eligibleAliasClassCount: number;
    executionComplete: boolean;
}>;

export type StageBChangeRow = Readonly<{
    path: string;
    status: string;
    oldMode: string;
    newMode: string;
    oldBlob: string;
    newBlob: string;
}>;

export type StageBSourceIdentity = Readonly<{
    commit: string;
    tree: string;
    preregistrationSourceCommit: string;
    preregistrationSourceTree: string;
    preregistrationTerminalCommit: string;
    preregistrationTerminalTree: string;
    preregistrationSourceDigest: string;
    preregistrationBindingsDigest: string;
    preregistrationParityDigest: string;
    registration: { path: string; blob: string; sha256: string };
    contract: { path: string; blob: string; sha256: string };
    implementationPaths: StageBSourceRow[];
    range: ReturnType<typeof auditStageBRange>;
    sourceDigest: string;
}>;

export type StageBRawManifest = Readonly<{
    path: string;
    rowCount: number;
    recordsDigest: string;
    fileSha256: string;
}>;

export type StageBSerializedRawOutput = Readonly<{
    path: string;
    rows: readonly JsonValue[];
    text: string;
    manifest: StageBRawManifest;
}>;

export type StageBCrossTabRow = Readonly<{
    endpointOrder: 'canonical_route_id_left_right';
    endpointDepthPair: [number, number];
    depthRelation: 'same_depth' | 'cross_depth';
    preCommandMovementRemainingPair: [number, number];
    postCommandMovementRemainingPair: [number, number];
    knownRouteLengthMovementBudgetPattern: boolean;
    primaryOutcome: StageBPrimaryOutcome;
    pairCount: number;
}>;

export type StageBResult = Readonly<{
    schemaVersion: 1;
    resultId: 'wp-015d2r-stage-b-one-next-command-search-v1';
    packageId: 'WP-015D2R';
    supportWorkPackageId: 'WP-015D2T';
    childId: 'WPV4-NAVIGATOR-01B';
    registrationId: 'WP-015D2R:stage-b-one-next-command-search:v1';
    source: StageBSourceIdentity;
    registrationDigest: string;
    domain: {
        identity: string;
        seedSet: [number];
        alphabet: [-1, 1];
        depths: [2, 4, 8];
        attemptedWordCount: number;
        excludedCalibrationOccurrenceCount: number;
        rejectedPrefixCount: number;
        prunedWordCount: number;
        naturallyReachableEndpointCount: number;
        sourceClassCount: number;
        eligibleAliasClassCount: number;
        eligiblePairCount: number;
        frameSupportFailureCount: number;
        complete: boolean;
        stoppedAtFirstPositive: false;
    };
    primaryOutcomeCounts: Record<StageBPrimaryOutcome, number>;
    targetRelevantPairCount: number;
    rawOutputs: StageBRawManifest[];
    records: {
        routeAttempts: StageBRouteAttempt[];
        rejectedPrefixes: StageBRejectedPrefixRecord[];
        eligibleEndpoints: StageBEndpointRecord[];
        aliasPairs: StageBAliasPairRecord[];
        frameSupportFailures: StageBFrameSupportFailure[];
    };
    digests: {
        sourceDigest: string;
        suiteDigest: string;
        sourceRangeDigest: string;
        domainDigest: string;
        recordsDigest: string;
        outcomesDigest: string;
        crossTabDigest: string;
        parityDigest: string;
    };
    descriptiveCrossTab: {
        authority: 'non_authoritative_descriptive_only';
        interpretationGuard: string;
        rows: StageBCrossTabRow[];
    };
    witnessInterface: {
        W_status: 'absent';
        candidateResultStatus: 'present' | 'absent';
        candidateWitnessPairIds: string[];
        Omega_W_status: 'not_evaluated';
        P_W_status: 'not_evaluated';
        N_W_status: 'not_evaluated';
        J_W: 'not_applicable';
    };
    transition: {
        transitionId: 'TAU-WPV4-RETURN-01A';
        status: 'candidate_unlicensed';
        decodabilityAcrossMove: 'not_evaluated';
        automaticLicenseFromResult: false;
    };
    evidenceClass: 'correlated_reuse';
    analyticalDisposition: 'stopped_for_review' | 'invalid_frame_or_support';
    hardGatesPass: boolean;
    productAuthority: 'none';
    mathematicalPlacementImplication: 'none';
    landfall: false;
    chartRevision: false;
    successorCarrierSelected: false;
    stageC: 'not_opened';
    p5: 'closed';
    stopStatement: 'WP-015D2R Stage B execution stopped for review; Stage C not opened.';
    resultDigest: string;
}>;

/** JSON.parse alone accepts duplicate members; this bounded parser rejects them first. */
export function parseStrictJson(text: string): unknown {
    assert(text.length <= 32 * 1024 * 1024, 'JSON input exceeds the bounded reader size.');
    let offset = 0;
    const whitespace = () => {
        while (offset < text.length && /\s/.test(text[offset] ?? '')) offset += 1;
    };
    const string = (): string => {
        assert.equal(text[offset], '"', 'Expected a JSON string.');
        const start = offset;
        offset += 1;
        while (offset < text.length) {
            const character = text[offset];
            offset += 1;
            if (character === '\\') offset += 1;
            else if (character === '"') return JSON.parse(text.slice(start, offset)) as string;
        }
        throw new TypeError('Unterminated JSON string.');
    };
    const value = (depth: number): void => {
        assert(depth <= 128, 'JSON nesting exceeds the bounded reader depth.');
        whitespace();
        if (text[offset] === '{') {
            offset += 1;
            whitespace();
            const keys = new Set<string>();
            if (text[offset] !== '}') {
                while (true) {
                    whitespace();
                    const key = string();
                    assert(!keys.has(key), `Duplicate JSON key: ${key}`);
                    keys.add(key);
                    whitespace();
                    assert.equal(text[offset], ':', 'Expected a JSON colon.');
                    offset += 1;
                    value(depth + 1);
                    whitespace();
                    if (text[offset] !== ',') break;
                    offset += 1;
                }
            }
            assert.equal(text[offset], '}', 'Expected a JSON object end.');
            offset += 1;
        } else if (text[offset] === '[') {
            offset += 1;
            whitespace();
            if (text[offset] !== ']') {
                while (true) {
                    value(depth + 1);
                    whitespace();
                    if (text[offset] !== ',') break;
                    offset += 1;
                }
            }
            assert.equal(text[offset], ']', 'Expected a JSON array end.');
            offset += 1;
        } else if (text[offset] === '"') {
            string();
        } else {
            const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(offset));
            assert(match, 'Invalid JSON primitive.');
            offset += match[0].length;
        }
    };
    value(0);
    whitespace();
    assert.equal(offset, text.length, 'Trailing JSON content.');
    const parsed: unknown = JSON.parse(text);
    canonicalJson(parsed);
    return parsed;
}

function exact(left: unknown, right: unknown): boolean {
    return canonicalJson(left) === canonicalJson(right);
}

function assertUnique<T>(values: readonly T[], message: string): void {
    assert.equal(new Set(values).size, values.length, message);
}

export function validateStageBRegistration(input: unknown): StageBRegistration {
    assert(input && typeof input === 'object' && !Array.isArray(input), 'Stage B registration must be an object.');
    const registration = input as StageBRegistration;
    assert.equal(sha256Digest(registration), STAGE_B_REGISTRATION_CANONICAL_DIGEST,
        'Stage B canonical registration digest drifted.');
    assert.equal(registration.schemaVersion, 1);
    assert.equal(registration.packageId, 'WP-015D2R');
    assert.equal(registration.supportWorkPackageId, 'WP-015D2S');
    assert.equal(registration.childId, 'WPV4-NAVIGATOR-01B');
    assert.equal(registration.registrationId, 'WP-015D2R:stage-b-one-next-command-search:v1');
    assert.equal(registration.registrationVersion, 1);
    assert.equal(registration.executable, false);
    assert.equal(registration.entryBoundary.stageASourceCommit, 'b2b1822c6714c992c95776d8a6440a667ba72f5d');
    assert.equal(registration.entryBoundary.stageATerminalCommit, '4bcb213c9a1a2619d8699f3fed275e6afa71f03e');
    assert.equal(registration.aliasObservationCut.canonicalName, 'thin_visible_duel_v0@2');
    assert.equal(registration.aliasObservationCut.cutId, STAGE_B_CUT_ID);
    assert.equal(registration.aliasObservationCut.cutVersion, STAGE_B_CUT_VERSION);
    assert.equal(registration.aliasObservationCut.cutDefinitionCanonicalDigest, STAGE_B_EXPECTED_CUT_DIGEST);
    assert.equal(sha256Digest(registration.aliasObservationCut.cutDefinition), STAGE_B_EXPECTED_CUT_DIGEST);
    assert(exact(registration.routeDomain.seedSet, [STAGE_B_SEED]));
    assert.equal(registration.routeDomain.calling, STAGE_B_CALLING);
    assert(exact(registration.routeDomain.commandAlphabet, STAGE_B_DIRECTIONS));
    assert(exact(registration.routeDomain.forbiddenDirections, [0]));
    assert(exact(registration.routeDomain.eligibleEndpointDepths, STAGE_B_DEPTHS));
    assert.equal(registration.routeDomain.theoreticalAttemptedWordCountBeforeLegalityAndHoldout, 276);
    assert.equal(registration.routeDomain.definitionDeclaredComplete, true);
    assert(exact(
        registration.holdoutExclusion.excludedOccurrences.map((row) => row.directions),
        STAGE_B_HOLDOUTS
    ));
    assert.equal(registration.holdoutExclusion.maximumEligibleEndpointOccurrencesBeforeLegality, 274);
    assert(exact(registration.nextCommandAndDecoder.nextCommand, { type: 'move', direction: 1 }));
    assert.equal(registration.nextCommandAndDecoder.horizonAuthorityCalls, 1);
    assert.equal(registration.nextCommandAndDecoder.horizonTickCalls, 0);
    assert.equal(registration.nextCommandAndDecoder.tolerance.numeric, 0);
    assert(exact(registration.outcomeContract.primaryOutcomeEnumInPrecedenceOrder, STAGE_B_PRIMARY_OUTCOMES));
    assert.equal(registration.selectedTransition.transitionId, 'TAU-WPV4-RETURN-01A');
    assert.equal(registration.selectedTransition.status, 'candidate_unlicensed');
    assert.equal(registration.selectedTransition.decodabilityAcrossMove, 'not_evaluated');
    assert.equal(registration.selectedTransition.witnessSupport, 'absent');
    assert.equal(registration.selectedTransition.automaticLicenseFromTargetRelevantSplit, false);
    assert.equal(registration.evidenceCovariance.class, 'correlated_reuse');
    const tracked = registration.outputContracts.futureExecutionPass.allowedTrackedOutputs;
    const raw = registration.outputContracts.futureExecutionPass.allowedIgnoredRawOutputs;
    assertUnique(tracked.map((row) => row.path), 'Duplicate future tracked output path.');
    assertUnique(raw, 'Duplicate future raw output path.');
    assert(exact(tracked.map((row) => row.path), [
        'docs/evidence/wp-015d2t.json',
        'analysis/crpm_world/navigation/assess-wp-015d2r-stage-b-one-next-command-search-v1.ts',
        'scripts/run-wp-015d2r-stage-b-one-next-command-search-v1.ts',
        'tests/crpm-world/wp-015d2r-stage-b-one-next-command-search-v1.test.ts',
        STAGE_B_REPORT_PATH,
        STAGE_B_RESULT_PATH
    ]));
    assert(tracked.every((row) => row.status === 'A' && row.mode === '100644'));
    assert(exact(raw, Object.values(STAGE_B_RAW_PATHS)));
    assert.equal(registration.outputContracts.futureExecutionPass.preregistrationFilesMutable, false);
    assert.equal(registration.outputContracts.futureExecutionPass.existingD2PD2QStageAOrSealedExecutorChangesAllowed, false);
    assert.equal(registration.outputContracts.futureExecutionPass.stageCReviewReturnIncluded, false);
    assertUnique(registration.sourceBindings.rows.map((row) => row.id), 'Duplicate source binding ID.');
    assertUnique(registration.sourceBindings.rows.map((row) => row.path), 'Duplicate source binding path.');
    assertUnique(registration.stageAFrozenArtifacts.map((row) => row.path), 'Duplicate Stage A artifact path.');
    assertUnique(registration.immutableD2PAndD2QArtifacts.rows.map((row) => row.path), 'Duplicate D2P/D2Q artifact path.');
    return registration;
}

export function readStageBRegistration(): StageBRegistration {
    const text = readFileSync(resolve(STAGE_B_ROOT, STAGE_B_REGISTRATION_PATH), 'utf8');
    assert.equal(sha256Text(text), STAGE_B_REGISTRATION_SHA256, 'Stage B registration working bytes drifted.');
    return validateStageBRegistration(parseStrictJson(text));
}

function buildWordsAtDepth(depth: number): StageBDirection[][] {
    let words: StageBDirection[][] = [[]];
    for (let position = 0; position < depth; position += 1) {
        words = words.flatMap((prefix) => STAGE_B_DIRECTIONS.map((direction) => [...prefix, direction]));
    }
    return words;
}

export function routeIdFor(directions: readonly StageBDirection[]): string {
    return `route-${sha256Digest({
        seed: STAGE_B_SEED,
        calling: STAGE_B_CALLING,
        rulesetId: V4_RULESET_ID,
        directions: [...directions]
    })}`;
}

export function buildRegisteredWords(registration = readStageBRegistration()): StageBRegisteredWord[] {
    validateStageBRegistration(registration);
    const words = STAGE_B_DEPTHS.flatMap((depth) => buildWordsAtDepth(depth).map((directions) => ({
        seed: STAGE_B_SEED,
        calling: STAGE_B_CALLING,
        rulesetId: V4_RULESET_ID,
        endpointDepth: depth,
        directions,
        routeId: routeIdFor(directions)
    })));
    assert.equal(words.length, 276, 'Registered route generator did not produce exactly 276 words.');
    assertUnique(words.map((row) => row.routeId), 'Duplicate registered route identity.');
    return words.map((word, wordIndex) => ({ wordIndex, ...word }));
}

export const defaultStageBDependencies: StageBAuthorityDependencies = Object.freeze({
    createSimulation: createBoundSimulation,
    applySimulationCommand: applyBoundSimulationCommand,
    projectV4SimulationState: (state) => projectBoundV4SimulationState(V4_CUT_IDS.thinVisibleDuel, state),
    canonicalSimulationJson: canonicalBoundSimulationJson
});

export function classifyPair(
    left: StageBEndpointRecord,
    right: StageBEndpointRecord,
    frameOk = left.frameOk && right.frameOk
): { equality: StageBPairEquality; primaryOutcome: StageBPrimaryOutcome; targetRelevant: boolean } {
    const equality: StageBPairEquality = {
        commandSemanticEqual: exact(
            {
                accepted: left.readout.accepted,
                mutated: left.readout.mutated,
                error: left.readout.error,
                authoritativeEvents: left.readout.authoritativeEvents
            },
            {
                accepted: right.readout.accepted,
                mutated: right.readout.mutated,
                error: right.readout.error,
                authoritativeEvents: right.readout.authoritativeEvents
            }
        ),
        postMovementRemainingEqual:
            left.postCommandMovementRemaining === right.postCommandMovementRemaining,
        preRevisionEqual: left.preCommandRevision === right.preCommandRevision,
        postRevisionEqual: left.postCommandRevision === right.postCommandRevision,
        preStateDigestEqual: left.preCommandStateDigest === right.preCommandStateDigest,
        postStateDigestEqual: left.postCommandStateDigest === right.postCommandStateDigest,
        routeHistoryEqual: exact(left.directions, right.directions)
    };
    const primaryOutcome: StageBPrimaryOutcome = !frameOk
        ? 'frame_support_failure'
        : !equality.commandSemanticEqual
            ? 'command_semantic_split'
            : !equality.postMovementRemainingEqual
                ? 'continuation_support_split'
                : !equality.preRevisionEqual || !equality.postRevisionEqual ||
                    !equality.preStateDigestEqual || !equality.postStateDigestEqual
                    ? 'provenance_exact_state_only_split'
                    : 'no_target_relevant_split';
    return {
        equality,
        primaryOutcome,
        targetRelevant: primaryOutcome === 'command_semantic_split' ||
            primaryOutcome === 'continuation_support_split'
    };
}

function isHoldout(directions: readonly StageBDirection[]): boolean {
    return STAGE_B_HOLDOUTS.some((holdout) => exact(holdout, directions));
}

function startsWithDirections(
    directions: readonly StageBDirection[],
    prefix: readonly StageBDirection[]
): boolean {
    return prefix.length <= directions.length && prefix.every((value, index) => directions[index] === value);
}

function normalizeTransition(transition: SimulationTransition): StageBNormalizedTransition {
    const authoritativeEvents = deepSortJson(transition.events) as JsonValue[];
    const error = transition.error
        ? { code: transition.error.code, message: transition.error.message }
        : null;
    return {
        accepted: transition.accepted,
        mutated: transition.mutated,
        error,
        authoritativeEvents,
        eventsDigest: sha256Digest(authoritativeEvents)
    };
}

function fixedFrameValue(state: SimulationState): JsonValue {
    return deepSortJson({
        formatVersion: state.formatVersion,
        rulesetId: state.rulesetId,
        rulesetVersion: state.rulesetVersion,
        seed: state.seed,
        rngState: state.rngState,
        tick: state.tick,
        turn: state.turn,
        activeActor: state.activeActor,
        turnDeadlineTick: state.turnDeadlineTick,
        phase: state.phase,
        winner: state.winner,
        finishReason: state.finishReason,
        selectedRelic: state.selectedRelic,
        aim: state.aim,
        units: state.units.map((unit) => ({
            id: unit.id,
            calling: unit.calling,
            stitching: unit.stitching,
            alive: unit.alive
        })),
        terrain: state.terrain,
        lastProjectile: state.lastProjectile
    });
}

function frameProblem(state: SimulationState, initialFixed: JsonValue): string | null {
    if (state.rulesetId !== V4_RULESET_ID || state.rulesetVersion !== 4 || state.formatVersion !== 4) {
        return 'The V4 ruleset or format identity drifted.';
    }
    if (state.seed !== STAGE_B_SEED) return 'The registered seed drifted.';
    if (state.activeActor !== 'player' || state.turn !== 0) {
        return 'The registered activeActor player / turn 0 rule drifted.';
    }
    if (state.tick !== 0 || state.phase !== 'awaiting_command') {
        return 'The registered tick 0 / awaiting_command frame drifted.';
    }
    if (!exact(fixedFrameValue(state), initialFixed)) {
        return 'A coordinate held fixed from legal MOVE prefix history drifted.';
    }
    return null;
}

function projectionProblem(projection: StageBProjection): string | null {
    if (projection.cutId !== STAGE_B_CUT_ID || projection.cutVersion !== STAGE_B_CUT_VERSION) {
        return 'The exact thin_visible_duel_v0@2 projection identity drifted.';
    }
    const expected = `cut-${sha256Digest({
        cutId: STAGE_B_CUT_ID,
        cutVersion: STAGE_B_CUT_VERSION,
        projectedValue: projection.projectedValue
    })}`;
    if (projection.classKey !== expected) return 'The cut class key does not match its exact retained value.';
    canonicalJson(projection.projectedValue);
    return null;
}

function rejectionProblem(
    transition: SimulationTransition,
    beforeJson: string,
    callerAfterJson: string,
    dependencies: StageBAuthorityDependencies
): string | null {
    if (transition.accepted || transition.mutated) return 'An ordinary rejection was accepted or mutated.';
    if (!transition.error) return 'An ordinary rejection lacks its exact error.';
    if (transition.events.length !== 0) return 'An ordinary rejection emitted authoritative events.';
    if (callerAfterJson !== beforeJson) return 'The caller-owned source state was mutated during rejection.';
    if (dependencies.canonicalSimulationJson(transition.state) !== beforeJson) {
        return 'An ordinary rejection changed its returned state.';
    }
    return null;
}

function acceptedTransitionProblem(
    transition: SimulationTransition,
    beforeJson: string,
    callerAfterJson: string,
    dependencies: StageBAuthorityDependencies
): string | null {
    if (!transition.accepted) return 'Expected an accepted transition.';
    if (!transition.mutated) return 'An accepted transition was self-reported as nonmutating.';
    if (transition.error) return 'An accepted transition also carried an error.';
    if (callerAfterJson !== beforeJson) return 'The caller-owned source state was mutated.';
    if (dependencies.canonicalSimulationJson(transition.state) === beforeJson) {
        return 'An accepted transition did not actually change its returned state.';
    }
    return null;
}

function failure(
    stage: StageBFrameSupportFailure['stage'],
    message: string,
    word?: StageBRegisteredWord,
    prefixDepth?: number,
    evidence?: NonNullable<StageBFrameSupportFailure['evidence']>
): StageBFrameSupportFailure {
    const payload = {
        stage,
        message,
        routeId: word?.routeId ?? null,
        directions: word?.directions ?? null,
        prefixDepth: prefixDepth ?? null,
        evidence: evidence ?? null
    };
    return {
        rowType: 'frame_support_failure',
        failureRef: `frame-${sha256Digest(payload)}`,
        stage,
        message,
        ...(word ? { routeId: word.routeId, directions: [...word.directions] } : {}),
        ...(prefixDepth === undefined ? {} : { prefixDepth }),
        ...(evidence === undefined ? {} : { evidence })
    };
}

function retainedJson(value: unknown): JsonValue | undefined {
    try {
        return deepSortJson(value);
    } catch {
        return undefined;
    }
}

function thrownEvidence(error: unknown): Readonly<{ name: string; message: string }> {
    return error instanceof Error
        ? { name: error.name, message: error.message }
        : { name: typeof error, message: String(error) };
}

function retainedNormalizedTransition(
    transition: SimulationTransition
): StageBNormalizedTransition | undefined {
    try {
        return normalizeTransition(transition);
    } catch {
        return undefined;
    }
}

function retainedStateDigest(
    state: SimulationState,
    dependencies: StageBAuthorityDependencies
): string | undefined {
    try {
        return sha256Text(dependencies.canonicalSimulationJson(state));
    } catch {
        return undefined;
    }
}

type ReachableEndpoint = Readonly<{
    word: StageBRegisteredWord;
    state: SimulationState;
    initialFixed: JsonValue;
}>;

/**
 * Executes the preregistered in-memory domain. Dependency injection exists only
 * for destructive controls; the runner uses the bound default dependencies.
 */
export function executeRegisteredRoutes(
    registration = readStageBRegistration(),
    dependencies: StageBAuthorityDependencies = defaultStageBDependencies
): StageBExecution {
    validateStageBRegistration(registration);
    const registeredWords = buildRegisteredWords(registration);
    // Determine both excluded occurrences over pure direction payloads before
    // any dependency can initialize, transition, project or decode a state.
    const holdoutRouteIds = new Set(
        registeredWords.filter((word) => isHoldout(word.directions)).map((word) => word.routeId)
    );
    assert.equal(holdoutRouteIds.size, 2, 'The pure registered holdout must contain exactly two routes.');
    const routeAttempts: StageBRouteAttempt[] = [];
    const rejectedPrefixes: StageBRejectedPrefixRecord[] = [];
    const eligibleEndpoints: StageBEndpointRecord[] = [];
    const aliasPairs: StageBAliasPairRecord[] = [];
    const frameSupportFailures: StageBFrameSupportFailure[] = [];
    const reachable: ReachableEndpoint[] = [];
    const rejectedLedger: StageBDirection[][] = [];
    let initialStateDigest: string | null = null;

    for (const word of registeredWords) {
        // This pure direction-word comparison is deliberately first. No
        // initialization, authority transition or projection may precede it.
        if (holdoutRouteIds.has(word.routeId)) {
            routeAttempts.push({
                rowType: 'route_attempt',
                ...word,
                disposition: 'excluded_calibration_occurrence',
                initializationCount: 0,
                prefixAuthorityCallCount: 0,
                nextCommandAuthorityCallCount: 0
            });
            continue;
        }

        const rejectedPrefix = rejectedLedger.find((prefix) => startsWithDirections(word.directions, prefix));
        if (rejectedPrefix) {
            routeAttempts.push({
                rowType: 'route_attempt',
                ...word,
                disposition: 'pruned_by_rejected_prefix',
                initializationCount: 0,
                prefixAuthorityCallCount: 0,
                nextCommandAuthorityCallCount: 0,
                rejectedPrefix: [...rejectedPrefix]
            });
            rejectedPrefixes.push({
                rowType: 'pruned_by_rejected_prefix',
                routeId: word.routeId,
                directions: [...word.directions],
                rejectedPrefix: [...rejectedPrefix],
                prefixDepth: rejectedPrefix.length
            });
            continue;
        }

        let state: SimulationState;
        try {
            state = dependencies.createSimulation(STAGE_B_SEED, STAGE_B_CALLING, V4_RULESET_ID);
        } catch (error) {
            const thrown = thrownEvidence(error);
            const row = failure('initialization', thrown.message, word, 0, {
                operation: 'initialization',
                nextCommandAuthorityCallAttempted: false,
                prefixAuthorityCallAttempted: false,
                thrown
            });
            frameSupportFailures.push(row);
            routeAttempts.push({
                rowType: 'route_attempt',
                ...word,
                disposition: 'frame_support_failure',
                initializationCount: 1,
                prefixAuthorityCallCount: 0,
                nextCommandAuthorityCallCount: 0,
                failureRef: row.failureRef
            });
            break;
        }
        const initialFixed = fixedFrameValue(state);
        const initialProblem = frameProblem(state, initialFixed);
        const routeInitialDigest = sha256Text(dependencies.canonicalSimulationJson(state));
        if (initialStateDigest === null) initialStateDigest = routeInitialDigest;
        const deterministicProblem = routeInitialDigest === initialStateDigest
            ? null
            : 'Fresh deterministic initialization differs across registered words.';
        if (initialProblem || deterministicProblem) {
            const row = failure('initialization', initialProblem ?? deterministicProblem!, word, 0, {
                operation: 'initialization',
                nextCommandAuthorityCallAttempted: false,
                prefixAuthorityCallAttempted: false,
                preStateDigest: routeInitialDigest
            });
            frameSupportFailures.push(row);
            routeAttempts.push({
                rowType: 'route_attempt',
                ...word,
                disposition: 'frame_support_failure',
                initializationCount: 1,
                prefixAuthorityCallCount: 0,
                nextCommandAuthorityCallCount: 0,
                failureRef: row.failureRef
            });
            break;
        }

        let prefixCalls = 0;
        let terminated = false;
        for (let index = 0; index < word.directions.length; index += 1) {
            const direction = word.directions[index];
            const beforeJson = dependencies.canonicalSimulationJson(state);
            const actor = state.activeActor;
            const expectedTurn = state.turn;
            let transition: SimulationTransition;
            try {
                transition = dependencies.applySimulationCommand(
                    state,
                    actor,
                    { type: 'move', direction },
                    expectedTurn
                );
            } catch (error) {
                const thrown = thrownEvidence(error);
                const row = failure(
                    'route_prefix',
                    thrown.message,
                    word,
                    index + 1,
                    {
                        operation: 'route_prefix_authority',
                        nextCommandAuthorityCallAttempted: false,
                        prefixAuthorityCallAttempted: true,
                        actor,
                        expectedTurn,
                        command: { type: 'move', direction },
                        preStateDigest: sha256Text(beforeJson),
                        thrown
                    }
                );
                frameSupportFailures.push(row);
                routeAttempts.push({
                    rowType: 'route_attempt',
                    ...word,
                    disposition: 'frame_support_failure',
                    initializationCount: 1,
                    prefixAuthorityCallCount: prefixCalls + 1,
                    nextCommandAuthorityCallCount: 0,
                    failureRef: row.failureRef
                });
                terminated = true;
                break;
            }
            prefixCalls += 1;
            const callerAfterJson = dependencies.canonicalSimulationJson(state);

            if (!transition.accepted) {
                const malformed = rejectionProblem(transition, beforeJson, callerAfterJson, dependencies);
                if (malformed) {
                    const returnedAuthorityTransition = retainedJson(transition);
                    const normalizedTransition = retainedNormalizedTransition(transition);
                    const postStateDigest = retainedStateDigest(transition.state, dependencies);
                    const row = failure('route_prefix', malformed, word, index + 1, {
                        operation: 'route_prefix_transition_validation',
                        nextCommandAuthorityCallAttempted: false,
                        prefixAuthorityCallAttempted: true,
                        actor,
                        expectedTurn,
                        command: { type: 'move', direction },
                        preStateDigest: sha256Text(beforeJson),
                        ...(returnedAuthorityTransition === undefined
                            ? {}
                            : { returnedAuthorityTransition }),
                        ...(normalizedTransition === undefined ? {} : { normalizedTransition }),
                        ...(postStateDigest === undefined ? {} : { postStateDigest }),
                        inputUnchanged: callerAfterJson === beforeJson
                    });
                    frameSupportFailures.push(row);
                    routeAttempts.push({
                        rowType: 'route_attempt',
                        ...word,
                        disposition: 'frame_support_failure',
                        initializationCount: 1,
                        prefixAuthorityCallCount: prefixCalls,
                        nextCommandAuthorityCallCount: 0,
                        failureRef: row.failureRef
                    });
                } else {
                    const exactPrefix = word.directions.slice(0, index + 1);
                    const normalized = normalizeTransition(transition);
                    rejectedLedger.push(exactPrefix);
                    rejectedPrefixes.push({
                        rowType: 'rejected_prefix',
                        routeId: word.routeId,
                        directions: [...word.directions],
                        rejectedPrefix: exactPrefix,
                        prefixDepth: index + 1,
                        actor,
                        expectedTurn,
                        command: { type: 'move', direction },
                        preStateDigest: sha256Text(beforeJson),
                        postStateDigest: sha256Text(
                            dependencies.canonicalSimulationJson(transition.state)
                        ),
                        inputUnchanged: callerAfterJson === beforeJson,
                        transition: normalized
                    });
                    routeAttempts.push({
                        rowType: 'route_attempt',
                        ...word,
                        disposition: 'rejected_prefix',
                        initializationCount: 1,
                        prefixAuthorityCallCount: prefixCalls,
                        nextCommandAuthorityCallCount: 0,
                        rejectedPrefix: exactPrefix,
                        rejection: normalized
                    });
                }
                terminated = true;
                break;
            }

            const malformed = acceptedTransitionProblem(transition, beforeJson, callerAfterJson, dependencies) ??
                frameProblem(transition.state, initialFixed);
            if (malformed) {
                const returnedAuthorityTransition = retainedJson(transition);
                const normalizedTransition = retainedNormalizedTransition(transition);
                const postStateDigest = retainedStateDigest(transition.state, dependencies);
                const row = failure('route_prefix', malformed, word, index + 1, {
                    operation: 'route_prefix_transition_validation',
                    nextCommandAuthorityCallAttempted: false,
                    prefixAuthorityCallAttempted: true,
                    actor,
                    expectedTurn,
                    command: { type: 'move', direction },
                    preStateDigest: sha256Text(beforeJson),
                    ...(returnedAuthorityTransition === undefined
                        ? {}
                        : { returnedAuthorityTransition }),
                    ...(normalizedTransition === undefined ? {} : { normalizedTransition }),
                    ...(postStateDigest === undefined ? {} : { postStateDigest }),
                    inputUnchanged: callerAfterJson === beforeJson
                });
                frameSupportFailures.push(row);
                routeAttempts.push({
                    rowType: 'route_attempt',
                    ...word,
                    disposition: 'frame_support_failure',
                    initializationCount: 1,
                    prefixAuthorityCallCount: prefixCalls,
                    nextCommandAuthorityCallCount: 0,
                    failureRef: row.failureRef
                });
                terminated = true;
                break;
            }
            state = transition.state;
        }

        if (frameSupportFailures.length > 0) break;
        if (terminated) continue;
        routeAttempts.push({
            rowType: 'route_attempt',
            ...word,
            disposition: 'eligible_endpoint',
            initializationCount: 1,
            prefixAuthorityCallCount: prefixCalls,
            nextCommandAuthorityCallCount: 0
        });
        reachable.push({ word, state, initialFixed });
    }

    if (frameSupportFailures.length === 0) {
        for (const candidate of reachable) {
            const { word, state, initialFixed } = candidate;
            const sourceInputBeforeProjection = dependencies.canonicalSimulationJson(state);
            const preCommandStateDigest = sha256Text(sourceInputBeforeProjection);
            const attemptIndex = routeAttempts.findIndex((row) => row.routeId === word.routeId);
            assert(attemptIndex >= 0);
            assert.equal(routeAttempts[attemptIndex].disposition, 'eligible_endpoint');
            assert.equal(routeAttempts[attemptIndex].nextCommandAuthorityCallCount, 0);
            let sourceProjection: StageBProjection;
            try {
                sourceProjection = deepSortJson(dependencies.projectV4SimulationState(state)) as StageBProjection;
            } catch (error) {
                const thrown = thrownEvidence(error);
                const row = failure('source_projection', thrown.message, word, undefined, {
                    operation: 'source_projection',
                    nextCommandAuthorityCallAttempted: false,
                    preStateDigest: preCommandStateDigest,
                    thrown
                });
                frameSupportFailures.push(row);
                break;
            }
            let sourceProjectionInputUnchanged = false;
            let sourceProjectionProblem: string | null;
            try {
                sourceProjectionInputUnchanged =
                    dependencies.canonicalSimulationJson(state) === sourceInputBeforeProjection;
                sourceProjectionProblem = !sourceProjectionInputUnchanged
                    ? 'The thin source projector mutated its endpoint input.'
                    : projectionProblem(sourceProjection);
            } catch (error) {
                const thrown = thrownEvidence(error);
                frameSupportFailures.push(failure('source_projection', thrown.message, word, undefined, {
                    operation: 'source_projection',
                    nextCommandAuthorityCallAttempted: false,
                    preStateDigest: preCommandStateDigest,
                    returnedProjection: retainedJson(sourceProjection),
                    thrown
                }));
                break;
            }
            if (sourceProjectionProblem) {
                frameSupportFailures.push(failure('source_projection', sourceProjectionProblem, word, undefined, {
                    operation: 'source_projection',
                    nextCommandAuthorityCallAttempted: false,
                    preStateDigest: preCommandStateDigest,
                    returnedProjection: retainedJson(sourceProjection),
                    inputUnchanged: sourceProjectionInputUnchanged
                }));
                break;
            }
            const beforeJson = sourceInputBeforeProjection;
            const actor = state.activeActor;
            const expectedTurn = state.turn;
            const command = { type: 'move', direction: 1 } as const;
            // Increment at the call boundary, not after successful decoding: a
            // throwing or malformed authority return is still one exact call.
            routeAttempts[attemptIndex] = {
                ...routeAttempts[attemptIndex],
                nextCommandAuthorityCallCount: 1
            };
            let transition: SimulationTransition;
            try {
                transition = dependencies.applySimulationCommand(
                    state,
                    actor,
                    command,
                    expectedTurn
                );
            } catch (error) {
                const thrown = thrownEvidence(error);
                frameSupportFailures.push(failure(
                    'next_command',
                    thrown.message,
                    word,
                    undefined,
                    {
                        operation: 'next_command_authority',
                        nextCommandAuthorityCallAttempted: true,
                        actor,
                        expectedTurn,
                        command,
                        preStateDigest: preCommandStateDigest,
                        sourceProjection,
                        thrown
                    }
                ));
                break;
            }
            const returnedAuthorityTransition = retainedJson(transition);
            let callerAfterJson: string;
            let transitionShapeProblem: string | null;
            let postFrameProblem: string | null;
            let postInputBeforeProjection: string;
            let normalizedTransition: StageBNormalizedTransition;
            try {
                callerAfterJson = dependencies.canonicalSimulationJson(state);
                transitionShapeProblem = transition.accepted
                    ? acceptedTransitionProblem(transition, beforeJson, callerAfterJson, dependencies)
                    : rejectionProblem(transition, beforeJson, callerAfterJson, dependencies);
                postFrameProblem = frameProblem(transition.state, initialFixed);
                postInputBeforeProjection = dependencies.canonicalSimulationJson(transition.state);
                normalizedTransition = normalizeTransition(transition);
            } catch (error) {
                const thrown = thrownEvidence(error);
                frameSupportFailures.push(failure(
                    'next_command',
                    thrown.message,
                    word,
                    undefined,
                    {
                        operation: 'next_command_transition_validation',
                        nextCommandAuthorityCallAttempted: true,
                        actor,
                        expectedTurn,
                        command,
                        preStateDigest: preCommandStateDigest,
                        sourceProjection,
                        ...(returnedAuthorityTransition === undefined
                            ? {}
                            : { returnedAuthorityTransition }),
                        thrown
                    }
                ));
                break;
            }
            if (transitionShapeProblem || postFrameProblem) {
                frameSupportFailures.push(failure(
                    'next_command',
                    transitionShapeProblem ?? postFrameProblem!,
                    word,
                    undefined,
                    {
                        operation: 'next_command_transition_validation',
                        nextCommandAuthorityCallAttempted: true,
                        actor,
                        expectedTurn,
                        command,
                        preStateDigest: preCommandStateDigest,
                        sourceProjection,
                        ...(returnedAuthorityTransition === undefined
                            ? {}
                            : { returnedAuthorityTransition }),
                        normalizedTransition,
                        postStateDigest: sha256Text(postInputBeforeProjection),
                        inputUnchanged: callerAfterJson === beforeJson
                    }
                ));
                break;
            }
            let postCommandProjection: StageBProjection;
            try {
                postCommandProjection = deepSortJson(
                    dependencies.projectV4SimulationState(transition.state)
                ) as StageBProjection;
            } catch (error) {
                const thrown = thrownEvidence(error);
                frameSupportFailures.push(failure(
                    'next_command',
                    thrown.message,
                    word,
                    undefined,
                    {
                        operation: 'post_command_projection',
                        nextCommandAuthorityCallAttempted: true,
                        actor,
                        expectedTurn,
                        command,
                        preStateDigest: preCommandStateDigest,
                        sourceProjection,
                        ...(returnedAuthorityTransition === undefined
                            ? {}
                            : { returnedAuthorityTransition }),
                        normalizedTransition,
                        postStateDigest: sha256Text(postInputBeforeProjection),
                        inputUnchanged: callerAfterJson === beforeJson,
                        thrown
                    }
                ));
                break;
            }
            let postProjectionProblem: string | null;
            try {
                postProjectionProblem = dependencies.canonicalSimulationJson(transition.state) !==
                    postInputBeforeProjection
                    ? 'The thin post-command projector mutated its state input.'
                    : projectionProblem(postCommandProjection);
            } catch (error) {
                const thrown = thrownEvidence(error);
                frameSupportFailures.push(failure(
                    'next_command',
                    thrown.message,
                    word,
                    undefined,
                    {
                        operation: 'post_command_projection',
                        nextCommandAuthorityCallAttempted: true,
                        actor,
                        expectedTurn,
                        command,
                        preStateDigest: preCommandStateDigest,
                        sourceProjection,
                        ...(returnedAuthorityTransition === undefined
                            ? {}
                            : { returnedAuthorityTransition }),
                        normalizedTransition,
                        postStateDigest: sha256Text(postInputBeforeProjection),
                        inputUnchanged: callerAfterJson === beforeJson,
                        returnedProjection: retainedJson(postCommandProjection),
                        thrown
                    }
                ));
                break;
            }
            if (postProjectionProblem) {
                frameSupportFailures.push(failure('next_command', postProjectionProblem, word, undefined, {
                    operation: 'post_command_projection',
                    nextCommandAuthorityCallAttempted: true,
                    actor,
                    expectedTurn,
                    command,
                    preStateDigest: preCommandStateDigest,
                    sourceProjection,
                    ...(returnedAuthorityTransition === undefined
                        ? {}
                        : { returnedAuthorityTransition }),
                    normalizedTransition,
                    postStateDigest: sha256Text(postInputBeforeProjection),
                    inputUnchanged: callerAfterJson === beforeJson,
                    returnedProjection: retainedJson(postCommandProjection)
                }));
                break;
            }
            const postCommandStateDigest = sha256Text(postInputBeforeProjection);
            const endpointId = `endpoint-${sha256Digest({
                routeId: word.routeId,
                sourceProjection,
                preCommandStateDigest
            })}`;
            eligibleEndpoints.push({
                rowType: 'eligible_endpoint',
                endpointId,
                ...word,
                sourceProjection,
                preCommandStateDigest,
                preCommandRevision: state.revision,
                preCommandMovementRemaining: state.movementRemaining,
                actor,
                expectedTurn,
                command,
                readout: normalizedTransition,
                postCommandStateDigest,
                postCommandRevision: transition.state.revision,
                postCommandMovementRemaining: transition.state.movementRemaining,
                postCommandProjection,
                endpointInputUnchanged: callerAfterJson === beforeJson,
                frameOk: true
            });
        }
    }

    let sourceClassCount = 0;
    let eligibleAliasClassCount = 0;
    if (frameSupportFailures.length === 0) {
        assertUnique(eligibleEndpoints.map((row) => row.endpointId), 'Duplicate endpoint identity.');
        const classes = new Map<string, StageBEndpointRecord[]>();
        for (const endpoint of eligibleEndpoints) {
            const exactClass = canonicalJson({
                cutId: endpoint.sourceProjection.cutId,
                cutVersion: endpoint.sourceProjection.cutVersion,
                projectedValue: endpoint.sourceProjection.projectedValue
            });
            const members = classes.get(exactClass) ?? [];
            members.push(endpoint);
            classes.set(exactClass, members);
        }
        sourceClassCount = classes.size;
        for (const members of classes.values()) {
            members.sort((left, right) => compareCanonicalText(left.routeId, right.routeId));
            if (members.length < 2) continue;
            eligibleAliasClassCount += 1;
            for (let leftIndex = 0; leftIndex < members.length - 1; leftIndex += 1) {
                for (let rightIndex = leftIndex + 1; rightIndex < members.length; rightIndex += 1) {
                    const left = members[leftIndex];
                    const right = members[rightIndex];
                    assert(exact(left.sourceProjection.projectedValue, right.sourceProjection.projectedValue));
                    assert.equal(left.sourceProjection.classKey, right.sourceProjection.classKey);
                    const classified = classifyPair(left, right);
                    const pairId = `pair-${sha256Digest({
                        classKey: left.sourceProjection.classKey,
                        leftEndpointId: left.endpointId,
                        rightEndpointId: right.endpointId
                    })}`;
                    aliasPairs.push({
                        rowType: 'alias_pair',
                        pairId,
                        classKey: left.sourceProjection.classKey,
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
                        ...classified
                    });
                }
            }
        }
        aliasPairs.sort((left, right) => compareCanonicalText(left.pairId, right.pairId));
        assertUnique(aliasPairs.map((row) => row.pairId), 'Duplicate alias-pair identity.');
    }

    const executionComplete = frameSupportFailures.length === 0 &&
        routeAttempts.length === registeredWords.length &&
        routeAttempts.every((row) => row.disposition !== 'frame_support_failure') &&
        eligibleEndpoints.length === reachable.length;
    return {
        registeredWords,
        routeAttempts,
        rejectedPrefixes,
        eligibleEndpoints,
        aliasPairs,
        frameSupportFailures,
        sourceClassCount,
        eligibleAliasClassCount,
        executionComplete
    };
}

function gitBytes(args: readonly string[], repositoryRoot = STAGE_B_ROOT): Buffer {
    return execFileSync('git', [...args], {
        cwd: repositoryRoot,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 64 * 1024 * 1024
    });
}

function git(args: readonly string[], repositoryRoot = STAGE_B_ROOT): string {
    return gitBytes(args, repositoryRoot).toString('utf8').trim();
}

function sha256Bytes(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('hex');
}

export function parseRawDiff(text: string): StageBChangeRow[] {
    const parts = text.split('\0');
    if (parts.at(-1) === '') parts.pop();
    assert.equal(parts.length % 2, 0, 'Malformed raw Git delta.');
    const rows: StageBChangeRow[] = [];
    for (let index = 0; index < parts.length; index += 2) {
        const match = /^:(\d{6}) (\d{6}) ([0-9a-f]{40}) ([0-9a-f]{40}) ([A-Z][0-9]*)$/.exec(parts[index]);
        assert(match, 'Malformed raw Git status/mode/blob row.');
        rows.push({
            path: parts[index + 1],
            status: match[5],
            oldMode: match[1],
            newMode: match[2],
            oldBlob: match[3],
            newBlob: match[4]
        });
    }
    return rows;
}

export function validateChangeRows(
    rows: readonly StageBChangeRow[],
    allowedPaths: readonly string[],
    phase: 'endpoint' | 'intermediate' = 'endpoint'
): void {
    assertUnique(rows.map((row) => row.path), 'Duplicate changed path.');
    for (const row of rows) {
        assert(allowedPaths.includes(row.path), `Undeclared Stage B execution path: ${row.path}`);
        assert(phase === 'endpoint' ? row.status === 'A' : ['A', 'M'].includes(row.status),
            `Disallowed Stage B ${phase} status ${row.status}: ${row.path}`);
        assert.equal(row.oldMode, row.status === 'A' ? '000000' : '100644',
            `Invalid old mode for Stage B ${row.status} row: ${row.path}`);
        assert.equal(row.newMode, '100644', `Stage B output is not a regular 100644 file: ${row.path}`);
        assert.equal(row.oldBlob === '0'.repeat(40), row.status === 'A');
        assert(/^[0-9a-f]{40}$/.test(row.newBlob) && row.newBlob !== '0'.repeat(40));
        if (row.status === 'M') assert.notEqual(row.oldBlob, row.newBlob,
            `Stage B modification row retained the same blob: ${row.path}`);
    }
}

export function auditStageBRange(
    base: string,
    result: string,
    allowedPaths: readonly string[],
    repositoryRoot = STAGE_B_ROOT
): {
    baseCommit: string;
    resultCommit: string;
    endpointRows: StageBChangeRow[];
    commits: { commit: string; parent: string; rows: StageBChangeRow[] }[];
} {
    const baseCommit = git(['rev-parse', `${base}^{commit}`], repositoryRoot);
    const resultCommit = git(['rev-parse', `${result}^{commit}`], repositoryRoot);
    git(['merge-base', '--is-ancestor', baseCommit, resultCommit], repositoryRoot);
    const delta = (before: string, after: string): StageBChangeRow[] => {
        const rows = parseRawDiff(gitBytes([
            'diff', '--no-ext-diff', '--raw', '--no-renames', '--abbrev=40', '-z', before, after, '--'
        ], repositoryRoot).toString('utf8'));
        validateChangeRows(rows, allowedPaths, 'endpoint');
        return rows;
    };
    const endpointRows = delta(baseCommit, resultCommit);
    const revisions = git(['rev-list', '--reverse', `${baseCommit}..${resultCommit}`], repositoryRoot)
        .split('\n')
        .filter(Boolean);
    let parent = baseCommit;
    const commits = revisions.map((commit) => {
        assert.equal(git(['show', '-s', '--format=%P', commit], repositoryRoot), parent,
            'The Stage B execution range must be linear and complete.');
        const rows = parseRawDiff(gitBytes([
            'diff', '--no-ext-diff', '--raw', '--no-renames', '--abbrev=40', '-z', parent, commit, '--'
        ], repositoryRoot).toString('utf8'));
        validateChangeRows(rows, allowedPaths, 'intermediate');
        const record = { commit, parent, rows };
        parent = commit;
        return record;
    });
    assert.equal(parent, resultCommit);
    return { baseCommit, resultCommit, endpointRows, commits };
}

function treeBinding(
    ref: string,
    path: string,
    repositoryRoot = STAGE_B_ROOT
): StageBSourceRow {
    const treeRow = git(['ls-tree', ref, '--', path], repositoryRoot);
    const match = /^(100644) blob ([0-9a-f]{40})\t/.exec(treeRow);
    assert(match, `Missing or nonregular source path at ${ref}: ${path}`);
    const bytes = gitBytes(['show', `${ref}:${path}`], repositoryRoot);
    return {
        path,
        mode: match[1],
        blob: match[2],
        sha256: sha256Bytes(bytes)
    };
}

function assertWorkingBlob(
    path: string,
    expectedBlob: string,
    repositoryRoot = STAGE_B_ROOT
): void {
    const fullPath = resolve(repositoryRoot, path);
    const stat = lstatSync(fullPath);
    assert(stat.isFile() && !stat.isSymbolicLink(), `Source is not a regular file: ${path}`);
    assert.equal(git(['hash-object', '--path', path, path], repositoryRoot), expectedBlob,
        `Working Git bytes drifted: ${path}`);
}

function verifyRecordedRow(
    ref: string,
    row: StageBSourceRow,
    repositoryRoot = STAGE_B_ROOT
): void {
    const actual = treeBinding(ref, row.path, repositoryRoot);
    assert.equal(actual.mode, row.mode, `Source mode drift: ${row.path}`);
    assert.equal(actual.blob, row.blob, `Source blob drift: ${row.path}`);
    assert.equal(actual.sha256, row.sha256, `Source byte digest drift: ${row.path}`);
    assertWorkingBlob(row.path, row.blob, repositoryRoot);
}

/** Verifies every immutable source before the runner performs any authority call. */
export function verifyStageBSourceBindings(
    registration = readStageBRegistration()
): StageBSourceIdentity {
    validateStageBRegistration(registration);
    assert.equal(git(['status', '--porcelain=v1', '--untracked-files=all']), '',
        'Execute Stage B exactly once from a clean, committed source worktree.');
    const commit = git(['rev-parse', 'HEAD^{commit}']);
    const tree = git(['rev-parse', 'HEAD^{tree}']);
    assert.equal(git(['rev-parse', `${STAGE_B_PREREGISTRATION_SOURCE_COMMIT}^{tree}`]),
        STAGE_B_PREREGISTRATION_SOURCE_TREE);
    assert.equal(git(['rev-parse', `${STAGE_B_PREREGISTRATION_TERMINAL_COMMIT}^{tree}`]),
        STAGE_B_PREREGISTRATION_TERMINAL_TREE);
    git(['merge-base', '--is-ancestor', STAGE_B_PREREGISTRATION_TERMINAL_COMMIT, commit]);

    const contractAtSource = treeBinding(STAGE_B_PREREGISTRATION_SOURCE_COMMIT, STAGE_B_CONTRACT_PATH);
    assert.equal(contractAtSource.blob, STAGE_B_CONTRACT_BLOB);
    assert.equal(contractAtSource.sha256, STAGE_B_CONTRACT_SHA256);
    const registrationAtSource = treeBinding(
        STAGE_B_PREREGISTRATION_SOURCE_COMMIT,
        STAGE_B_REGISTRATION_PATH
    );
    assert.equal(registrationAtSource.blob, STAGE_B_REGISTRATION_BLOB);
    assert.equal(registrationAtSource.sha256, STAGE_B_REGISTRATION_SHA256);
    for (const ref of [STAGE_B_PREREGISTRATION_TERMINAL_COMMIT, commit]) {
        assert.equal(treeBinding(ref, STAGE_B_CONTRACT_PATH).blob, STAGE_B_CONTRACT_BLOB,
            `Immutable Stage B contract drifted at ${ref}.`);
        assert.equal(treeBinding(ref, STAGE_B_REGISTRATION_PATH).blob, STAGE_B_REGISTRATION_BLOB,
            `Immutable Stage B registration drifted at ${ref}.`);
    }
    assertWorkingBlob(STAGE_B_CONTRACT_PATH, STAGE_B_CONTRACT_BLOB);
    assertWorkingBlob(STAGE_B_REGISTRATION_PATH, STAGE_B_REGISTRATION_BLOB);

    registration.sourceBindings.rows.forEach((row) =>
        verifyRecordedRow(registration.sourceBindings.boundCommit, row));
    registration.stageAFrozenArtifacts.forEach((row) =>
        verifyRecordedRow(row.sourceCommit ?? STAGE_B_PREREGISTRATION_TERMINAL_COMMIT, row));
    registration.immutableD2PAndD2QArtifacts.rows.forEach((row) =>
        verifyRecordedRow(registration.immutableD2PAndD2QArtifacts.boundCommit, row));

    const allowed = registration.outputContracts.futureExecutionPass.allowedTrackedOutputs
        .map((row) => row.path);
    const range = auditStageBRange(STAGE_B_PREREGISTRATION_TERMINAL_COMMIT, commit, allowed);
    assert.deepEqual(
        range.endpointRows.map((row) => row.path).sort(compareCanonicalText),
        [...STAGE_B_EXECUTION_SOURCE_PATHS].sort(compareCanonicalText),
        'The clean execution-source commit must contain exactly the four preregistered source outputs.'
    );
    const implementationPaths = STAGE_B_EXECUTION_SOURCE_PATHS.map((path) => ({
        ...treeBinding(commit, path),
        role: 'stage_b_execution_source'
    }));

    // Ignored raw output is not visible to Git status, so bind the one-shot
    // source boundary by requiring every durable and raw result path absent.
    for (const path of [STAGE_B_RESULT_PATH, STAGE_B_REPORT_PATH, ...Object.values(STAGE_B_RAW_PATHS)]) {
        assert(!existsSync(resolve(STAGE_B_ROOT, path)), `Stage B output already exists before execution: ${path}`);
    }
    const rawRoot = resolve(STAGE_B_ROOT, dirname(STAGE_B_RAW_PATHS.routeAttempts));
    if (existsSync(rawRoot)) {
        const rawRootStat = lstatSync(rawRoot);
        assert(rawRootStat.isDirectory() && !rawRootStat.isSymbolicLink(),
            'Stage B raw root must be a real directory.');
        assert.deepEqual(readdirSync(rawRoot), [],
            'Stage B raw root must be empty before the one-shot execution.');
    }

    const payload = {
        commit,
        tree,
        preregistrationSourceCommit: STAGE_B_PREREGISTRATION_SOURCE_COMMIT,
        preregistrationSourceTree: STAGE_B_PREREGISTRATION_SOURCE_TREE,
        preregistrationTerminalCommit: STAGE_B_PREREGISTRATION_TERMINAL_COMMIT,
        preregistrationTerminalTree: STAGE_B_PREREGISTRATION_TERMINAL_TREE,
        preregistrationSourceDigest: STAGE_B_PREREGISTRATION_SOURCE_DIGEST,
        preregistrationBindingsDigest: STAGE_B_PREREGISTRATION_BINDINGS_DIGEST,
        preregistrationParityDigest: STAGE_B_PREREGISTRATION_PARITY_DIGEST,
        registration: {
            path: STAGE_B_REGISTRATION_PATH,
            blob: STAGE_B_REGISTRATION_BLOB,
            sha256: STAGE_B_REGISTRATION_SHA256
        },
        contract: {
            path: STAGE_B_CONTRACT_PATH,
            blob: STAGE_B_CONTRACT_BLOB,
            sha256: STAGE_B_CONTRACT_SHA256
        },
        implementationPaths,
        range
    };
    return { ...payload, sourceDigest: sha256Digest(payload) };
}

/**
 * Re-authenticates the result's recorded source against Git without invoking
 * any simulation or projection dependency. This is deliberately separate from
 * pure result validation so synthetic fixtures remain possible, but every
 * publication verification must call it.
 */
export function verifyStageBRecordedSourceIdentity(
    source: StageBSourceIdentity,
    repositoryRoot = STAGE_B_ROOT
): void {
    const commit = git(['rev-parse', `${source.commit}^{commit}`], repositoryRoot);
    assert.equal(commit, source.commit, 'Recorded Stage B source commit does not resolve exactly.');
    assert.equal(
        git(['rev-parse', `${commit}^{tree}`], repositoryRoot),
        source.tree,
        'Recorded Stage B source tree does not match Git.'
    );
    const currentCommit = git(['rev-parse', 'HEAD^{commit}'], repositoryRoot);
    git(['merge-base', '--is-ancestor', commit, currentCommit], repositoryRoot);

    const contract = treeBinding(commit, STAGE_B_CONTRACT_PATH, repositoryRoot);
    assert.equal(contract.blob, STAGE_B_CONTRACT_BLOB, 'Immutable Stage B contract drifted at source.');
    assert.equal(contract.sha256, STAGE_B_CONTRACT_SHA256);
    const registration = treeBinding(commit, STAGE_B_REGISTRATION_PATH, repositoryRoot);
    assert.equal(registration.blob, STAGE_B_REGISTRATION_BLOB,
        'Immutable Stage B registration drifted at source.');
    assert.equal(registration.sha256, STAGE_B_REGISTRATION_SHA256);

    const implementationPaths = STAGE_B_EXECUTION_SOURCE_PATHS.map((path) => ({
        ...treeBinding(commit, path, repositoryRoot),
        role: 'stage_b_execution_source'
    }));
    assert(exact(source.implementationPaths, implementationPaths),
        'Recorded Stage B implementation path identities do not match Git.');
    const range = auditStageBRange(
        STAGE_B_PREREGISTRATION_TERMINAL_COMMIT,
        commit,
        STAGE_B_EXECUTION_SOURCE_PATHS,
        repositoryRoot
    );
    assert(exact(source.range, range), 'Recorded Stage B source range does not match Git.');
    const { sourceDigest, ...sourcePayload } = source;
    assert.equal(sourceDigest, sha256Digest(sourcePayload), 'Recorded Stage B source digest mismatch.');
}

function jsonl(rows: readonly unknown[]): string {
    return rows.map((row) => canonicalJson(row)).join('\n') + (rows.length > 0 ? '\n' : '');
}

export function serializeStageBRawOutputs(execution: StageBExecution): StageBSerializedRawOutput[] {
    const rowSets: { path: string; rows: readonly unknown[] }[] = [
        { path: STAGE_B_RAW_PATHS.routeAttempts, rows: execution.routeAttempts },
        { path: STAGE_B_RAW_PATHS.rejectedPrefixes, rows: execution.rejectedPrefixes },
        { path: STAGE_B_RAW_PATHS.eligibleEndpoints, rows: execution.eligibleEndpoints },
        { path: STAGE_B_RAW_PATHS.aliasPairs, rows: execution.aliasPairs },
        { path: STAGE_B_RAW_PATHS.frameSupportFailures, rows: execution.frameSupportFailures }
    ];
    return rowSets.map(({ path, rows }) => {
        const text = jsonl(rows);
        return {
            path,
            rows: deepSortJson(rows) as JsonValue[],
            text,
            manifest: {
                path,
                rowCount: rows.length,
                recordsDigest: sha256Digest(rows),
                fileSha256: sha256Text(text)
            }
        };
    });
}

export function buildStageBCrossTab(pairs: readonly StageBAliasPairRecord[]): StageBCrossTabRow[] {
    const cells = new Map<string, StageBCrossTabRow>();
    for (const pair of pairs) {
        // Alias-pair left/right is already fixed by canonical route-ID order.
        // Retain that single ordering for every coordinate: independently
        // sorting the three pairs destroys their endpoint-wise association.
        const endpointDepthPair: [number, number] = [
            pair.leftEndpointDepth, pair.rightEndpointDepth
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
        const row: StageBCrossTabRow = {
            endpointOrder: 'canonical_route_id_left_right',
            endpointDepthPair,
            depthRelation: endpointDepthPair[0] === endpointDepthPair[1] ? 'same_depth' : 'cross_depth',
            preCommandMovementRemainingPair,
            postCommandMovementRemainingPair,
            knownRouteLengthMovementBudgetPattern:
                depthDelta !== 0 && preBudgetDelta !== 0 && depthDelta * preBudgetDelta < 0,
            primaryOutcome: pair.primaryOutcome,
            pairCount: 1
        };
        const exactKey = canonicalJson({
            endpointOrder: row.endpointOrder,
            endpointDepthPair: row.endpointDepthPair,
            depthRelation: row.depthRelation,
            preCommandMovementRemainingPair: row.preCommandMovementRemainingPair,
            postCommandMovementRemainingPair: row.postCommandMovementRemainingPair,
            knownRouteLengthMovementBudgetPattern: row.knownRouteLengthMovementBudgetPattern,
            primaryOutcome: row.primaryOutcome
        });
        const current = cells.get(exactKey);
        cells.set(exactKey, current ? { ...current, pairCount: current.pairCount + 1 } : row);
    }
    return [...cells.entries()]
        .sort(([left], [right]) => compareCanonicalText(left, right))
        .map(([, row]) => row);
}

function outcomeCounts(pairs: readonly StageBAliasPairRecord[]): Record<StageBPrimaryOutcome, number> {
    const counts = Object.fromEntries(STAGE_B_PRIMARY_OUTCOMES.map((outcome) => [outcome, 0])) as
        Record<StageBPrimaryOutcome, number>;
    for (const pair of pairs) counts[pair.primaryOutcome] += 1;
    return counts;
}

function assertExactKeys(value: unknown, expected: readonly string[], label: string): void {
    assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object.`);
    assert.deepEqual(
        Object.keys(value as object).sort(compareCanonicalText),
        [...expected].sort(compareCanonicalText),
        `${label} keys drifted.`
    );
}

function assertHex(value: unknown, length: number, label: string): asserts value is string {
    assert.equal(typeof value, 'string', `${label} must be a hexadecimal string.`);
    assert(new RegExp(`^[0-9a-f]{${length}}$`).test(value as string),
        `${label} is not lowercase hexadecimal.`);
}

function validateTransitionRecord(
    transition: StageBNormalizedTransition,
    label: string,
    requireValidSemantics = true
): void {
    assertExactKeys(
        transition,
        ['accepted', 'mutated', 'error', 'authoritativeEvents', 'eventsDigest'],
        label
    );
    assert.equal(typeof transition.accepted, 'boolean', `${label}.accepted must be Boolean.`);
    assert.equal(typeof transition.mutated, 'boolean', `${label}.mutated must be Boolean.`);
    assert(Array.isArray(transition.authoritativeEvents), `${label}.authoritativeEvents must be an array.`);
    canonicalJson(transition.authoritativeEvents);
    assertHex(transition.eventsDigest, 64, `${label}.eventsDigest`);
    assert.equal(transition.eventsDigest, sha256Digest(transition.authoritativeEvents),
        `${label}.eventsDigest does not bind its ordered exact events.`);
    if (transition.error !== null) {
        assertExactKeys(transition.error, ['code', 'message'], `${label}.error`);
        assert.equal(typeof transition.error.code, 'string');
        assert.equal(typeof transition.error.message, 'string');
    }
    if (!requireValidSemantics) return;
    if (transition.accepted) {
        assert.equal(transition.mutated, true, `${label} accepted without mutation.`);
        assert.equal(transition.error, null, `${label} accepted with an error.`);
    } else {
        assert.equal(transition.mutated, false, `${label} rejected while claiming mutation.`);
        assert.notEqual(transition.error, null, `${label} rejected without an error.`);
        assert.equal(transition.authoritativeEvents.length, 0,
            `${label} rejected while emitting authoritative events.`);
    }
}

function validateProjectionRecord(projection: StageBProjection, label: string): void {
    assertExactKeys(projection, ['cutId', 'cutVersion', 'classKey', 'projectedValue'], label);
    assert.equal(projectionProblem(projection), null, `${label} does not match the registered cut.`);
    assertExactKeys(projection.projectedValue, ['activeActor', 'units'], `${label}.projectedValue`);
    const value = projection.projectedValue as unknown as {
        activeActor: unknown;
        units: unknown;
    };
    assert.equal(value.activeActor, 'player', `${label} active actor drifted.`);
    assert(Array.isArray(value.units) && value.units.length === 2,
        `${label} must retain the two ordered V4 units.`);
    for (const [index, unit] of value.units.entries()) {
        assertExactKeys(unit, ['id', 'x', 'y', 'stitching'], `${label}.units[${index}]`);
        const row = unit as { id: unknown; x: unknown; y: unknown; stitching: unknown };
        assert.equal(typeof row.id, 'string');
        for (const [coordinate, number] of [
            ['x', row.x], ['y', row.y], ['stitching', row.stitching]
        ] as const) {
            assert.equal(typeof number, 'number', `${label}.units[${index}].${coordinate} must be numeric.`);
            assert(Number.isFinite(number as number) && !Object.is(number, -0),
                `${label}.units[${index}].${coordinate} is not deterministic.`);
        }
    }
}

function registeredWordView(row: StageBRegisteredWord | StageBRouteAttempt | StageBEndpointRecord): JsonValue {
    return {
        wordIndex: row.wordIndex,
        seed: row.seed,
        calling: row.calling,
        rulesetId: row.rulesetId,
        endpointDepth: row.endpointDepth,
        directions: row.directions,
        routeId: row.routeId
    };
}

function validateExecutionCensus(execution: StageBExecution): void {
    const canonicalWords = buildRegisteredWords();
    assert(exact(execution.registeredWords, canonicalWords),
        'Registered words are not the exact 276-word shortlex domain.');
    assertUnique(execution.registeredWords.map((row) => row.routeId), 'Duplicate registered route ID.');
    assertUnique(execution.routeAttempts.map((row) => row.routeId), 'Duplicate route-attempt route ID.');
    assertUnique(
        execution.rejectedPrefixes.map((row) => `${row.rowType}:${row.routeId}`),
        'Duplicate rejected/pruned row identity.'
    );
    assertUnique(execution.eligibleEndpoints.map((row) => row.endpointId), 'Duplicate endpoint ID.');
    assertUnique(execution.eligibleEndpoints.map((row) => row.routeId), 'Duplicate endpoint route ID.');
    assertUnique(execution.aliasPairs.map((row) => row.pairId), 'Duplicate alias-pair ID.');
    assertUnique(execution.frameSupportFailures.map((row) => row.failureRef), 'Duplicate frame-failure ID.');
    assert(execution.routeAttempts.length <= canonicalWords.length,
        'Route-attempt ledger exceeds the registered domain.');

    const rejectionLedger: StageBDirection[][] = [];
    const attemptsByRoute = new Map<string, StageBRouteAttempt>();
    for (const [index, attempt] of execution.routeAttempts.entries()) {
        const word = canonicalWords[index];
        assert(word, `Route attempt ${index} is outside the registered domain.`);
        assert(exact(registeredWordView(attempt), registeredWordView(word)),
            `Route attempt ${index} drifted from its registered word.`);
        assert.equal(attempt.rowType, 'route_attempt');
        assert([0, 1].includes(attempt.initializationCount));
        assert(Number.isSafeInteger(attempt.prefixAuthorityCallCount) && attempt.prefixAuthorityCallCount >= 0);
        assert([0, 1].includes(attempt.nextCommandAuthorityCallCount));
        const commonKeys = [
            'rowType', 'wordIndex', 'seed', 'calling', 'rulesetId', 'endpointDepth', 'directions',
            'routeId', 'disposition', 'initializationCount', 'prefixAuthorityCallCount',
            'nextCommandAuthorityCallCount'
        ];
        const holdout = isHoldout(word.directions);
        if (attempt.disposition === 'excluded_calibration_occurrence') {
            assert(holdout, 'A non-holdout word was excluded as calibration.');
            assertExactKeys(attempt, commonKeys, `routeAttempts[${index}]`);
            assert.equal(attempt.initializationCount, 0);
            assert.equal(attempt.prefixAuthorityCallCount, 0);
            assert.equal(attempt.nextCommandAuthorityCallCount, 0);
        } else {
            assert(!holdout, 'A registered holdout reached an authority disposition.');
            const expectedPrefix = rejectionLedger.find((prefix) =>
                startsWithDirections(word.directions, prefix));
            assert.equal(
                attempt.disposition === 'pruned_by_rejected_prefix',
                expectedPrefix !== undefined,
                'A word was not pruned exactly when a prior retained rejection required it.'
            );
            if (attempt.disposition === 'pruned_by_rejected_prefix') {
                assertExactKeys(attempt, [...commonKeys, 'rejectedPrefix'], `routeAttempts[${index}]`);
                assert(expectedPrefix && exact(attempt.rejectedPrefix, expectedPrefix),
                    'Pruned word does not cite the first previously retained rejected prefix.');
                assert.equal(attempt.initializationCount, 0);
                assert.equal(attempt.prefixAuthorityCallCount, 0);
                assert.equal(attempt.nextCommandAuthorityCallCount, 0);
            } else if (attempt.disposition === 'rejected_prefix') {
                assertExactKeys(attempt, [...commonKeys, 'rejectedPrefix', 'rejection'],
                    `routeAttempts[${index}]`);
                assert(attempt.rejectedPrefix && attempt.rejectedPrefix.length > 0 &&
                    startsWithDirections(word.directions, attempt.rejectedPrefix),
                    'Rejected prefix is not a nonempty prefix of its word.');
                assert.equal(attempt.initializationCount, 1);
                assert.equal(attempt.prefixAuthorityCallCount, attempt.rejectedPrefix.length);
                assert.equal(attempt.nextCommandAuthorityCallCount, 0);
                assert(attempt.rejection, 'Rejected route attempt lacks its transition.');
                validateTransitionRecord(attempt.rejection, `routeAttempts[${index}].rejection`);
                assert.equal(attempt.rejection.accepted, false);
                rejectionLedger.push([...attempt.rejectedPrefix]);
            } else if (attempt.disposition === 'eligible_endpoint') {
                assertExactKeys(attempt, commonKeys, `routeAttempts[${index}]`);
                assert.equal(attempt.initializationCount, 1);
                assert.equal(attempt.prefixAuthorityCallCount, word.endpointDepth);
            } else if (attempt.disposition === 'frame_support_failure') {
                assertExactKeys(attempt, [...commonKeys, 'failureRef'], `routeAttempts[${index}]`);
                assert(attempt.failureRef, 'Failed route attempt lacks a failure reference.');
                assert.equal(attempt.initializationCount, 1);
                assert.equal(attempt.nextCommandAuthorityCallCount, 0);
                assert(attempt.prefixAuthorityCallCount <= word.endpointDepth);
            } else {
                assert.fail(`Unknown route-attempt disposition: ${String(attempt.disposition)}`);
            }
        }
        attemptsByRoute.set(attempt.routeId, attempt);
    }

    const rejectedAttemptRows = execution.routeAttempts.filter((row) =>
        row.disposition === 'rejected_prefix' || row.disposition === 'pruned_by_rejected_prefix');
    assert.equal(execution.rejectedPrefixes.length, rejectedAttemptRows.length,
        'Rejected/pruned durable ledger is incomplete.');
    for (const [index, record] of execution.rejectedPrefixes.entries()) {
        const attempt = rejectedAttemptRows[index];
        assert(attempt, `Rejected/pruned row ${index} lacks its route attempt.`);
        assert.equal(record.rowType, attempt.disposition);
        assert.equal(record.routeId, attempt.routeId);
        assert(exact(record.directions, attempt.directions));
        assert(exact(record.rejectedPrefix, attempt.rejectedPrefix));
        assert.equal(record.prefixDepth, record.rejectedPrefix.length);
        if (record.rowType === 'pruned_by_rejected_prefix') {
            assertExactKeys(record, ['rowType', 'routeId', 'directions', 'rejectedPrefix', 'prefixDepth'],
                `rejectedPrefixes[${index}]`);
        } else {
            assertExactKeys(record, [
                'rowType', 'routeId', 'directions', 'rejectedPrefix', 'prefixDepth', 'actor',
                'expectedTurn', 'command', 'preStateDigest', 'postStateDigest', 'inputUnchanged',
                'transition'
            ], `rejectedPrefixes[${index}]`);
            assert.equal(record.actor, 'player');
            assert.equal(record.expectedTurn, 0);
            assert(exact(record.command, {
                type: 'move',
                direction: record.rejectedPrefix[record.rejectedPrefix.length - 1]
            }));
            assertHex(record.preStateDigest, 64, `rejectedPrefixes[${index}].preStateDigest`);
            assertHex(record.postStateDigest, 64, `rejectedPrefixes[${index}].postStateDigest`);
            assert.equal(record.preStateDigest, record.postStateDigest,
                'Ordinary rejection changed its retained state digest.');
            assert.equal(record.inputUnchanged, true);
            assert(record.transition);
            validateTransitionRecord(record.transition, `rejectedPrefixes[${index}].transition`);
            assert.equal(record.transition.accepted, false);
            assert(exact(record.transition, attempt.rejection));
        }
    }

    const failureByRoute = new Map<string, StageBFrameSupportFailure>();
    const failureOperationsByStage = {
        initialization: ['initialization'],
        route_prefix: ['route_prefix_authority', 'route_prefix_transition_validation'],
        source_projection: ['source_projection'],
        next_command: [
            'next_command_authority',
            'next_command_transition_validation',
            'post_command_projection'
        ],
        retention: []
    } as const;
    for (const [index, record] of execution.frameSupportFailures.entries()) {
        const expectedKeys = ['rowType', 'failureRef', 'stage', 'message'];
        if (record.routeId !== undefined) expectedKeys.push('routeId', 'directions');
        if (record.prefixDepth !== undefined) expectedKeys.push('prefixDepth');
        if (record.evidence !== undefined) expectedKeys.push('evidence');
        assertExactKeys(record, expectedKeys, `frameSupportFailures[${index}]`);
        assert.equal(record.rowType, 'frame_support_failure');
        assert.equal(typeof record.message, 'string');
        assert(record.message.length > 0, 'Frame/support failure message must be nonempty.');
        assert(Object.prototype.hasOwnProperty.call(failureOperationsByStage, record.stage),
            `Unknown frame/support failure stage: ${String(record.stage)}`);
        let word: StageBRegisteredWord | undefined;
        if (record.routeId !== undefined) {
            word = canonicalWords.find((candidate) => candidate.routeId === record.routeId);
            assert(word && exact(record.directions, word.directions),
                'Frame/support failure route payload drifted.');
            assert(!failureByRoute.has(record.routeId), 'Multiple failures were retained for one route.');
            failureByRoute.set(record.routeId, record);
        }
        assert.equal(
            record.failureRef,
            failure(record.stage, record.message, word, record.prefixDepth, record.evidence).failureRef,
            'Frame/support failure identity does not bind its evidence.'
        );
        assert(record.evidence, 'Frame/support failure must retain its operation evidence.');
        if (record.evidence) {
            const allowedEvidenceKeys = new Set([
                'operation', 'nextCommandAuthorityCallAttempted', 'prefixAuthorityCallAttempted',
                'actor', 'expectedTurn', 'command',
                'preStateDigest', 'sourceProjection', 'returnedAuthorityTransition',
                'normalizedTransition', 'postStateDigest', 'inputUnchanged', 'returnedProjection',
                'postCommandProjection', 'thrown'
            ]);
            assert(Object.keys(record.evidence).every((key) => allowedEvidenceKeys.has(key)),
                'Frame/support failure evidence contains an undeclared field.');
            const operations = failureOperationsByStage[record.stage];
            assert((operations as readonly string[]).includes(record.evidence.operation),
                `Frame/support failure operation ${record.evidence.operation} is inconsistent with stage ${record.stage}.`);
            assert.equal(typeof record.evidence.nextCommandAuthorityCallAttempted, 'boolean');
            if (record.evidence.prefixAuthorityCallAttempted !== undefined) {
                assert.equal(typeof record.evidence.prefixAuthorityCallAttempted, 'boolean');
            }
            if (record.evidence.preStateDigest !== undefined) {
                assertHex(record.evidence.preStateDigest, 64, 'failure evidence preStateDigest');
            }
            if (record.evidence.postStateDigest !== undefined) {
                assertHex(record.evidence.postStateDigest, 64, 'failure evidence postStateDigest');
            }
            if (record.evidence.sourceProjection) {
                validateProjectionRecord(record.evidence.sourceProjection, 'failure evidence sourceProjection');
            }
            if (record.evidence.postCommandProjection) {
                validateProjectionRecord(
                    record.evidence.postCommandProjection,
                    'failure evidence postCommandProjection'
                );
            }
            if (record.evidence.normalizedTransition) {
                validateTransitionRecord(
                    record.evidence.normalizedTransition,
                    'failure evidence transition',
                    false
                );
            }
            if (record.evidence.operation === 'initialization') {
                assert.equal(record.prefixDepth, 0);
                assert.equal(record.evidence.nextCommandAuthorityCallAttempted, false);
                assert.equal(record.evidence.prefixAuthorityCallAttempted, false);
                assert.equal(record.evidence.actor, undefined);
                assert.equal(record.evidence.expectedTurn, undefined);
                assert.equal(record.evidence.command, undefined);
            } else if (record.evidence.operation === 'route_prefix_authority' ||
                record.evidence.operation === 'route_prefix_transition_validation') {
                assert(record.prefixDepth !== undefined && record.prefixDepth > 0 && word,
                    'Route-prefix failure must bind a positive prefix depth and registered word.');
                assert.equal(record.evidence.nextCommandAuthorityCallAttempted, false);
                assert.equal(record.evidence.prefixAuthorityCallAttempted, true);
                assert.equal(record.evidence.actor, 'player');
                assert.equal(record.evidence.expectedTurn, 0);
                assert(exact(record.evidence.command, {
                    type: 'move',
                    direction: word.directions[record.prefixDepth - 1]
                }), 'Route-prefix failure command does not match its retained prefix coordinate.');
            } else if (record.evidence.operation === 'source_projection') {
                assert.equal(record.prefixDepth, undefined);
                assert.equal(record.evidence.nextCommandAuthorityCallAttempted, false);
                assert.equal(record.evidence.prefixAuthorityCallAttempted, undefined);
                assert.equal(record.evidence.actor, undefined);
                assert.equal(record.evidence.expectedTurn, undefined);
                assert.equal(record.evidence.command, undefined);
            } else {
                assert.equal(record.stage, 'next_command');
                assert.equal(record.prefixDepth, undefined);
                assert.equal(record.evidence.nextCommandAuthorityCallAttempted, true);
                assert.equal(record.evidence.prefixAuthorityCallAttempted, undefined);
                assert.equal(record.evidence.actor, 'player');
                assert.equal(record.evidence.expectedTurn, 0);
                assert(exact(record.evidence.command, { type: 'move', direction: 1 }),
                    'Next-command failure does not bind the exact registered decoder command.');
            }
            canonicalJson(record.evidence);
        }
    }

    const endpointAttempts = execution.routeAttempts.filter((row) => row.disposition === 'eligible_endpoint');
    assert(execution.eligibleEndpoints.length <= endpointAttempts.length,
        'Decoded endpoint ledger exceeds eligible route attempts.');
    for (const [index, endpoint] of execution.eligibleEndpoints.entries()) {
        const attempt = endpointAttempts[index];
        assert(attempt && endpoint.routeId === attempt.routeId,
            'Decoded endpoints are not the exact ordered prefix of eligible route attempts.');
        assert.equal(attempt.nextCommandAuthorityCallCount, 1);
        assert(exact(registeredWordView(endpoint), registeredWordView(canonicalWords[endpoint.wordIndex])),
            `Endpoint ${endpoint.endpointId} drifted from its registered word.`);
        assertExactKeys(endpoint, [
            'rowType', 'endpointId', 'wordIndex', 'routeId', 'seed', 'calling', 'rulesetId',
            'endpointDepth', 'directions', 'sourceProjection', 'preCommandStateDigest',
            'preCommandRevision', 'preCommandMovementRemaining', 'actor', 'expectedTurn', 'command',
            'readout', 'postCommandStateDigest', 'postCommandRevision',
            'postCommandMovementRemaining', 'postCommandProjection', 'endpointInputUnchanged', 'frameOk'
        ], `eligibleEndpoints[${index}]`);
        assert.equal(endpoint.rowType, 'eligible_endpoint');
        validateProjectionRecord(endpoint.sourceProjection, `eligibleEndpoints[${index}].sourceProjection`);
        validateProjectionRecord(endpoint.postCommandProjection,
            `eligibleEndpoints[${index}].postCommandProjection`);
        assertHex(endpoint.preCommandStateDigest, 64, 'endpoint pre-command state digest');
        assertHex(endpoint.postCommandStateDigest, 64, 'endpoint post-command state digest');
        for (const [label, value] of [
            ['preCommandRevision', endpoint.preCommandRevision],
            ['postCommandRevision', endpoint.postCommandRevision],
            ['preCommandMovementRemaining', endpoint.preCommandMovementRemaining],
            ['postCommandMovementRemaining', endpoint.postCommandMovementRemaining]
        ] as const) {
            assert(Number.isSafeInteger(value) && value >= 0, `Endpoint ${label} is invalid.`);
        }
        assert.equal(endpoint.actor, 'player');
        assert.equal(endpoint.expectedTurn, 0);
        assert(exact(endpoint.command, { type: 'move', direction: 1 }));
        assert.equal(endpoint.endpointInputUnchanged, true);
        assert.equal(endpoint.frameOk, true);
        validateTransitionRecord(endpoint.readout, `eligibleEndpoints[${index}].readout`);
        if (endpoint.readout.accepted) {
            assert.notEqual(endpoint.preCommandStateDigest, endpoint.postCommandStateDigest,
                'Accepted endpoint command retained an unchanged state digest.');
        } else {
            assert.equal(endpoint.preCommandStateDigest, endpoint.postCommandStateDigest,
                'Rejected endpoint command changed its state digest.');
            assert.equal(endpoint.preCommandRevision, endpoint.postCommandRevision);
            assert.equal(endpoint.preCommandMovementRemaining, endpoint.postCommandMovementRemaining);
            assert(exact(endpoint.sourceProjection, endpoint.postCommandProjection));
        }
        assert.equal(endpoint.endpointId, `endpoint-${sha256Digest({
            routeId: endpoint.routeId,
            sourceProjection: endpoint.sourceProjection,
            preCommandStateDigest: endpoint.preCommandStateDigest
        })}`, 'Endpoint identity drifted.');
    }

    if (!execution.executionComplete) {
        assert.equal(execution.frameSupportFailures.length, 1,
            'A fail-closed execution must retain its single first frame/support failure.');
        assert.equal(execution.aliasPairs.length, 0,
            'A fail-closed execution cannot salvage alias-pair verdicts.');
        assert.equal(execution.sourceClassCount, 0);
        assert.equal(execution.eligibleAliasClassCount, 0);
        const retainedFailure = execution.frameSupportFailures[0];
        if (retainedFailure.routeId) {
            const attempt = attemptsByRoute.get(retainedFailure.routeId);
            assert(attempt, 'Failure references a route without an attempt row.');
            if (retainedFailure.stage === 'initialization' || retainedFailure.stage === 'route_prefix') {
                assert.equal(attempt.disposition, 'frame_support_failure');
                assert.equal(attempt.failureRef, retainedFailure.failureRef);
            } else {
                assert.equal(attempt.disposition, 'eligible_endpoint');
                assert.equal(
                    attempt.nextCommandAuthorityCallCount,
                    retainedFailure.evidence?.nextCommandAuthorityCallAttempted ? 1 : 0
                );
                assert.equal(endpointAttempts[execution.eligibleEndpoints.length]?.routeId, attempt.routeId,
                    'Failure is not the next undecoded eligible route.');
            }
        }
        return;
    }

    assert.equal(execution.frameSupportFailures.length, 0);
    assert.equal(execution.routeAttempts.length, 276);
    assert.equal(execution.eligibleEndpoints.length, endpointAttempts.length,
        'Complete endpoint ledger is not exhaustive.');
    assert(endpointAttempts.every((row) => row.nextCommandAuthorityCallCount === 1),
        'Every eligible endpoint must receive exactly one next authority command.');
    assert.equal(execution.routeAttempts.filter((row) =>
        row.disposition === 'excluded_calibration_occurrence').length, 2);

    const classes = new Map<string, StageBEndpointRecord[]>();
    for (const endpoint of execution.eligibleEndpoints) {
        const key = canonicalJson({
            cutId: endpoint.sourceProjection.cutId,
            cutVersion: endpoint.sourceProjection.cutVersion,
            projectedValue: endpoint.sourceProjection.projectedValue
        });
        const members = classes.get(key) ?? [];
        members.push(endpoint);
        classes.set(key, members);
    }
    assert.equal(execution.sourceClassCount, classes.size);
    const aliasClasses = [...classes.values()].filter((members) => members.length >= 2);
    assert.equal(execution.eligibleAliasClassCount, aliasClasses.length);
    const expectedPairCount = aliasClasses.reduce(
        (sum, members) => sum + members.length * (members.length - 1) / 2,
        0
    );
    assert.equal(execution.aliasPairs.length, expectedPairCount,
        'Alias-pair census is not nC2 for every exact source class.');
    const expectedPairIds: string[] = [];
    const endpointsById = new Map(execution.eligibleEndpoints.map((row) => [row.endpointId, row]));
    for (const members of aliasClasses) {
        members.sort((left, right) => compareCanonicalText(left.routeId, right.routeId));
        for (let leftIndex = 0; leftIndex < members.length - 1; leftIndex += 1) {
            for (let rightIndex = leftIndex + 1; rightIndex < members.length; rightIndex += 1) {
                expectedPairIds.push(`pair-${sha256Digest({
                    classKey: members[leftIndex].sourceProjection.classKey,
                    leftEndpointId: members[leftIndex].endpointId,
                    rightEndpointId: members[rightIndex].endpointId
                })}`);
            }
        }
    }
    assert(exact(
        execution.aliasPairs.map((row) => row.pairId).sort(compareCanonicalText),
        expectedPairIds.sort(compareCanonicalText)
    ), 'Alias-pair identities do not enumerate the exact nC2 member set.');
    for (const [index, pair] of execution.aliasPairs.entries()) {
        assertExactKeys(pair, [
            'rowType', 'pairId', 'classKey', 'projectedValue', 'leftEndpointId',
            'rightEndpointId', 'leftRouteId', 'rightRouteId', 'leftEndpointDepth',
            'rightEndpointDepth', 'leftDirections', 'rightDirections',
            'preCommandMovementRemainingPair', 'postCommandMovementRemainingPair', 'equality',
            'primaryOutcome', 'targetRelevant'
        ], `aliasPairs[${index}]`);
        const left = endpointsById.get(pair.leftEndpointId);
        const right = endpointsById.get(pair.rightEndpointId);
        assert(left && right, `Alias pair references a missing endpoint: ${pair.pairId}`);
        assert(compareCanonicalText(left.routeId, right.routeId) < 0,
            'Alias-pair endpoints are not in canonical route-ID order.');
        assert.equal(pair.leftRouteId, left.routeId);
        assert.equal(pair.rightRouteId, right.routeId);
        assert.equal(pair.leftEndpointDepth, left.endpointDepth);
        assert.equal(pair.rightEndpointDepth, right.endpointDepth);
        assert(exact(pair.leftDirections, left.directions));
        assert(exact(pair.rightDirections, right.directions));
        assert.equal(pair.classKey, left.sourceProjection.classKey);
        assert.equal(pair.classKey, right.sourceProjection.classKey);
        assert(exact(pair.projectedValue, left.sourceProjection.projectedValue));
        assert(exact(pair.projectedValue, right.sourceProjection.projectedValue));
        assert(exact(pair.preCommandMovementRemainingPair,
            [left.preCommandMovementRemaining, right.preCommandMovementRemaining]));
        assert(exact(pair.postCommandMovementRemainingPair,
            [left.postCommandMovementRemaining, right.postCommandMovementRemaining]));
        assertExactKeys(pair.equality, [
            'commandSemanticEqual', 'postMovementRemainingEqual', 'preRevisionEqual',
            'postRevisionEqual', 'preStateDigestEqual', 'postStateDigestEqual', 'routeHistoryEqual'
        ], `aliasPairs[${index}].equality`);
        const classified = classifyPair(left, right);
        assert(exact({
            equality: pair.equality,
            primaryOutcome: pair.primaryOutcome,
            targetRelevant: pair.targetRelevant
        }, classified), `Alias-pair classification drifted: ${pair.pairId}`);
    }
}

export function buildStageBResult(
    execution: StageBExecution,
    source: StageBSourceIdentity,
    registration = readStageBRegistration()
): StageBResult {
    validateStageBRegistration(registration);
    validateExecutionCensus(execution);
    const serialized = serializeStageBRawOutputs(execution);
    const primaryOutcomeCounts = outcomeCounts(execution.aliasPairs);
    const candidateWitnessPairIds = execution.aliasPairs
        .filter((row) => row.targetRelevant)
        .map((row) => row.pairId)
        .sort(compareCanonicalText);
    const hardGatesPass = execution.executionComplete && execution.frameSupportFailures.length === 0;
    const unsignedPayload = {
        schemaVersion: 1 as const,
        resultId: 'wp-015d2r-stage-b-one-next-command-search-v1' as const,
        packageId: 'WP-015D2R' as const,
        supportWorkPackageId: 'WP-015D2T' as const,
        childId: 'WPV4-NAVIGATOR-01B' as const,
        registrationId: 'WP-015D2R:stage-b-one-next-command-search:v1' as const,
        source,
        registrationDigest: STAGE_B_REGISTRATION_CANONICAL_DIGEST,
        domain: {
            identity: registration.routeDomain.identity,
            seedSet: [STAGE_B_SEED] as [number],
            alphabet: [-1, 1] as [-1, 1],
            depths: [2, 4, 8] as [2, 4, 8],
            attemptedWordCount: execution.routeAttempts.length,
            excludedCalibrationOccurrenceCount: execution.routeAttempts.filter((row) =>
                row.disposition === 'excluded_calibration_occurrence').length,
            rejectedPrefixCount: execution.routeAttempts.filter((row) =>
                row.disposition === 'rejected_prefix').length,
            prunedWordCount: execution.routeAttempts.filter((row) =>
                row.disposition === 'pruned_by_rejected_prefix').length,
            naturallyReachableEndpointCount: execution.eligibleEndpoints.length,
            sourceClassCount: execution.sourceClassCount,
            eligibleAliasClassCount: execution.eligibleAliasClassCount,
            eligiblePairCount: execution.aliasPairs.length,
            frameSupportFailureCount: execution.frameSupportFailures.length,
            complete: execution.executionComplete,
            stoppedAtFirstPositive: false as const
        },
        primaryOutcomeCounts,
        targetRelevantPairCount: candidateWitnessPairIds.length,
        rawOutputs: serialized.map((row) => row.manifest),
        records: {
            routeAttempts: execution.routeAttempts,
            rejectedPrefixes: execution.rejectedPrefixes,
            eligibleEndpoints: execution.eligibleEndpoints,
            aliasPairs: execution.aliasPairs,
            frameSupportFailures: execution.frameSupportFailures
        },
        descriptiveCrossTab: {
            authority: 'non_authoritative_descriptive_only' as const,
            interpretationGuard: STAGE_B_CROSS_TAB_INTERPRETATION_GUARD,
            rows: buildStageBCrossTab(execution.aliasPairs)
        },
        witnessInterface: {
            // Stage B records candidate results. Witness acceptance and the
            // cross-move interface remain review-owned Stage C questions.
            W_status: 'absent' as const,
            candidateResultStatus: candidateWitnessPairIds.length > 0 ? 'present' as const : 'absent' as const,
            candidateWitnessPairIds,
            Omega_W_status: 'not_evaluated' as const,
            P_W_status: 'not_evaluated' as const,
            N_W_status: 'not_evaluated' as const,
            J_W: 'not_applicable' as const
        },
        transition: {
            transitionId: 'TAU-WPV4-RETURN-01A' as const,
            status: 'candidate_unlicensed' as const,
            decodabilityAcrossMove: 'not_evaluated' as const,
            automaticLicenseFromResult: false as const
        },
        evidenceClass: 'correlated_reuse' as const,
        analyticalDisposition: hardGatesPass ? 'stopped_for_review' as const : 'invalid_frame_or_support' as const,
        hardGatesPass,
        productAuthority: 'none' as const,
        mathematicalPlacementImplication: 'none' as const,
        landfall: false as const,
        chartRevision: false as const,
        successorCarrierSelected: false as const,
        stageC: 'not_opened' as const,
        p5: 'closed' as const,
        stopStatement: 'WP-015D2R Stage B execution stopped for review; Stage C not opened.' as const
    };
    const parityBasis = {
        resultId: unsignedPayload.resultId,
        sourceCommit: unsignedPayload.source.commit,
        sourceDigest: unsignedPayload.source.sourceDigest,
        registrationDigest: unsignedPayload.registrationDigest,
        domain: unsignedPayload.domain,
        primaryOutcomeCounts: unsignedPayload.primaryOutcomeCounts,
        targetRelevantPairCount: unsignedPayload.targetRelevantPairCount,
        descriptiveCrossTab: unsignedPayload.descriptiveCrossTab,
        witnessInterface: unsignedPayload.witnessInterface,
        transition: unsignedPayload.transition,
        evidenceClass: unsignedPayload.evidenceClass,
        productAuthority: unsignedPayload.productAuthority,
        mathematicalPlacementImplication: unsignedPayload.mathematicalPlacementImplication,
        landfall: unsignedPayload.landfall,
        chartRevision: unsignedPayload.chartRevision,
        successorCarrierSelected: unsignedPayload.successorCarrierSelected,
        stageC: unsignedPayload.stageC,
        p5: unsignedPayload.p5,
        stopStatement: unsignedPayload.stopStatement
    };
    const digests = {
        sourceDigest: source.sourceDigest,
        suiteDigest: sha256Digest(source.implementationPaths),
        sourceRangeDigest: sha256Digest(source.range),
        domainDigest: sha256Digest(unsignedPayload.domain),
        recordsDigest: sha256Digest(unsignedPayload.records),
        outcomesDigest: sha256Digest({
            primaryOutcomeCounts: unsignedPayload.primaryOutcomeCounts,
            targetRelevantPairCount: unsignedPayload.targetRelevantPairCount
        }),
        crossTabDigest: sha256Digest(unsignedPayload.descriptiveCrossTab),
        parityDigest: sha256Digest(parityBasis)
    };
    const payload = { ...unsignedPayload, digests };
    return validateStageBResult({ ...payload, resultDigest: sha256Digest(payload) });
}

export function validateStageBResult(input: unknown): StageBResult {
    assert(input && typeof input === 'object' && !Array.isArray(input), 'Stage B result must be an object.');
    const result = input as StageBResult;
    assertExactKeys(result, [
        'schemaVersion', 'resultId', 'packageId', 'supportWorkPackageId', 'childId',
        'registrationId', 'source', 'registrationDigest', 'domain', 'primaryOutcomeCounts',
        'targetRelevantPairCount', 'rawOutputs', 'records', 'digests', 'descriptiveCrossTab',
        'witnessInterface', 'transition', 'evidenceClass', 'analyticalDisposition',
        'hardGatesPass', 'productAuthority', 'mathematicalPlacementImplication', 'landfall',
        'chartRevision', 'successorCarrierSelected', 'stageC', 'p5', 'stopStatement', 'resultDigest'
    ], 'Stage B result');
    const { resultDigest, ...payload } = result;
    assert.equal(resultDigest, sha256Digest(payload), 'Stage B result digest mismatch.');
    assert.equal(result.schemaVersion, 1);
    assert.equal(result.resultId, 'wp-015d2r-stage-b-one-next-command-search-v1');
    assert.equal(result.packageId, 'WP-015D2R');
    assert.equal(result.supportWorkPackageId, 'WP-015D2T');
    assert.equal(result.childId, 'WPV4-NAVIGATOR-01B');
    assert.equal(result.registrationId, 'WP-015D2R:stage-b-one-next-command-search:v1');
    assert.equal(result.registrationDigest, STAGE_B_REGISTRATION_CANONICAL_DIGEST);
    assert.equal(result.source.preregistrationSourceCommit, STAGE_B_PREREGISTRATION_SOURCE_COMMIT);
    assert.equal(result.source.preregistrationSourceTree, STAGE_B_PREREGISTRATION_SOURCE_TREE);
    assert.equal(result.source.preregistrationTerminalCommit, STAGE_B_PREREGISTRATION_TERMINAL_COMMIT);
    assert.equal(result.source.preregistrationTerminalTree, STAGE_B_PREREGISTRATION_TERMINAL_TREE);
    assert.equal(result.source.preregistrationSourceDigest, STAGE_B_PREREGISTRATION_SOURCE_DIGEST);
    assert.equal(result.source.preregistrationBindingsDigest, STAGE_B_PREREGISTRATION_BINDINGS_DIGEST);
    assert.equal(result.source.preregistrationParityDigest, STAGE_B_PREREGISTRATION_PARITY_DIGEST);
    assert.equal(result.source.registration.path, STAGE_B_REGISTRATION_PATH);
    assert.equal(result.source.registration.blob, STAGE_B_REGISTRATION_BLOB);
    assert.equal(result.source.registration.sha256, STAGE_B_REGISTRATION_SHA256);
    assert.equal(result.source.contract.path, STAGE_B_CONTRACT_PATH);
    assert.equal(result.source.contract.blob, STAGE_B_CONTRACT_BLOB);
    assert.equal(result.source.contract.sha256, STAGE_B_CONTRACT_SHA256);
    assert(/^[0-9a-f]{40}$/.test(result.source.commit));
    assert(/^[0-9a-f]{40}$/.test(result.source.tree));
    assert.equal(result.source.range.baseCommit, STAGE_B_PREREGISTRATION_TERMINAL_COMMIT);
    assert.equal(result.source.range.resultCommit, result.source.commit);
    assert.deepEqual(
        result.source.implementationPaths.map((row) => row.path).sort(compareCanonicalText),
        [...STAGE_B_EXECUTION_SOURCE_PATHS].sort(compareCanonicalText),
        'Execution-source path bindings are incomplete.'
    );
    assertUnique(result.source.implementationPaths.map((row) => row.path),
        'Duplicate execution-source path binding.');
    for (const row of result.source.implementationPaths) {
        assert.equal(row.mode, '100644');
        assert(/^[0-9a-f]{40}$/.test(row.blob));
        assert(/^[0-9a-f]{64}$/.test(row.sha256));
    }
    assert.deepEqual(
        result.source.range.endpointRows.map((row) => row.path).sort(compareCanonicalText),
        [...STAGE_B_EXECUTION_SOURCE_PATHS].sort(compareCanonicalText),
        'Execution-source range rows are incomplete.'
    );
    validateChangeRows(result.source.range.endpointRows, STAGE_B_EXECUTION_SOURCE_PATHS);
    let rangeParent = STAGE_B_PREREGISTRATION_TERMINAL_COMMIT;
    assert(result.source.range.commits.length > 0, 'Execution-source range lacks its commit audit.');
    for (const revision of result.source.range.commits) {
        assert.equal(revision.parent, rangeParent, 'Execution-source range is not linear.');
        assert(/^[0-9a-f]{40}$/.test(revision.commit));
        validateChangeRows(revision.rows, STAGE_B_EXECUTION_SOURCE_PATHS, 'intermediate');
        rangeParent = revision.commit;
    }
    assert.equal(rangeParent, result.source.commit,
        'Execution-source range does not terminate at its bound source commit.');
    const { sourceDigest, ...sourcePayload } = result.source;
    assert.equal(sourceDigest, sha256Digest(sourcePayload), 'Stage B source digest mismatch.');
    assertExactKeys(result.records, [
        'routeAttempts', 'rejectedPrefixes', 'eligibleEndpoints', 'aliasPairs', 'frameSupportFailures'
    ], 'Stage B durable records');
    const execution: StageBExecution = {
        registeredWords: buildRegisteredWords(),
        routeAttempts: result.records.routeAttempts,
        rejectedPrefixes: result.records.rejectedPrefixes,
        eligibleEndpoints: result.records.eligibleEndpoints,
        aliasPairs: result.records.aliasPairs,
        frameSupportFailures: result.records.frameSupportFailures,
        sourceClassCount: result.domain.sourceClassCount,
        eligibleAliasClassCount: result.domain.eligibleAliasClassCount,
        executionComplete: result.domain.complete
    };
    validateExecutionCensus(execution);
    assert(exact(result.domain, {
        identity: 'WP-015D2R:stage-b-natural-move-words:v1',
        seedSet: [STAGE_B_SEED],
        alphabet: [-1, 1],
        depths: [2, 4, 8],
        attemptedWordCount: result.records.routeAttempts.length,
        excludedCalibrationOccurrenceCount: result.records.routeAttempts.filter((row) =>
            row.disposition === 'excluded_calibration_occurrence').length,
        rejectedPrefixCount: result.records.routeAttempts.filter((row) =>
            row.disposition === 'rejected_prefix').length,
        prunedWordCount: result.records.routeAttempts.filter((row) =>
            row.disposition === 'pruned_by_rejected_prefix').length,
        naturallyReachableEndpointCount: result.records.eligibleEndpoints.length,
        sourceClassCount: execution.sourceClassCount,
        eligibleAliasClassCount: execution.eligibleAliasClassCount,
        eligiblePairCount: result.records.aliasPairs.length,
        frameSupportFailureCount: result.records.frameSupportFailures.length,
        complete: execution.executionComplete,
        stoppedAtFirstPositive: false
    }), 'Stage B domain metadata does not derive exactly from its registered records.');
    assert(exact(result.primaryOutcomeCounts, outcomeCounts(result.records.aliasPairs)),
        'Primary outcome counts do not match durable pair records.');
    assert.deepEqual(
        Object.keys(result.primaryOutcomeCounts).sort(compareCanonicalText),
        [...STAGE_B_PRIMARY_OUTCOMES].sort(compareCanonicalText),
        'Primary outcome count keys drifted.'
    );
    const serialized = serializeStageBRawOutputs(execution);
    assert(exact(result.rawOutputs, serialized.map((row) => row.manifest)),
        'Raw output manifests do not match durable arrays.');
    assertUnique(result.rawOutputs.map((row) => row.path), 'Duplicate raw output path.');
    assert(exact(result.descriptiveCrossTab, {
        authority: 'non_authoritative_descriptive_only',
        interpretationGuard: STAGE_B_CROSS_TAB_INTERPRETATION_GUARD,
        rows: buildStageBCrossTab(result.records.aliasPairs)
    }), 'Descriptive cross-tab does not match its fixed role and pair records.');
    assertUnique(result.descriptiveCrossTab.rows.map((row) => canonicalJson({
        endpointOrder: row.endpointOrder,
        endpointDepthPair: row.endpointDepthPair,
        depthRelation: row.depthRelation,
        preCommandMovementRemainingPair: row.preCommandMovementRemainingPair,
        postCommandMovementRemainingPair: row.postCommandMovementRemainingPair,
        knownRouteLengthMovementBudgetPattern: row.knownRouteLengthMovementBudgetPattern,
        primaryOutcome: row.primaryOutcome
    })), 'Duplicate descriptive cross-tab key.');
    assert.equal(
        result.descriptiveCrossTab.rows.reduce((sum, row) => sum + row.pairCount, 0),
        result.records.aliasPairs.length
    );
    assert.equal(result.targetRelevantPairCount,
        result.records.aliasPairs.filter((row) => row.targetRelevant).length);
    const parityBasis = {
        resultId: result.resultId,
        sourceCommit: result.source.commit,
        sourceDigest: result.source.sourceDigest,
        registrationDigest: result.registrationDigest,
        domain: result.domain,
        primaryOutcomeCounts: result.primaryOutcomeCounts,
        targetRelevantPairCount: result.targetRelevantPairCount,
        descriptiveCrossTab: result.descriptiveCrossTab,
        witnessInterface: result.witnessInterface,
        transition: result.transition,
        evidenceClass: result.evidenceClass,
        productAuthority: result.productAuthority,
        mathematicalPlacementImplication: result.mathematicalPlacementImplication,
        landfall: result.landfall,
        chartRevision: result.chartRevision,
        successorCarrierSelected: result.successorCarrierSelected,
        stageC: result.stageC,
        p5: result.p5,
        stopStatement: result.stopStatement
    };
    assert(exact(result.digests, {
        sourceDigest: result.source.sourceDigest,
        suiteDigest: sha256Digest(result.source.implementationPaths),
        sourceRangeDigest: sha256Digest(result.source.range),
        domainDigest: sha256Digest(result.domain),
        recordsDigest: sha256Digest(result.records),
        outcomesDigest: sha256Digest({
            primaryOutcomeCounts: result.primaryOutcomeCounts,
            targetRelevantPairCount: result.targetRelevantPairCount
        }),
        crossTabDigest: sha256Digest(result.descriptiveCrossTab),
        parityDigest: sha256Digest(parityBasis)
    }), 'Stage B named digest block drifted.');
    const expectedHardGatesPass = result.domain.complete &&
        result.records.frameSupportFailures.length === 0;
    assert.equal(result.hardGatesPass, expectedHardGatesPass);
    assert.equal(result.analyticalDisposition,
        expectedHardGatesPass ? 'stopped_for_review' : 'invalid_frame_or_support');
    const candidateWitnessPairIds = result.records.aliasPairs.filter((row) => row.targetRelevant)
        .map((row) => row.pairId).sort(compareCanonicalText);
    assert(exact(result.witnessInterface, {
        W_status: 'absent',
        candidateResultStatus: candidateWitnessPairIds.length > 0 ? 'present' : 'absent',
        candidateWitnessPairIds,
        Omega_W_status: 'not_evaluated',
        P_W_status: 'not_evaluated',
        N_W_status: 'not_evaluated',
        J_W: 'not_applicable'
    }), 'Stage B candidate-result/witness interface drifted.');
    assert(exact(result.transition, {
        transitionId: 'TAU-WPV4-RETURN-01A',
        status: 'candidate_unlicensed',
        decodabilityAcrossMove: 'not_evaluated',
        automaticLicenseFromResult: false
    }), 'Stage B transition governance drifted.');
    assert.equal(result.evidenceClass, 'correlated_reuse');
    assert.equal(result.productAuthority, 'none');
    assert.equal(result.mathematicalPlacementImplication, 'none');
    assert.equal(result.landfall, false);
    assert.equal(result.chartRevision, false);
    assert.equal(result.successorCarrierSelected, false);
    assert.equal(result.stageC, 'not_opened');
    assert.equal(result.p5, 'closed');
    assert.equal(result.stopStatement,
        'WP-015D2R Stage B execution stopped for review; Stage C not opened.');
    return result;
}

export function canonicalStageBResult(result: StageBResult): string {
    return canonicalJson(validateStageBResult(result));
}

function markdownTable(headers: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
    const head = `| ${headers.join(' | ')} |`;
    const rule = `| ${headers.map(() => '---').join(' | ')} |`;
    return [head, rule, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
}

export function renderStageBReport(input: StageBResult): string {
    const result = validateStageBResult(input);
    const orderedOutcomeCounts = Object.fromEntries(STAGE_B_PRIMARY_OUTCOMES.map((outcome) => [
        outcome,
        result.primaryOutcomeCounts[outcome]
    ])) as Record<StageBPrimaryOutcome, number>;
    const outcomeRows = STAGE_B_PRIMARY_OUTCOMES.map((outcome) => [
        `\`${outcome}\``, result.primaryOutcomeCounts[outcome]
    ]);
    const rawRows = result.rawOutputs.map((row) => [
        `\`${row.path}\``, row.rowCount, `\`${row.recordsDigest}\``, `\`${row.fileSha256}\``
    ]);
    const crossRows = result.descriptiveCrossTab.rows.map((row) => [
        row.endpointDepthPair.join('/'),
        row.depthRelation,
        row.preCommandMovementRemainingPair.join('/'),
        row.postCommandMovementRemainingPair.join('/'),
        row.knownRouteLengthMovementBudgetPattern ? 'observed' : 'not_observed',
        `\`${row.primaryOutcome}\``,
        row.pairCount
    ]);
    const knownMechanismPairCount = result.descriptiveCrossTab.rows
        .filter((row) =>
            row.knownRouteLengthMovementBudgetPattern &&
            (row.primaryOutcome === 'command_semantic_split' ||
                row.primaryOutcome === 'continuation_support_split'))
        .reduce((sum, row) => sum + row.pairCount, 0);
    const targetPressureNotExplainedByKnownMechanism = result.descriptiveCrossTab.rows
        .filter((row) =>
            (row.primaryOutcome === 'command_semantic_split' ||
                row.primaryOutcome === 'continuation_support_split') &&
            !row.knownRouteLengthMovementBudgetPattern)
        .reduce((sum, row) => sum + row.pairCount, 0);
    const parity = {
        resultId: result.resultId,
        sourceCommit: result.source.commit,
        sourceTree: result.source.tree,
        preregistrationSourceCommit: result.source.preregistrationSourceCommit,
        preregistrationTerminalCommit: result.source.preregistrationTerminalCommit,
        resultDigest: result.resultDigest,
        primaryOutcomeCounts: orderedOutcomeCounts,
        targetRelevantPairCount: result.targetRelevantPairCount,
        witnessInterface: {
            W_status: result.witnessInterface.W_status,
            candidateResultStatus: result.witnessInterface.candidateResultStatus,
            candidatePairCount: result.witnessInterface.candidateWitnessPairIds.length,
            candidatePairIdsDigest: sha256Digest(result.witnessInterface.candidateWitnessPairIds),
            Omega_W_status: result.witnessInterface.Omega_W_status,
            P_W_status: result.witnessInterface.P_W_status,
            N_W_status: result.witnessInterface.N_W_status,
            J_W: result.witnessInterface.J_W
        },
        hardGatesPass: result.hardGatesPass,
        analyticalDisposition: result.analyticalDisposition,
        tauStatus: result.transition.status,
        stageC: result.stageC,
        productAuthority: result.productAuthority,
        mathematicalPlacementImplication: result.mathematicalPlacementImplication,
        stopStatement: result.stopStatement
    };
    return `# WP-015D2R Stage B One-Next-Command Search — Execution Report v1

Status: ${result.hardGatesPass
        ? 'durable deterministic execution result; stopped for review'
        : 'durable partial execution record; invalid frame or support'}. Stage C is not opened.

Source commit: \`${result.source.commit}\` (tree \`${result.source.tree}\`). Preregistration source: \`${result.source.preregistrationSourceCommit}\`; terminal: \`${result.source.preregistrationTerminalCommit}\`. Result digest: \`${result.resultDigest}\`.

## Exhaustive Domain Result

${result.hardGatesPass
        ? `The executor attempted all ${result.domain.attemptedWordCount} registered shortlex words. It excluded ${result.domain.excludedCalibrationOccurrenceCount} exact calibration occurrences before initialization or authority use, retained ${result.domain.rejectedPrefixCount} first rejections and ${result.domain.prunedWordCount} pruned extensions, decoded ${result.domain.naturallyReachableEndpointCount} eligible endpoints once each, and compared all ${result.domain.eligiblePairCount} unordered exact-cut alias pairs. It did not stop at a positive.`
        : `The executor stopped fail-closed after retaining ${result.domain.attemptedWordCount} route-attempt row(s), ${result.domain.naturallyReachableEndpointCount} decoded endpoint row(s), and ${result.domain.frameSupportFailureCount} frame/support failure row(s). No partial positive was salvaged.`}

${markdownTable(['Primary outcome', 'Pair count'], outcomeRows)}

Post-command \`movementRemaining\` inequality is called only a **continuation-support-coordinate split**. It is not recursive continuation closure. Revision, state-digest, or route inequality alone remains provenance/exact-state pressure and cannot certify a continuation-bearing carrier.

## Non-Authoritative Descriptive Cross-Tab

This cross-tab is descriptive only. Every depth, pre-budget, and post-budget pair retains the same canonical route-ID left/right endpoint ordering. The known route-length/movement-budget pattern is marked only when endpoint depth and pre-command budget vary in opposite directions. It distinguishes recurrence of that pattern from pressure not explained by it; it does not add or alter a primary outcome.

Using only the displayed axes, ${knownMechanismPairCount} target-relevant pair(s) recur across different route depths with different pre-command movement budgets. ${targetPressureNotExplainedByKnownMechanism} target-relevant pair(s) are not explained by that registered route-depth/budget pattern. These are descriptive counts, not causal or placement verdicts.

${crossRows.length > 0 ? markdownTable(
        ['Depth pair (L/R)', 'Depth relation', 'Pre budget pair (L/R)', 'Post budget pair (L/R)', 'Known route/budget pattern', 'Primary outcome', 'Pairs'],
        crossRows
    ) : '_No eligible alias-pair rows._'}

## Durable And Raw Retention

Every raw ledger is mirrored by its complete array in the machine result. Digests bind both the array and exact canonical JSONL bytes.

${markdownTable(['Raw path', 'Rows', 'Records digest', 'File SHA-256'], rawRows)}

## Governed Stop

\`TAU-WPV4-RETURN-01A\` remains \`candidate_unlicensed\`; decodability across the move is not evaluated. Target-relevant pair rows, if any, remain candidate results: \`W\` is absent and \`Omega_W\`, \`P_W\`, and \`N_W\` remain not evaluated until separate review. This execution selects no successor carrier, revises no chart, claims no landfall, issues no ProductAuthority or placement, and does not perform Stage C or open P5. Evidence remains \`correlated_reuse\`.

> ${result.stopStatement}

<!-- STAGE_B_EXECUTION_PARITY_JSON_BEGIN -->
\`\`\`json
${JSON.stringify(parity, null, 2)}
\`\`\`
<!-- STAGE_B_EXECUTION_PARITY_JSON_END -->
`;
}
