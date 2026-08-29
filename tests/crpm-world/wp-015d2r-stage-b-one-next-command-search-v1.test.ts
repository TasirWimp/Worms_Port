import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    existsSync,
    lstatSync,
    linkSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    symlinkSync,
    unlinkSync,
    writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import test from 'node:test';

import { canonicalJson, sha256Digest } from '../../analysis/crpm_world/canonical';
import {
    STAGE_B_PRIMARY_OUTCOMES,
    STAGE_B_EXECUTION_SOURCE_PATHS,
    STAGE_B_PREREGISTRATION_TERMINAL_COMMIT,
    STAGE_B_RAW_PATHS,
    STAGE_B_REPORT_PATH,
    STAGE_B_RESULT_PATH,
    STAGE_B_ROOT,
    auditStageBRange,
    buildRegisteredWords,
    buildStageBCrossTab,
    buildStageBResult,
    canonicalStageBResult,
    classifyPair,
    executeRegisteredRoutes,
    parseRawDiff,
    parseStrictJson,
    readStageBRegistration,
    renderStageBReport,
    routeIdFor,
    serializeStageBRawOutputs,
    validateChangeRows,
    validateStageBRegistration,
    validateStageBResult,
    type StageBAuthorityDependencies,
    type StageBDirection,
    type StageBEndpointRecord,
    type StageBExecution,
    type StageBRegistration,
    type StageBResult,
    type StageBSourceIdentity
} from '../../analysis/crpm_world/navigation/assess-wp-015d2r-stage-b-one-next-command-search-v1';
import {
    parseStageBArgs,
    resolveStageBOutputPath,
    validateStageBRawDirectory,
    verifyStageBExecutionOutputs,
    verifyStageBStoredOutputBytes,
    writeStageBExecutionOutputs
} from '../../scripts/run-wp-015d2r-stage-b-one-next-command-search-v1';
import {
    V4_RULESET_ID,
    type SimulationState,
    type SimulationTransition
} from '../../shared/simulation';

const HOLDOUTS: readonly (readonly StageBDirection[])[] = [
    [1, -1],
    [1, -1, 1, -1, 1, -1, 1, -1]
];
const TRACKED_OUTPUTS = [
    'docs/evidence/wp-015d2t.json',
    'analysis/crpm_world/navigation/assess-wp-015d2r-stage-b-one-next-command-search-v1.ts',
    'scripts/run-wp-015d2r-stage-b-one-next-command-search-v1.ts',
    'tests/crpm-world/wp-015d2r-stage-b-one-next-command-search-v1.test.ts',
    STAGE_B_REPORT_PATH,
    STAGE_B_RESULT_PATH
];

function copy<T>(value: T): T {
    return structuredClone(value);
}

function assertCanonicalEqual(actual: unknown, expected: unknown, message?: string): void {
    assert.equal(canonicalJson(actual), canonicalJson(expected), message);
}

function countBy<T>(rows: readonly T[], key: (row: T) => string): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const row of rows) {
        const value = key(row);
        counts[value] = (counts[value] ?? 0) + 1;
    }
    return counts;
}

function gitAt(repository: string, args: readonly string[], input?: string): string {
    return execFileSync('git', [...args], {
        cwd: repository,
        encoding: 'utf8',
        windowsHide: true,
        input
    }).trim();
}

function removeOwnedTemp(path: string, parent: string): void {
    const absolute = resolve(path);
    const within = relative(resolve(parent), absolute);
    assert.ok(within.length > 0 && !within.startsWith('..') && !isAbsolute(within));
    rmSync(absolute, { recursive: true, force: true });
}

function endpoint(overrides: Partial<StageBEndpointRecord> = {}): StageBEndpointRecord {
    const projectedValue = {
        activeActor: 'player',
        units: [
            { id: 'player', x: 512, y: 256, stitching: 100 },
            { id: 'loomkeeper', x: 1152, y: 256, stitching: 100 }
        ]
    };
    const base: StageBEndpointRecord = {
        rowType: 'eligible_endpoint',
        endpointId: 'endpoint-fixture-left',
        wordIndex: 0,
        routeId: routeIdFor([-1, -1]),
        seed: 3237998097,
        calling: 'wizard',
        rulesetId: V4_RULESET_ID,
        endpointDepth: 2,
        directions: [-1, -1],
        sourceProjection: {
            cutId: 'thin_visible_duel_v0', cutVersion: 2,
            classKey: `cut-${sha256Digest(projectedValue)}`, projectedValue
        },
        preCommandStateDigest: '1'.repeat(64),
        preCommandRevision: 2,
        preCommandMovementRemaining: 48,
        actor: 'player',
        expectedTurn: 0,
        command: { type: 'move', direction: 1 },
        readout: {
            accepted: true,
            mutated: true,
            error: null,
            authoritativeEvents: [{ type: 'moved', actor: 'player', x: 520, y: 256 }],
            eventsDigest: '2'.repeat(64)
        },
        postCommandStateDigest: '3'.repeat(64),
        postCommandRevision: 3,
        postCommandMovementRemaining: 40,
        postCommandProjection: {
            cutId: 'thin_visible_duel_v0', cutVersion: 2,
            classKey: `cut-${sha256Digest({ ...projectedValue, post: true })}`,
            projectedValue: { ...projectedValue, post: true }
        },
        endpointInputUnchanged: true,
        frameOk: true
    };
    return { ...base, ...overrides };
}

test('Stage B strict JSON rejects ordinary, escaped and nested duplicate keys', () => {
    assert.deepEqual(parseStrictJson('{"a":1,"nested":{"a":2},"rows":[1,2]}'), {
        a: 1, nested: { a: 2 }, rows: [1, 2]
    });
    for (const text of [
        '{"routeId":"one","routeId":"two"}',
        '{"routeId":"one","\\u0072outeId":"two"}',
        '{"outer":{"wordIndex":0,"wordIndex":1}}',
        '{"rows":[{"pairId":"one","pairId":"two"}]}',
        '{"a":1} trailing', '{"a":1,}', '[1,2,]', '{"a":NaN}', '{"a":Infinity}'
    ]) assert.throws(() => parseStrictJson(text), text);
});

test('Stage B registration freezes the exact six tracked and five ignored outputs', () => {
    const registration = readStageBRegistration();
    assert.equal(validateStageBRegistration(registration), registration);
    assert.deepEqual(
        registration.outputContracts.futureExecutionPass.allowedTrackedOutputs,
        TRACKED_OUTPUTS.map((path) => ({
            path,
            status: 'A',
            mode: '100644',
            role: registration.outputContracts.futureExecutionPass.allowedTrackedOutputs
                .find((row) => row.path === path)!.role
        }))
    );
    assert.deepEqual(
        registration.outputContracts.futureExecutionPass.allowedIgnoredRawOutputs,
        Object.values(STAGE_B_RAW_PATHS)
    );
    assert.equal(registration.outputContracts.futureExecutionPass.preregistrationFilesMutable, false);
    assert.equal(registration.outputContracts.futureExecutionPass.stageCReviewReturnIncluded, false);

    const duplicate = copy(registration) as StageBRegistration;
    duplicate.outputContracts.futureExecutionPass.allowedTrackedOutputs[1] =
        duplicate.outputContracts.futureExecutionPass.allowedTrackedOutputs[0];
    assert.throws(() => validateStageBRegistration(duplicate));
    const widened = copy(registration) as StageBRegistration;
    widened.outputContracts.futureExecutionPass.allowedTrackedOutputs.push({
        path: 'shared/simulation.ts', status: 'M', mode: '100644', role: 'forbidden'
    });
    assert.throws(() => validateStageBRegistration(widened));
});

test('Stage B constructs the exact 276-word shortlex domain and 274-word holdout remainder', () => {
    const words = buildRegisteredWords();
    assert.equal(words.length, 276);
    assert.deepEqual(
        [2, 4, 8].map((depth) => words.filter((word) => word.endpointDepth === depth).length),
        [4, 16, 256]
    );
    assert.deepEqual(words[0].directions, [-1, -1]);
    assert.deepEqual(words[3].directions, [1, 1]);
    assert.deepEqual(words[4].directions, [-1, -1, -1, -1]);
    assert.deepEqual(words[19].directions, [1, 1, 1, 1]);
    assert.deepEqual(words[20].directions, [-1, -1, -1, -1, -1, -1, -1, -1]);
    assert.deepEqual(words[275].directions, [1, 1, 1, 1, 1, 1, 1, 1]);
    assert.deepEqual(words.map((word) => word.wordIndex), [...words.keys()]);
    assert.equal(new Set(words.map((word) => word.routeId)).size, 276);
    for (const word of words) {
        assert.equal(word.directions.length, word.endpointDepth);
        assert.ok(word.directions.every((direction) => direction === -1 || direction === 1));
        assert.equal(word.routeId, routeIdFor(word.directions));
        assert.equal(word.seed, 3237998097);
        assert.equal(word.calling, 'wizard');
        assert.equal(word.rulesetId, V4_RULESET_ID);
    }
    const holdoutRows = words.filter((word) =>
        HOLDOUTS.some((held) => canonicalJson(held) === canonicalJson(word.directions))
    );
    assert.deepEqual(holdoutRows.map((word) => word.wordIndex), [2, 190]);
    assert.equal(words.length - holdoutRows.length, 274);
});

