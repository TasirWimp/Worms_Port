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
    assessF4BridgeCalibration,
    canonicalD2NResult
} from '../../analysis/crpm_world/navigation/assess-bridge-calibration';
import { assessCocoonVoyages } from '../../analysis/crpm_world/navigation/assess-cocoon-voyages';
import { assessPolicyChoices } from '../../analysis/crpm_world/navigation/assess-policy-choices';
import { assessPolicyTransport } from '../../analysis/crpm_world/navigation/assess-policy-transport';
import { assessTacticalOrderAtlas } from '../../analysis/crpm_world/navigation/assess-tactical-order-atlas';
import {
    D2NInputBundleSchema,
    D2NResultSchema,
    type D2NInputBundle
} from '../../analysis/crpm_world/navigation/bridge-calibration-schemas';
import { resolveD2NOutputPath } from '../../scripts/run-f4-bridge-calibration';

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
const d2mResult = assessTacticalOrderAtlas({ d2iResult, d2kRaw, d2kResult, d2lResult });
const input = D2NInputBundleSchema.parse({ d2mResult, d2kRaw, d2kResult });
const result = assessF4BridgeCalibration(input);

test('D2N is source-locked to the exact D2M/D2K, F4, and CRPM method carriers', () => {
    assert.deepEqual(result.sourceBindings, {
        repositoryId: 'worms-port',
        sourceCommit: '99818455eb24f5d46eb965dcc3e0b07125c424e2',
        crpmMethodCommit: '053c6fc0a90ed48d8667016b18a1d10106a7a2bc',
        d2mResultDigest: '882534e69ddae101d3d1e1463ddca467f2a95899be2a8e826eb14cb1dd5a55c2',
        d2kRawDigest: '47ef25b6557edaa1f477f0bdde80b0b1d8b041399adb844a22c8746f1314e769',
        d2kResultDigest: '5c544f6822744ac63a595ca4458bb2dfb72696836468a47bf494c628b5573832',
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
            compatibilityFibre: '4584b57499cbd90948d8d07557e5b01ede894906',
            quotientObserver: '4dbcfde422b16a83eec9604fbe2d0e3df1780f03',
            m9FormationCalibration: '499522e4d4d763ad633aef016a0fcf64fbc1f532',
            insightLog: '7b935dd881781dc2524b833ca01792c6d1c4ae86'
        }
    });
    assert.deepEqual(result.domain.startingDistances, [639, 640, 641]);
    assert.equal(result.domain.carrierCount, 24);
    assert.equal(result.domain.legalResponseCount, 240);
    assert.equal(result.domain.continuationVoyageCount, 6000);
    assert.equal(result.domain.seed, 3237998097);
    assert.equal(result.domain.maximumTurns, 16);
    assert.equal(result.productAuthority, 'none');
});

test('twelve declared refinements preserve congruence, aliasing, and over-refinement separately', () => {
    assert.deepEqual(result.refinementAssessments.map((item) => [
        item.refinementId,
        item.sourceClassCount,
        item.aliasClassCount,
        item.aliasedCarrierCount,
        item.matchedEqualTargetSplitCount,
        item.classification
    ]), [
        ['none_control', 2, 2, 24, 0, 'destructive_control'],
        ['responder_phase', 4, 0, 0, 0, 'congruent_covariant'],
        ['completed_turn_position', 4, 0, 0, 0, 'congruent_covariant'],
        ['path_kind_prefix', 4, 0, 0, 0, 'congruent_covariant'],
        ['relative_separation', 6, 0, 0, 8, 'congruent_overrefined'],
        ['formation_lifetime_support', 2, 2, 24, 0, 'insufficient_alias'],
        ['resource_support', 2, 2, 24, 0, 'insufficient_alias'],
        ['policy_selection_relation', 3, 3, 24, 0, 'insufficient_alias'],
        ['orientation_metadata', 8, 8, 24, 0, 'insufficient_alias'],
        ['phase_plus_separation', 6, 0, 0, 8, 'congruent_overrefined'],
        ['route_plus_formation', 4, 0, 0, 0, 'congruent_covariant'],
        ['policy_plus_orientation', 12, 4, 12, 0, 'insufficient_alias']
    ]);
    for (const assessment of result.refinementAssessments) {
        assert.equal(
            assessment.recommendedShape,
            assessment.deterministicMapEligible ? 'map' : 'relation_or_kernel'
        );
        assert.ok(assessment.partitionEquivalentRefinements.includes(assessment.refinementId));
    }
});

