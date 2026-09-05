import {
    advanceSimulationTicksV9, applySimulationBarrierV9, applySimulationIntentV9, cloneSimulationV9,
    createSimulationV9, forceSimulationLimitV9, type SimulationEventV9, type SimulationIntentV9, type SimulationStateV9
} from '../../../shared/simulation-v9';
import type { PlayerCalling } from '../../../shared/simulation';
import type { CombatSceneArgsV9 } from './contracts';
import type { CombatRenderState } from './presentation';
import { WIZARD_CAST_DURATION_MS } from './approved-assets';
import type { CombatVisualPhase } from './renderer';

export type V9FixtureClock = { now: () => number; every: (callback: () => void) => () => void };

const V9_COSTS = { threadball: 2, needlepoint: 3, spoolburst: 5 } as const;
export type V9PresentationStep = { visual: CombatVisualPhase; durationMs: number };

/** V9 view projection stays behind the local preview's lazy fixture seam. */
export function projectCombatV9(state: SimulationStateV9): CombatRenderState {
    const unit = (body: SimulationStateV9['units'][number]) => ({
        id: body.id, calling: body.calling, x: body.xFp / 256, y: body.yFp / 256,
        facing: body.facing, stitching: body.stitching, alive: body.alive, grounded: body.grounded
    });
    return { terrain: state.terrain, activeActor: state.activeActor, selectedRelic: state.selectedRelic,
        units: [unit(state.units[0]), unit(state.units[1])] };
}

export function v9OffenseAllowed(state: SimulationStateV9, paused: boolean): boolean {
    return state.phase === 'action' && state.activeActor === 'player' && state.winner === null && !paused &&
        !state.castUsed && state.heldDirection === 0 &&
        state.units.every(unit => unit.alive && unit.grounded && unit.vxFp === 0 && unit.vyFp === 0);
}

export function appendV9DamageReceipts(receipts: readonly string[], events: readonly SimulationEventV9[]): string[] {
    return [...receipts, ...events.filter(event => event.type === 'damage_resolved').map(event =>
        `${event.actor} · raw ${event.raw} · ${event.absorbed} shield absorbed · ${event.stitchingLost} Stitching lost`
    )].slice(-4);
}

export function projectCombatV9Resources(state: SimulationStateV9) {
    const player = state.units[0]; const loomkeeper = state.units[1];
    const resource = (unit: SimulationStateV9['units'][number]) => ({ thread: `${unit.thread}/9`, shield: unit.shield > 0
        ? `Shield ${unit.shield} · expires turn ${unit.shieldExpiresTurn}` : 'Shield inactive' });
    return { player: { ...resource(player), airborne: !player.grounded, facing: player.facing }, loomkeeper: resource(loomkeeper),
        relics: Object.fromEntries(Object.entries(V9_COSTS).map(([id, cost]) => [id, { cost, affordable: player.thread >= cost }])) as Record<keyof typeof V9_COSTS, { cost: number; affordable: boolean }> };
}

/** Clone-only V9 trajectory work is loaded only with the local preview. */
export function trajectoryPreviewV9(state: SimulationStateV9, aim: { angleMilliDegrees: number; powerPermille: number }): { x: number; y: number }[] {
    if (!v9OffenseAllowed(state, false)) return [];
    const source = cloneSimulationV9(state);
    const aimed = applySimulationIntentV9(source, 'player', { type: 'aim', ...aim }, source.turn, source.phase, source.inputEpoch);
    if (!aimed.accepted) return [];
    const fired = applySimulationIntentV9(aimed.state, 'player', { type: 'fire', aimId: aimed.state.aimId }, aimed.state.turn, aimed.state.phase, aimed.state.inputEpoch);
    if (!fired.accepted) return [];
    let projected = fired.state;
    for (let tick = 0; tick < 300 && projected.phase === 'projectile'; tick += 1) projected = advanceSimulationTicksV9(projected, 1).state;
    return projected.lastProjectile?.trace.map(point => ({ ...point })) ?? [];
}

/** Preserve the authoritative sampled trace and append only a copied live endpoint. */
export function liveProjectileTraceV9(projectile: NonNullable<SimulationStateV9['projectile']>): { x: number; y: number }[] {
    const trace = projectile.trace.map(point => ({ ...point }));
    const endpoint = { x: projectile.xFp / 256, y: projectile.yFp / 256 };
    const last = trace.at(-1);
    if (!last || last.x !== endpoint.x || last.y !== endpoint.y) trace.push(endpoint);
    return trace;
}

