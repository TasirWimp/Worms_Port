import {
    advanceSimulationTicksV9, applySimulationBarrierV9, applySimulationIntentV9,
    assertSimulationInvariantsV9, createSimulationV9, forceSimulationLimitV9, hashSimulationStateV9, V9_RULESET_ID,
    type SimulationBarrierV9, type SimulationIntentV9, type SimulationStateV9, type SimulationTransitionV9
} from '../../../shared/simulation-v9';
import type { PlayerCalling, SimulationActor } from '../../../shared/simulation';
import {
    CoordinatorReplayV9Schema, CoordinatorReplayV9AutomatedSchema, ReplayOperationV9Schema, V9_REPLAY_LIMITS, jsonBytesV9,
    type CoordinatorReplayV9, type CoordinatorReplayV9Automated, type ReplayOperationV9
} from '../../../shared/protocol-v9';
import { V9_AUTOMATION_ID } from '../../../shared/combat-version';
import { LoomkeeperExecutionV9, LoomkeeperPlannerV9, type LoomkeeperSelectionV9 } from '../../../shared/loomkeeper-v9';

export { V9_REPLAY_LIMITS } from '../../../shared/protocol-v9';
export type { CoordinatorReplayV9 } from '../../../shared/protocol-v9';

export type CoordinatorTerminalResultV9 = {
    rulesetId: typeof V9_RULESET_ID; challengeId: string; sessionId: string;
    winner: SimulationStateV9['winner']; reason: string; tick: number; stateHash: string;
    automationId?: typeof V9_AUTOMATION_ID;
};
export type CoordinatorSnapshotV9 = {
    challengeId: string; sessionId: string; state: SimulationStateV9; stateHash: string;
    replayLength: number; paused: boolean; unavailable: boolean; terminalResult?: CoordinatorTerminalResultV9;
    automationId?: typeof V9_AUTOMATION_ID;
};
export type CoordinatorUpdateV9 = CoordinatorSnapshotV9 & { transition: SimulationTransitionV9 };
export type SimulationCoordinatorV9Options = {
    nowUs?: () => number; yieldBatch?: () => Promise<void>; tickIntervalMs?: number;
    /** Test seams may only lower frozen replay caps. */
    maxReplayRecords?: number; maxReplayBytes?: number;
    plannerFactory?: (state: SimulationStateV9) => LoomkeeperPlannerV9;
    onTransition?: (update: CoordinatorUpdateV9) => void;
    onTerminal?: (result: CoordinatorTerminalResultV9) => void;
};
type Entry = {
    replay: CoordinatorReplayV9 | CoordinatorReplayV9Automated; state: SimulationStateV9; stateHash: string; bytes: number;
    paused: boolean; unavailable: boolean; anchorUs: number; credit: bigint;
    automated: boolean; aiTurn?: number; planningElapsed?: number; planner?: LoomkeeperPlannerV9;
    planningFailed?: boolean; execution?: LoomkeeperExecutionV9;
    terminalResult?: CoordinatorTerminalResultV9; pendingTerminal?: CoordinatorTerminalResultV9;
};

/** Candidate V9 authority. Ordinary V9 foundations and tagged automated matches remain distinct. */
export class SimulationCoordinatorV9 {
    private readonly matches = new Map<string, Entry>();
    private readonly nowUs: () => number;
    private readonly yieldBatch: () => Promise<void>;
    private readonly maxRecords: number;
    private readonly maxBytes: number;
    private readonly timer?: NodeJS.Timeout;
    private ticking = false;

    public constructor(private readonly options: SimulationCoordinatorV9Options = {}) {
        this.nowUs = options.nowUs ?? (() => Number(process.hrtime.bigint() / 1000n));
        this.yieldBatch = options.yieldBatch ?? (() => new Promise(resolve => setImmediate(resolve)));
        this.maxRecords = bounded(options.maxReplayRecords ?? V9_REPLAY_LIMITS.records, 2, V9_REPLAY_LIMITS.records);
        this.maxBytes = bounded(options.maxReplayBytes ?? V9_REPLAY_LIMITS.bytes, 1024, V9_REPLAY_LIMITS.bytes);
        if (options.tickIntervalMs !== undefined) {
            bounded(options.tickIntervalMs, 1, 1000);
            this.timer = setInterval(() => { void this.pumpAll(); }, options.tickIntervalMs);
            this.timer.unref();
        }
    }