test('label-independent partitions retain one covariant family and its negative controls', () => {
    assert.deepEqual(result.partitionFamilies.map((item) => ({
        family: item.familyId,
        members: item.memberRefinements,
        classes: item.sourceClassCount,
        eligible: item.deterministicMapEligible,
        equalTargetSplits: item.matchedEqualTargetSplitCountPerRefinement,
        status: item.semanticStatus
    })), [
        {
            family: 'base_current_support',
            members: ['none_control', 'formation_lifetime_support', 'resource_support'],
            classes: 2, eligible: false, equalTargetSplits: 0, status: 'insufficient'
        },
        {
            family: 'interface_covariant',
            members: ['responder_phase', 'completed_turn_position', 'path_kind_prefix', 'route_plus_formation'],
            classes: 4, eligible: true, equalTargetSplits: 0, status: 'target_congruent_covariant'
        },
        {
            family: 'geometry_fine',
            members: ['relative_separation', 'phase_plus_separation'],
            classes: 6, eligible: true, equalTargetSplits: 8, status: 'target_congruent_overrefined'
        },
        {
            family: 'policy_selection',
            members: ['policy_selection_relation'],
            classes: 3, eligible: false, equalTargetSplits: 0, status: 'insufficient'
        },
        {
            family: 'orientation',
            members: ['orientation_metadata'],
            classes: 8, eligible: false, equalTargetSplits: 0, status: 'insufficient'
        },
        {
            family: 'policy_orientation',
            members: ['policy_plus_orientation'],
            classes: 12, eligible: false, equalTargetSplits: 0, status: 'insufficient'
        }
    ]);
    assert.ok(result.partitionFamilies.every((item) => item.representativeSelectionAllowed === false));
    assert.equal(result.aliasingWitnesses.length, 21);
    assert.equal(result.overrefinementWitnesses.length, 16);
    assert.ok(result.aliasingWitnesses.every((item) => item.targetClasses.length > 1));
    assert.ok(result.overrefinementWitnesses.every((item) =>
        item.leftDistance === 639 && item.rightDistance === 640 &&
        item.leftSourceClassDigest !== item.rightSourceClassDigest
    ));
});

test('all eight 640/641 twins locate the same co-formed predecessor seam', () => {
    assert.equal(result.predecessorDivergenceWitnesses.length, 8);
    for (const witness of result.predecessorDivergenceWitnesses) {
        assert.equal(witness.earliestActionKindIndex, 1);
        assert.equal(witness.leftActionKind, 'prepare_spoolburst');
        assert.equal(witness.rightActionKind, 'relocate');
        assert.match(witness.leftActionKey, /^prepare_spoolburst:-:(left|right)$/);
        assert.match(witness.rightActionKey, /^relocate:-:(left|right)$/);
        assert.equal(witness.rightPrefixLength - witness.leftPrefixLength, 1);
        assert.equal(witness.completedTurnDelta, 1);
        assert.equal(witness.leftResponderPhase, 'first');
        assert.equal(witness.rightResponderPhase, 'second');
        assert.equal(witness.leftSeparation, 512);
        assert.equal(witness.rightSeparation, 449);
        assert.equal(witness.formationLifetimeSupportEqual, true);
        assert.equal(witness.resourceSupportEqual, true);
        assert.equal(witness.protectedContinuationTargetEqual, false);
        assert.deepEqual(witness.coformedCoordinates, [
            'path_kind_prefix',
            'completed_turn_position',
            'responder_phase',
            'relative_separation'
        ]);
    }
    assert.deepEqual(
        result.predecessorDivergenceWitnesses.map((item) => item.leftPrefixLength),
        [2, 2, 2, 2, 6, 6, 6, 6]
    );
});

