import assert from 'node:assert/strict';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    rmdirSync,
    symlinkSync,
    unlinkSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import test from 'node:test';

import {
    defaultWorldDesignOutputPath,
    executeWorldDesignRequest,
    readWorldDesignRequestFile,
    resolveWorldDesignOutputPath
} from '../../analysis/crpm_world/design-port/execute-request';
import {
    buildOfflineWorldDesignRequest,
    parseOrBuildOfflineWorldDesignRequest,
    validateOfflineWorldDesignRequest,
    type OfflineWorldDesignRequestPayload
} from '../../analysis/crpm_world/design-port/validate-request';
import { WorldDesignResultSchema } from '../../analysis/crpm_world/schemas';

const V4_REQUEST_PATH = 'analysis/crpm_world/examples/v4-transcript-request.json';
const D2A_REQUEST_PATH = 'analysis/crpm_world/examples/d2a-f3-pressure-request.json';

function rawRequest(path: string): OfflineWorldDesignRequestPayload {
    return readWorldDesignRequestFile(path) as OfflineWorldDesignRequestPayload;
}

function clone<T>(value: T): T {
    return structuredClone(value);
}

test('known V4 transcript executes through authority, voyage, replay, and projection evidence', () => {
    const request = buildOfflineWorldDesignRequest(rawRequest(V4_REQUEST_PATH));
    const result = WorldDesignResultSchema.parse(executeWorldDesignRequest(request));

    assert.equal(result.requestDigest, request.requestDigest);
    assert.equal(result.productAuthority, 'authority-adapter-parity');
    assert.equal(result.traces.length, 1);
    assert.equal(result.traces[0].transitionEdges.length, 4);
    assert.deepEqual(
        result.traces[0].transitionEdges.map((edge) => edge.domainMotif),
        ['move', 'select_relic', 'aim', 'fire']
    );
    assert.equal(result.traces[0].replaySupport.supported, true);
    assert.equal(result.traces[0].replaySupport.stateHashRefs.length, 5);
    assert.equal(result.projectionAssessments.length, 1);
    assert.equal(result.projectionAssessments[0].deterministicMapEligibility, true);
    assert.equal(result.diagnostics[0].schemaVersion, 2);
    const sourceDiagnostic = result.diagnostics.find((diagnostic) => diagnostic.schemaVersion === 1);
    assert.ok(sourceDiagnostic);
    assert.deepEqual(
        sourceDiagnostic.scalarProbes.map((probe) => probe.value),
        [4, 0, 4, 6]
    );
});

test('known D2A pressure request invokes only the registered analytical exporter', () => {
    const request = buildOfflineWorldDesignRequest(rawRequest(D2A_REQUEST_PATH));
    const result = WorldDesignResultSchema.parse(executeWorldDesignRequest(request));

    assert.equal(result.requestDigest, request.requestDigest);
    assert.equal(result.productAuthority, 'none');
    assert.equal(result.evidenceOrigin, 'analysis-derived');
    assert.deepEqual(result.traces.map((trace) => trace.voyageId), ['d2a-f3-pressure-voyage']);
    assert.equal(result.transitionWitnesses.length, 2);
    assert.equal(result.projectionAssessments.length, 1);
    assert.equal(result.diagnostics[0].schemaVersion, 2);
    const sourceDiagnostic = result.diagnostics.find((diagnostic) => diagnostic.schemaVersion === 1);
    assert.ok(sourceDiagnostic);
    assert.deepEqual(
        sourceDiagnostic.scalarProbes.map((probe) => [probe.probeId, probe.value]),
        [
            ['f3.threadback_distance', 64],
            ['f3.escape_slack_spent', 64],
            ['f3.first_actor_win_rate', 0.688]
        ]
    );
    assert.ok(result.blockedClaims.some((claim) => claim.includes('not a runtime service')));
    assert.equal(executeWorldDesignRequest(request).resultDigest, result.resultDigest);
});

test('same request repeats exactly while object-key order does not affect its digest', () => {
    const payload = rawRequest(V4_REQUEST_PATH);
    const reordered = Object.fromEntries(Object.entries(payload).reverse());
    const first = buildOfflineWorldDesignRequest(payload);
    const second = buildOfflineWorldDesignRequest(reordered);
    assert.equal(first.requestDigest, second.requestDigest);

    const firstResult = executeWorldDesignRequest(first);
    const secondResult = executeWorldDesignRequest(second);
    assert.equal(firstResult.resultDigest, secondResult.resultDigest);
    assert.deepEqual(firstResult, secondResult);
});

test('meaningful command order changes the request digest', () => {
    const payload = clone(rawRequest(V4_REQUEST_PATH));
    const swapped = clone(payload.sequence);
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    swapped.forEach((step, index) => { step.sequence = index; });
    const reordered = { ...payload, sequence: swapped };

    assert.notEqual(
        buildOfflineWorldDesignRequest(payload).requestDigest,
        buildOfflineWorldDesignRequest(reordered).requestDigest
    );
});

test('unknown adapter, adapter version, and config fail closed', () => {
    const v4 = rawRequest(V4_REQUEST_PATH) as unknown as Record<string, unknown>;
    assert.throws(() => buildOfflineWorldDesignRequest({
        ...v4,
        adapter: { id: 'arbitrary_adapter', version: 1 }
    }));
    assert.throws(() => buildOfflineWorldDesignRequest({
        ...v4,
        adapter: { id: 'v4_authority', version: 99 }
    }), /Unknown offline world-design adapter/);

    const d2a = rawRequest(D2A_REQUEST_PATH) as unknown as Record<string, unknown>;
    assert.throws(() => buildOfflineWorldDesignRequest({
        ...d2a,
        baseline: { kind: 'd2a_config', id: 'unknown-candidate', version: 1 }
    }), /not registered/);
});

