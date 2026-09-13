import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test, { before } from 'node:test';

import {
    D2H_CUT_DEFINITIONS,
    assessReachableCarriers,
    canonicalD2HResult
} from '../../analysis/crpm_world/navigation/assess-reachable-carriers';
import {
    D2HRawExportSchema,
    D2HResultSchema,
    type D2HRawExport,
    type D2HResult
} from '../../analysis/crpm_world/navigation/reachable-carrier-schemas';
import { canonicalJson, sha256Digest } from '../../analysis/crpm_world/canonical';
import { resolveD2HOutputPath } from '../../scripts/run-reachable-carrier-probe';

let raw: D2HRawExport;
let result: D2HResult;

before(() => {
    const encoded = execFileSync(
        'python',
        ['-m', 'analysis.tactical_model.reachable_carrier_probe'],
        {
            cwd: process.cwd(),
            encoding: 'utf8',
            maxBuffer: 128 * 1024 * 1024,
            windowsHide: true
        }
    );
    raw = D2HRawExportSchema.parse(JSON.parse(encoded));
    result = assessReachableCarriers(raw);
});

test('D2H replays the exact F4/I2 production-spawn carrier inventory', () => {
    assert.deepEqual(raw.domain.startingDistances, [640]);
    assert.deepEqual(raw.domain.caseIds, ['F4', 'I2']);
    assert.equal(raw.domain.orderedPolicyPairCount, 25);
    assert.deepEqual(
        raw.reportBindings.map((binding) => ({
            caseId: binding.caseId,
            matches: binding.spawnMatchCount,
            transitions: binding.transitionItemCount,
            firstActorWins: binding.spawnResult.firstActorWins,
            reportDigest: binding.reportDigest
        })),
        [
            {
                caseId: 'F4',
                matches: 100,
                transitions: 788,
                firstActorWins: 60,
                reportDigest: '8e0605617d63b25474da6df059455d0c365b93f657bf0260295788a854cd17dd'
            },
            {
                caseId: 'I2',
                matches: 100,
                transitions: 756,
                firstActorWins: 60,
                reportDigest: '31e341944d0490d531e989463804f8402c32c191e7dd1d4fe205081ef0ce099d'
            }
        ]
    );
    assert.equal(raw.items.length, 1544);
    assert.ok(raw.items.every((item) =>
        item.legalActionKeys.includes(item.selectedAction.actionKey)
    ));
});

test('thin and policy-aware cuts expose explicit multi-route aliases', () => {
    const rows = result.assessments.map((assessment) => ({
        scope: assessment.caseScope,
        actor: assessment.activeActorScope,
        cut: assessment.cutId,
        classes: assessment.coverage.sourceClassCount,
        repeated: assessment.coverage.repeatedSourceClassCount,
        aliases: assessment.coverage.aliasingSourceClassCount,
        multiRoute: assessment.coverage.multiRouteAliasingClassCount,
        status: assessment.coverage.status
    }));
    assert.deepEqual(rows, [
        { scope: 'F4', actor: 'all', cut: 'spawn640_visible_pressure_v0', classes: 452, repeated: 160, aliases: 132, multiRoute: 104, status: 'aliased' },
        { scope: 'F4', actor: 'all', cut: 'spawn640_policy_visible_pressure_v1', classes: 716, repeated: 68, aliases: 68, multiRoute: 40, status: 'aliased' },
        { scope: 'F4', actor: 'player', cut: 'spawn640_bounded_tactical_support_v1', classes: 394, repeated: 0, aliases: 0, multiRoute: 0, status: 'unexercised_no_twins' },
        { scope: 'F4', actor: 'loomkeeper', cut: 'spawn640_bounded_tactical_support_v1', classes: 394, repeated: 0, aliases: 0, multiRoute: 0, status: 'unexercised_no_twins' },
        { scope: 'I2', actor: 'all', cut: 'spawn640_visible_pressure_v0', classes: 404, repeated: 180, aliases: 144, multiRoute: 116, status: 'aliased' },
        { scope: 'I2', actor: 'all', cut: 'spawn640_policy_visible_pressure_v1', classes: 684, repeated: 68, aliases: 68, multiRoute: 40, status: 'aliased' },
        { scope: 'I2', actor: 'player', cut: 'spawn640_bounded_tactical_support_v1', classes: 378, repeated: 0, aliases: 0, multiRoute: 0, status: 'unexercised_no_twins' },
        { scope: 'I2', actor: 'loomkeeper', cut: 'spawn640_bounded_tactical_support_v1', classes: 378, repeated: 0, aliases: 0, multiRoute: 0, status: 'unexercised_no_twins' },
        { scope: 'combined', actor: 'all', cut: 'spawn640_visible_pressure_v0', classes: 460, repeated: 408, aliases: 188, multiRoute: 188, status: 'aliased' }
    ]);

    for (const assessment of result.assessments.filter((item) => item.coverage.status === 'aliased')) {
        assert.equal(assessment.assessment.deterministicMapEligibility, false);
        assert.equal(assessment.assessment.recommendedShape, 'relation_or_kernel');
        assert.equal(assessment.witnessRoutes.length, assessment.coverage.aliasingSourceClassCount);
        assert.ok(assessment.witnessRoutes.every((witness) =>
            witness.left.targetCarrierDigest !== witness.right.targetCarrierDigest ||
            witness.left.selectedActionKey !== witness.right.selectedActionKey
        ));
    }
});

