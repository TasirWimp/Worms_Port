import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test, { after } from 'node:test';

import {
    canonicalJson,
    compareCanonicalText,
    sha256Digest
} from '../../analysis/crpm_world/canonical';
import * as stageC from '../../analysis/crpm_world/navigation/reconstruct-wp-015d2r-stage-c-return-v1';
import * as stageCRunner from '../../scripts/run-wp-015d2r-stage-c-return-v1';

const ROOT = resolve(import.meta.dirname, '../..');
const STAGE_C_BASE_COMMIT = '6e47d42b691effe5d34c5c050302def40ae40181';
const STAGE_B_RESULT_COMMIT = 'd340a2286598a1fd399dfa23ba55426185f0e96d';
const STAGE_B_RESULT_PATH = 'docs/evidence/wp-015d2r-stage-b-v1/result.json';
const STAGE_B_RESULT_BLOB = '2452a19b700fd6c6965fdb20a27824cf386070c9';
const STAGE_B_RESULT_FILE_SHA256 =
    '947e951f1f155931d066322df8e7b1748c282b812dca8355bf31d08be23f19ff';
const STAGE_B_RESULT_DIGEST =
    'db073dfe67e0687253fe284832b45fad051b463edfd2e8ac9d3fb862b86c3a11';
const D2Q_RETURN_COMMIT = '4fc88d947a98d737cbcdfd22d31d36c4bd5843eb';
const D2Q_RETURN_PATH = 'docs/evidence/wp-015d2q/review-return.json';
const D2Q_RETURN_BLOB = 'f992202b2be4d8e47e293a81325537ee28474f47';
const D2Q_RESULT_DIGEST =
    'b538f5b6da82dc3b6655a9c0d89404e3b20592191886a9bb4280d6fe481d1615';
const REGISTRATION_PATH =
    'analysis/crpm_world/navigation/wp-015d2r-stage-c-reconstruction-registration-v1.json';
const IMPLEMENTATION_PATH =
    'analysis/crpm_world/navigation/reconstruct-wp-015d2r-stage-c-return-v1.ts';
const RUNNER_PATH = 'scripts/run-wp-015d2r-stage-c-return-v1.ts';
const RESULT_PATH = 'docs/evidence/wp-015d2r-stage-c-v1/result.json';
const REPORT_PATH =
    'docs/planning/wp-015d2r-stage-c-independent-reconstruction-and-chart-revision-report-v1.md';
const REVIEW_RETURN_PATH = 'docs/evidence/wp-015d2r-stage-c-v1/review-return.json';
const SOURCE_OUTPUTS = [
    'docs/evidence/wp-015d2u.json',
    'docs/planning/wp-015d2r-stage-c-independent-reconstruction-and-chart-revision-contract-v1.md',
    REGISTRATION_PATH,
    IMPLEMENTATION_PATH,
    RUNNER_PATH,
    'tests/crpm-world/wp-015d2r-stage-c-return-v1.test.ts'
] as const;
const RESULT_OUTPUTS = [RESULT_PATH, REPORT_PATH] as const;
const REVIEW_RETURN_OUTPUTS = [REVIEW_RETURN_PATH] as const;
const ALLOWED_OUTPUTS = [...SOURCE_OUTPUTS, ...RESULT_OUTPUTS, ...REVIEW_RETURN_OUTPUTS] as const;
const PRIMARY_OUTCOMES = [
    'frame_support_failure',
    'command_semantic_split',
    'continuation_support_split',
    'provenance_exact_state_only_split',
    'no_target_relevant_split'
] as const;

type PrimaryOutcome = typeof PRIMARY_OUTCOMES[number];
type JsonRecord = Record<string, unknown>;
type JsonPath = readonly (string | number)[];

function scalarLeafPaths(value: unknown, prefix: JsonPath = []): JsonPath[] {
    if (Array.isArray(value)) {
        if (value.length === 0) return [prefix];
        return value.flatMap((entry, index) => scalarLeafPaths(entry, [...prefix, index]));
    }
    if (value !== null && typeof value === 'object') {
        return Object.entries(value).flatMap(([key, entry]) =>
            scalarLeafPaths(entry, [...prefix, key]));
    }
    return [prefix];
}

function corruptScalarLeaf(root: unknown, path: JsonPath): void {
    assert(path.length > 0, 'A destructive scalar path must not be empty.');
    let parent = root as JsonRecord | unknown[];
    for (const key of path.slice(0, -1)) {
        parent = parent[key as never] as JsonRecord | unknown[];
    }
    const key = path.at(-1)!;
    const current = parent[key as never] as unknown;
    parent[key as never] = (typeof current === 'string'
        ? `${current}__forged`
        : typeof current === 'number'
            ? current + 1
            : typeof current === 'boolean'
                ? !current
                : current === null
                    ? 'forged_non_null'
                    : { forged: true }) as never;
}

interface Projection {
    classKey: string;
    cutId: string;
    cutVersion: number;
    projectedValue: unknown;
}

interface Readout {
    accepted: boolean;
    mutated: boolean;
    error: unknown;
    authoritativeEvents: unknown[];
}

interface Endpoint {
    endpointId: string;
    routeId: string;
    directions: number[];
    endpointDepth: number;
    frameOk: boolean;
    sourceProjection: Projection;
    readout: Readout;
    preCommandMovementRemaining: number;
    postCommandMovementRemaining: number;
    preCommandRevision: number;
    postCommandRevision: number;
    preCommandStateDigest: string;
    postCommandStateDigest: string;
}

interface StageBPair {
    rowType: 'alias_pair';
    pairId: string;
    classKey: string;
    projectedValue: unknown;
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
    primaryOutcome: PrimaryOutcome;
    targetRelevant: boolean;
}

interface StageBResult {
    resultDigest: string;
    records: {
        eligibleEndpoints: Endpoint[];
        aliasPairs: StageBPair[];
        frameSupportFailures: unknown[];
    };
    primaryOutcomeCounts: Record<PrimaryOutcome, number>;
    descriptiveCrossTab: { rows: CrossTabRow[] };
}

interface RebuiltPair extends StageBPair {}

interface CrossTabRow {
    endpointOrder: 'canonical_route_id_left_right';
    endpointDepthPair: [number, number];
    depthRelation: 'same_depth' | 'cross_depth';
    preCommandMovementRemainingPair: [number, number];
    postCommandMovementRemainingPair: [number, number];
    knownRouteLengthMovementBudgetPattern: boolean;
    primaryOutcome: PrimaryOutcome;
    pairCount: number;
}

interface IndependentReconstruction {
    endpoints: Endpoint[];
    sourceClassSizes: number[];
    aliasedSourceClassCount: number;
    pairs: RebuiltPair[];
    outcomeCounts: Record<PrimaryOutcome, number>;
    crossTab: CrossTabRow[];
}

interface AuthenticatedSourceFixture {
    parent: string;
    repository: string;
    sourceCommit: string;
    result: stageC.StageCResult;
}

type DeepMutable<T> = T extends readonly (infer Item)[]
    ? DeepMutable<Item>[]
    : T extends object
        ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
        : T;
type MutableStageCResult = DeepMutable<stageC.StageCResult>;

function gitBytes(args: readonly string[], repository = ROOT): Buffer {
    return execFileSync('git', [...args], {
        cwd: repository,
        windowsHide: true,
        maxBuffer: 64 * 1024 * 1024
    });
}

function git(args: readonly string[], repository = ROOT): string {
    return gitBytes(args, repository).toString('utf8').trim();
}

function sha256Bytes(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('hex');
}

function requiredFunction<T extends (...args: never[]) => unknown>(
    namespace: object,
    names: readonly string[]
): T {
    for (const name of names) {
        const candidate = (namespace as Record<string, unknown>)[name];
        if (typeof candidate === 'function') return candidate as T;
    }
    assert.fail(`Missing required export; expected one of: ${names.join(', ')}`);
}

function strictParse(text: string): unknown {
    const parse = requiredFunction<(text: string) => unknown>(stageC, [
        'parseStageCStrictJson',
        'parseStrictJson'
    ]);
    return parse(text);
}

function normalizeD2QCaseRows(cases: readonly JsonRecord[]): JsonRecord[] {
    return cases.map((row) => {
        const readout = row.readout as JsonRecord;
        const error = readout.error as JsonRecord | null;
        return {
            caseId: row.caseId,
            edgeDigest: row.edgeDigest,
            evidenceClass: row.evidenceClass,
            inputUnchanged: row.inputUnchanged,
            mathematicalPlacementImplication: row.mathematicalPlacementImplication,
            observedClass: row.observedClass,
            accepted: readout.accepted,
            mutated: readout.mutated,
            error: error === null ? null : { code: error.code, message: error.message },
            authoritativeEvents: structuredClone(readout.authoritativeEvents),
            eventsDigest: readout.eventsDigest,
            movementRemaining: readout.movementRemaining,
            playerX: readout.playerX,
            revision: readout.revision,
            preStateDigest: readout.preStateDigest,
            postStateDigest: readout.postStateDigest,
            reopeningCondition: row.reopeningCondition,
            requestDigest: row.requestDigest,
            targetDigest: row.targetDigest,
            unchangedRejection: row.unchangedRejection,
            verdict: row.verdict,
            sourceReadoutMatches: row.sourceReadoutMatches,
            witnessDigest: row.witnessDigest
        };
    }).sort((left, right) => compareCanonicalText(
        String(left.caseId), String(right.caseId)
    ));
}

function normalizeD2QAblationRows(rows: readonly JsonRecord[]): JsonRecord[] {
    const partition = (value: unknown): JsonRecord => {
        const source = value as JsonRecord;
        return {
            digest: source.digest,
            members: structuredClone(source.members)
        };
    };
    const pairs = (value: unknown): unknown => structuredClone(value);
    const control = (value: unknown): JsonRecord | null => {
        if (value === null) return null;
        const source = value as JsonRecord;
        return {
            ablatedProjectionEqual: source.ablatedProjectionEqual,
            caseIds: structuredClone(source.caseIds),
            errorEqual: source.errorEqual,
            eventsEqual: source.eventsEqual,
            evidenceClass: source.evidenceClass,
            fullProjectionEqual: source.fullProjectionEqual,
            kind: source.kind,
            mathematicalPlacementImplication: source.mathematicalPlacementImplication,
            postStateEqual: source.postStateEqual,
            reopeningCondition: source.reopeningCondition,
            restorationRecovers: source.restorationRecovers,
            restoredProjectionEqual: source.restoredProjectionEqual,
            targetDigests: structuredClone(source.targetDigests),
            targetEqual: source.targetEqual,
            verdict: source.verdict
        };
    };
    return rows.map((row) => ({
        ablationId: row.ablationId,
        fieldId: row.fieldId,
        roleFamily: row.roleFamily,
        rentScope: row.rentScope,
        canonicalSourceRowDigest: sha256Digest(row),
        omittedFieldIds: structuredClone(row.omittedFieldIds),
        contextDigest: row.contextDigest,
        stageDigest: row.stageDigest,
        fullClasses: partition(row.fullClasses),
        ablatedClasses: partition(row.ablatedClasses),
        restoredClasses: partition(row.restoredClasses),
        aliasPairs: pairs(row.aliasPairs),
        equalTargetControls: pairs(row.equalTargetControls),
        primaryControl: control(row.primaryControl),
        equalityControl: control(row.equalityControl),
        errorOnlyControl: control(row.errorOnlyControl),
        frameChecks: structuredClone(row.frameChecks),
        actuallyOmitted: row.actuallyOmitted,
        sourceFactsPass: row.sourceFactsPass,
        restorationRecovers: row.restorationRecovers,
        evidenceClass: row.evidenceClass,
        mathematicalPlacementImplication: row.mathematicalPlacementImplication,
        reopeningCondition: row.reopeningCondition,
        derivedVerdict: row.verdict
    })).sort((left, right) => compareCanonicalText(
        String(left.fieldId), String(right.fieldId)
    ));
}

function stageBBytes(): Buffer {
    const bytes = gitBytes(['show', `${STAGE_B_RESULT_COMMIT}:${STAGE_B_RESULT_PATH}`]);
    assert.equal(git(['rev-parse', `${STAGE_B_RESULT_COMMIT}:${STAGE_B_RESULT_PATH}`]),
        STAGE_B_RESULT_BLOB);
    assert.equal(sha256Bytes(bytes), STAGE_B_RESULT_FILE_SHA256);
    return bytes;
}

let cachedStageBResult: StageBResult | undefined;
let cachedIndependentReconstruction: IndependentReconstruction | undefined;

function readStageBResult(): StageBResult {
    if (cachedStageBResult !== undefined) return cachedStageBResult;
    const parsed = strictParse(stageBBytes().toString('utf8')) as StageBResult;
    const { resultDigest, ...payload } = parsed;
    assert.equal(resultDigest, STAGE_B_RESULT_DIGEST);
    assert.equal(sha256Digest(payload), resultDigest);
    cachedStageBResult = parsed;
    return parsed;
}

function commandSemantic(endpoint: Endpoint): unknown {
    return {
        accepted: endpoint.readout.accepted,
        mutated: endpoint.readout.mutated,
        error: endpoint.readout.error,
        authoritativeEvents: endpoint.readout.authoritativeEvents
    };
}

function classify(left: Endpoint, right: Endpoint): Pick<RebuiltPair,
    'equality' | 'primaryOutcome' | 'targetRelevant'> {
    const commandSemanticEqual = canonicalJson(commandSemantic(left)) ===
        canonicalJson(commandSemantic(right));
    const postMovementRemainingEqual = left.postCommandMovementRemaining ===
        right.postCommandMovementRemaining;
    const preRevisionEqual = left.preCommandRevision === right.preCommandRevision;
    const postRevisionEqual = left.postCommandRevision === right.postCommandRevision;
    const preStateDigestEqual = left.preCommandStateDigest === right.preCommandStateDigest;
    const postStateDigestEqual = left.postCommandStateDigest === right.postCommandStateDigest;
    const routeHistoryEqual = canonicalJson(left.directions) === canonicalJson(right.directions);
    const primaryOutcome: PrimaryOutcome = !left.frameOk || !right.frameOk
        ? 'frame_support_failure'
        : !commandSemanticEqual
            ? 'command_semantic_split'
            : !postMovementRemainingEqual
                ? 'continuation_support_split'
                : !preRevisionEqual || !postRevisionEqual ||
                    !preStateDigestEqual || !postStateDigestEqual
                    ? 'provenance_exact_state_only_split'
                    : 'no_target_relevant_split';
    return {
        equality: {
            commandSemanticEqual,
            postMovementRemainingEqual,
            preRevisionEqual,
            postRevisionEqual,
            preStateDigestEqual,
            postStateDigestEqual,
            routeHistoryEqual
        },
        primaryOutcome,
        targetRelevant: primaryOutcome === 'command_semantic_split' ||
            primaryOutcome === 'continuation_support_split'
    };
}

function rebuildCrossTab(pairs: readonly RebuiltPair[]): CrossTabRow[] {
    const cells = new Map<string, CrossTabRow>();
    for (const pair of pairs) {
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
        const budgetDelta = preCommandMovementRemainingPair[1] -
            preCommandMovementRemainingPair[0];
        const row: CrossTabRow = {
            endpointOrder: 'canonical_route_id_left_right',
            endpointDepthPair,
            depthRelation: endpointDepthPair[0] === endpointDepthPair[1]
                ? 'same_depth' : 'cross_depth',
            preCommandMovementRemainingPair,
            postCommandMovementRemainingPair,
            knownRouteLengthMovementBudgetPattern:
                depthDelta !== 0 && budgetDelta !== 0 && depthDelta * budgetDelta < 0,
            primaryOutcome: pair.primaryOutcome,
            pairCount: 1
        };
        const key = canonicalJson({
            endpointOrder: row.endpointOrder,
            endpointDepthPair: row.endpointDepthPair,
            depthRelation: row.depthRelation,
            preCommandMovementRemainingPair: row.preCommandMovementRemainingPair,
            postCommandMovementRemainingPair: row.postCommandMovementRemainingPair,
            knownRouteLengthMovementBudgetPattern: row.knownRouteLengthMovementBudgetPattern,
            primaryOutcome: row.primaryOutcome
        });
        const current = cells.get(key);
        cells.set(key, current ? { ...current, pairCount: current.pairCount + 1 } : row);
    }
    return [...cells.entries()]
        .sort(([left], [right]) => compareCanonicalText(left, right))
        .map(([, row]) => row);
}

