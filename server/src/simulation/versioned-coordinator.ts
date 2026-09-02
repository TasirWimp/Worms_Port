import { SimulationCoordinator, type CoordinatorReplay, type CoordinatorSnapshot,
    type CoordinatorTerminalResult, type SimulationCoordinatorOptions } from './coordinator';
import { SimulationCoordinatorV8, type CoordinatorReplayV8, type CoordinatorSnapshotV8,
    type CoordinatorTerminalResultV8, type SimulationCoordinatorV8Options } from './coordinator-v8';
import { CURRENT_COMBAT_RULESET_ID, type CombatRulesetId } from '../../../shared/combat-version';
import { V8_RULESET_ID } from '../../../shared/simulation-v8';
import { LEGACY_RULESET_ID, type PlayerCalling, type SimulationRulesetId } from '../../../shared/simulation';

export type VersionedCoordinatorSnapshot = CoordinatorSnapshot | CoordinatorSnapshotV8;
export type VersionedCoordinatorReplay = CoordinatorReplay | CoordinatorReplayV8;
export type VersionedCoordinatorResult = CoordinatorTerminalResult | CoordinatorTerminalResultV8;

/** Dispatch by recorded identity, never by the current selector when reading a historical replay. */
export class VersionedSimulationCoordinator {
    public readonly legacy: SimulationCoordinator;
    public readonly v8: SimulationCoordinatorV8;
    public constructor(options: { legacy?: SimulationCoordinatorOptions; v8?: SimulationCoordinatorV8Options } = {}) {
        this.legacy = new SimulationCoordinator(options.legacy);
        this.v8 = new SimulationCoordinatorV8(options.v8);
    }
    public create(challengeId: string, sessionId: string, seed: number, calling: PlayerCalling,
        rulesetId?: SimulationRulesetId): CoordinatorSnapshot;
    public create(challengeId: string, sessionId: string, seed: number, calling: PlayerCalling,
        rulesetId: typeof V8_RULESET_ID): CoordinatorSnapshotV8;
    public create(challengeId: string, sessionId: string, seed: number, calling: PlayerCalling,
        rulesetId: CombatRulesetId = CURRENT_COMBAT_RULESET_ID): VersionedCoordinatorSnapshot {
        if (this.get(challengeId)) throw new Error('Duplicate versioned challenge.');
        return rulesetId === V8_RULESET_ID ? this.v8.create(challengeId, sessionId, seed, calling)
            : this.legacy.create(challengeId, sessionId, seed, calling, rulesetId);
    }
    public get(challengeId: string): VersionedCoordinatorSnapshot | undefined {
        return this.v8.get(challengeId) ?? this.legacy.get(challengeId);
    }
    public replay(challengeId: string): VersionedCoordinatorReplay | undefined {
        return this.v8.replay(challengeId) ?? this.legacy.replay(challengeId);
    }
    public reconstructAndVerify(replay: VersionedCoordinatorReplay,
        expected?: { challengeId: string; sessionId: string }): VersionedCoordinatorSnapshot {
        if (expected && (expected.challengeId !== replay.challengeId || expected.sessionId !== replay.sessionId))
            throw new Error('Replay identity mismatch.');
        if (replay.rulesetId === V8_RULESET_ID || 'formatVersion' in replay)
            return this.v8.reconstructAndVerify(replay, expected);
        // Historical V1 replay alone may omit its identity, exactly as in the untouched legacy verifier.
        if (replay.rulesetId !== undefined && !/^nimble-knots-artillery-v[1-7]$/.test(replay.rulesetId))
            throw new Error('Unknown combat ruleset.');
        return this.legacy.reconstructAndVerify({ ...replay, rulesetId: replay.rulesetId ?? LEGACY_RULESET_ID });
    }
    public delete(challengeId: string): void { this.legacy.delete(challengeId); this.v8.delete(challengeId); }
    public deleteForSession(sessionId: string): void { this.legacy.deleteForSession(sessionId); this.v8.deleteForSession(sessionId); }
    public dispose(): void { this.legacy.dispose(); this.v8.dispose(); }
}