test('support residue is explicit without turning singleton eligibility into proof', () => {
    assert.deepEqual(result.supportDifferenceSummaries.map((summary) => ({
        scope: summary.caseScope,
        witnesses: summary.witnessPairCount,
        sameAction: summary.sameSelectedActionPairCount,
        differentAction: summary.differentSelectedActionPairCount,
        turnOnly: summary.completedTurnOnlyPairCount,
        additionalSupport: summary.additionalSupportDifferencePairCount,
        fields: Object.fromEntries(summary.fieldDifferences.map((field) => [field.field, field.witnessPairCount]))
    })), [
        {
            scope: 'F4', witnesses: 68, sameAction: 34, differentAction: 34,
            turnOnly: 12, additionalSupport: 56,
            fields: {
                completedTurns: 68,
                'loomkeeper.spoolburstPreparationTurns': 24,
                'player.spoolburstPreparationTurns': 21,
                'loomkeeper.spoolburstCocoonHits': 13,
                'player.spoolburstCocoonHits': 13,
                'loomkeeper.escapeSlack': 12,
                'player.escapeSlack': 12
            }
        },
        {
            scope: 'I2', witnesses: 68, sameAction: 34, differentAction: 34,
            turnOnly: 12, additionalSupport: 56,
            fields: {
                completedTurns: 68,
                'loomkeeper.spoolburstPreparationTurns': 24,
                'player.spoolburstPreparationTurns': 21,
                'loomkeeper.spoolburstCocoonHits': 13,
                'player.spoolburstCocoonHits': 13,
                'loomkeeper.escapeSlack': 12,
                'player.escapeSlack': 12
            }
        }
    ]);
    assert.ok(result.assessments
        .filter((item) => item.cutId === 'spawn640_bounded_tactical_support_v1')
        .every((item) =>
            item.assessment.deterministicMapEligibility &&
            item.coverage.status === 'unexercised_no_twins'
        ));
});

test('D2H returns a deterministic retain-and-refine wake without design promotion', () => {
    assert.equal(result.navigationWake.classification, 'retain_and_refine');
    assert.match(result.navigationWake.nextPermittedAction, /recurrence-support twin probe/);
    assert.equal(result.productAuthority, 'none');
    assert.deepEqual(D2H_CUT_DEFINITIONS.map((cut) => cut.cutId), [
        'spawn640_visible_pressure_v0',
        'spawn640_policy_visible_pressure_v1',
        'spawn640_bounded_tactical_support_v1',
        'spawn640_route_provenance_v0'
    ]);
    assert.equal(raw.exportDigest, '5ff3ed7d77acf29a55da422f9f7e02f8ad875349a8104f08076890179746f60f');
    assert.equal(result.resultDigest, 'cd83a46c68f2d5968fa0d3e7af5e73bcefbe5acb18df110d1a686f9e5d8f9658');
    const { resultDigest, ...payload } = result;
    assert.equal(resultDigest, sha256Digest(payload));
});

test('assessment is deterministic, does not mutate input, and rejects envelope additions', () => {
    const before = canonicalJson(raw);
    const repeated = assessReachableCarriers(raw);
    assert.equal(canonicalJson(raw), before);
    assert.equal(canonicalD2HResult(repeated), canonicalD2HResult(result));
    const unknown = JSON.parse(before) as Record<string, unknown>;
    unknown.liveActivation = true;
    assert.equal(D2HRawExportSchema.safeParse(unknown).success, false);
    const unknownConfig = JSON.parse(before) as D2HRawExport;
    unknownConfig.reportBindings[0].configId = 'unknown-candidate';
    for (const item of unknownConfig.items) {
        if (item.caseId === 'F4') item.configId = 'unknown-candidate';
    }
    const { exportDigest: ignoredDigest, ...unknownConfigPayload } = unknownConfig;
    unknownConfig.exportDigest = sha256Digest(unknownConfigPayload);
    assert.throws(
        () => assessReachableCarriers(D2HRawExportSchema.parse(unknownConfig)),
        /config binding is outside/
    );
    const altered = JSON.parse(canonicalD2HResult(result)) as Record<string, unknown>;
    altered.resultDigest = '0'.repeat(64);
    assert.equal(D2HResultSchema.safeParse(altered).success, false);
});

test('runner output is confined and execution remains fixed', () => {
    assert.match(
        resolveD2HOutputPath('test-results/crpm-world/d2h-reachable-carriers/result.json').replaceAll('\\', '/'),
        /test-results\/crpm-world\/d2h-reachable-carriers\/result\.json$/
    );
    assert.throws(() => resolveD2HOutputPath('analysis/tactical_model/model.py'), /below/);
    assert.throws(
        () => resolveD2HOutputPath('test-results/crpm-world/d2h-reachable-carriers/result.txt'),
        /JSON/
    );
    const runnerSource = readFileSync('scripts/run-reachable-carrier-probe.ts', 'utf8');
    assert.match(runnerSource, /\['-m', 'analysis\.tactical_model\.reachable_carrier_probe'\]/);
    assert.doesNotMatch(runnerSource, /\beval\s*\(|new Function|import\s*\(/);
    const rejected = spawnSync(process.execPath, [
        '--import', 'tsx', 'scripts/run-reachable-carrier-probe.ts',
        '--config', 'unknown-candidate'
    ], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /accepts only one optional --output/);
});
