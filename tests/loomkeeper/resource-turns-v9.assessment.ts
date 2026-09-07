import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import test from 'node:test';

import { candidateAt, evaluateV9AssessmentCandidate, LoomkeeperExecutionV9, LoomkeeperPlannerV9, type LoomkeeperSelectionV9 } from '../../shared/loomkeeper-v9';
import { setTerrainSolid, terrainSolid, type PlayerCalling, type SimulationActor } from '../../shared/simulation';
import {
    advanceSimulationTicksV9, applySimulationBarrierV9, applySimulationIntentV9, assertSimulationInvariantsV9,
    cloneSimulationV9, createSimulationV9, hashSimulationStateV9, type SimulationStateV9
} from '../../shared/simulation-v9';
import { SimulationCoordinatorV9 } from '../../server/src/simulation/coordinator-v9';

const SEEDS = [1, 2, 3, 4, 17, 42, 1337, 65535, 2147483648, 4294967295] as const;
const CALLINGS = ['wizard', 'thief', 'warrior'] as const;
const PROFILES = [0, 1, 4] as const;
const FP = 256;
type Profile = (typeof PROFILES)[number];
type Scenario = { seed: number; reflected: boolean; calling: PlayerCalling; opening: SimulationActor; profile: Profile };
type Trace = { selection: LoomkeeperSelectionV9; hashes: string[]; operations: Array<{ tick: number; operation: unknown }>;
    workload: { slots: number; planningTicks: number; rolloutTicks: number; maximumRolloutTicks: number } };

