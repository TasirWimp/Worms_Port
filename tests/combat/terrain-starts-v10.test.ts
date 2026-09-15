import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createTerrainStartsV10Fixture,
    trajectoryPreviewV10,
    v10FPreviewSeed, v10GPreviewSeed, v10R8PreviewMode,
    type V10FixtureClock
} from '../../client/src/combat/terrain-starts-v10-fixture';
import {
    canonicalSimulationJsonV10, hashTerrainV10R7, V10_R1_RULESET_ID, V10_R2_RULESET_ID, V10_R3_RULESET_ID, V10_R4_RULESET_ID, V10_R7_RULESET_ID, V10_RULESET_ID
} from '../../shared/simulation-v10';
import { deformTerrain } from '../../shared/simulation';
import {
    hashSimulationStateV10R8,
    V10_R8_OBJECTIVE_RECIPE_REVISION,
    V10_R8_RULESET_ID
} from '../../shared/simulation-v10-r8';

function createClock(): V10FixtureClock & { advanceThirtyTicks: () => void } {
    let now = 0;
    let callback: (() => void) | undefined;
    return {
        now: () => now,
        every: next => {
            callback = next;
            return () => { if (callback === next) callback = undefined; };
        },
        advanceThirtyTicks: () => {
            now += 1_000;
            callback?.();
            for (let batch = 0; batch < 4; batch += 1) callback?.();
        }
    };
}

test('R8 preview mode selection is bounded and defaults to Collect', () => {
    assert.equal(v10R8PreviewMode('?objective-mode=defend'), 'defend');
    assert.equal(v10R8PreviewMode('?objective-mode=claim'), 'claim');
    assert.equal(v10R8PreviewMode('?objective-mode=collect'), 'collect');
    assert.equal(v10R8PreviewMode('?objective-mode=unknown'), 'collect');
    assert.equal(v10R8PreviewMode(''), 'collect');
});

test('R8 local fixture keeps objective physics isolated and starts fresh in the same review mode', async () => {
    const clock = createClock();
    const fixture = await createTerrainStartsV10Fixture(
        4, 'wizard', clock, V10_R8_RULESET_ID, undefined, false, 'defend'
    );
    try {
        assert.equal(fixture.snapshot.rulesetId, V10_R8_RULESET_ID);
        assert.equal(fixture.snapshot.objective.objectiveMode, 'defend');
        assert.equal(fixture.snapshot.objective.recipeRevision, V10_R8_OBJECTIVE_RECIPE_REVISION);
        assert.match(fixture.previewLabel, /V10 R8 defend object-physics preview/);
        const before = hashSimulationStateV10R8(fixture.snapshot);
        const trace = fixture.trajectoryPreview({ angleMilliDegrees: 45_000, powerPermille: 800 });
        assert.ok(trace.length > 1);
        assert.equal(hashSimulationStateV10R8(fixture.snapshot), before);
        const stop = fixture.onSnapshot(() => {});
        clock.advanceThirtyTicks();
        stop();
        assert.ok(fixture.snapshot.tick > 0);
        assert.equal(fixture.snapshot.objective.objects[0].status, 'active');

        const restarted = await fixture.restart();
        try {
            assert.equal(restarted.snapshot.objective.objectiveMode, 'defend');
            assert.equal(restarted.snapshot.objective.objectiveRevision, 0);
            assert.equal(restarted.snapshot.terrainRevision, 0);
        } finally {
            restarted.destroy();
        }
    } finally {
        fixture.destroy();
    }
});

test('current R7 local preview retires its scheduler while the app is suspended', async () => {
    let now = 0;
    let callback: (() => void) | undefined;
    let starts = 0;
    let stops = 0;
    const fixture = await createTerrainStartsV10Fixture(4, 'wizard', {
        now: () => now,
        every: next => {
            starts += 1;
            callback = next;
            return () => {
                stops += 1;
                if (callback === next) callback = undefined;
            };
        }
    }, V10_R7_RULESET_ID);
    const unsubscribe = fixture.onSnapshot(() => {});
    try {
        assert.equal(starts, 1);
        const tick = fixture.snapshot.tick;
        fixture.setLocalClockSuspended?.(true);
        assert.equal(stops, 1);
        now += 20_000;
        callback?.();
        assert.equal(fixture.snapshot.tick, tick);
        fixture.setLocalClockSuspended?.(false);
        assert.equal(starts, 2);
        now += 1_000;
        callback?.();
        assert.ok(fixture.snapshot.tick > tick);
    } finally {
        unsubscribe();
        fixture.destroy();
    }
    assert.equal(stops, 2);
});

