import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import test from 'node:test';

import {
    LoomkeeperExecutionV10, LoomkeeperPlannerV10,
    V10_AI_MAX_ROLLOUT_TICKS, V10_AI_MAX_TOTAL_ROLLOUT_TICKS,
    V10_AI_PLANNING_TICKS, V10_AI_PLANS, V10_AI_PLANS_PER_TICK,
    type LoomkeeperCandidateV10, type LoomkeeperOperationV10, type LoomkeeperSelectionV10
} from '../../shared/loomkeeper-v10';
import { candidateAt } from '../../shared/loomkeeper-v9';
import {
    advanceSimulationTicksV10, applySimulationBarrierV10, applySimulationIntentV10,
    assertSimulationInvariantsV10, cloneSimulationV10, createSimulationV10,
    generateV10TacticalArena, hashSimulationStateV10,
    type SimulationStateV10, type SimulationTransitionV10
} from '../../shared/simulation-v10';
import { SIM_RULES, setTerrainSolid, terrainSolid, type SimulationActor } from '../../shared/simulation';

const SEEDS = [1, 2, 3, 0x13579BDF, 0xC0FFEE11, 0xDEADBEEF] as const;
const REFLECTIONS = ['generated', 'mirrored'] as const;
const OPENING_ACTORS = ['player', 'loomkeeper'] as const;
const FP = 256;
const REPORT_PATH = '.cache/assessments/wp-015d4a-v10-assessment.json';
const SOURCE_PATHS = [
    'docs/planning/wp-015d4a-v10-terrain-starts-contract.md',
    'shared/loomkeeper-v9.ts',
    'shared/loomkeeper-v10.ts',
    'shared/simulation-v9.ts',
    'shared/simulation-v10.ts',
    'tests/loomkeeper/terrain-starts-v10.assessment.ts'
] as const;

type Reflection = typeof REFLECTIONS[number];
type AssessmentOperation =
    | { kind: 'ticks'; count: number }
    | { kind: 'intent'; actor: SimulationActor; intent: Extract<LoomkeeperOperationV10, { kind: 'intent' }>['intent'];
        expectedTurn: number; expectedPhase: SimulationStateV10['phase']; expectedEpoch: number }
    | { kind: 'barrier'; barrier: Extract<LoomkeeperOperationV10, { kind: 'barrier' }>['barrier'] };
type AssessmentRecord = { operation: AssessmentOperation; stateHash: string; events: SimulationTransitionV10['events'] };

