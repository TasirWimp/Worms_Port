import { LiveSimulationCoordinatorV10, type LiveSimulationCoordinatorV10Options,
    type CoordinatorSnapshotV10 as CoordinatorSnapshotLiveV10 } from './coordinator-v10-live';
import type { CoordinatorReplayV10Automated } from '../../../shared/protocol-v10-live';
import { isV10AutomationId } from '../../../shared/combat-version';
import { SimulationCoordinator, type CoordinatorReplay, type CoordinatorSnapshot,
    type CoordinatorTerminalResult, type SimulationCoordinatorOptions } from './coordinator';
import { SimulationCoordinatorV8, type CoordinatorReplayV8Runtime, type CoordinatorSnapshotV8Family,
    type CoordinatorSnapshotV8, type CoordinatorTerminalResultV8Family, type SimulationCoordinatorV8Options } from './coordinator-v8';
import { SimulationCoordinatorV9, type CoordinatorReplayV9, type CoordinatorSnapshotV9,
    type CoordinatorTerminalResultV9, type SimulationCoordinatorV9Options } from './coordinator-v9';
import { SimulationCoordinatorV10, type CoordinatorReplayV10, type CoordinatorSnapshotV10,
    type CoordinatorTerminalResultV10, type SimulationCoordinatorV10Options } from './coordinator-v10';
import { CURRENT_COMBAT_RULESET_ID, type CombatRulesetId } from '../../../shared/combat-version';
import { V8_AUTOMATION_ID, V9_AUTOMATION_ID } from '../../../shared/combat-version';
import { isV8RulesetId, V8_R1_RULESET_ID, type V8RulesetId } from '../../../shared/simulation-v8';
import { V9_RULESET_ID } from '../../../shared/simulation-v9';
import { isV10RulesetId, V10_RULESET_ID, type V10RulesetId } from '../../../shared/simulation-v10';
import { LEGACY_RULESET_ID, type PlayerCalling, type SimulationRulesetId } from '../../../shared/simulation';

export type VersionedCoordinatorSnapshot = CoordinatorSnapshot | CoordinatorSnapshotV8Family | CoordinatorSnapshotV9 | CoordinatorSnapshotV10 | CoordinatorSnapshotLiveV10;
export type VersionedCoordinatorReplay = CoordinatorReplay | CoordinatorReplayV8Runtime | CoordinatorReplayV9 | CoordinatorReplayV10 | CoordinatorReplayV10Automated;
export type VersionedCoordinatorResult = CoordinatorTerminalResult | CoordinatorTerminalResultV8Family | CoordinatorTerminalResultV9 | CoordinatorTerminalResultV10;