test('live activation and protocol or reward mutation ports fail closed', () => {
    const payload = rawRequest(V4_REQUEST_PATH) as unknown as Record<string, unknown>;
    assert.throws(() => buildOfflineWorldDesignRequest({ ...payload, activation: 'live' }));
    for (const requestedPort of ['protocol-mutation', 'reward-mutation']) {
        assert.throws(() => buildOfflineWorldDesignRequest({
            ...payload,
            requestedPorts: ['analysis-result', requestedPort]
        }), /Forbidden design port/);
    }
});

test('incompatible cut, malformed seed, and undeclared domain fail closed', () => {
    const payload = rawRequest(V4_REQUEST_PATH);
    assert.throws(() => buildOfflineWorldDesignRequest({
        ...payload,
        cut: { id: 'thin_visible_duel_v0', version: 1 }
    }), /incompatible/);
    assert.throws(() => buildOfflineWorldDesignRequest({
        ...payload,
        seeds: [-1],
        scenarioDomain: { ...payload.scenarioDomain, seeds: [-1] }
    }));
    assert.throws(() => buildOfflineWorldDesignRequest({
        ...payload,
        scenarioDomain: { ...payload.scenarioDomain, scenarioIds: [] }
    }));
});

test('registered adapters reject unexecuted or extra seed claims', () => {
    for (const payload of [rawRequest(V4_REQUEST_PATH), rawRequest(D2A_REQUEST_PATH)]) {
        const registeredSeed = payload.seeds[0];
        const unregisteredSeed = registeredSeed + 1;
        assert.throws(() => buildOfflineWorldDesignRequest({
            ...payload,
            seeds: [unregisteredSeed],
            scenarioDomain: { ...payload.scenarioDomain, seeds: [unregisteredSeed] }
        }), /requires exactly the registered/);
        assert.throws(() => buildOfflineWorldDesignRequest({
            ...payload,
            seeds: [registeredSeed, unregisteredSeed],
            scenarioDomain: {
                ...payload.scenarioDomain,
                seeds: [registeredSeed, unregisteredSeed]
            }
        }), /requires exactly the registered/);
    }
});

test('unimplemented output-detail levels fail closed', () => {
    const payload = rawRequest(V4_REQUEST_PATH);
    for (const outputDetailLevel of ['summary', 'full'] as const) {
        assert.throws(() => buildOfflineWorldDesignRequest({
            ...payload,
            outputDetailLevel
        }), /Only the registered witnesses output-detail level/);
    }
});

test('arbitrary code/operator fields and mismatched supplied digests fail closed', () => {
    const payload = rawRequest(D2A_REQUEST_PATH);
    assert.throws(() => buildOfflineWorldDesignRequest({ ...payload, operator: 'eval(userCode)' }));
    assert.throws(() => buildOfflineWorldDesignRequest({
        ...payload,
        sequence: [{ ...payload.sequence[0], modulePath: './arbitrary-module.ts' }]
    }));
    const request = buildOfflineWorldDesignRequest(payload);
    assert.throws(() => validateOfflineWorldDesignRequest({
        ...request,
        requestDigest: '0'.repeat(64)
    }), /digest/);
});

test('generated output is restricted below the ignored CRPM-world result root', () => {
    const request = parseOrBuildOfflineWorldDesignRequest(rawRequest(V4_REQUEST_PATH));
    const defaultPath = defaultWorldDesignOutputPath(request);
    assert.match(defaultPath.replaceAll('\\', '/'), /test-results\/crpm-world\/v4-authority-transcript-example-result\.json$/);
    assert.throws(() => resolveWorldDesignOutputPath(
        'analysis/tactical_model/configs/v4-baseline-abstract-v1.json'
    ), /below test-results\/crpm-world/);
    assert.throws(() => resolveWorldDesignOutputPath(
        'analysis/crpm_world/examples/v4-transcript-request.json'
    ), /below test-results\/crpm-world/);
    assert.throws(() => resolveWorldDesignOutputPath('test-results/crpm-world/not-json.txt'));
});

test('generated output rejects a symlink or junction escape', (context) => {
    const allowedRoot = resolve('test-results/crpm-world');
    mkdirSync(allowedRoot, { recursive: true });
    const linkPath = mkdtempSync(join(allowedRoot, 'link-test-'));
    const outside = mkdtempSync(join(tmpdir(), 'crpm-world-output-link-'));
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
            () => resolveWorldDesignOutputPath(join(linkPath, 'escaped-result.json')),
            /must not traverse symbolic links or junctions/
        );
        assert.throws(
            () => readWorldDesignRequestFile(join(linkPath, 'escaped-request.json')),
            /must not traverse symbolic links or junctions/
        );
    } finally {
        unlinkSync(linkPath);
        rmSync(outside, { recursive: true, force: true });
    }
});

function sourceFiles(root: string): string[] {
    if (!existsSync(root)) return [];
    return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
        const path = join(root, entry.name);
        return entry.isDirectory() ? sourceFiles(path) : [path];
    });
}

test('production runtime modules do not import the analysis-only CRPM-world package', () => {
    const offenders = ['shared', 'client', 'server']
        .flatMap(sourceFiles)
        .filter((path) => /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(path))
        .filter((path) => readFileSync(path, 'utf8').replaceAll('\\', '/').includes('analysis/crpm_world'))
        .map((path) => relative(process.cwd(), path));
    assert.deepEqual(offenders, []);
});
