import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
    lstatSync,
    mkdirSync,
    mkdtempSync,
    rmSync,
    rmdirSync,
    symlinkSync,
    unlinkSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import test from 'node:test';

import { canonicalJson, sha256Digest, sha256Text } from '../../analysis/crpm_world/canonical';
import { canonicalSimulationJson } from '../../shared/simulation';
import {
    assessD2Q,
    auditD2QRange,
    buildD2QRequests,
    buildD2QReviewReturn,
    buildD2QStages,
    parseRawDiff,
    parseStrictJson,
    readD2QRegistration,
    renderD2QReport,
    reportProjection,
    runD2Q,
    validateChangeRows,
    verifyD2QSourceBinding,
    verifyD2QReviewReturn,
    type D2QCaseEvidence
} from '../../analysis/crpm_world/navigation/assess-v4-command-gates';
import {
    parseD2QArgs,
    readD2QPlannedChecks,
    resolveD2QOutputPath,
    validateD2QPublicationEvidence
} from '../../scripts/run-v4-command-gate-pressure';

type MutableEvidence = Omit<D2QCaseEvidence, 'output'> & {
    output: { -readonly [K in keyof D2QCaseEvidence['output']]: D2QCaseEvidence['output'][K] };
};
type Mutable<T> = T extends D2QCaseEvidence[] ? MutableEvidence[] : T;
type D2QResult = Awaited<ReturnType<typeof runD2Q>>;

const CASE_IDS = ['CMD-VALID-01', 'CMD-TURN-01', 'CMD-ACTOR-01', 'CMD-PRECEDENCE-01'];
const REQUEST_DIGESTS = [
    'fa49c031d24229b353e644cbc50ec443948b5f97f400746d2543f4cfb0f08ec6',
    '07e846dd187260f1cef8fdc447388e6de120f35fd7a8dcb433997bf1022462f8',
    '1a61bd958905f4c08dee31b63452c0ec0722639a4fde14bbbb981aa83dee008e',
    'c2c0e7f7aea2a05eec927d9b041077d8baf1d12b8be6c8b1ad8ba84fb7d420ef'
];
const POSITIVE = 'target_relevant_on_declared_V4_command_gate';
const OUTPUT_ROOT = resolve('test-results/crpm-world/d2q-v4-command-gates');

// These tests run only after the child source commit. All mutations below are
// copies of its four registered observations, never new authority requests.
let resultPromise: Promise<D2QResult> | undefined;
function baseline(): Promise<D2QResult> {
    return resultPromise ??= Promise.resolve(runD2Q());
}

function copy<T>(value: T): Mutable<T> {
    return structuredClone(value) as Mutable<T>;
}

function removeOwnedTemp(path: string, parent: string): void {
    const absolute = resolve(path);
    const within = relative(resolve(parent), absolute);
    assert.ok(within.length > 0 && !within.startsWith('..') && !isAbsolute(within));
    rmSync(absolute, { recursive: true, force: true });
}

function rejectsOrWithdraws(
    evaluate: () => ReturnType<typeof assessD2Q>,
    ablationId?: string
): void {
    let assessment: ReturnType<typeof assessD2Q>;
    try {
        assessment = evaluate();
    } catch (error) {
        assert.ok(error instanceof Error, 'invalid evidence must fail with an explicit error');
        return;
    }
    const rows = assessment.ablations.filter((row) => !ablationId || row.ablationId === ablationId);
    assert.ok(rows.length > 0, 'a withdrawn result must retain the scoped ablation');
    for (const row of rows) {
        assert.notEqual(row.verdict, POSITIVE);
        for (const control of [row.primaryControl, row.equalityControl, row.errorOnlyControl]) {
            if (control) assert.notEqual(control.verdict, POSITIVE, 'a blocked ablation cannot retain a positive child control');
        }
    }
}

function publicationFixture(result: D2QResult) {
    const planned = readD2QPlannedChecks();
    const checks = planned.map((command) => ({ command, status: 'pass', detail: 'unit fixture only' }));
    const reviews = [{ role: 'fixture', reviewer: 'fixture', decision: 'pass', detail: 'unit fixture only' }];
    const validation = {
        sourceCommit: result.source.commit,
        checks,
        reviews,
        executionRuns: ['run_1', 'run_2'].map((runId) => ({
            runId, sourceCommit: result.source.commit, resultDigest: result.resultDigest,
            evidenceDigest: result.evidenceDigest, analysisDigest: result.analysisDigest
        }))
    };
    const workPackage = {
        id: result.packageId, status: 'complete', planned_checks: planned,
        check_results: checks, reviews
    };
    return { validation, workPackage };
}

test('D2Q strict JSON rejects ordinary, escaped and nested duplicate keys', () => {
    assert.deepEqual(parseStrictJson('{"a":1,"nested":{"a":2},"rows":[1,2]}'), {
        a: 1, nested: { a: 2 }, rows: [1, 2]
    });
    for (const text of [
        '{"actor":"player","actor":"loomkeeper"}',
        '{"actor":"player","\\u0061ctor":"loomkeeper"}',
        '{"outer":{"turn":0,"turn":1}}',
        '{"rows":[{"caseId":"one","caseId":"two"}]}',
        '{"a":1} trailing',
        '{"a":1,}',
        '[1,2,]',
        '{"a":NaN}',
        '{"a":Infinity}'
    ]) assert.throws(() => parseStrictJson(text), text);
});

