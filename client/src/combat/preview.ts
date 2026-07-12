import {
    applySimulationCommand,
    cloneSimulation,
    LATEST_RULESET_ID,
    type SimulationState
} from '../../../shared/simulation';
import type { AimIntent } from './input';

export function trajectoryPreview(
    snapshot: SimulationState,
    aim: AimIntent
): { x: number; y: number }[] {
    if (snapshot.rulesetId !== LATEST_RULESET_ID ||
        snapshot.phase !== 'awaiting_command' ||
        snapshot.activeActor !== 'player') return [];
    const original = cloneSimulation(snapshot);
    const aimed = applySimulationCommand(
        original,
        'player',
        { type: 'aim', ...aim },
        original.turn
    );
    if (!aimed.accepted) return [];
    const fired = applySimulationCommand(aimed.state, 'player', { type: 'fire' }, aimed.state.turn);
    return fired.accepted
        ? fired.state.lastProjectile?.trace.map((point) => ({ ...point })) ?? []
        : [];
}
