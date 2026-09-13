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
    assessTacticalOrderAtlas,
    canonicalD2MResult
} from '../../analysis/crpm_world/navigation/assess-tactical-order-atlas';
import { assessCocoonVoyages } from '../../analysis/crpm_world/navigation/assess-cocoon-voyages';
import { assessPolicyChoices } from '../../analysis/crpm_world/navigation/assess-policy-choices';
import { assessPolicyTransport } from '../../analysis/crpm_world/navigation/assess-policy-transport';
import {
    D2MInputBundleSchema,
    D2MResultSchema,
    type D2MInputBundle
} from '../../analysis/crpm_world/navigation/tactical-order-atlas-schemas';
import { resolveD2MOutputPath } from '../../scripts/run-tactical-order-atlas';

function probe(moduleName: string): unknown {
    return JSON.parse(execFileSync('python', ['-m', moduleName], {
        cwd: process.cwd(),
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        windowsHide: true
    }));
}

const d2iResult = assessCocoonVoyages(probe('analysis.tactical_model.reachable_carrier_probe'));
const d2kRaw = probe('analysis.tactical_model.policy_choice_relation_probe');
const d2kResult = assessPolicyChoices(d2kRaw);
const d2lResult = assessPolicyTransport(probe('analysis.tactical_model.policy_transport_probe'));
const input = D2MInputBundleSchema.parse({ d2iResult, d2kRaw, d2kResult, d2lResult });
const result = assessTacticalOrderAtlas(input);

test('D2M is source-locked to the exact D2I, D2K, D2L, model, config, and CRPM carriers', () => {
    assert.deepEqual(result.sourceBindings, {
        repositoryId: 'worms-port',
        sourceCommit: '502c2fdb2fca5be6a821f40561251033963e1024',
        crpmMethodCommit: '053c6fc0a90ed48d8667016b18a1d10106a7a2bc',
        d2iResultDigest: 'ff29c8a1d18a201ca9047e72f458e919151ec53cd581567219b307e393a4b7b0',
        d2kRawDigest: '47ef25b6557edaa1f477f0bdde80b0b1d8b041399adb844a22c8746f1314e769',
        d2kResultDigest: '5c544f6822744ac63a595ca4458bb2dfb72696836468a47bf494c628b5573832',
        d2lRawDigest: '49a7effcf241fa3b7db519cb498ed54e83705030c365dc4986eeceaa1e018eac',
        d2lResultDigest: '24b24c7595a1902b2a38070fc97cbf4e0ff4a41e381ca5338b70c51f85eff8bd',
        modelPath: 'analysis/tactical_model/model.py',
        modelSha256: 'af0b0ec8d9893e992bdc95123a915e24a2305ee2b9fff32bce95d27cdb4c8c08',
        configPath: 'analysis/tactical_model/configs/v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4.json',
        configSha256: '5e519b09ea5e5684185bcd527600705825ba75df8f01e310adb027d09d4f54e0',
        configId: 'v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4',
        configSchemaVersion: 11,
        crpmSourceBlobs: {
            candidateSpineGoal: 'b6c39c262a6abdee235dbb754bbb0168e21a79f1',
            candidateSpineCalibration: '8abf4a12442ab656c3a70b0b387da43eec99b03b',
            voyageRecursiveDynamics: '25a5ad5c3c0ed32409e425419d0b152948af2290',
            m9FormationCalibration: '499522e4d4d763ad633aef016a0fcf64fbc1f532',
            insightLog: '7b935dd881781dc2524b833ca01792c6d1c4ae86'
        }
    });
    assert.equal(result.productAuthority, 'none');
});

