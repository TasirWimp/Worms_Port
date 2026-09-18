import {
    advanceOwnedSimulationTickV10, applySimulationBarrierV10, applySimulationIntentV10,
    assertSimulationInvariantsV10, createSimulationV10, forceSimulationLimitV10, hashSimulationStateV10,
    hashValidatedSimulationStateV10, CURRENT_V10_RULESET_ID,
    V10_R6_RULESET_ID, V10_R7_RULESET_ID,
    type SimulationBarrierV10, type SimulationIntentV10, type SimulationStateV10, type SimulationTransitionV10
} from '../../../shared/simulation-v10';
import {
    advanceOwnedSimulationTickV10R8, applySimulationBarrierV10R8, applySimulationIntentV10R8,
    assertSimulationInvariantsV10R8, createSimulationV10R8, forceSimulationLimitV10R8,
    hashSimulationStateV10R8, hashValidatedSimulationStateV10R8, V10_R8_OBJECTIVE_RECIPE_REVISION,
    V10_R8_RULESET_ID,
    type SimulationEventV10R8, type SimulationStateV10R8, type V10R8ObjectiveMode
} from '../../../shared/simulation-v10-r8';
import type { PlayerCalling, SimulationActor } from '../../../shared/simulation';
import {
    CoordinatorReplayV10Schema, CoordinatorReplayV10AutomatedSchema, CoordinatorReplayV10R8Schema,
    ReplayOperationV10Schema, V10_REPLAY_LIMITS, jsonBytesV10,
    type CoordinatorReplayV10, type CoordinatorReplayV10Automated, type ReplayOperationV10, type V10StopReason
} from '../../../shared/protocol-v10-live';
import {
    isV10AutomationId, V10_AUTOMATION_ID, V10_R6_AUTOMATION_ID, V10_R7_AUTOMATION_ID, V10_R8_AUTOMATION_ID,
    type V10AutomationId
} from '../../../shared/combat-version';
import { LoomkeeperExecutionV10, LoomkeeperPlannerV10, type LoomkeeperSelectionV10 } from '../../../shared/loomkeeper-v10';
import { LoomkeeperExecutionV10R8, LoomkeeperPlannerV10R8 } from '../../../shared/loomkeeper-v10-r8';
import {
    EMPTY_COMMITTED_VOYAGE_V10_R8,
    EMPTY_RECENT_CHANGES_V10_R8,
    StrategicTurnRecordV10R8Schema,
    V10_R8_STRATEGY_POLICY_ID,
    type CommittedStrategicVoyageV10R8,
    type RecentStrategicChangesV10R8,
    type StrategicTurnRecordV10R8
} from '../../../shared/strategic-voyage-v10-r8';
import {
    buildStrategicDecisionBoundaryV10R8,
    type StrategicCandidateSummaryV10R8
} from './loomkeeper-strategy-v10-r8';
import {
    StrategicDecisionAdapterV10R8,
    type StrategicProviderResultV10R8
} from './loomkeeper-strategy-provider-v10-r8';
import {
    authorizeStrategicTurnV10R8,
    committedStrategicTurnV10R8,
    deriveRecentStrategicChangesV10R8,
    executingStrategicTurnV10R8,
    type PendingStrategicTurnV10R8
} from './loomkeeper-strategic-turn-v10-r8';

export { V10_REPLAY_LIMITS } from '../../../shared/protocol-v10-live';
export type { CoordinatorReplayV10 } from '../../../shared/protocol-v10-live';

const REPLAY_VERIFICATION_TICK_BATCH = 6;

type LiveV10RulesetId = typeof V10_R6_RULESET_ID | typeof V10_R7_RULESET_ID | typeof V10_R8_RULESET_ID;
type LiveV10Identity = Readonly<{ rulesetId: LiveV10RulesetId; automationId: V10AutomationId }>;
type LiveSimulationStateV10 = SimulationStateV10 | SimulationStateV10R8;
type LiveSimulationTransitionV10 = Omit<SimulationTransitionV10, 'state' | 'events'> & {
    state: LiveSimulationStateV10;
    events: SimulationEventV10R8[];
};
type LivePlannerV10 = LoomkeeperPlannerV10 | LoomkeeperPlannerV10R8;
type LiveExecutionV10 = LoomkeeperExecutionV10 | LoomkeeperExecutionV10R8;
export type CoordinatorTerminalResultV10 = {
    rulesetId: LiveV10RulesetId; challengeId: string; sessionId: string;
    winner: LiveSimulationStateV10['winner']; reason: string; tick: number; stateHash: string;
    automationId?: V10AutomationId;
    stopReason?: V10StopReason;
};
export type CoordinatorSnapshotV10 = {
    challengeId: string; sessionId: string; state: LiveSimulationStateV10; stateHash: string;
    replayLength: number; paused: boolean; unavailable: boolean; terminalResult?: CoordinatorTerminalResultV10;
    automationId?: V10AutomationId;
};
export type CoordinatorUpdateV10 = CoordinatorSnapshotV10 & { transition: LiveSimulationTransitionV10 };
export type LiveSimulationCoordinatorV10Options = {
    nowUs?: () => number; yieldBatch?: () => Promise<void>; tickIntervalMs?: number;
    /** Test seams may only lower frozen replay caps. */
    maxReplayRecords?: number; maxReplayBytes?: number;
    /** Historical replay verification seam; live runtime omits it and uses the current identity. */
    replayIdentity?: LiveV10Identity;
    /** Bounded strategic provider seam. It is consulted only by private R8 objective matches. */
    strategicAdapter?: StrategicDecisionAdapterV10R8;
    /** Sanitized provider-result observer; it receives no session or wallet identity. */
    onStrategicTurnObserved?: (record: StrategicTurnRecordV10R8) => void;
    /** Provider-free replay input, accepted only by the internal verification kernel. */
    replayStrategicTurns?: readonly StrategicTurnRecordV10R8[];
    /** Exact terminal tick for an R8 replay that ends with an uncommitted provider call. */
    replayFinalTick?: number;
    plannerFactory?: (state: SimulationStateV10) => LoomkeeperPlannerV10;
    onTransition?: (update: CoordinatorUpdateV10) => void;
    onTerminal?: (result: CoordinatorTerminalResultV10) => void;
    /** Bounded operational metadata; never includes session identifiers or raw exceptions. */
    onSafetyStop?: (diagnostic: { reason: V10StopReason; tick: number; turn: number;
        phase: LiveSimulationStateV10['phase']; actor: SimulationActor; dueTicks: number;
        planningTicks: number; maximumPlanningBatchUs: number }) => void;
};
type StrategicRuntimeV10R8 = {
    source?: SimulationStateV10R8;
    currentStrategy: CommittedStrategicVoyageV10R8;
    recentChanges: RecentStrategicChangesV10R8;
    request?: Promise<void>;
    ready?: PendingStrategicTurnV10R8;
    decisionStateHash?: string;
    executing?: Readonly<{ recordIndex: number; candidate: StrategicCandidateSummaryV10R8 }>;
    lastObserved?: SimulationStateV10R8;
    lastAction?: string;
    lastObservedResult?: string;
    planningWorkUs: number;
};
type Entry = {
    replay: CoordinatorReplayV10 | CoordinatorReplayV10Automated; state: LiveSimulationStateV10; stateHash: string; bytes: number;
    paused: boolean; unavailable: boolean; anchorUs: number; credit: bigint;
    automated: boolean; aiTurn?: number; planningElapsed?: number; planner?: LivePlannerV10;
    planningFailed?: boolean; execution?: LiveExecutionV10;
    runtimeFailed?: boolean; stopReason?: V10StopReason; maximumPlanningBatchUs?: number;
    terminalResult?: CoordinatorTerminalResultV10; pendingTerminal?: CoordinatorTerminalResultV10;
    strategic?: StrategicRuntimeV10R8;
};

