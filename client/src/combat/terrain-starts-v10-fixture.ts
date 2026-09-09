import { v10gFamilyForSeed } from '../../../shared/terrain-generation-v10g';
import {
    advanceSimulationTicksV10,
    applySimulationBarrierV10,
    applySimulationIntentV10,
    cloneSimulationV10,
    createSimulationV10,
    forceSimulationLimitV10,
    V10_R1_RULESET_ID,
    V10_R2_RULESET_ID, V10_R3_RULESET_ID, V10_R4_RULESET_ID,
    V10_RULESET_ID,
    type V10RulesetId,
    type SimulationEventV10,
    type SimulationIntentV10,
    type SimulationStateV10
} from '../../../shared/simulation-v10';
import {
    generateV10ProceduralSurfaceCandidate,
    type V10ProceduralTerrainProfileId
} from '../../../shared/terrain-generation-v10';
import {
    LoomkeeperExecutionV10,
    LoomkeeperPlannerV10,
    V10_AI_PLANNING_TICKS
} from '../../../shared/loomkeeper-v10';
import type { PlayerCalling } from '../../../shared/simulation';
import type { CombatSceneArgsV10 } from './contracts';
import type { V9FixtureClock } from './resource-turns-v9-fixture';

export type V10FixtureClock = V9FixtureClock;

export const V10G_PREVIEW_MAPS = Object.freeze({
    'twin-crests': 4, 'trench-needle': 5, 'stepping-mesa': 6,
    'rampart-high-left': 7, 'rampart-high-right': 8
});
export function v10GPreviewSeed(search: string): number {
    const map = new URLSearchParams(search).get('terrain-map');
    return map && Object.hasOwn(V10G_PREVIEW_MAPS, map)
        ? V10G_PREVIEW_MAPS[map as keyof typeof V10G_PREVIEW_MAPS] : 4;
}

export const V10F_PREVIEW_DEFAULT_SEED = 1;

/** Accept only canonical positive uint32 review seeds; malformed input stays on the documented default. */
export function v10FPreviewSeed(search: string): number {
    const value = new URLSearchParams(search).get('terrain-seed');
    if (!value || !/^[1-9]\d*$/.test(value)) return V10F_PREVIEW_DEFAULT_SEED;
    const seed = Number(value);
    return Number.isSafeInteger(seed) && seed <= 0xFFFF_FFFF
        ? seed
        : V10F_PREVIEW_DEFAULT_SEED;
}

/**
 * Local V10C authority. It adds the frozen Loomkeeper policy to V10 terrain,
 * but owns no session, socket, replay, reward, or production selector.
 */