test('Stage B primary outcomes follow frozen precedence and never promote route-only provenance', () => {
    const left = endpoint();
    const routeOnly = endpoint({
        wordIndex: 1,
        routeId: routeIdFor([-1, 1]),
        directions: [-1, 1]
    });
    assert.deepEqual(STAGE_B_PRIMARY_OUTCOMES, [
        'frame_support_failure',
        'command_semantic_split',
        'continuation_support_split',
        'provenance_exact_state_only_split',
        'no_target_relevant_split'
    ]);
    const noTarget = classifyPair(left, routeOnly);
    assert.equal(noTarget.equality.routeHistoryEqual, false);
    assert.equal(noTarget.primaryOutcome, 'no_target_relevant_split');
    assert.equal(noTarget.targetRelevant, false);

    const provenance = classifyPair(left, endpoint({
        ...routeOnly,
        preCommandRevision: 8,
        postCommandRevision: 9,
        preCommandStateDigest: '4'.repeat(64),
        postCommandStateDigest: '5'.repeat(64)
    }));
    assert.equal(provenance.primaryOutcome, 'provenance_exact_state_only_split');
    assert.equal(provenance.targetRelevant, false);

    const continuation = classifyPair(left, endpoint({
        ...routeOnly,
        postCommandMovementRemaining: 24,
        preCommandRevision: 8,
        postCommandRevision: 9,
        preCommandStateDigest: '4'.repeat(64),
        postCommandStateDigest: '5'.repeat(64)
    }));
    assert.equal(continuation.primaryOutcome, 'continuation_support_split');
    assert.equal(continuation.targetRelevant, true);

    const command = classifyPair(left, endpoint({
        ...routeOnly,
        readout: {
            accepted: false,
            mutated: false,
            error: { code: 'COMMAND_REJECTED', message: 'fixture rejection' },
            authoritativeEvents: [],
            eventsDigest: '6'.repeat(64)
        },
        postCommandMovementRemaining: 24,
        preCommandRevision: 8,
        postCommandRevision: 8,
        preCommandStateDigest: '4'.repeat(64),
        postCommandStateDigest: '4'.repeat(64)
    }));
    assert.equal(command.primaryOutcome, 'command_semantic_split');
    assert.equal(command.targetRelevant, true);

    const failed = classifyPair(left, endpoint({
        ...routeOnly,
        frameOk: false,
        readout: {
            accepted: false,
            mutated: false,
            error: { code: 'COMMAND_REJECTED', message: 'fixture rejection' },
            authoritativeEvents: [],
            eventsDigest: '6'.repeat(64)
        },
        postCommandMovementRemaining: 24
    }));
    assert.equal(failed.primaryOutcome, 'frame_support_failure');
    assert.equal(failed.targetRelevant, false);
});

test('Stage B command semantics compare exact errors and event order, never digest labels alone', () => {
    const route = {
        wordIndex: 1,
        routeId: routeIdFor([-1, 1]),
        directions: [-1, 1] as StageBDirection[]
    };
    const rejected = endpoint({
        readout: {
            accepted: false,
            mutated: false,
            error: { code: 'COMMAND_REJECTED', message: 'exact message one' },
            authoritativeEvents: [],
            eventsDigest: sha256Digest([])
        }
    });
    const messageChanged = endpoint({
        ...route,
        readout: {
            ...rejected.readout,
            error: { code: 'COMMAND_REJECTED', message: 'exact message two' }
        }
    });
    const errorSplit = classifyPair(rejected, messageChanged);
    assert.equal(errorSplit.equality.commandSemanticEqual, false);
    assert.equal(errorSplit.primaryOutcome, 'command_semantic_split');

    const orderedEvents = [
        { type: 'first', ordinal: 1 },
        { type: 'second', ordinal: 2 }
    ];
    const eventLeft = endpoint({
        readout: {
            accepted: true,
            mutated: true,
            error: null,
            authoritativeEvents: orderedEvents,
            eventsDigest: sha256Digest(orderedEvents)
        }
    });
    const reversedEvents = [...orderedEvents].reverse();
    const eventRight = endpoint({
        ...route,
        readout: {
            accepted: true,
            mutated: true,
            error: null,
            authoritativeEvents: reversedEvents,
            eventsDigest: sha256Digest(reversedEvents)
        }
    });
    const eventSplit = classifyPair(eventLeft, eventRight);
    assert.equal(eventSplit.equality.commandSemanticEqual, false);
    assert.equal(eventSplit.primaryOutcome, 'command_semantic_split');

    const digestOnly = endpoint({
        ...route,
        readout: { ...eventLeft.readout, eventsDigest: 'f'.repeat(64) }
    });
    const digestControl = classifyPair(eventLeft, digestOnly);
    assert.equal(digestControl.equality.commandSemanticEqual, true);
    assert.equal(digestControl.primaryOutcome, 'no_target_relevant_split');
    assert.equal(digestControl.targetRelevant, false);
});

// The injected fixture controls below never call the bound V4 authority. They
// exercise the exact generator/retention guards without replaying either
// historical calibration occurrence as a fresh pressure case.
let fixtureExecution: StageBExecution | undefined;
let fixtureAuthority: ReturnType<typeof buildSyntheticAuthority> | undefined;
function syntheticExecution(): StageBExecution {
    if (fixtureExecution) return fixtureExecution;
    fixtureAuthority = buildSyntheticAuthority();
    fixtureExecution = executeRegisteredRoutes(
        readStageBRegistration(),
        fixtureAuthority.dependencies
    );
    return fixtureExecution;
}

type SyntheticSession = {
    sessionId: number;
    commands: StageBDirection[];
    actors: string[];
    expectedTurns: number[];
    inputSnapshots: string[];
};

function syntheticInitialState(): SimulationState {
    return {
        formatVersion: 4,
        rulesetId: V4_RULESET_ID,
        rulesetVersion: 4,
        seed: 3237998097,
        rngState: 123456789,
        tick: 0,
        revision: 0,
        turn: 0,
        activeActor: 'player',
        turnDeadlineTick: 900,
        phase: 'awaiting_command',
        winner: null,
        finishReason: null,
        movementRemaining: 64,
        selectedRelic: 'threadball',
        aim: null,
        units: [
            {
                id: 'player', calling: 'wizard', x: 512, y: 256,
                facing: 1, stitching: 100, alive: true
            },
            {
                id: 'loomkeeper', calling: 'loomkeeper', x: 1152, y: 256,
                facing: -1, stitching: 100, alive: true
            }
        ],
        terrain: { width: 256, height: 72, cellSize: 8, words: [0] },
        lastProjectile: null
    };
}