test('six local charts retain four exact carriers and the complete bounded response relation', () => {
    assert.deepEqual(result.localCharts.map((item) => [
        item.startingDistance,
        item.cycleIndex,
        item.responderPhase,
        item.localSectionStatus
    ]), [
        [639, 1, 'first', 'compatible_relation'],
        [640, 1, 'first', 'compatible_relation'],
        [641, 1, 'second', 'compatible_relation'],
        [639, 2, 'first', 'selection_split'],
        [640, 2, 'first', 'selection_split'],
        [641, 2, 'second', 'selection_split']
    ]);
    for (const chart of result.localCharts) {
        assert.equal(chart.exactCarrierClassCount, 4);
        assert.equal(chart.carrierRefs.length, 4);
        assert.equal(chart.legalResponseOrientationCompatible, true);
        assert.equal(chart.continuationOrientationCompatible, true);
        assert.equal(chart.allContinuationsTerminal, true);
        assert.equal(chart.recurrenceCount, 0);
        assert.deepEqual(chart.selectedResponseKinds, [
            'counter_preparation', 'needlepoint', 'paid_unweave', 'relocate', 'threadball'
        ]);
    }
});

test('overlaps preserve correspondence and expose both 640/641 quotient aliases', () => {
    assert.deepEqual(result.overlapJudgments.map((item) => ({
        cycle: item.cycleIndex,
        edge: `${item.leftDistance}/${item.rightDistance}`,
        immediate: item.immediateRelationEqual,
        policy: item.policySelectionEqual,
        continuation: item.continuationRelationEqual,
        phase: item.responderPhaseEqual,
        classification: item.classification
    })), [
        {
            cycle: 1, edge: '639/640', immediate: true, policy: true,
            continuation: true, phase: true, classification: 'compatible_with_exact_residue'
        },
        {
            cycle: 1, edge: '640/641', immediate: true, policy: true,
            continuation: false, phase: false,
            classification: 'continuation_split_after_local_compatibility'
        },
        {
            cycle: 2, edge: '639/640', immediate: true, policy: true,
            continuation: true, phase: true, classification: 'compatible_with_exact_residue'
        },
        {
            cycle: 2, edge: '640/641', immediate: true, policy: false,
            continuation: false, phase: false,
            classification: 'selection_and_continuation_split_after_local_compatibility'
        }
    ]);
    assert.equal(result.transportAliasingWitnesses.length, 2);
    for (const witness of result.transportAliasingWitnesses) {
        assert.equal(witness.deterministicMapEligible, false);
        assert.equal(witness.recommendedShape, 'relation_or_kernel');
        assert.notEqual(witness.leftTargetClassDigest, witness.rightTargetClassDigest);
        assert.equal(witness.witnessCarrierRefs.length, 8);
    }
});

test('the 640 Cocoon carrier separates formation counts from ordered composition', () => {
    assert.deepEqual(result.formationLifecycle.responseCounts, {
        counterPreparation: 8,
        needlepointAbsorbed: 32,
        spoolburstAbsorbed: 8,
        threadballBypassed: 16,
        unweaveCleared: 16
    });
    assert.deepEqual(result.formationLifecycle.cocoonDispositionCounts, {
        clearedByUnweave: 16,
        consumedByNeedlepoint: 32,
        consumedBySpoolburst: 8,
        expiredOnRelease: 24
    });
    assert.deepEqual(result.formationLifecycle.resolutionCounts, {
        releasedSpoolburst: 64,
        unwoven: 16
    });
    assert.equal(result.formationLifecycle.formationCount, 80);
    assert.equal(result.formationLifecycle.firstActorWinMatchCount, 4);
    assert.equal(result.formationLifecycle.finalCompletedTurns, 9);
});

test('wider transport keeps the production-spawn cancellation as route residue', () => {
    assert.deepEqual(result.widerTransport.distances.map((item) => [
        item.startingDistance,
        item.baselineFirstActorWins,
        item.guardedFirstActorWins,
        item.firstActorGainCount,
        item.secondActorGainCount
    ]), [
        [448, 30, 34, 4, 0],
        [512, 28, 32, 4, 0],
        [576, 30, 34, 4, 0],
        [640, 30, 30, 4, 4],
        [704, 40, 36, 0, 4]
    ]);
    assert.deepEqual(result.widerTransport.productionSpawnCancellation, {
        startingDistance: 640,
        baselineFirstActorWins: 30,
        guardedFirstActorWins: 30,
        changedOutcomeCount: 8,
        firstActorGainCount: 4,
        secondActorGainCount: 4,
        coarseReadoutEqual: true,
        routeFamilyEqual: false
    });
});

