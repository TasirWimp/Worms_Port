import { v10gFamilyForSeed } from '../../../shared/terrain-generation-v10g';
import {
    advanceDetachedProjectileV10,
    advanceSimulationTicksV10,
    applySimulationBarrierV10,
    applySimulationIntentV10,
    assertSimulationInvariantsV10,
    cloneSimulationV10,
    createSimulationV10,
    forceSimulationLimitV10,
    SimulationStateV10Schema,
    V10_R1_RULESET_ID,
    V10_R2_RULESET_ID, V10_R3_RULESET_ID, V10_R4_RULESET_ID, V10_R5_RULESET_ID,
    V10_R7_RULESET_ID,
    V10_RULESET_ID,
    type V10RulesetId,
    type SimulationIntentV10,
    type SimulationStateV10
} from '../../../shared/simulation-v10';
import {
    advanceSimulationTicksV10R8,
    applySimulationBarrierV10R8,
    applySimulationIntentV10R8,
    assertSimulationInvariantsV10R8,
    cloneSimulationV10R8,
    createSimulationV10R8,
    forceSimulationLimitV10R8,
    objectiveModeV10R8,
    simulationV10R7ViewOfValidatedR8,
    trajectoryPreviewV10R8,
    V10_R8_RULESET_ID,
    type SimulationEventV10R8,
    type SimulationStateV10R8,
    type V10R8ObjectiveMode
} from '../../../shared/simulation-v10-r8';
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
import type { CombatSceneArgsV10, CombatSceneArgsV10R8, SimulationStateV10Family } from './contracts';
import type { V9FixtureClock } from './resource-turns-v9-fixture';

