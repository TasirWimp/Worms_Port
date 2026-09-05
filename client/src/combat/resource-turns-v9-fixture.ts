import {
    advanceSimulationTicksV9, applySimulationBarrierV9, applySimulationIntentV9,
    createSimulationV9, forceSimulationLimitV9, type SimulationEventV9, type SimulationIntentV9, type SimulationStateV9
} from '../../../shared/simulation-v9';
import type { PlayerCalling } from '../../../shared/simulation';
import type { CombatSceneArgsV9 } from './contracts';

export type V9FixtureClock = { now: () => number; every: (callback: () => void) => () => void };

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
        if (paused || state.phase === 'finished') return true;
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
        // An acknowledged aim is a short-lived V9 authority fact. Fire it from
        // that exact receipt before the next local catch-up pass can advance a
        // physics tick and clear it; all other inputs still fence on freshness.
        if (intent.type !== 'fire' && !due()) throw new Error('Preview is catching up; use a fresh gesture.');
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