test('targets stay separate and block a global-order or holonomy promotion', () => {
    assert.deepEqual(result.targetJudgments.map((item) => [item.target, item.status]), [
        ['local_answerability', 'passed_bounded'],
        ['local_reorganization', 'passed_with_residue'],
        ['ordered_composition', 'failed_descent'],
        ['recursive_terminal_closure', 'passed_bounded'],
        ['actor_role_transport', 'failed_descent'],
        ['authority_reentry', 'passed_with_residue']
    ]);
    assert.equal(result.globalAssembly.classification, 'role_neutral_global_order_not_assembled');
    assert.equal(result.globalAssembly.localCompatibility, true);
    assert.equal(result.globalAssembly.roleNeutralDescent, false);
    assert.equal(result.globalAssembly.realizedClosedRouteWitness, false);
    assert.equal(
        result.globalAssembly.routeActionStatus,
        'candidate_nontrivial_route_action_not_closed_cycle'
    );
    assert.ok(result.blockedClaims.some((item) => item.includes('holonomy')));
});

test('D2M assessment is deterministic, non-mutating, strict, and digest-bound', () => {
    const before = canonicalJson(input);
    const repeated = assessTacticalOrderAtlas(input);
    assert.equal(canonicalJson(input), before);
    assert.equal(canonicalD2MResult(repeated), canonicalD2MResult(result));
    assert.equal(result.resultDigest, '882534e69ddae101d3d1e1463ddca467f2a95899be2a8e826eb14cb1dd5a55c2');
    const { resultDigest, ...payload } = result;
    assert.equal(resultDigest, sha256Digest(payload));

    const unknown = JSON.parse(before) as Record<string, unknown>;
    unknown.liveActivation = true;
    assert.equal(D2MInputBundleSchema.safeParse(unknown).success, false);
    const drifted = JSON.parse(before) as D2MInputBundle;
    drifted.d2kResult.resultDigest = '0'.repeat(64);
    assert.throws(() => assessTacticalOrderAtlas(drifted));
    const altered = JSON.parse(canonicalD2MResult(result)) as Record<string, unknown>;
    altered.resultDigest = '0'.repeat(64);
    assert.equal(D2MResultSchema.safeParse(altered).success, false);
});

test('D2M runner is fixed, fail-closed, and link-aware output-confined', (context) => {
    assert.match(
        resolveD2MOutputPath('test-results/crpm-world/d2m-tactical-order-atlas/result.json')
            .replaceAll('\\', '/'),
        /test-results\/crpm-world\/d2m-tactical-order-atlas\/result\.json$/
    );
    assert.throws(() => resolveD2MOutputPath('analysis/tactical_model/model.py'), /below/);
    assert.throws(
        () => resolveD2MOutputPath('test-results/crpm-world/d2m-tactical-order-atlas/result.txt'),
        /JSON/
    );
    const runnerSource = readFileSync('scripts/run-tactical-order-atlas.ts', 'utf8');
    assert.match(runnerSource, /analysis\.tactical_model\.reachable_carrier_probe/);
    assert.match(runnerSource, /analysis\.tactical_model\.policy_choice_relation_probe/);
    assert.match(runnerSource, /analysis\.tactical_model\.policy_transport_probe/);
    assert.doesNotMatch(runnerSource, /\beval\s*\(|new Function|import\s*\(/);
    const rejected = spawnSync(process.execPath, [
        '--import', 'tsx', 'scripts/run-tactical-order-atlas.ts', '--operator', 'arbitrary'
    ], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /accepts only one optional --output/);

    const allowedRoot = resolve('test-results/crpm-world/d2m-tactical-order-atlas');
    mkdirSync(allowedRoot, { recursive: true });
    const linkPath = mkdtempSync(join(allowedRoot, 'link-test-'));
    const outside = mkdtempSync(join(tmpdir(), 'd2m-output-link-'));
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
            () => resolveD2MOutputPath(join(linkPath, 'escaped-result.json')),
            /must not traverse symbolic links or junctions/
        );
    } finally {
        unlinkSync(linkPath);
        rmSync(outside, { recursive: true, force: true });
    }
});