for (const seed of [0, 4, 5, 6, 7, 8]) test(`V10G fixture preview, AI and restart parity: ${seed || 'R3'}`, async () => {
    const clock = createClock();
    const fixture = await createTerrainStartsV10Fixture(seed || 4, 'wizard', clock, seed ? V10_R4_RULESET_ID : V10_R3_RULESET_ID);
    const initial = canonicalSimulationJsonV10(fixture.snapshot);
    const stop = fixture.onSnapshot(() => {});
    try {
        await fixture.submit({ type: 'aim', angleMilliDegrees: 0, powerPermille: 1000 });
        await fixture.submit({ type: 'select_relic', relicId: 'needlepoint' });
        assert.equal(fixture.snapshot.selectedRelic, 'needlepoint');
        assert.equal(fixture.snapshot.aim, null, 'selection deliberately requires a fresh acknowledged aim');
        const before = canonicalSimulationJsonV10(fixture.snapshot);
        const preview = fixture.trajectoryPreview({ angleMilliDegrees: 0, powerPermille: 1000 });
        assert.equal(canonicalSimulationJsonV10(fixture.snapshot), before);
        assert.ok(preview.length > 1);
        assert.ok(preview.every(point => point.y === preview[0].y));
        const aimed = await fixture.submit({ type: 'aim', angleMilliDegrees: 0, powerPermille: 1000 });
        await fixture.submit({ type: 'fire', aimId: aimed.aimId });
        for (let window = 0; window < 10 && fixture.snapshot.phase === 'projectile'; window++) clock.advanceThirtyTicks();
        assert.deepEqual(fixture.snapshot.lastProjectile?.trace, preview);
        const restarted = await fixture.restart();
        try { assert.equal(canonicalSimulationJsonV10(restarted.snapshot), initial); }
        finally { restarted.destroy(); }
        for (let window = 0; window < 35 && fixture.snapshot.turn < 2; window += 1) clock.advanceThirtyTicks();
        assert.ok(fixture.snapshot.turn >= 2);
        assert.notEqual(fixture.snapshot.finishReason, 'simulation_limit');
    } finally { stop(); fixture.destroy(); }
});

test('V10 aiming excludes preview computation but retains pre-existing and subsequent clock debt', async () => {
    for (const ruleset of [V10_RULESET_ID, V10_R1_RULESET_ID, V10_R2_RULESET_ID, V10_R3_RULESET_ID, V10_R4_RULESET_ID]) {
        let now = 0;
        const fixture = await createTerrainStartsV10Fixture(1, 'wizard', {
            now: () => now, every: () => () => {}
        }, ruleset);
        try {
            now += 100;
            const before = canonicalSimulationJsonV10(fixture.snapshot);
            const trace = fixture.trajectoryPreview({
                // Model slow synchronous computation within the actual preview call.
                get angleMilliDegrees() { now += 1_200; return 45_000; },
                powerPermille: 800
            });
            assert.ok(trace.length > 1);
            assert.equal(canonicalSimulationJsonV10(fixture.snapshot), before);
            const aimed = await fixture.submit({ type: 'aim', angleMilliDegrees: 45_000, powerPermille: 800 });
            assert.equal(aimed.tick, 3, 'time before preview still advances the live clock');
            assert.equal(aimed.selectedRelic, 'threadball');
            const fired = await fixture.submit({ type: 'fire', aimId: aimed.aimId });
            assert.equal(fired.phase, 'projectile');
            now += 1_100;
            await assert.rejects(fixture.submit({ type: 'aim', angleMilliDegrees: 45_000, powerPermille: 800 }));
            assert.equal(fixture.snapshot.finishReason, 'simulation_limit', 'real scheduling debt still stops play');
        } finally { fixture.destroy(); }

        now = 0;
        const overdue = await createTerrainStartsV10Fixture(1, 'wizard', {
            now: () => now, every: () => () => {}
        }, ruleset);
        try {
            now += 1_100;
            overdue.trajectoryPreview({
                get angleMilliDegrees() { now += 1_200; return 45_000; }, powerPermille: 800
            });
            await assert.rejects(overdue.submit({ type: 'aim', angleMilliDegrees: 45_000, powerPermille: 800 }));
            assert.equal(overdue.snapshot.finishReason, 'simulation_limit', 'preview cannot erase earlier debt');
        } finally { overdue.destroy(); }
    }
});

