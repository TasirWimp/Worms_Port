import { createHash } from 'node:crypto';
import {
    advanceSimulationTicksV8, applySimulationBarrierV8, applySimulationIntentV8,
    canonicalSimulationJsonV8Family, createSimulationV8, forceSimulationLimitV8,
    V8_RULESET_ID, V8_R1_RULESET_ID, type V8RulesetId, type SimulationBarrierV8Family, type SimulationIntentV8Family,
    type SimulationPhaseV8, type SimulationStateV8, type SimulationTransitionV8
} from '../../../shared/simulation-v8';
import type { PlayerCalling, SimulationActor } from '../../../shared/simulation';
import {
    CoordinatorReplayV8FamilySchema, CoordinatorReplayV8AutomatedSchema, ReplayOperationV8Schema, ReplayOperationV8R1Schema,
    V8_REPLAY_LIMITS, jsonBytesV8, type CoordinatorReplayV8Runtime, type ReplayOperationV8Family
} from '../../../shared/protocol-v8';
import { V8_AUTOMATION_ID, V8_LOOMKEEPER_POLICY_ID, V8_LOOMKEEPER_PROFILE_ID } from '../../../shared/combat-version';
import { LoomkeeperExecutionV8, LoomkeeperPlannerV8, type LoomkeeperSelectionV8 } from '../../../shared/loomkeeper-v8';

export { V8_REPLAY_LIMITS } from '../../../shared/protocol-v8';
export type { CoordinatorReplayV8, CoordinatorReplayV8Family, CoordinatorReplayV8Automated,
    CoordinatorReplayV8Runtime } from '../../../shared/protocol-v8';