function buildSyntheticAuthority(options: {
    rejectFirstNegative?: boolean;
    mutateInput?: boolean;
    acceptedNonmutating?: boolean;
    acceptedUnchanged?: boolean;
} = {}): {
    dependencies: StageBAuthorityDependencies;
    sessions: SyntheticSession[];
    initializationCount: () => number;
    projectionCount: () => number;
} {
    let initializationCount = 0;
    let projectionCount = 0;
    const sessions: SyntheticSession[] = [];
    const sessionByState = new WeakMap<SimulationState, SyntheticSession>();

    const dependencies: StageBAuthorityDependencies = {
        createSimulation(seed, calling, rulesetId) {
            assert.equal(seed, 3237998097);
            assert.equal(calling, 'wizard');
            assert.equal(rulesetId, V4_RULESET_ID);
            const state = syntheticInitialState();
            const session: SyntheticSession = {
                sessionId: initializationCount,
                commands: [],
                actors: [],
                expectedTurns: [],
                inputSnapshots: []
            };
            initializationCount += 1;
            sessions.push(session);
            sessionByState.set(state, session);
            return state;
        },
        applySimulationCommand(state, actor, command, expectedTurn): SimulationTransition {
            assert.equal(command.type, 'move');
            if (command.type !== 'move') throw new Error('Synthetic authority accepts MOVE only.');
            assert.ok(command.direction === -1 || command.direction === 1);
            const session = sessionByState.get(state);
            assert(session, 'Synthetic state must retain its isolated route session.');
            session.commands.push(command.direction);
            session.actors.push(actor);
            session.expectedTurns.push(expectedTurn);
            session.inputSnapshots.push(canonicalJson(state));

            if (options.mutateInput) state.revision += 1;
            if (options.acceptedNonmutating) {
                const returned = copy(state);
                sessionByState.set(returned, session);
                return { accepted: true, mutated: false, state: returned, events: [] };
            }
            if (options.acceptedUnchanged) {
                const returned = copy(state);
                sessionByState.set(returned, session);
                return { accepted: true, mutated: true, state: returned, events: [] };
            }
            if (options.rejectFirstNegative && state.revision === 0 && command.direction === -1) {
                const returned = copy(state);
                sessionByState.set(returned, session);
                return {
                    accepted: false,
                    mutated: false,
                    state: returned,
                    events: [],
                    error: { code: 'COMMAND_REJECTED', message: 'Synthetic first-negative rejection.' }
                };
            }
            if (state.movementRemaining === 0) {
                const returned = copy(state);
                sessionByState.set(returned, session);
                return {
                    accepted: false,
                    mutated: false,
                    state: returned,
                    events: [],
                    error: { code: 'COMMAND_REJECTED', message: 'Synthetic movement budget exhausted.' }
                };
            }
            const returned = copy(state);
            const player = returned.units[0];
            player.x += command.direction * 8;
            player.facing = command.direction;
            returned.movementRemaining -= 8;
            returned.revision += 1;
            sessionByState.set(returned, session);
            return {
                accepted: true,
                mutated: true,
                state: returned,
                events: [{ type: 'moved', actor, x: player.x, y: player.y }]
            };
        },
        projectV4SimulationState(state) {
            projectionCount += 1;
            const projectedValue = {
                activeActor: state.activeActor,
                units: state.units.map(({ id, x, y, stitching }) => ({ id, x, y, stitching }))
            };
            return {
                cutId: 'thin_visible_duel_v0',
                cutVersion: 2,
                classKey: `cut-${sha256Digest({
                    cutId: 'thin_visible_duel_v0', cutVersion: 2, projectedValue
                })}`,
                projectedValue
            };
        },
        canonicalSimulationJson(state) {
            return canonicalJson(state);
        }
    };
    return {
        dependencies,
        sessions,
        initializationCount: () => initializationCount,
        projectionCount: () => projectionCount
    };
}

function sourceFixture(): StageBSourceIdentity {
    const sourceCommit = '7'.repeat(40);
    const sourcePaths = TRACKED_OUTPUTS.slice(0, 4);
    const implementationPaths = sourcePaths.map((path, index) => ({
        path,
        mode: '100644',
        blob: (index + 1).toString(16).repeat(40),
        sha256: (index + 10).toString(16).repeat(64),
        role: 'stage_b_execution_source'
    }));
    const endpointRows = implementationPaths.map((row) => ({
        path: row.path,
        status: 'A',
        oldMode: '000000',
        newMode: row.mode,
        oldBlob: '0'.repeat(40),
        newBlob: row.blob
    }));
    const payload = {
        commit: sourceCommit,
        tree: '8'.repeat(40),
        preregistrationSourceCommit: '65b2153714f237964354da3791fe4af4694a0594',
        preregistrationSourceTree: '4f0cc39665cd903c279fa5e9f415120edba53a97',
        preregistrationTerminalCommit: '6e88418a6a90281976dd5f6dcf2e6db55d9e4009',
        preregistrationTerminalTree: '70a8c35a2fe102837577883c6dcc0581dce9e2b9',
        preregistrationSourceDigest: '982f9684b27ccc8416e3759fd0cdc95cb07c69b1560f59ce5682a6152062dc13',
        preregistrationBindingsDigest: '74598bc4b0b1e3a449969b4e4bb012ceef9fff52f50da56b1f5e410938d70647',
        preregistrationParityDigest: 'fa96db39f416456d3932fc076d6b4ee7ac274139395250e4899be1a84e1001a4',
        registration: {
            path: 'analysis/crpm_world/navigation/wp-015d2r-stage-b-one-next-command-search-registration-v1.json',
            blob: 'd8d6b5a6c52fb421fb77ab4cb32a2d1f48ed03aa',
            sha256: 'b02ee74661e7c9a6b48c3f9917ea12d6889840800a3e0036518de3a933961087'
        },
        contract: {
            path: 'docs/planning/wp-015d2r-stage-b-one-next-command-search-contract-v1.md',
            blob: '6140b390d8e073378e57c90c2d2cd8c2dac20f79',
            sha256: '37d9fa6d566ead810b83c19fc29f72363beb6c6fc734e74e04e1b408eb024dd5'
        },
        implementationPaths,
        range: {
            baseCommit: '6e88418a6a90281976dd5f6dcf2e6db55d9e4009',
            resultCommit: sourceCommit,
            endpointRows,
            commits: [{
                commit: sourceCommit,
                parent: '6e88418a6a90281976dd5f6dcf2e6db55d9e4009',
                rows: endpointRows
            }]
        }
    };
    return { ...payload, sourceDigest: sha256Digest(payload) };
}

function rehash(result: StageBResult): StageBResult {
    const changed = result as StageBResult & {
        digests: StageBResult['digests'];
        resultDigest: string;
    };
    const parityBasis = {
        resultId: changed.resultId,
        sourceCommit: changed.source.commit,
        sourceDigest: changed.source.sourceDigest,
        registrationDigest: changed.registrationDigest,
        domain: changed.domain,
        primaryOutcomeCounts: changed.primaryOutcomeCounts,
        targetRelevantPairCount: changed.targetRelevantPairCount,
        descriptiveCrossTab: changed.descriptiveCrossTab,
        witnessInterface: changed.witnessInterface,
        transition: changed.transition,
        evidenceClass: changed.evidenceClass,
        productAuthority: changed.productAuthority,
        mathematicalPlacementImplication: changed.mathematicalPlacementImplication,
        landfall: changed.landfall,
        chartRevision: changed.chartRevision,
        successorCarrierSelected: changed.successorCarrierSelected,
        stageC: changed.stageC,
        p5: changed.p5,
        stopStatement: changed.stopStatement
    };
    changed.digests = {
        sourceDigest: changed.source.sourceDigest,
        suiteDigest: sha256Digest(changed.source.implementationPaths),
        sourceRangeDigest: sha256Digest(changed.source.range),
        domainDigest: sha256Digest(changed.domain),
        recordsDigest: sha256Digest(changed.records),
        outcomesDigest: sha256Digest({
            primaryOutcomeCounts: changed.primaryOutcomeCounts,
            targetRelevantPairCount: changed.targetRelevantPairCount
        }),
        crossTabDigest: sha256Digest(changed.descriptiveCrossTab),
        parityDigest: sha256Digest(parityBasis)
    };
    const { resultDigest: _prior, ...payload } = changed;
    changed.resultDigest = sha256Digest(payload);
    return changed;
}

function rehashSource(result: StageBResult): StageBResult {
    const source = result.source as StageBSourceIdentity & { sourceDigest: string };
    const { sourceDigest: _prior, ...payload } = source;
    source.sourceDigest = sha256Digest(payload);
    return rehash(result);
}

function authenticatedSourceFixture(repository: string): StageBSourceIdentity {
    const fixture = sourceFixture();
    gitAt(repository, ['read-tree', `${STAGE_B_PREREGISTRATION_TERMINAL_COMMIT}^{tree}`]);
    const implementationPaths = STAGE_B_EXECUTION_SOURCE_PATHS.map((path, index) => {
        const bytes = `synthetic Stage B execution source ${index}: ${path}\n`;
        const blob = gitAt(repository, ['hash-object', '-w', '--stdin'], bytes);
        gitAt(repository, [
            'update-index', '--add', '--cacheinfo', `100644,${blob},${path}`
        ]);
        return {
            path,
            mode: '100644',
            blob,
            sha256: createHash('sha256').update(bytes).digest('hex'),
            role: 'stage_b_execution_source'
        };
    });
    const tree = gitAt(repository, ['write-tree']);
    const commit = gitAt(repository, [
        '-c', 'user.name=Stage B authenticated fixture',
        '-c', 'user.email=stage-b-authenticated@example.invalid',
        'commit-tree', tree,
        '-p', STAGE_B_PREREGISTRATION_TERMINAL_COMMIT,
        '-m', 'synthetic authenticated Stage B source'
    ]);
    gitAt(repository, ['update-ref', 'HEAD', commit]);
    const range = auditStageBRange(
        STAGE_B_PREREGISTRATION_TERMINAL_COMMIT,
        commit,
        STAGE_B_EXECUTION_SOURCE_PATHS,
        repository
    );
    const { sourceDigest: _fixtureDigest, ...fixturePayload } = fixture;
    const payload = {
        ...fixturePayload,
        commit,
        tree,
        implementationPaths,
        range
    };
    return { ...payload, sourceDigest: sha256Digest(payload) };
}