export function planV9Presentation(previous: SimulationStateV9, next: SimulationStateV9, reducedMotion: boolean): V9PresentationStep[] {
    if (next.revision <= previous.revision || next.turn < previous.turn) return [];
    const duration = reducedMotion ? { movement: 70, charge: 40, formation: 50, projectile: 150, impact: 90 }
        : { movement: 220, charge: WIZARD_CAST_DURATION_MS / 2, formation: WIZARD_CAST_DURATION_MS / 2, projectile: 640, impact: 280 };
    const moving = ([0, 1] as const).find(index => previous.units[index].xFp !== next.units[index].xFp || previous.units[index].yFp !== next.units[index].yFp);
    const steps: V9PresentationStep[] = moving === undefined ? [] : [{ visual: { kind: 'movement', actor: next.units[moving].id }, durationMs: duration.movement }];
    const trace = (next.projectile ? liveProjectileTraceV9(next.projectile) : next.lastProjectile?.trace.map(point => ({ ...point })) ?? []);
    const relicId = next.projectile?.relicId ?? next.lastProjectile?.relicId;
    if (!relicId) return steps;
    if (!previous.projectile && next.projectile) {
        const actor = previous.activeActor;
        steps.push({ visual: { kind: 'cast-charge', actor, relicId, trace }, durationMs: duration.charge },
            { visual: { kind: 'cast-formation', actor, relicId, stage: 'ready', trace }, durationMs: duration.formation },
            { visual: { kind: 'projectile', actor, relicId, trace }, durationMs: duration.projectile });
    }
    const priorSignature = previous.lastProjectile && v9ProjectileSignature(previous.lastProjectile);
    const nextSignature = next.lastProjectile && v9ProjectileSignature(next.lastProjectile);
    if (nextSignature && nextSignature !== priorSignature) steps.push({ visual: { kind: 'impact', actor: previous.activeActor, relicId, trace,
        unraveling: next.units.filter(unit => !unit.alive).map(unit => unit.id) }, durationMs: duration.impact });
    return steps;
}

function v9ProjectileSignature(projectile: NonNullable<SimulationStateV9['lastProjectile']>): string {
    return [projectile.relicId, projectile.startX, projectile.startY, projectile.endX, projectile.endY, projectile.flightTicks, projectile.impact, projectile.trace.length].join(':');
}

