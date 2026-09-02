import { createHash } from 'node:crypto';
import {
    advanceSimulationTicksV8, applySimulationBarrierV8, applySimulationIntentV8,
    canonicalSimulationJsonV8, createSimulationV8, forceSimulationLimitV8,
    V8_RULESET_ID, type SimulationBarrierV8, type SimulationIntentV8,
    type SimulationPhaseV8, type SimulationStateV8, type SimulationTransitionV8
} from '../../../shared/simulation-v8';
import type { PlayerCalling, SimulationActor } from '../../../shared/simulation';
import {
    CoordinatorReplayV8Schema, ReplayOperationV8Schema,
    V8_REPLAY_LIMITS, jsonBytesV8, type CoordinatorReplayV8, type ReplayOperationV8
} from '../../../shared/protocol-v8';
import { V8_LOOMKEEPER_POLICY_ID, V8_LOOMKEEPER_PROFILE_ID } from '../../../shared/combat-version';

export { V8_REPLAY_LIMITS } from '../../../shared/protocol-v8';
export type { CoordinatorReplayV8 } from '../../../shared/protocol-v8';
export type CoordinatorTerminalResultV8 = {
    rulesetId: typeof V8_RULESET_ID; challengeId: string; sessionId: string;
    winner: SimulationStateV8['winner']; reason: string; tick: number; stateHash: string;
};
export type CoordinatorSnapshotV8 = {
    challengeId: string; sessionId: string; state: SimulationStateV8;
    stateHash: string; replayLength: number; paused: boolean; unavailable: boolean;
    terminalResult?: CoordinatorTerminalResultV8;
};
export type CoordinatorUpdateV8 = CoordinatorSnapshotV8 & { transition: SimulationTransitionV8 };
export type SimulationCoordinatorV8Options = {
    nowUs?: () => number;
    /** Each continuation yields to the event loop. Never use a microtask spin. */
    yieldBatch?: () => Promise<void>;
    tickIntervalMs?: number;
    /** Test seams may only LOWER the frozen limits. */
    maxReplayRecords?: number; maxReplayBytes?: number;
    onTransition?: (update: CoordinatorUpdateV8) => void;
    onTerminal?: (result: CoordinatorTerminalResultV8) => void;
};
type Entry = {
    replay: CoordinatorReplayV8; state: SimulationStateV8; stateHash: string;
    bytes: number; paused: boolean; unavailable: boolean;
    anchorUs: number; credit: bigint;
    terminalResult?: CoordinatorTerminalResultV8; pendingTerminal?: CoordinatorTerminalResultV8;
};

/** Bounded V8 authority. Neither socket arrival times nor wall-time credit enter its replay/hash. */
export class SimulationCoordinatorV8 {
    private readonly matches = new Map<string, Entry>();
    private readonly nowUs: () => number;
    private readonly yieldBatch: () => Promise<void>;
    private readonly maxRecords: number;
    private readonly maxBytes: number;
    private readonly timer?: NodeJS.Timeout;
    private ticking = false;
    public constructor(private readonly options: SimulationCoordinatorV8Options = {}) {
        this.nowUs = options.nowUs ?? (() => Number(process.hrtime.bigint() / 1000n));
        this.yieldBatch = options.yieldBatch ?? (() => new Promise(resolve => setImmediate(resolve)));
        this.maxRecords = bounded(options.maxReplayRecords ?? V8_REPLAY_LIMITS.records, 2, V8_REPLAY_LIMITS.records);
        this.maxBytes = bounded(options.maxReplayBytes ?? V8_REPLAY_LIMITS.bytes, 1024, V8_REPLAY_LIMITS.bytes);
        if (options.tickIntervalMs !== undefined) {
            bounded(options.tickIntervalMs, 1, 1000);
            this.timer = setInterval(() => { void this.pumpAll(); }, options.tickIntervalMs);
            this.timer.unref();
        }
    }

