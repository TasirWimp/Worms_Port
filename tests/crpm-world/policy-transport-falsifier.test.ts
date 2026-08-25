import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    rmdirSync,
    symlinkSync,
    unlinkSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { canonicalJson, sha256Digest } from '../../analysis/crpm_world/canonical';
import {
    assessPolicyTransport,
    canonicalD2LResult
} from '../../analysis/crpm_world/navigation/assess-policy-transport';
import {
    D2LRawExportSchema,
    D2LResultSchema,
    type D2LRawExport
} from '../../analysis/crpm_world/navigation/policy-transport-schemas';
import { resolveD2LOutputPath } from '../../scripts/run-policy-transport-falsifier';

const encodedRaw = execFileSync(
    'python',
    ['-m', 'analysis.tactical_model.policy_transport_probe'],
    {
        cwd: process.cwd(),
        encoding: 'utf8',
        maxBuffer: 128 * 1024 * 1024,
        windowsHide: true
    }
);
const raw = D2LRawExportSchema.parse(JSON.parse(encodedRaw));
const result = assessPolicyTransport(raw);

function summary(frameId: string, variant: string) {
    const value = result.variantSummaries.find((item) =>
        item.frameId === frameId && item.variant === variant
    );
    assert.ok(value, `missing ${frameId}/${variant}`);
    return value;
}

test('D2L raw export is source-locked and covers both complete frames', () => {
    assert.equal(raw.exportDigest, '49a7effcf241fa3b7db519cb498ed54e83705030c365dc4986eeceaa1e018eac');
    assert.equal(raw.matches.length, 2_200);
    for (const variant of raw.domain.variants) {
        assert.equal(raw.matches.filter((item) =>
            item.frameId === 'f4_cross_band_v0' && item.variant === variant
        ).length, 250);
        assert.equal(raw.matches.filter((item) =>
            item.frameId === 'd2k_boundary_v0' && item.variant === variant
        ).length, 300);
    }
    assert.equal(new Set(raw.matches.map((item) => item.matchRef)).size, 2_200);
});

test('baseline and three fixed variants reproduce the declared primary transport', () => {
    const baseline = summary('f4_cross_band_v0', 'baseline_v0');
    const tie = summary('f4_cross_band_v0', 'terminal_tie_residue_v0');
    const response = summary('f4_cross_band_v0', 'preparation_response_lethal_guard_v0');
    const global = summary('f4_cross_band_v0', 'global_lethal_guard_v0');
    assert.deepEqual(baseline.distances.map((item) => item.firstActorWins), [30, 28, 30, 30, 40]);
    assert.equal(baseline.firstActorWins, 158);
    assert.equal(tie.firstActorWins, 158);
    assert.equal(tie.outcomeChangesFromBaseline, 0);
    assert.equal(tie.substitutionCount, 214);
    assert.deepEqual(response.distances.map((item) => item.firstActorWins), [34, 32, 34, 30, 36]);
    assert.equal(response.firstActorWins, 166);
    assert.equal(response.outcomeChangesFromBaseline, 24);
    assert.equal(response.firstActorGainCount, 16);
    assert.equal(response.secondActorGainCount, 8);
    assert.equal(response.substitutionCount, 52);
    assert.deepEqual(global.distances.map((item) => item.firstActorWins), [38, 36, 38, 40, 32]);
    assert.equal(global.firstActorWins, 184);
    assert.equal(global.outcomeChangesFromBaseline, 42);
    assert.equal(global.substitutionCount, 236);
});

test('the local response repair preserves cycle one and closes every cycle-two omission', () => {
    const matches = raw.matches.filter((item) =>
        item.frameId === 'd2k_boundary_v0' &&
        item.variant === 'preparation_response_lethal_guard_v0' &&
        item.firstPolicy === 'short_approach' && item.secondPolicy === 'short_approach'
    );
    assert.equal(matches.length, 12);
    for (const match of matches) {
        assert.equal(match.substitutions.some((item) => item.responseCarrierIndex === 1), false);
        const cycleTwo = match.substitutions.filter((item) => item.responseCarrierIndex === 2);
        assert.equal(cycleTwo.length, 1);
        assert.equal(cycleTwo[0]?.selectedAction.actionKey, 'cast:threadball:stay');
        assert.equal(cycleTwo[0]?.escapeSlackSpend, 0);
        assert.equal(cycleTwo[0]?.displacement, 0);
    }
    assert.equal(result.gates.firstCycleCocoonBranchPreserved, true);
    assert.equal(result.gates.secondCycleImmediateOmissionsRepaired, true);
});