test('Stage B excludes both calibration occurrences before initialization or authority', () => {
    const execution = syntheticExecution();
    const authority = fixtureAuthority!;
    const excluded = execution.routeAttempts.filter(
        (row) => row.disposition === 'excluded_calibration_occurrence'
    );
    assert.deepEqual(excluded.map((row) => row.directions), HOLDOUTS);
    assert.equal(authority.initializationCount(), 274);
    assert.ok(excluded.every((row) =>
        row.initializationCount === 0 &&
        row.prefixAuthorityCallCount === 0 &&
        row.nextCommandAuthorityCallCount === 0
    ));
    const initializedAttempts = execution.routeAttempts.filter((row) => row.initializationCount === 1);
    assert.equal(initializedAttempts.length, authority.sessions.length);
    initializedAttempts.forEach((attempt, index) => {
        const session = authority.sessions[index];
        assert.equal(attempt.disposition, 'eligible_endpoint');
        assert.equal(session.commands.length, attempt.endpointDepth + 1,
            'each initialized success session must contain its prefix plus exactly one decoder call');
        assert.equal(attempt.prefixAuthorityCallCount, attempt.endpointDepth);
        assert.equal(attempt.nextCommandAuthorityCallCount, 1);
        assertCanonicalEqual(session.commands, [...attempt.directions, 1]);
        assert.equal(session.inputSnapshots.length, session.commands.length);
        assert.ok(!HOLDOUTS.some((held) => canonicalJson(held) === canonicalJson(attempt.directions)));
    });
    assert.equal(
        authority.initializationCount(),
        execution.routeAttempts.reduce((sum, row) => sum + row.initializationCount, 0)
    );
    assert.equal(
        authority.sessions.reduce((sum, session) => sum + session.commands.length, 0),
        execution.routeAttempts.reduce(
            (sum, row) => sum + row.prefixAuthorityCallCount + row.nextCommandAuthorityCallCount,
            0
        ),
        'actual synthetic calls must equal the retained prefix-plus-decoder call census'
    );
    assert.equal(
        execution.routeAttempts.reduce((sum, row) => sum + row.prefixAuthorityCallCount, 0),
        2110
    );
    assert.equal(
        execution.routeAttempts.reduce((sum, row) => sum + row.nextCommandAuthorityCallCount, 0),
        274
    );
});

test('Stage B retains the complete domain, decodes every endpoint once and never stops at a positive', () => {
    const execution = syntheticExecution();
    const authority = fixtureAuthority!;
    assert.equal(execution.executionComplete, true);
    assert.equal(execution.registeredWords.length, 276);
    assert.equal(execution.routeAttempts.length, 276);
    assert.deepEqual(
        execution.routeAttempts.map((row) => row.routeId),
        execution.registeredWords.map((row) => row.routeId)
    );
    const dispositions = countBy(execution.routeAttempts, (row) => row.disposition);
    assert.equal(dispositions.excluded_calibration_occurrence, 2);
    assert.equal(dispositions.eligible_endpoint, 274);
    assert.equal(dispositions.rejected_prefix ?? 0, 0);
    assert.equal(dispositions.pruned_by_rejected_prefix ?? 0, 0);
    assert.equal(dispositions.frame_support_failure ?? 0, 0);
    assert.equal(execution.eligibleEndpoints.length, 274);
    assert.equal(execution.frameSupportFailures.length, 0);
    assert.ok(execution.aliasPairs.some((row) => row.targetRelevant),
        'the fixture must contain an early positive while enumeration still reaches word 275');
    assert.equal(execution.routeAttempts.at(-1)?.wordIndex, 275);
    assert.equal(authority.projectionCount(), execution.eligibleEndpoints.length * 2);
    assert.ok(execution.routeAttempts
        .filter((row) => row.disposition === 'eligible_endpoint')
        .every((row) => row.nextCommandAuthorityCallCount === 1));
    assert.ok(execution.eligibleEndpoints.every((row) =>
        row.actor === 'player' && row.expectedTurn === 0 &&
        canonicalJson(row.command) === canonicalJson({ type: 'move', direction: 1 }) &&
        row.endpointInputUnchanged && row.frameOk
    ));
    for (const session of authority.sessions) {
        assert.ok(session.actors.every((actor) => actor === 'player'));
        assert.ok(session.expectedTurns.every((turn) => turn === 0));
    }

    const classes = new Map<string, number>();
    for (const row of execution.eligibleEndpoints) {
        const key = canonicalJson({
            cutId: row.sourceProjection.cutId,
            cutVersion: row.sourceProjection.cutVersion,
            projectedValue: row.sourceProjection.projectedValue
        });
        classes.set(key, (classes.get(key) ?? 0) + 1);
    }
    const expectedPairs = [...classes.values()].reduce(
        (count, members) => count + members * (members - 1) / 2,
        0
    );
    assert.equal(execution.sourceClassCount, classes.size);
    assert.equal(
        execution.eligibleAliasClassCount,
        [...classes.values()].filter((members) => members >= 2).length
    );
    assert.equal(execution.aliasPairs.length, expectedPairs);
    assert.equal(new Set(execution.eligibleEndpoints.map((row) => row.endpointId)).size, 274);
    assert.equal(new Set(execution.aliasPairs.map((row) => row.pairId)).size, expectedPairs);
});

test('Stage B retains first rejection and every pruned extension without replaying the holdout', () => {
    const authority = buildSyntheticAuthority({ rejectFirstNegative: true });
    const execution = executeRegisteredRoutes(readStageBRegistration(), authority.dependencies);
    const dispositions = countBy(execution.routeAttempts, (row) => row.disposition);
    assert.equal(execution.executionComplete, true);
    assert.equal(execution.routeAttempts.length, 276);
    assert.equal(dispositions.excluded_calibration_occurrence, 2);
    assert.equal(dispositions.rejected_prefix, 1);
    assert.equal(dispositions.pruned_by_rejected_prefix, 137);
    assert.equal(dispositions.eligible_endpoint, 136);
    assert.equal(execution.rejectedPrefixes.length, 138);
    assert.equal(execution.rejectedPrefixes.filter((row) => row.rowType === 'rejected_prefix').length, 1);
    assert.equal(execution.rejectedPrefixes.filter(
        (row) => row.rowType === 'pruned_by_rejected_prefix'
    ).length, 137);
    assertCanonicalEqual(
        execution.rejectedPrefixes.find((row) => row.rowType === 'rejected_prefix')?.rejectedPrefix,
        [-1]
    );
    const firstRejection = execution.rejectedPrefixes.find(
        (row) => row.rowType === 'rejected_prefix'
    )!;
    assert.equal(firstRejection.actor, 'player');
    assert.equal(firstRejection.expectedTurn, 0);
    assertCanonicalEqual(firstRejection.command, { type: 'move', direction: -1 });
    assert.equal(firstRejection.inputUnchanged, true);
    assert.equal(firstRejection.preStateDigest, firstRejection.postStateDigest);
    assertCanonicalEqual(firstRejection.transition, {
        accepted: false,
        mutated: false,
        error: {
            code: 'COMMAND_REJECTED',
            message: 'Synthetic first-negative rejection.'
        },
        authoritativeEvents: [],
        eventsDigest: sha256Digest([])
    });
    assert.ok(execution.routeAttempts
        .filter((row) => row.disposition === 'pruned_by_rejected_prefix')
        .every((row) =>
            row.initializationCount === 0 && row.prefixAuthorityCallCount === 0 &&
            row.nextCommandAuthorityCallCount === 0 && row.directions[0] === -1
        ));
    assert.ok(execution.routeAttempts
        .filter((row) => row.disposition === 'excluded_calibration_occurrence')
        .every((row) => row.initializationCount === 0 && row.prefixAuthorityCallCount === 0));
    const initializedAttempts = execution.routeAttempts.filter((row) => row.initializationCount === 1);
    assert.equal(authority.initializationCount(), 137);
    assert.equal(initializedAttempts.length, authority.sessions.length);
    initializedAttempts.forEach((attempt, index) => {
        const session = authority.sessions[index];
        if (attempt.disposition === 'rejected_prefix') {
            const rejectedPrefix = attempt.rejectedPrefix;
            assert(rejectedPrefix, 'a rejected-prefix attempt must retain its exact rejected prefix');
            assert.equal(attempt.prefixAuthorityCallCount, rejectedPrefix.length);
            assertCanonicalEqual(session.commands, rejectedPrefix);
            assert.equal(attempt.nextCommandAuthorityCallCount, 0);
        } else {
            assert.equal(attempt.disposition, 'eligible_endpoint');
            assert.equal(attempt.prefixAuthorityCallCount, attempt.endpointDepth);
            assertCanonicalEqual(session.commands, [...attempt.directions, 1]);
            assert.equal(attempt.nextCommandAuthorityCallCount, 1);
        }
        assert.equal(session.inputSnapshots.length, session.commands.length);
    });
    assert.equal(
        authority.initializationCount(),
        execution.routeAttempts.reduce((sum, row) => sum + row.initializationCount, 0)
    );
    assert.equal(
        authority.sessions.reduce((sum, session) => sum + session.commands.length, 0),
        execution.routeAttempts.reduce(
            (sum, row) => sum + row.prefixAuthorityCallCount + row.nextCommandAuthorityCallCount,
            0
        )
    );
    assert.equal(authority.projectionCount(), execution.eligibleEndpoints.length * 2);
});

