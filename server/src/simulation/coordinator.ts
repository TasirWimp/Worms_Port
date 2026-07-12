import { createHash } from 'crypto';

import {
    advanceSimulationTicks,
    applySimulationCommand,
    canonicalSimulationJson,
    createSimulation,
    LEGACY_RULESET_ID,
    LATEST_RULESET_ID
} from '../../../shared/simulation';
import type {
    SimulationActor,
    SimulationCommand,
    SimulationRulesetId,
    SimulationState,
    SimulationTransition
} from '../../../shared/simulation';

const DEFAULT_MAX_REPLAY_RECORDS = 2048;

type SimulationCalling = Parameters<typeof createSimulation>[1];

export type CoordinatorReplayRecord = {
    index: number;
    operation:
        | {
            kind: 'command';
            actor: SimulationActor;
            command: SimulationCommand;
            expectedTurn: number;
        }
        | { kind: 'ticks'; count: number };
    stateHash: string;
};

export type CoordinatorReplay = {
    challengeId: string;
    sessionId: string;
    seed: number;
    calling: SimulationCalling;
    rulesetId?: SimulationRulesetId;
    initialStateHash: string;
    records: readonly CoordinatorReplayRecord[];
};

export type CoordinatorTerminalResult = {
    challengeId: string;
    sessionId: string;
    winner: SimulationActor | 'draw' | null;
    reason: string;
    tick: number;
    stateHash: string;
};

export type CoordinatorSnapshot = {
    challengeId: string;
    sessionId: string;
    state: SimulationState;
    stateHash: string;
    replayLength: number;
    terminalResult?: CoordinatorTerminalResult;
};

export type CoordinatorUpdate = CoordinatorSnapshot & {
    transition: SimulationTransition;
};

export type SimulationCoordinatorOptions = {
    maxReplayRecords?: number;
    tickIntervalMs?: number;
    ticksPerInterval?: number;
    onTransition?: (update: CoordinatorUpdate) => void;
    onTerminal?: (result: CoordinatorTerminalResult) => void;
};

type MatchEntry = {
    challengeId: string;
    sessionId: string;
    seed: number;
    calling: SimulationCalling;
    rulesetId: SimulationRulesetId;
    state: SimulationState;
    initialStateHash: string;
    records: CoordinatorReplayRecord[];
    terminalResult?: CoordinatorTerminalResult;
    pendingTerminalResult?: CoordinatorTerminalResult;
};

/**
 * Owns active deterministic simulations without taking responsibility for
 * authentication or transport sequencing. All authoritative wall-clock data
 * stays outside the state and its hash.
 */
export class SimulationCoordinator {
    private readonly matches = new Map<string, MatchEntry>();
    private readonly maxReplayRecords: number;
    private readonly ticksPerInterval: number;
    private readonly onTransition?: (update: CoordinatorUpdate) => void;
    private readonly onTerminal?: (result: CoordinatorTerminalResult) => void;
    private readonly timer?: NodeJS.Timeout;

    public constructor(options: SimulationCoordinatorOptions = {}) {
        this.maxReplayRecords = positiveInteger(
            options.maxReplayRecords ?? DEFAULT_MAX_REPLAY_RECORDS,
            'maxReplayRecords'
        );
        this.ticksPerInterval = positiveInteger(
            options.ticksPerInterval ?? 1,
            'ticksPerInterval'
        );
        this.onTransition = options.onTransition;
        this.onTerminal = options.onTerminal;

        if (options.tickIntervalMs !== undefined) {
            const interval = positiveInteger(options.tickIntervalMs, 'tickIntervalMs');
            this.timer = setInterval(() => this.tickAll(this.ticksPerInterval), interval);
            this.timer.unref();
        }
    }

    public create(
        challengeId: string,
        sessionId: string,
        seed: number,
        calling: SimulationCalling,
        rulesetId: SimulationRulesetId = LATEST_RULESET_ID
    ): CoordinatorSnapshot {
        if (this.matches.has(challengeId)) {
            throw new Error(`A simulation already exists for challenge ${challengeId}.`);
        }
        const normalizedSeed = uint32(seed, 'seed');
        const state = createSimulation(normalizedSeed, calling, rulesetId);
        const initialStateHash = hashState(state);
        const entry: MatchEntry = {
            challengeId,
            sessionId,
            seed: normalizedSeed,
            calling,
            rulesetId,
            state,
            initialStateHash,
            records: []
        };
        this.matches.set(challengeId, entry);
        this.captureTerminal(entry);
        return this.snapshotOf(entry);
    }