    public create(challengeId: string, sessionId: string, seed: number, calling: PlayerCalling): CoordinatorSnapshotV9 {
        if (this.matches.has(challengeId)) throw new Error('Duplicate V9 challenge.');
        const state = createState(seed, calling);
        const stateHash = hashSimulationStateV9(state);
        const replay = CoordinatorReplayV9Schema.parse({ formatVersion: 9, challengeId, sessionId, seed, calling,
            rulesetId: V9_RULESET_ID, loomkeeperPolicyId: 'nimble-knots-loomkeeper-v4',
            loomkeeperProfileId: 'standard-v9-0', initialStateHash: stateHash, records: [] });
        const entry: Entry = { replay, state, stateHash, bytes: jsonBytesV9(replay), paused: false,
            unavailable: false, anchorUs: this.clock(), credit: 0n, automated: false };
        if (entry.bytes + V9_REPLAY_LIMITS.terminalBytes > this.maxBytes) throw new Error('No terminal replay reserve.');
        this.matches.set(challengeId, entry);
        return this.snapshot(entry);
    }

    public createAutomated(challengeId: string, sessionId: string, seed: number, calling: PlayerCalling): CoordinatorSnapshotV9 & { automationId: typeof V9_AUTOMATION_ID } {
        if (this.matches.has(challengeId)) throw new Error('Duplicate V9 challenge.');
        const state = createState(seed, calling), stateHash = hashSimulationStateV9(state);
        const replay = CoordinatorReplayV9AutomatedSchema.parse({ formatVersion: 9, challengeId, sessionId, seed, calling,
            rulesetId: V9_RULESET_ID, loomkeeperPolicyId: 'nimble-knots-loomkeeper-v4', loomkeeperProfileId: 'standard-v9-0',
            automationId: V9_AUTOMATION_ID, initialStateHash: stateHash, records: [], chosenPlans: [] });
        const entry: Entry = { replay, state, stateHash, bytes: jsonBytesV9(replay), paused: false, unavailable: false,
            anchorUs: this.clock(), credit: 0n, automated: true };
        if (entry.bytes + V9_REPLAY_LIMITS.terminalBytes > this.maxBytes) throw new Error('No terminal replay reserve.');
        this.matches.set(challengeId, entry); return this.snapshot(entry) as CoordinatorSnapshotV9 & { automationId: typeof V9_AUTOMATION_ID };
    }

    public get(challengeId: string): CoordinatorSnapshotV9 | undefined {
        const entry = this.matches.get(challengeId); return entry && this.snapshot(entry);
    }

    public apply(challengeId: string, actor: SimulationActor, intent: SimulationIntentV9,
        expectedTurn: number, expectedPhase: SimulationStateV9['phase'], expectedEpoch: number): CoordinatorUpdateV9 {
        const entry = this.require(challengeId);
        const operation = ReplayOperationV9Schema.parse({ kind: 'intent', actor, intent, expectedTurn, expectedPhase, expectedEpoch });
        if (entry.paused) return this.rejected(entry, 'The match is paused.');
        const transition = applySimulationIntentV9(entry.state, actor, intent, expectedTurn, expectedPhase, expectedEpoch);
        if (transition.error?.code === 'INTENT_LIMIT') {
            this.barrier(challengeId, { reason: 'intent_limit', actor, expectedTurn, expectedEpoch });
            return { ...this.snapshot(entry), transition: { ...transition, state: structuredClone(entry.state) } };
        }
        return this.accept(entry, transition, operation);
    }

