import {
    advanceSimulationTicksV10, applySimulationBarrierV10, applySimulationIntentV10,
    createSimulationV10, forceSimulationLimitV10, hashSimulationStateV10, V10_RULESET_ID,
    type V10RulesetId,
    type SimulationBarrierV10, type SimulationIntentV10, type SimulationStateV10,
    type SimulationTransitionV10
} from '../../../shared/simulation-v10';
import type { PlayerCalling, SimulationActor } from '../../../shared/simulation';
import {
    CoordinatorReplayV10Schema, ReplayOperationV10Schema, V10_REPLAY_LIMITS, jsonBytesV10,
    type CoordinatorReplayV10, type ReplayOperationV10
} from '../../../shared/protocol-v10';

export { V10_REPLAY_LIMITS } from '../../../shared/protocol-v10';
export type { CoordinatorReplayV10 } from '../../../shared/protocol-v10';

export type CoordinatorTerminalResultV10 = {
    rulesetId: V10RulesetId;
    challengeId: string;
    sessionId: string;
    winner: SimulationStateV10['winner'];
    reason: string;
    tick: number;
    stateHash: string;
};
export type CoordinatorSnapshotV10 = {
    challengeId: string;
    sessionId: string;
    state: SimulationStateV10;
    stateHash: string;
    replayLength: number;
    paused: boolean;
    terminalResult?: CoordinatorTerminalResultV10;
};
export type CoordinatorUpdateV10 = CoordinatorSnapshotV10 & { transition: SimulationTransitionV10 };
export type SimulationCoordinatorV10Options = {
    /** Test seams may only lower the frozen replay caps. */
    maxReplayRecords?: number;
    maxReplayBytes?: number;
    onTransition?: (update: CoordinatorUpdateV10) => void;
    onTerminal?: (result: CoordinatorTerminalResultV10) => void;
};

type Entry = {
    replay: CoordinatorReplayV10;
    state: SimulationStateV10;
    stateHash: string;
    bytes: number;
    paused: boolean;
    terminalResult?: CoordinatorTerminalResultV10;
    pendingTerminal?: CoordinatorTerminalResultV10;
};

/** V10B deterministic authority. It has no transport or automated-opponent path. */
export class SimulationCoordinatorV10 {
    private readonly matches = new Map<string, Entry>();
    private readonly maxRecords: number;
    private readonly maxBytes: number;

    public constructor(private readonly options: SimulationCoordinatorV10Options = {}) {
        this.maxRecords = bounded(options.maxReplayRecords ?? V10_REPLAY_LIMITS.records, 2, V10_REPLAY_LIMITS.records);
        this.maxBytes = bounded(options.maxReplayBytes ?? V10_REPLAY_LIMITS.bytes, 1024, V10_REPLAY_LIMITS.bytes);
    }

    public create(
        challengeId: string,
        sessionId: string,
        seed: number,
        calling: PlayerCalling,
        rulesetId: V10RulesetId = V10_RULESET_ID
    ): CoordinatorSnapshotV10 {
        if (this.matches.has(challengeId)) throw new Error('Duplicate V10 challenge.');
        const state = createSimulationV10(seed, calling, rulesetId);
        const stateHash = hashSimulationStateV10(state);
        const replay = CoordinatorReplayV10Schema.parse({
            formatVersion: 10,
            challengeId,
            sessionId,
            seed: state.seed,
            calling,
            rulesetId: state.rulesetId,
            terrainProfileId: state.terrainProfileId,
            ...(state.terrainRecipeRevision !== undefined ? {
                recipeRevision: state.terrainRecipeRevision,
                candidateIndex: state.terrainCandidateIndex
            } : {}),
            initialStateHash: stateHash,
            records: []
        });
        const entry: Entry = {
            replay,
            state,
            stateHash,
            bytes: jsonBytesV10(replay),
            paused: false
        };
        if (entry.bytes + V10_REPLAY_LIMITS.terminalBytes > this.maxBytes) {
            throw new Error('No V10 terminal replay reserve.');
        }
        this.matches.set(challengeId, entry);
        return this.snapshot(entry);
    }