test('V9D assessment: fixed 196 scenarios and 272 deterministic executions', async t => {
    const started = performance.now();
    const groupA: unknown[] = [], groupB: unknown[] = [], groupC: unknown[] = [];
    let completedExecutions = 0;
    let active: Record<string, unknown> | null = null, phase = 'group-A';
    const save = async (failure: string | null) => {
        const report = {
            assessmentId: 'wp-015d3b-v9d-v1', automationId: 'wp-015d3b-v9d-v1',
            sourceCommit: sourceCommit(), generatedAt: new Date().toISOString(),
            runtime: { node: process.version, platform: process.platform, arch: process.arch },
            contract: { domain: { A: { seeds: [...SEEDS], reflections: 2, callings: [...CALLINGS], rows: 60, executions: 120 },
                B: { seeds: [...SEEDS], reflections: 2, openings: ['player', 'loomkeeper'], profiles: [...PROFILES], rows: 120, executions: 120,
                    playerLattice: { slots: 30, chargedTicks: 30, candidatesPerTick: 1 } },
                C: { banks: [3, 4, 5, 7], stitching: [45, 46], separation: [640, 641], rows: 16, executions: 32 } },
                caps: { loomkeeperSlots: 180, planningTicks: 30, candidatesPerTick: 6, rolloutTicks: 1_050, totalRolloutTicks: 189_000, operationsPerTick: 8 } },
            planned: { scenarios: 196, executions: 272, groupA: 60, groupB: 120, groupC: 16 },
            completed: { scenarios: groupA.length + groupB.length + groupC.length, executions: completedExecutions },
            failure: failure ? { message: failure, phase, row: active } : null, failingRow: failure ? active : null, failurePhase: failure ? phase : null,
            groups: { A: groupA, B: groupB, C: groupC },
            aggregate: aggregate(groupA, groupB, groupC),
            elapsedMs: Number((performance.now() - started).toFixed(3))
        };
        await mkdir('test-results', { recursive: true });
        await writeFile('test-results/wp-015d3b-v9-assessment.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
        return report;
    };
    try {
        phase = 'group-A';
        for (const seed of SEEDS) for (const reflected of [false, true]) for (const calling of CALLINGS) {
            active = { group: 'A', seed, reflected, calling, opening: 'loomkeeper' };
            const initial = canonicalOpening(fixture(seed, calling, reflected), 'loomkeeper');
            const first = correctness(initial), second = correctness(initial);
            assert.deepEqual(first, second, 'repeated Group A trace must be identical');
            assert.equal(first.selection.status, 'selected');
            assert.ok(first.hashes.length > 0);
            groupA.push({ seed, reflection: reflected, calling, opening: 'loomkeeper', executions: 2, ...first });
            completedExecutions += 2;
        }
        assert.equal(groupA.length, 60);

        phase = 'group-B';
        for (const seed of SEEDS) for (const reflected of [false, true]) for (const opening of ['player', 'loomkeeper'] as const)
            for (const profile of PROFILES) {
                const scenario: Scenario = { seed, reflected, calling: 'wizard', opening, profile };
                active = { group: 'B', ...scenario };
                const row = fullMatch(scenario);
                assert.notEqual(row.reason, 'simulation_limit');
                assert.ok(row.ticks <= 16_800);
                assert.ok(row.planning.maximumRolloutTicks <= 1_050 && row.planning.totalRolloutTicks <= 189_000 * 16);
                groupB.push(row); completedExecutions += 1;
            }
        assert.equal(groupB.length, 120);

        phase = 'group-C';
        for (const bank of [3, 4, 5, 7]) for (const stitching of [45, 46]) for (const distance of [640, 641]) {
            active = { group: 'C', seed: 1, calling: 'wizard', opening: 'loomkeeper', bank, stitching, distance };
            const initial = thresholdFixture(bank, stitching, distance);
            const first = correctness(initial), second = correctness(initial);
            assert.deepEqual(first, second, 'repeated Group C trace must be identical');
            const expected = bank >= 4 && stitching === 45 ? 'threadguard'
                : bank >= 4 && distance === 641 ? 'threadleap' : 'none';
            assert.equal(first.selection.prefix, expected);
            groupC.push({ bank, stitching, distance, executions: 2, expectedPrefix: expected, ...first });
            completedExecutions += 2;
        }
        assert.equal(groupC.length, 16);
        assert.equal(completedExecutions, 272);
        phase = 'complete'; const report = await save(null);
        t.diagnostic(`assessment=${report.elapsedMs}ms scenarios=196 executions=272`);
    } catch (error) {
        await save(error instanceof Error ? error.message : String(error));
        throw error;
    }
});

test('V9D synthetic openings are isolated from genuine automated reward replay proof', () => {
    const synthetic = canonicalOpening(fixture(1, 'wizard', false), 'loomkeeper');
    assert.deepEqual(synthetic.units.map(unit => [unit.thread, unit.lastCreditedTurn]), [[0, -1], [3, 0]]);
    const original = fixture(1, 'wizard', false);
    assert.deepEqual(original.units.map(unit => [unit.thread, unit.lastCreditedTurn]), [[3, 0], [0, -1]]);
    const coordinator = new SimulationCoordinatorV9();
    coordinator.createAutomated('v9_assessment_genuine_01', 'v9_assessment_session_01', 1, 'wizard');
    const genuine = coordinator.replay('v9_assessment_genuine_01')!;
    const forged = structuredClone(genuine) as any;
    forged.initialStateHash = hashSimulationStateV9(synthetic);
    assert.throws(() => coordinator.reconstructAndVerify(forged, { challengeId: forged.challengeId, sessionId: forged.sessionId }));
    coordinator.dispose();
});

function correctness(initial: SimulationStateV9): Trace {
    const planner = new LoomkeeperPlannerV9(initial);
    for (let tick = 0; tick < 30; tick += 1) planner.step();
    assert.equal(planner.planningTicks, 30); assert.equal(planner.evaluatedCandidates, 180);
    assert.ok(planner.rolloutTicks <= 189_000);
    const selection = planner.selection;
    assert.notEqual(selection.status, 'work_failure');
    const scheduled = new SimulationCoordinatorV9({ nowUs: () => 0 });
    const scheduledId = 'v9_assessment_scheduled';
    scheduled.createAutomated(scheduledId, 'v9_assessment_session', initial.seed, initial.units[0].calling);
    const entry = (scheduled as any).matches.get(scheduledId);
    entry.state = cloneSimulationV9(initial);
    entry.stateHash = hashSimulationStateV9(initial);
    entry.replay.initialStateHash = entry.stateHash;
    scheduled.advance(scheduledId, 30);
    let state = advanceSimulationTicksV9(cloneSimulationV9(initial), 30).state;
    const controller = selection.status === 'selected' ? new LoomkeeperExecutionV9(planner.selectedCandidate()!, selection.prefix, state) : undefined;
    const hashes: string[] = [hashSimulationStateV9(state)], operations: Array<{ tick: number; operation: unknown }> = [];
    while (controller && state.phase !== 'finished' && state.turn === initial.turn && state.tick - initial.tick < 1_050) {
        let progressed = false;
        for (let slot = 0; slot < 8; slot += 1) {
            const op = controller.next(state); if (!op) break;
            const next = op.kind === 'intent'
                ? applySimulationIntentV9(state, state.activeActor, op.intent, state.turn, state.phase, state.inputEpoch)
                : applySimulationBarrierV9(state, op.barrier);
            assert.ok(next.accepted && next.mutated, 'detached execution emitted an illegal operation');
            operations.push({ tick: state.tick, operation: structuredClone(op) });
            state = next.state; hashes.push(hashSimulationStateV9(state)); progressed = true;
        }
        assert.equal(hashSimulationStateV9(state), scheduled.get(scheduledId)!.stateHash, 'detached and actual scheduled per-tick state');
        if (state.phase === 'finished' || state.turn !== initial.turn) break;
        state = advanceSimulationTicksV9(state, 1).state; scheduled.advance(scheduledId, 1); hashes.push(hashSimulationStateV9(state));
        if (!progressed && state.tick - initial.tick >= 1_050) throw new Error('Detached V9 execution exceeded its turn cap.');
    }
    scheduled.dispose();
    return { selection, hashes, operations, workload: { slots: planner.evaluatedCandidates, planningTicks: planner.planningTicks,
        rolloutTicks: planner.rolloutTicks, maximumRolloutTicks: planner.maximumRolloutTicks } };
}

function fullMatch(scenario: Scenario) {
    let state = canonicalOpening(fixture(scenario.seed, scenario.calling, scenario.reflected), scenario.opening);
    let plannedTurn = -1, totalRolloutTicks = 0, maxRolloutTicks = 0, maxBatchMs = 0, totalPlanningMs = 0, slots = 0, threadSpent = 0;
    const start = state.units.map(unit => unit.stitching);
    const selections: Array<{ turn: number; actor: SimulationActor; prefix: string; ordinal: number | null; status: string }> = [];
    const casts: Record<string, number> = {}, utility = { opportunities: 0, used: 0 };
    let noLegalPlans = 0, workFailures = 0, unaffordableCandidates = 0, playerSlots = 0, playerAffordableCandidates = 0;
    while (state.phase !== 'finished') {
        if (state.phase === 'action' && plannedTurn !== state.turn) {
            plannedTurn = state.turn;
            const turnStart = state.tick, actor = state.activeActor;
            let candidate = candidateAt(scenario.profile * 30), prefix: LoomkeeperSelectionV9['prefix'] = 'none';
            if (actor === 'loomkeeper') {
                const planner = new LoomkeeperPlannerV9(state);
                for (let tick = 0; tick < 30; tick += 1) { const batchStart = performance.now(); planner.step(); const elapsed = performance.now() - batchStart; totalPlanningMs += elapsed; maxBatchMs = Math.max(maxBatchMs, elapsed); }
                totalRolloutTicks += planner.rolloutTicks; maxRolloutTicks = Math.max(maxRolloutTicks, planner.maximumRolloutTicks); slots += planner.evaluatedCandidates; unaffordableCandidates += planner.unaffordableCandidates;
                if (planner.selection.status === 'work_failure') workFailures += 1;
                if (planner.selection.status === 'no_legal_plan') noLegalPlans += 1;
                assert.notEqual(planner.selection.status, 'work_failure');
                if (planner.selection.status === 'no_legal_plan') { state = advanceSimulationTicksV9(state, 30).state; continue; }
                candidate = planner.selectedCandidate()!; prefix = planner.selection.prefix;
                selections.push({ turn: state.turn, actor, prefix, ordinal: planner.selection.ordinal, status: planner.selection.status });
            } else {
                // Assessment-only player policy: a fixed script-family row has
                // one real candidate charged at every one of thirty planning
                // ticks. It is intentionally narrower than production AI.
                const lattice = Array.from({ length: 30 }, (_, slot) => candidateAt(scenario.profile * 30 + slot));
                const ownThread = state.units[0].thread;
                const affordable = lattice.filter(item => relicCost(item.relicId) <= ownThread);
                playerSlots += lattice.length; slots += lattice.length; playerAffordableCandidates += affordable.length;
                unaffordableCandidates += lattice.length - affordable.length;
                if (!affordable.length) { noLegalPlans += 1; selections.push({ turn: state.turn, actor, prefix: 'none', ordinal: null, status: 'no_legal_plan' });
                    state = advanceSimulationTicksV9(state, 30).state; continue; }
                const evaluated = lattice.map(item => evaluateV9AssessmentCandidate(state, item.ordinal));
                const ranked = evaluated.filter((item): item is NonNullable<typeof item> => !!item);
                const compare = (a: readonly number[], b: readonly number[]) => {
                    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] - a[i];
                    return 0;
                };
                ranked.sort((a, b) => compare(a.rank, b.rank));
                const chargedWork = evaluated.reduce((sum, item) => sum + (item?.logicalTicks ?? 1050), 0);
                assert.ok(chargedWork <= 31_500);
                totalRolloutTicks += chargedWork; maxRolloutTicks = Math.max(maxRolloutTicks, ...evaluated.map(item => item?.logicalTicks ?? 1050));
                if (!ranked.length) { noLegalPlans++; state = advanceSimulationTicksV9(state, 30).state; continue; }
                candidate = ranked[0].candidate;
                selections.push({ turn: state.turn, actor, prefix: 'none', ordinal: candidate.ordinal, status: 'selected' });
            }
            if (state.units[actor === 'player' ? 0 : 1].thread >= 4) utility.opportunities += 1;
            if (prefix !== 'none') utility.used += 1;
            state = advanceSimulationTicksV9(state, 30).state;
            assert.equal(state.tick, turnStart + 30, 'every assessment actor pays its charged planning window');
            const execution = new LoomkeeperExecutionV9(candidate, prefix, state);
            while (state.phase !== 'finished' && state.turn === plannedTurn && state.tick - turnStart < 1_050) {
                for (let slot = 0; slot < 8; slot += 1) {
                    const op = execution.next(state); if (!op) break;
                    const transition = op.kind === 'intent'
                        ? applySimulationIntentV9(state, actor, op.intent, state.turn, state.phase, state.inputEpoch)
                        : applySimulationBarrierV9(state, op.barrier);
                    assert.ok(transition.accepted && transition.mutated, 'assessment policy emitted an illegal operation');
                    threadSpent += state.units[actor === 'player' ? 0 : 1].thread - transition.state.units[actor === 'player' ? 0 : 1].thread;
                    if (op.kind === 'intent' && op.intent.type === 'fire') casts[candidate.relicId] = (casts[candidate.relicId] ?? 0) + 1;
                    state = transition.state;
                }
                if (state.phase !== 'finished' && state.turn === plannedTurn) state = advanceSimulationTicksV9(state, 1).state;
            }
        } else state = advanceSimulationTicksV9(state, 1).state;
        if (state.tick > 16_800) throw new Error('V9 assessment match exceeded 16,800 ticks.');
    }
    return { seed: scenario.seed, reflection: scenario.reflected, calling: scenario.calling, opening: scenario.opening,
        script: profileName(scenario.profile), initialHash: hashSimulationStateV9(canonicalOpening(fixture(scenario.seed, scenario.calling, scenario.reflected), scenario.opening)),
        finalHash: hashSimulationStateV9(state), selections, thread: { spent: threadSpent, banked: state.units.map(unit => unit.thread) },
        casts, utility, unaffordableCandidates, noLegalPlans, workFailures,
        ticks: state.tick, turns: state.turn, damage: { player: start[0] - state.units[0].stitching, loomkeeper: start[1] - state.units[1].stitching },
        winner: state.winner, reason: state.finishReason, planning: { slots, playerSlots, playerAffordableCandidates, totalPlanningMs: Number(totalPlanningMs.toFixed(3)),
            totalRolloutTicks, maximumRolloutTicks: maxRolloutTicks, maxSixSlotBatchMs: Number(maxBatchMs.toFixed(3)) } };
}