test('Stage B fails closed when an injected authority mutates source or self-attests nonmutation', () => {
    for (const options of [
        { mutateInput: true },
        { acceptedNonmutating: true },
        { acceptedUnchanged: true }
    ]) {
        const authority = buildSyntheticAuthority(options);
        const execution = executeRegisteredRoutes(readStageBRegistration(), authority.dependencies);
        assert.equal(execution.executionComplete, false);
        assert.equal(execution.frameSupportFailures.length, 1);
        assert.equal(execution.frameSupportFailures[0].stage, 'route_prefix');
        assert.equal(execution.routeAttempts.at(-1)?.disposition, 'frame_support_failure');
        assert.ok(execution.routeAttempts.length < 276);
        assert.equal(execution.eligibleEndpoints.length, 0);
        assert.equal(execution.aliasPairs.length, 0);
        const partial = buildStageBResult(execution, sourceFixture());
        assert.equal(partial.hardGatesPass, false);
        assert.equal(partial.analyticalDisposition, 'invalid_frame_or_support');
        assert.equal(partial.records.frameSupportFailures.length, 1);
    }
});

test('Stage B failure evidence binds stage, operation, command coordinates and call flags', () => {
    const authority = buildSyntheticAuthority({ acceptedNonmutating: true });
    const execution = executeRegisteredRoutes(readStageBRegistration(), authority.dependencies);
    const genuine = buildStageBResult(execution, sourceFixture());
    assertCanonicalEqual(validateStageBResult(genuine), genuine,
        'the genuine retained route-prefix failure must remain valid');

    for (const operation of [
        'unknown_stage', 'unknown_operation', 'stage_operation', 'actor', 'turn',
        'command', 'prefix_call', 'next_call'
    ]) {
        const changed = copy(genuine) as StageBResult;
        const failure = changed.records.frameSupportFailures[0] as unknown as {
            failureRef: string;
            stage: string;
            message: string;
            routeId?: string;
            directions?: StageBDirection[];
            prefixDepth?: number;
            evidence: {
                operation: string;
                nextCommandAuthorityCallAttempted: boolean;
                prefixAuthorityCallAttempted?: boolean;
                actor?: string;
                expectedTurn?: number;
                command?: { type: string; direction: number };
            };
        };
        const priorFailureRef = failure.failureRef;
        if (operation === 'unknown_stage') failure.stage = 'forged_stage';
        if (operation === 'unknown_operation') failure.evidence.operation = 'forged_operation';
        if (operation === 'stage_operation') {
            failure.evidence.operation = 'next_command_transition_validation';
            failure.evidence.nextCommandAuthorityCallAttempted = true;
            delete failure.evidence.prefixAuthorityCallAttempted;
            failure.evidence.command = { type: 'move', direction: 1 };
        }
        if (operation === 'actor') failure.evidence.actor = 'loomkeeper';
        if (operation === 'turn') failure.evidence.expectedTurn = 1;
        if (operation === 'command') failure.evidence.command = { type: 'move', direction: 1 };
        if (operation === 'prefix_call') failure.evidence.prefixAuthorityCallAttempted = false;
        if (operation === 'next_call') failure.evidence.nextCommandAuthorityCallAttempted = true;
        failure.failureRef = `frame-${sha256Digest({
            stage: failure.stage,
            message: failure.message,
            routeId: failure.routeId ?? null,
            directions: failure.directions ?? null,
            prefixDepth: failure.prefixDepth ?? null,
            evidence: failure.evidence ?? null
        })}`;
        const attempt = changed.records.routeAttempts.find((row) =>
            row.disposition === 'frame_support_failure' && row.failureRef === priorFailureRef
        );
        assert(attempt, 'the retained failure must remain linked from its route attempt');
        (attempt as unknown as { failureRef: string }).failureRef = failure.failureRef;
        const changedExecution: StageBExecution = {
            registeredWords: buildRegisteredWords(),
            routeAttempts: changed.records.routeAttempts,
            rejectedPrefixes: changed.records.rejectedPrefixes,
            eligibleEndpoints: changed.records.eligibleEndpoints,
            aliasPairs: changed.records.aliasPairs,
            frameSupportFailures: changed.records.frameSupportFailures,
            sourceClassCount: changed.domain.sourceClassCount,
            eligibleAliasClassCount: changed.domain.eligibleAliasClassCount,
            executionComplete: changed.domain.complete
        };
        (changed as unknown as { rawOutputs: StageBResult['rawOutputs'] }).rawOutputs =
            serializeStageBRawOutputs(changedExecution).map((row) => row.manifest);
        const coherentlyRehashed = rehash(changed);
        assert.throws(() => validateStageBResult(coherentlyRehashed), operation);
    }
});

test('Stage B result mirrors all five raw ledgers and binds exhaustive counts and digests', () => {
    const execution = syntheticExecution();
    const result = buildStageBResult(execution, sourceFixture());
    assertCanonicalEqual(validateStageBResult(result), result);
    assert.equal(canonicalStageBResult(result), canonicalJson(result));
    assertCanonicalEqual(result.records, {
        routeAttempts: execution.routeAttempts,
        rejectedPrefixes: execution.rejectedPrefixes,
        eligibleEndpoints: execution.eligibleEndpoints,
        aliasPairs: execution.aliasPairs,
        frameSupportFailures: execution.frameSupportFailures
    });
    assertCanonicalEqual(result.domain, {
        identity: 'WP-015D2R:stage-b-natural-move-words:v1',
        seedSet: [3237998097],
        alphabet: [-1, 1],
        depths: [2, 4, 8],
        attemptedWordCount: 276,
        excludedCalibrationOccurrenceCount: 2,
        rejectedPrefixCount: 0,
        prunedWordCount: 0,
        naturallyReachableEndpointCount: 274,
        sourceClassCount: execution.sourceClassCount,
        eligibleAliasClassCount: execution.eligibleAliasClassCount,
        eligiblePairCount: execution.aliasPairs.length,
        frameSupportFailureCount: 0,
        complete: true,
        stoppedAtFirstPositive: false
    });
    assert.deepEqual(Object.keys(result.primaryOutcomeCounts), [...STAGE_B_PRIMARY_OUTCOMES]);
    assert.equal(
        Object.values(result.primaryOutcomeCounts).reduce((sum, count) => sum + count, 0),
        execution.aliasPairs.length
    );
    assert.equal(result.targetRelevantPairCount,
        execution.aliasPairs.filter((row) => row.targetRelevant).length);

    const serialized = serializeStageBRawOutputs(execution);
    assert.equal(serialized.length, 5);
    assertCanonicalEqual(result.rawOutputs, serialized.map((row) => row.manifest));
    assert.equal(new Set(serialized.map((row) => row.path)).size, 5);
    for (const raw of serialized) {
        const lines = raw.text.length === 0 ? [] : raw.text.trimEnd().split('\n');
        assert.equal(lines.length, raw.rows.length);
        assertCanonicalEqual(lines.map((line) => parseStrictJson(line)), raw.rows);
        assert.equal(raw.manifest.recordsDigest, sha256Digest(raw.rows));
    }
    const candidatePairIds = execution.aliasPairs.filter((row) => row.targetRelevant)
        .map((row) => row.pairId).sort();
    assert.equal(result.witnessInterface.W_status, 'absent');
    assert.equal(result.witnessInterface.candidateResultStatus,
        candidatePairIds.length > 0 ? 'present' : 'absent');
    assertCanonicalEqual(result.witnessInterface.candidateWitnessPairIds, candidatePairIds);
    assert.equal(result.witnessInterface.Omega_W_status, 'not_evaluated');
    assert.equal(result.witnessInterface.P_W_status, 'not_evaluated');
    assert.equal(result.witnessInterface.N_W_status, 'not_evaluated');
    assert.equal(result.witnessInterface.J_W, 'not_applicable');
    assert.equal(result.transition.status, 'candidate_unlicensed');
    assert.equal(result.transition.automaticLicenseFromResult, false);
    assert.equal(result.hardGatesPass, true);
    assert.equal(result.analyticalDisposition, 'stopped_for_review');
    assert.equal(result.landfall, false);
    assert.equal(result.chartRevision, false);
    assert.equal(result.successorCarrierSelected, false);
    assert.equal(result.stageC, 'not_opened');
});