    public get(challengeId: string): CoordinatorSnapshotV10 | undefined {
        const entry = this.matches.get(challengeId);
        return entry && this.snapshot(entry);
    }

    public apply(
        challengeId: string,
        actor: SimulationActor,
        intent: SimulationIntentV10,
        expectedTurn: number,
        expectedPhase: SimulationStateV10['phase'],
        expectedEpoch: number
    ): CoordinatorUpdateV10 {
        const entry = this.require(challengeId);
        const operation = ReplayOperationV10Schema.parse({
            kind: 'intent', actor, intent, expectedTurn, expectedPhase, expectedEpoch
        });
        if (entry.paused) return this.rejected(entry, 'The match is paused.');
        const transition = applySimulationIntentV10(
            entry.state, actor, intent, expectedTurn, expectedPhase, expectedEpoch
        );
        if (transition.error?.code === 'INTENT_LIMIT') {
            this.barrier(challengeId, {
                reason: 'intent_limit', actor, expectedTurn, expectedEpoch
            });
            return {
                ...this.snapshot(entry),
                transition: { ...transition, state: structuredClone(entry.state) }
            };
        }
        return this.accept(entry, transition, operation);
    }

    public barrier(challengeId: string, barrier: SimulationBarrierV10): CoordinatorUpdateV10 {
        const entry = this.require(challengeId);
        const operation = ReplayOperationV10Schema.parse({ kind: 'barrier', barrier });
        if (barrier.reason === 'pause' && entry.paused) return this.rejected(entry, 'The match is already paused.');
        if (barrier.reason === 'resume' && !entry.paused) return this.rejected(entry, 'The match is not paused.');
        const transition = applySimulationBarrierV10(entry.state, barrier);
        if (transition.error?.code === 'LIFECYCLE_LIMIT') return this.safety(challengeId, 'lifecycle_limit');
        return this.accept(entry, transition, operation);
    }

    public advance(challengeId: string, count: number): CoordinatorUpdateV10 {
        bounded(count, 0, V10_REPLAY_LIMITS.ticks);
        const entry = this.require(challengeId);
        if (entry.paused) return this.rejected(entry, 'The match is paused.');
        let update = this.noop(entry);
        for (let index = 0; index < count && !entry.terminalResult; index += 1) {
            update = this.accept(
                entry,
                advanceSimulationTicksV10(entry.state, 1),
                { kind: 'ticks', count: 1 }
            );
        }
        return update;
    }

    public safety(
        challengeId: string,
        reason: Extract<ReplayOperationV10, { kind: 'safety' }>['reason']
    ): CoordinatorUpdateV10 {
        const entry = this.require(challengeId);
        if (entry.terminalResult) return this.noop(entry);
        entry.paused = false;
        return this.accept(entry, forceSimulationLimitV10(entry.state), { kind: 'safety', reason }, true);
    }

    public replay(challengeId: string): CoordinatorReplayV10 | undefined {
        const entry = this.matches.get(challengeId);
        return entry && structuredClone(entry.replay);
    }