test('V10C local fixture exposes a detached terrain preview without transport or reward facts', async () => {
    const clock = createClock();
    const fixture = await createTerrainStartsV10Fixture(1, 'wizard', clock);
    try {
        assert.equal(fixture.kind, 'v10');
        assert.equal(fixture.previewLabel, 'V10 terrain engineering preview · local-only');
        assert.equal(fixture.snapshot.rulesetId, V10_RULESET_ID);
        assert.equal(fixture.snapshot.terrainProfileId, 'rising-braid');
        const before = canonicalSimulationJsonV10(fixture.snapshot);
        const trace = trajectoryPreviewV10(fixture.snapshot, {
            angleMilliDegrees: 45_000,
            powerPermille: 1_000
        });
        assert.ok(trace.length > 1);
        assert.equal(canonicalSimulationJsonV10(fixture.snapshot), before);
    } finally {
        fixture.destroy();
    }
});

test('V10 R7 local fixture exposes the full volcanic battlefield identity and preserves it on restart', async () => {
    const fixture = await createTerrainStartsV10Fixture(4, 'wizard', createClock(), V10_R7_RULESET_ID);
    try {
        assert.equal(fixture.kind, 'v10');
        assert.equal(fixture.previewLabel, 'V10 R7 terrain-as-gameplay preview · full volcanic battlefield · local-only');
        assert.equal(fixture.snapshot.rulesetId, V10_R7_RULESET_ID);
        assert.equal(fixture.snapshot.terrainProfileId, 'volcanic-ruin');
        assert.equal(fixture.snapshot.units[0].thread, 5);
        const restarted = await fixture.restart();
        try {
            assert.equal(restarted.snapshot.rulesetId, V10_R7_RULESET_ID);
            assert.equal(restarted.snapshot.terrainProfileId, 'volcanic-ruin');
            assert.deepEqual(restarted.snapshot.terrain, fixture.snapshot.terrain);
        } finally {
            restarted.destroy();
        }
    } finally {
        fixture.destroy();
    }
});

test('V10 R7 local fixture restores exact changed terrain and explicit restart starts fresh', async () => {
    const values = new Map<string, string>();
    const storage = {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); }
    };
    const first = await createTerrainStartsV10Fixture(4, 'wizard', createClock(), V10_R7_RULESET_ID, storage);
    const key = [...values.keys()][0];
    first.destroy();
    const changed = structuredClone(first.snapshot);
    deformTerrain(changed.terrain, 1_040, 360, 64);
    changed.terrainRevision! += 1;
    changed.terrainHash = hashTerrainV10R7(changed.terrain);
    values.set(key, JSON.stringify(changed));

    const resumed = await createTerrainStartsV10Fixture(4, 'wizard', createClock(), V10_R7_RULESET_ID, storage);
    try {
        assert.equal(resumed.snapshot.terrainRevision, 1);
        assert.equal(canonicalSimulationJsonV10(resumed.snapshot), canonicalSimulationJsonV10(changed));
        const restarted = await resumed.restart();
        try {
            assert.equal(restarted.snapshot.terrainRevision, 0);
            assert.notEqual(restarted.snapshot.terrainHash, changed.terrainHash);
        } finally { restarted.destroy(); }
    } finally { resumed.destroy(); }
});