    public create(challengeId: string, sessionId: string, seed: number, calling: PlayerCalling): CoordinatorSnapshotV8 {
        if (this.matches.has(challengeId)) throw new Error('Duplicate V8 challenge.');
        const state = createSimulationV8(seed, calling);
        const stateHash = hashSimulationStateV8(state);
        const replay = CoordinatorReplayV8Schema.parse({ formatVersion: 8, challengeId, sessionId, seed, calling,
            rulesetId: V8_RULESET_ID, loomkeeperPolicyId: V8_LOOMKEEPER_POLICY_ID,
            loomkeeperProfileId: V8_LOOMKEEPER_PROFILE_ID, initialStateHash: stateHash, records: [] });
        const entry: Entry = { replay, state, stateHash, bytes: jsonBytesV8(replay), paused: false,
            unavailable: false, anchorUs: this.clock(), credit: 0n };
        if (entry.bytes + V8_REPLAY_LIMITS.terminalBytes > this.maxBytes) throw new Error('No terminal replay reserve.');
        this.matches.set(challengeId, entry);
        return this.snapshot(entry);
    }

    public get(challengeId: string): CoordinatorSnapshotV8 | undefined {
        const entry = this.matches.get(challengeId);
        return entry && this.snapshot(entry);
    }

    public apply(challengeId: string, actor: SimulationActor, intent: SimulationIntentV8,
        expectedTurn: number, expectedPhase: SimulationPhaseV8, expectedEpoch: number): CoordinatorUpdateV8 {
        const entry = this.require(challengeId);
        const operation = ReplayOperationV8Schema.parse({ kind: 'intent', actor, intent, expectedTurn, expectedPhase, expectedEpoch });
        if (entry.paused) return this.rejected(entry, 'The match is paused.');
        const transition = applySimulationIntentV8(entry.state, actor, intent, expectedTurn, expectedPhase, expectedEpoch);
        if (transition.error?.code === 'INTENT_LIMIT') {
            // Validation of actor/turn/phase/epoch precedes the budget effect in the pure core.
            this.barrier(challengeId, { reason: 'intent_limit', actor, expectedTurn, expectedEpoch });
            return { ...this.snapshot(entry), transition: { ...transition, state: structuredClone(entry.state) } };
        }
        return this.accept(entry, transition, operation);
    }

    public barrier(challengeId: string, barrier: SimulationBarrierV8): CoordinatorUpdateV8 {
        const entry = this.require(challengeId);
        const operation = ReplayOperationV8Schema.parse({ kind: 'barrier', barrier });
        if (barrier.reason === 'pause' || barrier.reason === 'resume') {
            const paused = barrier.reason === 'pause';
            if (paused === entry.paused || entry.state.phase !== 'action' || entry.state.activeActor !== 'player' ||
                entry.state.units.some(unit => unit.alive && !unit.grounded) || (!entry.paused && entry.credit >= 1_000_000n)) {
                return this.rejected(entry, 'Pause requires a stable player action with no timer debt.');
            }
        }
        const transition = applySimulationBarrierV8(entry.state, barrier);
        if (transition.error?.code === 'LIFECYCLE_LIMIT') return this.safety(challengeId, 'lifecycle_limit');
        const update = this.accept(entry, transition, operation);
        return { ...update, paused: entry.paused };
    }

    public async setPaused(challengeId: string, paused: boolean): Promise<CoordinatorSnapshotV8> {
        const entry = this.require(challengeId);
        if (!entry.paused) await this.catchUp(challengeId);
        if (entry.paused === paused) return this.snapshot(entry);
        const state = entry.state;
        const update = this.barrier(challengeId, { reason: paused ? 'pause' : 'resume', actor: 'player',
            expectedTurn: state.turn, expectedEpoch: state.inputEpoch });
        if (!update.transition.accepted) throw new Error(update.transition.error?.message ?? 'Pause rejected.');
        return this.snapshot(entry);
    }

    /** Test/planner transition API. Network input has no route to this method. */
    public advance(challengeId: string, count: number): CoordinatorUpdateV8 {
        bounded(count, 0, V8_REPLAY_LIMITS.ticks);
        const entry = this.require(challengeId);
        if (entry.paused) return this.rejected(entry, 'The match is paused.');
        let update = this.noop(entry);
        for (let index = 0; index < count && !entry.terminalResult; index++) {
            update = this.accept(entry, advanceSimulationTicksV8(entry.state, 1), { kind: 'ticks', count: 1 });
        }
        return update;
    }