test('D2Q assembles exactly four source-locked single-step requests', () => {
    const registration = readD2QRegistration();
    const requests = buildD2QRequests(registration);
    assert.equal((registration.fixedContext.domain as Record<string, unknown>).caseSetDeclaredComplete, false);
    assert.deepEqual(registration.cases.map((row) => row.caseId), CASE_IDS);
    assert.equal(requests.length, 4);
    assert.deepEqual(requests.map((request) => request.requestDigest), REQUEST_DIGESTS);
    assert.equal(new Set(requests.map((request) => request.requestId)).size, 4);
    requests.forEach((request, index) => {
        assert.equal(request.sequence.length, 1);
        const step = request.sequence[0];
        assert.equal(step.kind, 'command');
        assert.deepEqual(step, registration.cases[index].step);
        assert.deepEqual(request.seeds, [0xC0FFEE11]);
        assert.deepEqual(request.scenarioDomain.actionFamilies, ['move']);
        assert.deepEqual(request.adapter, { id: 'v4_authority', version: 2 });
        assert.deepEqual(request.cut, { id: 'authority_v4', version: 2 });
        assert.equal(request.activation, 'offline_only');
        assert.equal(request.requestVersion, 2);
        assert.equal(request.profileVersion, 2);
    });
});

test('D2Q captures fresh equal initial states and complete source-authority responses', async () => {
    const result = await baseline();
    assert.deepEqual(result.evidence.map((row) => row.caseId), CASE_IDS);
    const initial = result.evidence[0].beforeState;
    assert.equal(initial.rulesetId, 'nimble-knots-artillery-v4');
    assert.equal(initial.seed, 0xC0FFEE11);
    assert.equal(initial.turn, 0);
    assert.equal(initial.activeActor, 'player');
    assert.equal(initial.phase, 'awaiting_command');
    assert.equal(initial.revision, 0);
    assert.equal(initial.tick, 0);
    assert.equal(new Set(result.evidence.map((row) => row.output.preStateDigest)).size, 1);
    for (const record of result.evidence) {
        assert.deepEqual(record.beforeState, initial);
        assert.deepEqual(record.callerAfterState, record.beforeState);
        assert.deepEqual(record.commandAfter, { type: 'move', direction: 1 });
        assert.equal(record.output.preStateJson, canonicalSimulationJson(record.beforeState));
        assert.equal(record.output.preStateDigest, sha256Text(record.output.preStateJson));
        assert.equal(record.output.postStateJson, canonicalSimulationJson(record.output.transition.state));
        assert.equal(record.output.postStateDigest, sha256Text(record.output.postStateJson));
        assert.equal(record.output.eventsDigest, sha256Digest(record.output.transition.events));
        assert.equal(record.output.edgeDigest, sha256Digest(record.output.edge));
        assert.equal(record.output.witnessDigest, sha256Digest(record.output.witness));
        assert.equal(record.output.witness.orderedEventsDigest, record.output.eventsDigest);
    }
    for (const record of result.evidence.slice(1)) {
        assert.notStrictEqual(record.beforeState, initial, 'fresh snapshots cannot alias');
        assert.equal(record.output.transition.accepted, false);
        assert.equal(record.output.transition.mutated, false);
        assert.deepEqual(record.output.transition.events, []);
        assert.deepEqual(record.output.transition.state, initial);
        assert.equal(record.output.postStateDigest, record.output.preStateDigest);
    }
    const accepted = result.evidence[0].output.transition;
    assert.equal(accepted.accepted, true);
    assert.equal(accepted.mutated, true);
    assert.equal(accepted.error, undefined);
    assert.equal(accepted.state.revision, 1);
    assert.equal(accepted.events.length, 1);
    assert.deepEqual(accepted.events[0], {
        type: 'moved', actor: 'player',
        x: accepted.state.units[0].x, y: accepted.state.units[0].y
    });
    assert.deepEqual(result.evidence[1].output.transition.error, {
        code: 'LATE_TURN', message: 'The command targets a different turn.'
    });
    assert.deepEqual(result.evidence[2].output.transition.error, {
        code: 'NOT_YOUR_TURN', message: 'The actor does not own the active turn.'
    });
    assert.deepEqual(result.evidence[3].output.transition.error, {
        code: 'LATE_TURN', message: 'The command targets a different turn.'
    });
});

test('D2Q full, omitted and restored observations preserve exact declared decoder boundaries', async () => {
    const result = await baseline();
    const registration = readD2QRegistration();
    assert.deepEqual(result.stages, buildD2QStages(registration, result.evidence));
    assert.deepEqual(result.stages.map((row) => row.ablationId), ['ABL-ACTOR', 'ABL-EXPECTED-TURN']);
    for (const stage of result.stages) {
        assert.deepEqual(stage.full.context, registration.fixedContext);
        assert.deepEqual(stage.ablated.context, stage.full.context);
        assert.deepEqual(stage.restored.context, stage.full.context);
        assert.deepEqual(stage.omittedFieldIds, [stage.ablationId === 'ABL-ACTOR' ? 'actor' : 'expectedTurn']);
        for (const phase of [stage.full, stage.ablated, stage.restored]) {
            assert.deepEqual(phase.observations.map((row) => row.caseId), CASE_IDS);
        }
        stage.full.observations.forEach((row, index) => {
            assert.deepEqual(Object.keys(row.value).sort(), [
                'actor', 'command', 'expectedTurn', 'initialStateDigest', 'world'
            ]);
            assert.deepEqual(row.value.world, registration.fixedContext.world);
            assert.equal(row.value.initialStateDigest, result.evidence[index].output.preStateDigest);
            assert.deepEqual(row.value.command, { type: 'move', direction: 1 });
            assert.equal(row.value.actor, registration.cases[index].step.actor);
            assert.equal(row.value.expectedTurn, registration.cases[index].step.expectedTurn);
            const omitted = copy(row.value) as Record<string, unknown>;
            delete omitted[stage.omittedFieldIds[0]];
            assert.deepEqual(stage.ablated.observations[index].value, omitted);
            assert.deepEqual(stage.restored.observations[index].value, row.value);
        });
    }
});

