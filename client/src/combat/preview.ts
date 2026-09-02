import {
    applySimulationCommand,
    cloneSimulation,
    LATEST_RULESET_ID,
    type SimulationState
} from '../../../shared/simulation';
import type { AimIntent } from './input';
import type { SimulationStateV8 } from '../../../shared/simulation-v8';
import type { ChallengeSnapshotV8 } from '../../../shared/protocol-v8';

/** Local hint only. The server still validates the aim identifier and resolves Fire. */
export async function trajectoryPreviewV8(snapshot: SimulationStateV8 | ChallengeSnapshotV8['simulation'], aim: AimIntent): Promise<{ x: number; y: number }[]> {
    if (snapshot.phase !== 'action' || snapshot.activeActor !== 'player' || snapshot.heldDirection !== 0) return [];
    // Explicit nullable/tuple projection avoids Zod's optional-null inference under
    // the legacy client's non-strict tsconfig. No V8 object is cast to a V7 schema.
    const body = (index: 0 | 1): SimulationStateV8['units'][number] => ({
        ...snapshot.units[index], facing: snapshot.units[index].facing,
        support: snapshot.units[index].support ?? null,
        airDrive: snapshot.units[index].airDrive ?? null
    });
    const state: SimulationStateV8 = { ...snapshot, heldDirection: snapshot.heldDirection,
        settleReason: snapshot.settleReason ?? null, winner: snapshot.winner ?? null,
        finishReason: snapshot.finishReason ?? null, leaseExpiresTick: snapshot.leaseExpiresTick ?? null,
        lastLeaseRefreshTick: snapshot.lastLeaseRefreshTick ?? null, aim: snapshot.aim ?? null,
        projectile: snapshot.projectile ?? null, lastProjectile: snapshot.lastProjectile ?? null,
        units: [body(0), body(1)]
    };
    const sim = await import('../../../shared/simulation-v8');
    const aimed = sim.applySimulationIntentV8(state, 'player', { type: 'aim', ...aim }, state.turn);
    if (!aimed.accepted) return [];
    const fired = sim.applySimulationIntentV8(aimed.state, 'player', { type: 'fire', aimId: aimed.state.aimId }, state.turn);
    if (!fired.accepted) return [];
    let preview = fired.state;
    for (let tick = 0; tick < 300 && preview.phase === 'projectile'; tick++) {
        preview = sim.advanceSimulationTicksV8(preview, 1).state;
    }
    return preview.lastProjectile?.trace.map((point) => ({ ...point })) ?? [];
}

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