function independentlyReconstruct(input = readStageBResult()): IndependentReconstruction {
    if (input === cachedStageBResult && cachedIndependentReconstruction !== undefined) {
        return cachedIndependentReconstruction;
    }
    const endpoints = structuredClone(input.records.eligibleEndpoints);
    assert.equal(new Set(endpoints.map((row) => row.endpointId)).size, endpoints.length);
    const classes = new Map<string, Endpoint[]>();
    for (const endpoint of endpoints) {
        const exactClass = canonicalJson({
            cutId: endpoint.sourceProjection.cutId,
            cutVersion: endpoint.sourceProjection.cutVersion,
            projectedValue: endpoint.sourceProjection.projectedValue
        });
        assert.equal(
            endpoint.sourceProjection.classKey,
            `cut-${sha256Digest({
                cutId: endpoint.sourceProjection.cutId,
                cutVersion: endpoint.sourceProjection.cutVersion,
                projectedValue: endpoint.sourceProjection.projectedValue
            })}`
        );
        const members = classes.get(exactClass) ?? [];
        members.push(endpoint);
        classes.set(exactClass, members);
    }
    const pairs: RebuiltPair[] = [];
    for (const members of classes.values()) {
        members.sort((left, right) => compareCanonicalText(left.routeId, right.routeId));
        for (let leftIndex = 0; leftIndex < members.length - 1; leftIndex += 1) {
            for (let rightIndex = leftIndex + 1; rightIndex < members.length; rightIndex += 1) {
                const left = members[leftIndex];
                const right = members[rightIndex];
                const classified = classify(left, right);
                pairs.push({
                    rowType: 'alias_pair',
                    pairId: `pair-${sha256Digest({
                        classKey: left.sourceProjection.classKey,
                        leftEndpointId: left.endpointId,
                        rightEndpointId: right.endpointId
                    })}`,
                    classKey: left.sourceProjection.classKey,
                    projectedValue: structuredClone(left.sourceProjection.projectedValue),
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
    pairs.sort((left, right) => compareCanonicalText(left.pairId, right.pairId));
    assert.equal(new Set(pairs.map((row) => row.pairId)).size, pairs.length);
    const outcomeCounts = Object.fromEntries(PRIMARY_OUTCOMES.map((outcome) => [outcome, 0])) as
        Record<PrimaryOutcome, number>;
    for (const pair of pairs) outcomeCounts[pair.primaryOutcome] += 1;
    const reconstructed = {
        endpoints,
        sourceClassSizes: [...classes.values()].map((rows) => rows.length).sort((a, b) => a - b),
        aliasedSourceClassCount: [...classes.values()].filter((rows) => rows.length > 1).length,
        pairs,
        outcomeCounts,
        crossTab: rebuildCrossTab(pairs)
    };
    if (input === cachedStageBResult) cachedIndependentReconstruction = reconstructed;
    return reconstructed;
}

function equalityAudit(
    endpoints: readonly Endpoint[],
    candidate: (endpoint: Endpoint) => unknown
): { groups: number; equalPairs: number; kTarget: number; command: number; continuation: number } {
    const groups = new Map<string, Endpoint[]>();
    for (const endpoint of endpoints) {
        const key = canonicalJson(candidate(endpoint));
        const members = groups.get(key) ?? [];
        members.push(endpoint);
        groups.set(key, members);
    }
    let equalPairs = 0;
    let kTarget = 0;
    let command = 0;
    let continuation = 0;
    for (const members of groups.values()) {
        for (let left = 0; left < members.length - 1; left += 1) {
            for (let right = left + 1; right < members.length; right += 1) {
                equalPairs += 1;
                const commandDifferent = canonicalJson(commandSemantic(members[left])) !==
                    canonicalJson(commandSemantic(members[right]));
                const continuationDifferent = members[left].postCommandMovementRemaining !==
                    members[right].postCommandMovementRemaining;
                if (commandDifferent) command += 1;
                if (continuationDifferent) continuation += 1;
                if (commandDifferent || continuationDifferent) kTarget += 1;
            }
        }
    }
    return { groups: groups.size, equalPairs, kTarget, command, continuation };
}

function parseTreeRow(
    commit: string,
    path: string,
    repository = ROOT
): { mode: string; blob: string } {
    const line = git(['ls-tree', commit, '--', path], repository);
    const match = /^(\d{6}) blob ([0-9a-f]{40})\t/.exec(line);
    assert(match, `Missing regular source binding: ${commit}:${path}`);
    return { mode: match[1], blob: match[2] };
}

let sharedAuthenticatedSourceFixture: AuthenticatedSourceFixture | undefined;

function buildAuthenticatedSourceFixture(): AuthenticatedSourceFixture {
    if (sharedAuthenticatedSourceFixture !== undefined) return sharedAuthenticatedSourceFixture;
    const parent = mkdtempSync(join(tmpdir(), 'stage-c-authenticated-source-'));
    const repository = resolve(parent, 'repository');
    execFileSync('git', ['clone', '--quiet', '--shared', '--no-checkout', ROOT, repository], {
        cwd: parent,
        windowsHide: true
    });
    const fixtureGit = (args: readonly string[], input?: Buffer): string =>
        execFileSync('git', [...args], {
            cwd: repository,
            encoding: 'utf8',
            windowsHide: true,
            input
        }).trim();
    fixtureGit(['read-tree', `${STAGE_C_BASE_COMMIT}^{tree}`]);
    for (const path of SOURCE_OUTPUTS) {
        const bytes = readFileSync(resolve(ROOT, path));
        const blob = fixtureGit(['hash-object', '-w', '--stdin'], bytes);
        fixtureGit(['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`]);
    }
    const tree = fixtureGit(['write-tree']);
    const sourceCommit = fixtureGit([
        '-c', 'user.name=Stage C authenticated fixture',
        '-c', 'user.email=stage-c-authenticated@example.invalid',
        'commit-tree', tree, '-p', STAGE_C_BASE_COMMIT, '-m', 'authenticated Stage C source fixture'
    ]);
    const result = stageC.reconstructStageCReturn(sourceCommit, repository);
    sharedAuthenticatedSourceFixture = { parent, repository, sourceCommit, result };
    return sharedAuthenticatedSourceFixture;
}

after(() => {
    if (sharedAuthenticatedSourceFixture !== undefined) {
        rmSync(sharedAuthenticatedSourceFixture.parent, { recursive: true, force: true });
    }
});

function commitFixturePaths(
    repository: string,
    parentCommit: string,
    message: string,
    paths: Readonly<Record<string, string>>
): string {
    const fixtureGit = (args: readonly string[], input?: Buffer): string =>
        execFileSync('git', [...args], {
            cwd: repository,
            encoding: 'utf8',
            windowsHide: true,
            input
        }).trim();
    fixtureGit(['read-tree', `${parentCommit}^{tree}`]);
    for (const [path, payload] of Object.entries(paths)) {
        const blob = fixtureGit(['hash-object', '-w', '--stdin'], Buffer.from(payload, 'utf8'));
        fixtureGit(['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`]);
    }
    const tree = fixtureGit(['write-tree']);
    return fixtureGit([
        '-c', 'user.name=Stage C durable fixture',
        '-c', 'user.email=stage-c-durable@example.invalid',
        'commit-tree', tree, '-p', parentCommit, '-m', message
    ]);
}

function commitDurableResult(fixture: AuthenticatedSourceFixture): string {
    return commitFixturePaths(fixture.repository, fixture.sourceCommit, 'durable Stage C result', {
        [RESULT_PATH]: stageC.stageCResultText(fixture.result),
        [REPORT_PATH]: stageC.renderStageCReport(fixture.result)
    });
}

function syntheticPilotBoundIdentities(
    sourceCommit: string,
    resultCommit: string
): stageC.StageCPilotBoundIdentities {
    return {
        source: { commit: sourceCommit, tree: '1'.repeat(40), digest: '1'.repeat(64) },
        resultCommit: { commit: resultCommit, tree: '2'.repeat(40) },
        resultArtifact: {
            path: RESULT_PATH,
            mode: '100644',
            blob: '3'.repeat(40),
            sha256: '3'.repeat(64),
            semanticDigest: '4'.repeat(64),
            parityDigest: '5'.repeat(64)
        },
        reportArtifact: {
            path: REPORT_PATH,
            mode: '100644',
            blob: '6'.repeat(40),
            sha256: '6'.repeat(64),
            resultParityDigest: '5'.repeat(64)
        },
        ranges: {
            sourceToResultDigest: '7'.repeat(64),
            entryToResultDigest: '8'.repeat(64)
        },
        predecessorStageBResult: {
            commit: STAGE_B_RESULT_COMMIT,
            path: STAGE_B_RESULT_PATH,
            mode: '100644',
            blob: STAGE_B_RESULT_BLOB,
            sha256: STAGE_B_RESULT_FILE_SHA256,
            semanticDigest: STAGE_B_RESULT_DIGEST
        }
    };
}

function exactPilotBoundIdentities(
    fixture: AuthenticatedSourceFixture,
    resultCommit: string
): stageC.StageCPilotBoundIdentities {
    const resultRow = parseTreeRow(resultCommit, RESULT_PATH, fixture.repository);
    const reportRow = parseTreeRow(resultCommit, REPORT_PATH, fixture.repository);
    const predecessorRow = parseTreeRow(STAGE_B_RESULT_COMMIT, STAGE_B_RESULT_PATH, fixture.repository);
    const sourceToResult = stageC.auditStageCLifecycleRange(
        'result', fixture.sourceCommit, resultCommit, fixture.repository
    );
    const entryToResult = stageC.auditStageCRange(
        STAGE_C_BASE_COMMIT,
        resultCommit,
        [...SOURCE_OUTPUTS, ...RESULT_OUTPUTS],
        fixture.repository
    );
    const independentlyBound: stageC.StageCPilotBoundIdentities = {
        source: {
            commit: fixture.sourceCommit,
            tree: git(['rev-parse', `${fixture.sourceCommit}^{tree}`], fixture.repository),
            digest: fixture.result.source.sourceDigest
        },
        resultCommit: {
            commit: resultCommit,
            tree: git(['rev-parse', `${resultCommit}^{tree}`], fixture.repository)
        },
        resultArtifact: {
            path: RESULT_PATH,
            mode: '100644',
            blob: resultRow.blob,
            sha256: sha256Bytes(gitBytes(['show', `${resultCommit}:${RESULT_PATH}`], fixture.repository)),
            semanticDigest: fixture.result.resultDigest,
            parityDigest: fixture.result.digests.parityDigest
        },
        reportArtifact: {
            path: REPORT_PATH,
            mode: '100644',
            blob: reportRow.blob,
            sha256: sha256Bytes(gitBytes(['show', `${resultCommit}:${REPORT_PATH}`], fixture.repository)),
            resultParityDigest: fixture.result.digests.parityDigest
        },
        ranges: {
            sourceToResultDigest: sourceToResult.rangeDigest,
            entryToResultDigest: entryToResult.rangeDigest
        },
        predecessorStageBResult: {
            commit: STAGE_B_RESULT_COMMIT,
            path: STAGE_B_RESULT_PATH,
            mode: '100644',
            blob: predecessorRow.blob,
            sha256: sha256Bytes(gitBytes([
                'show', `${STAGE_B_RESULT_COMMIT}:${STAGE_B_RESULT_PATH}`
            ], fixture.repository)),
            semanticDigest: STAGE_B_RESULT_DIGEST
        }
    };
    const implementationBound = stageC.buildStageCPilotBoundIdentities(
        resultCommit, fixture.repository
    );
    assert.equal(canonicalJson(implementationBound), canonicalJson(independentlyBound));
    return implementationBound;
}

function pilotSynthesisFixture(
    sourceCommit: string,
    resultCommit: string,
    boundIdentities = syntheticPilotBoundIdentities(sourceCommit, resultCommit)
): stageC.StageCPostResultPilotSynthesis {
    const roleReturns = stageC.STAGE_C_PILOT_ROLES.map((role) => ({
        role,
        taskId: ({
            crpm_route_tracer: '/root/stage_c_route_trace',
            crpm_covariance_auditor: '/root/stage_c_covariance',
            crpm_reentry_reviewer: '/root/stage_c_reentry'
        } as const)[role],
        boundSourceCommit: sourceCommit,
        boundResultCommit: resultCommit,
        boundIdentities: structuredClone(boundIdentities),
        claimStatus: 'support_qualified' as const,
        evidenceIndependence: 'correlated_reuse' as const,
        sourcePaths: [...stageC.STAGE_C_PILOT_REQUIRED_SOURCE_PATHS],
        supportOverlap:
            'same_committed_stage_c_result_report_and_correlated_predecessor_facts' as const,
        preserved: ['D2Q core and complete finite result'],
        forgotten: ['thin-cut omitted continuation coordinates'],
        newlyVisible: ['target-relative thin-plus-budget sufficiency'],
        residual: ['longer horizons and public formation'],
        disagreements: [],
        falsePromotionFindings: ['No causal, minimal, recursive, or public-carrier promotion.'],
        reopeningConditions: ['A new preregistration and fresh source-bound review.'],
        HT10: 'survived_exact_bounded_reconstruction',
        HT11: 'supports_bounded_review_decision_only',
        strongestLicensedClaim:
            'support_qualified_for_bounded_stage_c_reentry_only' as const,
        blockers: []
    }));
    return {
        schemaVersion: 1,
        boundSourceCommit: sourceCommit,
        boundResultCommit: resultCommit,
        evidenceOverlap: 'correlated_reuse',
        decisionMethod: 'governing_synthesis_without_vote',
        roleReturns,
        governingSynthesis: {
            currentHeadAndSourceBasis: `result ${resultCommit} from source ${sourceCommit}`,
            pilotActivationDecisionAndReason:
                'required because this review can admit a cross-world re-entry',
            levelCutProtectedFamilyAndFrame:
                'L4+ finite one-command target under thin_visible_duel_v0@2',
            perAgentFindingsAndEvidenceOverlap:
                'Three falsification routes agree under correlated_reuse only.',
            historicalStatusDrift:
                'Stage B prospective W-absent status stays historical; Stage C has a durable W.',
            evidenceIndependenceBySupportPath:
                'Implementation reconstruction is independent; mathematical facts are correlated reuse.',
            committedExactCompositionStatus:
                'Exact source, result, report, range, parity, and review inputs are committed.',
            preservedForgottenNewlyVisibleResidual:
                'D2Q/result preserved; thin forgets budget; bounded support visible; wider closure residual.',
            disagreementsAndFalsePromotionFindings:
                'No substantive disagreement; no vote, causal, minimal, recursive, or placement promotion.',
            HT10HT11TransferBackStatus:
                'HT10 survived bounded reconstruction; HT11 survived bounded review only.',
            stopReopenDecisions:
                'Thin completeness stopped; successor execution closed pending separate preregistration.',
            strongestLicensedClaim:
                'Bounded target-relative Stage C re-entry only, with no ProductAuthority or placement.',
            explicitNonClaims: [...stageC.STAGE_C_REQUIRED_NONCLAIMS],
            disagreementDisposition: 'no_substantive_disagreement',
            licenseFacts: {
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
            },
            majorityVoteUsed: false,
            blockers: []
        }
    };
}

let sharedDurableReviewFixture: {
    fixture: AuthenticatedSourceFixture;
    resultCommit: string;
    synthesis: stageC.StageCPostResultPilotSynthesis;
    review: stageC.StageCReviewReturn;
} | undefined;

function buildDurableReviewFixture(): NonNullable<typeof sharedDurableReviewFixture> {
    if (sharedDurableReviewFixture !== undefined) return sharedDurableReviewFixture;
    const fixture = buildAuthenticatedSourceFixture();
    const resultCommit = commitDurableResult(fixture);
    const synthesis = pilotSynthesisFixture(
        fixture.sourceCommit,
        resultCommit,
        exactPilotBoundIdentities(fixture, resultCommit)
    );
    const review = stageC.buildStageCReviewReturn(resultCommit, synthesis, fixture.repository);
    sharedDurableReviewFixture = { fixture, resultCommit, synthesis, review };
    return sharedDurableReviewFixture;
}

function coherentlyRehashStageCReviewReturn(
    input: stageC.StageCReviewReturn
): stageC.StageCReviewReturn {
    const value = structuredClone(input) as unknown as DeepMutable<stageC.StageCReviewReturn>;
    for (const range of [
        value.resultRanges.sourceToResult,
        value.resultRanges.entryToResult
    ]) {
        range.rangeDigest = sha256Digest({
            baseCommit: range.baseCommit,
            resultCommit: range.resultCommit,
            allowedPaths: range.allowedPaths,
            commits: range.commits,
            endpointRows: range.endpointRows
        });
    }
    value.pilotReview.synthesisDigest = sha256Digest(value.pilotReview.synthesis);
    value.parityDigest = sha256Digest({
        resultDigest: value.result.semanticDigest,
        resultParityDigest: value.report.parityDigest,
        reportSha256: value.report.sha256,
        pilotSynthesisDigest: value.pilotReview.synthesisDigest,
        witnessReturn: value.witnessReturn,
        tauReturn: value.tauReturn,
        chartRevision: value.chartRevision,
        governance: value.governance
    });
    const unsigned = { ...value } as Record<string, unknown>;
    delete unsigned.returnDigest;
    value.returnDigest = sha256Digest(unsigned);
    return value as unknown as stageC.StageCReviewReturn;
}

function coherentlyRehashStageCResult(input: stageC.StageCResult): stageC.StageCResult {
    const value = structuredClone(input) as MutableStageCResult;
    value.digests.reconstructionDigest = sha256Digest({
        reconstruction: value.reconstruction,
        coformation: value.routeDepthMovementBudgetCoformation
    });
    value.digests.witnessDigest = sha256Digest(value.witnessReturn);
    value.digests.carrierDigest = sha256Digest({
        candidateAssessments: value.candidateAssessments,
        roles: value.carrierRoles,
        stateMaterialSeparation: value.stateMaterialSeparation,
        tauReturn: value.tauReturn
    });
    value.digests.chartDigest = sha256Digest(value.chartRevision);
    value.digests.parityDigest = sha256Digest({
        reconstruction: {
            endpointCount: value.reconstruction.endpointCount,
            sourceClassCount: value.reconstruction.sourceClassCount,
            aliasedClassCount: value.reconstruction.aliasedClassCount,
            pairCount: value.reconstruction.pairCount,
            primaryOutcomeCounts: value.reconstruction.primaryOutcomeCounts,
            targetRelevantPairCount: value.reconstruction.targetRelevantPairCount,
            crossTabDigest: value.reconstruction.crossTabDigest
        },
        candidateAssessments: value.candidateAssessments,
        witnessReturn: value.witnessReturn,
        roles: value.carrierRoles,
        stateMaterialSeparation: value.stateMaterialSeparation,
        tauReturn: value.tauReturn,
        chartRevision: value.chartRevision,
        governance: value.governance,
        stopStatement: value.stopStatement
    });
    const unsigned = { ...value } as Record<string, unknown>;
    delete unsigned.resultDigest;
    value.resultDigest = sha256Digest(unsigned);
    return value as stageC.StageCResult;
}

function candidateFixture(overrides: Partial<stageC.StageCCandidateAssessment> = {}):
stageC.StageCCandidateAssessment {
    return {
        candidateId: 'candidate-fixture',
        coordinates: ['thin_visible_duel_v0@2'],
        protectedTarget: 'K_WPV4_ONE_COMMAND_COMPLETE_V1',
        groupCount: 17,
        equalityPairCount: 6_265,
        partitionIdentityDigest: sha256Digest([]),
        counterexampleCount: 0,
        counterexamplePairIdsDigest: sha256Digest([]),
        verdict: 'fixture_pass',
        nonVacuous: true,
        scopeGuard: 'finite fixture only',
        ...overrides
    };
}

test('Stage C strict JSON rejects ordinary, escaped, nested and trailing duplicates', () => {
    assert.deepEqual(strictParse('{"a":1,"nested":{"a":2},"rows":[1,2]}'), {
        a: 1, nested: { a: 2 }, rows: [1, 2]
    });
    for (const text of [
        '{"pairId":"one","pairId":"two"}',
        '{"pairId":"one","\\u0070airId":"two"}',
        '{"outer":{"field":"one","field":"two"}}',
        '{"rows":[{"id":"one","id":"two"}]}',
        '{"a":1} trailing', '{"a":1,}', '[1,2,]', '{"a":NaN}', '{"a":Infinity}'
    ]) assert.throws(() => strictParse(text), text);
});

test('Stage C registration freezes the exact source boundary and nine staged additive outputs', () => {
    const registration = strictParse(readFileSync(resolve(ROOT, REGISTRATION_PATH), 'utf8')) as JsonRecord;
    assert.equal(registration.registrationId,
        'WP-015D2R:stage-c-independent-reconstruction-and-chart-revision:v1');
    assert.equal(registration.supportWorkPackageId, 'WP-015D2U');
    const sourceBoundary = registration.sourceBoundary as JsonRecord;
    assert.equal((sourceBoundary.sourceHead as JsonRecord).commit, STAGE_C_BASE_COMMIT);
    assert.equal(sourceBoundary.stageBResultDigest, STAGE_B_RESULT_DIGEST);
    assert.equal(canonicalJson(registration.independentReconstructionBoundary),
        canonicalJson(stageC.STAGE_C_EXPECTED_INDEPENDENT_RECONSTRUCTION_BOUNDARY));
    assert.equal(canonicalJson(registration.fixedFrame),
        canonicalJson(stageC.STAGE_C_EXPECTED_REGISTRATION_FIXED_FRAME));
    const registeredFrame = registration.fixedFrame as JsonRecord;
    assert.equal(registeredFrame.tolerance, 0);
    assert.equal(typeof registeredFrame.tolerance, 'number');
    const output = registration.outputContract as JsonRecord;
    assert.deepEqual(output.allowedOutputs, ALLOWED_OUTPUTS);
    assert.deepEqual(output.sourceOutputs, SOURCE_OUTPUTS);
    assert.deepEqual(output.resultOutputs, RESULT_OUTPUTS);
    assert.deepEqual(output.reviewReturnOutputs, REVIEW_RETURN_OUTPUTS);
    assert.equal(output.requiredStatus, 'A');
    assert.equal(output.requiredMode, '100644');
    assert.equal(output.existingPathChangesAllowed, false);
    assert.deepEqual(output.ignoredOrRawOutputsAllowed, []);
    assert.equal(output.baseCommit, STAGE_C_BASE_COMMIT);
    assert.equal(new Set(output.allowedOutputs as readonly string[]).size, ALLOWED_OUTPUTS.length);

    const pilot = registration.pilotSynthesis as JsonRecord;
    const entry = pilot.actualEntryReturns as JsonRecord;
    assert.equal(entry.completedBeforeSourceEdits, true);
    const entryReturns = entry.returns as Array<JsonRecord>;
    assert.deepEqual(entryReturns.map((row) => row.role), [
        'crpm_route_tracer', 'crpm_covariance_auditor', 'crpm_reentry_reviewer'
    ]);
    assert.equal(new Set(entryReturns.map((row) => row.taskId)).size, 3);
    assert(entryReturns.every((row) => row.claimStatus === 'support_qualified'));
    assert(entryReturns.every((row) => row.evidenceClass === 'correlated_reuse'));
    const overlap = entry.evidenceOverlap as JsonRecord;
    assert.equal(overlap.empiricallyIndependentPairs, 0);
    assert.equal(overlap.atomicFacts, 'correlated_reuse');
    assert.equal((entry.disagreement as JsonRecord).substantive, 'none');
    assert.deepEqual(entry.transferBackStatus, {
        HT10: 'opened_only_for_the_exact_bounded_independent_reconstruction',
        HT11: 'stopped_pending_durable_result_fresh_three_role_review_and_review_return',
        P3: 'closed',
        HT8: 'closed_except_recoverable_provenance',
        learnedSupportFormation: 'closed'
    });
    const reviewContract = registration.reviewReturnContract as JsonRecord;
    const freshAudit = reviewContract.freshPostResultPilotAudit as JsonRecord;
    assert.equal(freshAudit.required, true);
    assert.deepEqual(freshAudit.roles, [
        'crpm_route_tracer', 'crpm_covariance_auditor', 'crpm_reentry_reviewer'
    ]);
    assert.match(String(freshAudit.recordingRule), /cannot substitute for fresh reviewer input/);
    assert.match(String(freshAudit.agreementRule), /do not use majority vote/i);
});

test('Stage C registration rejects coherent source substitution and lifecycle or gate drift', () => {
    const registration = strictParse(
        readFileSync(resolve(ROOT, REGISTRATION_PATH), 'utf8')
    ) as JsonRecord;
    assert.doesNotThrow(() => stageC.validateStageCRegistration(structuredClone(registration)));

    const substituted = structuredClone(registration) as JsonRecord;
    const boundary = substituted.sourceBoundary as JsonRecord;
    const bindings = boundary.sourceBindings as JsonRecord[];
    const replacementCommit = '65b2153714f237964354da3791fe4af4694a0594';
    const replacementPath = 'package.json';
    const replacementTree = parseTreeRow(replacementCommit, replacementPath);
    bindings[0] = {
        ...bindings[0],
        commit: replacementCommit,
        path: replacementPath,
        mode: replacementTree.mode,
        blob: replacementTree.blob,
        sha256: sha256Bytes(gitBytes(['show', `${replacementCommit}:${replacementPath}`])),
        role: 'coherently_substituted_valid_git_object'
    };
    assert.throws(() => {
        const checked = stageC.validateStageCRegistration(substituted);
        stageC.verifyStageCSourceBindings(checked, ROOT);
    }, 'A valid but undeclared Git object cannot replace an exact registered source identity.');

    const mutations: Array<(value: JsonRecord) => void> = [
        (value) => { (value.outputContract as JsonRecord).requiredStatus = 'M'; },
        (value) => { (value.outputContract as JsonRecord).requiredMode = '100755'; },
        (value) => { (value.outputContract as JsonRecord).existingPathChangesAllowed = true; },
        (value) => {
            ((value.outputContract as JsonRecord).lifecycle as JsonRecord).sourceStage =
                'allow any source edit';
        },
        (value) => {
            ((value.outputContract as JsonRecord).lifecycle as JsonRecord)
                .terminalCloseoutStage = 'skip terminal evidence';
        },
        (value) => { (value.governedStop as JsonRecord).successorWorldExecution = 'opened'; },
        (value) => { (value.governedStop as JsonRecord).productAuthority = 'granted'; },
        (value) => { (value.governedStop as JsonRecord).p5 = 'opened'; }
    ];
    for (const mutate of mutations) {
        const candidate = structuredClone(registration) as JsonRecord;
        mutate(candidate);
        assert.throws(() => stageC.validateStageCRegistration(candidate));
    }

    for (const boundaryName of [
        'independentReconstructionBoundary', 'fixedFrame'
    ] as const) {
        const exactBoundary = registration[boundaryName];
        for (const path of scalarLeafPaths(exactBoundary)) {
            const candidate = structuredClone(registration) as JsonRecord;
            corruptScalarLeaf(candidate[boundaryName], path);
            assert.throws(() => stageC.validateStageCRegistration(candidate),
                `${boundaryName}.${path.join('.')} drift was not rejected.`);
        }
        const candidate = structuredClone(registration) as JsonRecord;
        (candidate[boundaryName] as JsonRecord).undeclaredBoundaryWidening = true;
        assert.throws(() => stageC.validateStageCRegistration(candidate),
            `${boundaryName} accepted an undeclared extra field.`);
    }
});

test('WP-015D2U work evidence preserves source, lifecycle, non-authority and stop parity', () => {
    const evidence = strictParse(
        readFileSync(resolve(ROOT, 'docs/evidence/wp-015d2u.json'), 'utf8')
    ) as JsonRecord;
    assert.equal(evidence.id, 'WP-015D2U');
    assert(['in_progress', 'complete'].includes(String(evidence.status)));
    assert.equal(evidence.starting_commit, STAGE_C_BASE_COMMIT);
    assert.equal(evidence.branch, 'codex/wp-015d2r-stage-c-reconstruction-v1');
    assert.equal(evidence.initial_worktree, 'clean');
    assert.deepEqual(evidence.owning_roles, [
        'worms_port_independent_reconstructor',
        'worms_port_reentry_reviewer',
        'cross_repository_coordinator'
    ]);
    const scope = (evidence.scope as string[]).join('\n');
    for (const exact of [
        STAGE_B_RESULT_COMMIT, STAGE_B_RESULT_DIGEST, '274 endpoints', '7,378 pair identities',
        'navigator admission pending', 'Tau candidate_unlicensed',
        REVIEW_RETURN_PATH, 'exactly nine additive tracked outputs'
    ]) assert.match(scope, new RegExp(exact.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    const nonGoals = (evidence.non_goals as string[]).join('\n');
    for (const prohibited of [
        'rerun Stage B', 'enumerate or regenerate routes', 'authority simulation',
        'change gameplay', 'ProductAuthority', 'mathematical placement', 'P5'
    ]) assert.match(nonGoals, new RegExp(prohibited, 'i'));
    const planned = (evidence.planned_checks as string[]).join('\n');
    for (const control of [
        'duplicate-key', 'Q_support', 'Q_command', 'result/report/review-return',
        'changed-path/status/mode/blob', 'fresh post-result three-role'
    ]) assert.match(planned, new RegExp(control.replaceAll('/', '\\/'), 'i'));
    assert.deepEqual(evidence.clean_room_records, []);

    if (evidence.status === 'in_progress') {
        assert.equal(existsSync(resolve(ROOT, RESULT_PATH)), false,
            'The source-stage evidence cannot coexist with a premature working result.');
        assert.equal(existsSync(resolve(ROOT, REVIEW_RETURN_PATH)), false,
            'The source-stage evidence cannot coexist with a premature review return.');
        return;
    }

    assert.equal(evidence.status, 'complete');
    assert.equal(existsSync(resolve(ROOT, RESULT_PATH)), true);
    assert.equal(existsSync(resolve(ROOT, REVIEW_RETURN_PATH)), true);
    const result = stageC.validateStageCResult(strictParse(
        readFileSync(resolve(ROOT, RESULT_PATH), 'utf8')
    ));
    const review = stageC.validateStageCReviewReturn(strictParse(
        readFileSync(resolve(ROOT, REVIEW_RETURN_PATH), 'utf8')
    ), result);
    const sourceEvidence = strictParse(gitBytes([
        'show', `${result.source.sourceCommit}:docs/evidence/wp-015d2u.json`
    ]).toString('utf8')) as JsonRecord;
    assert.equal(sourceEvidence.status, 'in_progress');
    assert.deepEqual(sourceEvidence.clean_room_records, []);
    for (const field of ['check_results', 'reviews', 'skipped_checks'] as const) {
        assert(Array.isArray(evidence[field]) && (evidence[field] as unknown[]).length > 0,
            `Terminal WP-015D2U ${field} must be nonempty.`);
    }
    const closeoutDetail = canonicalJson({
        checkResults: evidence.check_results,
        reviews: evidence.reviews,
        skippedChecks: evidence.skipped_checks,
        residualRisks: evidence.residual_risks
    });
    for (const closedGate of [
        'ProductAuthority', 'mathematical placement', 'player observation',
        'gameplay', 'P5', 'successor world'
    ]) assert.match(closeoutDetail, new RegExp(closedGate, 'i'));
    assert.equal(review.governance.productAuthority, 'none');
    assert.equal(review.governance.mathematicalPlacementImplication, 'none');
    assert.equal(review.governance.playerObservationTiming, 'closed');
    assert.equal(review.governance.gameplayChange, false);
    assert.equal(review.governance.p5, 'closed');
    assert.equal(review.governance.successorWorldExecution, 'closed');
});

test('Stage C sources statically exclude Stage B builders, route generation and authority calls', () => {
    const combined = [IMPLEMENTATION_PATH, RUNNER_PATH]
        .map((path) => readFileSync(resolve(ROOT, path), 'utf8')).join('\n');
    for (const forbidden of [
        /from\s+['"][^'"]*assess-wp-015d2r-stage-b-one-next-command-search-v1['"]/,
        /from\s+['"][^'"]*run-wp-015d2r-stage-b-one-next-command-search-v1['"]/,
        /from\s+['"][^'"]*v4-authority-adapter['"]/,
        /from\s+['"][^'"]*shared\/simulation['"]/,
        /\bexecuteRegisteredRoutes\s*\(/,
        /\bbuildRegisteredWords\s*\(/,
        /\brunStageBExecution\s*\(/,
        /\bcreateSimulation\s*\(/,
        /\bapplySimulationCommand\s*\(/,
        /\btickSimulation\s*\(/
    ]) assert.doesNotMatch(combined, forbidden);
    assert.match(combined, /analysis\/crpm_world\/canonical|\.\.\/canonical/);
    assert.match(combined, new RegExp(STAGE_B_RESULT_COMMIT));
    assert.match(combined, new RegExp(STAGE_B_RESULT_PATH.replaceAll('/', '\\/')));
    assert.doesNotMatch(combined, /durableReview\s*:\s*\{\s*passed\s*:/);
    for (const derivedReviewInput of [
        'resultIdentity', 'reportIdentity', 'sourceToResultRange', 'entryToResultRange',
        'committedResultCanonicalDigest', 'reconstructedResultCanonicalDigest',
        'committedReportSha256', 'renderedReportSha256', 'pilotSynthesis'
    ]) assert.match(combined, new RegExp(derivedReviewInput));
});

test('Stage C independently authenticates every declared predecessor source binding', () => {
    const registration = strictParse(readFileSync(resolve(ROOT, REGISTRATION_PATH), 'utf8')) as JsonRecord;
    const boundary = registration.sourceBoundary as JsonRecord;
    const sourceHead = boundary.sourceHead as JsonRecord;
    assert.equal(git(['rev-parse', `${sourceHead.commit}^{commit}`]), sourceHead.commit);
    assert.equal(git(['rev-parse', `${sourceHead.commit}^{tree}`]), sourceHead.tree);
    const required = boundary.requiredCommits as Record<string, string>;
    for (const [name, commit] of Object.entries(required).filter(([name]) => !name.endsWith('Tree'))) {
        assert.equal(git(['rev-parse', `${commit}^{commit}`]), commit, name);
        assert.equal(git(['rev-parse', `${commit}^{tree}`]), required[`${name}Tree`], name);
    }
    const rows = boundary.sourceBindings as Array<JsonRecord>;
    assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
    for (const row of rows) {
        const commit = row.commit as string;
        const path = row.path as string;
        const tree = parseTreeRow(commit, path);
        const bytes = gitBytes(['show', `${commit}:${path}`]);
        assert.equal(tree.mode, row.mode, `${row.id}: mode`);
        assert.equal(tree.blob, row.blob, `${row.id}: blob`);
        assert.equal(sha256Bytes(bytes), row.sha256, `${row.id}: sha256`);
    }
});

test('Stage C independently recovers the exact four-case D2Q core and both field verdicts', () => {
    assert.equal(git(['rev-parse', `${D2Q_RETURN_COMMIT}:${D2Q_RETURN_PATH}`]), D2Q_RETURN_BLOB);
    const source = strictParse(
        gitBytes(['show', `${D2Q_RETURN_COMMIT}:${D2Q_RETURN_PATH}`]).toString('utf8')
    ) as JsonRecord;
    const projection = source.projection as JsonRecord;
    assert.equal(projection.resultDigest, D2Q_RESULT_DIGEST);
    const cases = projection.cases as Array<JsonRecord>;
    const normalizedCases = normalizeD2QCaseRows(cases);
    assert.equal(new Set(cases.map((row) => row.caseId)).size, 4);
    assert.deepEqual(cases.map((row) => {
        const readout = row.readout as JsonRecord;
        const error = readout.error as JsonRecord | null;
        return {
            caseId: row.caseId,
            accepted: readout.accepted,
            mutated: readout.mutated,
            errorCode: error?.code ?? null,
            authoritativeEvents: readout.authoritativeEvents
        };
    }), [
        {
            caseId: 'CMD-VALID-01', accepted: true, mutated: true, errorCode: null,
            authoritativeEvents: [{ actor: 'player', type: 'moved', x: 520, y: 308 }]
        },
        {
            caseId: 'CMD-TURN-01', accepted: false, mutated: false,
            errorCode: 'LATE_TURN', authoritativeEvents: []
        },
        {
            caseId: 'CMD-ACTOR-01', accepted: false, mutated: false,
            errorCode: 'NOT_YOUR_TURN', authoritativeEvents: []
        },
        {
            caseId: 'CMD-PRECEDENCE-01', accepted: false, mutated: false,
            errorCode: 'LATE_TURN', authoritativeEvents: []
        }
    ]);
    const ablations = projection.ablations as Array<JsonRecord>;
    const normalizedAblations = normalizeD2QAblationRows(ablations);
    assert.deepEqual(ablations.map((row) => ({
        fieldId: row.fieldId,
        omittedFieldIds: row.omittedFieldIds,
        actuallyOmitted: row.actuallyOmitted,
        sourceFactsPass: row.sourceFactsPass,
        restorationRecovers: row.restorationRecovers,
        verdict: row.verdict,
        evidenceClass: row.evidenceClass,
        mathematicalPlacementImplication: row.mathematicalPlacementImplication
    })), [
        {
            fieldId: 'actor', omittedFieldIds: ['actor'], actuallyOmitted: true,
            sourceFactsPass: true, restorationRecovers: true,
            verdict: 'target_relevant_on_declared_V4_command_gate',
            evidenceClass: 'correlated_reuse', mathematicalPlacementImplication: 'none'
        },
        {
            fieldId: 'expectedTurn', omittedFieldIds: ['expectedTurn'], actuallyOmitted: true,
            sourceFactsPass: true, restorationRecovers: true,
            verdict: 'target_relevant_on_declared_V4_command_gate',
            evidenceClass: 'correlated_reuse', mathematicalPlacementImplication: 'none'
        }
    ]);
    const recovered = buildAuthenticatedSourceFixture().result.protectedCoreRecovery;
    assert.equal(canonicalJson(recovered.caseReadouts), canonicalJson(normalizedCases),
        'Every decoded D2Q case and readout value must be independently carried, not only its digest.');
    assert.equal(canonicalJson(recovered.ablationControls), canonicalJson(normalizedAblations),
        'Every D2Q field-control value must be independently carried, not only its row digest.');
});

test('D2Q recovery fails closed on omitted-field, frame, evidence and placement drift', () => {
    const core = buildAuthenticatedSourceFixture().result.protectedCoreRecovery;
    assert.equal(stageC.stageCD2QProtectedCorePass(core), true);
    assert.deepEqual(core.ablationControls.map((row) => ({
        fieldId: row.fieldId,
        omittedFieldIds: row.omittedFieldIds,
        actuallyOmitted: row.actuallyOmitted,
        sourceFactsPass: row.sourceFactsPass,
        restorationRecovers: row.restorationRecovers,
        evidenceClass: row.evidenceClass,
        mathematicalPlacementImplication: row.mathematicalPlacementImplication,
        derivedVerdict: row.derivedVerdict
    })), [
        {
            fieldId: 'actor', omittedFieldIds: ['actor'], actuallyOmitted: true,
            sourceFactsPass: true, restorationRecovers: true,
            evidenceClass: 'correlated_reuse', mathematicalPlacementImplication: 'none',
            derivedVerdict: 'target_relevant_on_declared_V4_command_gate'
        },
        {
            fieldId: 'expectedTurn', omittedFieldIds: ['expectedTurn'], actuallyOmitted: true,
            sourceFactsPass: true, restorationRecovers: true,
            evidenceClass: 'correlated_reuse', mathematicalPlacementImplication: 'none',
            derivedVerdict: 'target_relevant_on_declared_V4_command_gate'
        }
    ]);
    const mutations: Array<(
        value: DeepMutable<stageC.StageCResult['protectedCoreRecovery']>
    ) => void> = [
        (value) => { value.ablationControls[0].omittedFieldIds = ['expectedTurn']; },
        (value) => { value.ablationControls[0].actuallyOmitted = false; },
        (value) => { value.ablationControls[0].sourceFactsPass = false; },
        (value) => { value.ablationControls[0].restorationRecovers = false; },
        (value) => { value.ablationControls[0].frameChecks.noHiddenOracleAdded = false; },
        (value) => {
            (value.ablationControls[0] as unknown as JsonRecord).evidenceClass =
                'empirically_independent';
        },
        (value) => {
            (value.ablationControls[0] as unknown as JsonRecord)
                .mathematicalPlacementImplication = 'L3';
        },
        (value) => { value.ablationControls[0].primaryControl.targetEqual = true; },
        (value) => { value.ablationControls[0].primaryControl.restorationRecovers = false; },
        (value) => {
            (value.ablationControls[0].primaryControl as unknown as JsonRecord).evidenceClass =
                'empirically_independent';
        },
        (value) => {
            (value.ablationControls[0].primaryControl as unknown as JsonRecord)
                .mathematicalPlacementImplication = 'L3';
        }
    ];
    for (const mutate of mutations) {
        const candidate = structuredClone(core) as
            DeepMutable<stageC.StageCResult['protectedCoreRecovery']>;
        mutate(candidate);
        assert.equal(stageC.stageCD2QProtectedCorePass(
            candidate as stageC.StageCResult['protectedCoreRecovery']
        ), false);
    }

    for (const [family, rows] of [
        ['caseReadouts', core.caseReadouts],
        ['ablationControls', core.ablationControls]
    ] as const) {
        for (const [rowIndex, row] of rows.entries()) {
            for (const path of scalarLeafPaths(row)) {
                const candidate = structuredClone(core) as unknown as JsonRecord;
                const candidateRows = candidate[family] as JsonRecord[];
                corruptScalarLeaf(candidateRows[rowIndex], path);
                assert.equal(stageC.stageCD2QProtectedCorePass(
                    candidate as unknown as stageC.StageCResult['protectedCoreRecovery']
                ), false, `${family}[${rowIndex}].${path.join('.')} was accepted after mutation.`);
            }
            const candidate = structuredClone(core) as unknown as JsonRecord;
            ((candidate[family] as JsonRecord[])[rowIndex]).undeclaredControl = true;
            assert.equal(stageC.stageCD2QProtectedCorePass(
                candidate as unknown as stageC.StageCResult['protectedCoreRecovery']
            ), false, `${family}[${rowIndex}] accepted an undeclared row field.`);
        }
    }
});

test('Stage C independently reconstructs all endpoints, source classes, pairs, outcomes and cross-tab', () => {
    const source = readStageBResult();
    const rebuilt = independentlyReconstruct(source);
    const loaded = stageC.loadBoundStageBResult(ROOT);
    const implementation = stageC.reconstructAliasPairs(loaded.result.records.eligibleEndpoints);
    assert.equal(rebuilt.endpoints.length, 274);
    assert.deepEqual(rebuilt.sourceClassSizes, [1, 1, 8, 8, 29, 29, 61, 61, 76]);
    assert.equal(rebuilt.sourceClassSizes.length, 9);
    assert.equal(rebuilt.aliasedSourceClassCount, 7);
    assert.equal(rebuilt.pairs.length, 7_378);
    assert.deepEqual(rebuilt.outcomeCounts, {
        frame_support_failure: 0,
        command_semantic_split: 1_099,
        continuation_support_split: 14,
        provenance_exact_state_only_split: 2_983,
        no_target_relevant_split: 3_282
    });
    assert.equal(rebuilt.crossTab.length, 10);
    const sourcePairs = [...source.records.aliasPairs]
        .sort((left, right) => compareCanonicalText(left.pairId, right.pairId));
    assert.deepEqual(rebuilt.pairs, sourcePairs);
    assert.deepEqual(rebuilt.crossTab, source.descriptiveCrossTab.rows);
    assert.deepEqual(implementation.pairs, rebuilt.pairs);
    assert.equal(implementation.sourceClassCount, 9);
    assert.equal(implementation.aliasedClassCount, 7);
    assert.deepEqual(stageC.buildStageCCrossTab(implementation.pairs), rebuilt.crossTab);
});

test('all 1,113 target-relevant pairs are cross-depth and unequal in pre-command budget', () => {
    const target = independentlyReconstruct().pairs.filter((row) => row.targetRelevant);
    assert.equal(target.length, 1_113);
    assert.equal(target.filter((row) =>
        row.preCommandMovementRemainingPair[0] === row.preCommandMovementRemainingPair[1]
    ).length, 0);
    assert.equal(target.filter((row) =>
        row.leftEndpointDepth === row.rightEndpointDepth
    ).length, 0);
    assert(target.every((row) => row.primaryOutcome === 'command_semantic_split' ||
        row.primaryOutcome === 'continuation_support_split'));
});

test('Q_support is non-vacuously sufficient for K_target on the exact finite domain', () => {
    const endpoints = independentlyReconstruct().endpoints;
    const thin = equalityAudit(endpoints, (endpoint) => endpoint.sourceProjection);
    const support = equalityAudit(endpoints, (endpoint) => ({
        sourceProjection: endpoint.sourceProjection,
        preCommandMovementRemaining: endpoint.preCommandMovementRemaining
    }));
    assert.deepEqual(thin, {
        groups: 9, equalPairs: 7_378, kTarget: 1_113, command: 1_099, continuation: 1_113
    });
    assert.deepEqual(support, {
        groups: 17, equalPairs: 6_265, kTarget: 0, command: 0, continuation: 0
    });
    assert(support.equalPairs > 0, 'Q_support implication must not be vacuous.');
});

test('Q_command preserves command semantics but leaves 14 continuation-support counterexamples', () => {
    const command = equalityAudit(independentlyReconstruct().endpoints, (endpoint) => ({
        sourceProjection: endpoint.sourceProjection,
        nextMoveAdmissible: endpoint.readout.accepted
    }));
    assert.deepEqual(command, {
        groups: 14, equalPairs: 6_279, kTarget: 14, command: 0, continuation: 14
    });
});

test('exact state and route history remain outside K_target and cannot certify minimality', () => {
    const endpoints = independentlyReconstruct().endpoints;
    const history = equalityAudit(endpoints, (endpoint) => ({
        sourceProjection: endpoint.sourceProjection,
        directions: endpoint.directions
    }));
    const exactState = equalityAudit(endpoints, (endpoint) => ({
        sourceProjection: endpoint.sourceProjection,
        preCommandStateDigest: endpoint.preCommandStateDigest
    }));
    const revision = equalityAudit(endpoints, (endpoint) => ({
        sourceProjection: endpoint.sourceProjection,
        preCommandRevision: endpoint.preCommandRevision
    }));
    assert.equal(history.equalPairs, 0, 'Route history is a vacuous singleton carrier here.');
    assert.deepEqual(exactState, {
        groups: 27, equalPairs: 3_282, kTarget: 0, command: 0, continuation: 0
    });
    assert.deepEqual(revision, {
        groups: 17, equalPairs: 6_265, kTarget: 0, command: 0, continuation: 0
    });
    assert.deepEqual(revision, equalityAudit(endpoints, (endpoint) => ({
        sourceProjection: endpoint.sourceProjection,
        preCommandMovementRemaining: endpoint.preCommandMovementRemaining
    })), 'Revision and budget are co-formed in this finite result only.');
});

test('route depth and movement budget are exactly co-formed without causal or closure promotion', () => {
    const endpoints = independentlyReconstruct().endpoints;
    const mappings = [...new Map(endpoints.map((endpoint) => [canonicalJson({
        endpointDepth: endpoint.endpointDepth,
        preCommandMovementRemaining: endpoint.preCommandMovementRemaining,
        postCommandMovementRemaining: endpoint.postCommandMovementRemaining,
        nextMoveAdmissible: endpoint.readout.accepted
    }), {
        endpointDepth: endpoint.endpointDepth,
        preCommandMovementRemaining: endpoint.preCommandMovementRemaining,
        postCommandMovementRemaining: endpoint.postCommandMovementRemaining,
        nextMoveAdmissible: endpoint.readout.accepted
    }])).values()].sort((left, right) => left.endpointDepth - right.endpointDepth);
    assert.deepEqual(mappings, [
        { endpointDepth: 2, preCommandMovementRemaining: 48,
            postCommandMovementRemaining: 40, nextMoveAdmissible: true },
        { endpointDepth: 4, preCommandMovementRemaining: 32,
            postCommandMovementRemaining: 24, nextMoveAdmissible: true },
        { endpointDepth: 8, preCommandMovementRemaining: 0,
            postCommandMovementRemaining: 0, nextMoveAdmissible: false }
    ]);
    const registrationText = readFileSync(resolve(ROOT, REGISTRATION_PATH), 'utf8');
    for (const nonClaim of [
        'causation', 'global minimality', 'all-seed closure', 'recursive continuation closure'
    ]) assert.match(registrationText, new RegExp(nonClaim.replace('-', '[- ]'), 'i'));
});

test('carrier roles are derived and fail closed to unresolved when their exact witness fails', () => {
    const qSupport = candidateFixture();
    const qCommand = {
        ...candidateFixture({ groupCount: 14, equalityPairCount: 6_279 }),
        continuationSupportCounterexampleCount: 14,
        continuationSupportCounterexamplePairIdsDigest: sha256Digest(['fixture'])
    };
    const input: stageC.StageCCarrierRoleDerivationInput = {
        pairCount: 7_378,
        allReconstructedRoutePairsDiffer: true,
        sourceBindingsAuthenticated: true,
        Q_support: qSupport,
        Q_command: qCommand,
        routeHistoryCandidate: candidateFixture({
            groupCount: 274,
            equalityPairCount: 0,
            nonVacuous: false
        }),
        revisionCandidate: candidateFixture(),
        exactStateCandidate: candidateFixture({ groupCount: 27, equalityPairCount: 3_282 })
    };
    const roles = Object.fromEntries(stageC.deriveStageCCarrierRoles(input)
        .map((row) => [row.field, row.primaryRole]));
    assert.deepEqual(roles, {
        movementRemaining: 'live_carrier',
        'move admissibility': 'target_relative_support',
        'route history': 'provenance',
        revision: 'provenance',
        'exact state digest': 're_entry_support'
    });
    assert.deepEqual({
        groups: input.revisionCandidate.groupCount,
        equalityPairs: input.revisionCandidate.equalityPairCount,
        partition: input.revisionCandidate.partitionIdentityDigest
    }, {
        groups: 17,
        equalityPairs: 6_265,
        partition: qSupport.partitionIdentityDigest
    });
    assert.deepEqual({
        groups: input.exactStateCandidate.groupCount,
        equalityPairs: input.exactStateCandidate.equalityPairCount,
        counterexamples: input.exactStateCandidate.counterexampleCount
    }, { groups: 27, equalityPairs: 3_282, counterexamples: 0 });

    const failedSupport = Object.fromEntries(stageC.deriveStageCCarrierRoles({
        ...input,
        Q_support: candidateFixture({ counterexampleCount: 1 })
    }).map((row) => [row.field, row.primaryRole]));
    assert.equal(failedSupport.movementRemaining, 'unresolved');
    assert.notEqual(failedSupport.movementRemaining, 'live_carrier');

    const failedProvenance = Object.fromEntries(stageC.deriveStageCCarrierRoles({
        ...input,
        sourceBindingsAuthenticated: false,
        allReconstructedRoutePairsDiffer: false
    }).map((row) => [row.field, row.primaryRole]));
    assert.deepEqual(failedProvenance, {
        movementRemaining: 'unresolved',
        'move admissibility': 'unresolved',
        'route history': 'unresolved',
        revision: 'unresolved',
        'exact state digest': 'unresolved'
    }, 'Unauthenticated source bindings withdraw the entire five-field role map.');

    const failedRevision = Object.fromEntries(stageC.deriveStageCCarrierRoles({
        ...input,
        revisionCandidate: candidateFixture({
            partitionIdentityDigest: 'f'.repeat(64)
        })
    }).map((row) => [row.field, row.primaryRole]));
    assert.equal(failedRevision.revision, 'unresolved',
        'Matching only the revision equality-pair count cannot establish the exact partition.');

    for (const exactStateCandidate of [
        candidateFixture({ groupCount: 26, equalityPairCount: 3_282 }),
        candidateFixture({ groupCount: 27, equalityPairCount: 3_281 }),
        candidateFixture({ groupCount: 27, equalityPairCount: 3_282, counterexampleCount: 1 })
    ]) {
        const failedExactState = Object.fromEntries(stageC.deriveStageCCarrierRoles({
            ...input, exactStateCandidate
        }).map((row) => [row.field, row.primaryRole]));
        assert.equal(failedExactState['exact state digest'], 'unresolved');
    }
});

test('W, Omega_W, P_W and N_W are exact derived payloads rather than status labels', () => {
    const result = buildAuthenticatedSourceFixture().result;
    const semanticInput = {
        source: result.source,
        fixedFrame: result.fixedFrame,
        reconstruction: result.reconstruction,
        thinOnly: result.candidateAssessments.thinOnly,
        Q_support: result.candidateAssessments.Q_support,
        Q_command: result.candidateAssessments.Q_command,
        coformation: result.routeDepthMovementBudgetCoformation,
        protectedCore: result.protectedCoreRecovery,
        stateMaterialSeparation: result.stateMaterialSeparation,
        roles: result.carrierRoles
    };
    const expected = stageC.deriveStageCWitnessPayloads(semanticInput);
    assert.equal(canonicalJson({
        W: result.witnessReturn.W,
        Omega_W: result.witnessReturn.Omega_W,
        P_W: result.witnessReturn.P_W,
        N_W: result.witnessReturn.N_W,
        J_W_boundary: result.witnessReturn.J_W_boundary,
        candidateCarrierSufficiency: result.witnessReturn.candidateCarrierSufficiency
    }), canonicalJson(expected));
    assert.equal(result.fixedFrame.tolerance, 0);
    assert.equal(typeof result.fixedFrame.tolerance, 'number');
    const omegaFrame = (result.witnessReturn.Omega_W as JsonRecord).fixedFrame as JsonRecord;
    assert.equal(canonicalJson(omegaFrame), canonicalJson(result.fixedFrame));
    assert.equal(omegaFrame.tolerance, 0);
    assert.equal(typeof omegaFrame.tolerance, 'number');

    const forgedRevisionRoles = stageC.deriveStageCCarrierRoles({
        pairCount: result.reconstruction.pairCount,
        allReconstructedRoutePairsDiffer: true,
        sourceBindingsAuthenticated: true,
        Q_support: result.candidateAssessments.Q_support,
        Q_command: result.candidateAssessments.Q_command,
        routeHistoryCandidate: result.candidateAssessments.routeHistory,
        revisionCandidate: {
            ...result.candidateAssessments.revisionProxy,
            partitionIdentityDigest: '0'.repeat(64)
        },
        exactStateCandidate: result.candidateAssessments.exactState
    });
    const forgedRevisionSeparation = stageC.deriveStageCStateMaterialSeparation(
        result.source, forgedRevisionRoles
    );
    const forgedNonunique = stageC.deriveStageCWitnessPayloads({
        ...semanticInput,
        roles: forgedRevisionRoles,
        stateMaterialSeparation: forgedRevisionSeparation
    });
    assert.equal((forgedNonunique.N_W as JsonRecord).qSupportNonunique, false,
        'A literal claim cannot replace a distinct exact carrier partition witness.');
    assert.equal(forgedNonunique.candidateCarrierSufficiency, 'unresolved');

    const derive = (witnessReturn: stageC.StageCResult['witnessReturn']) =>
        stageC.deriveStageCTauReturn({
            ...semanticInput,
            witnessReturn,
            roles: result.carrierRoles,
            governance: result.governance,
            residue: result.chartRevision.residueCarriedForward
        });
    const mutations: Array<{
        mutate: (value: DeepMutable<stageC.StageCResult['witnessReturn']>) => void;
        negativeResidueMustFail?: boolean;
    }> = [
        {
            mutate: (value) => {
                (value.W as JsonRecord).pairCount = 7_377;
            }
        },
        {
            mutate: (value) => {
                (value.Omega_W as JsonRecord).horizon = 'forged longer horizon';
            }
        },
        {
            mutate: (value) => {
                const frame = (value.Omega_W as JsonRecord).fixedFrame as JsonRecord;
                frame.tolerance = 1;
            }
        },
        {
            mutate: (value) => {
                delete (value.P_W as JsonRecord).targetConstraints;
            }
        },
        {
            mutate: (value) => {
                delete (value.N_W as JsonRecord).unresolvedOutsideBoundary;
            },
            negativeResidueMustFail: true
        },
        {
            mutate: (value) => {
                value.J_W_boundary.stateMaterialSeparationDigest = '0'.repeat(64);
            }
        }
    ];
    for (const { mutate, negativeResidueMustFail } of mutations) {
        const witness = structuredClone(result.witnessReturn) as
            DeepMutable<stageC.StageCResult['witnessReturn']>;
        mutate(witness);
        const tau = derive(witness as stageC.StageCResult['witnessReturn']);
        const obligations = Object.fromEntries(tau.obligations.map((row) => [
            row.obligationId, row.passed
        ]));
        assert.equal(obligations.WITNESS_BOUNDARY_REPAIRED, false);
        if (negativeResidueMustFail) {
            assert.equal(obligations.NEGATIVE_RESIDUE_RETAINED, false,
                'N_W fact loss must withdraw the negative/residue obligation.');
        }
        assert.equal(tau.semanticObligationsPass, false);
        assert.equal(tau.status, 'candidate_unlicensed');
    }
});

test('audit, transition, re-entry, recursive and budget material stay separately derived', () => {
    const result = buildAuthenticatedSourceFixture().result;
    const separation = stageC.deriveStageCStateMaterialSeparation(
        result.source, result.carrierRoles
    );
    assert.equal(canonicalJson(result.stateMaterialSeparation), canonicalJson(separation));
    assert.deepEqual({
        predecessor: separation.auditPredecessorProvenance.status,
        transition: separation.domainTransitionProvenance.status,
        reentry: separation.reEntryMaterial.status,
        recursive: separation.liveRecursiveState,
        budget: separation.preCommandBudget
    }, {
        predecessor: 'authenticated',
        transition: 'route_history_and_revision_only',
        reentry: 'exact_state_digest_only',
        recursive: {
            status: 'absent_not_established',
            recursiveContinuationClosure: false
        },
        budget: {
            status: 'bounded_one_command_live_carrier',
            role: 'live_carrier',
            recursiveState: false
        }
    });
    assert.equal(separation.auditPredecessorProvenance.bindingCount, 15);
    assert.equal(separation.auditPredecessorProvenance.includes.length, 15);
    assert.equal(new Set(separation.auditPredecessorProvenance.includes).size, 15);
    assert.equal(separation.auditPredecessorProvenance.bindingsDigest,
        result.source.predecessorBindingsDigest);

    const unauthenticatedSource = structuredClone(result.source) as
        DeepMutable<stageC.StageCResult['source']>;
    unauthenticatedSource.predecessorBindingCount = 14;
    assert.equal(stageC.deriveStageCStateMaterialSeparation(
        unauthenticatedSource as stageC.StageCResult['source'], result.carrierRoles
    ).auditPredecessorProvenance.status, 'unresolved');

    const withdrawRole = (field: string): stageC.StageCResult['stateMaterialSeparation'] => {
        const roles = structuredClone(result.carrierRoles) as
            DeepMutable<stageC.StageCResult['carrierRoles']>;
        const role = roles.find((row) => row.field === field);
        assert(role, `Missing role fixture: ${field}`);
        role.primaryRole = 'unresolved';
        return stageC.deriveStageCStateMaterialSeparation(
            result.source, roles as stageC.StageCResult['carrierRoles']
        );
    };
    assert.equal(withdrawRole('route history').domainTransitionProvenance.status, 'unresolved');
    assert.equal(withdrawRole('revision').domainTransitionProvenance.status, 'unresolved');
    assert.equal(withdrawRole('exact state digest').reEntryMaterial.status, 'unresolved');
    assert.equal(withdrawRole('movementRemaining').preCommandBudget.status, 'unresolved');
    assert.equal(withdrawRole('movementRemaining').preCommandBudget.recursiveState, false);
});

test('the reconstructed result is semantically ready but cannot self-license navigator re-entry', () => {
    const fixture = buildAuthenticatedSourceFixture();
    try {
        const result = fixture.result;
        assert.equal(canonicalJson(stageC.validateStageCResult(structuredClone(result))),
            canonicalJson(result));
        assert.equal(result.source.sourceCommit, fixture.sourceCommit);
        assert.deepEqual(result.source.sourceRange.endpointRows.map((row) => row.path),
            [...SOURCE_OUTPUTS].sort(compareCanonicalText));
        assert.equal(result.predecessor.resultCommit, STAGE_B_RESULT_COMMIT);
        assert.equal(result.predecessor.resultBlob, STAGE_B_RESULT_BLOB);
        assert.equal(result.predecessor.resultGitByteSha256, STAGE_B_RESULT_FILE_SHA256);
        assert.equal(result.predecessor.resultDigest, STAGE_B_RESULT_DIGEST);
        assert.equal(result.predecessor.evidenceClass, 'correlated_reuse');

        assert.equal(result.reconstruction.implementationClass, 'reconstruction_independent');
        assert.equal(result.reconstruction.mathematicalEvidenceClass, 'correlated_reuse');
        assert.equal(result.reconstruction.endpointCount, 274);
        assert.equal(result.reconstruction.sourceClassCount, 9);
        assert.equal(result.reconstruction.aliasedClassCount, 7);
        assert.equal(result.reconstruction.pairCount, 7_378);
        assert.equal(result.reconstruction.predecessorPairRowsMatchCount, 7_378);
        assert.deepEqual(result.reconstruction.primaryOutcomeCounts, {
            frame_support_failure: 0,
            command_semantic_split: 1_099,
            continuation_support_split: 14,
            provenance_exact_state_only_split: 2_983,
            no_target_relevant_split: 3_282
        });
        assert.equal(result.reconstruction.targetRelevantPairCount, 1_113);
        assert.equal(result.reconstruction.targetRelevantUnequalPreCommandMovementRemainingCount,
            1_113);
        assert.equal(result.reconstruction.targetRelevantEqualPreCommandMovementRemainingCount, 0);
        assert.equal(result.reconstruction.targetRelevantSameDepthCount, 0);
        assert.equal(result.reconstruction.crossTab.length, 10);
        assert.equal(result.reconstruction.predecessorCrossTabMatches, true);

        assert.deepEqual({
            groups: result.candidateAssessments.Q_support.groupCount,
            equalityPairs: result.candidateAssessments.Q_support.equalityPairCount,
            counterexamples: result.candidateAssessments.Q_support.counterexampleCount,
            nonVacuous: result.candidateAssessments.Q_support.nonVacuous
        }, { groups: 17, equalityPairs: 6_265, counterexamples: 0, nonVacuous: true });
        assert.deepEqual({
            groups: result.candidateAssessments.Q_command.groupCount,
            equalityPairs: result.candidateAssessments.Q_command.equalityPairCount,
            commandCounterexamples: result.candidateAssessments.Q_command.counterexampleCount,
            continuationCounterexamples:
                result.candidateAssessments.Q_command.continuationSupportCounterexampleCount,
            nonVacuous: result.candidateAssessments.Q_command.nonVacuous
        }, {
            groups: 14, equalityPairs: 6_279, commandCounterexamples: 0,
            continuationCounterexamples: 14, nonVacuous: true
        });

        assert.deepEqual(result.routeDepthMovementBudgetCoformation.rows.map((row) => ({
            endpointDepth: row.endpointDepth,
            pre: row.preCommandMovementRemainingValues,
            post: row.postCommandMovementRemainingValues,
            admissible: row.nextMoveAdmissibilityValues
        })), [
            { endpointDepth: 2, pre: [48], post: [40], admissible: [true] },
            { endpointDepth: 4, pre: [32], post: [24], admissible: [true] },
            { endpointDepth: 8, pre: [0], post: [0], admissible: [false] }
        ]);
        assert.equal(result.routeDepthMovementBudgetCoformation.interpretation,
            'co_formed_on_this_finite_domain_not_causal');
        assert.equal(result.governance.causalRouteDepthClaim, false);
        assert.equal(result.governance.globalMinimalityClaim, false);
        assert.equal(result.governance.allSeedClosureClaim, false);
        assert.equal(result.governance.recursiveContinuationClosureClaim, false);

        assert.deepEqual({
            executionWitness: result.witnessReturn.executionWitness,
            evidenceClass: result.witnessReturn.evidenceClass,
            navigatorAdmission: result.witnessReturn.navigatorAdmission,
            W: result.witnessReturn.W_status,
            Omega_W: result.witnessReturn.Omega_W_status,
            P_W: result.witnessReturn.P_W_status,
            N_W: result.witnessReturn.N_W_status,
            J_W: result.witnessReturn.J_W,
            thinCutCompleteness: result.witnessReturn.thinCutCompleteness,
            auditEvidenceCompleteness: result.witnessReturn.auditEvidenceCompleteness
        }, {
            executionWitness: 'present', evidenceClass: 'correlated_reuse',
            navigatorAdmission: 'pending', W: 'present',
            Omega_W: 'evaluated_exact', P_W: 'observed', N_W: 'observed',
            J_W: 'complete_for_bounded_registered_one_command_audit',
            thinCutCompleteness: 'intentionally_incomplete',
            auditEvidenceCompleteness: 'complete_for_registered_finite_domain'
        });
        assert.equal(result.witnessReturn.candidateCarrierSufficiency,
            'sufficient_for_complete_registered_one_command_target_on_finite_domain_nonunique');

        assert.deepEqual(result.protectedCoreRecovery.caseIds,
            ['CMD-ACTOR-01', 'CMD-PRECEDENCE-01', 'CMD-TURN-01', 'CMD-VALID-01']);
        assert.equal(result.protectedCoreRecovery.caseReadouts.length, 4);
        assert.deepEqual(result.protectedCoreRecovery.fieldVerdicts, {
            actor: 'target_relevant_on_declared_V4_command_gate',
            expectedTurn: 'target_relevant_on_declared_V4_command_gate'
        });
        assert.equal(result.protectedCoreRecovery.matchedSourcePredictionCount, 4);

        assert.deepEqual(Object.fromEntries(result.carrierRoles.map((row) => [
            row.field, row.primaryRole
        ])), {
            movementRemaining: 'live_carrier',
            'move admissibility': 'target_relative_support',
            'route history': 'provenance',
            revision: 'provenance',
            'exact state digest': 're_entry_support'
        });
        assert.equal(result.semanticReconstructionReadiness, 'ready_for_committed_review');
        assert.equal(result.tauReturn.semanticObligationsPass, true);
        assert.equal(result.tauReturn.durableReviewObligationPass, false);
        assert.equal(result.tauReturn.status, 'candidate_unlicensed');
        assert.equal(result.tauReturn.obligations.at(-1)?.obligationId,
            'DURABLE_RESULT_REVIEW_RANGE_PARITY_AND_PILOT');
        assert.equal(result.tauReturn.obligations.at(-1)?.passed, false);
        assert.equal(result.chartRevision.status, 'candidate_revision_pending_review');
        assert.equal(result.chartRevision.strengthenedRoutes.some((row) =>
            row.routeId === 'TAU-WPV4-RETURN-01A'), false);
        assert.equal(result.chartRevision.demotedRoutes.some((row) =>
            row.routeId === 'TAU-WPV4-RETURN-01A' && row.status === 'candidate_unlicensed'), true);
        assert.equal(result.chartRevision.recommendedNextTransition?.transitionId,
            'TAU-WPV4-QSUPPORT-LONGER-HORIZON-01');
        assert.equal(result.chartRevision.recommendedNextTransition?.executionOpened, false);
        assert.equal(result.chartRevision.explicitStop, null);
        assert.equal(result.governance.productAuthority, 'none');
        assert.equal(result.governance.mathematicalPlacementImplication, 'none');
        assert.equal(result.governance.playerObservationTiming, 'closed');
        assert.equal(result.governance.gameplayChange, false);
        assert.equal(result.governance.p5, 'closed');
        assert.equal(result.governance.successorWorldExecution, 'closed');
        assert.equal(result.hardGatesPass, true);
        assert.equal(result.stopStatement,
            'WP-015D2R Stage C reconstruction stopped for durable result review; witness re-entry remains pending.');

        const report = stageC.renderStageCReport(result);
        assert.equal(stageC.stageCReportDigest(result), sha256Bytes(Buffer.from(report, 'utf8')));
        for (const expected of [
            result.resultDigest,
            result.source.sourceDigest,
            'ready_for_committed_review',
            'navigator admission: `pending`',
            'candidate_unlicensed',
            'witness re-entry remains pending'
        ]) assert.match(report, new RegExp(expected));
        assert.doesNotMatch(report, /Status: `licensed_for_bounded_stage_c_reentry_only`/);
    } finally { /* shared fixture is removed by the suite-level cleanup */ }
});

test('coherently rehashed result mutations cannot forge semantic readiness or parity', () => {
    const result = buildAuthenticatedSourceFixture().result;
    const mutations: Array<(value: MutableStageCResult) => void> = [
        (value) => { (value.fixedFrame as unknown as JsonRecord).tolerance = 1; },
        (value) => { value.reconstruction.endpointCount -= 1; },
        (value) => { value.reconstruction.sourceClassCount -= 1; },
        (value) => {
            value.reconstruction.classSummaries.push(
                structuredClone(value.reconstruction.classSummaries[0])
            );
        },
        (value) => { value.reconstruction.pairIdentityDigest = '0'.repeat(64); },
        (value) => {
            value.reconstruction.crossTab[0].pairCount += 1;
            value.reconstruction.crossTabDigest = sha256Digest(value.reconstruction.crossTab);
        },
        (value) => {
            value.reconstruction.targetRelevantUnequalPreCommandMovementRemainingCount -= 1;
            value.reconstruction.targetRelevantEqualPreCommandMovementRemainingCount += 1;
        },
        (value) => { value.reconstruction.targetRelevantSameDepthCount = 1; },
        (value) => { value.candidateAssessments.Q_support.equalityPairCount -= 1; },
        (value) => { value.candidateAssessments.Q_support.counterexampleCount = 1; },
        (value) => {
            value.candidateAssessments.Q_command.continuationSupportCounterexampleCount = 0;
        },
        (value) => { value.witnessReturn.N_W_status = 'incomplete_negative_retention'; },
        (value) => { (value.witnessReturn.W as JsonRecord).pairCount = 7_377; },
        (value) => { delete (value.witnessReturn.P_W as JsonRecord).targetConstraints; },
        (value) => { delete (value.witnessReturn.N_W as JsonRecord).unresolvedOutsideBoundary; },
        (value) => {
            value.witnessReturn.J_W_boundary.stateMaterialSeparationDigest = '0'.repeat(64);
        },
        (value) => {
            value.protectedCoreRecovery.caseReadouts[0].accepted =
                !value.protectedCoreRecovery.caseReadouts[0].accepted;
        },
        (value) => {
            (value.protectedCoreRecovery.fieldVerdicts as Record<string, string>).actor =
                'forged_not_relevant';
        },
        (value) => { value.carrierRoles[0].primaryRole = 'unresolved'; },
        (value) => {
            value.candidateAssessments.revisionProxy.partitionIdentityDigest = '0'.repeat(64);
        },
        (value) => { value.candidateAssessments.exactState.groupCount = 26; },
        (value) => { value.stateMaterialSeparation.auditPredecessorProvenance.status = 'unresolved'; },
        (value) => { value.stateMaterialSeparation.domainTransitionProvenance.status = 'unresolved'; },
        (value) => { value.stateMaterialSeparation.reEntryMaterial.status = 'unresolved'; },
        (value) => {
            (value.stateMaterialSeparation.liveRecursiveState as unknown as { status: string })
                .status = 'present';
        },
        (value) => { value.stateMaterialSeparation.preCommandBudget.status = 'unresolved'; },
        (value) => { value.carrierRoles.push(structuredClone(value.carrierRoles[0])); },
        (value) => { value.tauReturn.obligations.push(structuredClone(value.tauReturn.obligations[0])); },
        (value) => { value.tauReturn.status = 'licensed_for_bounded_stage_c_reentry_only'; },
        (value) => { value.chartRevision.status = 'reviewed_bounded'; },
        (value) => {
            value.chartRevision.strengthenedRoutes.push({
                routeId: 'TAU-WPV4-RETURN-01A', status: 'forged_strengthening', basis: 'forged'
            });
        },
        (value) => {
            value.chartRevision.demotedRoutes.push(
                structuredClone(value.chartRevision.demotedRoutes[0])
            );
        },
        (value) => { value.chartRevision.residueCarriedForward.pop(); },
        (value) => {
            if (value.chartRevision.recommendedNextTransition !== null) {
                (value.chartRevision.recommendedNextTransition as { executionOpened: boolean })
                    .executionOpened = true;
            }
        },
        (value) => {
            (value.governance as unknown as { globalMinimalityClaim: boolean })
                .globalMinimalityClaim = true;
        },
        (value) => {
            (value.governance as unknown as { recursiveContinuationClosureClaim: boolean })
                .recursiveContinuationClosureClaim = true;
        },
        (value) => {
            (value.governance as unknown as { successorWorldExecution: string })
                .successorWorldExecution = 'not_opened';
        }
    ];
    for (const mutate of mutations) {
        const candidate = structuredClone(result) as MutableStageCResult;
        mutate(candidate);
        const forged = coherentlyRehashStageCResult(candidate as stageC.StageCResult);
        assert.throws(() => stageC.validateStageCResult(forged));
    }
});

test('derived semantic failures withdraw roles, Tau readiness and the successor recommendation', () => {
    const fixture = buildAuthenticatedSourceFixture();
    try {
        const result = fixture.result;
        const failedQSupport = {
            ...result.candidateAssessments.Q_support,
            counterexampleCount: 1,
            counterexamplePairIdsDigest: sha256Digest(['forged-counterexample'])
        };
        const failedRoles = stageC.deriveStageCCarrierRoles({
            pairCount: result.reconstruction.pairCount,
            allReconstructedRoutePairsDiffer: true,
            sourceBindingsAuthenticated: true,
            Q_support: failedQSupport,
            Q_command: result.candidateAssessments.Q_command,
            revisionCandidate: candidateFixture(),
            exactStateCandidate: candidateFixture({ groupCount: 27, equalityPairCount: 3_282 })
        });
        assert.equal(failedRoles.find((row) => row.field === 'movementRemaining')?.primaryRole,
            'unresolved');

        const failedWitness: stageC.StageCResult['witnessReturn'] = {
            ...result.witnessReturn,
            N_W_status: 'incomplete_negative_retention'
        };
        const failedTau = stageC.deriveStageCTauReturn({
            source: result.source,
            fixedFrame: result.fixedFrame,
            reconstruction: result.reconstruction,
            thinOnly: result.candidateAssessments.thinOnly,
            Q_support: failedQSupport,
            Q_command: result.candidateAssessments.Q_command,
            coformation: result.routeDepthMovementBudgetCoformation,
            protectedCore: result.protectedCoreRecovery,
            stateMaterialSeparation: result.stateMaterialSeparation,
            witnessReturn: failedWitness,
            roles: failedRoles,
            governance: result.governance,
            residue: result.chartRevision.residueCarriedForward
        });
        assert.equal(failedTau.semanticObligationsPass, false);
        assert.equal(failedTau.status, 'candidate_unlicensed');
        const obligations = Object.fromEntries(failedTau.obligations.map((row) => [
            row.obligationId, row.passed
        ]));
        assert.equal(obligations.WITNESS_BOUNDARY_REPAIRED, false);
        assert.equal(obligations.NEGATIVE_RESIDUE_RETAINED, false);
        assert.equal(obligations.NONVACUOUS_CARRIER_CONTROLS_PASS, false);

        const failedChart = stageC.deriveStageCChartRevision({
            thinOnly: result.candidateAssessments.thinOnly,
            Q_support: failedQSupport,
            Q_command: result.candidateAssessments.Q_command,
            admissibilityOnly: result.candidateAssessments.admissibilityOnly,
            routeHistory: result.candidateAssessments.routeHistory,
            revisionProxy: result.candidateAssessments.revisionProxy,
            exactState: result.candidateAssessments.exactState,
            sourceBindingsAuthenticated: true,
            stateMaterialSeparation: result.stateMaterialSeparation,
            roles: failedRoles,
            tauReturn: failedTau,
            residue: [...result.chartRevision.residueCarriedForward, 'forged residue']
        });
        assert.equal(failedChart.strengthenedRoutes.some((row) =>
            row.routeId === 'TAU-WPV4-RETURN-01A'), false);
        assert.equal(failedChart.demotedRoutes.some((row) =>
            row.routeId === 'TAU-WPV4-RETURN-01A' && row.status === 'candidate_unlicensed'), true);
        assert.equal(failedChart.demotedRoutes.some((row) =>
            row.routeId === 'Q_SUPPORT_THIN_PLUS_PRE_COMMAND_MOVEMENT_REMAINING' &&
            row.status === 'unresolved'), true);
        assert.equal(failedChart.recommendedNextTransition, null);
        assert.match(failedChart.explicitStop ?? '', /No successor recommendation is licensed/);

        const chartInput: stageC.StageCChartDerivationInput = {
            thinOnly: result.candidateAssessments.thinOnly,
            Q_support: result.candidateAssessments.Q_support,
            Q_command: result.candidateAssessments.Q_command,
            admissibilityOnly: result.candidateAssessments.admissibilityOnly,
            routeHistory: result.candidateAssessments.routeHistory,
            revisionProxy: result.candidateAssessments.revisionProxy,
            exactState: result.candidateAssessments.exactState,
            sourceBindingsAuthenticated: true,
            stateMaterialSeparation: result.stateMaterialSeparation,
            roles: result.carrierRoles,
            tauReturn: result.tauReturn,
            residue: result.chartRevision.residueCarriedForward
        };
        const withdrawals: Array<{
            routeId: string;
            mutate: (value: DeepMutable<stageC.StageCChartDerivationInput>) => void;
        }> = [
            {
                routeId: 'THIN_VISIBLE_DUEL_ONLY',
                mutate: (value) => { value.thinOnly.counterexampleCount = 0; }
            },
            {
                routeId: 'NEXT_MOVE_ADMISSIBILITY_ONLY',
                mutate: (value) => { value.admissibilityOnly.counterexampleCount = 0; }
            },
            {
                routeId: 'EXACT_ROUTE_HISTORY_AS_LIVE_CARRIER',
                mutate: (value) => { value.routeHistory.equalityPairCount = 1; }
            },
            {
                routeId: 'REVISION_AS_SEMANTIC_CARRIER',
                mutate: (value) => {
                    value.revisionProxy.partitionIdentityDigest = '0'.repeat(64);
                }
            },
            {
                routeId: 'EXACT_STATE_DIGEST_AS_LIVE_CARRIER',
                mutate: (value) => { value.exactState.groupCount = 26; }
            }
        ];
        for (const { routeId, mutate } of withdrawals) {
            const input = structuredClone(chartInput) as
                DeepMutable<stageC.StageCChartDerivationInput>;
            mutate(input);
            const chart = stageC.deriveStageCChartRevision(
                input as stageC.StageCChartDerivationInput
            );
            const row = chart.demotedRoutes.find((candidate) => candidate.routeId === routeId);
            assert.equal(row?.status, 'unresolved',
                `${routeId} cannot retain a demotion when its exact failure witness is withdrawn.`);
        }
    } finally { /* shared fixture is removed by the suite-level cleanup */ }
});

test('only a committed result plus fresh three-role synthesis licenses bounded re-entry', () => {
    const { fixture, resultCommit, synthesis, review } = buildDurableReviewFixture();
    try {
        assert.equal(canonicalJson(stageC.validateStageCReviewReturn(
            structuredClone(review), fixture.result
        )), canonicalJson(review));
        assert.equal(review.sourceCommit, fixture.sourceCommit);
        assert.equal(review.resultCommit, resultCommit);
        assert.equal(review.result.path, RESULT_PATH);
        assert.equal(review.result.semanticDigest, fixture.result.resultDigest);
        assert.equal(review.report.path, REPORT_PATH);
        assert.equal(review.report.parityDigest, fixture.result.digests.parityDigest);
        assert.deepEqual(review.resultRanges.sourceToResult.endpointRows.map((row) => row.path),
            [...RESULT_OUTPUTS].sort(compareCanonicalText));
        assert.deepEqual(review.resultRanges.entryToResult.endpointRows.map((row) => row.path),
            [...SOURCE_OUTPUTS, ...RESULT_OUTPUTS].sort(compareCanonicalText));
        assert.equal(review.pilotReview.activation, 'required');
        assert.deepEqual(review.pilotReview.roles, stageC.STAGE_C_PILOT_ROLES);
        assert.equal(review.pilotReview.evidenceOverlap, 'correlated_reuse');
        assert.equal(review.pilotReview.status, 'reviewed_bounded');
        assert.equal(review.pilotReview.synthesisDigest, sha256Digest(synthesis));
        assert.equal(review.semanticReadiness, 'confirmed');
        assert.equal(review.witnessReturn.navigatorAdmission, 'reviewed_bounded');
        assert.equal(review.tauReturn.semanticObligationsPass, true);
        assert.equal(review.tauReturn.durableReviewObligationPass, true);
        assert.equal(review.tauReturn.status, 'licensed_for_bounded_stage_c_reentry_only');
        assert(review.tauReturn.obligations.every((row) => row.passed));
        assert.equal(review.chartRevision.status, 'reviewed_bounded');
        assert.equal(review.chartRevision.strengthenedRoutes.some((row) =>
            row.routeId === 'TAU-WPV4-RETURN-01A'), true);
        assert.equal(review.chartRevision.recommendedNextTransition?.status,
            'recommended_for_separate_preregistration_only');
        assert.equal(review.chartRevision.recommendedNextTransition?.executionOpened, false);
        assert.equal(review.governance.productAuthority, 'none');
        assert.equal(review.governance.mathematicalPlacementImplication, 'none');
        assert.equal(review.governance.playerObservationTiming, 'closed');
        assert.equal(review.governance.gameplayChange, false);
        assert.equal(review.governance.p5, 'closed');
        assert.equal(review.governance.successorWorldExecution, 'closed');
        assert.equal(review.hardGatesPass, true);
        assert.equal(review.stopStatement,
            'WP-015D2R Stage C stopped; no successor world execution opened.');
        assert.equal(canonicalJson(
            stageC.validateStageCReviewReturn(strictParse(stageC.stageCReviewReturnText(review)),
                fixture.result)
        ), canonicalJson(review));

        const reviewCommit = commitFixturePaths(
            fixture.repository,
            resultCommit,
            'durable Stage C review return',
            { [REVIEW_RETURN_PATH]: stageC.stageCReviewReturnText(review) }
        );
        const reviewAudit = stageC.auditStageCLifecycleRange(
            'review', resultCommit, reviewCommit, fixture.repository
        );
        assert.deepEqual(reviewAudit.endpointRows.map((row) => [row.path, row.status]),
            [[REVIEW_RETURN_PATH, 'A']]);
        assert.equal(gitBytes([
            'show', `${reviewCommit}:${REVIEW_RETURN_PATH}`
        ], fixture.repository).toString('utf8'), stageC.stageCReviewReturnText(review));
    } finally { /* shared fixture is removed by the suite-level cleanup */ }
});

test('valid post-result blockers or substantive disagreement persist a not-admitted review', () => {
    const { fixture, resultCommit, synthesis } = buildDurableReviewFixture();
    const blockedInputs: stageC.StageCPostResultPilotSynthesis[] = [];

    const blocker = structuredClone(synthesis) as
        DeepMutable<stageC.StageCPostResultPilotSynthesis>;
    blocker.roleReturns[0].blockers = ['Exact navigator re-entry remains blocked.'];
    blockedInputs.push(blocker as stageC.StageCPostResultPilotSynthesis);

    const disagreement = structuredClone(synthesis) as
        DeepMutable<stageC.StageCPostResultPilotSynthesis>;
    disagreement.roleReturns[1].disagreements = [
        'The carrier interpretation remains substantively disputed.'
    ];
    disagreement.governingSynthesis.disagreementDisposition =
        'substantive_disagreement_blocks_admission';
    blockedInputs.push(disagreement as stageC.StageCPostResultPilotSynthesis);

    for (const blockedInput of blockedInputs) {
        const review = stageC.buildStageCReviewReturn(
            resultCommit, blockedInput, fixture.repository
        );
        assert.equal(canonicalJson(stageC.validateStageCReviewReturn(
            structuredClone(review), fixture.result
        )), canonicalJson(review));
        assert.equal(review.semanticReadiness, 'confirmed');
        assert.equal(review.pilotReview.status, 'blocked');
        assert.equal(review.witnessReturn.navigatorAdmission, 'not_admitted');
        assert.equal(review.tauReturn.semanticObligationsPass, true);
        assert.equal(review.tauReturn.durableReviewObligationPass, false);
        assert.equal(review.tauReturn.status, 'candidate_unlicensed');
        assert.equal(review.chartRevision.status, 'not_accepted');
        assert.equal(review.chartRevision.strengthenedRoutes.some((row) =>
            row.routeId === 'TAU-WPV4-RETURN-01A'), false);
        assert.equal(review.chartRevision.recommendedNextTransition, null);
        assert.equal(review.governance.successorWorldExecution, 'closed');
        assert.match(review.chartRevision.explicitStop ?? '',
            /durable navigator review did not admit re-entry/i);
        assert.equal(review.hardGatesPass, false);
        assert.equal(review.stopStatement,
            'WP-015D2R Stage C stopped; no successor world execution opened.');
        assert.equal(canonicalJson(stageC.validateStageCReviewReturn(
            strictParse(stageC.stageCReviewReturnText(review)), fixture.result
        )), canonicalJson(review));
    }
});

test('coherently rehashed review-return mutations cannot forge admission or chart acceptance', () => {
    const { fixture, review } = buildDurableReviewFixture();
    const mutations: Array<(value: DeepMutable<stageC.StageCReviewReturn>) => void> = [
        (value) => { value.result.blob = '0'.repeat(40); },
        (value) => {
            (value.report as unknown as { mode: string }).mode = '100755';
        },
        (value) => {
            value.resultRanges.sourceToResult.endpointRows[0].path = REVIEW_RETURN_PATH;
        },
        (value) => {
            value.pilotReview.synthesis.roleReturns[1].role = 'crpm_route_tracer';
        },
        (value) => {
            value.pilotReview.synthesis.governingSynthesis.blockers = ['late blocker'];
        },
        (value) => {
            (value.witnessReturn as unknown as { navigatorAdmission: string })
                .navigatorAdmission = 'pending';
        },
        (value) => { value.tauReturn.obligations.at(-1)!.passed = false; },
        (value) => {
            (value.tauReturn as unknown as { status: string }).status = 'candidate_unlicensed';
        },
        (value) => { value.chartRevision.status = 'candidate_revision_pending_review'; },
        (value) => {
            value.chartRevision.strengthenedRoutes = value.chartRevision.strengthenedRoutes
                .filter((row) => row.routeId !== 'TAU-WPV4-RETURN-01A');
        },
        (value) => {
            if (value.chartRevision.recommendedNextTransition !== null) {
                (value.chartRevision.recommendedNextTransition as { executionOpened: boolean })
                    .executionOpened = true;
            }
        },
        (value) => {
            (value.governance as unknown as { globalMinimalityClaim: boolean })
                .globalMinimalityClaim = true;
        },
        (value) => {
            (value.governance as unknown as { successorWorldExecution: string })
                .successorWorldExecution = 'not_opened';
        },
        (value) => {
            (value as unknown as { hardGatesPass: boolean }).hardGatesPass = false;
        }
    ];
    for (const mutate of mutations) {
        const candidate = structuredClone(review) as unknown as
            DeepMutable<stageC.StageCReviewReturn>;
        mutate(candidate);
        const forged = coherentlyRehashStageCReviewReturn(
            candidate as unknown as stageC.StageCReviewReturn
        );
        assert.throws(() => stageC.validateStageCReviewReturn(forged, fixture.result));
    }
});

test('durable review readiness is derived independently on every evidence axis', () => {
    const { fixture, resultCommit, synthesis, review } = buildDurableReviewFixture();
    const result = fixture.result;
    const durable: NonNullable<stageC.StageCTauDerivationInput['durableReview']> = {
        resultCommit,
        resultIdentity: structuredClone(review.result),
        reportIdentity: structuredClone(review.report),
        sourceToResultRange: structuredClone(review.resultRanges.sourceToResult),
        entryToResultRange: structuredClone(review.resultRanges.entryToResult),
        committedResultCanonicalDigest: sha256Bytes(Buffer.from(canonicalJson(result), 'utf8')),
        reconstructedResultCanonicalDigest: sha256Bytes(Buffer.from(canonicalJson(result), 'utf8')),
        expectedResultSemanticDigest: result.resultDigest,
        expectedResultParityDigest: result.digests.parityDigest,
        committedReportSha256: review.report.sha256,
        renderedReportSha256: stageC.stageCReportDigest(result),
        pilotBoundIdentities: synthesis.roleReturns[0].boundIdentities,
        pilotSynthesis: synthesis
    };
    const derive = (candidate: NonNullable<stageC.StageCTauDerivationInput['durableReview']>) =>
        stageC.deriveStageCTauReturn({
            source: result.source,
            fixedFrame: result.fixedFrame,
            reconstruction: result.reconstruction,
            thinOnly: result.candidateAssessments.thinOnly,
            Q_support: result.candidateAssessments.Q_support,
            Q_command: result.candidateAssessments.Q_command,
            coformation: result.routeDepthMovementBudgetCoformation,
            protectedCore: result.protectedCoreRecovery,
            stateMaterialSeparation: result.stateMaterialSeparation,
            witnessReturn: { ...result.witnessReturn, navigatorAdmission: 'reviewed_bounded' },
            roles: result.carrierRoles,
            governance: result.governance,
            residue: result.chartRevision.residueCarriedForward,
            durableReview: candidate
        });
    assert.equal(derive(durable).durableReviewObligationPass, true);
    const mutations: Array<(value: DeepMutable<typeof durable>) => void> = [
        (value) => { value.resultIdentity.semanticDigest = '0'.repeat(64); },
        (value) => { value.reportIdentity.parityDigest = '0'.repeat(64); },
        (value) => { value.sourceToResultRange.endpointRows[0].path = REVIEW_RETURN_PATH; },
        (value) => { value.entryToResultRange.endpointRows[0].path = REVIEW_RETURN_PATH; },
        (value) => { value.reconstructedResultCanonicalDigest = '0'.repeat(64); },
        (value) => { value.expectedResultSemanticDigest = '0'.repeat(64); },
        (value) => { value.expectedResultParityDigest = '0'.repeat(64); },
        (value) => { value.renderedReportSha256 = '0'.repeat(64); },
        (value) => { value.pilotBoundIdentities.ranges.entryToResultDigest = '0'.repeat(64); },
        (value) => {
            value.pilotSynthesis.roleReturns[0].boundIdentities.resultArtifact.blob =
                '0'.repeat(40);
        },
        (value) => { value.pilotSynthesis.boundResultCommit = '0'.repeat(40); }
    ];
    for (const mutate of mutations) {
        const candidate = structuredClone(durable) as DeepMutable<typeof durable>;
        mutate(candidate);
        if (candidate.sourceToResultRange !== durable.sourceToResultRange) {
            for (const range of [candidate.sourceToResultRange, candidate.entryToResultRange]) {
                range.rangeDigest = sha256Digest({
                    baseCommit: range.baseCommit,
                    resultCommit: range.resultCommit,
                    allowedPaths: range.allowedPaths,
                    commits: range.commits,
                    endpointRows: range.endpointRows
                });
            }
        }
        const derived = derive(candidate);
        assert.equal(derived.durableReviewObligationPass, false);
        assert.equal(derived.status, 'candidate_unlicensed');
    }
});

test('post-result pilot validation rejects substitutions, unstructured promotion and voting', () => {
    const sourceCommit = '1'.repeat(40);
    const resultCommit = '2'.repeat(40);
    const valid = pilotSynthesisFixture(sourceCommit, resultCommit);
    assert.equal(canonicalJson(stageC.validateStageCPostResultPilotSynthesis(
        structuredClone(valid), sourceCommit, resultCommit
    )), canonicalJson(valid));

    const mutations: Array<(value: Record<string, unknown>) => void> = [
        (value) => {
            (value.roleReturns as unknown[]).pop();
        },
        (value) => {
            const rows = value.roleReturns as Array<Record<string, unknown>>;
            rows[1].role = rows[0].role;
        },
        (value) => {
            const rows = value.roleReturns as Array<Record<string, unknown>>;
            rows[1].taskId = rows[0].taskId;
        },
        (value) => {
            (value.roleReturns as Array<Record<string, unknown>>)[0].taskId =
                '/root/template_role_name_only';
        },
        (value) => {
            value.boundResultCommit = '3'.repeat(40);
        },
        (value) => {
            value.evidenceOverlap = 'empirically_independent';
        },
        (value) => {
            (value.roleReturns as Array<Record<string, unknown>>)[0].evidenceIndependence =
                'empirically_independent';
        },
        (value) => {
            value.decisionMethod = 'majority_vote';
        },
        (value) => {
            const synthesis = value.governingSynthesis as Record<string, unknown>;
            synthesis.currentHeadAndSourceBasis = '';
        },
        (value) => {
            const rows = value.roleReturns as Array<Record<string, unknown>>;
            (rows[0].sourcePaths as unknown[]).pop();
        },
        (value) => {
            (value.roleReturns as Array<Record<string, unknown>>)[0].supportOverlap =
                'same role names but no exact support boundary';
        },
        (value) => {
            (value.roleReturns as Array<Record<string, unknown>>)[0].HT10 = 'passed';
        },
        (value) => {
            (value.roleReturns as Array<Record<string, unknown>>)[0].strongestLicensedClaim =
                'licensed_for_global_recursive_closure';
        },
        (value) => {
            const synthesis = value.governingSynthesis as Record<string, unknown>;
            (synthesis.explicitNonClaims as unknown[]).pop();
        },
        (value) => {
            const synthesis = value.governingSynthesis as Record<string, unknown>;
            (synthesis.licenseFacts as JsonRecord).strongestClaim = 'global_minimal_carrier';
        },
        (value) => {
            const synthesis = value.governingSynthesis as Record<string, unknown>;
            const facts = synthesis.licenseFacts as JsonRecord;
            (facts.governance as JsonRecord).productAuthority = 'granted';
        },
        (value) => {
            const synthesis = value.governingSynthesis as Record<string, unknown>;
            const facts = synthesis.licenseFacts as JsonRecord;
            (facts.stopMap as JsonRecord).successorWorldExecution = 'opened';
        },
        (value) => {
            const synthesis = value.governingSynthesis as Record<string, unknown>;
            synthesis.strongestLicensedClaim = 'ProductAuthority granted';
        },
        (value) => {
            const synthesis = value.governingSynthesis as Record<string, unknown>;
            synthesis.majorityVoteUsed = true;
        }
    ];
    for (const mutate of mutations) {
        const candidate = structuredClone(valid) as unknown as Record<string, unknown>;
        mutate(candidate);
        assert.throws(() => stageC.validateStageCPostResultPilotSynthesis(
            candidate, sourceCommit, resultCommit
        ));
    }

    const blocked = structuredClone(valid) as unknown as Record<string, unknown>;
    (blocked.roleReturns as Array<JsonRecord>)[0].blockers = ['unresolved source identity'];
    assert.doesNotThrow(() => stageC.validateStageCPostResultPilotSynthesis(
        blocked, sourceCommit, resultCommit
    ));
    assert.equal(stageC.stageCPilotSynthesisAdmissionPass(
        blocked, sourceCommit, resultCommit
    ), false);

    const disagreement = structuredClone(valid) as unknown as Record<string, unknown>;
    (disagreement.roleReturns as Array<JsonRecord>)[1].disagreements = [
        'The exact carrier role remains materially disputed.'
    ];
    (disagreement.governingSynthesis as JsonRecord).disagreementDisposition =
        'substantive_disagreement_blocks_admission';
    assert.doesNotThrow(() => stageC.validateStageCPostResultPilotSynthesis(
        disagreement, sourceCommit, resultCommit
    ));
    assert.equal(stageC.stageCPilotSynthesisAdmissionPass(
        disagreement, sourceCommit, resultCommit
    ), false);
});

test('each fresh pilot role binds every committed identity family exactly', () => {
    const { fixture, resultCommit, synthesis } = buildDurableReviewFixture();
    const expected = stageC.buildStageCPilotBoundIdentities(
        resultCommit, fixture.repository
    );
    assert(synthesis.roleReturns.every((row) =>
        canonicalJson(row.boundIdentities) === canonicalJson(expected)));
    assert.equal(canonicalJson(stageC.validateStageCPilotBoundIdentities(
        structuredClone(expected), fixture.sourceCommit, resultCommit, expected
    )), canonicalJson(expected));

    const mutations: Array<(
        value: DeepMutable<stageC.StageCPilotBoundIdentities>
    ) => void> = [
        (value) => { value.source.commit = '0'.repeat(40); },
        (value) => { value.source.tree = '0'.repeat(40); },
        (value) => { value.source.digest = '0'.repeat(64); },
        (value) => { value.resultCommit.commit = '0'.repeat(40); },
        (value) => { value.resultCommit.tree = '0'.repeat(40); },
        (value) => { (value.resultArtifact as JsonRecord).mode = '100755'; },
        (value) => { value.resultArtifact.blob = '0'.repeat(40); },
        (value) => { value.resultArtifact.sha256 = '0'.repeat(64); },
        (value) => { value.resultArtifact.semanticDigest = '0'.repeat(64); },
        (value) => { value.resultArtifact.parityDigest = '0'.repeat(64); },
        (value) => { (value.reportArtifact as JsonRecord).mode = '100755'; },
        (value) => { value.reportArtifact.blob = '0'.repeat(40); },
        (value) => { value.reportArtifact.sha256 = '0'.repeat(64); },
        (value) => { value.reportArtifact.resultParityDigest = '0'.repeat(64); },
        (value) => { value.ranges.sourceToResultDigest = '0'.repeat(64); },
        (value) => { value.ranges.entryToResultDigest = '0'.repeat(64); },
        (value) => {
            (value.predecessorStageBResult as JsonRecord).commit = '0'.repeat(40);
        },
        (value) => { value.predecessorStageBResult.blob = '0'.repeat(40); },
        (value) => { value.predecessorStageBResult.sha256 = '0'.repeat(64); },
        (value) => {
            (value.predecessorStageBResult as JsonRecord).semanticDigest = '0'.repeat(64);
        }
    ];
    for (const [index, mutate] of mutations.entries()) {
        const candidate = structuredClone(synthesis) as
            DeepMutable<stageC.StageCPostResultPilotSynthesis>;
        const roleIndex = index % candidate.roleReturns.length;
        mutate(candidate.roleReturns[roleIndex].boundIdentities);
        assert.throws(() => stageC.validateStageCPostResultPilotSynthesis(
            candidate,
            fixture.sourceCommit,
            resultCommit,
            expected
        ), `Identity-family substitution ${index} was not rejected.`);
    }
});

test('review-return derivation rejects uncommitted, unparity and out-of-range result evidence', () => {
    const fixture = buildAuthenticatedSourceFixture();
    try {
        const badReportCommit = commitFixturePaths(
            fixture.repository,
            fixture.sourceCommit,
            'result with report parity failure',
            {
                [RESULT_PATH]: stageC.stageCResultText(fixture.result),
                [REPORT_PATH]: `${stageC.renderStageCReport(fixture.result)}\nforged\n`
            }
        );
        assert.throws(() => stageC.buildStageCReviewReturn(
            badReportCommit,
            pilotSynthesisFixture(fixture.sourceCommit, badReportCommit),
            fixture.repository
        ));

        const forbiddenRangeCommit = commitFixturePaths(
            fixture.repository,
            fixture.sourceCommit,
            'result with undeclared owner',
            {
                [RESULT_PATH]: stageC.stageCResultText(fixture.result),
                [REPORT_PATH]: stageC.renderStageCReport(fixture.result),
                'shared/simulation.ts': 'forbidden\n'
            }
        );
        assert.throws(() => stageC.buildStageCReviewReturn(
            forbiddenRangeCommit,
            pilotSynthesisFixture(fixture.sourceCommit, forbiddenRangeCommit),
            fixture.repository
        ));
    } finally { /* shared fixture is removed by the suite-level cleanup */ }
});

test('Stage C runner admits only explicit result publication and read-only verification modes', () => {
    const parse = requiredFunction<(args: readonly string[]) => unknown>(stageCRunner, [
        'parseStageCArgs'
    ]);
    assert.throws(() => parse([]));
    assert.deepEqual(parse([
        '--write-result',
        '--source-commit', STAGE_C_BASE_COMMIT,
        '--result-output', RESULT_PATH,
        '--report-output', REPORT_PATH
    ]), {
        mode: 'write_result',
        sourceCommit: STAGE_C_BASE_COMMIT,
        resultOutput: RESULT_PATH,
        reportOutput: REPORT_PATH
    });
    assert.deepEqual(parse(['--verify-result']), { mode: 'verify_result' });
    assert.deepEqual(parse(['--verify-review-return']), { mode: 'verify_review_return' });
    assert.deepEqual(parse([
        '--write-review-return',
        '--result-commit', STAGE_C_BASE_COMMIT,
        '--review-output', REVIEW_RETURN_PATH,
        '--pilot-synthesis-stdin'
    ]), {
        mode: 'write_review_return',
        resultCommit: STAGE_C_BASE_COMMIT,
        reviewOutput: REVIEW_RETURN_PATH,
        pilotSynthesisStdin: true
    });
    const parsePilot = requiredFunction<(input: Buffer | string) => unknown>(stageCRunner, [
        'parseStageCPilotSynthesisStdin'
    ]);
    assert.equal(canonicalJson(parsePilot('{"schemaVersion":1}')),
        canonicalJson({ schemaVersion: 1 }));
    for (const invalid of [
        '', '{"role":"one","role":"two"}', '{"schemaVersion":1} trailing'
    ]) assert.throws(() => parsePilot(invalid));
    for (const args of [
        ['--seed', '1'], ['--depth', '16'], ['--route', '1,-1'],
        ['--output', RESULT_PATH], ['--verify-result', '--seed', '1'],
        ['--write-result', '--output', RESULT_PATH],
        ['--write-review-return', '--result-commit', STAGE_C_BASE_COMMIT,
            '--review-output', REVIEW_RETURN_PATH],
        ['--write-review-return', '--result-commit', STAGE_C_BASE_COMMIT,
            '--review-output', RESULT_PATH, '--pilot-synthesis-stdin'],
        ['--write-review-return', '--result-commit', STAGE_C_BASE_COMMIT,
            '--review-output', REVIEW_RETURN_PATH, '--pilot-synthesis-stdin',
            '--pilot-synthesis-stdin']
    ]) assert.throws(() => parse(args), args.join(' '));
    assert.doesNotMatch(readFileSync(resolve(ROOT, RUNNER_PATH), 'utf8'),
        /pilotSynthesisBase64|--pilot-synthesis-base64/);
});

test('Stage C runner reserves neither result output when source reconstruction fails', () => {
    const parent = mkdtempSync(join(tmpdir(), 'stage-c-prepublication-failure-'));
    const repository = resolve(parent, 'repository');
    try {
        execFileSync('git', ['clone', '--quiet', '--shared', '--no-checkout', ROOT, repository], {
            cwd: parent, windowsHide: true
        });
        const fixtureGit = (args: readonly string[], input?: Buffer): string =>
            execFileSync('git', [...args], {
                cwd: repository, encoding: 'utf8', windowsHide: true, input
            }).trim();
        fixtureGit(['read-tree', `${STAGE_C_BASE_COMMIT}^{tree}`]);
        const invalidRegistration = strictParse(
            readFileSync(resolve(ROOT, REGISTRATION_PATH), 'utf8')
        ) as JsonRecord;
        (invalidRegistration.outputContract as JsonRecord).requiredStatus = 'M';
        for (const path of SOURCE_OUTPUTS) {
            const bytes = path === REGISTRATION_PATH
                ? Buffer.from(`${canonicalJson(invalidRegistration)}\n`, 'utf8')
                : readFileSync(resolve(ROOT, path));
            const blob = fixtureGit(['hash-object', '-w', '--stdin'], bytes);
            fixtureGit(['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`]);
        }
        const tree = fixtureGit(['write-tree']);
        const sourceCommit = fixtureGit([
            '-c', 'user.name=Stage C failed-source fixture',
            '-c', 'user.email=stage-c-failed-source@example.invalid',
            'commit-tree', tree, '-p', STAGE_C_BASE_COMMIT, '-m',
            'invalid Stage C source fixture'
        ]);
        fixtureGit(['update-ref', 'HEAD', sourceCommit]);
        fixtureGit(['checkout-index', '-a']);
        assert.equal(fixtureGit(['status', '--porcelain=v1', '--untracked-files=all']), '');
        assert.equal(existsSync(resolve(repository, RESULT_PATH)), false);
        assert.equal(existsSync(resolve(repository, REPORT_PATH)), false);
        assert.throws(() => stageCRunner.writeStageCOutputs({
            mode: 'write_result',
            sourceCommit,
            resultOutput: RESULT_PATH,
            reportOutput: REPORT_PATH
        }, repository));
        assert.equal(existsSync(resolve(repository, RESULT_PATH)), false,
            'A semantic/source failure must occur before result reservation.');
        assert.equal(existsSync(resolve(repository, REPORT_PATH)), false,
            'A semantic/source failure must occur before report reservation.');
    } finally {
        rmSync(parent, { recursive: true, force: true });
    }
});

test('Stage C raw Git delta parser rejects undeclared paths, modes, statuses and duplicates', () => {
    const parse = requiredFunction<(raw: Buffer) => unknown[]>(stageC, [
        'parseStageCRawDiff', 'parseRawDiff'
    ]);
    const validate = requiredFunction<(
        rows: readonly unknown[], allowed: readonly string[], phase?: 'endpoint' | 'intermediate'
    ) => void>(stageC, ['validateStageCChangeRows', 'validateChangeRows']);
    const zero = '0'.repeat(40);
    const blob = '1'.repeat(40);
    const changed = '2'.repeat(40);
    const path = ALLOWED_OUTPUTS[0];
    const added = `:000000 100644 ${zero} ${blob} A\0${path}\0`;
    const modified = `:100644 100644 ${blob} ${changed} M\0${path}\0`;
    assert.doesNotThrow(() => validate(parse(Buffer.from(added)), ALLOWED_OUTPUTS, 'endpoint'));
    assert.throws(() => validate(parse(Buffer.from(modified)), ALLOWED_OUTPUTS, 'endpoint'));
    assert.doesNotThrow(() => validate(parse(Buffer.from(modified)), ALLOWED_OUTPUTS, 'intermediate'));
    for (const raw of [
        `:000000 100644 ${zero} ${blob} A\0shared/simulation.ts\0`,
        `:000000 100755 ${zero} ${blob} A\0${path}\0`,
        `:000000 120000 ${zero} ${blob} A\0${path}\0`,
        `:100644 000000 ${blob} ${zero} D\0${path}\0`,
        `:000000 100644 ${zero} ${blob} R100\0${path}\0other.md\0`,
        `:000000 100644 ${zero} ${blob} C100\0${path}\0other.md\0`,
        added + added
    ]) assert.throws(() => validate(parse(Buffer.from(raw)), ALLOWED_OUTPUTS, 'endpoint'), raw);
});

test('Stage C range audit catches forbidden paths and transient nonregular modes', () => {
    const audit = requiredFunction<(
        base: string, result: string, allowed: readonly string[], repository: string
    ) => unknown>(stageC, ['auditStageCRange']);
    const repository = mkdtempSync(join(tmpdir(), 'stage-c-range-test-'));
    const allowed = [ALLOWED_OUTPUTS[0]];
    const fixtureGit = (args: readonly string[], input?: string): string =>
        execFileSync('git', [...args], {
            cwd: repository, encoding: 'utf8', windowsHide: true, input
        }).trim();
    const commit = (message: string, parent?: string): string => {
        const tree = fixtureGit(['write-tree']);
        return fixtureGit([
            '-c', 'user.name=Stage C fixture',
            '-c', 'user.email=stage-c@example.invalid',
            'commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', message
        ]);
    };
    try {
        fixtureGit(['init', '--quiet', '--object-format=sha1']);
        fixtureGit(['read-tree', '--empty']);
        const base = commit('empty baseline');
        const blob = fixtureGit(['hash-object', '-w', '--stdin'], 'owned\n');
        fixtureGit(['update-index', '--add', '--cacheinfo', `100644,${blob},${ALLOWED_OUTPUTS[0]}`]);
        const good = commit('allowed source', base);
        assert.doesNotThrow(() => audit(base, good, allowed, repository));

        fixtureGit(['update-index', '--add', '--cacheinfo', `100644,${blob},shared/simulation.ts`]);
        const forbidden = commit('temporary forbidden owner', good);
        fixtureGit(['update-index', '--force-remove', 'shared/simulation.ts']);
        const repaired = commit('hide forbidden owner', forbidden);
        assert.throws(() => audit(base, repaired, allowed, repository));

        fixtureGit(['read-tree', `${good}^{tree}`]);
        fixtureGit(['update-index', '--cacheinfo', `100755,${blob},${ALLOWED_OUTPUTS[0]}`]);
        const wrongMode = commit('temporary executable', good);
        fixtureGit(['update-index', '--cacheinfo', `100644,${blob},${ALLOWED_OUTPUTS[0]}`]);
        const modeRepaired = commit('restore mode', wrongMode);
        assert.throws(() => audit(base, modeRepaired, allowed, repository));
    } finally {
        rmSync(repository, { recursive: true, force: true });
    }
});

test('Stage C lifecycle audit enforces all four stages and the nine-path endpoint', () => {
    const repository = mkdtempSync(join(tmpdir(), 'stage-c-lifecycle-test-'));
    const fixtureGit = (args: readonly string[], input?: string): string =>
        execFileSync('git', [...args], {
            cwd: repository, encoding: 'utf8', windowsHide: true, input
        }).trim();
    const commit = (message: string, parent?: string): string => {
        const tree = fixtureGit(['write-tree']);
        return fixtureGit([
            '-c', 'user.name=Stage C lifecycle fixture',
            '-c', 'user.email=stage-c-lifecycle@example.invalid',
            'commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', message
        ]);
    };
    const add = (path: string, text = `${path}\n`): void => {
        const blob = fixtureGit(['hash-object', '-w', '--stdin'], text);
        fixtureGit(['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`]);
    };
    const uniquePayload = (tag: string): string => Array.from({ length: 128 }, (_, index) =>
        `${tag}:${index}:${sha256Digest({ tag, index })}`).join('\n') + '\n';
    try {
        fixtureGit(['init', '--quiet', '--object-format=sha1']);
        fixtureGit(['read-tree', '--empty']);
        const base = commit('entry');
        for (const [index, path] of SOURCE_OUTPUTS.entries()) {
            add(path, uniquePayload(`source-${index}`));
        }
        const source = commit('six source outputs', base);
        add(RESULT_OUTPUTS[0], uniquePayload('result'));
        add(RESULT_OUTPUTS[1], uniquePayload('report'));
        const result = commit('two result outputs', source);
        add(REVIEW_RETURN_OUTPUTS[0], uniquePayload('review'));
        const review = commit('one review return', result);
        add(SOURCE_OUTPUTS[0], 'terminal evidence closeout\n');
        const terminal = commit('terminal evidence closeout', review);

        const sourceAudit = stageC.auditStageCLifecycleRange('source', base, source, repository);
        const resultAudit = stageC.auditStageCLifecycleRange('result', source, result, repository);
        const reviewAudit = stageC.auditStageCLifecycleRange('review', result, review, repository);
        const terminalAudit = stageC.auditStageCLifecycleRange(
            'terminal', review, terminal, repository
        );
        const completeAudit = stageC.auditStageCLifecycleRange(
            'complete', base, terminal, repository
        );
        assert.deepEqual(sourceAudit.endpointRows.map((row) => row.path),
            [...SOURCE_OUTPUTS].sort(compareCanonicalText));
        assert.deepEqual(resultAudit.endpointRows.map((row) => row.path),
            [...RESULT_OUTPUTS].sort(compareCanonicalText));
        assert.deepEqual(reviewAudit.endpointRows.map((row) => row.path), REVIEW_RETURN_OUTPUTS);
        assert.deepEqual(terminalAudit.endpointRows.map((row) => [row.path, row.status]),
            [[SOURCE_OUTPUTS[0], 'M']]);
        assert.deepEqual(completeAudit.endpointRows.map((row) => [row.path, row.status]),
            [...ALLOWED_OUTPUTS].sort(compareCanonicalText).map((path) => [path, 'A']));

        fixtureGit(['read-tree', `${source}^{tree}`]);
        add(REVIEW_RETURN_PATH, 'premature return\n');
        const prematureReview = commit('review return in result stage', source);
        assert.throws(() => stageC.auditStageCLifecycleRange(
            'result', source, prematureReview, repository
        ));

        fixtureGit(['read-tree', `${review}^{tree}`]);
        add(REPORT_PATH, 'forbidden terminal report mutation\n');
        const wrongTerminal = commit('wrong terminal mutation', review);
        assert.throws(() => stageC.auditStageCLifecycleRange(
            'terminal', review, wrongTerminal, repository
        ));
    } finally {
        rmSync(repository, { recursive: true, force: true });
    }
});