test('D2Q derives all four verdicts, both conditional pressures and guard precedence', async () => {
    const result = await baseline();
    assert.deepEqual(result.analysis.caseVerdicts.map((row) => row.caseId), CASE_IDS);
    assert.ok(result.analysis.caseVerdicts.every((row) => row.verdict === 'matched_source_prediction'));
    assert.deepEqual(result.analysis.ablations.map((row) => [row.ablationId, row.verdict]), [
        ['ABL-ACTOR', POSITIVE], ['ABL-EXPECTED-TURN', POSITIVE]
    ]);
    assert.equal(result.analysis.guardPrecedence.verdict, 'expected_turn_precedes_actor_on_registered_cases');
    const readouts = result.analysis.caseVerdicts.map((row) => row.readout);
    assert.equal(readouts[0].error, null);
    assert.deepEqual(readouts[1], readouts[3], 'actor is masked by the earlier mismatching-turn guard');
    assert.notDeepEqual(readouts[0], readouts[2], 'actor is relevant where expected turn matches');
    assert.notDeepEqual(readouts[0], readouts[1], 'expected turn separates success from rejection');
    assert.equal(readouts[2].postStateDigest, readouts[3].postStateDigest);
    assert.equal(readouts[2].eventsDigest, readouts[3].eventsDigest);
    assert.notDeepEqual(readouts[2].error, readouts[3].error,
        'a post-state-only quotient must not erase the wrong-actor error-only split');
});

test('D2Q emits separate actor no-witness and expected-turn error-only control verdicts', async () => {
    const result = await baseline();
    const actor = result.analysis.ablations.find((row) => row.ablationId === 'ABL-ACTOR')!;
    const turn = result.analysis.ablations.find((row) => row.ablationId === 'ABL-EXPECTED-TURN')!;
    assert.deepEqual(actor.aliasPairs, [{ caseIds: ['CMD-VALID-01', 'CMD-ACTOR-01'], targetEqual: false }]);
    assert.deepEqual(actor.equalTargetControls, [{ caseIds: ['CMD-TURN-01', 'CMD-PRECEDENCE-01'], targetEqual: true }]);
    assert.deepEqual(turn.aliasPairs, [
        { caseIds: ['CMD-VALID-01', 'CMD-TURN-01'], targetEqual: false },
        { caseIds: ['CMD-ACTOR-01', 'CMD-PRECEDENCE-01'], targetEqual: false }
    ]);
    assert.deepEqual(turn.equalTargetControls, []);
    for (const row of [actor, turn]) {
        assert.equal(row.full.classes.length, 4);
        assert.equal(row.ablated.classes.length, 2);
        assert.equal(row.restored.classes.length, 4);
        assert.equal(row.primaryControl.verdict, POSITIVE);
        assert.equal(row.primaryControl.restorationRecovers, true);
        assert.equal(row.evidenceClass, 'correlated_reuse');
        assert.equal(row.mathematicalPlacementImplication, 'none');
    }
    assert.ok(actor.equalityControl);
    assert.deepEqual(actor.equalityControl.caseIds, ['CMD-TURN-01', 'CMD-PRECEDENCE-01']);
    assert.equal(actor.equalityControl.verdict, 'no_omission_witness_found');
    assert.equal(actor.equalityControl.fullProjectionEqual, false);
    assert.equal(actor.equalityControl.ablatedProjectionEqual, true);
    assert.equal(actor.equalityControl.restoredProjectionEqual, false);
    assert.equal(actor.equalityControl.targetEqual, true);
    assert.equal(actor.equalityControl.postStateEqual, true);
    assert.equal(actor.equalityControl.errorEqual, true);
    assert.equal(actor.equalityControl.restorationRecovers, true);
    assert.ok(turn.errorOnlyControl);
    assert.deepEqual(turn.errorOnlyControl.caseIds, ['CMD-ACTOR-01', 'CMD-PRECEDENCE-01']);
    assert.equal(turn.errorOnlyControl.verdict, POSITIVE);
    assert.equal(turn.errorOnlyControl.ablatedProjectionEqual, true);
    assert.equal(turn.errorOnlyControl.targetEqual, false);
    assert.equal(turn.errorOnlyControl.postStateEqual, true);
    assert.equal(turn.errorOnlyControl.errorEqual, false);
    assert.equal(turn.errorOnlyControl.eventsEqual, true);
    assert.equal(turn.errorOnlyControl.restorationRecovers, true);
    assert.equal(result.analysis.playerObservation, 'not_tested');
    assert.equal(result.analysis.d2oAuthorityGateSatisfied, false);
    assert.equal(result.analysis.p5Open, false);
});

