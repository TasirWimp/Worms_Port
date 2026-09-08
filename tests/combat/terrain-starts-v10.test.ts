import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createTerrainStartsV10Fixture,
    trajectoryPreviewV10,
    type V10FixtureClock
} from '../../client/src/combat/terrain-starts-v10-fixture';
import {
    canonicalSimulationJsonV10, V10_R1_RULESET_ID, V10_RULESET_ID
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