    public barrier(challengeId: string, barrier: SimulationBarrierV9): CoordinatorUpdateV9 {
        const entry = this.require(challengeId);
        const operation = ReplayOperationV9Schema.parse({ kind: 'barrier', barrier });
        if (barrier.reason === 'pause' || barrier.reason === 'resume') {
            const paused = barrier.reason === 'pause';
            const interruptingThreadleap = barrier.reason === 'pause' && entry.state.phase === 'action' &&
                entry.state.activeActor === 'player' && entry.state.units[0].reinforcedLeap &&
                barrier.actor === entry.state.activeActor && barrier.expectedTurn === entry.state.turn &&
                barrier.expectedEpoch === entry.state.inputEpoch;
            const resumingThreadleap = barrier.reason === 'resume' && entry.paused && entry.state.phase === 'action' &&
                entry.state.activeActor === 'player' && entry.state.units[0].reinforcedLeap &&
                barrier.actor === entry.state.activeActor && barrier.expectedTurn === entry.state.turn &&
                barrier.expectedEpoch === entry.state.inputEpoch;
            if (paused === entry.paused || (!interruptingThreadleap && !resumingThreadleap && (entry.state.phase !== 'action' ||
                entry.state.activeActor !== 'player' || entry.state.units.some(unit => unit.alive && !unit.grounded))) ||
                (!entry.paused && entry.credit >= 1_000_000n))
                return this.rejected(entry, 'Pause requires a stable player action with no timer debt.');
            if (resumingThreadleap) {
                const transition = this.resumeInterruptedThreadleap(entry);
                if (transition.error?.code === 'LIFECYCLE_LIMIT') return this.safety(challengeId, 'lifecycle_limit');
                return this.accept(entry, transition, operation);
            }
        }
        const transition = applySimulationBarrierV9(entry.state, barrier);
        if (transition.error?.code === 'LIFECYCLE_LIMIT') return this.safety(challengeId, 'lifecycle_limit');
        return this.accept(entry, transition, operation);
    }

    public async setPaused(challengeId: string, paused: boolean): Promise<CoordinatorSnapshotV9> {
        const entry = this.require(challengeId); if (!entry.paused) await this.catchUp(challengeId);
        if (entry.paused === paused) return this.snapshot(entry);
        const update = this.barrier(challengeId, { reason: paused ? 'pause' : 'resume', actor: 'player',
            expectedTurn: entry.state.turn, expectedEpoch: entry.state.inputEpoch });
        if (!update.transition.accepted) throw new Error(update.transition.error?.message ?? 'Pause rejected.');
        return this.snapshot(entry);
    }

    /** Test/planner transition API; V9B exposes no network path to it. */
    public advance(challengeId: string, count: number): CoordinatorUpdateV9 {
        bounded(count, 0, V9_REPLAY_LIMITS.ticks); const entry = this.require(challengeId);
        if (entry.paused) return this.rejected(entry, 'The match is paused.');
        let update = this.noop(entry);
        for (let index = 0; index < count && !entry.terminalResult; index++) {
            if (entry.automated) this.prepareAutomatedTick(entry);
            update = this.accept(entry, advanceSimulationTicksV9(entry.state, 1), { kind: 'ticks', count: 1 }, false, !entry.automated);
            if (entry.automated) update = this.drainAutomated(entry, update);
        }
        return update;
    }

    public pump(challengeId: string): CoordinatorSnapshotV9 {
        const entry = this.require(challengeId); this.accrue(entry);
        if (entry.paused || entry.terminalResult) return this.snapshot(entry);
        if (entry.credit / 1_000_000n > 30n) return this.safety(challengeId, 'clock_debt');
        const count = Math.min(6, Number(entry.credit / 1_000_000n)); entry.credit -= BigInt(count) * 1_000_000n;
        if (count) this.advance(challengeId, count); return this.snapshot(entry);
    }
    public dueTicks(challengeId: string): number { return Number(this.require(challengeId).credit / 1_000_000n); }
    public async catchUp(challengeId: string): Promise<CoordinatorSnapshotV9> {
        let snapshot = this.pump(challengeId);
        while (snapshot.state.phase !== 'finished' && !snapshot.paused && this.dueTicks(challengeId) > 0) {
            await this.yieldBatch(); if (!this.matches.has(challengeId)) throw new Error('V9 match closed during catch-up.');
            snapshot = this.pump(challengeId);
        }
        return snapshot;
    }
    public safety(challengeId: string, reason: Extract<ReplayOperationV9, { kind: 'safety' }>['reason']): CoordinatorUpdateV9 {
        const entry = this.require(challengeId); if (entry.terminalResult) return this.noop(entry);
        entry.unavailable = reason !== 'replay_limit' && reason !== 'left'; entry.paused = false; entry.credit = 0n;
        return this.accept(entry, forceSimulationLimitV9(entry.state), { kind: 'safety', reason }, true);
    }
    public replay(challengeId: string): CoordinatorReplayV9 | CoordinatorReplayV9Automated | undefined {
        const entry = this.matches.get(challengeId); return entry && structuredClone(entry.replay);
    }

