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
    assessNaturalMatchedTwins,
    canonicalD2OResult
} from '../../analysis/crpm_world/navigation/assess-natural-matched-twins';
import {
    D2ORawExportSchema,
    D2OResultSchema,
    type D2ORawExport
} from '../../analysis/crpm_world/navigation/natural-matched-twin-schemas';
import { resolveD2OOutputPath } from '../../scripts/run-natural-matched-twin-search';

const encodedRaw = execFileSync(
    'python',
    ['-m', 'analysis.tactical_model.natural_matched_twin_probe'],
    {
        cwd: process.cwd(),
        encoding: 'utf8',
        maxBuffer: 128 * 1024 * 1024,
        windowsHide: true
    }
);
const raw = D2ORawExportSchema.parse(JSON.parse(encodedRaw));
const result = assessNaturalMatchedTwins(raw);

test('D2O source locks and exhaustive priced-domain census are exact', () => {
    assert.equal(raw.exportDigest, 'edafdd5c3a7f094eb522a29b4994b40d3b7de0ce0abce0e4589cea565bb6213f');
    assert.deepEqual(raw.sourceBindings, {
        repositoryId: 'worms-port',
        sourceCommit: '3a1d844fce9be09ed8ec51e39fe0f94632f43fe5',
        crpmMethodCommit: '053c6fc0a90ed48d8667016b18a1d10106a7a2bc',
        d2nResultDigest: '5c554344271e2543cc6811fa579b28d85054da19b067acb8d12e7c60bed03dc8',
        modelPath: 'analysis/tactical_model/model.py',
        modelSha256: 'af0b0ec8d9893e992bdc95123a915e24a2305ee2b9fff32bce95d27cdb4c8c08',
        configPath: 'analysis/tactical_model/configs/v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4.json',
        configSha256: '5e519b09ea5e5684185bcd527600705825ba75df8f01e310adb027d09d4f54e0',
        configId: 'v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4',
        configSchemaVersion: 11,
        publicFunctions: [
            'initial_state', 'legal_actions', 'apply_action', 'choose_action',
            'tactical_state_key', 'tactical_state_snapshot'
        ]
    });
    assert.deepEqual(raw.domain.startingDistances, [639, 640, 641]);
    assert.equal(raw.domain.maximumPrefixActions, 4);
    assert.equal(raw.domain.pathGeneration, 'all_legal_actions');
    assert.deepEqual(raw.census, {
        generatedTransitionCount: 11188,
        terminalBranchCount: 0,
        openFrontierBranchCount: 7456,
        responseCarrierOccurrenceCount: 2100,
        distinctFullStateCount: 1520,
        normalizedCarrierClassCount: 319,
        continuationTargetClassCount: 122
    });
    assert.equal(new Set(raw.occurrences.map((item) => item.occurrenceRef)).size, 2100);
    assert.equal(new Set(raw.fullStates.map((item) => item.stateRef)).size, 1520);
    assert.equal(new Set(raw.carrierClasses.map((item) => item.carrierRef)).size, 319);
    assert.equal(new Set(raw.outcomeRelations.map((item) => item.relationRef)).size, 122);
});

test('all full states descend congruently through the bounded actor-relative carrier cut', () => {
    assert.ok(raw.carrierClasses.every((item) =>
        item.deterministicMapEligible && item.outcomeRelationRefs.length === 1
    ));
    assert.deepEqual(result.quotientCongruence, {
        normalizedCarrierClassCount: 319,
        congruentCarrierClassCount: 319,
        aliasedCarrierClassCount: 0,
        outcomeRelationClassCount: 122,
        deterministicMapEligible: true,
        boundedStatement: 'All 1,520 full states in the declared four-action legal-prefix domain descend congruently through the 319 actor-relative current-carrier classes; this is bounded evidence, not proof over undeclared F4 reachability.'
    });
});