    public apply(
        challengeId: string,
        actor: SimulationActor,
        command: SimulationCommand,
        expectedTurn: number
    ): CoordinatorUpdate {
        const entry = this.require(challengeId);
        this.ensureMutable(entry);
        const turn = nonnegativeInteger(expectedTurn, 'expectedTurn');
        const transition = applySimulationCommand(
            structuredClone(entry.state),
            actor,
            structuredClone(command),
            turn
        );
        return this.acceptTransition(entry, transition, {
            kind: 'command',
            actor,
            command: structuredClone(command),
            expectedTurn: turn
        });
    }

    public advance(challengeId: string, count: number): CoordinatorUpdate {
        const entry = this.require(challengeId);
        this.ensureMutable(entry);
        const ticks = nonnegativeInteger(count, 'count');
        const transition = advanceSimulationTicks(structuredClone(entry.state), ticks);
        return this.acceptTransition(entry, transition, { kind: 'ticks', count: ticks });
    }

    public tickAll(count = 1): CoordinatorUpdate[] {
        const updates: CoordinatorUpdate[] = [];
        for (const entry of this.matches.values()) {
            if (entry.terminalResult) {
                continue;
            }
            updates.push(this.advance(entry.challengeId, count));
        }
        return updates;
    }

    public get(challengeId: string): CoordinatorSnapshot | undefined {
        const entry = this.matches.get(challengeId);
        return entry ? this.snapshotOf(entry) : undefined;
    }

    public replay(challengeId: string): CoordinatorReplay | undefined {
        const entry = this.matches.get(challengeId);
        return entry ? replayOf(entry) : undefined;
    }

    public canAppendReplayRecords(challengeId: string, count: number): boolean {
        const entry = this.require(challengeId);
        const records = nonnegativeInteger(count, 'count');
        return entry.records.length + records <= this.maxReplayRecords;
    }

    public takePendingTerminalResult(challengeId: string): CoordinatorTerminalResult | undefined {
        const entry = this.matches.get(challengeId);
        if (!entry?.pendingTerminalResult) {
            return undefined;
        }
        const result = entry.pendingTerminalResult;
        entry.pendingTerminalResult = undefined;
        return structuredClone(result);
    }

    public delete(challengeId: string): boolean {
        return this.matches.delete(challengeId);
    }

    public deleteForSession(sessionId: string): number {
        let deleted = 0;
        for (const entry of [...this.matches.values()]) {
            if (entry.sessionId === sessionId && this.matches.delete(entry.challengeId)) {
                deleted += 1;
            }
        }
        return deleted;
    }

    public reconstructAndVerify(replay: CoordinatorReplay): CoordinatorSnapshot {
        if (replay.records.length > this.maxReplayRecords) {
            throw new Error('Replay exceeds the configured record limit.');
        }
        const seed = uint32(replay.seed, 'seed');
        const rulesetId = replay.rulesetId ?? LEGACY_RULESET_ID;
        let state = createSimulation(seed, replay.calling, rulesetId);
        if (hashState(state) !== replay.initialStateHash) {
            throw new Error('Replay initial state hash does not match.');
        }
        let expectedIndex = 0;
        for (const record of replay.records) {
            if (record.index !== expectedIndex) {
                throw new Error(`Replay record index ${record.index} is not contiguous.`);
            }
            const transition = record.operation.kind === 'command'
                ? applySimulationCommand(
                    state,
                    record.operation.actor,
                    structuredClone(record.operation.command),
                    record.operation.expectedTurn
                )
                : advanceSimulationTicks(state, record.operation.count);
            if (!transition.accepted || !transition.mutated) {
                throw new Error(`Replay record ${record.index} was not an accepted mutation.`);
            }
            state = stateFromTransition(transition);
            if (hashState(state) !== record.stateHash) {
                throw new Error(`Replay diverged at record ${record.index}.`);
            }
            expectedIndex += 1;
        }
        const reconstructed: MatchEntry = {
            challengeId: replay.challengeId,
            sessionId: replay.sessionId,
            seed,
            calling: replay.calling,
            rulesetId,
            state,
            initialStateHash: replay.initialStateHash,
            records: replay.records.map((record) => structuredClone(record))
        };
        this.captureTerminal(reconstructed, false);
        return this.snapshotOf(reconstructed);
    }

    public dispose(): void {
        if (this.timer) {
            clearInterval(this.timer);
        }
        this.matches.clear();
    }

    public get size(): number {
        return this.matches.size;
    }