/** Candidate V10 authority. Ordinary V10 foundations and tagged automated matches remain distinct. */
export class LiveSimulationCoordinatorV10 {
    private readonly matches = new Map<string, Entry>();
    private readonly nowUs: () => number;
    private readonly yieldBatch: () => Promise<void>;
    private readonly maxRecords: number;
    private readonly maxBytes: number;
    private readonly identity: LiveV10Identity;
    private readonly timer?: NodeJS.Timeout;
    private ticking = false;
    private replayVerificationKernel = false;

    public constructor(private readonly options: LiveSimulationCoordinatorV10Options = {}) {
        this.nowUs = options.nowUs ?? (() => Number(process.hrtime.bigint() / 1000n));
        this.yieldBatch = options.yieldBatch ?? (() => new Promise(resolve => setImmediate(resolve)));
        this.maxRecords = bounded(options.maxReplayRecords ?? V10_REPLAY_LIMITS.records, 2, V10_REPLAY_LIMITS.records);
        this.maxBytes = bounded(options.maxReplayBytes ?? V10_REPLAY_LIMITS.bytes, 1024, V10_REPLAY_LIMITS.bytes);
        this.identity = validateLiveIdentity(options.replayIdentity ?? {
            rulesetId: CURRENT_V10_RULESET_ID,
            automationId: V10_AUTOMATION_ID
        });
        if (options.tickIntervalMs !== undefined) {
            bounded(options.tickIntervalMs, 1, 1000);
            this.timer = setInterval(() => { void this.pumpAll(); }, options.tickIntervalMs);
            this.timer.unref();
        }
    }

    public create(challengeId: string, sessionId: string, seed: number, calling: PlayerCalling): CoordinatorSnapshotV10 {
        if (this.matches.has(challengeId)) throw new Error('Duplicate V10 challenge.');
        if (this.identity.rulesetId === V10_R8_RULESET_ID) throw new Error('R8 requires an automated objective identity.');
        const state = createState(seed, calling, this.identity.rulesetId);
        const stateHash = hashLiveState(state);
        const replay = CoordinatorReplayV10Schema.parse({ formatVersion: 10, challengeId, sessionId, seed, calling,
            rulesetId: this.identity.rulesetId, terrainProfileId: state.terrainProfileId, recipeRevision: state.terrainRecipeRevision, candidateIndex: state.terrainCandidateIndex, initialStateHash: stateHash, records: [] });
        const entry: Entry = { replay, state, stateHash, bytes: jsonBytesV10(replay), paused: false,
            unavailable: false, anchorUs: this.clock(), credit: 0n, automated: false };
        if (entry.bytes + V10_REPLAY_LIMITS.terminalBytes > this.maxBytes) throw new Error('No terminal replay reserve.');
        this.matches.set(challengeId, entry);
        return this.snapshot(entry);
    }

    public createAutomated(challengeId: string, sessionId: string, seed: number, calling: PlayerCalling,
        config?: Readonly<{ objectiveMode: V10R8ObjectiveMode }>): CoordinatorSnapshotV10 & { automationId: V10AutomationId } {
        if (this.matches.has(challengeId)) throw new Error('Duplicate V10 challenge.');
        const identity = config ? liveIdentityForRuleset(V10_R8_RULESET_ID) : this.identity;
        const state = createState(seed, calling, identity.rulesetId, config?.objectiveMode), stateHash = hashLiveState(state);
        const replay = CoordinatorReplayV10AutomatedSchema.parse({ formatVersion: 10, challengeId, sessionId, seed, calling,
            rulesetId: identity.rulesetId, terrainProfileId: state.terrainProfileId, recipeRevision: state.terrainRecipeRevision, candidateIndex: state.terrainCandidateIndex,
            ...(isR8State(state) ? { objectiveMode: state.objective.objectiveMode,
                objectiveRecipeRevision: V10_R8_OBJECTIVE_RECIPE_REVISION,
                strategyPolicyId: V10_R8_STRATEGY_POLICY_ID,
                strategicTurns: [] } : {}),
            automationId: identity.automationId, initialStateHash: stateHash, records: [], chosenPlans: [] });
        const entry: Entry = { replay, state, stateHash, bytes: jsonBytesV10(replay), paused: false, unavailable: false,
            anchorUs: this.clock(), credit: 0n, automated: true,
            ...(isR8State(state) ? { strategic: {
                currentStrategy: EMPTY_COMMITTED_VOYAGE_V10_R8,
                recentChanges: EMPTY_RECENT_CHANGES_V10_R8,
                planningWorkUs: 0
            } } : {}) };
        if (entry.bytes + V10_REPLAY_LIMITS.terminalBytes > this.maxBytes) throw new Error('No terminal replay reserve.');
        this.matches.set(challengeId, entry); return this.snapshot(entry) as CoordinatorSnapshotV10 & { automationId: V10AutomationId };
    }

    public get(challengeId: string): CoordinatorSnapshotV10 | undefined {
        const entry = this.matches.get(challengeId); return entry && this.snapshot(entry);
    }

    public apply(challengeId: string, actor: SimulationActor, intent: SimulationIntentV10,
        expectedTurn: number, expectedPhase: SimulationStateV10['phase'], expectedEpoch: number): CoordinatorUpdateV10 {
        const entry = this.require(challengeId);
        const operation = ReplayOperationV10Schema.parse({ kind: 'intent', actor, intent, expectedTurn, expectedPhase, expectedEpoch });
        if (entry.paused) return this.rejected(entry, 'The match is paused.');
        const transition = applyLiveIntent(entry.state, actor, intent, expectedTurn, expectedPhase, expectedEpoch);
        if (transition.error?.code === 'INTENT_LIMIT') {
            this.barrier(challengeId, { reason: 'intent_limit', actor, expectedTurn, expectedEpoch });
            return { ...this.snapshot(entry), transition: { ...transition, state: structuredClone(entry.state) } };
        }
        return this.accept(entry, transition, operation);
    }

    public barrier(challengeId: string, barrier: SimulationBarrierV10): CoordinatorUpdateV10 {
        const entry = this.require(challengeId);
        const operation = ReplayOperationV10Schema.parse({ kind: 'barrier', barrier });
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
        const transition = applyLiveBarrier(entry.state, barrier);
        if (transition.error?.code === 'LIFECYCLE_LIMIT') return this.safety(challengeId, 'lifecycle_limit');
        return this.accept(entry, transition, operation);
    }

    public async setPaused(challengeId: string, paused: boolean): Promise<CoordinatorSnapshotV10> {
        const entry = this.require(challengeId); if (!entry.paused) await this.catchUp(challengeId);
        if (entry.paused === paused) return this.snapshot(entry);
        const update = this.barrier(challengeId, { reason: paused ? 'pause' : 'resume', actor: 'player',
            expectedTurn: entry.state.turn, expectedEpoch: entry.state.inputEpoch });
        if (!update.transition.accepted) throw new Error(update.transition.error?.message ?? 'Pause rejected.');
        return this.snapshot(entry);
    }