test('natural matched pairs separate conditional geometry from trace-only route order', () => {
    const families = new Map(result.familyAssessments.map((item) => [item.family, item]));
    assert.deepEqual(families.get('geometry_control'), {
        family: 'geometry_control',
        pairCount: 37232,
        continuationEqualPairCount: 12816,
        continuationSplitPairCount: 24416,
        turnLimitOnlySplitPairCount: 192,
        tacticalSplitPairCount: 24224,
        targetRelevance: 'conditional',
        recursiveCarrierRole: 'required_conditionally',
        publicSupport: [
            'separation', 'responder-support', 'preparer-support', 'path-kind-prefix',
            'responder-phase', 'completed-turns'
        ],
        witnessRefs: [
            'd2o-twin-13407e5f54f74fb1f37103aa',
            'd2o-twin-981728857ecda4e302d65c18'
        ],
        reasons: [
            'Natural equal and split twins both exist, so geometry is neither globally disposable nor globally sufficient.',
            'Separation remains a conditionally target-relevant carrier coordinate in this bounded legal-prefix domain.'
        ]
    });
    const route = families.get('route_order_control')!;
    assert.deepEqual([
        route.pairCount,
        route.continuationEqualPairCount,
        route.continuationSplitPairCount,
        route.targetRelevance,
        route.recursiveCarrierRole
    ], [1728, 1728, 0, 'trace_only_bounded', 'not_required_bounded']);
});

test('phase splits are horizon-only and exact completed turns are over-fine in same-phase controls', () => {
    const families = new Map(result.familyAssessments.map((item) => [item.family, item]));
    const phase = families.get('phase_horizon_control')!;
    assert.deepEqual([
        phase.pairCount,
        phase.continuationEqualPairCount,
        phase.continuationSplitPairCount,
        phase.turnLimitOnlySplitPairCount,
        phase.tacticalSplitPairCount,
        phase.targetRelevance
    ], [2288, 1984, 304, 304, 0, 'analytical_horizon_parity']);
    const completed = families.get('completed_turn_control')!;
    assert.deepEqual([
        completed.pairCount,
        completed.continuationEqualPairCount,
        completed.continuationSplitPairCount,
        completed.targetRelevance,
        completed.recursiveCarrierRole
    ], [32, 32, 0, 'overfine_in_declared_controls', 'not_required_at_same_phase']);
    assert.equal(
        result.globalDisposition.classification,
        'd2a_axes_calibrated_authority_horizon_review_required'
    );
    assert.equal(result.globalDisposition.expandedD2AChartAllowed, true);
    assert.equal(result.globalDisposition.gameplayChartRequiresAuthorityReview, true);
    assert.equal(result.productAuthority, 'none');
});

test('six deterministic witnesses preserve equal and split wake rather than a scalar verdict', () => {
    assert.deepEqual(result.twinWitnesses.map((item) => ({
        family: item.family,
        equal: item.continuationEqual,
        classification: item.differenceClassification,
        leftSeparation: item.leftSeparation,
        rightSeparation: item.rightSeparation,
        leftCompletedTurns: item.leftCompletedTurns,
        rightCompletedTurns: item.rightCompletedTurns,
        leftPathKinds: item.leftPathKinds,
        rightPathKinds: item.rightPathKinds,
        differingOutcomeCount: item.differingOutcomeCount
    })), [
        {
            family: 'geometry_control', equal: true, classification: 'none',
            leftSeparation: 511, rightSeparation: 512,
            leftCompletedTurns: 4, rightCompletedTurns: 4,
            leftPathKinds: ['cast', 'cast', 'relocate', 'prepare_spoolburst'],
            rightPathKinds: ['cast', 'cast', 'relocate', 'prepare_spoolburst'],
            differingOutcomeCount: 0
        },
        {
            family: 'geometry_control', equal: false, classification: 'tactical_continuation',
            leftSeparation: 449, rightSeparation: 447,
            leftCompletedTurns: 3, rightCompletedTurns: 3,
            leftPathKinds: ['cast', 'relocate', 'prepare_spoolburst'],
            rightPathKinds: ['cast', 'relocate', 'prepare_spoolburst'],
            differingOutcomeCount: 35
        },
        {
            family: 'route_order_control', equal: true, classification: 'none',
            leftSeparation: 511, rightSeparation: 511,
            leftCompletedTurns: 4, rightCompletedTurns: 4,
            leftPathKinds: ['cast', 'cast', 'relocate', 'prepare_spoolburst'],
            rightPathKinds: ['relocate', 'cast', 'cast', 'prepare_spoolburst'],
            differingOutcomeCount: 0
        },
        {
            family: 'phase_horizon_control', equal: true, classification: 'none',
            leftSeparation: 511, rightSeparation: 511,
            leftCompletedTurns: 4, rightCompletedTurns: 3,
            leftPathKinds: ['relocate', 'cast', 'cast', 'prepare_spoolburst'],
            rightPathKinds: ['cast', 'cast', 'prepare_spoolburst'],
            differingOutcomeCount: 0
        },
        {
            family: 'phase_horizon_control', equal: false,
            classification: 'turn_limit_horizon_only',
            leftSeparation: 449, rightSeparation: 449,
            leftCompletedTurns: 3, rightCompletedTurns: 4,
            leftPathKinds: ['cast', 'relocate', 'prepare_spoolburst'],
            rightPathKinds: ['relocate', 'cast', 'relocate', 'prepare_spoolburst'],
            differingOutcomeCount: 4
        },
        {
            family: 'completed_turn_control', equal: true, classification: 'none',
            leftSeparation: 511, rightSeparation: 511,
            leftCompletedTurns: 2, rightCompletedTurns: 4,
            leftPathKinds: ['cast', 'prepare_spoolburst'],
            rightPathKinds: ['relocate', 'relocate', 'cast', 'prepare_spoolburst'],
            differingOutcomeCount: 0
        }
    ]);
});