    public reconstructAndVerify(
        input: unknown,
        expected?: { challengeId: string; sessionId: string }
    ): CoordinatorSnapshotV10 {
        if (jsonBytesV10(input) > this.maxBytes) throw new Error('V10 replay byte limit exceeded.');
        const raw = input as { records?: unknown[] };
        if (!raw || !Array.isArray(raw.records) || raw.records.length > this.maxRecords) {
            throw new Error('V10 replay record limit exceeded.');
        }
        for (const record of raw.records) {
            if (jsonBytesV10(record) > V10_REPLAY_LIMITS.operationBytes) {
                throw new Error('V10 operation record byte limit exceeded.');
            }
        }
        const replay = CoordinatorReplayV10Schema.parse(input);
        if (expected && (expected.challengeId !== replay.challengeId || expected.sessionId !== replay.sessionId)) {
            throw new Error('V10 replay ownership mismatch.');
        }
        const totalTicks = replay.records.reduce((total, record) =>
            total + (record.operation.kind === 'ticks' ? record.operation.count : 0), 0);
        if (totalTicks > V10_REPLAY_LIMITS.ticks) throw new Error('V10 replay tick limit exceeded.');

        const verifier = new SimulationCoordinatorV10({
            maxReplayRecords: this.maxRecords,
            maxReplayBytes: this.maxBytes
        });
        try {
            const initial = verifier.create(
                replay.challengeId, replay.sessionId, replay.seed, replay.calling, replay.rulesetId
            );
            if (initial.state.terrainProfileId !== replay.terrainProfileId) {
                throw new Error('V10 terrain profile mismatch.');
            }
            if (initial.state.terrainRecipeRevision !== replay.recipeRevision ||
                initial.state.terrainCandidateIndex !== replay.candidateIndex) {
                throw new Error('V10 procedural terrain authority mismatch.');
            }
            if (initial.stateHash !== replay.initialStateHash) throw new Error('V10 initial hash mismatch.');
            let cursor = 0;
            while (cursor < replay.records.length) {
                const generated = verifier.require(replay.challengeId).replay.records[cursor];
                if (generated) {
                    if (JSON.stringify(generated) !== JSON.stringify(replay.records[cursor])) {
                        throw new Error(`V10 replay divergence at ${cursor}.`);
                    }
                    cursor += 1;
                    continue;
                }
                const operation = replay.records[cursor].operation;
                if (operation.kind === 'automatic') {
                    throw new Error(`Missing generated V10 automatic boundary at ${cursor}.`);
                }
                if (verifier.get(replay.challengeId)!.state.phase === 'finished') {
                    throw new Error('V10 replay extends beyond terminal state.');
                }
                if (operation.kind === 'intent') {
                    verifier.apply(
                        replay.challengeId, operation.actor, operation.intent as SimulationIntentV10,
                        operation.expectedTurn, operation.expectedPhase, operation.expectedEpoch
                    );
                } else if (operation.kind === 'barrier') {
                    verifier.barrier(replay.challengeId, operation.barrier);
                } else if (operation.kind === 'ticks') {
                    verifier.advance(replay.challengeId, operation.count);
                } else {
                    verifier.safety(replay.challengeId, operation.reason);
                }
                if (!verifier.require(replay.challengeId).replay.records[cursor]) {
                    throw new Error(`V10 replay operation did not mutate at ${cursor}.`);
                }
            }
            const regenerated = verifier.require(replay.challengeId).replay.records;
            if (JSON.stringify(regenerated) !== JSON.stringify(replay.records)) {
                throw new Error('V10 replay is missing or changes canonical operation boundaries.');
            }
            return verifier.get(replay.challengeId)!;
        } finally {
            verifier.dispose();
        }
    }

    public takePendingTerminalResult(challengeId: string): CoordinatorTerminalResultV10 | undefined {
        const entry = this.matches.get(challengeId);
        const result = entry?.pendingTerminal;
        if (entry) entry.pendingTerminal = undefined;
        return result && structuredClone(result);
    }

    public delete(challengeId: string): boolean {
        return this.matches.delete(challengeId);
    }

    public deleteForSession(sessionId: string): void {
        for (const [id, entry] of this.matches) {
            if (entry.replay.sessionId === sessionId) this.matches.delete(id);
        }
    }

    public dispose(): void {
        this.matches.clear();
    }

