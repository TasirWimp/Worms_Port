import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    SIM_RULES, V4_RULESET_ID, canonicalSimulationJson, createSimulation, terrainSolid,
    type SimulationState, type SimulationTransition
} from '../../../shared/simulation';
import {
    adaptSimulationCommand, SIMULATION_AUTHORITY_ADAPTER_ID, SIMULATION_AUTHORITY_ADAPTER_VERSION,
    SIMULATION_AUTHORITY_BLOB, WORMS_PORT_AUTHORITY_COMMIT, type AuthorityAdapterOutput
} from '../adapters/v4-authority-adapter';
import { canonicalJson, sha256Digest, sha256Text, type JsonValue } from '../canonical';
import {
    parseOrBuildOfflineWorldDesignRequest, type OfflineCommandStep,
    type OfflineWorldDesignRequest, type OfflineWorldDesignRequestPayload
} from '../design-port/validate-request';
import {
    buildRegisteredExecutionReceiptBase, verifyRegisteredExecutionReceipt,
    REGISTERED_EXECUTION_ADAPTER_CHAINS
} from '../implementation-lock';
import { TransitionWitnessSchema, WorldTransitionEdgeSchema } from '../schemas';

export const D2Q_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const D2Q_REGISTRATION_PATH = 'analysis/crpm_world/navigation/v4-command-gate-registration.json';
export const D2Q_CONTRACT_PATH = 'docs/planning/wp-015d2q-v4-command-gate-pressure-contract.md';
export const D2Q_CONTRACT_COMMIT = '79e3693073280f1f316cc9722ebb8e7532900137';
export const D2Q_REGISTRATION_DIGEST = '3afc8dd6cb51f825fc912f9247e139a14c46c27e9c3feae72b1fc4e830c5aef4';

export type D2QSourceBinding = {
    path: string; commit: string; blob: string; mode: string; sha256: string;
};
type FixedContext = Record<string, JsonValue>;
export type D2QRegistration = {
    schemaVersion: number; packageId: string; childId: string; parentFamilyId: string;
    sourceBasis: { wormsBaseCommit: string; wormsBaseTree: string; crpmFrozenCommit: string } & Record<string, JsonValue>;
    fixedContext: FixedContext;
    requestTemplate: Omit<OfflineWorldDesignRequestPayload, 'requestId' | 'sequence'>;
    cases: { caseId: string; requestId: string; step: OfflineCommandStep; sourcePrediction: string }[];
    ablations: {
        ablationId: string; omittedFieldIds: string[]; rentScope: string; primaryPair: string[];
        equalityControl?: string[]; errorOnlyControl?: string[];
    }[];
    sourceBindings: D2QSourceBinding[];
    allowedOutputs: string[]; implementationPaths: string[]; outputRoot: string;
    reportPath: string; returnPath: string; reopeningCondition: string; stopCondition: string;
};

/** JSON.parse does not reject duplicate object members, including escaped aliases. */
export function parseStrictJson(text: string): unknown {
    assert(text.length <= 32 * 1024 * 1024, 'JSON input exceeds the bounded reader size.');
    let offset = 0;
    const whitespace = () => { while (/\s/.test(text[offset] ?? '') && offset < text.length) offset++; };
    const string = (): string => {
        assert.equal(text[offset], '"', 'Expected a JSON string.');
        const start = offset++;
        while (offset < text.length) {
            const character = text[offset++];
            if (character === '\\') offset++;
            else if (character === '"') return JSON.parse(text.slice(start, offset)) as string;
        }
        throw new TypeError('Unterminated JSON string.');
    };
    const value = (depth: number): void => {
        assert(depth <= 128, 'JSON nesting exceeds the bounded reader depth.');
        whitespace();
        if (text[offset] === '{') {
            offset++; whitespace();
            const keys = new Set<string>();
            if (text[offset] !== '}') {
                while (true) {
                    whitespace();
                    const key = string();
                    assert(!keys.has(key), `Duplicate JSON key: ${key}`);
                    keys.add(key); whitespace();
                    assert.equal(text[offset++], ':', 'Expected a JSON colon.');
                    value(depth + 1); whitespace();
                    if (text[offset] !== ',') break;
                    offset++;
                }
            }
            assert.equal(text[offset++], '}', 'Expected a JSON object end.');
        } else if (text[offset] === '[') {
            offset++; whitespace();
            if (text[offset] !== ']') {
                while (true) {
                    value(depth + 1); whitespace();
                    if (text[offset] !== ',') break;
                    offset++;
                }
            }
            assert.equal(text[offset++], ']', 'Expected a JSON array end.');
        } else if (text[offset] === '"') string();
        else {
            const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(offset));
            assert(match, 'Invalid JSON primitive.');
            offset += match[0].length;
        }
    };
    value(0); whitespace();
    assert.equal(offset, text.length, 'Trailing JSON content.');
    const result: unknown = JSON.parse(text);
    canonicalJson(result); // Reject nonfinite numbers, unsafe keys and nondeterministic data.
    return result;
}

function equal(left: unknown, right: unknown): boolean {
    return canonicalJson(left) === canonicalJson(right);
}
function uniqueIds(rows: readonly { caseId: string }[]): void {
    assert.equal(new Set(rows.map((row) => row.caseId)).size, rows.length, 'Duplicate case/row identity.');
}
export function validateD2QRegistration(input: unknown): D2QRegistration {
    assert.equal(sha256Digest(input), D2Q_REGISTRATION_DIGEST, 'D2Q registration/source/domain drift.');
    const registration = input as D2QRegistration;
    uniqueIds(registration.cases);
    assert.equal(registration.cases.length, 4);
    return registration;
}
export function readD2QRegistration(): D2QRegistration {
    return validateD2QRegistration(parseStrictJson(readFileSync(resolve(D2Q_ROOT, D2Q_REGISTRATION_PATH), 'utf8')));
}
export function buildD2QRequests(registration = readD2QRegistration()): OfflineWorldDesignRequest[] {
    validateD2QRegistration(registration);
    return registration.cases.map((row) => parseOrBuildOfflineWorldDesignRequest({
        ...registration.requestTemplate, requestId: row.requestId, sequence: [row.step]
    }));
}

