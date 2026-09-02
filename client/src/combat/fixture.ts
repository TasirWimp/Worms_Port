import type { ChallengeSnapshot } from '../../../shared/protocol';
import {
    applySimulationCommand,
    createLatestSimulation,
    type PlayerCalling,
    type SimulationCommand,
    type SimulationState
} from '../../../shared/simulation';
import type { LegacyCombatSceneArgs, CombatSceneArgsV8 } from './contracts';
import type { ChallengeSnapshotV8 } from '../../../shared/protocol-v8';

type FixtureClockV8 = { now: () => number; every: (callback: () => void) => () => void };

/** Local engineering authority ONLY. Never creates a session, reward, or public V8 match. */
export async function createActionTurnsV8Fixture(
    seed = 1, calling: PlayerCalling = 'wizard',
    clock: FixtureClockV8 = { now: () => performance.now(), every: (callback) => {
        const timer = window.setInterval(callback, 16); return () => window.clearInterval(timer);
    } }
): Promise<CombatSceneArgsV8> {
    // Lazy loading keeps the candidate physics out of the ordinary V7 boot bundle.
    const sim = await import('../../../shared/simulation-v8');
    let state = sim.createSimulationV8(seed, calling);
    let paused = false;
    let localHold = false;
    let nextInputSequence = 0;
    let lastNow = clock.now();
    let credit = 0;
    let stop: (() => void) | undefined;
    const listeners = new Set<(snapshot: ChallengeSnapshotV8) => void>();
    const snapshot = (): ChallengeSnapshotV8 => {
        const lastProjectile = state.lastProjectile;
        let projectileSummary: ChallengeSnapshotV8['simulation']['lastProjectile'] = null;
        if (lastProjectile) {
            const relicId = lastProjectile.relicId;
            if (!relicId) throw new Error('V8 projectile must identify its Relic.');
            projectileSummary = { ...lastProjectile, relicId };
        }
        return {
        protocolVersion: 8, rulesetId: sim.V8_RULESET_ID, serverTimeMs: 0,
        sessionId: 'v8fixturesession00', challengeId: 'v8fixturechallenge',
        loomkeeperPolicyId: 'nimble-knots-loomkeeper-v3', loomkeeperProfileId: 'standard-v8-0',
        mode: 'practice', calling, paused, nextInputSequence, nextSequence: 0,
        status: state.phase === 'finished' ? 'completed' : 'active',
        expiresAt: '2099-01-01T00:00:00.000Z', stateHash: '0'.repeat(64),
        simulation: { ...structuredClone(state), lastProjectile: projectileSummary, terrain: {
            width: 256, height: 72, cellSize: 8, words: [...state.terrain.words]
        } }
    }; };
    const publish = () => { const next = snapshot(); for (const listener of listeners) listener(next); };
    const barrier = (reason: 'cancel' | 'pause' | 'resume') => {
        localHold = false;
        state = sim.applySimulationBarrierV8(state, {
            reason, actor: 'player', expectedTurn: state.turn, expectedEpoch: state.inputEpoch
        }).state;
    };
    const pump = () => {
        const now = clock.now(); const elapsed = Math.max(0, now - lastNow); lastNow = now;
        if (paused || state.phase === 'finished') return;
        credit += elapsed * 30;
        if (Math.floor(credit / 1000) > 30) {
            localHold = false; state = sim.forceSimulationLimitV8(state).state; publish(); return;
        }
        for (let count = 0; credit >= 1000 && count < 6; count++) {
            credit -= 1000;
            // The fixture's accepted local gesture refreshes at the same legal cadence.
            if (localHold && state.heldDirection !== 0 && state.lastLeaseRefreshTick !== null &&
                state.tick - state.lastLeaseRefreshTick >= 3) {
                const refreshed = sim.applySimulationIntentV8(state, 'player', { type: 'walk_refresh' }, state.turn);
                state = refreshed.state; if (!refreshed.accepted) localHold = false;
            }
            const epoch = state.inputEpoch; const phase = state.phase;
            state = sim.advanceSimulationTicksV8(state, 1).state;
            if (epoch !== state.inputEpoch) localHold = false;
            if (state.tick % 3 === 0 || phase !== state.phase || epoch !== state.inputEpoch) publish();
        }
    };
    return {
        kind: 'v8', snapshot: snapshot(),
        previewLabel: 'V8 engineering preview · no AI policy, wallet or reward',
        submitIntent: async (intent) => {
            pump();
            if (credit >= 1000) throw new Error('Preview is catching up; use a fresh gesture.');
            if (paused) throw new Error('Preview is paused.');
            const result = sim.applySimulationIntentV8(state, 'player', intent, state.turn);
            if (!result.accepted) throw new Error(result.error?.message || 'Intent rejected.');
            state = result.state; nextInputSequence++;
            if (intent.type === 'walk_start') localHold = true;
            if (state.phase !== 'action' && state.phase !== 'retreat') localHold = false;
            publish(); return snapshot();
        },
        cancelInput: async () => { barrier('cancel'); publish(); return snapshot(); },
        setPaused: async (value) => {
            pump();
            if (credit >= 1000) throw new Error('Preview is catching up; request pause again.');
            if (state.activeActor !== 'player' || state.phase !== 'action' ||
                !state.units.every((unit) => unit.alive && unit.grounded)) {
                throw new Error('Pause requires your grounded action phase.');
            }
            barrier(value ? 'pause' : 'resume'); paused = value; lastNow = clock.now();
            publish(); return snapshot();
        },
        onSnapshot: (listener) => {
            listeners.add(listener);
            if (!stop) { lastNow = clock.now(); stop = clock.every(pump); }
            return () => { listeners.delete(listener); if (!listeners.size) {
                barrier('cancel'); stop?.(); stop = undefined;
            } };
        }
    };
}