    /** Test/planner transition API; V10B exposes no network path to it. */
    public advance(challengeId: string, count: number): CoordinatorUpdateV10 {
        bounded(count, 0, V10_REPLAY_LIMITS.ticks); const entry = this.require(challengeId);
        if (entry.paused) return this.rejected(entry, 'The match is paused.');
        const started = this.clock();
        try {
            let update = this.noop(entry);
            for (let index = 0; index < count && !entry.terminalResult; index++) {
                if (entry.automated) {
                    if (entry.strategic?.request && !entry.strategic.ready) break;
                    if (entry.strategic?.ready && !this.activateStrategicTurn(entry)) {
                        return this.safety(entry.replay.challengeId, 'replay_limit');
                    }
                    this.prepareAutomatedTick(entry);
                }
                const oldPhase = entry.state.phase, oldTick = entry.state.tick;
                const transition = advanceLiveTick(entry.state);
                update = this.accept(entry, transition, { kind: 'ticks', count: 1 }, false, !entry.automated);
                if (entry.automated) {
                    update = this.drainAutomated(entry, update);
                    if (entry.state.tick % 3 === 0 || oldPhase !== entry.state.phase || oldTick === entry.state.tick) {
                        assertLiveState(entry.state);
                        this.options.onTransition?.(structuredClone(update));
                    }
                }
            }
            assertLiveState(entry.state);
            return update;
        } finally {
            // Logical ticks already charge planning and simulation time. Exclude
            // all synchronous authority work, including state publication, so
            // larger R7 terrain cannot be counted again as scheduler debt.
            this.excludeMeasuredAuthorityWork(Math.max(0, this.clock() - started));
        }
    }

    public pump(challengeId: string): CoordinatorSnapshotV10 {
        const entry = this.require(challengeId); this.accrue(entry);
        if (entry.paused || entry.terminalResult) return this.snapshot(entry);
        if (entry.strategic?.request && !entry.strategic.ready) {
            entry.credit = 0n; entry.anchorUs = this.clock();
            return this.snapshot(entry);
        }
        if (entry.credit / 1_000_000n > 30n) return this.safety(challengeId, 'clock_debt');
        const count = Math.min(6, Number(entry.credit / 1_000_000n)); entry.credit -= BigInt(count) * 1_000_000n;
        if (count) this.advance(challengeId, count); return this.snapshot(entry);
    }
    public dueTicks(challengeId: string): number { return Number(this.require(challengeId).credit / 1_000_000n); }
    public async catchUp(challengeId: string): Promise<CoordinatorSnapshotV10> {
        let snapshot = this.pump(challengeId);
        while (snapshot.state.phase !== 'finished' && !snapshot.paused && this.dueTicks(challengeId) > 0) {
            await this.yieldBatch(); if (!this.matches.has(challengeId)) throw new Error('V10 match closed during catch-up.');
            snapshot = this.pump(challengeId);
        }
        return snapshot;
    }
    public async waitForStrategicDecision(challengeId: string): Promise<CoordinatorSnapshotV10> {
        const entry = this.require(challengeId);
        await entry.strategic?.request;
        if (!this.matches.has(challengeId)) throw new Error('V10 match closed during strategic decision.');
        return this.snapshot(this.require(challengeId));
    }
    public safety(challengeId: string, reason: Extract<ReplayOperationV10, { kind: 'safety' }>['reason'] | 'clock_debt'): CoordinatorUpdateV10 {
        const entry = this.require(challengeId); if (entry.terminalResult) return this.noop(entry);
        entry.stopReason = entry.runtimeFailed ? 'runtime_error' : reason;
        this.options.onSafetyStop?.({ reason: entry.stopReason, tick: entry.state.tick, turn: entry.state.turn,
            phase: entry.state.phase, actor: entry.state.activeActor, dueTicks: this.dueTicks(challengeId),
            planningTicks: entry.planningElapsed ?? 0, maximumPlanningBatchUs: entry.maximumPlanningBatchUs ?? 0 });
        entry.unavailable = reason !== 'replay_limit' && reason !== 'left'; entry.paused = false; entry.credit = 0n;
        return this.accept(entry, forceLiveLimit(entry.state), { kind: 'safety', reason: reason === 'clock_debt' ? 'expiry' : reason }, true);
    }
    public replay(challengeId: string): CoordinatorReplayV10 | CoordinatorReplayV10Automated | undefined {
        const entry = this.matches.get(challengeId); return entry && structuredClone(entry.replay);
    }