export type CoordinatorTerminalResultV8<R extends V8RulesetId = typeof V8_RULESET_ID> = {
    rulesetId: R; challengeId: string; sessionId: string;
    winner: SimulationStateV8['winner']; reason: string; tick: number; stateHash: string;
    automationId?: typeof V8_AUTOMATION_ID;
};
export type CoordinatorSnapshotV8<R extends V8RulesetId = typeof V8_RULESET_ID> = {
    challengeId: string; sessionId: string; state: SimulationStateV8<R>;
    stateHash: string; replayLength: number; paused: boolean; unavailable: boolean;
    automationId?: typeof V8_AUTOMATION_ID;
    terminalResult?: CoordinatorTerminalResultV8<R>;
};
export type CoordinatorUpdateV8<R extends V8RulesetId = typeof V8_RULESET_ID> = CoordinatorSnapshotV8<R> & { transition: SimulationTransitionV8<R> };
export type CoordinatorSnapshotV8Family = CoordinatorSnapshotV8<V8RulesetId>;
export type CoordinatorUpdateV8Family = CoordinatorUpdateV8<V8RulesetId>;
export type CoordinatorTerminalResultV8Family = CoordinatorTerminalResultV8<V8RulesetId>;
export type SimulationCoordinatorV8Options = {
    nowUs?: () => number;
    /** Each continuation yields to the event loop. Never use a microtask spin. */
    yieldBatch?: () => Promise<void>;
    tickIntervalMs?: number;
    /** Test seams may only LOWER the frozen limits. */
    maxReplayRecords?: number; maxReplayBytes?: number;
    /** Deterministic fault injection for the frozen work-failure path. */
    plannerFactory?: (state:SimulationStateV8<V8RulesetId>)=>LoomkeeperPlannerV8;
    onTransition?: (update: CoordinatorUpdateV8Family) => void;
    onTerminal?: (result: CoordinatorTerminalResultV8Family) => void;
};
type Entry = {
    replay: CoordinatorReplayV8Runtime; state: SimulationStateV8<V8RulesetId>; stateHash: string;
    bytes: number; paused: boolean; unavailable: boolean;
    anchorUs: number; credit: bigint;
    automated: boolean; aiTurn?: number; planningElapsed?: number;
    planner?: LoomkeeperPlannerV8; planningFailed?: boolean; execution?: LoomkeeperExecutionV8;
    terminalResult?: CoordinatorTerminalResultV8Family; pendingTerminal?: CoordinatorTerminalResultV8Family;
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

    public create<R extends V8RulesetId = typeof V8_RULESET_ID>(challengeId: string, sessionId: string,
        seed: number, calling: PlayerCalling, rulesetId: R = V8_RULESET_ID as R): CoordinatorSnapshotV8<R> {
        if (this.matches.has(challengeId)) throw new Error('Duplicate V8 challenge.');
        const state = createSimulationV8(seed, calling, rulesetId);
        const stateHash = hashSimulationStateV8(state);
        const replay = CoordinatorReplayV8FamilySchema.parse({ formatVersion: 8, challengeId, sessionId, seed, calling,
            rulesetId, loomkeeperPolicyId: V8_LOOMKEEPER_POLICY_ID,
            loomkeeperProfileId: V8_LOOMKEEPER_PROFILE_ID, initialStateHash: stateHash, records: [] });
        const entry: Entry = { replay, state, stateHash, bytes: jsonBytesV8(replay), paused: false,
            unavailable: false, anchorUs: this.clock(), credit: 0n, automated: false };
        if (entry.bytes + V8_REPLAY_LIMITS.terminalBytes > this.maxBytes) throw new Error('No terminal replay reserve.');
        this.matches.set(challengeId, entry);
        return this.snapshot(entry) as CoordinatorSnapshotV8<R>;
    }

    public createAutomated(challengeId: string, sessionId: string, seed: number,
        calling: PlayerCalling): CoordinatorSnapshotV8<typeof V8_R1_RULESET_ID> & { automationId: typeof V8_AUTOMATION_ID } {
        if (this.matches.has(challengeId)) throw new Error('Duplicate V8 challenge.');
        const state = createSimulationV8(seed, calling, V8_R1_RULESET_ID);
        const stateHash = hashSimulationStateV8(state);
        const replay = CoordinatorReplayV8AutomatedSchema.parse({ formatVersion:8,challengeId,sessionId,seed,calling,
            rulesetId:V8_R1_RULESET_ID,automationId:V8_AUTOMATION_ID,
            loomkeeperPolicyId:V8_LOOMKEEPER_POLICY_ID,loomkeeperProfileId:V8_LOOMKEEPER_PROFILE_ID,
            initialStateHash:stateHash,records:[],chosenPlans:[] });
        const entry: Entry = { replay,state,stateHash,bytes:jsonBytesV8(replay),paused:false,unavailable:false,
            anchorUs:this.clock(),credit:0n,automated:true };
        if (entry.bytes + V8_REPLAY_LIMITS.terminalBytes > this.maxBytes) throw new Error('No terminal replay reserve.');
        this.matches.set(challengeId,entry);
        return this.snapshot(entry) as CoordinatorSnapshotV8<typeof V8_R1_RULESET_ID> & { automationId: typeof V8_AUTOMATION_ID };
    }

    public get(challengeId: string): CoordinatorSnapshotV8Family | undefined {
        const entry = this.matches.get(challengeId);
        return entry && this.snapshot(entry);
    }

    public apply(challengeId: string, actor: SimulationActor, intent: SimulationIntentV8Family,
        expectedTurn: number, expectedPhase: SimulationPhaseV8, expectedEpoch: number): CoordinatorUpdateV8Family {
        const entry = this.require(challengeId);
        const operation = this.operationSchema(entry).parse({ kind: 'intent', actor, intent, expectedTurn, expectedPhase, expectedEpoch });
        if (entry.paused) return this.rejected(entry, 'The match is paused.');
        const transition = applySimulationIntentV8(entry.state, actor, intent, expectedTurn, expectedPhase, expectedEpoch);
        if (transition.error?.code === 'INTENT_LIMIT') {
            // Validation of actor/turn/phase/epoch precedes the budget effect in the pure core.
            this.barrier(challengeId, { reason: 'intent_limit', actor, expectedTurn, expectedEpoch });
            return { ...this.snapshot(entry), transition: { ...transition, state: structuredClone(entry.state) } };
        }
        return this.accept(entry, transition, operation);
    }

    public barrier(challengeId: string, barrier: SimulationBarrierV8Family): CoordinatorUpdateV8Family {
        const entry = this.require(challengeId);
        const operation = this.operationSchema(entry).parse({ kind: 'barrier', barrier });
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

    public async setPaused(challengeId: string, paused: boolean): Promise<CoordinatorSnapshotV8Family> {
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
    public advance(challengeId: string, count: number): CoordinatorUpdateV8Family {
        bounded(count, 0, V8_REPLAY_LIMITS.ticks);
        const entry = this.require(challengeId);
        if (entry.paused) return this.rejected(entry, 'The match is paused.');
        let update = this.noop(entry);
        for (let index = 0; index < count && !entry.terminalResult; index++) {
            if (entry.automated) this.prepareAutomatedTick(entry);
            const oldPhase=entry.state.phase, oldTick=entry.state.tick;
            update = this.accept(entry, advanceSimulationTicksV8(entry.state, 1), { kind: 'ticks', count: 1 }, false, !entry.automated);
            if (entry.automated) {
                update = this.drainAutomated(entry,update);
                if (entry.state.tick % 3 === 0 || oldPhase !== entry.state.phase || oldTick === entry.state.tick)
                    this.options.onTransition?.(structuredClone(update));
            }
        }
        return update;
    }

    /** At most six ticks per callback. The remaining debt is retained. */
    public pump(challengeId: string): CoordinatorSnapshotV8Family {
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

    public async catchUp(challengeId: string): Promise<CoordinatorSnapshotV8Family> {
        let snapshot = this.pump(challengeId);
        while (snapshot.state.phase !== 'finished' && !snapshot.paused && this.dueTicks(challengeId) > 0) {
            await this.yieldBatch();
            if (!this.matches.has(challengeId)) throw new Error('V8 match closed during catch-up.');
            snapshot = this.pump(challengeId);
        }
        return snapshot;
    }

    public safety(challengeId: string, reason: Extract<ReplayOperationV8Family, { kind: 'safety' }>['reason']): CoordinatorUpdateV8Family {
        const entry = this.require(challengeId);
        if (entry.terminalResult) return this.noop(entry);
        const operation: ReplayOperationV8Family = { kind: 'safety', reason };
        entry.unavailable = reason !== 'replay_limit' && reason !== 'left';
        entry.paused = false; entry.credit = 0n;
        return this.accept(entry, forceSimulationLimitV8(entry.state), operation, true);
    }

    public replay(challengeId: string): CoordinatorReplayV8Runtime | undefined {
        const entry = this.matches.get(challengeId);
        return entry && structuredClone(entry.replay);
    }

    public reconstructAndVerify(input: unknown,
        expected?: { challengeId: string; sessionId: string }): CoordinatorSnapshotV8Family {
        // All size caps precede reconstruction (including allocation of replay copies by Zod).
        if (jsonBytesV8(input) > this.maxBytes) throw new Error('V8 replay byte limit exceeded.');
        const raw = input as CoordinatorReplayV8Runtime;
        if (!raw || !Array.isArray(raw.records) || raw.records.length > this.maxRecords)
            throw new Error('V8 replay record limit exceeded.');
        for (const record of raw.records) if (jsonBytesV8(record) > V8_REPLAY_LIMITS.operationBytes)
            throw new Error('V8 operation record byte limit exceeded.');
        if ((raw as {automationId?:unknown}).automationId === V8_AUTOMATION_ID)
            return this.reconstructAutomated(input,expected);
        const replay = CoordinatorReplayV8FamilySchema.parse(input);
        if (expected && (expected.challengeId !== replay.challengeId || expected.sessionId !== replay.sessionId))
            throw new Error('V8 replay ownership mismatch.');
        let totalTicks = 0;
        for (const record of replay.records) if (record.operation.kind === 'ticks') totalTicks += record.operation.count;
        if (totalTicks > V8_REPLAY_LIMITS.ticks) throw new Error('V8 replay tick limit exceeded.');
        const verifier = new SimulationCoordinatorV8({ nowUs: () => 0, maxReplayRecords: this.maxRecords, maxReplayBytes: this.maxBytes });
        try {
            const initial = verifier.create(replay.challengeId, replay.sessionId, replay.seed, replay.calling, replay.rulesetId);
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
                    ? verifier.apply(replay.challengeId, op.actor, op.intent as SimulationIntentV8Family, op.expectedTurn, op.expectedPhase, op.expectedEpoch)
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

    private reconstructAutomated(input: unknown,
        expected?: { challengeId: string; sessionId: string }): CoordinatorSnapshotV8Family {
        const replay = CoordinatorReplayV8AutomatedSchema.parse(input);
        if (expected && (expected.challengeId !== replay.challengeId || expected.sessionId !== replay.sessionId))
            throw new Error('V8 replay ownership mismatch.');
        if (replay.chosenPlans.some(plan => plan.status === 'work_failure'))
            throw new Error('A V8 planning work failure is not automated-policy proof.');
        let totalTicks=0;
        for(const record of replay.records)if(record.operation.kind==='ticks')totalTicks+=record.operation.count;
        if(totalTicks>V8_REPLAY_LIMITS.ticks)throw new Error('V8 replay tick limit exceeded.');
        const verifier=new SimulationCoordinatorV8({nowUs:()=>0,maxReplayRecords:this.maxRecords,maxReplayBytes:this.maxBytes});
        try {
            const initial=verifier.createAutomated(replay.challengeId,replay.sessionId,replay.seed,replay.calling);
            if(initial.stateHash!==replay.initialStateHash)throw new Error('V8 initial hash mismatch.');
            let cursor=0;
            while(cursor<replay.records.length){
                const generated=verifier.require(replay.challengeId).replay.records[cursor];
                if(generated){
                    if(JSON.stringify(generated)!==JSON.stringify(replay.records[cursor]))
                        throw new Error(`V8 automated replay divergence at ${cursor}.`);
                    cursor+=1;continue;
                }
                const op=replay.records[cursor].operation;
                if(op.kind==='automatic'||(op.kind==='intent'&&op.actor==='loomkeeper')||
                    (op.kind==='barrier'&&op.barrier.actor==='loomkeeper'))
                    throw new Error(`Missing generated V8 policy operation at ${cursor}.`);
                if(verifier.get(replay.challengeId)!.state.phase==='finished')throw new Error('V8 replay extends beyond terminal state.');
                if(op.kind==='intent')verifier.apply(replay.challengeId,op.actor,op.intent as SimulationIntentV8Family,op.expectedTurn,op.expectedPhase,op.expectedEpoch);
                else if(op.kind==='barrier')verifier.barrier(replay.challengeId,op.barrier);
                else if(op.kind==='ticks')verifier.advance(replay.challengeId,op.count);
                else verifier.safety(replay.challengeId,op.reason);
                if(!verifier.require(replay.challengeId).replay.records[cursor])
                    throw new Error(`V8 replay operation did not mutate at ${cursor}.`);
            }
            const regenerated=verifier.require(replay.challengeId).replay;
            if(JSON.stringify(regenerated.records)!==JSON.stringify(replay.records)||
                !('chosenPlans'in regenerated)||JSON.stringify(regenerated.chosenPlans)!==JSON.stringify(replay.chosenPlans))
                throw new Error('V8 automated policy proof is incomplete or changed.');
            return verifier.get(replay.challengeId)!;
        } finally {verifier.dispose();}
    }

    public takePendingTerminalResult(challengeId: string): CoordinatorTerminalResultV8Family | undefined {
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

    private accept(entry: Entry, transition: SimulationTransitionV8<V8RulesetId>, operation: ReplayOperationV8Family,
        reserve = false, notify = true): CoordinatorUpdateV8Family {
        if (!transition.accepted || !transition.mutated) return { ...this.snapshot(entry), transition: structuredClone(transition) };
        const stateHash = hashSimulationStateV8(transition.state);
        const automatic: ReplayOperationV8Family[] = reserve ? [] : transition.events.filter(event => event.type === 'input_barrier')
            .map(event => event.reason === 'phase'
                ? {kind:'automatic' as const,reason:'phase' as const,tick:transition.state.tick,inputEpoch:transition.state.inputEpoch,phase:transition.state.phase}
                : {kind:'automatic' as const,reason:'lease_expired' as const,tick:transition.state.tick,inputEpoch:transition.state.inputEpoch});
        const last = entry.replay.records.at(-1);
        const coalesce = !automatic.length && operation.kind === 'ticks' && last?.operation.kind === 'ticks';
        const combined: ReplayOperationV8Family = coalesce && last.operation.kind === 'ticks' && operation.kind === 'ticks'
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
        // Creation and operationSchema bind this mutable family's records to the entry's exact identity.
        const records = entry.replay.records as Array<{index:number;operation:ReplayOperationV8Family;stateHash:string}>;
        if (coalesce) records[records.length-1] = record;
        else records.push(record);
        records.push(...annotations);
        if (entry.state.phase === 'finished' && !entry.terminalResult) {
            entry.terminalResult = { rulesetId: entry.state.rulesetId, challengeId: entry.replay.challengeId,
                sessionId: entry.replay.sessionId, winner: entry.state.winner,
                reason: entry.state.finishReason!, tick: entry.state.tick, stateHash,
                ...(entry.automated ? {automationId:V8_AUTOMATION_ID}: {}) };
            entry.pendingTerminal = entry.terminalResult;
            this.options.onTerminal?.(structuredClone(entry.terminalResult));
        }
        const update = { ...this.snapshot(entry), transition: structuredClone(transition) };
        if (notify && (operation.kind !== 'ticks' || entry.state.tick % 3 === 0 || oldPhase !== entry.state.phase ||
            transition.events.some(event => event.type === 'phase_changed')))
            this.options.onTransition?.(update);
        return update;
    }
    private snapshot(entry: Entry): CoordinatorSnapshotV8Family {
        return { challengeId: entry.replay.challengeId, sessionId: entry.replay.sessionId,
            state: structuredClone(entry.state), stateHash: entry.stateHash, replayLength: entry.replay.records.length,
            paused: entry.paused, unavailable: entry.unavailable,
            ...(entry.automated ? {automationId:V8_AUTOMATION_ID}: {}),
            ...(entry.terminalResult ? { terminalResult: structuredClone(entry.terminalResult) } : {}) };
    }
    private noop(entry: Entry): CoordinatorUpdateV8Family {
        return { ...this.snapshot(entry), transition: { accepted: true, mutated: false, state: structuredClone(entry.state), events: [] } };
    }
    private rejected(entry: Entry, message: string): CoordinatorUpdateV8Family {
        return { ...this.snapshot(entry), transition: { accepted: false, mutated: false, state: structuredClone(entry.state),
            events: [], error: { code: 'COMMAND_REJECTED', message } } };
    }
    private operationSchema(entry: Entry) {
        return entry.state.rulesetId === V8_R1_RULESET_ID ? ReplayOperationV8R1Schema : ReplayOperationV8Schema;
    }
    private require(id: string): Entry {
        const entry = this.matches.get(id);
        if (!entry) throw new Error('No V8 simulation for this challenge.');
        return entry;
    }
    private prepareAutomatedTick(entry:Entry):void{
        if(!entry.automated||entry.state.phase!=='action'||entry.state.activeActor!=='loomkeeper')return;
        if(entry.aiTurn!==entry.state.turn){
            entry.aiTurn=entry.state.turn;entry.planningElapsed=0;entry.planningFailed=false;entry.execution=undefined;
            try{entry.planner=this.options.plannerFactory?.(structuredClone(entry.state))??new LoomkeeperPlannerV8(entry.state);}
            catch{entry.planningFailed=true;entry.planner=undefined;}
        }
        if((entry.planningElapsed??0)>=30)return;
        if(!entry.planningFailed){try{entry.planner!.step();}catch{entry.planningFailed=true;}}
        entry.planningElapsed=(entry.planningElapsed??0)+1;
    }
    private drainAutomated(entry:Entry,initial:CoordinatorUpdateV8Family):CoordinatorUpdateV8Family{
        if(!entry.automated||entry.state.phase==='finished')return initial;
        if(entry.state.phase==='action'&&entry.state.activeActor==='loomkeeper'&&entry.aiTurn===entry.state.turn&&entry.planningElapsed===30&&
            !this.hasSelection(entry,entry.state.turn)){
            const selection:LoomkeeperSelectionV8=entry.planningFailed?{status:'work_failure',ordinal:null}:entry.planner!.selection;
            if(!this.recordSelection(entry,entry.state.turn,selection))return this.safety(entry.replay.challengeId,'replay_limit');
            if(selection.status==='selected')entry.execution=new LoomkeeperExecutionV8(entry.planner!.selectedCandidate()!,entry.state);
        }
        if(!entry.execution)return initial;
        let update=initial;
        for(let count=0;count<8;count++){
            const operation=entry.execution.next(entry.state);if(!operation)break;
            const before=entry.state;
            const transition=operation.kind==='intent'
                ? applySimulationIntentV8(before,'loomkeeper',operation.intent,before.turn,before.phase,before.inputEpoch)
                : applySimulationBarrierV8(before,operation.barrier);
            if(!transition.accepted)throw new Error(`Authoritative V8 policy emitted an illegal operation: ${transition.error?.message??'unknown'}`);
            if(!transition.mutated)continue;
            const replayOperation=operation.kind==='intent'
                ? {kind:'intent',actor:'loomkeeper',intent:operation.intent,expectedTurn:before.turn,
                    expectedPhase:before.phase,expectedEpoch:before.inputEpoch}
                : {kind:'barrier',barrier:operation.barrier};
            update=this.accept(entry,transition,this.operationSchema(entry).parse(replayOperation) as ReplayOperationV8Family,false,false);
        }
        return update;
    }
    private hasSelection(entry:Entry,turn:number):boolean{
        return 'chosenPlans'in entry.replay&&entry.replay.chosenPlans.some(plan=>plan.turn===turn);
    }
    private recordSelection(entry:Entry,turn:number,selection:LoomkeeperSelectionV8):boolean{
        if(!('chosenPlans'in entry.replay))throw new Error('Foundation replay cannot record automated selection.');
        const old=entry.replay.chosenPlans;
        entry.replay.chosenPlans=[...old,{turn,...selection}];
        const bytes=jsonBytesV8(entry.replay);
        if(bytes>this.maxBytes-V8_REPLAY_LIMITS.terminalBytes){entry.replay.chosenPlans=old;return false;}
        entry.bytes=bytes;return true;
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

export function hashSimulationStateV8(state: SimulationStateV8<V8RulesetId>): string {
    return createHash('sha256').update(canonicalSimulationJsonV8Family(state), 'utf8').digest('hex');
}
function bounded(value: number, minimum: number, maximum: number): number {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError('V8 integer bound exceeded.');
    return value;
}
