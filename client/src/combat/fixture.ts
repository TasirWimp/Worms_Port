import type { ChallengeSnapshot } from '../../../shared/protocol';
import {
    applySimulationCommand,
    createLatestSimulation,
    type PlayerCalling,
    type SimulationCommand,
    type SimulationState
} from '../../../shared/simulation';
import type { CombatSceneArgs } from './contracts';

export function createCombatFixture(
    seed = 0x00000001,
    calling: PlayerCalling = 'wizard'
): CombatSceneArgs {
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
