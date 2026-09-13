import assert from 'node:assert/strict';
import test from 'node:test';
import {
    SimulationIntentV9Schema, SimulationStateV9Schema, canonicalSimulationJsonV9,
    assertSimulationInvariantsV9, createSimulationV9, hashSimulationStateV9
} from '../../shared/simulation-v9';

test('V9 state and intents reject unknown and fractional fields before replay work', () => {
    const state = createSimulationV9(1, 'wizard');
    assert.equal(SimulationStateV9Schema.safeParse({ ...state, unknown: true }).success, false);
    assert.equal(SimulationStateV9Schema.safeParse({ ...state, formatVersion: 8 }).success, false);
    assert.equal(SimulationStateV9Schema.safeParse({ ...state, units: [{ ...state.units[0], thread: 1.5 }, state.units[1]] }).success, false);
    assert.equal(SimulationIntentV9Schema.safeParse({ type: 'threadleap', direction: 0 }).success, false);
    assert.equal(SimulationIntentV9Schema.safeParse({ type: 'threadguard', extra: true }).success, false);
});

test('V9 canonical UTF-8 state hashing is sorted-key and deterministic', () => {
    const state = createSimulationV9(1, 'wizard');
    const canonical = canonicalSimulationJsonV9(state);
    assert.equal(canonical, canonicalSimulationJsonV9(structuredClone(state)));
    assert.equal(hashSimulationStateV9(state), hashSimulationStateV9(structuredClone(state)));
    assert.ok(canonical.indexOf('"activeActor"') < canonical.indexOf('"aim"'));
});

test('V9 rejects a shielded actor with zero actual Stitching before hashing', () => {
    const state = createSimulationV9(1, 'wizard');
    state.units[0].stitching = 0;
    state.units[0].shield = 24;
    state.units[0].shieldExpiresTurn = 2;
    assert.throws(() => assertSimulationInvariantsV9(state), /stitching\/alive/);
    assert.throws(() => hashSimulationStateV9(state), /stitching\/alive/);
});