function gitBytes(args: readonly string[], repositoryRoot = D2Q_ROOT): Buffer {
    return execFileSync('git', [...args], { cwd: repositoryRoot, windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
}
function git(args: readonly string[], repositoryRoot = D2Q_ROOT): string {
    return gitBytes(args, repositoryRoot).toString('utf8').trim();
}
export type D2QChangeRow = {
    path: string; status: string; oldMode: string; newMode: string; oldBlob: string; newBlob: string;
};
export function parseRawDiff(text: string): D2QChangeRow[] {
    const parts = text.split('\0');
    if (parts.at(-1) === '') parts.pop();
    assert.equal(parts.length % 2, 0, 'Malformed raw Git delta.');
    const rows: D2QChangeRow[] = [];
    for (let index = 0; index < parts.length; index += 2) {
        const match = /^:(\d{6}) (\d{6}) ([0-9a-f]{40}) ([0-9a-f]{40}) ([A-Z][0-9]*)$/.exec(parts[index]);
        assert(match, 'Malformed status/mode/blob row.');
        rows.push({ path: parts[index + 1], status: match[5], oldMode: match[1], newMode: match[2], oldBlob: match[3], newBlob: match[4] });
    }
    return rows;
}
export function validateChangeRows(rows: readonly D2QChangeRow[], allowed: readonly string[]): void {
    assert.equal(new Set(rows.map((row) => row.path)).size, rows.length, 'Duplicate changed path.');
    for (const row of rows) {
        assert(allowed.includes(row.path), `Undeclared changed path: ${row.path}`);
        assert(['A', 'M'].includes(row.status), `Disallowed status: ${row.status}`);
        assert.equal(row.newMode, '100644', 'Only regular non-executable files are allowed.');
        assert.equal(row.oldMode, row.status === 'A' ? '000000' : '100644');
        assert(/^[0-9a-f]{40}$/.test(row.newBlob) && row.newBlob !== '0'.repeat(40));
        assert(/^[0-9a-f]{40}$/.test(row.oldBlob));
        assert.equal(row.oldBlob === '0'.repeat(40), row.status === 'A');
    }
}
export function auditD2QRange(base: string, result: string, allowed: readonly string[], repositoryRoot = D2Q_ROOT) {
    const baseCommit = git(['rev-parse', `${base}^{commit}`], repositoryRoot);
    const resultCommit = git(['rev-parse', `${result}^{commit}`], repositoryRoot);
    git(['merge-base', '--is-ancestor', baseCommit, resultCommit], repositoryRoot);
    const delta = (before: string, after: string) => {
        const rows = parseRawDiff(gitBytes(['diff', '--no-ext-diff', '--raw', '--no-renames', '--abbrev=40', '-z', before, after, '--'], repositoryRoot).toString('utf8'));
        validateChangeRows(rows, allowed);
        return rows;
    };
    const endpointRows = delta(baseCommit, resultCommit);
    const revisions = git(['rev-list', '--reverse', `${baseCommit}..${resultCommit}`], repositoryRoot).split('\n').filter(Boolean);
    let parent = baseCommit;
    const commits = revisions.map((commit) => {
        assert.equal(git(['show', '-s', '--format=%P', commit], repositoryRoot), parent, 'The child range must be linear and complete.');
        const record = { commit, parent, rows: delta(parent, commit) };
        parent = commit;
        return record;
    });
    assert.equal(parent, resultCommit);
    return { baseCommit, resultCommit, endpointRows, commits };
}

function binding(ref: string, path: string): D2QSourceBinding {
    const treeRow = git(['ls-tree', ref, '--', path]);
    const match = /^(100644) blob ([0-9a-f]{40})\t/.exec(treeRow);
    assert(match, `Missing or nonregular source: ${path}`);
    return { commit: ref, path, mode: match[1], blob: match[2], sha256: sha256Text(gitBytes(['show', `${ref}:${path}`]).toString('utf8')) };
}
export function verifyD2QSourceBinding(record: D2QSourceBinding): void {
    assert(equal(binding(record.commit, record.path), record), `Source identity drift: ${record.path}`);
    const fullPath = resolve(D2Q_ROOT, record.path);
    assert(lstatSync(fullPath).isFile() && !lstatSync(fullPath).isSymbolicLink(), 'Source must be a regular file.');
    assert.equal(git(['hash-object', fullPath]), record.blob, `Working source drift: ${record.path}`);
}
function sourceIdentity(registration: D2QRegistration) {
    assert.equal(git(['status', '--porcelain=v1', '--untracked-files=all']), '', 'Commit source and preserve a clean worktree before executing D2Q.');
    assert.equal(git(['rev-parse', `${registration.sourceBasis.wormsBaseCommit}^{tree}`]), registration.sourceBasis.wormsBaseTree);
    registration.sourceBindings.forEach(verifyD2QSourceBinding);
    const contract = binding(D2Q_CONTRACT_COMMIT, D2Q_CONTRACT_PATH);
    verifyD2QSourceBinding(contract);
    const committedRegistration = binding(D2Q_CONTRACT_COMMIT, D2Q_REGISTRATION_PATH);
    verifyD2QSourceBinding(committedRegistration);
    const printed = parseReport(gitBytes(['show', `${D2Q_CONTRACT_COMMIT}:${D2Q_CONTRACT_PATH}`]).toString('utf8')) as Record<string, unknown>;
    assert.equal(printed.registrationDigest, sha256Digest(registration));
    assert.equal(printed.contextDigest, sha256Digest(registration.fixedContext));
    assert.equal(printed.caseSetDigest, sha256Digest(registration.cases));
    assert.equal(printed.sourceDigest, sha256Digest(registration.sourceBindings));
    assert.equal(printed.wormsBaseCommit, registration.sourceBasis.wormsBaseCommit);
    assert.equal(printed.crpmFrozenCommit, registration.sourceBasis.crpmFrozenCommit);
    assert(equal(printed.requests, buildD2QRequests(registration).map((request) => ({ requestId: request.requestId, requestDigest: request.requestDigest }))));
    const commit = git(['log', '-1', '--format=%H', '--', ...registration.implementationPaths]);
    const paths = registration.implementationPaths.map((path) => binding(commit, path));
    paths.forEach(verifyD2QSourceBinding);
    const sourceRange = auditD2QRange(registration.sourceBasis.wormsBaseCommit, commit, registration.allowedOutputs);
    auditD2QRange(registration.sourceBasis.wormsBaseCommit, 'HEAD', registration.allowedOutputs);
    const payload = { commit, tree: git(['rev-parse', `${commit}^{tree}`]), paths, contract, committedRegistration, inheritedSources: registration.sourceBindings, sourceRange };
    return { ...payload, sourceDigest: sha256Digest(payload) };
}

export type D2QCaseEvidence = {
    caseId: string; request: OfflineWorldDesignRequest; beforeState: SimulationState;
    callerAfterState: SimulationState; commandAfter: OfflineCommandStep['command']; output: AuthorityAdapterOutput;
};
function collectEvidence(registration: D2QRegistration): D2QCaseEvidence[] {
    const requests = buildD2QRequests(registration);
    return requests.map((request, index) => {
        const step = request.sequence[0] as OfflineCommandStep;
        const state = createSimulation(3237998097, 'wizard', V4_RULESET_ID);
        const beforeState = structuredClone(state);
        const command = structuredClone(step.command);
        const output = adaptSimulationCommand(state, step.actor, command, step.expectedTurn, request.cut);
        return { caseId: registration.cases[index].caseId, request, beforeState, callerAfterState: structuredClone(state), commandAfter: command, output };
    });
}
function responseReadout(record: D2QCaseEvidence) {
    const output = record.output;
    const player = output.transition.state.units.find((unit) => unit.id === 'player');
    assert(player, 'Player state is missing.');
    return {
        accepted: output.transition.accepted, mutated: output.transition.mutated,
        error: output.transition.error ?? null,
        preStateDigest: output.preStateDigest, postStateDigest: output.postStateDigest,
        eventsDigest: output.eventsDigest, authoritativeEvents: output.transition.events,
        revision: output.transition.state.revision, playerX: player.x,
        movementRemaining: output.transition.state.movementRemaining
    };
}
/**
 * Validation-only reading of the bound source's four declarations. This never
 * submits a second authority command, and is correlated source reuse, not an
 * independent executor or an additional admitted state/request.
 */
function sourcePredictedTransition(before: SimulationState, step: OfflineCommandStep): SimulationTransition {
    const state = structuredClone(before);
    if (step.expectedTurn !== before.turn) return {
        accepted: false, mutated: false, state, events: [],
        error: { code: 'LATE_TURN', message: 'The command targets a different turn.' }
    };
    if (step.actor !== before.activeActor) return {
        accepted: false, mutated: false, state, events: [],
        error: { code: 'NOT_YOUR_TURN', message: 'The actor does not own the active turn.' }
    };
    assert(step.command.type === 'move' && step.command.direction === 1);
    const unit = state.units[0];
    const targetX = unit.x + SIM_RULES.movementStep;
    const cellX = Math.trunc(targetX / state.terrain.cellSize);
    const surfaceCell = Array.from({ length: state.terrain.height }, (_, y) => y)
        .find((y) => terrainSolid(state.terrain, cellX, y));
    assert(surfaceCell !== undefined, 'Registered move has no exact terrain surface.');
    const targetY = surfaceCell * state.terrain.cellSize - SIM_RULES.actorRadius;
    assert(targetX >= SIM_RULES.actorRadius && targetX < state.terrain.width * state.terrain.cellSize - SIM_RULES.actorRadius);
    assert(Math.abs(targetY - unit.y) <= SIM_RULES.maximumClimb);
    assert(state.movementRemaining >= SIM_RULES.movementStep && unit.alive);
    const other = state.units[1];
    assert(!other.alive || Math.abs(other.x - targetX) >= SIM_RULES.actorRadius * 2 || Math.abs(other.y - targetY) >= SIM_RULES.actorRadius * 2);
    unit.x = targetX; unit.y = targetY; unit.facing = 1;
    state.movementRemaining -= SIM_RULES.movementStep;
    state.revision++;
    return { accepted: true, mutated: true, state, events: [{ type: 'moved', actor: 'player', x: targetX, y: targetY }] };
}

function checkEvidence(registration: D2QRegistration, evidence: readonly D2QCaseEvidence[]) {
    uniqueIds(evidence);
    assert(equal(evidence.map((row) => row.caseId), registration.cases.map((row) => row.caseId)), 'Missing, extra, reordered or changed case identity.');
    const requests = buildD2QRequests(registration);
    const initial = createSimulation(3237998097, 'wizard', V4_RULESET_ID);
    return evidence.map((record, index) => {
        assert(equal(record.request, requests[index]), 'Actual request does not match preregistration.');
        assert(equal(record.beforeState, initial), 'Each case requires a fresh identical public initial state.');
        assert(equal(record.beforeState, record.callerAfterState), 'Caller-owned initial state was mutated.');
        const step = record.request.sequence[0] as OfflineCommandStep;
        assert(equal(record.commandAfter, step.command), 'Caller-owned command was mutated.');
        const output = record.output;
        WorldTransitionEdgeSchema.parse(output.edge);
        TransitionWitnessSchema.parse(output.witness);
        assert.equal(output.adapterId, SIMULATION_AUTHORITY_ADAPTER_ID);
        assert.equal(output.adapterVersion, SIMULATION_AUTHORITY_ADAPTER_VERSION);
        assert.equal(output.rulesetId, record.beforeState.rulesetId);
        assert.equal(output.rulesetVersion, record.beforeState.rulesetVersion);
        assert.equal(output.preStateJson, canonicalSimulationJson(record.beforeState));
        assert.equal(output.postStateJson, canonicalSimulationJson(output.transition.state));
        assert.equal(output.preStateDigest, sha256Text(output.preStateJson));
        assert.equal(output.postStateDigest, sha256Text(output.postStateJson));
        assert.equal(output.eventsDigest, sha256Digest(output.transition.events));
        assert.equal(output.edgeDigest, sha256Digest(output.edge));
        assert.equal(output.witnessDigest, sha256Digest(output.witness));
        assert.equal(output.edge.sourceCarrier.stateDigest, output.preStateDigest);
        assert.equal(output.edge.targetCarrier.stateDigest, output.postStateDigest);
        assert.equal(output.witness.orderedEventsDigest, output.eventsDigest);
        assert(equal(output.edge.commandOrDeclaration, { actor: step.actor, expectedTurn: step.expectedTurn, command: step.command }));
        const response = {
            accepted: output.transition.accepted, mutated: output.transition.mutated,
            preStateDigest: output.preStateDigest, postStateDigest: output.postStateDigest,
            eventsDigest: output.eventsDigest, authoritativeEvents: output.transition.events,
            ...(output.transition.error ? { error: output.transition.error } : {})
        };
        assert(equal(output.edge.response, response), 'Response differs from transition evidence.');
        assert.equal(output.witness.outputDigest, sha256Digest(response));
        assert.equal(output.witness.inputDigest, sha256Digest({
            adapterId: output.adapterId, adapterVersion: output.adapterVersion, cut: record.request.cut,
            preStateDigest: output.preStateDigest,
            commandDeclaration: { actor: step.actor, expectedTurn: step.expectedTurn, command: step.command }
        }));
        const adapter = { id: output.adapterId, version: output.adapterVersion };
        const sourceRefs = [
            `worms-port@${WORMS_PORT_AUTHORITY_COMMIT}:shared/simulation.ts`,
            `git-blob:${SIMULATION_AUTHORITY_BLOB}`,
            `source-authority-carrier:${output.preStateDigest}`,
            `target-authority-carrier:${output.postStateDigest}`
        ];
        assert(equal(output.edge.sourceRefs, sourceRefs) && equal(output.witness.sourceRefs, sourceRefs));
        assert(equal(output.edge.decoderRefs, ['authoritative-simulation-state-v1', 'authoritative-simulation-events-v1']));
        assert(equal(output.witness.decoderRefs, output.edge.decoderRefs));
        for (const [carrier, state, digest, position] of [
            [output.edge.sourceCarrier, record.beforeState, output.preStateDigest, 'pre'],
            [output.edge.targetCarrier, output.transition.state, output.postStateDigest, 'post']
        ] as const) {
            assert(equal(carrier, {
                schemaVersion: 1, profileVersion: 2, carrierKind: 'authority', adapter,
                rulesetOrConfigId: state.rulesetId,
                baselineDigest: sha256Digest({ authorityCommit: WORMS_PORT_AUTHORITY_COMMIT, simulationBlob: SIMULATION_AUTHORITY_BLOB,
                    rulesetId: state.rulesetId, rulesetVersion: state.rulesetVersion, formatVersion: state.formatVersion, seed: state.seed }),
                stateDigest: digest, revisionOrStep: state.revision,
                sourceReference: `worms-port@${WORMS_PORT_AUTHORITY_COMMIT}:shared/simulation.ts:${position}:${digest}`
            }), 'Authority carrier/source reference drift.');
        }
        const domainMotif = output.transition.accepted ? 'move' : 'rejected_command';
        const edgeIdentity = sha256Digest({ inputDigest: output.witness.inputDigest, outputDigest: output.witness.outputDigest, domainMotif });
        assert.equal(output.edge.edgeId, `authority-edge-${edgeIdentity.slice(0, 24)}`);
        assert.equal(output.witness.edgeId, output.edge.edgeId);
        assert.equal(output.edge.domainMotif, domainMotif);
        assert.equal(output.edge.edgeKind, output.transition.accepted ? 'authority-state-transition' : 'authority-rejected-transition-witness');
        assert.equal(output.witness.deduplicationIdentity, sha256Digest({
            sourceCommit: WORMS_PORT_AUTHORITY_COMMIT, simulationBlob: SIMULATION_AUTHORITY_BLOB,
            rulesetId: record.beforeState.rulesetId, seed: record.beforeState.seed, preStateDigest: output.preStateDigest,
            actor: step.actor, command: step.command, expectedTurn: step.expectedTurn
        }));
        assert.equal(output.witness.witnessId, `authority-witness-${output.witness.deduplicationIdentity.slice(0, 24)}`);
        assert(equal(output.edge.witnessReferences, [{ witnessId: output.witness.witnessId, digest: output.witnessDigest }]));
        assert.equal(output.witness.evidenceOrigin, 'authority-derived');
        assert.equal(output.witness.covarianceGroup, `simulation-authority-${record.beforeState.rulesetId}`);
        assert.equal(output.witness.status, 'exact');
        assert(equal(output.edge.carrierRefs, [sha256Digest(output.edge.sourceCarrier), sha256Digest(output.edge.targetCarrier)]));
        assert(equal(output.edge.sourceCut, record.request.cut) && equal(output.edge.targetCut, record.request.cut));
        assert(equal(output.edge.fixedFrame, {
            schemaVersion: 1,
            sourceLocks: [{ repositoryId: 'worms-port', commit: WORMS_PORT_AUTHORITY_COMMIT, paths: ['shared/simulation.ts'] }],
            baselineOrConfigId: record.beforeState.rulesetId, adapter,
            scenarioDomain: {
                schemaVersion: 1, scenarioIds: record.request.scenarioDomain.scenarioIds, actionFamilies: ['move'],
                policyFamilies: [], seeds: [record.beforeState.seed],
                constraints: ['One direct applySimulationCommand invocation under the supplied actor and expected turn.']
            },
            sourceCut: record.request.cut, targetCut: record.request.cut,
            actorOrPolicy: step.actor, expectedRevisionOrStep: record.beforeState.revision
        }), 'Authority fixed frame/source boundary drift.');
        assert.equal(output.edge.productAuthority, 'none');
        assert.equal(output.edge.authorityDefinitionMutationObserved, false);
        const readout = responseReadout(record);
        const unchangedRejection = !readout.accepted && !readout.mutated && readout.error !== null &&
            equal(output.transition.state, record.beforeState) && output.transition.events.length === 0;
        const acceptedMove = readout.accepted && readout.mutated && readout.error === null &&
            output.transition.events.length === 1 && output.transition.events[0].type === 'moved' &&
            readout.revision === record.beforeState.revision + 1 && readout.postStateDigest !== readout.preStateDigest;
        const observedClass = acceptedMove ? 'accepted_move' : unchangedRejection ? readout.error!.code : 'unexpected_response';
        const sourceReadoutMatches = equal(output.transition, sourcePredictedTransition(record.beforeState, step));
        const matched = sourceReadoutMatches && observedClass === registration.cases[index].sourcePrediction;
        return {
            caseId: record.caseId, requestDigest: record.request.requestDigest,
            verdict: matched ? 'matched_source_prediction' : 'source_prediction_not_reproduced',
            observedClass, readout, targetDigest: sha256Digest(readout),
            edgeDigest: output.edgeDigest, witnessDigest: output.witnessDigest,
            inputUnchanged: equal(record.beforeState, record.callerAfterState), sourceReadoutMatches,
            unchangedRejection, evidenceClass: 'correlated_reuse',
            mathematicalPlacementImplication: 'none', reopeningCondition: registration.reopeningCondition
        };
    });
}

type Observation = { caseId: string; value: Record<string, JsonValue> };
type Stage = { context: FixedContext; observations: Observation[] };
export type D2QStages = { ablationId: string; omittedFieldIds: string[]; full: Stage; ablated: Stage; restored: Stage };
function fullObservation(registration: D2QRegistration, record: D2QCaseEvidence): Record<string, JsonValue> {
    const step = record.request.sequence[0] as OfflineCommandStep;
    return { world: registration.fixedContext.world, initialStateDigest: record.output.preStateDigest, command: step.command, actor: step.actor, expectedTurn: step.expectedTurn };
}
export function buildD2QStages(registration: D2QRegistration, evidence: readonly D2QCaseEvidence[]): D2QStages[] {
    validateD2QRegistration(registration);
    return registration.ablations.map((declaration) => {
        const full = evidence.map((record) => ({ caseId: record.caseId, value: fullObservation(registration, record) }));
        const ablated = full.map((row) => {
            const value = structuredClone(row.value);
            declaration.omittedFieldIds.forEach((field) => { delete value[field]; });
            return { caseId: row.caseId, value };
        });
        const restored = ablated.map((row, index) => ({
            caseId: row.caseId,
            value: { ...structuredClone(row.value), ...Object.fromEntries(declaration.omittedFieldIds.map((field) => [field, full[index].value[field]])) }
        }));
        const stage = (observations: Observation[]): Stage => ({ context: structuredClone(registration.fixedContext), observations });
        return { ablationId: declaration.ablationId, omittedFieldIds: [...declaration.omittedFieldIds], full: stage(full), ablated: stage(ablated), restored: stage(restored) };
    });
}
function classify(stage: Stage, targets: ReadonlyMap<string, string>) {
    uniqueIds(stage.observations);
    const groups = new Map<string, { projectionDigest: string; memberIds: string[]; targetDigests: string[] }>();
    for (const row of stage.observations) {
        // Deliberately never hash the row/case ID or any provenance envelope as the observation.
        const key = canonicalJson(row.value);
        const target = targets.get(row.caseId);
        assert(target, 'Unknown observation row.');
        const group = groups.get(key) ?? { projectionDigest: sha256Digest(row.value), memberIds: [], targetDigests: [] };
        group.memberIds.push(row.caseId);
        group.targetDigests.push(target);
        groups.set(key, group);
    }
    const classes = [...groups.values()];
    const pairs: { caseIds: string[]; targetEqual: boolean }[] = [];
    for (const group of classes) {
        for (let left = 0; left < group.memberIds.length; left++) {
            for (let right = left + 1; right < group.memberIds.length; right++) {
                pairs.push({ caseIds: [group.memberIds[left], group.memberIds[right]], targetEqual: group.targetDigests[left] === group.targetDigests[right] });
            }
        }
    }
    return { classes, pairs, targetCongruent: pairs.every((pair) => pair.targetEqual) };
}
export function assessD2Q(registration: D2QRegistration, evidence: readonly D2QCaseEvidence[], stages = buildD2QStages(registration, evidence)) {
    validateD2QRegistration(registration);
    const caseVerdicts = checkEvidence(registration, evidence);
    assert(equal(stages.map((stage) => stage.ablationId), registration.ablations.map((row) => row.ablationId)), 'Missing, duplicate or extra ablation.');
    const expectedStages = buildD2QStages(registration, evidence);
    const targets = new Map(caseVerdicts.map((row) => [row.caseId, row.targetDigest]));
    const sourceFactsPass = caseVerdicts.every((row) => row.verdict === 'matched_source_prediction');
    const ablations = stages.map((stage, index) => {
        const expected = expectedStages[index];
        const declaration = registration.ablations[index];
        const allContexts = [stage.full.context, stage.ablated.context, stage.restored.context];
        const sameFields = (fields: readonly string[]) => allContexts.every((context) => fields.every((field) => equal(context[field] ?? null, registration.fixedContext[field])));
        const frameChecks = {
            worldCutUnchanged: sameFields(['world', 'cut']),
            targetDomainUnchanged: sameFields(['target', 'domain']),
            routeHorizonUnchanged: sameFields(['routes', 'horizon']),
            unrelatedSupportHeldFixed: sameFields(['support']),
            toleranceUnchanged: sameFields(['tolerance']),
            noHiddenOracleAdded: sameFields(['oracleInputBoundary']) &&
                equal(stage.full.observations, expected.full.observations) &&
                equal(stage.ablated.observations, expected.ablated.observations) &&
                equal(stage.restored.observations, expected.restored.observations),
            exactContextKeys: allContexts.every((context) => equal(Object.keys(context).sort(), Object.keys(registration.fixedContext).sort()))
        };
        const full = classify(stage.full, targets);
        const ablated = classify(stage.ablated, targets);
        const restored = classify(stage.restored, targets);
        const actuallyOmitted = equal(stage.omittedFieldIds, declaration.omittedFieldIds) &&
            stage.ablated.observations.every((row) => stage.omittedFieldIds.every((field) => !Object.hasOwn(row.value, field)));
        const restorationRecovers = equal(stage.full.observations, stage.restored.observations) && restored.targetCongruent;
        const aliases = ablated.pairs.filter((pair) => !pair.targetEqual);
        const framePass = Object.values(frameChecks).every(Boolean);
        const verdict = !sourceFactsPass || !framePass || !actuallyOmitted || !restorationRecovers
            ? 'blocked_source_or_domain'
            : aliases.length > 0 && full.targetCongruent ? 'target_relevant_on_declared_V4_command_gate' : 'no_omission_witness_found';
        const control = (caseIds: string[], kind: string) => {
            assert.equal(caseIds.length, 2);
            const rows = caseIds.map((caseId) => {
                const row = caseVerdicts.find((candidate) => candidate.caseId === caseId);
                assert(row, 'Control case is not registered.');
                return row;
            });
            const projectionEqual = (phase: Stage) => {
                const values = caseIds.map((caseId) => phase.observations.find((row) => row.caseId === caseId)?.value ?? null);
                return values.every((value) => value !== null) && equal(values[0], values[1]);
            };
            const fullProjectionEqual = projectionEqual(stage.full);
            const ablatedProjectionEqual = projectionEqual(stage.ablated);
            const restoredProjectionEqual = projectionEqual(stage.restored);
            const targetEqual = rows[0].targetDigest === rows[1].targetDigest;
            const postStateEqual = rows[0].readout.postStateDigest === rows[1].readout.postStateDigest;
            const errorEqual = equal(rows[0].readout.error, rows[1].readout.error);
            const eventsEqual = equal(rows[0].readout.authoritativeEvents, rows[1].readout.authoritativeEvents);
            const pairRestorationRecovers = restorationRecovers && !restoredProjectionEqual;
            const boundaryPass = sourceFactsPass && framePass && actuallyOmitted && pairRestorationRecovers;
            const errorOnlyWitness = postStateEqual && eventsEqual && !errorEqual &&
                rows.every((row) => !row.readout.accepted && !row.readout.mutated);
            const controlVerdict = !boundaryPass ? 'blocked_source_or_domain'
                : !ablatedProjectionEqual || fullProjectionEqual ? 'underdetermined'
                : targetEqual ? 'no_omission_witness_found'
                : kind === 'equal_post_state_different_error' && !errorOnlyWitness ? 'underdetermined'
                : 'target_relevant_on_declared_V4_command_gate';
            return {
                caseIds, kind, fullProjectionEqual, ablatedProjectionEqual, restoredProjectionEqual,
                targetEqual, postStateEqual, errorEqual, eventsEqual, restorationRecovers: pairRestorationRecovers,
                targetDigests: rows.map((row) => row.targetDigest), verdict: controlVerdict,
                evidenceClass: 'correlated_reuse', mathematicalPlacementImplication: 'none',
                reopeningCondition: registration.reopeningCondition
            };
        };
        return {
            ablationId: stage.ablationId, fieldId: declaration.omittedFieldIds[0], roleFamily: 'command_input_coordinate',
            omittedFieldIds: stage.omittedFieldIds, rentScope: declaration.rentScope,
            contextDigest: sha256Digest(registration.fixedContext), stageDigest: sha256Digest(stage),
            frameChecks, sourceFactsPass, actuallyOmitted, restorationRecovers,
            full, ablated, restored, aliasPairs: aliases,
            equalTargetControls: ablated.pairs.filter((pair) => pair.targetEqual),
            primaryControl: control(declaration.primaryPair, 'primary_pair'),
            equalityControl: declaration.equalityControl ? control(declaration.equalityControl, 'conditional_equal_target') : null,
            errorOnlyControl: declaration.errorOnlyControl ? control(declaration.errorOnlyControl, 'equal_post_state_different_error') : null,
            verdict, evidenceClass: 'correlated_reuse', mathematicalPlacementImplication: 'none',
            reopeningCondition: registration.reopeningCondition
        };
    });
    const byId = new Map(caseVerdicts.map((row) => [row.caseId, row]));
    const valid = byId.get('CMD-VALID-01')!;
    const turn = byId.get('CMD-TURN-01')!;
    const actor = byId.get('CMD-ACTOR-01')!;
    const both = byId.get('CMD-PRECEDENCE-01')!;
    const precedence = sourceFactsPass && valid.observedClass === 'accepted_move' &&
        turn.observedClass === 'LATE_TURN' && both.observedClass === 'LATE_TURN' &&
        actor.observedClass === 'NOT_YOUR_TURN' && turn.targetDigest === both.targetDigest &&
        actor.readout.postStateDigest === both.readout.postStateDigest && actor.targetDigest !== both.targetDigest;
    const hardGatesPass = sourceFactsPass && precedence && ablations.every((row) =>
        row.verdict === 'target_relevant_on_declared_V4_command_gate' && row.primaryControl.verdict === row.verdict &&
        (row.equalityControl === null || row.equalityControl.verdict === 'no_omission_witness_found') &&
        (row.errorOnlyControl === null || row.errorOnlyControl.verdict === row.verdict));
    return {
        caseVerdicts, ablations,
        guardPrecedence: {
            verdict: precedence ? 'expected_turn_precedes_actor_on_registered_cases' : 'not_reproduced',
            caseIds: registration.cases.map((row) => row.caseId),
            equalPostStateDifferentErrorPair: ['CMD-ACTOR-01', 'CMD-PRECEDENCE-01'],
            scope: 'The registered initial-state move declarations only; expectedTurn 1 is a future mismatch.',
            evidenceClass: 'correlated_reuse', mathematicalPlacementImplication: 'none'
        },
        hardGatesPass, analyticalDisposition: hardGatesPass ? 'structural_reference' : 'residualized',
        aimLock: 'not_tested_in_this_child', playerObservation: 'not_tested',
        d2oAuthorityGateSatisfied: false, productAuthority: 'none', mathematicalPlacementImplication: 'none',
        p5Open: false, reopeningCondition: registration.reopeningCondition
    };
}

export function runD2Q() {
    const registration = readD2QRegistration();
    const source = sourceIdentity(registration);
    const evidence = collectEvidence(registration);
    const componentAuthentication = buildRegisteredExecutionReceiptBase({
        adapterVersions: REGISTERED_EXECUTION_ADAPTER_CHAINS.v4_authority,
        profileVersion: 2, requestSchemaVersion: 2, resultSchemaVersion: 3,
        sourceLocks: evidence[0].output.edge.fixedFrame.sourceLocks,
        requestDigest: evidence[0].request.requestDigest
    });
    verifyRegisteredExecutionReceipt(componentAuthentication);
    assert(evidence.every((row) => equal(row.output.edge.fixedFrame.sourceLocks, componentAuthentication.sourceLocks)));
    const stages = buildD2QStages(registration, evidence);
    const analysis = assessD2Q(registration, evidence, stages);
    const payload = {
        schemaVersion: 1, packageId: registration.packageId, childId: registration.childId,
        registrationDigest: D2Q_REGISTRATION_DIGEST, contextDigest: sha256Digest(registration.fixedContext),
        caseSetDigest: sha256Digest(registration.cases),
        source, componentAuthentication,
        componentAuthenticationScope: 'Approved sealed component/source authentication only; not execution of the legacy result-envelope pipeline or the child v1 result receipt.',
        fixedContext: registration.fixedContext, evidence, stages, analysis,
        evidenceDigest: sha256Digest(evidence), analysisDigest: sha256Digest(analysis),
        evidenceClass: 'correlated_reuse', mathematicalPlacementImplication: 'none', productAuthority: 'none'
    };
    return { ...payload, resultDigest: sha256Digest(payload) };
}
export type D2QResult = ReturnType<typeof runD2Q>;

export function reportProjection(result: D2QResult) {
    return {
        packageId: result.packageId, childId: result.childId, sourceCommit: result.source.commit,
        sourceDigest: result.source.sourceDigest, registrationDigest: result.registrationDigest,
        contextDigest: result.contextDigest, caseSetDigest: result.caseSetDigest,
        evidenceDigest: result.evidenceDigest, analysisDigest: result.analysisDigest, resultDigest: result.resultDigest,
        cases: result.analysis.caseVerdicts,
        ablations: result.analysis.ablations.map((row) => ({
            ablationId: row.ablationId, fieldId: row.fieldId, roleFamily: row.roleFamily, rentScope: row.rentScope,
            omittedFieldIds: row.omittedFieldIds, contextDigest: row.contextDigest, stageDigest: row.stageDigest,
            fullClasses: { digest: sha256Digest(row.full), members: row.full.classes.map((group) => group.memberIds) },
            ablatedClasses: { digest: sha256Digest(row.ablated), members: row.ablated.classes.map((group) => group.memberIds) },
            restoredClasses: { digest: sha256Digest(row.restored), members: row.restored.classes.map((group) => group.memberIds) },
            aliasPairs: row.aliasPairs, equalTargetControls: row.equalTargetControls,
            primaryControl: row.primaryControl, equalityControl: row.equalityControl, errorOnlyControl: row.errorOnlyControl,
            frameChecks: row.frameChecks, sourceFactsPass: row.sourceFactsPass,
            actuallyOmitted: row.actuallyOmitted, restorationRecovers: row.restorationRecovers,
            verdict: row.verdict, evidenceClass: row.evidenceClass,
            mathematicalPlacementImplication: row.mathematicalPlacementImplication, reopeningCondition: row.reopeningCondition
        })),
        guardPrecedence: result.analysis.guardPrecedence,
        analyticalDisposition: result.analysis.analyticalDisposition, hardGatesPass: result.analysis.hardGatesPass,
        aimLock: result.analysis.aimLock, playerObservation: result.analysis.playerObservation,
        d2oAuthorityGateSatisfied: result.analysis.d2oAuthorityGateSatisfied,
        productAuthority: 'none', mathematicalPlacementImplication: 'none', p5Open: false,
        nextAction: 'Review the four case readouts and conditional actor/expectedTurn pressure before authorizing another child. No aim/fire, timing, player observation, gameplay or CRPM/P5 continuation is opened.'
    };
}
export function renderD2QReport(result: D2QResult): string {
    const projection = reportProjection(result);
    const table = projection.cases.map((row) => `| ${row.caseId} | ${row.observedClass} | ${row.readout.accepted} | ${row.readout.mutated} | ${row.verdict} |`).join('\n');
    // One digest-bound row per case/ablation avoids duplicating the raw tree.
    const compact = '{\n' + Object.entries(projection).map(([key, value]) =>
        `  ${JSON.stringify(key)}: ${Array.isArray(value) ? '[\n    ' + value.map((row) => JSON.stringify(row)).join(',\n    ') + '\n  ]' : JSON.stringify(value)}`
    ).join(',\n') + '\n}';
    const actorControl = result.analysis.ablations.find((row) => row.fieldId === 'actor');
    const turnControl = result.analysis.ablations.find((row) => row.fieldId === 'expectedTurn');
    const controlsSupported = actorControl?.primaryControl.verdict === 'target_relevant_on_declared_V4_command_gate' &&
        actorControl.equalityControl?.verdict === 'no_omission_witness_found' &&
        turnControl?.errorOnlyControl?.verdict === 'target_relevant_on_declared_V4_command_gate';
    return [
        '# WP-015D2Q V4 Actor/Turn Command-Gate Pressure Report', '',
        'Status: stopped for review. Worms_Port-owned T_COMMAND evidence only; CRPM remains frozen.', '',
        'Source-based registration and execution are distinct: all verdicts below are derived from the four exact, freshly initialized one-move records.', '',
        '| Case | Authority class | Accepted | Mutated | Case verdict |',
        '| --- | --- | --- | --- | --- |', table, '',
        controlsSupported
            ? 'Actor relevance is conditional on the matching-turn stratum. The mismatched-turn pair remains an equal-target/no-witness actor control. Expected turn also distinguishes the two rejection errors while their post-states remain equal.'
            : 'The registered conditional actor and error-only expected-turn controls were not all reproduced. Retain the scoped failures/residue below; no positive combined pressure claim is licensed.', '',
        'Full, ablated and restored observations exclude case/request IDs and provenance from decoder keys. Raw states, contexts, edges and witnesses remain digest-bound ignored evidence; the compact rows below are reproducible from committed source.', '',
        `Analytical disposition: ${projection.analyticalDisposition}. Evidence class: correlated_reuse; this is not independent empirical evidence or discovery of new gameplay behavior.`, '',
        'Aim/fire, ticks, real timing, UI/player observation, public formation, expiry, global minimality, gameplay changes and CRPM placement were not tested. D2O authority gate remains unsatisfied; ProductAuthority and mathematical placement implication are none; P5 remains closed.', '',
        '## Source-Bound Review Projection', '', '```json', compact, '```', '',
        '## Re-entry And Stop', '',
        'From Worms_Port: `node --import tsx scripts/run-v4-command-gate-pressure.ts` replays only the frozen four requests into ignored output. `node --import tsx scripts/run-v4-command-gate-pressure.ts --verify-return` checks this report, the compact return and the actual final changed-path range.', '',
        projection.nextAction, ''
    ].join('\n');
}
function parseReport(text: string): unknown {
    const blocks = [...text.matchAll(/^```json\n([\s\S]*?)^```$/gm)];
    assert.equal(blocks.length, 1, 'Report requires one unambiguous review projection.');
    return parseStrictJson(blocks[0][1]);
}
export function buildD2QReviewReturn(result: D2QResult, reportText: string, validation: Record<string, JsonValue>) {
    assert.equal(reportText, renderD2QReport(result), 'Human report is not the derived report.');
    const projection = reportProjection(result);
    assert(equal(parseReport(reportText), projection));
    const registration = readD2QRegistration();
    const payload = {
        schemaVersion: 1, packageId: 'WP-015D2Q', childId: 'WPV4-COMMAND-01A', status: 'stopped_for_review',
        source: result.source, sourceRangeDigest: sha256Digest(result.source.sourceRange),
        report: { path: registration.reportPath, sha256: sha256Text(reportText) },
        projection, parityDigest: sha256Digest(projection), validation, validationDigest: sha256Digest(validation),
        publicationBoundary: 'Containing commit/return blob and terminal range are verified after publication and emitted externally; no circular self-hash is asserted.',
        frozenCrpmCommit: registration.sourceBasis.crpmFrozenCommit,
        evidenceClass: 'correlated_reuse', mathematicalPlacementImplication: 'none', productAuthority: 'none', p5Open: false
    };
    return { ...payload, receiptDigest: sha256Digest(payload) };
}
export function verifyD2QReviewReturn(result: D2QResult, reportText: string, input: unknown): void {
    const receipt = input as ReturnType<typeof buildD2QReviewReturn>;
    assert(receipt && typeof receipt === 'object' && !Array.isArray(receipt));
    const rebuilt = buildD2QReviewReturn(result, reportText, receipt.validation);
    assert(equal(receipt, rebuilt), 'Executor/report/return or printed-digest parity failed.');
}