function thresholdFixture(bank: number, stitching: number, distance: number): SimulationStateV9 {
    const state = fixture(1, 'wizard', false); state.terrain.words.fill(0);
    for (let x = 0; x < 256; x += 1) for (let y = 40; y < 72; y += 1) setTerrainSolid(state.terrain, x, y, true);
    state.units[1].xFp = 480 * FP; state.units[0].xFp = (480 + distance) * FP;
    for (const unit of state.units) { unit.yFp = 308 * FP; unit.vxFp = 0; unit.vyFp = 0; unit.grounded = true; unit.airTicks = 0; unit.airDrive = null; unit.support = supportAt(state, unit); }
    const opening = canonicalOpening(state, 'loomkeeper'); opening.units[1].thread = bank; opening.units[1].stitching = stitching; opening.units[1].alive = true;
    assertSimulationInvariantsV9(opening); return opening;
}

function fixture(seed: number, calling: PlayerCalling, reflected: boolean): SimulationStateV9 {
    const state = createSimulationV9(seed, calling); if (!reflected) return state;
    const result = cloneSimulationV9(state); result.terrain = reflectTerrain(result.terrain);
    for (const unit of result.units) { unit.xFp = 2048 * FP - unit.xFp; unit.facing = -unit.facing as -1 | 1; unit.support = supportAt(result, unit); }
    assertSimulationInvariantsV9(result); return result;
}