test('V10D assessment: all 24 openings retain cover, a first attack, a reply, and exact reconstruction', async t => {
    const started = performance.now();
    const rows: Array<Record<string, unknown>> = [];
    let active: Record<string, unknown> | null = null;
    let failure: string | null = null;
    try {
        for (const seed of SEEDS) for (const reflection of REFLECTIONS) for (const openingActor of OPENING_ACTORS) {
            active = { seed, reflection, openingActor };
            const generatedArena = generateV10TacticalArena(seed);
            const generated = createSimulationV10(seed, 'wizard');
            const carrier = reflection === 'generated' ? generated : reflectState(generated);
            const initial = assessmentOpening(carrier, openingActor);
            const target = otherActor(openingActor);
            const initialTerrainHash = terrainHash(initial);

            const blockedShallow = executeCandidate(initial, candidateAt(0), 'none');
            assert.equal(blockedShallow.summary.impact, 'terrain', 'the contracted shallow cover probe must meet terrain');
            assert.equal(blockedShallow.summary.targetDamage, 0, 'the shallow cover probe must not reach the opponent');

            const firstPlan = plan(initial);
            const first = executeCandidate(initial, firstPlan.candidate, firstPlan.selection.prefix);
            assert.ok(first.summary.angleMilliDegrees > 15_000 || first.summary.movementTicks > 0,
                'the selected plan must replace the blocked shallow shot with elevation or movement');
            assert.equal(first.summary.impact, target, 'the replacement plan must reach the opponent');
            assert.ok(first.summary.targetDamage > 0, 'the replacement plan must cause authoritative damage');
            assert.equal(first.state.activeActor, target, 'the responding actor must receive the next action');
            assert.equal(first.state.phase, 'action');

            const responseTerrainHash = terrainHash(first.state);
            const replyPlan = plan(first.state);
            const reply = executeCandidate(first.state, replyPlan.candidate, replyPlan.selection.prefix);
            assert.equal(responseTerrainHash, first.summary.terrainHash, 'the reply must begin on the first attack terrain');
            assert.equal(reply.summary.fired, true, 'the response must complete a legal attack');
            assert.notEqual(reply.summary.finishReason, 'simulation_limit');

            const combined = [...first.records, ...reply.records];
            const reconstructed = reconstruct(initial, combined);
            assert.equal(hashSimulationStateV10(reconstructed), hashSimulationStateV10(reply.state));
            assert.deepEqual(reconstructed, reply.state);

            const openingUnit = initial.units[openingActor === 'player' ? 0 : 1];
            const otherUnit = initial.units[openingActor === 'player' ? 1 : 0];
            rows.push({
                seed,
                seedHex: hexSeed(seed),
                profile: initial.terrainProfileId,
                generatedReflection: generatedArena.reflected,
                reflection,
                openingActor,
                openingSide: sideOf(initial, openingActor),
                openingElevation: openingUnit.yFp < otherUnit.yFp ? 'higher' : openingUnit.yFp > otherUnit.yFp ? 'lower' : 'level',
                initialHash: hashSimulationStateV10(initial),
                cover: {
                    shallowOrdinal: 0,
                    shallowImpact: blockedShallow.summary.impact,
                    shallowTargetDamage: blockedShallow.summary.targetDamage,
                    replacementOrdinal: firstPlan.selection.ordinal,
                    replacementAngleMilliDegrees: first.summary.angleMilliDegrees,
                    replacementMovementTicks: first.summary.movementTicks
                },
                first: {
                    selection: firstPlan.selection, workload: firstPlan.workload,
                    terrainChanged: first.summary.terrainHash !== initialTerrainHash,
                    ...first.summary
                },
                reply: { selection: replyPlan.selection, workload: replyPlan.workload, ...reply.summary },
                combinedRecords: combined.length,
                combinedOperationDigest: digestJson(combined),
                finalHash: hashSimulationStateV10(reply.state)
            });
        }

        assert.equal(rows.length, 24);
        const aggregate = aggregateRows(rows);
        assert.deepEqual(aggregate.profileRows, { 'open-terraces': 8, 'rising-braid': 8, 'sheltered-folds': 8 });
        assert.deepEqual(aggregate.openingActors, { loomkeeper: 12, player: 12 });
        assert.deepEqual(aggregate.openingSides, { left: 12, right: 12 });
        assert.deepEqual(aggregate.risingBraidElevatedSides, { left: 4, right: 4 });
        assert.equal(aggregate.noLegalPlans, 0);
        assert.equal(aggregate.workFailures, 0);
        assert.ok(aggregate.firstTerrainMutations > 0, 'the matrix must exercise a selected first-turn terrain mutation');
        await saveReport(rows, null, null, started);
        t.diagnostic(`assessment=${(performance.now() - started).toFixed(3)}ms openings=24 selectedTurns=48 coverProbes=24`);
    } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
        await saveReport(rows, failure, active, started);
        throw error;
    }
});

function plan(source: SimulationStateV10): {
    selection: Extract<LoomkeeperSelectionV10, { status: 'selected' }>;
    candidate: LoomkeeperCandidateV10;
    workload: { planningTicks: number; candidates: number; candidatesPerTick: number; rolloutTicks: number; maximumRolloutTicks: number };
} {
    const before = hashSimulationStateV10(source);
    const planner = new LoomkeeperPlannerV10(source);
    for (let tick = 0; tick < V10_AI_PLANNING_TICKS; tick += 1) planner.step();
    assert.equal(hashSimulationStateV10(source), before, 'planning must not mutate its source');
    assert.equal(planner.planningTicks, V10_AI_PLANNING_TICKS);
    assert.equal(planner.evaluatedCandidates, V10_AI_PLANS);
    assert.ok(planner.rolloutTicks <= V10_AI_MAX_TOTAL_ROLLOUT_TICKS);
    assert.ok(planner.maximumRolloutTicks <= V10_AI_MAX_ROLLOUT_TICKS);
    const selection = planner.selection;
    assert.notEqual(selection.status, 'work_failure');
    assert.notEqual(selection.status, 'no_legal_plan');
    if (selection.status !== 'selected') throw new Error(`V10 opening has no selected plan: ${selection.status}`);
    return {
        selection,
        candidate: planner.selectedCandidate()!,
        workload: {
            planningTicks: planner.planningTicks,
            candidates: planner.evaluatedCandidates,
            candidatesPerTick: V10_AI_PLANS_PER_TICK,
            rolloutTicks: planner.rolloutTicks,
            maximumRolloutTicks: planner.maximumRolloutTicks
        }
    };
}