    public reconstructAndVerify(input: unknown, expected?: { challengeId: string; sessionId: string }): CoordinatorSnapshotV9 {
        if (jsonBytesV9(input) > this.maxBytes) throw new Error('V9 replay byte limit exceeded.');
        const raw = input as { records?: unknown[] };
        if (!raw || !Array.isArray(raw.records) || raw.records.length > this.maxRecords) throw new Error('V9 replay record limit exceeded.');
        for (const record of raw.records) if (jsonBytesV9(record) > V9_REPLAY_LIMITS.operationBytes) throw new Error('V9 operation record byte limit exceeded.');
        if ((input as { automationId?: unknown })?.automationId === V9_AUTOMATION_ID) return this.reconstructAutomated(input, expected);
        const replay = CoordinatorReplayV9Schema.parse(input);
        if (expected && (expected.challengeId !== replay.challengeId || expected.sessionId !== replay.sessionId)) throw new Error('V9 replay ownership mismatch.');
        let totalTicks = 0;
        for (const record of replay.records) if (record.operation.kind === 'ticks') totalTicks += record.operation.count;
        if (totalTicks > V9_REPLAY_LIMITS.ticks) throw new Error('V9 replay tick limit exceeded.');
        const verifier = new SimulationCoordinatorV9({ nowUs: () => 0, maxReplayRecords: this.maxRecords, maxReplayBytes: this.maxBytes });
        try {
            const initial = verifier.create(replay.challengeId, replay.sessionId, replay.seed, replay.calling);
            if (initial.stateHash !== replay.initialStateHash) throw new Error('V9 initial hash mismatch.');
            for (let index = 0; index < replay.records.length; index++) {
                const record = replay.records[index]; if (record.index !== index) throw new Error('V9 replay index is not contiguous.');
                const before = verifier.get(replay.challengeId)!; const op = record.operation;
                if (op.kind === 'automatic') {
                    const generated = verifier.require(replay.challengeId).replay.records[index];
                    if (!generated || JSON.stringify(generated) !== JSON.stringify(record)) throw new Error('V9 automatic boundary does not match authority.');
                    continue;
                }
                if (verifier.require(replay.challengeId).replay.records[index]?.operation.kind === 'automatic') throw new Error('Missing V9 automatic boundary.');
                if (before.state.phase === 'finished') throw new Error('V9 replay extends beyond terminal state.');
                const update = op.kind === 'intent' ? verifier.apply(replay.challengeId, op.actor, op.intent as SimulationIntentV9, op.expectedTurn, op.expectedPhase, op.expectedEpoch)
                    : op.kind === 'barrier' ? verifier.barrier(replay.challengeId, op.barrier)
                        : op.kind === 'ticks' ? verifier.advance(replay.challengeId, op.count) : verifier.safety(replay.challengeId, op.reason);
                if (!update.transition.accepted || !update.transition.mutated || update.stateHash !== record.stateHash ||
                    (op.kind === 'ticks' && update.state.tick - before.state.tick !== op.count)) throw new Error(`V9 replay divergence at ${index}.`);
            }
            const result = verifier.get(replay.challengeId)!;
            if (JSON.stringify(verifier.require(replay.challengeId).replay.records) !== JSON.stringify(replay.records))
                throw new Error('V9 replay is missing or changes canonical operation boundaries.');
            return { ...result, replayLength: replay.records.length };
        } finally { verifier.dispose(); }
    }
    private reconstructAutomated(input: unknown, expected?: { challengeId: string; sessionId: string }): CoordinatorSnapshotV9 {
        const replay = CoordinatorReplayV9AutomatedSchema.parse(input);
        if (expected && (expected.challengeId !== replay.challengeId || expected.sessionId !== replay.sessionId)) throw new Error('V9 replay ownership mismatch.');
        if (replay.chosenPlans.some(plan => plan.status === 'work_failure')) throw new Error('A V9 work failure is not automated-policy proof.');
        const verifier = new SimulationCoordinatorV9({ nowUs: () => 0, maxReplayRecords: this.maxRecords, maxReplayBytes: this.maxBytes });
        try {
            const initial = verifier.createAutomated(replay.challengeId, replay.sessionId, replay.seed, replay.calling);
            if (initial.stateHash !== replay.initialStateHash) throw new Error('V9 initial hash mismatch.');
            let cursor = 0;
            while (cursor < replay.records.length) {
                const generated = verifier.require(replay.challengeId).replay.records[cursor];
                if (generated) { if (JSON.stringify(generated) !== JSON.stringify(replay.records[cursor])) throw new Error(`V9 automated replay divergence at ${cursor}.`); cursor += 1; continue; }
                const operation = replay.records[cursor].operation;
                if (operation.kind === 'automatic' || (operation.kind === 'intent' && operation.actor === 'loomkeeper') ||
                    (operation.kind === 'barrier' && operation.barrier.actor === 'loomkeeper')) throw new Error(`Missing generated V9 policy operation at ${cursor}.`);
                if (verifier.get(replay.challengeId)!.state.phase === 'finished') throw new Error('V9 replay extends beyond terminal state.');
                if (operation.kind === 'intent') verifier.apply(replay.challengeId, operation.actor, operation.intent as SimulationIntentV9, operation.expectedTurn, operation.expectedPhase, operation.expectedEpoch);
                else if (operation.kind === 'barrier') verifier.barrier(replay.challengeId, operation.barrier);
                else if (operation.kind === 'ticks') verifier.advance(replay.challengeId, operation.count);
                else verifier.safety(replay.challengeId, operation.reason);
                if (!verifier.require(replay.challengeId).replay.records[cursor]) throw new Error(`V9 replay operation did not mutate at ${cursor}.`);
            }
            const regenerated = verifier.require(replay.challengeId).replay;
            if (JSON.stringify(regenerated.records) !== JSON.stringify(replay.records) || !('chosenPlans' in regenerated) ||
                JSON.stringify(regenerated.chosenPlans) !== JSON.stringify(replay.chosenPlans)) throw new Error('V9 automated policy proof is incomplete or changed.');
            return verifier.get(replay.challengeId)!;
        } finally { verifier.dispose(); }
    }
    public takePendingTerminalResult(challengeId: string): CoordinatorTerminalResultV9 | undefined {
        const entry = this.matches.get(challengeId); const result = entry?.pendingTerminal; if (entry) entry.pendingTerminal = undefined;
        return result && structuredClone(result);
    }
    public delete(challengeId: string): boolean { return this.matches.delete(challengeId); }
    public deleteForSession(sessionId: string): void { for (const [id, entry] of this.matches) if (entry.replay.sessionId === sessionId) this.matches.delete(id); }
    public dispose(): void { if (this.timer) clearInterval(this.timer); this.matches.clear(); }