    /** At most six ticks per callback. The remaining debt is retained. */
    public pump(challengeId: string): CoordinatorSnapshotV8 {
        const entry = this.require(challengeId);
        this.accrue(entry);
        if (entry.paused || entry.terminalResult) return this.snapshot(entry);
        if (entry.credit / 1_000_000n > 30n) return this.safety(challengeId, 'clock_debt');
        const count = Math.min(6, Number(entry.credit / 1_000_000n));
        entry.credit -= BigInt(count) * 1_000_000n;
        if (count) this.advance(challengeId, count);
        return this.snapshot(entry);
    }

    public dueTicks(challengeId: string): number {
        const entry = this.require(challengeId);
        return Number(entry.credit / 1_000_000n);
    }

    public async catchUp(challengeId: string): Promise<CoordinatorSnapshotV8> {
        let snapshot = this.pump(challengeId);
        while (snapshot.state.phase !== 'finished' && !snapshot.paused && this.dueTicks(challengeId) > 0) {
            await this.yieldBatch();
            if (!this.matches.has(challengeId)) throw new Error('V8 match closed during catch-up.');
            snapshot = this.pump(challengeId);
        }
        return snapshot;
    }

    public safety(challengeId: string, reason: Extract<ReplayOperationV8, { kind: 'safety' }>['reason']): CoordinatorUpdateV8 {
        const entry = this.require(challengeId);
        if (entry.terminalResult) return this.noop(entry);
        const operation: ReplayOperationV8 = { kind: 'safety', reason };
        entry.unavailable = reason !== 'replay_limit' && reason !== 'left';
        entry.paused = false; entry.credit = 0n;
        return this.accept(entry, forceSimulationLimitV8(entry.state), operation, true);
    }

    public replay(challengeId: string): CoordinatorReplayV8 | undefined {
        const entry = this.matches.get(challengeId);
        return entry && structuredClone(entry.replay);
    }

    public reconstructAndVerify(input: unknown,
        expected?: { challengeId: string; sessionId: string }): CoordinatorSnapshotV8 {
        // All size caps precede reconstruction (including allocation of replay copies by Zod).
        if (jsonBytesV8(input) > this.maxBytes) throw new Error('V8 replay byte limit exceeded.');
        const raw = input as CoordinatorReplayV8;
        if (!raw || !Array.isArray(raw.records) || raw.records.length > this.maxRecords)
            throw new Error('V8 replay record limit exceeded.');
        for (const record of raw.records) if (jsonBytesV8(record) > V8_REPLAY_LIMITS.operationBytes)
            throw new Error('V8 operation record byte limit exceeded.');
        const replay = CoordinatorReplayV8Schema.parse(input);
        if (expected && (expected.challengeId !== replay.challengeId || expected.sessionId !== replay.sessionId))
            throw new Error('V8 replay ownership mismatch.');
        let totalTicks = 0;
        for (const record of replay.records) if (record.operation.kind === 'ticks') totalTicks += record.operation.count;
        if (totalTicks > V8_REPLAY_LIMITS.ticks) throw new Error('V8 replay tick limit exceeded.');
        const verifier = new SimulationCoordinatorV8({ nowUs: () => 0, maxReplayRecords: this.maxRecords, maxReplayBytes: this.maxBytes });
        try {
            const initial = verifier.create(replay.challengeId, replay.sessionId, replay.seed, replay.calling);
            if (initial.stateHash !== replay.initialStateHash) throw new Error('V8 initial hash mismatch.');
            for (let index = 0; index < replay.records.length; index++) {
                const record = replay.records[index];
                if (record.index !== index) throw new Error('V8 replay index is not contiguous.');
                const before = verifier.get(replay.challengeId)!;
                const op = record.operation;
                // Non-mutating annotation records must match the exact boundaries independently
                // regenerated by the preceding operation, including terminal-tick boundaries.
                if (op.kind === 'automatic') {
                    const expectedRecord = verifier.require(replay.challengeId).replay.records[index];
                    if (!expectedRecord || JSON.stringify(expectedRecord) !== JSON.stringify(record))
                        throw new Error('V8 automatic boundary does not match authority.');
                    continue;
                }
                const generated = verifier.require(replay.challengeId).replay.records;
                if (generated[index]?.operation.kind === 'automatic') throw new Error('Missing V8 automatic boundary.');
                if (before.state.phase === 'finished') throw new Error('V8 replay extends beyond terminal state.');
                const update = op.kind === 'intent'
                    ? verifier.apply(replay.challengeId, op.actor, op.intent as SimulationIntentV8, op.expectedTurn, op.expectedPhase, op.expectedEpoch)
                    : op.kind === 'barrier' ? verifier.barrier(replay.challengeId, op.barrier)
                        : op.kind === 'ticks' ? verifier.advance(replay.challengeId, op.count)
                            : verifier.safety(replay.challengeId, op.reason);
                if (!update.transition.accepted || !update.transition.mutated || update.stateHash !== record.stateHash ||
                    (op.kind === 'ticks' && update.state.tick - before.state.tick !== op.count))
                    throw new Error(`V8 replay divergence at ${index}.`);
            }
            const result = verifier.get(replay.challengeId)!;
            const regenerated = verifier.require(replay.challengeId).replay;
            if (JSON.stringify(regenerated.records) !== JSON.stringify(replay.records))
                throw new Error('V8 replay is missing or changes canonical operation boundaries.');
            return { ...result, replayLength: replay.records.length };
        } finally { verifier.dispose(); }
    }