export function createCombatFixture(
    seed = 0x00000001,
    calling: PlayerCalling = 'wizard'
): LegacyCombatSceneArgs {
    let snapshot = fixtureSnapshot(createLatestSimulation(seed, calling), calling);
    return {
        snapshot,
        previewLabel: 'WP-010 Combat Preview',
        submitCommand: async (command: SimulationCommand, expectedTurn: number) => {
            const transition = applySimulationCommand(
                snapshot.simulation as SimulationState,
                'player',
                command,
                expectedTurn
            );
            if (!transition.accepted) throw new Error(transition.error?.message || 'Command rejected.');
            snapshot = {
                ...snapshot,
                revision: transition.state.revision,
                nextSequence: snapshot.nextSequence + 1,
                simulation: transition.state as ChallengeSnapshot['simulation']
            } as ChallengeSnapshot;
            return structuredClone(snapshot);
        },
        setPaused: async (paused: boolean) => {
            snapshot = {
                ...snapshot,
                paused,
                revision: snapshot.revision + 1
            } as ChallengeSnapshot;
            return structuredClone(snapshot);
        },
        retry: async () => createCombatFixture(seed, calling).snapshot
    };
}

function fixtureSnapshot(
    simulation: SimulationState,
    calling: PlayerCalling
): ChallengeSnapshot {
    return {
        protocolVersion: 1,
        serverTimeMs: 0,
        sessionId: 'wp010fixturesession',
        challengeId: 'wp010fixturechallenge',
        mode: 'practice',
        calling,
        loomkeeperDifficulty: 'standard',
        loomkeeperPolicyId: 'nimble-knots-loomkeeper-v2',
        status: 'active',
        paused: false,
        revision: simulation.revision,
        nextSequence: 0,
        expiresAt: '2099-01-01T00:00:00.000Z',
        stateHash: '0'.repeat(64),
        simulation: simulation as ChallengeSnapshot['simulation']
    } as ChallengeSnapshot;
}