    public reconstructAndVerify(input: unknown, expected?: { challengeId: string; sessionId: string }): CoordinatorSnapshotV10 {
        this.assertReplayBounds(input);
        if (isV10AutomationId((input as { automationId?: unknown })?.automationId)) return this.reconstructAutomated(input, expected);
        const replay = CoordinatorReplayV10Schema.parse(input);
        if (expected && (expected.challengeId !== replay.challengeId || expected.sessionId !== replay.sessionId)) throw new Error('V10 replay ownership mismatch.');
        let totalTicks = 0;
        for (const record of replay.records) if (record.operation.kind === 'ticks') totalTicks += record.operation.count;
        if (totalTicks > V10_REPLAY_LIMITS.ticks) throw new Error('V10 replay tick limit exceeded.');
        const verifier = new LiveSimulationCoordinatorV10({ nowUs: () => 0, maxReplayRecords: this.maxRecords,
            maxReplayBytes: this.maxBytes, replayIdentity: liveIdentityForRuleset(replay.rulesetId) });
        try {
            const initial = verifier.create(replay.challengeId, replay.sessionId, replay.seed, replay.calling);
            if (initial.stateHash !== replay.initialStateHash) throw new Error('V10 initial hash mismatch.');
            for (let index = 0; index < replay.records.length; index++) {
                const record = replay.records[index]; if (record.index !== index) throw new Error('V10 replay index is not contiguous.');
                const before = verifier.get(replay.challengeId)!; const op = record.operation;
                if (op.kind === 'automatic') {
                    const generated = verifier.require(replay.challengeId).replay.records[index];
                    if (!generated || JSON.stringify(generated) !== JSON.stringify(record)) throw new Error('V10 automatic boundary does not match authority.');
                    continue;
                }
                if (verifier.require(replay.challengeId).replay.records[index]?.operation.kind === 'automatic') throw new Error('Missing V10 automatic boundary.');
                if (before.state.phase === 'finished') throw new Error('V10 replay extends beyond terminal state.');
                const update = op.kind === 'intent' ? verifier.apply(replay.challengeId, op.actor, op.intent as SimulationIntentV10, op.expectedTurn, op.expectedPhase, op.expectedEpoch)
                    : op.kind === 'barrier' ? verifier.barrier(replay.challengeId, op.barrier)
                        : op.kind === 'ticks' ? verifier.advance(replay.challengeId, op.count) : verifier.safety(replay.challengeId, op.reason);
                if (!update.transition.accepted || !update.transition.mutated || update.stateHash !== record.stateHash ||
                    (op.kind === 'ticks' && update.state.tick - before.state.tick !== op.count)) throw new Error(`V10 replay divergence at ${index}.`);
            }
            const result = verifier.get(replay.challengeId)!;
            if (JSON.stringify(verifier.require(replay.challengeId).replay.records) !== JSON.stringify(replay.records))
                throw new Error('V10 replay is missing or changes canonical operation boundaries.');
            return { ...result, replayLength: replay.records.length };
        } finally { verifier.dispose(); }
    }
    /** Current reward settlement yields between bounded replay batches. */
    public async reconstructAndVerifyAsync(input: unknown,
        expected?: { challengeId: string; sessionId: string }): Promise<CoordinatorSnapshotV10> {
        this.assertReplayBounds(input);
        if (isV10AutomationId((input as { automationId?: unknown })?.automationId)) {
            return this.reconstructAutomatedAsync(input, expected);
        }
        return this.reconstructAndVerify(input, expected);
    }
    private reconstructAutomated(input: unknown, expected?: { challengeId: string; sessionId: string }): CoordinatorSnapshotV10 {
        const replay = CoordinatorReplayV10AutomatedSchema.parse(input);
        if (expected && (expected.challengeId !== replay.challengeId || expected.sessionId !== replay.sessionId)) throw new Error('V10 replay ownership mismatch.');
        if (replay.chosenPlans.some(plan => plan.status === 'work_failure')) throw new Error('A V10 work failure is not automated-policy proof.');
        const verifier = new LiveSimulationCoordinatorV10({ nowUs: () => 0, maxReplayRecords: this.maxRecords,
            maxReplayBytes: this.maxBytes, replayIdentity: validateLiveIdentity({
                rulesetId: replay.rulesetId as LiveV10RulesetId,
                automationId: replay.automationId
            }), ...(replay.rulesetId === V10_R8_RULESET_ID
                ? { replayStrategicTurns: replay.strategicTurns, replayFinalTick: replayTickCount(replay.records) }
                : {}) });
        verifier.replayVerificationKernel = true;
        try {
            const initial = verifier.createAutomated(replay.challengeId, replay.sessionId, replay.seed, replay.calling,
                replay.rulesetId === V10_R8_RULESET_ID ? { objectiveMode: replay.objectiveMode } : undefined);
            if (initial.stateHash !== replay.initialStateHash) throw new Error('V10 initial hash mismatch.');
            let cursor = 0;
            while (cursor < replay.records.length) {
                let generated = verifier.require(replay.challengeId).replay.records[cursor];
                if (generated) {
                    const expectedRecord = replay.records[cursor];
                    if (generated.operation.kind === 'ticks' && expectedRecord.operation.kind === 'ticks' &&
                        generated.operation.count < expectedRecord.operation.count) {
                        verifier.advance(replay.challengeId, expectedRecord.operation.count - generated.operation.count);
                        generated = verifier.require(replay.challengeId).replay.records[cursor];
                    }
                    if (JSON.stringify(generated) !== JSON.stringify(expectedRecord)) {
                        throw new Error(`V10 automated replay divergence at ${cursor}: expected ${JSON.stringify(expectedRecord.operation)}, generated ${JSON.stringify(generated?.operation)}.`);
                    }
                    cursor += 1;
                    continue;
                }
                const operation = replay.records[cursor].operation;
                if (operation.kind === 'automatic' || (operation.kind === 'intent' && operation.actor === 'loomkeeper') ||
                    (operation.kind === 'barrier' && operation.barrier.actor === 'loomkeeper')) throw new Error(`Missing generated V10 policy operation at ${cursor}.`);
                if (verifier.get(replay.challengeId)!.state.phase === 'finished') throw new Error('V10 replay extends beyond terminal state.');
                if (operation.kind === 'intent') verifier.apply(replay.challengeId, operation.actor, operation.intent as SimulationIntentV10, operation.expectedTurn, operation.expectedPhase, operation.expectedEpoch);
                else if (operation.kind === 'barrier') verifier.barrier(replay.challengeId, operation.barrier);
                else if (operation.kind === 'ticks') verifier.advance(replay.challengeId, operation.count);
                else verifier.safety(replay.challengeId, operation.reason);
                if (!verifier.require(replay.challengeId).replay.records[cursor]) throw new Error(`V10 replay operation did not mutate at ${cursor}.`);
            }
            const regenerated = verifier.require(replay.challengeId).replay;
            if (JSON.stringify(regenerated.records) !== JSON.stringify(replay.records) || !('chosenPlans' in regenerated) ||
                JSON.stringify(regenerated.chosenPlans) !== JSON.stringify(replay.chosenPlans) ||
                (replay.rulesetId === V10_R8_RULESET_ID && (!('strategicTurns' in regenerated) ||
                    JSON.stringify(regenerated.strategicTurns) !== JSON.stringify(replay.strategicTurns)))) {
                throw new Error('V10 automated policy proof is incomplete or changed.');
            }
            return verifier.get(replay.challengeId)!;
        } finally { verifier.dispose(); }
    }
    private async reconstructAutomatedAsync(input: unknown,
        expected?: { challengeId: string; sessionId: string }): Promise<CoordinatorSnapshotV10> {
        const replay = CoordinatorReplayV10AutomatedSchema.parse(input);
        if (expected && (expected.challengeId !== replay.challengeId || expected.sessionId !== replay.sessionId)) throw new Error('V10 replay ownership mismatch.');
        if (replay.chosenPlans.some(plan => plan.status === 'work_failure')) throw new Error('A V10 work failure is not automated-policy proof.');
        const verifier = new LiveSimulationCoordinatorV10({ nowUs: () => 0, maxReplayRecords: this.maxRecords,
            maxReplayBytes: this.maxBytes, replayIdentity: validateLiveIdentity({
                rulesetId: replay.rulesetId as LiveV10RulesetId,
                automationId: replay.automationId
            }), ...(replay.rulesetId === V10_R8_RULESET_ID
                ? { replayStrategicTurns: replay.strategicTurns, replayFinalTick: replayTickCount(replay.records) }
                : {}) });
        verifier.replayVerificationKernel = true;
        try {
            const initial = verifier.createAutomated(replay.challengeId, replay.sessionId, replay.seed, replay.calling,
                replay.rulesetId === V10_R8_RULESET_ID ? { objectiveMode: replay.objectiveMode } : undefined);
            if (initial.stateHash !== replay.initialStateHash) throw new Error('V10 initial hash mismatch.');
            let cursor = 0;
            while (cursor < replay.records.length) {
                let generated = verifier.require(replay.challengeId).replay.records[cursor];
                if (generated) {
                    const expectedRecord = replay.records[cursor];
                    if (generated.operation.kind === 'ticks' && expectedRecord.operation.kind === 'ticks' &&
                        generated.operation.count < expectedRecord.operation.count) {
                        let remaining = expectedRecord.operation.count - generated.operation.count;
                        while (remaining > 0) {
                            const count = Math.min(REPLAY_VERIFICATION_TICK_BATCH, remaining);
                            verifier.advance(replay.challengeId, count);
                            remaining -= count;
                            await this.yieldBatch();
                        }
                        generated = verifier.require(replay.challengeId).replay.records[cursor];
                    }
                    if (JSON.stringify(generated) !== JSON.stringify(expectedRecord)) {
                        throw new Error(`V10 automated replay divergence at ${cursor}: expected ${JSON.stringify(expectedRecord.operation)}, generated ${JSON.stringify(generated?.operation)}.`);
                    }
                    cursor += 1;
                    continue;
                }
                const operation = replay.records[cursor].operation;
                if (operation.kind === 'automatic' || (operation.kind === 'intent' && operation.actor === 'loomkeeper') ||
                    (operation.kind === 'barrier' && operation.barrier.actor === 'loomkeeper')) throw new Error(`Missing generated V10 policy operation at ${cursor}.`);
                if (verifier.get(replay.challengeId)!.state.phase === 'finished') throw new Error('V10 replay extends beyond terminal state.');
                if (operation.kind === 'intent') verifier.apply(replay.challengeId, operation.actor, operation.intent as SimulationIntentV10, operation.expectedTurn, operation.expectedPhase, operation.expectedEpoch);
                else if (operation.kind === 'barrier') verifier.barrier(replay.challengeId, operation.barrier);
                else if (operation.kind === 'ticks') {
                    let remaining = operation.count;
                    while (remaining > 0) {
                        const count = Math.min(REPLAY_VERIFICATION_TICK_BATCH, remaining);
                        verifier.advance(replay.challengeId, count); remaining -= count;
                        await this.yieldBatch();
                    }
                } else verifier.safety(replay.challengeId, operation.reason);
                if (!verifier.require(replay.challengeId).replay.records[cursor]) throw new Error(`V10 replay operation did not mutate at ${cursor}.`);
            }
            const regenerated = verifier.require(replay.challengeId).replay;
            if (JSON.stringify(regenerated.records) !== JSON.stringify(replay.records) || !('chosenPlans' in regenerated) ||
                JSON.stringify(regenerated.chosenPlans) !== JSON.stringify(replay.chosenPlans) ||
                (replay.rulesetId === V10_R8_RULESET_ID && (!('strategicTurns' in regenerated) ||
                    JSON.stringify(regenerated.strategicTurns) !== JSON.stringify(replay.strategicTurns)))) {
                throw new Error('V10 automated policy proof is incomplete or changed.');
            }
            return verifier.get(replay.challengeId)!;
        } finally { verifier.dispose(); }
    }
    public takePendingTerminalResult(challengeId: string): CoordinatorTerminalResultV10 | undefined {
        const entry = this.matches.get(challengeId); const result = entry?.pendingTerminal; if (entry) entry.pendingTerminal = undefined;
        return result && structuredClone(result);
    }
    public delete(challengeId: string): boolean {
        this.options.strategicAdapter?.cancelMatch(challengeId);
        return this.matches.delete(challengeId);
    }
    public deleteForSession(sessionId: string): void {
        for (const [id, entry] of this.matches) if (entry.replay.sessionId === sessionId) {
            this.options.strategicAdapter?.cancelMatch(id); this.matches.delete(id);
        }
    }
    public dispose(): void {
        if (this.timer) clearInterval(this.timer);
        for (const id of this.matches.keys()) this.options.strategicAdapter?.cancelMatch(id);
        this.matches.clear();
    }