test('V10E local fixture exposes the revised terrain identity and preserves restart', async () => {
    const clock = createClock();
    const fixture = await createTerrainStartsV10Fixture(1, 'wizard', clock, V10_R1_RULESET_ID);
    try {
        assert.equal(fixture.kind, 'v10');
        assert.equal(fixture.previewLabel, 'V10E tactical terrain preview · local-only');
        assert.equal(fixture.snapshot.rulesetId, V10_R1_RULESET_ID);
        assert.equal(fixture.snapshot.terrainProfileId, 'broken-loom');
        const restarted = await fixture.restart();
        try {
            assert.equal(restarted.snapshot.rulesetId, V10_R1_RULESET_ID);
            assert.deepEqual(restarted.snapshot.terrain, fixture.snapshot.terrain);
        } finally {
            restarted.destroy();
        }
    } finally {
        fixture.destroy();
    }
});

test('V10F review route seeds are strict, deterministic and preserve every procedural family', async () => {
    assert.equal(v10FPreviewSeed('?terrain-seed=4'), 4);
    for (const search of ['', '?terrain-seed=0', '?terrain-seed=-1', '?terrain-seed=1.5',
        '?terrain-seed=4294967296', '?terrain-seed=not-a-seed']) {
        assert.equal(v10FPreviewSeed(search), 1, search);
    }

    const cases = [
        { seed: 1, profile: 'asymmetric-rampart', candidate: 4, reflected: false, label: 'Asymmetric Rampart' },
        { seed: 5, profile: 'asymmetric-rampart', candidate: 0, reflected: true, label: 'Asymmetric Rampart' },
        { seed: 2, profile: 'trench-needle', candidate: 7, reflected: false, label: 'Trench Needle' },
        { seed: 3, profile: 'stepping-mesa', candidate: 4, reflected: false, label: 'Stepping Mesa' },
        { seed: 4, profile: 'twin-crests', candidate: 2, reflected: false, label: 'Twin Crests' }
    ] as const;
    for (const expected of cases) {
        const fixture = await createTerrainStartsV10Fixture(expected.seed, 'wizard', createClock(), V10_R2_RULESET_ID);
        try {
            assert.equal(fixture.snapshot.rulesetId, V10_R2_RULESET_ID);
            assert.equal(fixture.snapshot.seed, expected.seed);
            assert.equal(fixture.snapshot.terrainProfileId, expected.profile);
            assert.equal(fixture.snapshot.terrainRecipeRevision, 'v10f-recipes-r1');
            assert.equal(fixture.snapshot.terrainCandidateIndex, expected.candidate);
            assert.equal(fixture.previewTerrainReflected, expected.reflected);
            assert.equal(fixture.previewLabel,
                `V10F procedural terrain preview · ${expected.label} · candidate ${expected.candidate} · ${expected.reflected ? 'reflected' : 'authored'} · local-only`);
            const restarted = await fixture.restart();
            try {
                assert.equal(restarted.snapshot.seed, expected.seed);
                assert.equal(canonicalSimulationJsonV10(restarted.snapshot), canonicalSimulationJsonV10(fixture.snapshot));
            } finally {
                restarted.destroy();
            }
        } finally {
            fixture.destroy();
        }
    }
});