    private accept(
        entry: Entry,
        transition: SimulationTransitionV10,
        operation: ReplayOperationV10,
        reserve = false
    ): CoordinatorUpdateV10 {
        if (!transition.accepted || !transition.mutated) {
            return { ...this.snapshot(entry), transition: structuredClone(transition) };
        }
        const stateHash = hashSimulationStateV10(transition.state);
        const automatic: ReplayOperationV10[] = reserve ? [] : transition.events
            .filter(event => event.type === 'input_barrier')
            .map(event => event.reason === 'phase'
                ? {
                    kind: 'automatic' as const, reason: 'phase' as const,
                    tick: transition.state.tick, inputEpoch: transition.state.inputEpoch,
                    phase: transition.state.phase
                }
                : {
                    kind: 'automatic' as const, reason: 'lease_expired' as const,
                    tick: transition.state.tick, inputEpoch: transition.state.inputEpoch
                });
        const last = entry.replay.records.at(-1);
        const coalesce = automatic.length === 0 && operation.kind === 'ticks' && last?.operation.kind === 'ticks';
        const combined: ReplayOperationV10 = coalesce && operation.kind === 'ticks' && last!.operation.kind === 'ticks'
            ? { kind: 'ticks', count: last!.operation.count + operation.count }
            : operation;
        const record = {
            index: coalesce ? last!.index : entry.replay.records.length,
            operation: combined,
            stateHash
        };
        const annotations = automatic.map((item, index) => ({
            index: record.index + index + 1,
            operation: item,
            stateHash
        }));
        const bytes = entry.bytes + jsonBytesV10(record) - (coalesce ? jsonBytesV10(last) : 0) +
            (!coalesce && entry.replay.records.length ? 1 : 0) +
            annotations.reduce((total, item) => total + jsonBytesV10(item) + 1, 0);
        if (jsonBytesV10(record) > V10_REPLAY_LIMITS.operationBytes ||
            entry.replay.records.length + (coalesce ? 0 : 1) + annotations.length > this.maxRecords - (reserve ? 0 : 1) ||
            bytes > this.maxBytes - (reserve ? 0 : V10_REPLAY_LIMITS.terminalBytes)) {
            if (reserve) throw new Error('V10 terminal reserve invariant violated.');
            return this.safety(entry.replay.challengeId, 'replay_limit');
        }
        entry.state = transition.state;
        entry.stateHash = stateHash;
        entry.bytes = bytes;
        if (operation.kind === 'barrier' && (operation.barrier.reason === 'pause' || operation.barrier.reason === 'resume')) {
            entry.paused = operation.barrier.reason === 'pause';
        }
        if (coalesce) entry.replay.records[entry.replay.records.length - 1] = record;
        else entry.replay.records.push(record);
        entry.replay.records.push(...annotations);

        if (entry.state.phase === 'finished' && !entry.terminalResult) {
            entry.terminalResult = {
                rulesetId: entry.state.rulesetId,
                challengeId: entry.replay.challengeId,
                sessionId: entry.replay.sessionId,
                winner: entry.state.winner,
                reason: entry.state.finishReason!,
                tick: entry.state.tick,
                stateHash
            };
            entry.pendingTerminal = entry.terminalResult;
            this.options.onTerminal?.(structuredClone(entry.terminalResult));
        }
        const update = { ...this.snapshot(entry), transition: structuredClone(transition) };
        this.options.onTransition?.(structuredClone(update));
        return update;
    }

    private snapshot(entry: Entry): CoordinatorSnapshotV10 {
        return {
            challengeId: entry.replay.challengeId,
            sessionId: entry.replay.sessionId,
            state: structuredClone(entry.state),
            stateHash: entry.stateHash,
            replayLength: entry.replay.records.length,
            paused: entry.paused,
            ...(entry.terminalResult ? { terminalResult: structuredClone(entry.terminalResult) } : {})
        };
    }

    private noop(entry: Entry): CoordinatorUpdateV10 {
        return {
            ...this.snapshot(entry),
            transition: { accepted: true, mutated: false, state: structuredClone(entry.state), events: [] }
        };
    }

    private rejected(entry: Entry, message: string): CoordinatorUpdateV10 {
        return {
            ...this.snapshot(entry),
            transition: {
                accepted: false,
                mutated: false,
                state: structuredClone(entry.state),
                events: [],
                error: { code: 'COMMAND_REJECTED', message }
            }
        };
    }

    private require(challengeId: string): Entry {
        const entry = this.matches.get(challengeId);
        if (!entry) throw new Error('No V10 simulation for this challenge.');
        return entry;
    }
}

function bounded(value: number, minimum: number, maximum: number): number {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        throw new RangeError('V10 integer bound exceeded.');
    }
    return value;
}