    private accept(entry: Entry, transition: LiveSimulationTransitionV10, operation: ReplayOperationV10, reserve = false, notify = true): CoordinatorUpdateV10 {
        if (!transition.accepted || !transition.mutated) return this.replayVerificationKernel
            ? this.verificationUpdate(entry, transition)
            : { ...this.snapshot(entry), transition: structuredClone(transition) };
        const stateHash = this.replayVerificationKernel || operation.kind === 'ticks'
            ? hashValidatedLiveState(transition.state)
            : hashLiveState(transition.state);
        const automatic: ReplayOperationV10[] = reserve ? [] : transition.events.filter(event => event.type === 'input_barrier').map(event =>
            event.reason === 'phase' ? { kind: 'automatic', reason: 'phase', tick: transition.state.tick, inputEpoch: transition.state.inputEpoch, phase: transition.state.phase }
                : { kind: 'automatic', reason: 'lease_expired', tick: transition.state.tick, inputEpoch: transition.state.inputEpoch });
        const last = entry.replay.records.at(-1); const coalesce = !automatic.length && operation.kind === 'ticks' && last?.operation.kind === 'ticks';
        const combined: ReplayOperationV10 = coalesce && operation.kind === 'ticks' && last!.operation.kind === 'ticks'
            ? { kind: 'ticks', count: last!.operation.count + operation.count } : operation;
        const record = { index: coalesce ? last!.index : entry.replay.records.length, operation: combined, stateHash };
        const annotations = automatic.map((item, index) => ({ index: record.index + index + 1, operation: item, stateHash }));
        const bytes = entry.bytes + jsonBytesV10(record) - (coalesce ? jsonBytesV10(last) : 0) + (!coalesce && entry.replay.records.length ? 1 : 0)
            + annotations.reduce((total, item) => total + jsonBytesV10(item) + 1, 0);
        if (jsonBytesV10(record) > V10_REPLAY_LIMITS.operationBytes || entry.replay.records.length + (coalesce ? 0 : 1) + annotations.length > this.maxRecords - (reserve ? 0 : 1) ||
            bytes > this.maxBytes - (reserve ? 0 : V10_REPLAY_LIMITS.terminalBytes)) {
            if (reserve) throw new Error('V10 terminal reserve invariant violated.'); return this.safety(entry.replay.challengeId, 'replay_limit');
        }
        const oldPhase = entry.state.phase; entry.state = transition.state; entry.stateHash = stateHash; entry.bytes = bytes;
        if (operation.kind === 'barrier' && (operation.barrier.reason === 'pause' || operation.barrier.reason === 'resume')) {
            entry.paused = operation.barrier.reason === 'pause'; entry.anchorUs = this.clock(); entry.credit = 0n;
        }
        if (coalesce) entry.replay.records[entry.replay.records.length - 1] = record; else entry.replay.records.push(record);
        entry.replay.records.push(...annotations);
        this.commitStrategicTurnIfObserved(entry);
        if (entry.state.phase === 'finished' && !entry.terminalResult) {
            entry.terminalResult = { rulesetId: liveRulesetId(entry.replay.rulesetId), challengeId: entry.replay.challengeId, sessionId: entry.replay.sessionId,
                winner: entry.state.winner, reason: objectiveResultReason(entry.state), tick: entry.state.tick, stateHash,
                ...(entry.stopReason ? { stopReason: entry.stopReason } : {}),
                ...(entry.automated && 'automationId' in entry.replay ? { automationId: entry.replay.automationId } : {}) };
            entry.pendingTerminal = entry.terminalResult; this.options.onTerminal?.(structuredClone(entry.terminalResult));
        }
        const update = this.replayVerificationKernel
            ? this.verificationUpdate(entry, transition)
            : { ...this.snapshot(entry), transition: structuredClone(transition) };
        if (notify && (operation.kind !== 'ticks' || entry.state.tick % 3 === 0 || oldPhase !== entry.state.phase || transition.events.some(event => event.type === 'phase_changed'))) {
            if (operation.kind === 'ticks') assertLiveState(entry.state);
            this.options.onTransition?.(update);
        }
        return update;
    }
    /** Internal verifier view. Nothing returned here crosses the replay trust boundary. */
    private verificationUpdate(entry: Entry, transition: LiveSimulationTransitionV10): CoordinatorUpdateV10 {
        return { challengeId: entry.replay.challengeId, sessionId: entry.replay.sessionId, state: entry.state,
            stateHash: entry.stateHash, replayLength: entry.replay.records.length, paused: entry.paused,
            unavailable: entry.unavailable, transition,
            ...(entry.automated && 'automationId' in entry.replay ? { automationId: entry.replay.automationId } : {}),
            ...(entry.terminalResult ? { terminalResult: entry.terminalResult } : {}) };
    }
    private snapshot(entry: Entry): CoordinatorSnapshotV10 { return { challengeId: entry.replay.challengeId, sessionId: entry.replay.sessionId, state: structuredClone(entry.state), stateHash: entry.stateHash, replayLength: entry.replay.records.length, paused: entry.paused, unavailable: entry.unavailable, ...(entry.automated && 'automationId' in entry.replay ? { automationId: entry.replay.automationId } : {}), ...(entry.terminalResult ? { terminalResult: structuredClone(entry.terminalResult) } : {}) }; }
    private noop(entry: Entry): CoordinatorUpdateV10 {
        const transition: LiveSimulationTransitionV10 = { accepted: true, mutated: false, state: entry.state, events: [] };
        return this.replayVerificationKernel
            ? this.verificationUpdate(entry, transition)
            : { ...this.snapshot(entry), transition: structuredClone(transition) };
    }
    private rejected(entry: Entry, message: string): CoordinatorUpdateV10 { return { ...this.snapshot(entry), transition: { accepted: false, mutated: false, state: structuredClone(entry.state), events: [], error: { code: 'COMMAND_REJECTED', message } } }; }
    private resumeInterruptedThreadleap(entry: Entry): LiveSimulationTransitionV10 {
        if (entry.state.lifecycleBarrierCount >= 128) {
            return { accepted: false, mutated: false, state: structuredClone(entry.state), events: [],
                error: { code: 'LIFECYCLE_LIMIT', message: 'Lifecycle budget exhausted.' } };
        }
        if (entry.state.revision >= 65534 || entry.state.inputEpoch >= 65534) return forceLiveLimit(entry.state);
        const state = structuredClone(entry.state);
        state.heldDirection = 0; state.leaseExpiresTick = null; state.lastLeaseRefreshTick = null; state.aim = null;
        state.units[0].vxFp = 0; state.inputEpoch += 1; state.lifecycleBarrierCount += 1; state.revision += 1;
        assertLiveState(state);
        return { accepted: true, mutated: true, state, events: [] };
    }
    private prepareAutomatedTick(entry: Entry): void {
        if (!entry.automated || entry.state.phase !== 'action' || entry.state.activeActor !== 'loomkeeper') return;
        if (entry.aiTurn !== entry.state.turn) {
            entry.aiTurn = entry.state.turn; entry.planningElapsed = 0; entry.planningFailed = false; entry.execution = undefined;
            entry.planner = undefined;
            if (isR8State(entry.state) && entry.strategic) {
                entry.strategic.source = structuredClone(entry.state);
                entry.strategic.recentChanges = this.recentStrategicChanges(entry, entry.state);
                entry.strategic.request = undefined;
                entry.strategic.ready = undefined;
                entry.strategic.decisionStateHash = undefined;
                entry.strategic.executing = undefined;
                entry.strategic.planningWorkUs = 0;
            }
        }
        if ((entry.planningElapsed ?? 0) >= 30) return;
        if (!entry.planningFailed) {
            const started = this.clock();
            try {
                entry.planner ??= isR8State(entry.state)
                    ? new LoomkeeperPlannerV10R8(entry.state)
                    : this.options.plannerFactory?.(structuredClone(entry.state)) ?? new LoomkeeperPlannerV10(entry.state);
                entry.planner.step();
            } catch { entry.planningFailed = true; entry.planner = undefined; }
            finally {
                const planningWorkUs = Math.max(0, this.clock() - started);
                entry.maximumPlanningBatchUs = Math.max(entry.maximumPlanningBatchUs ?? 0, planningWorkUs);
                if (entry.strategic) entry.strategic.planningWorkUs += planningWorkUs;
            }
        }
        entry.planningElapsed = (entry.planningElapsed ?? 0) + 1;
    }
    private drainAutomated(entry: Entry, initial: CoordinatorUpdateV10): CoordinatorUpdateV10 {
        if (!entry.automated || entry.state.phase === 'finished') return initial;
        if (entry.state.phase === 'action' && entry.state.activeActor === 'loomkeeper' && entry.aiTurn === entry.state.turn &&
            entry.planningElapsed === 30 && !this.hasSelection(entry, entry.state.turn)) {
            const selection: LoomkeeperSelectionV10 = entry.planningFailed ? { prefix: 'none', status: 'work_failure', ordinal: null } : entry.planner!.selection;
            if (isR8State(entry.state) && selection.status === 'selected') {
                if (!entry.strategic?.request && !entry.strategic?.ready) this.beginStrategicDecision(entry, selection);
            } else {
                // This write is the debit barrier: an execution is impossible until the plan is retained.
                if (!this.recordSelection(entry, entry.state.turn, selection)) return this.safety(entry.replay.challengeId, 'replay_limit');
                if (selection.status === 'selected') entry.execution = new LoomkeeperExecutionV10(
                    entry.planner!.selectedCandidate()!, selection.prefix, entry.state as SimulationStateV10
                );
            }
        }
        if (!entry.execution) return initial;
        let update = initial;
        for (let count = 0; count < 8; count += 1) {
            const operation = nextExecution(entry.execution, entry.state, this.replayVerificationKernel);
            if (!operation) break;
            const before = entry.state;
            const transition = operation.kind === 'intent'
                ? applyLiveIntent(before, 'loomkeeper', operation.intent, before.turn, before.phase, before.inputEpoch)
                : applyLiveBarrier(before, operation.barrier);
            if (!transition.accepted) throw new Error(`Authoritative V10 policy emitted an illegal operation: ${transition.error?.message ?? 'unknown'}`);
            if (!transition.mutated) continue;
            const replayOperation: ReplayOperationV10 = operation.kind === 'intent'
                ? { kind: 'intent', actor: 'loomkeeper', intent: operation.intent, expectedTurn: before.turn, expectedPhase: before.phase, expectedEpoch: before.inputEpoch }
                : { kind: 'barrier', barrier: operation.barrier };
            update = this.accept(entry, transition, ReplayOperationV10Schema.parse(replayOperation), false, false);
        }
        return update;
    }
    private beginStrategicDecision(entry: Entry, fallbackSelection: LoomkeeperSelectionV10): void {
        if (!isR8State(entry.state) || !entry.strategic?.source || fallbackSelection.status !== 'selected') {
            throw new Error('R8 strategic decision requires a selected deterministic fallback.');
        }
        const strategic = entry.strategic;
        const boundaryStarted = this.clock();
        const boundary = buildStrategicDecisionBoundaryV10R8({
            challengeId: entry.replay.challengeId,
            state: strategic.source,
            deterministicFallback: {
                candidate: entry.planner!.selectedCandidate()!,
                prefix: fallbackSelection.prefix
            },
            currentStrategy: strategic.currentStrategy,
            recentChanges: strategic.recentChanges
        });
        const preparationMs = Math.round((strategic.planningWorkUs + Math.max(0, this.clock() - boundaryStarted)) / 1_000);
        const expected = this.replayVerificationKernel
            ? this.options.replayStrategicTurns?.find(record => record.turn === entry.state.turn)
            : undefined;
        if (this.replayVerificationKernel) {
            // A replay may end while its provider request is still uncommitted.
            // Any later policy operation still fails reconstruction because no
            // capability is activated without a retained strategic turn.
            if (!expected) {
                if (this.options.replayFinalTick === entry.state.tick) return;
                throw new Error('Strategic replay is missing the current turn record.');
            }
            const providerResult = providerResultFromReplay(expected);
            const pending = authorizeStrategicTurnV10R8({
                boundary,
                state: strategic.source,
                currentStrategy: strategic.currentStrategy,
                ...(providerResult ? { providerResult } : {})
            });
            const expectedPending = StrategicTurnRecordV10R8Schema.parse({
                ...expected,
                status: 'pending',
                committedVoyage: null,
                observedStateHash: null
            });
            if (JSON.stringify(pending.record) !== JSON.stringify(expectedPending)) {
                throw new Error('Strategic replay decision boundary changed.');
            }
            strategic.ready = pending;
            strategic.decisionStateHash = entry.stateHash;
            return;
        }
        if (!this.options.strategicAdapter) {
            strategic.ready = authorizeStrategicTurnV10R8({
                boundary,
                state: strategic.source,
                currentStrategy: strategic.currentStrategy
            });
            strategic.decisionStateHash = entry.stateHash;
            return;
        }
        const decisionStateHash = entry.stateHash;
        const decisionTurn = entry.state.turn;
        strategic.decisionStateHash = decisionStateHash;
        let request!: Promise<void>;
        request = this.options.strategicAdapter.request(
            entry.replay.challengeId,
            boundary.brief,
            preparationMs
        ).then(providerResult => {
            const current = this.matches.get(entry.replay.challengeId);
            if (current !== entry || !entry.strategic || entry.strategic.request !== request) return;
            if (entry.stateHash !== decisionStateHash ||
                entry.state.turn !== decisionTurn) {
                entry.strategic.request = undefined;
                entry.strategic.decisionStateHash = undefined;
                entry.aiTurn = undefined;
                return;
            }
            entry.strategic.ready = authorizeStrategicTurnV10R8({
                boundary,
                state: entry.strategic.source!,
                currentStrategy: entry.strategic.currentStrategy,
                providerResult
            });
            try {
                this.options.onStrategicTurnObserved?.(entry.strategic.ready.record);
            } catch {
                // Operational telemetry cannot interrupt deterministic fallback authority.
            }
            entry.anchorUs = this.clock();
            entry.credit = 0n;
        });
        strategic.request = request;
    }
    private activateStrategicTurn(entry: Entry): boolean {
        if (!isR8State(entry.state) || !entry.strategic?.ready || !('strategicTurns' in entry.replay)) return false;
        const pending = entry.strategic.ready;
        const executing = executingStrategicTurnV10R8(pending.record);
        const resolved = pending.boundary.consume(pending.capability);
        const selection: LoomkeeperSelectionV10 = {
            prefix: resolved.prefix,
            status: 'selected',
            ordinal: resolved.candidate.ordinal
        };
        const previousPlans = entry.replay.chosenPlans;
        const previousTurns = entry.replay.strategicTurns;
        entry.replay.chosenPlans = [...previousPlans, { turn: entry.state.turn, ...selection }];
        entry.replay.strategicTurns = [...previousTurns, executing];
        const executingBytes = jsonBytesV10(entry.replay);
        const reserved = committedStrategicTurnV10R8(executing, '0'.repeat(64));
        entry.replay.strategicTurns[entry.replay.strategicTurns.length - 1] = reserved;
        const committedBytes = jsonBytesV10(entry.replay);
        entry.replay.strategicTurns[entry.replay.strategicTurns.length - 1] = executing;
        if (Math.max(executingBytes, committedBytes) > this.maxBytes - V10_REPLAY_LIMITS.terminalBytes) {
            entry.replay.chosenPlans = previousPlans;
            entry.replay.strategicTurns = previousTurns;
            return false;
        }
        entry.bytes = executingBytes;
        entry.execution = new LoomkeeperExecutionV10R8(resolved.candidate, resolved.prefix, entry.state);
        entry.strategic.executing = Object.freeze({
            recordIndex: entry.replay.strategicTurns.length - 1,
            candidate: pending.candidate
        });
        entry.strategic.ready = undefined;
        entry.strategic.request = undefined;
        return true;
    }
    private commitStrategicTurnIfObserved(entry: Entry): void {
        if (!entry.strategic?.executing || !('strategicTurns' in entry.replay) || !isR8State(entry.state)) return;
        const executing = entry.replay.strategicTurns[entry.strategic.executing.recordIndex];
        if (!executing || executing.status !== 'executing') throw new Error('Strategic execution record is missing.');
        if (entry.state.phase !== 'finished' && entry.state.turn === executing.turn) return;
        const committed = committedStrategicTurnV10R8(executing, entry.stateHash);
        entry.replay.strategicTurns[entry.strategic.executing.recordIndex] = committed;
        const bytes = jsonBytesV10(entry.replay);
        if (bytes > this.maxBytes - V10_REPLAY_LIMITS.terminalBytes) {
            throw new Error('Strategic commit exceeded its reserved replay budget.');
        }
        entry.bytes = bytes;
        entry.strategic.currentStrategy = committed.committedVoyage!;
        entry.strategic.lastObserved = structuredClone(entry.state);
        entry.strategic.lastAction = describeStrategicAction(entry.strategic.executing.candidate);
        entry.strategic.lastObservedResult = describeStrategicResult(entry.strategic.executing.candidate);
        entry.strategic.executing = undefined;
    }
    private recentStrategicChanges(entry: Entry, current: SimulationStateV10R8): RecentStrategicChangesV10R8 {
        const strategic = entry.strategic;
        if (!strategic?.lastObserved) return EMPTY_RECENT_CHANGES_V10_R8;
        return deriveRecentStrategicChangesV10R8({
            previous: strategic.lastObserved,
            current,
            currentStrategy: strategic.currentStrategy,
            previousAction: strategic.lastAction ?? null,
            observedResult: strategic.lastObservedResult ?? null
        });
    }
    private hasSelection(entry: Entry, turn: number): boolean { return 'chosenPlans' in entry.replay && entry.replay.chosenPlans.some(plan => plan.turn === turn); }
    private excludeMeasuredAuthorityWork(elapsedUs: number): void {
        if (elapsedUs <= 0) return;
        for (const match of this.matches.values()) match.anchorUs += elapsedUs;
    }
    private recordSelection(entry: Entry, turn: number, selection: LoomkeeperSelectionV10): boolean {
        if (!('chosenPlans' in entry.replay)) throw new Error('Foundation replay cannot record automated selection.');
        const previous = entry.replay.chosenPlans;
        entry.replay.chosenPlans = [...previous, { turn, ...selection }];
        const bytes = jsonBytesV10(entry.replay);
        if (bytes > this.maxBytes - V10_REPLAY_LIMITS.terminalBytes) { entry.replay.chosenPlans = previous; return false; }
        entry.bytes = bytes; return true;
    }
    private assertReplayBounds(input: unknown): void {
        if (jsonBytesV10(input) > this.maxBytes) throw new Error('V10 replay byte limit exceeded.');
        const raw = input as { records?: unknown[] };
        if (!raw || !Array.isArray(raw.records) || raw.records.length > this.maxRecords) throw new Error('V10 replay record limit exceeded.');
        for (const record of raw.records) if (jsonBytesV10(record) > V10_REPLAY_LIMITS.operationBytes) throw new Error('V10 operation record byte limit exceeded.');
        let totalTicks = 0;
        for (const record of raw.records) if ((record as { operation?: { kind?: string; count?: unknown } }).operation?.kind === 'ticks')
            totalTicks += (record as { operation: { count: number } }).operation.count;
        if (totalTicks > V10_REPLAY_LIMITS.ticks) throw new Error('V10 replay tick limit exceeded.');
    }
    private require(id: string): Entry { const entry = this.matches.get(id); if (!entry) throw new Error('No V10 simulation for this challenge.'); return entry; }
    private clock(): number { return bounded(this.nowUs(), 0, Number.MAX_SAFE_INTEGER); }
    private accrue(entry: Entry): void { const now = this.clock(); if (now < entry.anchorUs) { this.safety(entry.replay.challengeId, 'clock_debt'); return; } if (!entry.paused && !entry.terminalResult) entry.credit += BigInt(now - entry.anchorUs) * 30n; entry.anchorUs = now; }
    private async pumpAll(): Promise<void> {
        if (this.ticking) return;
        this.ticking = true;
        try {
            for (const id of this.matches.keys()) {
                if (!this.matches.has(id)) continue;
                try { await this.catchUp(id); }
                catch {
                    const entry = this.matches.get(id);
                    if (entry) { entry.runtimeFailed = true; this.safety(id, 'clock_debt'); }
                }
            }
        } finally { this.ticking = false; }
    }

}