function executeCandidate(
    source: SimulationStateV10,
    candidate: LoomkeeperCandidateV10,
    prefix: LoomkeeperSelectionV10['prefix']
) {
    const records: AssessmentRecord[] = [];
    const actor = source.activeActor;
    const turn = source.turn;
    const targetIndex = actor === 'player' ? 1 : 0;
    const targetStart = source.units[targetIndex].stitching;
    let state = applyAndRecord(source, { kind: 'ticks', count: V10_AI_PLANNING_TICKS }, records);
    const execution = new LoomkeeperExecutionV10(candidate, prefix, state);
    let fired = false;
    while (state.phase !== 'finished' && state.turn === turn && state.tick - source.tick < V10_AI_MAX_ROLLOUT_TICKS) {
        for (let slot = 0; slot < 8; slot += 1) {
            const next = execution.next(state);
            if (!next) break;
            const operation: AssessmentOperation = next.kind === 'intent'
                ? { kind: 'intent', actor, intent: next.intent, expectedTurn: state.turn, expectedPhase: state.phase, expectedEpoch: state.inputEpoch }
                : { kind: 'barrier', barrier: next.barrier };
            if (next.kind === 'intent' && next.intent.type === 'fire') fired = true;
            state = applyAndRecord(state, operation, records);
        }
        if (state.phase !== 'finished' && state.turn === turn) {
            state = applyAndRecord(state, { kind: 'ticks', count: 1 }, records);
        }
    }
    if (state.phase !== 'finished' && state.turn === turn) throw new Error('V10 assessment turn exceeded the inherited rollout cap.');
    assert.equal(fired, true, 'selected assessment plan must cast');
    const reconstructed = reconstruct(source, records);
    assert.equal(hashSimulationStateV10(reconstructed), hashSimulationStateV10(state));
    assert.deepEqual(reconstructed, state);
    return {
        state,
        records,
        summary: {
            ordinal: candidate.ordinal,
            relicId: candidate.relicId,
            angleMilliDegrees: candidate.angleMilliDegrees,
            powerPermille: candidate.powerPermille,
            movementTicks: candidate.movementTicks,
            jump: candidate.jump,
            fired,
            impact: state.lastProjectile?.impact ?? null,
            targetDamage: targetStart - state.units[targetIndex].stitching,
            completedTick: state.tick,
            completedTurn: state.turn,
            finishReason: state.finishReason,
            terrainHash: terrainHash(state),
            records: records.length,
            operationDigest: digestJson(records)
        }
    };
}

function applyAndRecord(state: SimulationStateV10, operation: AssessmentOperation, records: AssessmentRecord[]): SimulationStateV10 {
    const transition = applyOperation(state, operation);
    assert.equal(transition.accepted, true, `assessment operation rejected: ${operation.kind}`);
    assert.equal(transition.mutated, true, `assessment operation did not mutate: ${operation.kind}`);
    const next = transition.state;
    records.push({ operation: structuredClone(operation), stateHash: hashSimulationStateV10(next), events: structuredClone(transition.events) });
    return next;
}

function applyOperation(state: SimulationStateV10, operation: AssessmentOperation): SimulationTransitionV10 {
    if (operation.kind === 'ticks') return advanceSimulationTicksV10(state, operation.count);
    if (operation.kind === 'barrier') return applySimulationBarrierV10(state, operation.barrier);
    return applySimulationIntentV10(
        state, operation.actor, operation.intent,
        operation.expectedTurn, operation.expectedPhase, operation.expectedEpoch
    );
}