export async function createTerrainStartsV10Fixture(
    seed = 1,
    calling: PlayerCalling = 'wizard',
    clock: V10FixtureClock = {
        now: () => performance.now(),
        every: callback => {
            const timer = window.setInterval(callback, 16);
            return () => window.clearInterval(timer);
        }
    },
    rulesetId: V10RulesetId = V10_RULESET_ID
): Promise<CombatSceneArgsV10> {
    let state = createSimulationV10(seed, calling, rulesetId);
    const proceduralSurface = rulesetId === V10_R2_RULESET_ID
        ? generateV10ProceduralSurfaceCandidate(
            state.seed,
            state.terrainCandidateIndex!,
            state.terrainProfileId as V10ProceduralTerrainProfileId
        )
        : undefined;
    let paused = false;
    let destroyed = false;
    let publishing = false;
    let credit = 0;
    let lastNow = clock.now();
    let stop: (() => void) | undefined;
    let aiTurn: number | undefined;
    let planningTicks = 0;
    let planner: LoomkeeperPlannerV10 | undefined;
    let execution: LoomkeeperExecutionV10 | undefined;
    let planningFailed = false;
    const listeners = new Set<(state: SimulationStateV10, events: SimulationEventV10[]) => void>();

    const publish = (events: SimulationEventV10[] = []) => {
        if (destroyed) return;
        publishing = true;
        try {
            for (const listener of listeners) listener(cloneSimulationV10(state), structuredClone(events));
        } finally {
            publishing = false;
        }
    };
    const terminal = () => {
        const result = forceSimulationLimitV10(state);
        state = result.state;
        paused = false;
        credit = 0;
        publish(result.events);
    };
    const resetAutomation = () => {
        aiTurn = undefined;
        planningTicks = 0;
        planner = undefined;
        execution = undefined;
        planningFailed = false;
    };
    const prepareAutomatedTick = () => {
        if (state.phase !== 'action' || state.activeActor !== 'loomkeeper') return;
        if (aiTurn !== state.turn) {
            resetAutomation();
            aiTurn = state.turn;
        }
        if (planningTicks >= V10_AI_PLANNING_TICKS) return;
        if (!planningFailed) {
            const started = clock.now();
            try {
                planner ??= new LoomkeeperPlannerV10(state);
                planner.step();
            } catch {
                planningFailed = true;
                planner = undefined;
            } finally {
                // Thirty logical ticks already charge decision time. Remove
                // only measured planner CPU from subsequent real-time debt.
                lastNow += Math.max(0, clock.now() - started);
            }
        }
        planningTicks += 1;
    };
    const drainAutomation = (events: SimulationEventV10[]) => {
        if (state.phase === 'finished') return;
        if (state.phase === 'action' && state.activeActor === 'loomkeeper' && aiTurn === state.turn &&
            planningTicks === V10_AI_PLANNING_TICKS && !execution && !planningFailed) {
            const selection = planner!.selection;
            if (selection.status === 'selected') {
                execution = new LoomkeeperExecutionV10(
                    planner!.selectedCandidate()!, selection.prefix, state
                );
            }
        }
        if (!execution) return;
        for (let count = 0; count < 8; count += 1) {
            const operation = execution.next(state);
            if (!operation) break;
            const transition = operation.kind === 'intent'
                ? applySimulationIntentV10(
                    state, 'loomkeeper', operation.intent,
                    state.turn, state.phase, state.inputEpoch
                )
                : applySimulationBarrierV10(state, operation.barrier);
            if (!transition.accepted) {
                terminal();
                return;
            }
            if (!transition.mutated) continue;
            state = transition.state;
            events.push(...transition.events);
        }
    };
    const due = (): boolean => {
        if (destroyed) return true;
        const now = clock.now();
        const elapsed = Math.max(0, now - lastNow);
        lastNow = now;
        if (paused) return true;
        if (state.phase === 'finished') return false;
        credit += elapsed * 30;
        if (Math.floor(credit / 1000) > 30) {
            terminal();
            return false;
        }
        let count = 0;
        const events: SimulationEventV10[] = [];
        while (credit >= 1000 && count < 6 && state.phase !== 'finished') {
            credit -= 1000;
            prepareAutomatedTick();
            const result = advanceSimulationTicksV10(state, 1);
            state = result.state;
            events.push(...result.events);
            drainAutomation(events);
            if (state.activeActor !== 'loomkeeper') resetAutomation();
            count += 1;
        }
        const caughtUp = credit < 1000;
        if (count) publish(events);
        return caughtUp;
    };
    const submit = async (intent: SimulationIntentV10) => {
        if (destroyed) throw new Error('Preview is closed.');
        if (publishing) throw new Error('Preview is catching up; use a fresh gesture.');
        if (!due()) throw new Error(state.phase === 'finished'
            ? 'Preview ended before that gesture could be accepted.'
            : 'Preview is catching up; use a fresh gesture.');
        if (paused) throw new Error('Preview is paused.');
        const before = state;
        const result = applySimulationIntentV10(
            state, 'player', intent, state.turn, state.phase, state.inputEpoch
        );
        if (result.error?.code === 'INTENT_LIMIT') {
            const barrier = applySimulationBarrierV10(state, {
                reason: 'intent_limit', actor: 'player',
                expectedTurn: state.turn, expectedEpoch: state.inputEpoch
            });
            if (barrier.error?.code === 'LIFECYCLE_LIMIT') {
                terminal();
                throw new Error('Preview reached its lifecycle safety limit.');
            }
            if (barrier.accepted && barrier.mutated) {
                state = barrier.state;
                publish(barrier.events);
            }
            throw new Error(result.error.message);
        }
        if (!result.accepted || !result.mutated) {
            state = before;
            throw new Error(result.error?.message ?? 'Intent rejected.');
        }
        state = result.state;
        publish(result.events);
        return cloneSimulationV10(state);
    };
    const setPaused = async (value: boolean) => {
        if (destroyed) throw new Error('Preview is closed.');
        if (publishing) throw new Error('Preview is catching up; use a fresh gesture.');
        if (value === paused) return cloneSimulationV10(state);
        if (!due()) throw new Error('Preview is catching up; request pause again.');
        if (value && (state.activeActor !== 'player' || state.phase !== 'action')) {
            throw new Error('Pause requires your action phase.');
        }
        const result = applySimulationBarrierV10(state, {
            reason: value ? 'pause' : 'resume', actor: 'player',
            expectedTurn: state.turn, expectedEpoch: state.inputEpoch
        });
        if (result.error?.code === 'LIFECYCLE_LIMIT') {
            terminal();
            throw new Error('Preview reached its lifecycle safety limit.');
        }
        if (!result.accepted || !result.mutated) {
            throw new Error(result.error?.message ?? 'Pause request rejected.');
        }
        state = result.state;
        paused = value;
        credit = 0;
        lastNow = clock.now();
        publish(result.events);
        return cloneSimulationV10(state);
    };
    const cancelInput = async () => {
        if (destroyed || publishing) return cloneSimulationV10(state);
        const result = applySimulationBarrierV10(state, {
            reason: 'cancel', actor: 'player',
            expectedTurn: state.turn, expectedEpoch: state.inputEpoch
        });
        if (result.error?.code === 'LIFECYCLE_LIMIT') {
            terminal();
            return cloneSimulationV10(state);
        }
        if (result.accepted && result.mutated) {
            state = result.state;
            publish(result.events);
        }
        return cloneSimulationV10(state);
    };
    const destroy = () => {
        if (destroyed) return;
        destroyed = true;
        stop?.();
        stop = undefined;
        listeners.clear();
        resetAutomation();
        const result = applySimulationBarrierV10(state, {
            reason: 'cancel', actor: 'player',
            expectedTurn: state.turn, expectedEpoch: state.inputEpoch
        });
        if (result.accepted && result.mutated) state = result.state;
    };
    const previewLabel = rulesetId === V10_R4_RULESET_ID
        ? `V10G ${terrainProfileLabel(state.terrainProfileId)}${state.terrainProfileId === 'asymmetric-rampart' ? (v10gFamilyForSeed(seed).reflected ? ' · high right' : ' · high left') : ''} · cover, shelves and breaching · local-only`
        : rulesetId === V10_R3_RULESET_ID
        ? 'V10G Twin Crests · cover, shelves and breaching · local-only'
        : rulesetId === V10_R2_RULESET_ID
        ? [
            'V10F procedural terrain preview',
            terrainProfileLabel(state.terrainProfileId),
            `candidate ${state.terrainCandidateIndex}`,
            proceduralSurface!.reflected ? 'reflected' : 'authored',
            'local-only'
        ].join(' · ')
        : rulesetId === V10_R1_RULESET_ID
            ? 'V10E tactical terrain preview · local-only'
            : 'V10 terrain engineering preview · local-only';

    return {
        kind: 'v10',
        get snapshot() { return cloneSimulationV10(state); },
        previewLabel,
        ...(rulesetId === V10_R4_RULESET_ID ? { previewTerrainReflected: v10gFamilyForSeed(seed).reflected } : {}),
        ...(proceduralSurface ? { previewTerrainReflected: proceduralSurface.reflected } : {}),
        submit,
        setPaused,
        cancelInput,
        paused: () => paused,
        trajectoryPreview: aim => {
            if (destroyed || paused) return [];
            const started = clock.now();
            try { return trajectoryPreviewV10(state, aim); }
            finally {
                // This bounded, clone-only rollout blocks the local timer on
                // phones. Charge neither its CPU time nor planner CPU as
                // missed live ticks; preserve all debt outside this call.
                lastNow += Math.max(0, clock.now() - started);
            }
        },
        restart: () => createTerrainStartsV10Fixture(seed, calling, clock, rulesetId),
        onSnapshot: listener => {
            if (destroyed) return () => {};
            listeners.add(listener);
            if (!stop) {
                lastNow = clock.now();
                stop = clock.every(() => { due(); });
            }
            return () => {
                listeners.delete(listener);
                if (!listeners.size) {
                    stop?.();
                    stop = undefined;
                }
            };
        },
        destroy
    };
}