function providerResultFromReplay(record: StrategicTurnRecordV10R8): StrategicProviderResultV10R8 | undefined {
    if (record.providerMode === 'deterministic') return undefined;
    if (!record.modelId) throw new Error('Provider-backed strategic replay is missing its model identity.');
    return Object.freeze({
        outcome: record.operationalOutcome,
        decision: record.providerDecision,
        providerMode: record.providerMode,
        modelId: record.modelId,
        usage: record.usage,
        responseBytes: record.responseBytes,
        diagnostic: record.diagnostic,
        timingMs: record.timingMs
    });
}

function replayTickCount(records: readonly Readonly<{ operation?: ReplayOperationV10 }>[]): number {
    return records.reduce((total, record) => total +
        (record.operation?.kind === 'ticks' ? record.operation.count : 0), 0);
}

function describeStrategicAction(candidate: StrategicCandidateSummaryV10R8): string {
    const jump = candidate.action.jump ? ' with jump' : '';
    return `${candidate.candidateId}: ${candidate.action.movement}${jump}, then ${candidate.action.relicId}.`;
}

function describeStrategicResult(candidate: StrategicCandidateSummaryV10R8): string {
    const immediate = candidate.immediate;
    return `${candidate.candidateId} removed ${immediate.terrainCellsRemoved} terrain cells, changed player stitching by ${immediate.opponentStitchingDelta}, and objective score by ${immediate.objectiveScoreDelta}.`;
}