test('D2Q assessment is deterministic, digest-bound and non-mutating', async () => {
    const result = await baseline();
    const registration = readD2QRegistration();
    const snapshots = canonicalJson([registration, result.evidence, result.stages]);
    const repeated = assessD2Q(registration, result.evidence, result.stages);
    assert.deepEqual(repeated, result.analysis);
    assert.equal(canonicalJson([registration, result.evidence, result.stages]), snapshots);
    assert.equal(result.registrationDigest, sha256Digest(registration));
    assert.equal(result.contextDigest, sha256Digest(registration.fixedContext));
    assert.equal(result.caseSetDigest, sha256Digest(registration.cases));
    assert.equal(result.evidenceDigest, sha256Digest(result.evidence));
    assert.equal(result.analysisDigest, sha256Digest(result.analysis));
    const { resultDigest, ...payload } = result;
    assert.equal(resultDigest, sha256Digest(payload));
});

test('D2Q rejects duplicate, missing, extra and renamed evidence rows', async () => {
    const result = await baseline();
    const registration = readD2QRegistration();
    for (const alter of [
        (rows: Mutable<D2QResult['evidence']>) => { rows[1] = copy(rows[0]); },
        (rows: Mutable<D2QResult['evidence']>) => { rows.pop(); },
        (rows: Mutable<D2QResult['evidence']>) => { rows.push(copy(rows[0])); },
        (rows: Mutable<D2QResult['evidence']>) => { rows[0].caseId = 'UNREGISTERED-CASE'; }
    ]) {
        const changed = copy(result.evidence);
        alter(changed);
        assert.throws(() => assessD2Q(registration, changed));
    }
});

test('D2Q withdraws pressure on source, declaration or actual initial-state drift', async () => {
    const result = await baseline();
    for (const key of ['blob', 'sha256', 'commit'] as const) {
        const registration = copy(readD2QRegistration());
        registration.sourceBindings[0][key] = '0'.repeat(key === 'sha256' ? 64 : 40);
        rejectsOrWithdraws(() => assessD2Q(registration, result.evidence));
    }
    for (const alter of [
        (rows: Mutable<D2QResult['evidence']>) => { rows[0].request.requestId = 'undeclared-request'; },
        (rows: Mutable<D2QResult['evidence']>) => { rows[0].request.requestDigest = '0'.repeat(64); },
        (rows: Mutable<D2QResult['evidence']>) => { rows[0].request.seeds[0] = 1; },
        (rows: Mutable<D2QResult['evidence']>) => {
            const step = rows[0].request.sequence[0];
            if (step.kind === 'command') step.actor = 'loomkeeper';
        },
        (rows: Mutable<D2QResult['evidence']>) => {
            const step = rows[0].request.sequence[0];
            if (step.kind === 'command') step.expectedTurn = 1;
        },
        (rows: Mutable<D2QResult['evidence']>) => {
            rows[1].beforeState = copy(rows[0].output.transition.state);
            rows[1].callerAfterState = copy(rows[1].beforeState);
        },
        (rows: Mutable<D2QResult['evidence']>) => { rows[0].callerAfterState.revision += 1; },
        (rows: Mutable<D2QResult['evidence']>) => { rows[0].commandAfter = { type: 'move', direction: -1 }; }
    ]) {
        const changed = copy(result.evidence);
        alter(changed);
        rejectsOrWithdraws(() => assessD2Q(readD2QRegistration(), changed));
    }
});

test('D2Q source authentication rejects changed actual blob, mode, digest and commit bindings', () => {
    const original = readD2QRegistration().sourceBindings[0];
    assert.doesNotThrow(() => verifyD2QSourceBinding(original));
    for (const [field, replacement] of [
        ['blob', '0'.repeat(40)], ['sha256', '0'.repeat(64)],
        ['commit', '0'.repeat(40)], ['mode', '100755']
    ]) {
        const changed = { ...original, [field]: replacement };
        assert.throws(() => verifyD2QSourceBinding(changed));
    }
});

test('D2Q registration cannot silently widen the frozen four-declaration domain', async () => {
    const result = await baseline();
    for (const operation of ['duplicate', 'missing', 'extra', 'renamed']) {
        const registration = copy(readD2QRegistration());
        if (operation === 'duplicate') registration.cases[1] = copy(registration.cases[0]);
        if (operation === 'missing') registration.cases.pop();
        if (operation === 'extra') registration.cases.push(copy(registration.cases[0]));
        if (operation === 'renamed') registration.cases[0].caseId = 'UNREGISTERED-CASE';
        assert.throws(() => buildD2QRequests(registration));
        assert.throws(() => assessD2Q(registration, result.evidence));
    }
});

test('D2Q derives frame checks from all actual full, ablated and restored context records', async () => {
    const result = await baseline();
    const registration = readD2QRegistration();
    for (const index of [0, 1]) {
        for (const phase of ['full', 'ablated', 'restored'] as const) {
            for (const key of [
                'world', 'cut', 'target', 'domain', 'routes', 'horizon',
                'support', 'tolerance', 'oracleInputBoundary'
            ]) {
                const stages = copy(result.stages);
                const context = stages[index][phase].context as Record<string, unknown>;
                context[key] = { alteredContextForNegativeControl: key };
                rejectsOrWithdraws(() => assessD2Q(registration, result.evidence, stages), stages[index].ablationId);
            }
        }
    }
});