/** Local C3 authority fixture. It owns no session, socket, replay, reward, or AI lifecycle. */
export async function createResourceTurnsV9Fixture(seed = 1, calling: PlayerCalling = 'wizard',
    clock: V9FixtureClock = { now: () => performance.now(), every: callback => {
        const timer = window.setInterval(callback, 16); return () => window.clearInterval(timer);
    } }): Promise<CombatSceneArgsV9> {
    let state = createSimulationV9(seed, calling);
    let paused = false, destroyed = false, publishing = false, credit = 0, lastNow = clock.now(), stop: (() => void) | undefined;
    const listeners = new Set<(state: SimulationStateV9, events: SimulationEventV9[]) => void>();
    const publish = (events: SimulationEventV9[] = []) => {
        if (destroyed) return;
        publishing = true;
        try { for (const listener of listeners) listener(structuredClone(state), structuredClone(events)); }
        finally { publishing = false; }
    };
    const terminal = () => { const result = forceSimulationLimitV9(state); state = result.state; paused = false; credit = 0; publish(result.events); };
    const due = (): boolean => {
        if (destroyed) return true;
        const now = clock.now(); const elapsed = Math.max(0, now - lastNow); lastNow = now;
        // A paused clock has no outstanding debt. A terminal authority snapshot
        // cannot be used as the basis for a fresh intent, though.
        if (paused) return true;
        if (state.phase === 'finished') return false;
        credit += elapsed * 30;
        if (Math.floor(credit / 1000) > 30) { terminal(); return false; }
        let count = 0; const events: SimulationEventV9[] = [];
        while (credit >= 1000 && count < 6 && state.phase !== 'finished') {
            credit -= 1000; const result = advanceSimulationTicksV9(state, 1); state = result.state; events.push(...result.events); count++;
        }
        // Listeners synchronously render and can poll controls. Their input must
        // not change this pass's catch-up verdict while publication is in flight.
        const caughtUp = credit < 1000;
        if (count) publish(events);
        return caughtUp;
    };
    const submit = async (intent: SimulationIntentV9) => {
        if (destroyed) throw new Error('Preview is closed.');
        if (publishing) throw new Error('Preview is catching up; use a fresh gesture.');
        // Every command, including Fire, is fenced behind the same due-clock
        // pass. An acknowledged aim is an authority fact, never permission to
        // skip a deadline, tick, or lifecycle transition.
        if (!due()) throw new Error(state.phase === 'finished'
            ? 'Preview ended before that gesture could be accepted.'
            : 'Preview is catching up; use a fresh gesture.');
        if (paused) throw new Error('Preview is paused.');
        const before = state;
        let result = applySimulationIntentV9(state, 'player', intent, state.turn, state.phase, state.inputEpoch);
        if (result.error?.code === 'INTENT_LIMIT') {
            const barrier = applySimulationBarrierV9(state, { reason: 'intent_limit', actor: 'player', expectedTurn: state.turn, expectedEpoch: state.inputEpoch });
            if (barrier.error?.code === 'LIFECYCLE_LIMIT') { terminal(); throw new Error('Preview reached its lifecycle safety limit.'); }
            if (barrier.accepted && barrier.mutated) { state = barrier.state; publish(barrier.events); }
            throw new Error(result.error.message);
        }
        if (!result.accepted || !result.mutated) { state = before; throw new Error(result.error?.message ?? 'Intent rejected.'); }
        state = result.state; publish(result.events); return structuredClone(state);
    };
    const setPaused = async (value: boolean) => {
        if (destroyed) throw new Error('Preview is closed.');
        if (publishing) throw new Error('Preview is catching up; use a fresh gesture.');
        if (value === paused) return structuredClone(state);
        if (!due()) throw new Error('Preview is catching up; request pause again.');
        if (value && (state.activeActor !== 'player' || state.phase !== 'action')) throw new Error('Pause requires your action phase.');
        if (!value && !paused) throw new Error('Preview is not paused.');
        const result = applySimulationBarrierV9(state, { reason: value ? 'pause' : 'resume', actor: 'player', expectedTurn: state.turn, expectedEpoch: state.inputEpoch });
        if (result.error?.code === 'LIFECYCLE_LIMIT') { terminal(); throw new Error('Preview reached its lifecycle safety limit.'); }
        if (!result.accepted || !result.mutated) throw new Error(result.error?.message ?? 'Pause request rejected.');
        state = result.state; paused = value; credit = 0; lastNow = clock.now(); publish(result.events); return structuredClone(state);
    };
    const cancelInput = async () => {
        if (destroyed || publishing) return structuredClone(state);
        const result = applySimulationBarrierV9(state, { reason: 'cancel', actor: 'player', expectedTurn: state.turn, expectedEpoch: state.inputEpoch });
        if (result.error?.code === 'LIFECYCLE_LIMIT') { terminal(); return structuredClone(state); }
        if (result.accepted && result.mutated) { state = result.state; publish(result.events); }
        return structuredClone(state);
    };
    const destroy = () => {
        if (destroyed) return; destroyed = true; stop?.(); stop = undefined; listeners.clear();
        const result = applySimulationBarrierV9(state, { reason: 'cancel', actor: 'player', expectedTurn: state.turn, expectedEpoch: state.inputEpoch });
        if (result.accepted && result.mutated) state = result.state;
    };
    return { kind: 'v9', get snapshot() { return structuredClone(state); },
        previewLabel: 'V9 resource engineering preview · local-only', submit, setPaused, cancelInput,
        paused: () => paused,
        // This is intentionally a new fixture, rather than a reset of local
        // state: retained listeners and the old clock have already been retired.
        restart: () => createResourceTurnsV9Fixture(seed, calling, clock),
        onSnapshot: listener => { if (destroyed) return () => {}; listeners.add(listener); if (!stop) { lastNow = clock.now(); stop = clock.every(() => { due(); }); }
            return () => { listeners.delete(listener); if (!listeners.size) { stop?.(); stop = undefined; } }; }, destroy };
}