test('Stage B descriptive cross-tab is deterministic, non-authoritative and exactly pair-conserving', () => {
    const execution = syntheticExecution();
    const result = buildStageBResult(execution, sourceFixture());
    assert.equal(result.descriptiveCrossTab.authority, 'non_authoritative_descriptive_only');
    assert.match(result.descriptiveCrossTab.interpretationGuard,
        /continuation-support-coordinate split, never recursive continuation closure/);
    assertCanonicalEqual(result.descriptiveCrossTab.rows, buildStageBCrossTab(execution.aliasPairs));
    assertCanonicalEqual(
        buildStageBCrossTab([...execution.aliasPairs].reverse()),
        result.descriptiveCrossTab.rows
    );
    const keys = result.descriptiveCrossTab.rows.map((row) => canonicalJson({
        endpointOrder: row.endpointOrder,
        endpointDepthPair: row.endpointDepthPair,
        depthRelation: row.depthRelation,
        preCommandMovementRemainingPair: row.preCommandMovementRemainingPair,
        postCommandMovementRemainingPair: row.postCommandMovementRemainingPair,
        knownRouteLengthMovementBudgetPattern: row.knownRouteLengthMovementBudgetPattern,
        primaryOutcome: row.primaryOutcome
    }));
    assert.equal(new Set(keys).size, keys.length);
    assert.equal(
        result.descriptiveCrossTab.rows.reduce((sum, row) => sum + row.pairCount, 0),
        execution.aliasPairs.length
    );
    for (const row of result.descriptiveCrossTab.rows) {
        assert.equal(row.endpointOrder, 'canonical_route_id_left_right');
        assert.equal(
            row.depthRelation,
            row.endpointDepthPair[0] === row.endpointDepthPair[1] ? 'same_depth' : 'cross_depth'
        );
        const depthDelta = row.endpointDepthPair[1] - row.endpointDepthPair[0];
        const preBudgetDelta = row.preCommandMovementRemainingPair[1] -
            row.preCommandMovementRemainingPair[0];
        assert.equal(
            row.knownRouteLengthMovementBudgetPattern,
            depthDelta !== 0 && preBudgetDelta !== 0 && depthDelta * preBudgetDelta < 0
        );
        assert.ok(STAGE_B_PRIMARY_OUTCOMES.includes(row.primaryOutcome));
        assert.ok(row.pairCount > 0);
    }
});

test('Stage B cross-tab preserves endpoint-wise depth and budget association', () => {
    const base = syntheticExecution().aliasPairs[0];
    const associated = {
        ...base,
        leftEndpointDepth: 2 as const,
        rightEndpointDepth: 8 as const,
        preCommandMovementRemainingPair: [48, 0] as [number, number],
        postCommandMovementRemainingPair: [40, 0] as [number, number],
        primaryOutcome: 'continuation_support_split' as const,
        targetRelevant: true
    };
    const permuted = {
        ...associated,
        preCommandMovementRemainingPair: [0, 48] as [number, number],
        postCommandMovementRemainingPair: [0, 40] as [number, number]
    };
    const associatedRow = buildStageBCrossTab([associated])[0];
    const permutedRow = buildStageBCrossTab([permuted])[0];
    assertCanonicalEqual(associatedRow.endpointDepthPair, [2, 8]);
    assertCanonicalEqual(associatedRow.preCommandMovementRemainingPair, [48, 0]);
    assertCanonicalEqual(associatedRow.postCommandMovementRemainingPair, [40, 0]);
    assert.equal(associatedRow.knownRouteLengthMovementBudgetPattern, true);
    assertCanonicalEqual(permutedRow.endpointDepthPair, [2, 8]);
    assertCanonicalEqual(permutedRow.preCommandMovementRemainingPair, [0, 48]);
    assertCanonicalEqual(permutedRow.postCommandMovementRemainingPair, [0, 40]);
    assert.equal(permutedRow.knownRouteLengthMovementBudgetPattern, false);
    assert.notEqual(canonicalJson(associatedRow), canonicalJson(permutedRow),
        'permuting budget association must change the digest-bound descriptive cell');
});

test('Stage B report parity reproduces result digests, counts and governed stop exactly', () => {
    const result = buildStageBResult(syntheticExecution(), sourceFixture());
    const report = renderStageBReport(result);
    const blocks = [...report.matchAll(
        /<!-- STAGE_B_EXECUTION_PARITY_JSON_BEGIN -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- STAGE_B_EXECUTION_PARITY_JSON_END -->/g
    )];
    assert.equal(blocks.length, 1);
    assertCanonicalEqual(parseStrictJson(blocks[0][1]), {
        resultId: result.resultId,
        sourceCommit: result.source.commit,
        sourceTree: result.source.tree,
        preregistrationSourceCommit: result.source.preregistrationSourceCommit,
        preregistrationTerminalCommit: result.source.preregistrationTerminalCommit,
        resultDigest: result.resultDigest,
        primaryOutcomeCounts: result.primaryOutcomeCounts,
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
        tauStatus: 'candidate_unlicensed',
        stageC: 'not_opened',
        productAuthority: 'none',
        mathematicalPlacementImplication: 'none',
        stopStatement: 'WP-015D2R Stage B execution stopped for review; Stage C not opened.'
    });
    assert.match(report, /continuation-support-coordinate split/);
    assert.match(report, /not recursive continuation closure/);
    assert.match(report, /canonical route-ID left\/right endpoint ordering/);
    assert.match(report, /Known route\/budget pattern/);
    assert.match(report, /candidate_unlicensed/);
    assert.match(report, /remain candidate results/);
    assert.doesNotMatch(report, /\blicensed witness\b/i);
    assert.match(report, /Stage C is not opened/);
});

