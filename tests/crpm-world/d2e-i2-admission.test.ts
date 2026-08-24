import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

import {
    buildD2EI2AnalysisSurfaces,
    executeD2EI2Request,
    readD2EI2RequestFile,
    resolveD2EI2OutputPath,
    runD2EI2AnalyticalExport
} from '../../analysis/crpm_world/admissions/i2/execute-request';
import { D2E_APPROVED_IMPLEMENTATION_LOCK_PATH } from '../../analysis/crpm_world/admissions/i2/implementation-lock';
import {
    D2E_ALLOWED_PORTS,
    D2E_CUT,
    D2E_EXCLUDED_INITIAL_CARRIER_DISTANCE,
    D2E_MANDATORY_EVIDENCE_PROBES,
    D2E_REPORT_BINDINGS,
    D2E_STARTING_DISTANCES
} from '../../analysis/crpm_world/admissions/i2/registry';
import {
    D2EI2AnalyticalExportSchema,
    buildD2EI2Request,
    type D2EI2RequestPayload
} from '../../analysis/crpm_world/admissions/i2/schemas';

const REQUEST_PATH = 'analysis/crpm_world/examples/d2e-i2-spawn-pressure-request.json';
let cachedEvidence: ReturnType<typeof runD2EI2AnalyticalExport> | undefined;

function rawRequest(): D2EI2RequestPayload {
    return readD2EI2RequestFile(REQUEST_PATH) as D2EI2RequestPayload;
}

function evidence() {
    cachedEvidence ??= runD2EI2AnalyticalExport();
    return cachedEvidence;
}

test('D2E request is exact, canonical, and insensitive to object-key order', () => {
    const payload = rawRequest();
    const reordered = Object.fromEntries(Object.entries(payload).reverse());
    const first = buildD2EI2Request(payload);
    const second = buildD2EI2Request(reordered);
    assert.equal(first.requestDigest, second.requestDigest);
    assert.deepEqual(first.scenarioDomain.scenarioIds, D2E_STARTING_DISTANCES.map((distance) => `d2e-i2-start-${distance}`));
    assert.deepEqual([...first.mandatoryEvidenceProbes].sort(), [...D2E_MANDATORY_EVIDENCE_PROBES].sort());
});

test('cross-language I2 export is strict, source-bound, and retains all comparator digests', () => {
    const result = D2EI2AnalyticalExportSchema.parse(evidence());
    assert.deepEqual(
        Object.fromEntries(result.reportBindings.map((binding) => [binding.caseId, binding.reportDigest])),
        D2E_REPORT_BINDINGS
    );
    assert.equal(result.domain.productionSpawnReference, 640);
    assert.deepEqual(result.domain.excludedInitialCarrierDistances, [D2E_EXCLUDED_INITIAL_CARRIER_DISTANCE]);
    assert.equal(result.horizonWarning.admissibleInitialCarrier, false);
});

test('D2E surfaces compose entry, response, and in-band control as separate witnessed edges', () => {
    const request = buildD2EI2Request(rawRequest());
    const surfaces = buildD2EI2AnalysisSurfaces(request, evidence());
    assert.equal(surfaces.traces.length, 4);
    assert.deepEqual(surfaces.traces.map((trace) => trace.transitionEdges.length), [2, 2, 2, 1]);
    assert.deepEqual(
        surfaces.traces.slice(0, 3).map((trace) => trace.transitionEdges.map((edge) => edge.domainMotif)),
        [
            ['outside_range_to_enter_range', 'enter_range_to_opponent_response'],
            ['outside_range_to_enter_range', 'enter_range_to_opponent_response'],
            ['outside_range_to_enter_range', 'enter_range_to_opponent_response']
        ]
    );
    assert.equal(surfaces.traces[3].transitionEdges[0].domainMotif, 'later_in_band_cast_to_resolution');
    assert.ok(surfaces.traces.every((trace) => trace.compatibilityResult.compatible));
    assert.equal(surfaces.transitionWitnesses.length, 7);
    assert.equal(surfaces.worldObligations.length, 1);
    assert.equal(surfaces.worldObligations[0].obligationType, 'seam_pin');
    assert.equal(surfaces.diagnosticProfile.closureRisk.value, 'blocked_landfall');
    assert.deepEqual(
        surfaces.scalarProbes.map((probe) => probe.probeId),
        D2E_MANDATORY_EVIDENCE_PROBES
    );
});

test('unknown fields, domain drift, cut drift, forbidden ports, and arbitrary execution fail closed', () => {
    const payload = rawRequest();
    assert.throws(() => buildD2EI2Request({ ...payload, operator: 'eval(userCode)' }));
    assert.throws(() => buildD2EI2Request({
        ...payload,
        scenarioDomain: {
            ...payload.scenarioDomain,
            scenarioIds: payload.scenarioDomain.scenarioIds.filter((id) => !id.endsWith('-705'))
        }
    }), /complete registered twelve-start domain|invalid/i);
    assert.throws(() => buildD2EI2Request({
        ...payload,
        cut: { id: D2E_CUT.id, version: 99 }
    }));
    assert.throws(() => buildD2EI2Request({
        ...payload,
        requestedPorts: [...D2E_ALLOWED_PORTS, 'v5-activation']
    }), /Forbidden port requested|invalid/i);
    assert.throws(() => buildD2EI2Request({
        ...payload,
        sequence: [{ ...payload.sequence[0], modulePath: './candidate.ts' }]
    }));
});

test('generated output cannot overwrite source or escape the ignored D2E result root', () => {
    assert.throws(() => resolveD2EI2OutputPath(
        'analysis/tactical_model/configs/v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-entry-seam-pin-candidate-i2.json'
    ));
    assert.throws(() => resolveD2EI2OutputPath('test-results/crpm-world/other-result.json'));
    assert.match(
        resolveD2EI2OutputPath('test-results/crpm-world/d2e-i2/result.json').replaceAll('\\', '/'),
        /test-results\/crpm-world\/d2e-i2\/result\.json$/
    );
});

test('unsealed D2E execution fails before running the analytical adapter', {
    skip: existsSync(D2E_APPROVED_IMPLEMENTATION_LOCK_PATH)
}, () => {
    assert.throws(
        () => executeD2EI2Request(buildD2EI2Request(rawRequest())),
        /not sealed/
    );
});

test('sealed D2E execution emits one authenticated deterministic result', {
    skip: !existsSync(D2E_APPROVED_IMPLEMENTATION_LOCK_PATH)
}, () => {
    const request = buildD2EI2Request(rawRequest());
    const first = executeD2EI2Request(request);
    const second = executeD2EI2Request(request);
    assert.equal(first.resultDigest, second.resultDigest);
    assert.deepEqual(first, second);
    assert.equal(first.maturity, 'M2_local_use');
    assert.equal(first.analyticalDisposition, 'structural_reference');
    assert.equal(first.productAuthority, 'none');
});