test('D2Q rejects observation row drift and cannot restore by an asserted verdict flag', async () => {
    const result = await baseline();
    const registration = readD2QRegistration();
    for (const phase of ['full', 'ablated', 'restored'] as const) {
        for (const operation of ['duplicate', 'missing', 'extra', 'renamed']) {
            const stages = copy(result.stages);
            const rows = stages[0][phase].observations;
            if (operation === 'duplicate') rows[1] = copy(rows[0]);
            if (operation === 'missing') rows.pop();
            if (operation === 'extra') rows.push(copy(rows[0]));
            if (operation === 'renamed') rows[0].caseId = 'UNREGISTERED-CASE';
            rejectsOrWithdraws(() => assessD2Q(registration, result.evidence, stages), 'ABL-ACTOR');
        }
    }
    const missingRestoration = copy(result.stages);
    delete (missingRestoration[0].restored.observations[0].value as Record<string, unknown>).actor;
    rejectsOrWithdraws(() => assessD2Q(registration, result.evidence, missingRestoration), 'ABL-ACTOR');
    const falseRestoration = copy(result.stages);
    (falseRestoration[0].restored.observations[0].value as Record<string, unknown>).actor = 'loomkeeper';
    rejectsOrWithdraws(() => assessD2Q(registration, result.evidence, falseRestoration), 'ABL-ACTOR');
    const mislabeledOmission = copy(result.stages);
    mislabeledOmission[0].omittedFieldIds = ['expectedTurn'];
    rejectsOrWithdraws(() => assessD2Q(registration, result.evidence, mislabeledOmission), 'ABL-ACTOR');
});

test('D2Q forbids hidden case/request identity in the observational decoder', async () => {
    const result = await baseline();
    const registration = readD2QRegistration();
    for (const field of ['caseId', 'requestId', 'requestDigest', 'witnessId', 'omittedCoordinateProvenance']) {
        const stages = copy(result.stages);
        stages[0].ablated.observations.forEach((row, index) => {
            (row.value as Record<string, unknown>)[field] = `hidden-case-specific-${index}`;
        });
        rejectsOrWithdraws(() => assessD2Q(registration, result.evidence, stages), 'ABL-ACTOR');
    }
});

test('D2Q altered response, event or state evidence cannot retain a positive verdict', async () => {
    const result = await baseline();
    for (const alter of [
        (rows: Mutable<D2QResult['evidence']>) => { rows[2].output.transition.error!.message = 'forged response'; },
        (rows: Mutable<D2QResult['evidence']>) => { rows[0].output.eventsDigest = '0'.repeat(64); },
        (rows: Mutable<D2QResult['evidence']>) => { rows[0].output.transition.events = []; },
        (rows: Mutable<D2QResult['evidence']>) => { rows[0].output.transition.state.revision += 1; },
        (rows: Mutable<D2QResult['evidence']>) => { rows[0].output.edgeDigest = '0'.repeat(64); },
        (rows: Mutable<D2QResult['evidence']>) => { rows[0].output.witness.orderedEventsDigest = '0'.repeat(64); }
    ]) {
        const changed = copy(result.evidence);
        alter(changed);
        rejectsOrWithdraws(() => assessD2Q(readD2QRegistration(), changed));
    }
});

test('D2Q rejects a coherently rehashed but source-false exact error message', async () => {
    const result = await baseline();
    const changed = copy(result.evidence);
    const output = changed[2].output;
    output.transition.error!.message = 'A forged message with the unchanged registered error code.';
    const response = {
        accepted: output.transition.accepted,
        mutated: output.transition.mutated,
        preStateDigest: output.preStateDigest,
        postStateDigest: output.postStateDigest,
        eventsDigest: output.eventsDigest,
        authoritativeEvents: output.transition.events,
        error: output.transition.error!
    };
    output.edge.response = response;
    output.witness.outputDigest = sha256Digest(response);
    output.edge.edgeId = `authority-edge-${sha256Digest({
        inputDigest: output.witness.inputDigest,
        outputDigest: output.witness.outputDigest,
        domainMotif: output.edge.domainMotif
    }).slice(0, 24)}`;
    output.witness.edgeId = output.edge.edgeId;
    output.witnessDigest = sha256Digest(output.witness);
    output.edge.witnessReferences[0].digest = output.witnessDigest;
    output.edgeDigest = sha256Digest(output.edge);
    rejectsOrWithdraws(() => assessD2Q(readD2QRegistration(), changed));
});

test('D2Q rejects rehashed non-exact witnesses and detached evidence references', async () => {
    const result = await baseline();
    for (const operation of ['status', 'witness_id', 'witness_ref', 'source_ref', 'carrier_ref']) {
        const changed = copy(result.evidence);
        const output = changed[0].output;
        if (operation === 'status') output.witness.status = 'not_tested';
        if (operation === 'witness_id') {
            output.witness.witnessId = 'detached-witness';
            output.edge.witnessReferences[0].witnessId = output.witness.witnessId;
        }
        if (operation === 'source_ref') {
            output.witness.sourceRefs[0] = `worms-port@${'0'.repeat(40)}:shared/simulation.ts`;
            output.edge.sourceRefs[0] = output.witness.sourceRefs[0];
        }
        if (operation === 'carrier_ref') {
            output.edge.sourceCarrier.sourceReference = 'detached-authority-source';
            output.edge.carrierRefs = [
                sha256Digest(output.edge.sourceCarrier), sha256Digest(output.edge.targetCarrier)
            ];
        }
        output.witnessDigest = sha256Digest(output.witness);
        output.edge.witnessReferences[0].digest = operation === 'witness_ref'
            ? changed[1].output.witnessDigest : output.witnessDigest;
        output.edgeDigest = sha256Digest(output.edge);
        rejectsOrWithdraws(() => assessD2Q(readD2QRegistration(), changed));
    }
});