    public takePendingTerminalResult(challengeId: string): CoordinatorTerminalResultV8 | undefined {
        const entry = this.matches.get(challengeId);
        const result = entry?.pendingTerminal;
        if (entry) entry.pendingTerminal = undefined;
        return result && structuredClone(result);
    }
    public delete(challengeId: string): boolean { return this.matches.delete(challengeId); }
    public deleteForSession(sessionId: string): void {
        for (const [id, entry] of this.matches) if (entry.replay.sessionId === sessionId) this.matches.delete(id);
    }
    public dispose(): void { if (this.timer) clearInterval(this.timer); this.matches.clear(); }

    private accept(entry: Entry, transition: SimulationTransitionV8, operation: ReplayOperationV8,
        reserve = false): CoordinatorUpdateV8 {
        if (!transition.accepted || !transition.mutated) return { ...this.snapshot(entry), transition: structuredClone(transition) };
        const stateHash = hashSimulationStateV8(transition.state);
        const automatic: ReplayOperationV8[] = reserve ? [] : transition.events.filter(event => event.type === 'input_barrier')
            .map(event => event.reason === 'phase'
                ? {kind:'automatic' as const,reason:'phase' as const,tick:transition.state.tick,inputEpoch:transition.state.inputEpoch,phase:transition.state.phase}
                : {kind:'automatic' as const,reason:'lease_expired' as const,tick:transition.state.tick,inputEpoch:transition.state.inputEpoch});
        const last = entry.replay.records.at(-1);
        const coalesce = !automatic.length && operation.kind === 'ticks' && last?.operation.kind === 'ticks';
        const combined: ReplayOperationV8 = coalesce && last.operation.kind === 'ticks' && operation.kind === 'ticks'
            ? { kind: 'ticks', count: last.operation.count + operation.count } : operation;
        const record = { index: coalesce ? last!.index : entry.replay.records.length, operation: combined, stateHash };
        const annotations = automatic.map((operation,index) => ({ index:record.index+1+index,operation,stateHash }));
        const bytes = entry.bytes + jsonBytesV8(record) - (coalesce ? jsonBytesV8(last) : 0) + (!coalesce && entry.replay.records.length ? 1 : 0)
            + annotations.reduce((total,annotation) => total+jsonBytesV8(annotation)+1,0);
        if (jsonBytesV8(record) > V8_REPLAY_LIMITS.operationBytes ||
            entry.replay.records.length + (coalesce ? 0 : 1) + annotations.length > this.maxRecords - (reserve ? 0 : 1) ||
            bytes > this.maxBytes - (reserve ? 0 : V8_REPLAY_LIMITS.terminalBytes)) {
            if (reserve) throw new Error('V8 terminal reserve invariant violated.');
            return this.safety(entry.replay.challengeId, 'replay_limit');
        }
        const oldPhase = entry.state.phase;
        entry.state = transition.state; entry.stateHash = stateHash; entry.bytes = bytes;
        if (operation.kind === 'barrier' && (operation.barrier.reason === 'pause' || operation.barrier.reason === 'resume')) {
            entry.paused = operation.barrier.reason === 'pause';
            entry.anchorUs = this.clock(); entry.credit = 0n;
        }
        if (coalesce) entry.replay.records[entry.replay.records.length-1] = record;
        else entry.replay.records.push(record);
        entry.replay.records.push(...annotations);
        if (entry.state.phase === 'finished' && !entry.terminalResult) {
            entry.terminalResult = { rulesetId: V8_RULESET_ID, challengeId: entry.replay.challengeId,
                sessionId: entry.replay.sessionId, winner: entry.state.winner,
                reason: entry.state.finishReason!, tick: entry.state.tick, stateHash };
            entry.pendingTerminal = entry.terminalResult;
            this.options.onTerminal?.(structuredClone(entry.terminalResult));
        }
        const update = { ...this.snapshot(entry), transition: structuredClone(transition) };
        if (operation.kind !== 'ticks' || entry.state.tick % 3 === 0 || oldPhase !== entry.state.phase ||
            transition.events.some(event => event.type === 'phase_changed'))
            this.options.onTransition?.(update);
        return update;
    }
    private snapshot(entry: Entry): CoordinatorSnapshotV8 {
        return { challengeId: entry.replay.challengeId, sessionId: entry.replay.sessionId,
            state: structuredClone(entry.state), stateHash: entry.stateHash, replayLength: entry.replay.records.length,
            paused: entry.paused, unavailable: entry.unavailable,
            ...(entry.terminalResult ? { terminalResult: structuredClone(entry.terminalResult) } : {}) };
    }
    private noop(entry: Entry): CoordinatorUpdateV8 {
        return { ...this.snapshot(entry), transition: { accepted: true, mutated: false, state: structuredClone(entry.state), events: [] } };
    }
    private rejected(entry: Entry, message: string): CoordinatorUpdateV8 {
        return { ...this.snapshot(entry), transition: { accepted: false, mutated: false, state: structuredClone(entry.state),
            events: [], error: { code: 'COMMAND_REJECTED', message } } };
    }
    private require(id: string): Entry {
        const entry = this.matches.get(id);
        if (!entry) throw new Error('No V8 simulation for this challenge.');
        return entry;
    }
    private clock(): number { return bounded(this.nowUs(), 0, Number.MAX_SAFE_INTEGER); }
    private accrue(entry: Entry): void {
        const now = this.clock();
        if (now < entry.anchorUs) { this.safety(entry.replay.challengeId, 'clock_debt'); return; }
        if (!entry.paused && !entry.terminalResult) entry.credit += BigInt(now-entry.anchorUs) * 30n;
        entry.anchorUs = now;
    }
    private async pumpAll(): Promise<void> {
        if (this.ticking) return;
        this.ticking = true;
        try {
            for (const id of this.matches.keys()) {
                if (!this.matches.has(id)) continue;
                try { await this.catchUp(id); }
                catch { if (this.matches.has(id)) this.safety(id, 'clock_debt'); }
            }
        } finally { this.ticking = false; }
    }
}

export function hashSimulationStateV8(state: SimulationStateV8): string {
    return createHash('sha256').update(canonicalSimulationJsonV8(state), 'utf8').digest('hex');
}
function bounded(value: number, minimum: number, maximum: number): number {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError('V8 integer bound exceeded.');
    return value;
}
