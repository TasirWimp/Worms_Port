import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createTerrainStartsV10Fixture,
    trajectoryPreviewV10,
    v10FPreviewSeed,
    type V10FixtureClock
} from '../../client/src/combat/terrain-starts-v10-fixture';
import {
    canonicalSimulationJsonV10, V10_R1_RULESET_ID, V10_R2_RULESET_ID, V10_RULESET_ID
} from '../../shared/simulation-v10';

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

test('V10 aiming excludes preview computation but retains pre-existing and subsequent clock debt', async () => {
    for (const ruleset of [V10_RULESET_ID, V10_R1_RULESET_ID, V10_R2_RULESET_ID]) {
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