test('V10C local fixture charges 30 live ticks, then executes a bounded Loomkeeper response', async () => {
    const clock = createClock();
    const fixture = await createTerrainStartsV10Fixture(1, 'wizard', clock);
    const events: string[] = [];
    const stop = fixture.onSnapshot((_state, next) => events.push(...next.map(event => event.type)));
    try {
        for (let window = 0; window < 20 && fixture.snapshot.activeActor !== 'loomkeeper'; window += 1) {
            clock.advanceThirtyTicks();
        }
        const handoff = fixture.snapshot;
        assert.equal(handoff.activeActor, 'loomkeeper');
        assert.equal(handoff.phase, 'action');
        const planningStart = handoff.tick;
        clock.advanceThirtyTicks();
        const planned = fixture.snapshot;
        assert.equal(planned.tick, planningStart + 30);
        assert.ok(planned.aim !== null || planned.heldDirection !== 0 || planned.utilityUsed,
            'the first operation is applied only after all 30 planning ticks');
        assert.equal(planned.terrainProfileId, handoff.terrainProfileId);

        for (let window = 0; window < 40 && fixture.snapshot.activeActor === 'loomkeeper' &&
            fixture.snapshot.phase !== 'finished'; window += 1) clock.advanceThirtyTicks();
        assert.ok(events.includes('impact'));
        assert.ok(fixture.snapshot.lastProjectile, 'the inherited policy completed a projectile');
        assert.ok(fixture.snapshot.phase === 'finished' || fixture.snapshot.activeActor === 'player');
        assert.equal(fixture.snapshot.rulesetId, V10_RULESET_ID);
        assert.equal(fixture.snapshot.terrainProfileId, handoff.terrainProfileId);
    } finally {
        stop();
        fixture.destroy();
    }
});

test('V10E local fixture completes a bounded Loomkeeper response on tactical terrain', async () => {
    const clock = createClock();
    const fixture = await createTerrainStartsV10Fixture(1, 'wizard', clock, V10_R1_RULESET_ID);
    const events: string[] = [];
    const stop = fixture.onSnapshot((_state, next) => events.push(...next.map(event => event.type)));
    try {
        for (let window = 0; window < 20 && fixture.snapshot.activeActor !== 'loomkeeper'; window += 1) {
            clock.advanceThirtyTicks();
        }
        assert.equal(fixture.snapshot.activeActor, 'loomkeeper');
        for (let window = 0; window < 45 && fixture.snapshot.activeActor === 'loomkeeper' &&
            fixture.snapshot.phase !== 'finished'; window += 1) clock.advanceThirtyTicks();
        assert.ok(events.includes('impact'));
        assert.ok(fixture.snapshot.lastProjectile);
        assert.ok(fixture.snapshot.phase === 'finished' || fixture.snapshot.activeActor === 'player');
        assert.equal(fixture.snapshot.rulesetId, V10_R1_RULESET_ID);
        assert.equal(fixture.snapshot.terrainProfileId, 'broken-loom');
    } finally {
        stop();
        fixture.destroy();
    }
});

test('V10F local fixture completes a bounded Loomkeeper response on procedural terrain', async () => {
    const clock = createClock();
    const fixture = await createTerrainStartsV10Fixture(1, 'wizard', clock, V10_R2_RULESET_ID);
    const events: string[] = [];
    const stop = fixture.onSnapshot((_state, next) => events.push(...next.map(event => event.type)));
    try {
        for (let window = 0; window < 20 && fixture.snapshot.activeActor !== 'loomkeeper'; window += 1) {
            clock.advanceThirtyTicks();
        }
        assert.equal(fixture.snapshot.activeActor, 'loomkeeper');
        for (let window = 0; window < 45 && fixture.snapshot.activeActor === 'loomkeeper' &&
            fixture.snapshot.phase !== 'finished'; window += 1) clock.advanceThirtyTicks();
        assert.ok(events.includes('impact'));
        assert.ok(fixture.snapshot.lastProjectile);
        assert.ok(fixture.snapshot.phase === 'finished' || fixture.snapshot.activeActor === 'player');
        assert.equal(fixture.snapshot.rulesetId, V10_R2_RULESET_ID);
        assert.equal(fixture.snapshot.terrainProfileId, 'asymmetric-rampart');
    } finally {
        stop();
        fixture.destroy();
    }
});


test('V10G phone map query selects only named reviewed recipes', () => {
    for (const [name, seed] of Object.entries({ 'twin-crests': 4, 'trench-needle': 5, 'stepping-mesa': 6,
        'rampart-high-left': 7, 'rampart-high-right': 8 })) assert.equal(v10GPreviewSeed(`?terrain-map=${name}`), seed);
    for (const search of ['', '?terrain-map=unknown', '?terrain-map=__proto__', '?terrain-seed=6']) assert.equal(v10GPreviewSeed(search), 4);
});