function createState(seed: number, calling: PlayerCalling, rulesetId: LiveV10RulesetId,
    objectiveMode?: V10R8ObjectiveMode): LiveSimulationStateV10 {
    return rulesetId === V10_R8_RULESET_ID
        ? createSimulationV10R8(seed, calling, objectiveMode)
        : createSimulationV10(seed, calling, rulesetId);
}
function liveRulesetId(value: unknown): LiveV10RulesetId {
    if (value !== V10_R6_RULESET_ID && value !== V10_R7_RULESET_ID && value !== V10_R8_RULESET_ID)
        throw new Error('Unsupported live V10 replay ruleset.');
    return value;
}
function liveIdentityForRuleset(value: unknown): LiveV10Identity {
    const rulesetId = liveRulesetId(value);
    return { rulesetId, automationId: rulesetId === V10_R6_RULESET_ID ? V10_R6_AUTOMATION_ID
        : rulesetId === V10_R8_RULESET_ID ? V10_R8_AUTOMATION_ID : V10_R7_AUTOMATION_ID };
}
function validateLiveIdentity(identity: LiveV10Identity): LiveV10Identity {
    const expected = liveIdentityForRuleset(identity.rulesetId);
    if (identity.automationId !== expected.automationId) throw new Error('Mismatched live V10 replay identity.');
    return identity;
}
function bounded(value: number, minimum: number, maximum: number): number {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError('V10 integer bound exceeded.');
    return value;
}