test('phase transport follows the actor owning the response edge, not protected initiative', () => {
    assert.equal(result.phaseTransportWitnesses.length, 24);
    const counts = new Map<number, { first: number; second: number }>();
    for (const witness of result.phaseTransportWitnesses) {
        const value = counts.get(witness.startingDistance) ?? { first: 0, second: 0 };
        if (witness.guardedWinnerRole === 'first') value.first += 1;
        if (witness.guardedWinnerRole === 'second') value.second += 1;
        counts.set(witness.startingDistance, value);
        assert.equal(witness.guardedWinnerRole, witness.substitutionActorRole);
    }
    assert.deepEqual(Object.fromEntries(counts), {
        448: { first: 4, second: 0 },
        512: { first: 4, second: 0 },
        576: { first: 4, second: 0 },
        640: { first: 4, second: 4 },
        704: { first: 0, second: 4 }
    });
    assert.equal(result.disposition.classification, 'rejected');
});

test('tie cleanup restores terminal symmetry but the response guard retains two path mismatches', () => {
    const boundaryBaseline = summary('d2k_boundary_v0', 'baseline_v0');
    const boundaryTie = summary('d2k_boundary_v0', 'terminal_tie_residue_v0');
    const boundaryResponse = summary('d2k_boundary_v0', 'preparation_response_lethal_guard_v0');
    const boundaryGlobal = summary('d2k_boundary_v0', 'global_lethal_guard_v0');
    assert.equal(boundaryBaseline.orientationMismatchCount, 3);
    assert.equal(boundaryTie.orientationMismatchCount, 0);
    assert.equal(boundaryResponse.orientationMismatchCount, 2);
    assert.equal(boundaryGlobal.orientationMismatchCount, 0);
    assert.equal(result.gates.boundarySelectionEquivariant, false);
    const responseWitnesses = result.orientationMismatchWitnesses.filter((item) =>
        item.variant === 'preparation_response_lethal_guard_v0'
    );
    assert.equal(responseWitnesses.length, 2);
    assert.deepEqual(responseWitnesses.map((item) => item.startingDistance), [639, 640]);
    assert.ok(responseWitnesses.every((item) =>
        item.firstPolicy === 'retreat_kite' && item.secondPolicy === 'best_response'
    ));
});

test('D2L assessment is deterministic, non-mutating, strict, and digest-bound', () => {
    const before = canonicalJson(raw);
    const repeated = assessPolicyTransport(raw);
    assert.equal(canonicalJson(raw), before);
    assert.equal(canonicalD2LResult(repeated), canonicalD2LResult(result));
    assert.equal(result.resultDigest, '24b24c7595a1902b2a38070fc97cbf4e0ff4a41e381ca5338b70c51f85eff8bd');
    const { resultDigest, ...payload } = result;
    assert.equal(resultDigest, sha256Digest(payload));

    const drifted = JSON.parse(before) as D2LRawExport;
    drifted.sourceBindings.modelSha256 = '0'.repeat(64) as typeof drifted.sourceBindings.modelSha256;
    const { exportDigest: _ignored, ...driftedPayload } = drifted;
    drifted.exportDigest = sha256Digest(driftedPayload);
    assert.equal(D2LRawExportSchema.safeParse(drifted).success, false);
    const alteredResult = JSON.parse(canonicalD2LResult(result)) as Record<string, unknown>;
    alteredResult.resultDigest = '0'.repeat(64);
    assert.equal(D2LResultSchema.safeParse(alteredResult).success, false);
});

test('D2L runner is fixed, fail-closed, and link-aware output-confined', (context) => {
    assert.match(
        resolveD2LOutputPath('test-results/crpm-world/d2l-policy-transport/result.json').replaceAll('\\', '/'),
        /test-results\/crpm-world\/d2l-policy-transport\/result\.json$/
    );
    assert.throws(() => resolveD2LOutputPath('analysis/tactical_model/model.py'), /below/);
    assert.throws(
        () => resolveD2LOutputPath('test-results/crpm-world/d2l-policy-transport/result.txt'),
        /JSON/
    );
    const runnerSource = readFileSync('scripts/run-policy-transport-falsifier.ts', 'utf8');
    assert.match(runnerSource, /\['-m', 'analysis\.tactical_model\.policy_transport_probe'\]/);
    assert.doesNotMatch(runnerSource, /\beval\s*\(|new Function|import\s*\(/);
    const rejected = spawnSync(process.execPath, [
        '--import', 'tsx', 'scripts/run-policy-transport-falsifier.ts', '--variant', 'arbitrary'
    ], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /accepts only one optional --output/);

    const allowedRoot = resolve('test-results/crpm-world/d2l-policy-transport');
    mkdirSync(allowedRoot, { recursive: true });
    const linkPath = mkdtempSync(join(allowedRoot, 'link-test-'));
    const outside = mkdtempSync(join(tmpdir(), 'd2l-output-link-'));
    rmdirSync(linkPath);
    try {
        symlinkSync(outside, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
        rmSync(outside, { recursive: true, force: true });
        context.skip(`The platform does not permit a directory link for this boundary test: ${String(error)}`);
        return;
    }
    try {
        assert.throws(
            () => resolveD2LOutputPath(join(linkPath, 'escaped-result.json')),
            /must not traverse symbolic links or junctions/
        );
    } finally {
        unlinkSync(linkPath);
        rmSync(outside, { recursive: true, force: true });
    }
});