test('D2O assessment is deterministic, non-mutating, strict, and digest-bound', () => {
    const before = canonicalJson(raw);
    const repeated = assessNaturalMatchedTwins(raw);
    assert.equal(canonicalJson(raw), before);
    assert.equal(canonicalD2OResult(repeated), canonicalD2OResult(result));
    assert.equal(result.resultDigest, 'bc131d3fa0065cb8e1a93790d297813c243744124dad7bb079ccf0ffb851162e');
    const { resultDigest, ...payload } = result;
    assert.equal(resultDigest, sha256Digest(payload));

    const unknown = JSON.parse(before) as Record<string, unknown>;
    unknown.liveActivation = true;
    assert.equal(D2ORawExportSchema.safeParse(unknown).success, false);
    const drifted = JSON.parse(before) as D2ORawExport;
    drifted.sourceBindings.sourceCommit = '0'.repeat(40) as typeof drifted.sourceBindings.sourceCommit;
    assert.throws(() => assessNaturalMatchedTwins(drifted));
    const altered = JSON.parse(canonicalD2OResult(result)) as Record<string, unknown>;
    altered.resultDigest = '0'.repeat(64);
    assert.equal(D2OResultSchema.safeParse(altered).success, false);
});

test('D2O runner is fixed, fail-closed, and link-aware output-confined', (context) => {
    assert.match(
        resolveD2OOutputPath(
            'test-results/crpm-world/d2o-natural-matched-twins/result.json'
        ).replaceAll('\\', '/'),
        /test-results\/crpm-world\/d2o-natural-matched-twins\/result\.json$/
    );
    assert.throws(() => resolveD2OOutputPath('analysis/tactical_model/model.py'), /below/);
    assert.throws(
        () => resolveD2OOutputPath(
            'test-results/crpm-world/d2o-natural-matched-twins/result.txt'
        ),
        /JSON/
    );
    const runnerSource = readFileSync('scripts/run-natural-matched-twin-search.ts', 'utf8');
    assert.match(runnerSource, /analysis\.tactical_model\.natural_matched_twin_probe/);
    assert.doesNotMatch(runnerSource, /\beval\s*\(|new Function|import\s*\(/);
    const rejected = spawnSync(process.execPath, [
        '--import', 'tsx', 'scripts/run-natural-matched-twin-search.ts',
        '--operator', 'arbitrary'
    ], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /accepts only one optional --output/);

    const allowedRoot = resolve('test-results/crpm-world/d2o-natural-matched-twins');
    mkdirSync(allowedRoot, { recursive: true });
    const linkPath = mkdtempSync(join(allowedRoot, 'link-test-'));
    const outside = mkdtempSync(join(tmpdir(), 'd2o-output-link-'));
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
            () => resolveD2OOutputPath(join(linkPath, 'escaped-result.json')),
            /must not traverse symbolic links or junctions/
        );
    } finally {
        unlinkSync(linkPath);
        rmSync(outside, { recursive: true, force: true });
    }
});