    private accept(entry: Entry, transition: SimulationTransitionV9, operation: ReplayOperationV9, reserve = false, notify = true): CoordinatorUpdateV9 {
        if (!transition.accepted || !transition.mutated) return { ...this.snapshot(entry), transition: structuredClone(transition) };
        const stateHash = hashSimulationStateV9(transition.state);
        const automatic: ReplayOperationV9[] = reserve ? [] : transition.events.filter(event => event.type === 'input_barrier').map(event =>
            event.reason === 'phase' ? { kind: 'automatic', reason: 'phase', tick: transition.state.tick, inputEpoch: transition.state.inputEpoch, phase: transition.state.phase }
                : { kind: 'automatic', reason: 'lease_expired', tick: transition.state.tick, inputEpoch: transition.state.inputEpoch });
        const last = entry.replay.records.at(-1); const coalesce = !automatic.length && operation.kind === 'ticks' && last?.operation.kind === 'ticks';
        const combined: ReplayOperationV9 = coalesce && operation.kind === 'ticks' && last!.operation.kind === 'ticks'
            ? { kind: 'ticks', count: last!.operation.count + operation.count } : operation;
        const record = { index: coalesce ? last!.index : entry.replay.records.length, operation: combined, stateHash };
        const annotations = automatic.map((item, index) => ({ index: record.index + index + 1, operation: item, stateHash }));
        const bytes = entry.bytes + jsonBytesV9(record) - (coalesce ? jsonBytesV9(last) : 0) + (!coalesce && entry.replay.records.length ? 1 : 0)
            + annotations.reduce((total, item) => total + jsonBytesV9(item) + 1, 0);
        if (jsonBytesV9(record) > V9_REPLAY_LIMITS.operationBytes || entry.replay.records.length + (coalesce ? 0 : 1) + annotations.length > this.maxRecords - (reserve ? 0 : 1) ||
            bytes > this.maxBytes - (reserve ? 0 : V9_REPLAY_LIMITS.terminalBytes)) {
            if (reserve) throw new Error('V9 terminal reserve invariant violated.'); return this.safety(entry.replay.challengeId, 'replay_limit');
        }
        const oldPhase = entry.state.phase; entry.state = transition.state; entry.stateHash = stateHash; entry.bytes = bytes;
        if (operation.kind === 'barrier' && (operation.barrier.reason === 'pause' || operation.barrier.reason === 'resume')) {
            entry.paused = operation.barrier.reason === 'pause'; entry.anchorUs = this.clock(); entry.credit = 0n;
        }
        if (coalesce) entry.replay.records[entry.replay.records.length - 1] = record; else entry.replay.records.push(record);
        entry.replay.records.push(...annotations);
        if (entry.state.phase === 'finished' && !entry.terminalResult) {
            entry.terminalResult = { rulesetId: V9_RULESET_ID, challengeId: entry.replay.challengeId, sessionId: entry.replay.sessionId,
                winner: entry.state.winner, reason: entry.state.finishReason!, tick: entry.state.tick, stateHash,
                ...(entry.automated ? { automationId: V9_AUTOMATION_ID } : {}) };
            entry.pendingTerminal = entry.terminalResult; this.options.onTerminal?.(structuredClone(entry.terminalResult));
        }
        const update = { ...this.snapshot(entry), transition: structuredClone(transition) };
        if (notify && (operation.kind !== 'ticks' || entry.state.tick % 3 === 0 || oldPhase !== entry.state.phase || transition.events.some(event => event.type === 'phase_changed'))) this.options.onTransition?.(update);
        return update;
    }
    private snapshot(entry: Entry): CoordinatorSnapshotV9 { return { challengeId: entry.replay.challengeId, sessionId: entry.replay.sessionId, state: structuredClone(entry.state), stateHash: entry.stateHash, replayLength: entry.replay.records.length, paused: entry.paused, unavailable: entry.unavailable, ...(entry.automated ? { automationId: V9_AUTOMATION_ID } : {}), ...(entry.terminalResult ? { terminalResult: structuredClone(entry.terminalResult) } : {}) }; }
    private noop(entry: Entry): CoordinatorUpdateV9 { return { ...this.snapshot(entry), transition: { accepted: true, mutated: false, state: structuredClone(entry.state), events: [] } }; }
    private rejected(entry: Entry, message: string): CoordinatorUpdateV9 { return { ...this.snapshot(entry), transition: { accepted: false, mutated: false, state: structuredClone(entry.state), events: [], error: { code: 'COMMAND_REJECTED', message } } }; }
    private resumeInterruptedThreadleap(entry: Entry): SimulationTransitionV9 {
        if (entry.state.lifecycleBarrierCount >= 128) {
            return { accepted: false, mutated: false, state: structuredClone(entry.state), events: [],
                error: { code: 'LIFECYCLE_LIMIT', message: 'Lifecycle budget exhausted.' } };
        }
        if (entry.state.revision >= 65534 || entry.state.inputEpoch >= 65534) return forceSimulationLimitV9(entry.state);
        const state = structuredClone(entry.state);
        state.heldDirection = 0; state.leaseExpiresTick = null; state.lastLeaseRefreshTick = null; state.aim = null;
        state.units[0].vxFp = 0; state.inputEpoch += 1; state.lifecycleBarrierCount += 1; state.revision += 1;
        assertSimulationInvariantsV9(state);
        return { accepted: true, mutated: true, state, events: [] };
    }
    private prepareAutomatedTick(entry: Entry): void {
        if (!entry.automated || entry.state.phase !== 'action' || entry.state.activeActor !== 'loomkeeper') return;
        if (entry.aiTurn !== entry.state.turn) {
            entry.aiTurn = entry.state.turn; entry.planningElapsed = 0; entry.planningFailed = false; entry.execution = undefined;
            try { entry.planner = this.options.plannerFactory?.(structuredClone(entry.state)) ?? new LoomkeeperPlannerV9(entry.state); }
            catch { entry.planningFailed = true; entry.planner = undefined; }
        }
        if ((entry.planningElapsed ?? 0) >= 30) return;
        if (!entry.planningFailed) { try { entry.planner!.step(); } catch { entry.planningFailed = true; } }
        entry.planningElapsed = (entry.planningElapsed ?? 0) + 1;
    }
    private drainAutomated(entry: Entry, initial: CoordinatorUpdateV9): CoordinatorUpdateV9 {
        if (!entry.automated || entry.state.phase === 'finished') return initial;
        if (entry.state.phase === 'action' && entry.state.activeActor === 'loomkeeper' && entry.aiTurn === entry.state.turn &&
            entry.planningElapsed === 30 && !this.hasSelection(entry, entry.state.turn)) {
            const selection: LoomkeeperSelectionV9 = entry.planningFailed ? { prefix: 'none', status: 'work_failure', ordinal: null } : entry.planner!.selection;
            // This write is the debit barrier: an execution is impossible until the plan is retained.
            if (!this.recordSelection(entry, entry.state.turn, selection)) return this.safety(entry.replay.challengeId, 'replay_limit');
            if (selection.status === 'selected') entry.execution = new LoomkeeperExecutionV9(entry.planner!.selectedCandidate()!, selection.prefix, entry.state);
        }
        if (!entry.execution) return initial;
        let update = initial;
        for (let count = 0; count < 8; count += 1) {
            const operation = entry.execution.next(entry.state); if (!operation) break;
            const before = entry.state;
            const transition = operation.kind === 'intent'
                ? applySimulationIntentV9(before, 'loomkeeper', operation.intent, before.turn, before.phase, before.inputEpoch)
                : applySimulationBarrierV9(before, operation.barrier);
            if (!transition.accepted) throw new Error(`Authoritative V9 policy emitted an illegal operation: ${transition.error?.message ?? 'unknown'}`);
            if (!transition.mutated) continue;
            const replayOperation: ReplayOperationV9 = operation.kind === 'intent'
                ? { kind: 'intent', actor: 'loomkeeper', intent: operation.intent, expectedTurn: before.turn, expectedPhase: before.phase, expectedEpoch: before.inputEpoch }
                : { kind: 'barrier', barrier: operation.barrier };
            update = this.accept(entry, transition, ReplayOperationV9Schema.parse(replayOperation), false, false);
        }
        return update;
    }
    private hasSelection(entry: Entry, turn: number): boolean { return 'chosenPlans' in entry.replay && entry.replay.chosenPlans.some(plan => plan.turn === turn); }
    private recordSelection(entry: Entry, turn: number, selection: LoomkeeperSelectionV9): boolean {
        if (!('chosenPlans' in entry.replay)) throw new Error('Foundation replay cannot record automated selection.');
        const previous = entry.replay.chosenPlans;
        entry.replay.chosenPlans = [...previous, { turn, ...selection }];
        const bytes = jsonBytesV9(entry.replay);
        if (bytes > this.maxBytes - V9_REPLAY_LIMITS.terminalBytes) { entry.replay.chosenPlans = previous; return false; }
        entry.bytes = bytes; return true;
    }
    private require(id: string): Entry { const entry = this.matches.get(id); if (!entry) throw new Error('No V9 simulation for this challenge.'); return entry; }
    private clock(): number { return bounded(this.nowUs(), 0, Number.MAX_SAFE_INTEGER); }
    private accrue(entry: Entry): void { const now = this.clock(); if (now < entry.anchorUs) { this.safety(entry.replay.challengeId, 'clock_debt'); return; } if (!entry.paused && !entry.terminalResult) entry.credit += BigInt(now - entry.anchorUs) * 30n; entry.anchorUs = now; }
    private async pumpAll(): Promise<void> { if (this.ticking) return; this.ticking = true; try { for (const id of this.matches.keys()) { if (!this.matches.has(id)) continue; try { await this.catchUp(id); } catch { if (this.matches.has(id)) this.safety(id, 'clock_debt'); } } } finally { this.ticking = false; } }
}

function createState(seed: number, calling: PlayerCalling): SimulationStateV9 { return createSimulationV9(seed, calling); }
function bounded(value: number, minimum: number, maximum: number): number {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError('V9 integer bound exceeded.');
    return value;
}