test('Stage B result validation rejects coherently rehashed ledger, count, cross-tab and path tampering', () => {
    const original = buildStageBResult(syntheticExecution(), sourceFixture());
    for (const operation of [
        'duplicate_route', 'duplicate_endpoint', 'missing_endpoint', 'duplicate_pair',
        'outcome_count', 'raw_path', 'raw_digest', 'cross_tab', 'duplicate_cross_tab',
        'cross_tab_association',
        'route_word_index', 'endpoint_actor', 'endpoint_id', 'events_digest',
        'domain_identity', 'domain_excluded_count', 'cross_tab_authority',
        'source_path', 'range_path', 'registration_path', 'contract_path',
        'w_present', 'candidate_licensed', 'candidate_pair', 'w_j',
        'hard_gate', 'analytical_disposition', 'transition_id', 'transition_decode',
        'evidence_class', 'tau', 'stage_c', 'stop_statement'
    ]) {
        const changed = copy(original) as StageBResult;
        if (operation === 'duplicate_route') {
            changed.records.routeAttempts[1] = copy(changed.records.routeAttempts[0]);
        }
        if (operation === 'duplicate_endpoint') {
            changed.records.eligibleEndpoints[1] = copy(changed.records.eligibleEndpoints[0]);
        }
        if (operation === 'missing_endpoint') changed.records.eligibleEndpoints.pop();
        if (operation === 'duplicate_pair') changed.records.aliasPairs[1] = copy(changed.records.aliasPairs[0]);
        if (operation === 'outcome_count') changed.primaryOutcomeCounts.command_semantic_split += 1;
        if (operation === 'raw_path') changed.rawOutputs[1] = copy(changed.rawOutputs[0]);
        if (operation === 'raw_digest') changed.rawOutputs[0] = {
            ...changed.rawOutputs[0], recordsDigest: '0'.repeat(64)
        };
        if (operation === 'cross_tab') {
            (changed.descriptiveCrossTab.rows[0] as { pairCount: number }).pairCount += 1;
        }
        if (operation === 'duplicate_cross_tab') {
            changed.descriptiveCrossTab.rows.push(copy(changed.descriptiveCrossTab.rows[0]));
        }
        if (operation === 'cross_tab_association') {
            const row = changed.descriptiveCrossTab.rows.find((candidate) =>
                candidate.endpointDepthPair[0] !== candidate.endpointDepthPair[1] &&
                candidate.preCommandMovementRemainingPair[0] !==
                    candidate.preCommandMovementRemainingPair[1]
            );
            assert(row, 'the synthetic result must expose a cross-depth, cross-budget cell');
            const mutable = row as unknown as {
                preCommandMovementRemainingPair: [number, number];
                knownRouteLengthMovementBudgetPattern: boolean;
            };
            mutable.preCommandMovementRemainingPair = [
                row.preCommandMovementRemainingPair[1],
                row.preCommandMovementRemainingPair[0]
            ];
            const depthDelta = row.endpointDepthPair[1] - row.endpointDepthPair[0];
            const preBudgetDelta = mutable.preCommandMovementRemainingPair[1] -
                mutable.preCommandMovementRemainingPair[0];
            mutable.knownRouteLengthMovementBudgetPattern =
                depthDelta !== 0 && preBudgetDelta !== 0 && depthDelta * preBudgetDelta < 0;
        }
        if (operation === 'route_word_index') {
            (changed.records.routeAttempts[0] as unknown as { wordIndex: number }).wordIndex = 1;
        }
        if (operation === 'endpoint_actor') {
            (changed.records.eligibleEndpoints[0] as unknown as { actor: string }).actor = 'loomkeeper';
        }
        if (operation === 'endpoint_id') {
            (changed.records.eligibleEndpoints[0] as unknown as { endpointId: string }).endpointId =
                'endpoint-forged';
        }
        if (operation === 'events_digest') {
            (changed.records.eligibleEndpoints[0].readout as { eventsDigest: string }).eventsDigest =
                'f'.repeat(64);
        }
        if (operation === 'domain_identity') changed.domain.identity = 'forged-domain';
        if (operation === 'domain_excluded_count') changed.domain.excludedCalibrationOccurrenceCount = 1;
        if (operation === 'cross_tab_authority') {
            (changed.descriptiveCrossTab as unknown as { authority: string }).authority = 'authoritative';
        }
        if (operation === 'source_path') changed.source.implementationPaths.pop();
        if (operation === 'range_path') changed.source.range.endpointRows.pop();
        if (operation === 'registration_path') changed.source.registration.path = 'forged-registration.json';
        if (operation === 'contract_path') changed.source.contract.path = 'forged-contract.md';
        if (operation === 'w_present') {
            (changed.witnessInterface as unknown as { W_status: string }).W_status = 'present';
        }
        if (operation === 'candidate_licensed') {
            (changed.witnessInterface as unknown as { candidateResultStatus: string })
                .candidateResultStatus = 'licensed';
        }
        if (operation === 'candidate_pair') changed.witnessInterface.candidateWitnessPairIds.pop();
        if (operation === 'w_j') {
            (changed.witnessInterface as unknown as { J_W: string }).J_W = 'evaluated';
        }
        if (operation === 'hard_gate') {
            (changed as unknown as { hardGatesPass: boolean }).hardGatesPass = false;
        }
        if (operation === 'analytical_disposition') {
            (changed as unknown as { analyticalDisposition: string })
                .analyticalDisposition = 'invalid_frame_or_support';
        }
        if (operation === 'transition_id') {
            (changed.transition as unknown as { transitionId: string }).transitionId = 'TAU-FORGED';
        }
        if (operation === 'transition_decode') {
            (changed.transition as unknown as { decodabilityAcrossMove: string })
                .decodabilityAcrossMove = 'evaluated';
        }
        if (operation === 'evidence_class') {
            (changed as unknown as { evidenceClass: string }).evidenceClass = 'empirically_independent';
        }
        if (operation === 'tau') changed.transition.status = 'licensed' as 'candidate_unlicensed';
        if (operation === 'stage_c') {
            (changed as unknown as { stageC: string }).stageC = 'opened';
        }
        if (operation === 'stop_statement') {
            (changed as unknown as { stopStatement: string }).stopStatement = 'Stage C opened.';
        }
        const coherentlyRehashed = [
            'source_path', 'range_path', 'registration_path', 'contract_path'
        ].includes(operation)
            ? rehashSource(changed)
            : rehash(changed);
        assert.throws(() => validateStageBResult(coherentlyRehashed), operation);
    }
    const digestOnly = copy(original) as StageBResult;
    (digestOnly as unknown as { resultDigest: string }).resultDigest = '0'.repeat(64);
    assert.throws(() => validateStageBResult(digestOnly));

    const namedDigestOnly = copy(original) as StageBResult;
    (namedDigestOnly.digests as { recordsDigest: string }).recordsDigest = '0'.repeat(64);
    const { resultDigest: _prior, ...payload } = namedDigestOnly;
    (namedDigestOnly as unknown as { resultDigest: string }).resultDigest = sha256Digest(payload);
    assert.throws(() => validateStageBResult(namedDigestOnly));
});

test('Stage B execution validation rejects duplicate rejected-prefix and frame-failure rows', () => {
    const rejectionAuthority = buildSyntheticAuthority({ rejectFirstNegative: true });
    const rejected = copy(executeRegisteredRoutes(
        readStageBRegistration(), rejectionAuthority.dependencies
    )) as StageBExecution;
    rejected.rejectedPrefixes.push(copy(rejected.rejectedPrefixes[0]));
    assert.throws(() => buildStageBResult(rejected, sourceFixture()));

    const failureAuthority = buildSyntheticAuthority({ acceptedUnchanged: true });
    const failed = copy(executeRegisteredRoutes(
        readStageBRegistration(), failureAuthority.dependencies
    )) as StageBExecution;
    failed.frameSupportFailures.push(copy(failed.frameSupportFailures[0]));
    assert.throws(() => buildStageBResult(failed, sourceFixture()));
});

test('Stage B exact output writer and verification bind result, report and all five raw byte streams', () => {
    const execution = syntheticExecution();
    const result = buildStageBResult(execution, sourceFixture());
    const rawOutputs = serializeStageBRawOutputs(execution);
    const report = renderStageBReport(result);
    const blockedRepository = mkdtempSync(join(tmpdir(), 'stage-b-publication-blocked-'));
    try {
        const rawRoot = resolve(blockedRepository, 'test-results/crpm-world/wp-015d2r-stage-b-v1');
        mkdirSync(rawRoot, { recursive: true });
        writeFileSync(resolve(rawRoot, 'unregistered.jsonl'), '{}\n', 'utf8');
        assert.throws(() => validateStageBRawDirectory('empty', blockedRepository));
        assert.throws(() => writeStageBExecutionOutputs(
            { result, rawOutputs, report }, blockedRepository
        ));
    } finally {
        removeOwnedTemp(blockedRepository, tmpdir());
    }
    const repository = mkdtempSync(join(tmpdir(), 'stage-b-publication-test-'));
    try {
        gitAt(repository, ['init', '--quiet', '--object-format=sha1']);
        writeStageBExecutionOutputs({ result, rawOutputs, report }, repository);
        assert.doesNotThrow(() => validateStageBRawDirectory('complete', repository));
        assertCanonicalEqual(verifyStageBStoredOutputBytes(repository), result);
        assert.throws(() => verifyStageBExecutionOutputs(repository),
            'publication verification must reject the forged 777/888 Git source identity');

        const rawPath = resolve(repository, STAGE_B_RAW_PATHS.aliasPairs);
        const raw = rawOutputs.find((row) => row.path === STAGE_B_RAW_PATHS.aliasPairs)!;
        writeFileSync(rawPath, `${raw.text}{"forged":true}\n`, 'utf8');
        assert.throws(() => verifyStageBStoredOutputBytes(repository), /JSONL bytes drifted/);
        writeFileSync(rawPath, raw.text, 'utf8');

        const reportPath = resolve(repository, STAGE_B_REPORT_PATH);
        writeFileSync(reportPath, `${report}\nforged report row\n`, 'utf8');
        assert.throws(() => verifyStageBStoredOutputBytes(repository), /report\/result parity/);
        writeFileSync(reportPath, report, 'utf8');

        const resultPath = resolve(repository, STAGE_B_RESULT_PATH);
        writeFileSync(resultPath, '{"schemaVersion":1,"resultDigest":"forged"}\n', 'utf8');
        assert.throws(() => verifyStageBStoredOutputBytes(repository));
        writeFileSync(resultPath, `${canonicalJson(result)}\n`, 'utf8');

        const extraPath = resolve(
            repository,
            'test-results/crpm-world/wp-015d2r-stage-b-v1/unregistered.jsonl'
        );
        writeFileSync(extraPath, '{}\n', 'utf8');
        assert.throws(() => validateStageBRawDirectory('complete', repository));
        assert.throws(() => verifyStageBStoredOutputBytes(repository));
    } finally {
        removeOwnedTemp(repository, tmpdir());
    }
});

test('Stage B writer preserves a later blocker and leaves no earlier empty reservations', () => {
    const execution = syntheticExecution();
    const result = buildStageBResult(execution, sourceFixture());
    const run = {
        result,
        rawOutputs: serializeStageBRawOutputs(execution),
        report: renderStageBReport(result)
    };
    const repository = mkdtempSync(join(tmpdir(), 'stage-b-reservation-rollback-'));
    try {
        const rawRoot = resolve(repository, 'test-results/crpm-world/wp-015d2r-stage-b-v1');
        mkdirSync(rawRoot, { recursive: true });
        const blockerPath = resolve(repository, STAGE_B_REPORT_PATH);
        mkdirSync(resolve(blockerPath, '..'), { recursive: true });
        const blockerBytes = Buffer.from('preexisting review-owned blocker\n', 'utf8');
        writeFileSync(blockerPath, blockerBytes);
        assert.throws(() => writeStageBExecutionOutputs(run, repository));
        assert.equal(readFileSync(blockerPath).equals(blockerBytes), true,
            'the later preexisting blocker must be preserved byte-for-byte');
        for (const path of [...Object.values(STAGE_B_RAW_PATHS), STAGE_B_RESULT_PATH]) {
            assert.equal(existsSync(resolve(repository, path)), false,
                `failed publication left an empty reservation at ${path}`);
        }
        assert.deepEqual(
            readdirSync(rawRoot),
            [],
            'failed publication left a raw reservation behind'
        );
    } finally {
        removeOwnedTemp(repository, tmpdir());
    }
});