test('D2Q report and review receipt reproduce executor rows and printed digests exactly', async () => {
    const result = await baseline();
    const report = renderD2QReport(result);
    const validation = { scope: 'unit_test_fixture', status: 'fixture_only' };
    const receipt = buildD2QReviewReturn(result, report, validation);
    const blocks = [...report.matchAll(/^```json\n([\s\S]*?)^```$/gm)];
    assert.equal(blocks.length, 1);
    assert.deepEqual(parseStrictJson(blocks[0][1]), reportProjection(result));
    assert.deepEqual(receipt.projection, reportProjection(result));
    assert.equal(receipt.report.sha256, sha256Text(report));
    assert.equal(receipt.parityDigest, sha256Digest(receipt.projection));
    assert.equal(receipt.validationDigest, sha256Digest(validation));
    const { receiptDigest, ...payload } = receipt;
    assert.equal(receiptDigest, sha256Digest(payload));
    assert.equal(receipt.status, 'stopped_for_review');
    assert.equal(receipt.productAuthority, 'none');
    assert.equal(receipt.mathematicalPlacementImplication, 'none');
    assert.equal(receipt.evidenceClass, 'correlated_reuse');
    assert.equal(receipt.p5Open, false);
    assert.doesNotThrow(() => verifyD2QReviewReturn(result, report, receipt));
    assert.doesNotMatch(report, /WPV4-COMMAND-01 survived/);
});

test('D2Q canonical JSON round trip preserves report bytes and review-return parity', async () => {
    const original = await baseline();
    const parsed = parseStrictJson(canonicalJson(original)) as D2QResult;
    const originalReport = renderD2QReport(original);
    assert.equal(renderD2QReport(parsed), originalReport);
    assert.equal(canonicalJson(reportProjection(parsed)), canonicalJson(reportProjection(original)));
    const receipt = buildD2QReviewReturn(parsed, originalReport, {
        scope: 'unit_test_fixture', status: 'fixture_only'
    });
    assert.doesNotThrow(() => verifyD2QReviewReturn(parsed, originalReport, receipt));
});

test('D2Q blocked context produces scoped-failure prose instead of an unconditional pressure claim', async () => {
    const changed = copy(await baseline());
    changed.stages[0].ablated.context.tolerance = {
        comparison: 'Changed tolerance in a copied negative-control context.'
    };
    changed.analysis = assessD2Q(readD2QRegistration(), changed.evidence, changed.stages);
    changed.analysisDigest = sha256Digest(changed.analysis);
    const { resultDigest: _prior, ...payload } = changed;
    changed.resultDigest = sha256Digest(payload);
    assert.equal(changed.analysis.ablations[0].verdict, 'blocked_source_or_domain');
    assert.equal(changed.analysis.hardGatesPass, false);
    assert.equal(changed.analysis.analyticalDisposition, 'residualized');
    const report = renderD2QReport(changed);
    assert.match(report, /The registered conditional actor and error-only expected-turn controls were not all reproduced\./);
    assert.match(report, /Retain the scoped failures\/residue below; no positive combined pressure claim is licensed\./);
    assert.doesNotMatch(report, /Actor relevance is conditional on the matching-turn stratum\./);
    const receipt = buildD2QReviewReturn(changed, report, { scope: 'unit_test_fixture', status: 'fixture_only' });
    assert.doesNotThrow(() => verifyD2QReviewReturn(changed, report, receipt));
});

test('D2Q parity rejects printed-digest, table, receipt and duplicate/missing/extra row tampering', async () => {
    const result = await baseline();
    const report = renderD2QReport(result);
    const receipt = buildD2QReviewReturn(result, report, { scope: 'unit_test_fixture', status: 'fixture_only' });
    for (const field of [
        'sourceDigest', 'registrationDigest', 'contextDigest', 'caseSetDigest',
        'evidenceDigest', 'analysisDigest', 'resultDigest'
    ] as const) {
        const value = receipt.projection[field];
        const changed = report.replace(`"${field}": "${value}"`, `"${field}": "${'0'.repeat(64)}"`);
        assert.notEqual(changed, report);
        assert.throws(() => verifyD2QReviewReturn(result, changed, receipt));
    }
    const changedTable = report.replace('| CMD-VALID-01 | accepted_move | true | true |',
        '| CMD-VALID-01 | accepted_move | false | true |');
    assert.notEqual(changedTable, report);
    assert.throws(() => verifyD2QReviewReturn(result, changedTable, receipt));

    for (const operation of ['duplicate', 'missing', 'extra', 'verdict', 'role', 'projection_membership']) {
        const changed = copy(receipt);
        if (operation === 'duplicate') changed.projection.cases[1] = copy(changed.projection.cases[0]);
        if (operation === 'missing') changed.projection.cases.pop();
        if (operation === 'extra') changed.projection.cases.push(copy(changed.projection.cases[0]));
        if (operation === 'verdict') changed.projection.cases[0].verdict = 'source_prediction_not_reproduced';
        if (operation === 'role') changed.projection.ablations[0].roleFamily = 'unlicensed_role';
        if (operation === 'projection_membership') changed.projection.ablations[0].ablatedClasses.members[0].pop();
        changed.parityDigest = sha256Digest(changed.projection);
        const { receiptDigest: _prior, ...payload } = changed;
        changed.receiptDigest = sha256Digest(payload);
        assert.throws(() => verifyD2QReviewReturn(result, report, changed), operation);
    }
    const alteredValidation = copy(receipt);
    alteredValidation.validationDigest = '0'.repeat(64);
    assert.throws(() => verifyD2QReviewReturn(result, report, alteredValidation));
    const alteredReceiptDigest = copy(receipt);
    alteredReceiptDigest.receiptDigest = '0'.repeat(64);
    assert.throws(() => verifyD2QReviewReturn(result, report, alteredReceiptDigest));
});