export type V10FixtureClock = V9FixtureClock;
export type V10FixtureStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const V10_R7_PREVIEW_STORAGE_PREFIX = 'nimble-knots:v10r7-preview-state';
const V10_R8_PREVIEW_STORAGE_PREFIX = 'nimble-knots:v10r8-preview-state';
type V10PreviewRulesetId = V10RulesetId | typeof V10_R8_RULESET_ID;

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
export function createTerrainStartsV10Fixture(
    seed: number,
    calling: PlayerCalling,
    clock: V10FixtureClock | undefined,
    rulesetId: typeof V10_R8_RULESET_ID,
    storage?: V10FixtureStorage,
    fresh?: boolean,
    objectiveMode?: V10R8ObjectiveMode
): Promise<CombatSceneArgsV10R8>;
export function createTerrainStartsV10Fixture(
    seed?: number,
    calling?: PlayerCalling,
    clock?: V10FixtureClock,
    rulesetId?: V10RulesetId,
    storage?: V10FixtureStorage,
    fresh?: boolean,
    objectiveMode?: V10R8ObjectiveMode
): Promise<CombatSceneArgsV10>;
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
    rulesetId: V10PreviewRulesetId = V10_RULESET_ID,
    storage: V10FixtureStorage | undefined = browserStorage(),
    fresh = false,
    objectiveMode: V10R8ObjectiveMode = 'collect'
): Promise<CombatSceneArgsV10 | CombatSceneArgsV10R8> {
    const r8 = rulesetId === V10_R8_RULESET_ID;
    const initial: SimulationStateV10Family = r8
        ? createSimulationV10R8(seed, calling, objectiveMode)
        : createSimulationV10(seed, calling, rulesetId);
    const previewStorage = rulesetId === V10_R7_RULESET_ID || r8 ? storage : undefined;
    const storagePrefix = r8 ? V10_R8_PREVIEW_STORAGE_PREFIX : V10_R7_PREVIEW_STORAGE_PREFIX;
    const storageKey = `${storagePrefix}:${initial.seed}:${calling}${r8 ? `:${objectiveMode}` : ''}`;
    let state = !fresh && previewStorage
        ? r8
            ? restoreR8PreviewState(previewStorage, storageKey, initial as SimulationStateV10R8) ?? initial
            : restoreR7PreviewState(previewStorage, storageKey, initial as SimulationStateV10) ?? initial
        : initial;
    const cloneState = (source: SimulationStateV10Family): SimulationStateV10Family =>
        source.rulesetId === V10_R8_RULESET_ID ? cloneSimulationV10R8(source) : cloneSimulationV10(source);
    const applyStateIntent = (
        source: SimulationStateV10Family,
        actor: 'player' | 'loomkeeper',
        intent: SimulationIntentV10,
        expectedTurn: number,
        expectedPhase = source.phase,
        expectedEpoch = source.inputEpoch
    ) => source.rulesetId === V10_R8_RULESET_ID
        ? applySimulationIntentV10R8(source, actor, intent, expectedTurn, expectedPhase, expectedEpoch)
        : applySimulationIntentV10(source, actor, intent, expectedTurn, expectedPhase, expectedEpoch);
    const applyStateBarrier = (
        source: SimulationStateV10Family,
        barrier: Parameters<typeof applySimulationBarrierV10>[1]
    ) => source.rulesetId === V10_R8_RULESET_ID
        ? applySimulationBarrierV10R8(source, barrier)
        : applySimulationBarrierV10(source, barrier);
    const advanceStateTicks = (source: SimulationStateV10Family, count: number) =>
        source.rulesetId === V10_R8_RULESET_ID
            ? advanceSimulationTicksV10R8(source, count)
            : advanceSimulationTicksV10(source, count);
    const forceStateLimit = (source: SimulationStateV10Family) =>
        source.rulesetId === V10_R8_RULESET_ID
            ? forceSimulationLimitV10R8(source)
            : forceSimulationLimitV10(source);
    const plannerView = (source: SimulationStateV10Family): SimulationStateV10 =>
        source.rulesetId === V10_R8_RULESET_ID ? simulationV10R7ViewOfValidatedR8(source) : source;
    const proceduralSurface = rulesetId === V10_R2_RULESET_ID
        ? generateV10ProceduralSurfaceCandidate(
            state.seed,
            state.terrainCandidateIndex!,
            state.terrainProfileId as V10ProceduralTerrainProfileId
        )
        : undefined;
    let paused = false;
    let clockSuspended = false;
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
    let retiringForRestart = false;
    const listeners = new Set<(state: SimulationStateV10Family, events: SimulationEventV10R8[]) => void>();
    let persistedBoundary = '';

    const persist = (force = false) => {
        if (!previewStorage || retiringForRestart) return;
        const boundary = [state.terrainRevision, 'objective' in state ? state.objective.objectiveRevision : '',
            state.phase, state.turn, state.inputEpoch,
            state.projectile === null, state.winner].join(':');
        if (!force && boundary === persistedBoundary) return;
        try {
            previewStorage.setItem(storageKey, JSON.stringify(state));
            persistedBoundary = boundary;
        } catch {
            // Local preview persistence is a review aid; storage denial must
            // never turn it into simulation authority or stop gameplay.
        }
    };
    persist(fresh || state === initial);

    const publish = (events: SimulationEventV10R8[] = [], forcePersist = false) => {
        if (destroyed) return;
        persist(forcePersist);
        publishing = true;
        try {
            for (const listener of listeners) listener(cloneState(state), structuredClone(events));
        } finally {
            publishing = false;
        }
    };
    const terminal = () => {
        const result = forceStateLimit(state);
        state = result.state;
        paused = false;
        credit = 0;
        publish(result.events, true);
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
                planner ??= new LoomkeeperPlannerV10(plannerView(state));
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
    const drainAutomation = (events: SimulationEventV10R8[]) => {
        if (state.phase === 'finished') return;
        if (state.phase === 'action' && state.activeActor === 'loomkeeper' && aiTurn === state.turn &&
            planningTicks === V10_AI_PLANNING_TICKS && !execution && !planningFailed) {
            const selection = planner!.selection;
            if (selection.status === 'selected') {
                execution = new LoomkeeperExecutionV10(
                    planner!.selectedCandidate()!, selection.prefix, plannerView(state)
                );
            }
        }
        if (!execution) return;
        for (let count = 0; count < 8; count += 1) {
            const operation = execution.next(plannerView(state));
            if (!operation) break;
            const transition = operation.kind === 'intent'
                ? applyStateIntent(
                    state, 'loomkeeper', operation.intent,
                    state.turn, state.phase, state.inputEpoch
                )
                : applyStateBarrier(state, operation.barrier);
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
        if (paused || clockSuspended) return true;
        if (state.phase === 'finished') return false;
        credit += elapsed * 30;
        if (Math.floor(credit / 1000) > 30) {
            terminal();
            return false;
        }
        let count = 0;
        const events: SimulationEventV10R8[] = [];
        while (credit >= 1000 && count < 6 && state.phase !== 'finished') {
            credit -= 1000;
            prepareAutomatedTick();
            const result = advanceStateTicks(state, 1);
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
    const stopClock = () => {
        stop?.();
        stop = undefined;
    };
    const startClock = () => {
        if (destroyed || paused || clockSuspended || stop || !listeners.size || state.phase === 'finished') return;
        lastNow = clock.now();
        stop = clock.every(() => {
            due();
            if (state.phase === 'finished') stopClock();
        });
    };
    const submit = async (intent: SimulationIntentV10) => {
        if (destroyed) throw new Error('Preview is closed.');
        if (publishing) throw new Error('Preview is catching up; use a fresh gesture.');
        if (!due()) throw new Error(state.phase === 'finished'
            ? 'Preview ended before that gesture could be accepted.'
            : 'Preview is catching up; use a fresh gesture.');
        if (paused) throw new Error('Preview is paused.');
        const before = state;
        const result = applyStateIntent(
            state, 'player', intent, state.turn, state.phase, state.inputEpoch
        );
        if (result.error?.code === 'INTENT_LIMIT') {
            const barrier = applyStateBarrier(state, {
                reason: 'intent_limit', actor: 'player',
                expectedTurn: state.turn, expectedEpoch: state.inputEpoch
            });
            if (barrier.error?.code === 'LIFECYCLE_LIMIT') {
                terminal();
                throw new Error('Preview reached its lifecycle safety limit.');
            }
            if (barrier.accepted && barrier.mutated) {
                state = barrier.state;
                publish(barrier.events, true);
            }
            throw new Error(result.error.message);
        }
        if (!result.accepted || !result.mutated) {
            state = before;
            throw new Error(result.error?.message ?? 'Intent rejected.');
        }
        state = result.state;
        publish(result.events, true);
        return cloneState(state);
    };
    const setPaused = async (value: boolean) => {
        if (destroyed) throw new Error('Preview is closed.');
        if (publishing) throw new Error('Preview is catching up; use a fresh gesture.');
        if (value === paused) return cloneState(state);
        if (!due()) throw new Error('Preview is catching up; request pause again.');
        if (value && (state.activeActor !== 'player' || state.phase !== 'action')) {
            throw new Error('Pause requires your action phase.');
        }
        const result = applyStateBarrier(state, {
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
        publish(result.events, true);
        if (paused) stopClock();
        else startClock();
        return cloneState(state);
    };
    const setLocalClockSuspended = (value: boolean) => {
        if (destroyed || value === clockSuspended) return;
        clockSuspended = value;
        credit = 0;
        lastNow = clock.now();
        if (clockSuspended) stopClock();
        else startClock();
    };
    const cancelInput = async () => {
        if (destroyed || publishing) return cloneState(state);
        const result = applyStateBarrier(state, {
            reason: 'cancel', actor: 'player',
            expectedTurn: state.turn, expectedEpoch: state.inputEpoch
        });
        if (result.error?.code === 'LIFECYCLE_LIMIT') {
            terminal();
            return cloneState(state);
        }
        if (result.accepted && result.mutated) {
            state = result.state;
            publish(result.events, true);
        }
        return cloneState(state);
    };
    const destroy = () => {
        if (destroyed) return;
        destroyed = true;
        stopClock();
        listeners.clear();
        resetAutomation();
        const result = applyStateBarrier(state, {
            reason: 'cancel', actor: 'player',
            expectedTurn: state.turn, expectedEpoch: state.inputEpoch
        });
        if (result.accepted && result.mutated) state = result.state;
        if (!retiringForRestart) persist(true);
    };
    const previewLabel = rulesetId === V10_R8_RULESET_ID ? `V10 R8 ${objectiveMode} objective-mode canary · local-only` : rulesetId === V10_R7_RULESET_ID ? 'V10 R7 terrain-as-gameplay preview · full volcanic battlefield · local-only' : rulesetId === V10_R5_RULESET_ID ? 'Volcanic Ruin · stepped valley · local-only' : rulesetId === V10_R4_RULESET_ID
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
        get snapshot() { return cloneState(state); },
        previewLabel,
        calling,
        ...(rulesetId === V10_R4_RULESET_ID ? { previewTerrainReflected: v10gFamilyForSeed(seed).reflected } : {}),
        ...(proceduralSurface ? { previewTerrainReflected: proceduralSurface.reflected } : {}),
        submit,
        setPaused,
        cancelInput,
        setLocalClockSuspended,
        paused: () => paused,
        trajectoryPreview: aim => {
            if (destroyed || paused) return [];
            const started = clock.now();
            try { return state.rulesetId === V10_R8_RULESET_ID
                ? trajectoryPreviewV10R8(state, aim)
                : trajectoryPreviewV10(state, aim); }
            finally {
                // This bounded, clone-only rollout blocks the local timer on
                // phones. Charge neither its CPU time nor planner CPU as
                // missed live ticks; preserve all debt outside this call.
                lastNow += Math.max(0, clock.now() - started);
            }
        },
        restart: async () => {
            retiringForRestart = true;
            try {
                return rulesetId === V10_R8_RULESET_ID
                    ? await createTerrainStartsV10Fixture(
                        seed, calling, clock, V10_R8_RULESET_ID, previewStorage, true, objectiveMode
                    )
                    : await createTerrainStartsV10Fixture(
                        seed, calling, clock, rulesetId, previewStorage, true, objectiveMode
                    );
            } catch (error) {
                retiringForRestart = false;
                throw error;
            }
        },
        onSnapshot: listener => {
            if (destroyed) return () => {};
            listeners.add(listener);
            startClock();
            return () => {
                listeners.delete(listener);
                if (!listeners.size) stopClock();
            };
        },
        destroy
    } as CombatSceneArgsV10 | CombatSceneArgsV10R8;
}

export function v10R8PreviewMode(search: string): V10R8ObjectiveMode {
    return objectiveModeV10R8(new URLSearchParams(search).get('objective-mode'));
}

function browserStorage(): V10FixtureStorage | undefined {
    if (typeof window === 'undefined') return undefined;
    try { return window.localStorage; }
    catch { return undefined; }
}

function restoreR7PreviewState(
    storage: V10FixtureStorage,
    key: string,
    initial: SimulationStateV10
): SimulationStateV10 | undefined {
    try {
        const source = storage.getItem(key);
        if (!source) return undefined;
        const parsed = SimulationStateV10Schema.safeParse(JSON.parse(source));
        if (!parsed.success || parsed.data.rulesetId !== V10_R7_RULESET_ID ||
            parsed.data.seed !== initial.seed || parsed.data.units[0].calling !== initial.units[0].calling ||
            parsed.data.terrainRecipeRevision !== initial.terrainRecipeRevision) {
            storage.removeItem(key);
            return undefined;
        }
        // Zod has proved the strict runtime shape; its inferred extension type
        // weakens inherited fields such as `aim`, so restore the domain type at
        // this single validation boundary.
        const restored = cloneSimulationV10(parsed.data as SimulationStateV10);
        assertSimulationInvariantsV10(restored);
        return restored;
    } catch {
        try { storage.removeItem(key); } catch {}
        return undefined;
    }
}

function restoreR8PreviewState(
    storage: V10FixtureStorage,
    key: string,
    initial: SimulationStateV10R8
): SimulationStateV10R8 | undefined {
    try {
        const source = storage.getItem(key);
        if (!source) return undefined;
        const restored = cloneSimulationV10R8(JSON.parse(source) as SimulationStateV10R8);
        assertSimulationInvariantsV10R8(restored);
        if (restored.seed !== initial.seed ||
            restored.units[0].calling !== initial.units[0].calling ||
            restored.terrainRecipeRevision !== initial.terrainRecipeRevision ||
            restored.objective.objectiveMode !== initial.objective.objectiveMode ||
            restored.objective.recipeRevision !== initial.objective.recipeRevision) {
            storage.removeItem(key);
            return undefined;
        }
        return restored;
    } catch {
        try { storage.removeItem(key); } catch {}
        return undefined;
    }
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
    const projected = advanceDetachedProjectileV10(fired.state, 300).state;
    return projected.lastProjectile?.trace.map(point => ({ ...point })) ?? [];
}