    private acceptTransition(
        entry: MatchEntry,
        transition: SimulationTransition,
        operation: CoordinatorReplayRecord['operation']
    ): CoordinatorUpdate {
        const state = stateFromTransition(transition);
        const stateHash = hashState(state);
        if (!transition.accepted) {
            if (stateHash !== hashState(entry.state) || transition.mutated) {
                throw new Error('A rejected simulation transition mutated authoritative state.');
            }
            return {
                ...this.snapshotOf(entry),
                transition: structuredClone(transition)
            };
        }
        if (!transition.mutated) {
            return {
                ...this.snapshotOf(entry),
                transition: structuredClone(transition)
            };
        }
        const lastRecord = entry.records.at(-1);
        const coalescesTicks = operation.kind === 'ticks' &&
            lastRecord?.operation.kind === 'ticks';
        if (!coalescesTicks && entry.records.length >= this.maxReplayRecords) {
            return {
                ...this.snapshotOf(entry),
                transition: {
                    accepted: false,
                    mutated: false,
                    state: structuredClone(entry.state),
                    events: [],
                    error: {
                        code: 'COMMAND_REJECTED',
                        message: 'The deterministic replay record limit has been reached.'
                    }
                }
            };
        }
        entry.state = state;
        if (coalescesTicks) {
            const previous = lastRecord!.operation;
            if (previous.kind !== 'ticks' || operation.kind !== 'ticks') {
                throw new Error('Tick replay coalescing invariant failed.');
            }
            previous.count += operation.count;
            lastRecord.stateHash = stateHash;
        } else {
            entry.records.push({
                index: entry.records.length,
                operation,
                stateHash
            });
        }
        this.captureTerminal(entry);
        const update = {
            ...this.snapshotOf(entry),
            transition: structuredClone(transition)
        };
        this.onTransition?.(update);
        return update;
    }

    private captureTerminal(entry: MatchEntry, notify = true): void {
        if (entry.terminalResult) {
            return;
        }
        const terminal = terminalFromState(entry);
        if (!terminal) {
            return;
        }
        entry.terminalResult = terminal;
        entry.pendingTerminalResult = terminal;
        if (notify) {
            this.onTerminal?.(structuredClone(terminal));
        }
    }

    private snapshotOf(entry: MatchEntry): CoordinatorSnapshot {
        return {
            challengeId: entry.challengeId,
            sessionId: entry.sessionId,
            state: structuredClone(entry.state),
            stateHash: hashState(entry.state),
            replayLength: entry.records.length,
            terminalResult: entry.terminalResult
                ? structuredClone(entry.terminalResult)
                : undefined
        };
    }

    private require(challengeId: string): MatchEntry {
        const entry = this.matches.get(challengeId);
        if (!entry) {
            throw new Error(`No simulation exists for challenge ${challengeId}.`);
        }
        return entry;
    }

    private ensureMutable(entry: MatchEntry): void {
        if (entry.terminalResult) {
            throw new Error(`Simulation ${entry.challengeId} is terminal.`);
        }
    }
}

export function hashSimulationState(state: SimulationState): string {
    return hashState(state);
}

function hashState(state: SimulationState): string {
    return createHash('sha256')
        .update(canonicalSimulationJson(state), 'utf8')
        .digest('hex');
}

function replayOf(entry: MatchEntry): CoordinatorReplay {
    return {
        challengeId: entry.challengeId,
        sessionId: entry.sessionId,
        seed: entry.seed,
        calling: entry.calling,
        rulesetId: entry.rulesetId,
        initialStateHash: entry.initialStateHash,
        records: entry.records.map((record) => structuredClone(record))
    };
}

function stateFromTransition(transition: SimulationTransition): SimulationState {
    const state = (transition as unknown as { state?: SimulationState }).state;
    if (!state) {
        throw new Error('The simulation transition did not provide its resulting state.');
    }
    return state;
}

function terminalFromState(entry: MatchEntry): CoordinatorTerminalResult | undefined {
    if (entry.state.phase !== 'finished') {
        return undefined;
    }
    return {
        challengeId: entry.challengeId,
        sessionId: entry.sessionId,
        winner: entry.state.winner,
        reason: entry.state.finishReason ?? 'completed',
        tick: entry.state.tick,
        stateHash: hashState(entry.state)
    };
}

function positiveInteger(value: number, name: string): number {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new RangeError(`${name} must be a positive safe integer.`);
    }
    return value;
}

function uint32(value: number, name: string): number {
    if (!Number.isInteger(value) || value < 0 || value > 0xFFFFFFFF) {
        throw new RangeError(`${name} must be an unsigned 32-bit integer.`);
    }
    return value;
}

function nonnegativeInteger(value: number, name: string): number {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError(`${name} must be a nonnegative safe integer.`);
    }
    return value;
}