test('D2Q publication requires every frozen planned check and identified passing review', async () => {
    const result = await baseline();
    const fixture = publicationFixture(result);
    assert.ok(fixture.workPackage.planned_checks.length > 0);
    assert.doesNotThrow(() => validateD2QPublicationEvidence(result, fixture.validation, fixture.workPackage));
    for (const operation of ['empty', 'missing_row', 'duplicate', 'failed', 'not_run', 'missing_property']) {
        const changed = copy(fixture);
        if (operation === 'empty') changed.validation.checks = [];
        if (operation === 'missing_row') changed.validation.checks.pop();
        if (operation === 'duplicate') changed.validation.checks[1] = copy(changed.validation.checks[0]);
        if (operation === 'failed') changed.validation.checks[0].status = 'fail';
        if (operation === 'not_run') changed.validation.checks[0].status = 'not_run';
        changed.workPackage.check_results = changed.validation.checks;
        if (operation === 'missing_property') {
            delete (changed.validation as Record<string, unknown>).checks;
            delete (changed.workPackage as Record<string, unknown>).check_results;
        }
        assert.throws(() => validateD2QPublicationEvidence(result, changed.validation, changed.workPackage), operation);
    }
    for (const operation of ['empty', 'missing_property', 'blank_identity', 'failed', 'malformed']) {
        const changed = copy(fixture);
        if (operation === 'empty') changed.validation.reviews = [];
        if (operation === 'blank_identity') changed.validation.reviews[0].reviewer = ' ';
        if (operation === 'failed') changed.validation.reviews[0].decision = 'fail';
        if (operation === 'malformed') delete (changed.validation.reviews[0] as Record<string, unknown>).role;
        changed.workPackage.reviews = changed.validation.reviews;
        if (operation === 'missing_property') {
            delete (changed.validation as Record<string, unknown>).reviews;
            delete (changed.workPackage as Record<string, unknown>).reviews;
        }
        assert.throws(() => validateD2QPublicationEvidence(result, changed.validation, changed.workPackage), operation);
    }
});

test('D2Q publication binds both process-run identities and the original planned-check set', async () => {
    const result = await baseline();
    const fixture = publicationFixture(result);
    for (const field of ['runId', 'sourceCommit', 'resultDigest', 'evidenceDigest', 'analysisDigest'] as const) {
        const changed = copy(fixture);
        changed.validation.executionRuns[0][field] = field === 'runId' ? 'run_2' : '0'.repeat(field === 'sourceCommit' ? 40 : 64);
        assert.throws(() => validateD2QPublicationEvidence(result, changed.validation, changed.workPackage), field);
    }
    for (const operation of ['missing', 'extra', 'reordered']) {
        const changed = copy(fixture);
        if (operation === 'missing') changed.validation.executionRuns.pop();
        if (operation === 'extra') changed.validation.executionRuns.push(copy(changed.validation.executionRuns[0]));
        if (operation === 'reordered') changed.validation.executionRuns.reverse();
        assert.throws(() => validateD2QPublicationEvidence(result, changed.validation, changed.workPackage), operation);
    }
    const changedSource = copy(fixture);
    changedSource.validation.sourceCommit = '0'.repeat(40);
    assert.throws(() => validateD2QPublicationEvidence(result, changedSource.validation, changedSource.workPackage));
    const widened = copy(fixture);
    widened.workPackage.planned_checks.push('unregistered additional check');
    widened.validation.checks.push({ command: 'unregistered additional check', status: 'pass', detail: 'unit fixture only' });
    widened.workPackage.check_results = widened.validation.checks;
    assert.throws(() => validateD2QPublicationEvidence(result, widened.validation, widened.workPackage));
});

test('D2Q matching and rehashed empty validation cannot pass the publication gate', async () => {
    const result = await baseline();
    const fixture = publicationFixture(result);
    const report = renderD2QReport(result);
    const receipt = copy(buildD2QReviewReturn(result, report, fixture.validation));
    receipt.validation.checks = [];
    receipt.validation.reviews = [];
    receipt.validation.executionRuns = [];
    receipt.validationDigest = sha256Digest(receipt.validation);
    const { receiptDigest: _prior, ...payload } = receipt;
    receipt.receiptDigest = sha256Digest(payload);
    fixture.workPackage.check_results = [];
    fixture.workPackage.reviews = [];
    assert.doesNotThrow(() => verifyD2QReviewReturn(result, report, receipt), 'generic parity alone permits consistent empty copies');
    assert.throws(() => validateD2QPublicationEvidence(result, receipt.validation, fixture.workPackage));
});