function isR8State(state: LiveSimulationStateV10): state is SimulationStateV10R8 {
    return state.rulesetId === V10_R8_RULESET_ID;
}

function applyLiveIntent(state: LiveSimulationStateV10, actor: SimulationActor, intent: SimulationIntentV10,
    expectedTurn: number, expectedPhase: LiveSimulationStateV10['phase'], expectedEpoch: number): LiveSimulationTransitionV10 {
    return isR8State(state)
        ? applySimulationIntentV10R8(state, actor, intent, expectedTurn, expectedPhase, expectedEpoch)
        : applySimulationIntentV10(state, actor, intent, expectedTurn, expectedPhase, expectedEpoch);
}

function applyLiveBarrier(state: LiveSimulationStateV10, barrier: SimulationBarrierV10): LiveSimulationTransitionV10 {
    return isR8State(state) ? applySimulationBarrierV10R8(state, barrier) : applySimulationBarrierV10(state, barrier);
}

function advanceLiveTick(state: LiveSimulationStateV10): LiveSimulationTransitionV10 {
    return isR8State(state) ? advanceOwnedSimulationTickV10R8(state) : advanceOwnedSimulationTickV10(state);
}

function forceLiveLimit(state: LiveSimulationStateV10): LiveSimulationTransitionV10 {
    return isR8State(state) ? forceSimulationLimitV10R8(state) : forceSimulationLimitV10(state);
}

function assertLiveState(state: LiveSimulationStateV10): void {
    if (isR8State(state)) assertSimulationInvariantsV10R8(state);
    else assertSimulationInvariantsV10(state);
}

function hashLiveState(state: LiveSimulationStateV10): string {
    return isR8State(state) ? hashSimulationStateV10R8(state) : hashSimulationStateV10(state);
}

function hashValidatedLiveState(state: LiveSimulationStateV10): string {
    return isR8State(state) ? hashValidatedSimulationStateV10R8(state) : hashValidatedSimulationStateV10(state);
}

function objectiveResultReason(state: LiveSimulationStateV10): string {
    return isR8State(state) ? state.objective.result?.reason ?? state.finishReason! : state.finishReason!;
}

function nextExecution(execution: LiveExecutionV10, state: LiveSimulationStateV10,
    validated: boolean): ReturnType<LoomkeeperExecutionV10['next']> {
    if (isR8State(state)) {
        if (!(execution instanceof LoomkeeperExecutionV10R8)) throw new Error('R8 execution identity changed.');
        return validated ? execution.nextValidated(state) : execution.next(state);
    }
    if (!(execution instanceof LoomkeeperExecutionV10)) throw new Error('R7 execution identity changed.');
    return validated ? execution.nextValidated(state) : execution.next(state);
}