/** Assessment-only transform. It never enters a coordinator replay or reward claim. */
function canonicalOpening(source: SimulationStateV9, opening: SimulationActor): SimulationStateV9 {
    const state = cloneSimulationV9(source); state.activeActor = opening; state.phase = 'action'; state.utilityUsed = false; state.heldDirection = 0;
    state.leaseExpiresTick = null; state.lastLeaseRefreshTick = null; state.aim = null;
    for (const unit of state.units) { unit.thread = 0; unit.lastCreditedTurn = -1; unit.shield = 0; unit.shieldExpiresTurn = null; unit.vxFp = 0; unit.vyFp = 0; unit.reinforcedLeap = false; unit.airTicks = 0; unit.airDrive = null; unit.grounded = true; unit.support = supportAt(state, unit); }
    const actor = state.units[opening === 'player' ? 0 : 1]; actor.thread = 3; actor.lastCreditedTurn = state.turn;
    assert.deepEqual(state.units.map(unit => [unit.thread, unit.lastCreditedTurn]), opening === 'player' ? [[3, 0], [0, -1]] : [[0, -1], [3, 0]]);
    assertSimulationInvariantsV9(state); return state;
}

function supportAt(state: SimulationStateV9, unit: SimulationStateV9['units'][number]): number | null {
    const bottom = unit.yFp + 12 * FP; if (bottom % (8 * FP) !== 0) return null;
    const cy = bottom / (8 * FP), first = Math.max(0, Math.floor((unit.xFp - 12 * FP) / (8 * FP))), last = Math.min(255, Math.ceil((unit.xFp + 12 * FP) / (8 * FP)) - 1);
    for (let x = first; x <= last; x += 1) if (terrainSolid(state.terrain, x, cy)) return cy * FP + x;
    return null;
}
function reflectTerrain<T extends { width: number; height: number; cellSize: number; words: number[] }>(source: T): T {
    const result = { ...source, words: new Array(source.words.length).fill(0) };
    for (let y = 0; y < source.height; y += 1) for (let x = 0; x < source.width; x += 1) if (terrainSolid(source, x, y)) setTerrainSolid(result, source.width - 1 - x, y, true);
    return result;
}
function profileName(profile: Profile): string { return profile === 0 ? 'stationary' : profile === 1 ? 'toward-90' : 'toward-90-jump'; }
function relicCost(relicId: ReturnType<typeof candidateAt>['relicId']): number { return relicId === 'threadball' ? 2 : relicId === 'needlepoint' ? 3 : 5; }
function sourceCommit(): string { try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return 'unavailable'; } }
function aggregate(a: unknown[], b: unknown[], c: unknown[]) { const full = b as Array<{ winner: string; opening: string; casts: Record<string, number>; unaffordableCandidates: number; utility: { opportunities: number; used: number }; planning: { slots: number; playerSlots: number; playerAffordableCandidates: number; maxSixSlotBatchMs: number } }>;
    return { groupCounts: { A: a.length, B: b.length, C: c.length }, outcomes: { playerWins: full.filter(row => row.winner === 'player').length, loomkeeperWins: full.filter(row => row.winner === 'loomkeeper').length, draws: full.filter(row => row.winner === 'draw').length, firstActorWins: full.filter(row => row.winner === row.opening).length }, firstActorBias: full.filter(row => row.winner === row.opening).length - full.filter(row => row.winner !== 'draw' && row.winner !== row.opening).length, expensiveCastStarvation: { spoolburstFired: full.reduce((sum, row) => sum + (row.casts.spoolburst ?? 0), 0), unaffordableCandidates: full.reduce((sum, row) => sum + row.unaffordableCandidates, 0) }, utility: { opportunities: full.reduce((sum, row) => sum + row.utility.opportunities, 0), used: full.reduce((sum, row) => sum + row.utility.used, 0) }, cpu: { maximumSixSlotBatchMs: Math.max(0, ...full.map(row => row.planning.maxSixSlotBatchMs)), totalSlots: full.reduce((sum, row) => sum + row.planning.slots, 0), playerSlots: full.reduce((sum, row) => sum + row.planning.playerSlots, 0), playerAffordableCandidates: full.reduce((sum, row) => sum + row.planning.playerAffordableCandidates, 0) } };
}
