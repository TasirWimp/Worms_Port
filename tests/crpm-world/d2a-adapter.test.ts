import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';

import { sha256Digest } from '../../analysis/crpm_world/canonical';
import { WorldDesignResultSchema } from '../../analysis/crpm_world/schemas';

function exportCases(...caseIds: string[]): unknown {
    const args = ['-m', 'analysis.crpm_world.adapters.d2a_export'];
    for (const caseId of caseIds) {
        args.push('--case', caseId);
    }
    return JSON.parse(execFileSync('python', args, {
        cwd: process.cwd(),
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024
    }));
}

test('Python D2A export validates as a strict CRPM-world design result', () => {
    const result = WorldDesignResultSchema.parse(exportCases('f2', 'f3', 'f4', 'h2', 'h3'));

    assert.equal(result.productAuthority, 'none');
    assert.equal(result.evidenceOrigin, 'analysis-derived');
    assert.equal(result.maturity, 'M2_local_use');
    assert.equal(result.diagnostics.length, 5);
    assert.deepEqual(result.traces.map((trace) => trace.voyageId), [
        'd2a-f2-pressure-voyage',
        'd2a-f3-pressure-voyage',
        'd2a-h3-pressure-voyage'
    ]);
    assert.equal(result.transitionWitnesses.length, 7);
    assert.deepEqual(result.returnAssessments[0].satisfiedClassifications, ['recursive_carrier_return']);
    const h3 = result.traces.find((trace) => trace.voyageId === 'd2a-h3-pressure-voyage');
    assert.ok(h3);
    assert.equal(h3.compatibilityResult.compatible, true);
    assert.ok(h3.transitionEdges[1].residual.unresolvedObligations.includes(
        'd2a.h3.loomkeeper.frayed_seam_turns'
    ));
    assert.ok(h3.transitionEdges[1].residual.carriedObligations.includes(
        'd2a.h3.loomkeeper.frayed_seam_turns'
    ));
    assert.ok(h3.transitionEdges[2].residual.dischargedObligations.includes(
        'd2a.h3.loomkeeper.frayed_seam_turns'
    ));
    const h3Obligation = result.worldObligations.find((item) =>
        item.obligationId === 'd2a.h3.loomkeeper.frayed_seam_turns'
    );
    assert.ok(h3Obligation);
    assert.equal(h3Obligation.lifecycleStatus, 'discharged');
    const { resultDigest, ...payload } = result;
    assert.equal(resultDigest, sha256Digest(payload));
});

test('identical Python D2A exports have identical bytes and digests', () => {
    const first = execFileSync('python', [
        '-m', 'analysis.crpm_world.adapters.d2a_export', '--case', 'f2'
    ], { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const second = execFileSync('python', [
        '-m', 'analysis.crpm_world.adapters.d2a_export', '--case', 'f2'
    ], { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });

    assert.equal(first, second);
    assert.equal(
        WorldDesignResultSchema.parse(JSON.parse(first)).resultDigest,
        WorldDesignResultSchema.parse(JSON.parse(second)).resultDigest
    );
});

test('unknown D2A candidate ids fail closed before JSON emission', () => {
    const execution = spawnSync('python', [
        '-m', 'analysis.crpm_world.adapters.d2a_export', '--case', 'unknown-candidate'
    ], { cwd: process.cwd(), encoding: 'utf8' });

    assert.equal(execution.status, 1);
    assert.match(execution.stderr, /Unknown D2A candidate config/);
    assert.equal(execution.stdout, '');
});

test('the TypeScript validator rejects additions to the Python result envelope', () => {
    const result = exportCases('h2') as Record<string, unknown>;
    result.unregisteredCandidate = { executable: true };

    assert.equal(WorldDesignResultSchema.safeParse(result).success, false);
});