function terrainProfileLabel(profileId: string): string {
    return profileId.split('-').map(word => `${word[0].toUpperCase()}${word.slice(1)}`).join(' ');
}

/** Clone-only trajectory preview; V10 authority and terrain remain untouched. */
export function trajectoryPreviewV10(
    state: SimulationStateV10,
    aim: { angleMilliDegrees: number; powerPermille: number }
): { x: number; y: number }[] {
    const source = cloneSimulationV10(state);
    if (source.phase !== 'action' || source.activeActor !== 'player' || source.winner !== null ||
        source.castUsed || source.heldDirection !== 0 ||
        source.units.some(unit => !unit.alive || !unit.grounded || unit.vxFp !== 0 || unit.vyFp !== 0)) return [];
    const aimed = applySimulationIntentV10(
        source, 'player', { type: 'aim', ...aim },
        source.turn, source.phase, source.inputEpoch
    );
    if (!aimed.accepted) return [];
    const fired = applySimulationIntentV10(
        aimed.state, 'player', { type: 'fire', aimId: aimed.state.aimId },
        aimed.state.turn, aimed.state.phase, aimed.state.inputEpoch
    );
    if (!fired.accepted) return [];
    let projected = fired.state;
    for (let tick = 0; tick < 300 && projected.phase === 'projectile'; tick += 1) {
        projected = advanceSimulationTicksV10(projected, 1).state;
    }
    return projected.lastProjectile?.trace.map(point => ({ ...point })) ?? [];
}