test('readiness remains target-indexed and admits only a later decorrelation search', () => {
    assert.deepEqual(result.readinessJudgments.map((item) => [item.target, item.status]), [
        ['continuation_transport', 'prepared_bounded'],
        ['ordered_composition_reentry', 'requires_trace_support'],
        ['actor_role_transport', 'requires_explicit_phase'],
        ['formation_support_sufficiency', 'failed'],
        ['expanded_chart_admission', 'decorrelation_required']
    ]);
    assert.equal(
        result.globalDisposition.classification,
        'covariant_bridge_family_requires_decorrelation'
    );
    assert.equal(result.globalDisposition.selectedBridgeAxis, null);
    assert.deepEqual(result.globalDisposition.matchedTwinRequirements, [
        'same_phase_and_route_history_with_different_separation',
        'same_separation_and_current_support_with_different_phase_or_route_history',
        'same_current_formation_and_resources_with_decorrelated_route_phase_geometry'
    ]);
    assert.match(result.globalDisposition.nextPermittedAction, /mechanics-fixed reachability search/);
    assert.ok(result.blockedClaims.some((item) => item.includes('holonomy')));
    assert.ok(result.blockedClaims.some((item) => item.includes('not automatically causal')));
});

test('D2N assessment is deterministic, non-mutating, strict, and digest-bound', () => {
    const before = canonicalJson(input);
    const repeated = assessF4BridgeCalibration(input);
    assert.equal(canonicalJson(input), before);
    assert.equal(canonicalD2NResult(repeated), canonicalD2NResult(result));
    assert.equal(result.resultDigest, '5c554344271e2543cc6811fa579b28d85054da19b067acb8d12e7c60bed03dc8');
    const { resultDigest, ...payload } = result;
    assert.equal(resultDigest, sha256Digest(payload));

    const unknown = JSON.parse(before) as Record<string, unknown>;
    unknown.liveActivation = true;
    assert.equal(D2NInputBundleSchema.safeParse(unknown).success, false);
    const drifted = JSON.parse(before) as D2NInputBundle;
    drifted.d2mResult.resultDigest = '0'.repeat(64);
    assert.throws(() => assessF4BridgeCalibration(drifted));
    const altered = JSON.parse(canonicalD2NResult(result)) as Record<string, unknown>;
    altered.resultDigest = '0'.repeat(64);
    assert.equal(D2NResultSchema.safeParse(altered).success, false);
});

test('D2N runner is fixed, fail-closed, and link-aware output-confined', (context) => {
    assert.match(
        resolveD2NOutputPath('test-results/crpm-world/d2n-f4-bridge-calibration/result.json')
            .replaceAll('\\', '/'),
        /test-results\/crpm-world\/d2n-f4-bridge-calibration\/result\.json$/
    );
    assert.throws(() => resolveD2NOutputPath('analysis/tactical_model/model.py'), /below/);
    assert.throws(
        () => resolveD2NOutputPath('test-results/crpm-world/d2n-f4-bridge-calibration/result.txt'),
        /JSON/
    );
    const runnerSource = readFileSync('scripts/run-f4-bridge-calibration.ts', 'utf8');
    assert.match(runnerSource, /analysis\.tactical_model\.reachable_carrier_probe/);
    assert.match(runnerSource, /analysis\.tactical_model\.policy_choice_relation_probe/);
    assert.match(runnerSource, /analysis\.tactical_model\.policy_transport_probe/);
    assert.doesNotMatch(runnerSource, /\beval\s*\(|new Function|import\s*\(/);
    const rejected = spawnSync(process.execPath, [
        '--import', 'tsx', 'scripts/run-f4-bridge-calibration.ts', '--operator', 'arbitrary'
    ], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /accepts only one optional --output/);

    const allowedRoot = resolve('test-results/crpm-world/d2n-f4-bridge-calibration');
    mkdirSync(allowedRoot, { recursive: true });
    const linkPath = mkdtempSync(join(allowedRoot, 'link-test-'));
    const outside = mkdtempSync(join(tmpdir(), 'd2n-output-link-'));
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
            () => resolveD2NOutputPath(join(linkPath, 'escaped-result.json')),
            /must not traverse symbolic links or junctions/
        );
    } finally {
        unlinkSync(linkPath);
        rmSync(outside, { recursive: true, force: true });
    }
});