function reconstruct(initial: SimulationStateV10, records: readonly AssessmentRecord[]): SimulationStateV10 {
    let state = cloneSimulationV10(initial);
    for (const record of records) {
        const transition = applyOperation(state, record.operation);
        assert.equal(transition.accepted, true, 'reconstruction rejected a recorded operation');
        assert.equal(transition.mutated, true, 'reconstruction lost a recorded mutation');
        assert.deepEqual(transition.events, record.events, 'reconstruction changed authoritative events');
        state = transition.state;
        assert.equal(hashSimulationStateV10(state), record.stateHash, 'reconstruction changed an operation hash');
    }
    return state;
}

/** Assessment-only role transform. It cannot enter coordinator or reward proof. */
function assessmentOpening(source: SimulationStateV10, actor: SimulationActor): SimulationStateV10 {
    const state = cloneSimulationV10(source);
    state.activeActor = actor;
    state.phase = 'action';
    state.utilityUsed = false;
    state.heldDirection = 0;
    state.leaseExpiresTick = null;
    state.lastLeaseRefreshTick = null;
    state.aim = null;
    for (const unit of state.units) {
        unit.thread = 0;
        unit.lastCreditedTurn = -1;
        unit.shield = 0;
        unit.shieldExpiresTurn = null;
        unit.vxFp = 0;
        unit.vyFp = 0;
        unit.reinforcedLeap = false;
        unit.airTicks = 0;
        unit.airDrive = null;
        unit.grounded = true;
        unit.support = supportAt(state, unit);
    }
    const openingUnit = state.units[actor === 'player' ? 0 : 1];
    openingUnit.thread = 3;
    openingUnit.lastCreditedTurn = state.turn;
    assertSimulationInvariantsV10(state);
    return state;
}

/** Assessment-only mirror. Runtime generation and ranking remain untouched. */
function reflectState(source: SimulationStateV10): SimulationStateV10 {
    const state = cloneSimulationV10(source);
    const terrain = { ...state.terrain, words: new Array(state.terrain.words.length).fill(0) };
    for (let y = 0; y < state.terrain.height; y += 1) for (let x = 0; x < state.terrain.width; x += 1) {
        if (terrainSolid(state.terrain, x, y)) setTerrainSolid(terrain, state.terrain.width - 1 - x, y, true);
    }
    state.terrain = terrain;
    const worldWidthFp = state.terrain.width * state.terrain.cellSize * FP;
    for (const unit of state.units) {
        unit.xFp = worldWidthFp - unit.xFp;
        unit.facing = -unit.facing as -1 | 1;
        unit.support = supportAt(state, unit);
    }
    assertSimulationInvariantsV10(state);
    return state;
}

function supportAt(state: SimulationStateV10, unit: SimulationStateV10['units'][number]): number | null {
    const cellFp = state.terrain.cellSize * FP;
    const radiusFp = SIM_RULES.actorRadius * FP;
    const bottom = unit.yFp + radiusFp;
    if (bottom % cellFp !== 0) return null;
    const row = bottom / cellFp;
    const first = Math.max(0, Math.floor((unit.xFp - radiusFp) / cellFp));
    const last = Math.min(state.terrain.width - 1, Math.ceil((unit.xFp + radiusFp) / cellFp) - 1);
    for (let column = first; column <= last; column += 1) {
        if (terrainSolid(state.terrain, column, row)) return row * state.terrain.width + column;
    }
    return null;
}

function otherActor(actor: SimulationActor): SimulationActor { return actor === 'player' ? 'loomkeeper' : 'player'; }
function sideOf(state: SimulationStateV10, actor: SimulationActor): 'left' | 'right' {
    const own = state.units[actor === 'player' ? 0 : 1];
    const other = state.units[actor === 'player' ? 1 : 0];
    return own.xFp < other.xFp ? 'left' : 'right';
}
function terrainHash(state: SimulationStateV10): string { return digestJson(state.terrain.words); }
function digestJson(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function hexSeed(seed: number): string { return `0x${(seed >>> 0).toString(16).toUpperCase().padStart(8, '0')}`; }
function sourceCommit(): string {
    try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); }
    catch { return 'unavailable'; }
}
function sourceDigest(): string {
    const hash = createHash('sha256');
    for (const sourcePath of SOURCE_PATHS) hash.update(sourcePath).update('\0').update(readFileSync(sourcePath)).update('\0');
    return hash.digest('hex');
}

