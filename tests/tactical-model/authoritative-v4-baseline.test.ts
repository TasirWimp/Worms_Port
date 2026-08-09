import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildAuthoritativeV4BaselineFixture } from '../../scripts/export-tactical-v4-baseline';

test('the checked-in D2A V4 fixture is regenerated only from authoritative TypeScript rules', () => {
    const fixture = JSON.parse(readFileSync(
        new URL('../../analysis/tactical_model/fixtures/v4-authoritative-baseline-v1.json', import.meta.url),
        'utf8'
    ));
    assert.deepEqual(fixture, buildAuthoritativeV4BaselineFixture());
});