test('D2Q runner accepts only the fixed child and confined JSON output', () => {
    assert.ok(parseD2QArgs([]));
    assert.ok(parseD2QArgs(['--output', join(OUTPUT_ROOT, 'test-result.json')]));
    assert.deepEqual(parseD2QArgs(['--verify-return']), { mode: 'verify_return' });
    for (const args of [
        ['--seed', '1'], ['--operator', 'arbitrary'], ['--request', 'other.json'],
        ['--module', 'other'], ['--output'], ['--output', '--seed'],
        ['--output', 'one.json', '--output', 'two.json'],
        ['--verify-return', '--output', join(OUTPUT_ROOT, 'mixed-mode.json')]
    ]) assert.throws(() => parseD2QArgs(args), args.join(' '));
    assert.equal(resolveD2QOutputPath(join(OUTPUT_ROOT, 'test-result.json')), join(OUTPUT_ROOT, 'test-result.json'));
    for (const path of [
        '', ' test-results/crpm-world/d2q-v4-command-gates/result.json',
        'analysis/tactical_model/model.py',
        join(OUTPUT_ROOT, '..', 'escaped.json'),
        `${OUTPUT_ROOT}-other/result.json`, join(OUTPUT_ROOT, 'result.txt')
    ]) assert.throws(() => resolveD2QOutputPath(path), path);
});

test('D2Q output refuses a directory link or Windows junction into another root', (context) => {
    mkdirSync(OUTPUT_ROOT, { recursive: true });
    const link = mkdtempSync(join(OUTPUT_ROOT, 'owned-link-test-'));
    const outside = mkdtempSync(join(tmpdir(), 'd2q-output-test-'));
    rmdirSync(link);
    try {
        symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
        removeOwnedTemp(outside, tmpdir());
        context.skip(`Directory-link creation is unavailable: ${String(error)}`);
        return;
    }
    try {
        assert.equal(lstatSync(link).isSymbolicLink(), true);
        assert.throws(() => resolveD2QOutputPath(join(link, 'escaped.json')));
    } finally {
        unlinkSync(link);
        removeOwnedTemp(outside, tmpdir());
    }
});

test('D2Q raw change audit binds paths, statuses, modes and full blob identities', () => {
    const zero = '0'.repeat(40);
    const before = '1'.repeat(40);
    const after = '2'.repeat(40);
    const path = 'docs/planning/declared.md';
    const allowed = [path];
    const added = `:000000 100644 ${zero} ${after} A\0${path}\0`;
    const modified = `:100644 100644 ${before} ${after} M\0${path}\0`;
    assert.doesNotThrow(() => validateChangeRows(parseRawDiff(added), allowed));
    assert.doesNotThrow(() => validateChangeRows(parseRawDiff(modified), allowed));
    for (const raw of [
        `:000000 100644 ${zero} ${after} A\0shared/simulation.ts\0`,
        `:000000 100755 ${zero} ${after} A\0${path}\0`,
        `:000000 120000 ${zero} ${after} A\0${path}\0`,
        `:100755 100644 ${before} ${after} M\0${path}\0`,
        `:100644 000000 ${before} ${zero} D\0${path}\0`,
        `:100644 100644 ${before} ${after} R100\0${path}\0other.md\0`,
        `:000000 100644 ${zero} ${after.slice(0, 7)} A\0${path}\0`,
        added + added
    ]) assert.throws(() => validateChangeRows(parseRawDiff(raw), allowed), raw);
});

test('D2Q range audit inspects intermediate deltas, not only a clean endpoint', () => {
    const repository = mkdtempSync(join(tmpdir(), 'd2q-range-test-'));
    const allowed = ['docs/planning/declared.md'];
    function git(args: readonly string[], input?: string): string {
        return execFileSync('git', [...args], {
            cwd: repository, encoding: 'utf8', windowsHide: true, input
        }).trim();
    }
    function commit(message: string, parent?: string): string {
        const tree = git(['write-tree']);
        return git([
            '-c', 'user.name=D2Q isolated fixture', '-c', 'user.email=d2q-fixture@example.invalid',
            'commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', message
        ]);
    }
    try {
        git(['init', '--quiet', '--object-format=sha1']);
        git(['read-tree', '--empty']);
        const base = commit('empty fixture baseline');
        const blob = git(['hash-object', '-w', '--stdin'], 'owned test fixture\n');
        git(['update-index', '--add', '--cacheinfo', `100644,${blob},${allowed[0]}`]);
        const good = commit('allowed addition', base);
        assert.doesNotThrow(() => auditD2QRange(base, good, allowed, repository));

        git(['update-index', '--add', '--cacheinfo', `100644,${blob},shared/simulation.ts`]);
        const forbidden = commit('temporary prohibited path', good);
        git(['update-index', '--force-remove', 'shared/simulation.ts']);
        const endpoint = commit('remove prohibited path', forbidden);
        assert.equal(git(['diff', '--name-only', base, endpoint]), allowed[0]);
        assert.throws(() => auditD2QRange(base, endpoint, allowed, repository));

        git(['read-tree', `${good}^{tree}`]);
        git(['update-index', '--cacheinfo', `100755,${blob},${allowed[0]}`]);
        const wrongMode = commit('temporary executable mode', good);
        git(['update-index', '--cacheinfo', `100644,${blob},${allowed[0]}`]);
        const modeEndpoint = commit('restore regular mode', wrongMode);
        assert.equal(git(['diff', '--name-only', good, modeEndpoint]), '');
        assert.throws(() => auditD2QRange(base, modeEndpoint, allowed, repository));
    } finally {
        removeOwnedTemp(repository, tmpdir());
    }
});