function count(rows: Array<Record<string, unknown>>, field: string): Record<string, number> {
    return Object.fromEntries([...new Set(rows.map(row => String(row[field])))].sort()
        .map(value => [value, rows.filter(row => String(row[field]) === value).length]));
}
function aggregateRows(rows: Array<Record<string, unknown>>) {
    const rising = rows.filter(row => row.profile === 'rising-braid');
    const elevated = rising.map(row => {
        const openingSide = row.openingSide as 'left' | 'right';
        if (row.openingElevation === 'higher') return openingSide;
        if (row.openingElevation === 'lower') return openingSide === 'left' ? 'right' : 'left';
        return 'level';
    });
    const selections = rows.flatMap(row => [
        (row.first as { selection: LoomkeeperSelectionV10 }).selection,
        (row.reply as { selection: LoomkeeperSelectionV10 }).selection
    ]);
    const outcome = (subset: Array<Record<string, unknown>>) => ({
        rows: subset.length,
        firstTargetDamage: subset.reduce((sum, row) => sum + Number((row.first as { targetDamage: number }).targetDamage), 0),
        replyTargetDamage: subset.reduce((sum, row) => sum + Number((row.reply as { targetDamage: number }).targetDamage), 0),
        firstTerrainMutations: subset.filter(row => (row.first as { terrainChanged: boolean }).terrainChanged).length
    });
    return {
        rows: rows.length,
        selectedTurns: selections.filter(selection => selection.status === 'selected').length,
        coverProbes: rows.length,
        firstTerrainMutations: rows.filter(row => (row.first as { terrainChanged: boolean }).terrainChanged).length,
        profileRows: count(rows, 'profile'),
        openingActors: count(rows, 'openingActor'),
        openingSides: count(rows, 'openingSide'),
        risingBraidElevatedSides: Object.fromEntries(['left', 'right'].map(side => [side, elevated.filter(value => value === side).length])),
        outcomesByOpeningSide: Object.fromEntries(['left', 'right'].map(side => [side, outcome(rows.filter(row => row.openingSide === side))])),
        outcomesByOpeningElevation: Object.fromEntries(['higher', 'level', 'lower']
            .map(elevation => [elevation, outcome(rows.filter(row => row.openingElevation === elevation))])),
        noLegalPlans: selections.filter(selection => selection.status === 'no_legal_plan').length,
        workFailures: selections.filter(selection => selection.status === 'work_failure').length
    };
}

async function saveReport(
    rows: Array<Record<string, unknown>>,
    failure: string | null,
    active: Record<string, unknown> | null,
    started: number
): Promise<void> {
    const report = {
        assessmentId: 'wp-015d4a-v10d-v1',
        sourceCommit: sourceCommit(),
        sourcePaths: SOURCE_PATHS,
        sourceDigest: sourceDigest(),
        generatedAt: new Date().toISOString(),
        runtime: { node: process.version, platform: process.platform, arch: process.arch },
        contract: {
            seeds: SEEDS.map(hexSeed), reflections: REFLECTIONS, openingActors: OPENING_ACTORS,
            plannedOpenings: 24, plannedSelectedTurns: 48, plannedCoverProbes: 24,
            planner: { plans: 180, plansPerTick: 6, planningTicks: 30, maximumRolloutTicks: 1_050, maximumTotalRolloutTicks: 189_000 }
        },
        completed: { openings: rows.length, selectedTurns: rows.length * 2, coverProbes: rows.length },
        failure: failure ? { message: failure, row: active } : null,
        rows,
        aggregate: aggregateRows(rows),
        elapsedMs: Number((performance.now() - started).toFixed(3))
    };
    await mkdir('.cache/assessments', { recursive: true });
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