/** Dispatch by recorded identity, never by the current selector when reading a historical replay. */
export class VersionedSimulationCoordinator {
    public readonly legacy: SimulationCoordinator;
    public readonly v8: SimulationCoordinatorV8;
    public readonly v9: SimulationCoordinatorV9;
    public readonly v10: SimulationCoordinatorV10;
    public readonly v10Live: LiveSimulationCoordinatorV10;
    public constructor(options: { legacy?: SimulationCoordinatorOptions; v8?: SimulationCoordinatorV8Options; v9?: SimulationCoordinatorV9Options; v10Live?: LiveSimulationCoordinatorV10Options; v10?: SimulationCoordinatorV10Options } = {}) {
        this.legacy = new SimulationCoordinator(options.legacy);
        this.v8 = new SimulationCoordinatorV8(options.v8);
        this.v9 = new SimulationCoordinatorV9(options.v9);
        this.v10 = new SimulationCoordinatorV10(options.v10);
        this.v10Live = new LiveSimulationCoordinatorV10(options.v10Live);
    }
    public create(challengeId: string, sessionId: string, seed: number, calling: PlayerCalling,
        rulesetId?: SimulationRulesetId): CoordinatorSnapshot;
    public create<R extends V8RulesetId>(challengeId: string, sessionId: string, seed: number, calling: PlayerCalling,
        rulesetId: R): CoordinatorSnapshotV8<R>;
    public create(challengeId: string, sessionId: string, seed: number, calling: PlayerCalling,
        rulesetId: typeof V9_RULESET_ID): CoordinatorSnapshotV9;
    public create(challengeId: string, sessionId: string, seed: number, calling: PlayerCalling,
        rulesetId: V10RulesetId): CoordinatorSnapshotV10;
    public create(challengeId: string, sessionId: string, seed: number, calling: PlayerCalling,
        rulesetId: CombatRulesetId | V10RulesetId = CURRENT_COMBAT_RULESET_ID): VersionedCoordinatorSnapshot {
        if (this.get(challengeId)) throw new Error('Duplicate versioned challenge.');
        if (isV8RulesetId(rulesetId)) return this.v8.create(challengeId, sessionId, seed, calling, rulesetId);
        if (rulesetId === V9_RULESET_ID) return this.v9.create(challengeId, sessionId, seed, calling);
        if (isV10RulesetId(rulesetId)) return this.v10.create(challengeId, sessionId, seed, calling, rulesetId);
        return this.legacy.create(challengeId, sessionId, seed, calling, rulesetId);
    }
    public createAutomated(challengeId:string,sessionId:string,seed:number,calling:PlayerCalling):
        CoordinatorSnapshotV8<typeof V8_R1_RULESET_ID> & {automationId:typeof V8_AUTOMATION_ID}{
        if(this.get(challengeId))throw new Error('Duplicate versioned challenge.');
        return this.v8.createAutomated(challengeId,sessionId,seed,calling);
    }
    public createAutomatedV9(challengeId: string, sessionId: string, seed: number, calling: PlayerCalling):
        CoordinatorSnapshotV9 & { automationId: typeof V9_AUTOMATION_ID } {
        if (this.get(challengeId)) throw new Error('Duplicate versioned challenge.');
        return this.v9.createAutomated(challengeId, sessionId, seed, calling);
    }
    public get(challengeId: string): VersionedCoordinatorSnapshot | undefined {
        return this.v10Live.get(challengeId) ?? this.v10.get(challengeId) ?? this.v9.get(challengeId) ?? this.v8.get(challengeId) ?? this.legacy.get(challengeId);
    }
    public replay(challengeId: string): VersionedCoordinatorReplay | undefined {
        return this.v10Live.replay(challengeId) ?? this.v10.replay(challengeId) ?? this.v9.replay(challengeId) ?? this.v8.replay(challengeId) ?? this.legacy.replay(challengeId);
    }
    public reconstructAndVerify(replay: VersionedCoordinatorReplay,
        expected?: { challengeId: string; sessionId: string }): VersionedCoordinatorSnapshot {
        if (expected && (expected.challengeId !== replay.challengeId || expected.sessionId !== replay.sessionId))
            throw new Error('Replay identity mismatch.');
        if ('automationId' in replay && isV10AutomationId(replay.automationId)) return this.v10Live.reconstructAndVerify(replay, expected);
        if (isV10RulesetId(replay.rulesetId)) return this.v10.reconstructAndVerify(replay as CoordinatorReplayV10, expected);
        if (replay.rulesetId === V9_RULESET_ID) return this.v9.reconstructAndVerify(replay, expected);
        if (isV8RulesetId(replay.rulesetId))
            return this.v8.reconstructAndVerify(replay, expected);
        if ('formatVersion' in replay || 'automationId' in replay || 'chosenPlans' in replay)
            throw new Error('Unknown or mixed combat ruleset.');
        // Historical V1 replay alone may omit its identity, exactly as in the untouched legacy verifier.
        if (replay.rulesetId !== undefined && !/^nimble-knots-artillery-v[1-7]$/.test(replay.rulesetId))
            throw new Error('Unknown combat ruleset.');
        return this.legacy.reconstructAndVerify({ ...replay, rulesetId: replay.rulesetId ?? LEGACY_RULESET_ID });
    }
    public async reconstructAndVerifyAsync(replay: VersionedCoordinatorReplay,
        expected?: { challengeId: string; sessionId: string }): Promise<VersionedCoordinatorSnapshot> {
        if (expected && (expected.challengeId !== replay.challengeId || expected.sessionId !== replay.sessionId))
            throw new Error('Replay identity mismatch.');
        if ('automationId' in replay && isV10AutomationId(replay.automationId)) {
            return this.v10Live.reconstructAndVerifyAsync(replay, expected);
        }
        return this.reconstructAndVerify(replay, expected);
    }
    public delete(challengeId: string): void { this.legacy.delete(challengeId); this.v8.delete(challengeId); this.v9.delete(challengeId); this.v10.delete(challengeId); this.v10Live.delete(challengeId); }
    public deleteForSession(sessionId: string): void { this.legacy.deleteForSession(sessionId); this.v8.deleteForSession(sessionId); this.v9.deleteForSession(sessionId); this.v10.deleteForSession(sessionId); this.v10Live.deleteForSession(sessionId); }
    public dispose(): void { this.legacy.dispose(); this.v8.dispose(); this.v9.dispose(); this.v10.dispose(); this.v10Live.dispose(); }
}