test('Stage B publication verifier accepts only a real Git-authenticated synthetic source', () => {
    const parent = mkdtempSync(join(tmpdir(), 'stage-b-authenticated-publication-'));
    const repository = resolve(parent, 'repository');
    try {
        execFileSync('git', [
            'clone', '--quiet', '--shared', '--no-checkout', STAGE_B_ROOT, repository
        ], { cwd: parent, encoding: 'utf8', windowsHide: true });
        const source = authenticatedSourceFixture(repository);
        const execution = syntheticExecution();
        const result = buildStageBResult(execution, source);
        writeStageBExecutionOutputs({
            result,
            rawOutputs: serializeStageBRawOutputs(execution),
            report: renderStageBReport(result)
        }, repository);
        assertCanonicalEqual(verifyStageBExecutionOutputs(repository), result);
    } finally {
        removeOwnedTemp(parent, tmpdir());
    }
});

test('Stage B change-row validation rejects undeclared paths, modes, statuses and duplicate rows', () => {
    const zero = '0'.repeat(40);
    const blob = '1'.repeat(40);
    const path = TRACKED_OUTPUTS[0];
    const allowed = TRACKED_OUTPUTS;
    const added = `:000000 100644 ${zero} ${blob} A\0${path}\0`;
    const changedBlob = '2'.repeat(40);
    const modified = `:100644 100644 ${blob} ${changedBlob} M\0${path}\0`;
    assert.doesNotThrow(() => validateChangeRows(parseRawDiff(added), allowed));
    assert.throws(() => validateChangeRows(parseRawDiff(modified), allowed),
        'an endpoint row must remain additive from the preregistration base');
    assert.doesNotThrow(() => validateChangeRows(parseRawDiff(modified), allowed, 'intermediate'));
    for (const raw of [
        `:000000 100644 ${zero} ${blob} A\0shared/simulation.ts\0`,
        `:000000 100755 ${zero} ${blob} A\0${path}\0`,
        `:000000 120000 ${zero} ${blob} A\0${path}\0`,
        `:100644 000000 ${blob} ${zero} D\0${path}\0`,
        `:100644 100644 ${blob} ${blob} M\0${path}\0`,
        `:000000 100644 ${zero} ${blob} R100\0${path}\0other.md\0`,
        `:000000 100644 ${zero} ${blob.slice(0, 7)} A\0${path}\0`,
        added + added
    ]) assert.throws(() => validateChangeRows(parseRawDiff(raw), allowed), raw);
});

test('Stage B range audit inspects forbidden intermediate commits, not only its endpoint', () => {
    const repository = mkdtempSync(join(tmpdir(), 'stage-b-range-test-'));
    function git(args: readonly string[], input?: string): string {
        return execFileSync('git', [...args], {
            cwd: repository, encoding: 'utf8', windowsHide: true, input
        }).trim();
    }
    function commit(message: string, parent?: string): string {
        const tree = git(['write-tree']);
        return git([
            '-c', 'user.name=Stage B isolated fixture',
            '-c', 'user.email=stage-b-fixture@example.invalid',
            'commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', message
        ]);
    }
    try {
        git(['init', '--quiet', '--object-format=sha1']);
        git(['read-tree', '--empty']);
        const base = commit('empty fixture baseline');
        const blob = git(['hash-object', '-w', '--stdin'], 'owned fixture\n');
        git(['update-index', '--add', '--cacheinfo', `100644,${blob},${TRACKED_OUTPUTS[0]}`]);
        const good = commit('allowed addition', base);
        assert.doesNotThrow(() => auditStageBRange(base, good, TRACKED_OUTPUTS, repository));

        const repairedBlob = git(['hash-object', '-w', '--stdin'], 'owned repaired fixture\n');
        git(['update-index', '--cacheinfo', `100644,${repairedBlob},${TRACKED_OUTPUTS[0]}`]);
        const repaired = commit('allowed scoped repair', good);
        assert.doesNotThrow(() => auditStageBRange(base, repaired, TRACKED_OUTPUTS, repository));

        git(['update-index', '--add', '--cacheinfo', `100644,${blob},shared/simulation.ts`]);
        const forbidden = commit('temporary prohibited path', repaired);
        git(['update-index', '--force-remove', 'shared/simulation.ts']);
        const endpoint = commit('remove prohibited path', forbidden);
        assert.equal(git(['diff', '--name-only', base, endpoint]), TRACKED_OUTPUTS[0]);
        assert.throws(() => auditStageBRange(base, endpoint, TRACKED_OUTPUTS, repository));

        git(['read-tree', `${repaired}^{tree}`]);
        git(['update-index', '--cacheinfo', `100755,${repairedBlob},${TRACKED_OUTPUTS[0]}`]);
        const wrongMode = commit('temporary executable mode', repaired);
        git(['update-index', '--cacheinfo', `100644,${repairedBlob},${TRACKED_OUTPUTS[0]}`]);
        const modeEndpoint = commit('restore regular mode', wrongMode);
        assert.equal(git(['diff', '--name-only', repaired, modeEndpoint]), '');
        assert.throws(() => auditStageBRange(base, modeEndpoint, TRACKED_OUTPUTS, repository));
    } finally {
        removeOwnedTemp(repository, tmpdir());
    }
});

test('Stage B runner accepts no widening and confines output to registered exact paths', (context) => {
    assert.deepEqual(parseStageBArgs([]), { mode: 'execute' });
    assert.deepEqual(parseStageBArgs(['--verify-result']), { mode: 'verify_result' });
    for (const args of [
        ['--seed', '1'], ['--operator', 'arbitrary'], ['--depth', '16'],
        ['--output'], ['--output', STAGE_B_RESULT_PATH],
        ['--verify-result', '--seed', '1']
    ]) assert.throws(() => parseStageBArgs(args), args.join(' '));
    for (const path of [...Object.values(STAGE_B_RAW_PATHS), STAGE_B_RESULT_PATH, STAGE_B_REPORT_PATH]) {
        assert.equal(resolveStageBOutputPath(path), resolve(path));
    }
    for (const path of [
        '', ' shared/simulation.ts', 'shared/simulation.ts',
        join('test-results/crpm-world/wp-015d2r-stage-b-v1', '..', 'escaped.jsonl'),
        'test-results/crpm-world/wp-015d2r-stage-b-v1/unregistered.jsonl',
        'test-results/crpm-world/wp-015d2r-stage-b-v1/alias-pairs.json'
    ]) assert.throws(() => resolveStageBOutputPath(path), path);

    const hardLinkRoot = mkdtempSync(join(tmpdir(), 'stage-b-hard-link-root-'));
    const hardLinkOutside = mkdtempSync(join(tmpdir(), 'stage-b-hard-link-target-'));
    try {
        const outsideFile = resolve(hardLinkOutside, 'outside.jsonl');
        const exactLink = resolve(hardLinkRoot, STAGE_B_RAW_PATHS.aliasPairs);
        mkdirSync(resolve(exactLink, '..'), { recursive: true });
        writeFileSync(outsideFile, '{}\n', 'utf8');
        linkSync(outsideFile, exactLink);
        assert.throws(() => resolveStageBOutputPath(STAGE_B_RAW_PATHS.aliasPairs, hardLinkRoot));
    } finally {
        removeOwnedTemp(hardLinkRoot, tmpdir());
        removeOwnedTemp(hardLinkOutside, tmpdir());
    }

    const fixtureRoot = mkdtempSync(join(tmpdir(), 'stage-b-output-root-'));
    const outside = mkdtempSync(join(tmpdir(), 'stage-b-output-target-'));
    const link = resolve(fixtureRoot, STAGE_B_RAW_PATHS.aliasPairs);
    mkdirSync(resolve(link, '..'), { recursive: true });
    try {
        symlinkSync(resolve(outside, 'outside.jsonl'), link, 'file');
    } catch (error) {
        removeOwnedTemp(fixtureRoot, tmpdir());
        removeOwnedTemp(outside, tmpdir());
        context.skip(`File-link creation is unavailable: ${String(error)}`);
        return;
    }
    try {
        assert.equal(lstatSync(link).isSymbolicLink(), true);
        assert.throws(() => resolveStageBOutputPath(STAGE_B_RAW_PATHS.aliasPairs, fixtureRoot));
    } finally {
        unlinkSync(link);
        removeOwnedTemp(fixtureRoot, tmpdir());
        removeOwnedTemp(outside, tmpdir());
    }
});
