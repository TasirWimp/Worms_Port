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
import { join, resolve } from 'node:path';
import test from 'node:test';
import { tmpdir } from 'node:os';

import { canonicalJson, sha256Digest } from '../../analysis/crpm_world/canonical';
import {
    assessPolicyChoices,
    canonicalD2KResult
} from '../../analysis/crpm_world/navigation/assess-policy-choices';
import {
    D2KRawExportSchema,
    D2KResultSchema,
    type D2KRawExport
} from '../../analysis/crpm_world/navigation/policy-choice-schemas';
import { resolveD2KOutputPath } from '../../scripts/run-policy-choice-relation-audit';

const encodedRaw = execFileSync(
    'python',
    ['-m', 'analysis.tactical_model.policy_choice_relation_probe'],
    {
        cwd: process.cwd(),
        encoding: 'utf8',
        maxBuffer: 128 * 1024 * 1024,
        windowsHide: true
    }
);
const raw = D2KRawExportSchema.parse(JSON.parse(encodedRaw));
const result = assessPolicyChoices(raw);

test('D2K raw export is source-locked and enumerates the complete fixed topology', () => {
    assert.equal(raw.exportDigest, '47ef25b6557edaa1f477f0bdde80b0b1d8b041399adb844a22c8746f1314e769');
    assert.deepEqual(raw.domain.startingDistances, [639, 640, 641]);
    assert.equal(raw.routes.length, 12);
    assert.equal(raw.carriers.length, 24);
    assert.equal(raw.voyages.length, 6000);
    assert.ok(raw.routes.every((item) => item.responseCarrierCount === 2));
    assert.ok(raw.carriers.every((item) => item.legalActions.length === 10));
    assert.ok(raw.carriers.every((item) => item.policySelections.length === 5));
    assert.equal(new Set(raw.routes.map((item) => item.matchRef)).size, 12);
    assert.equal(new Set(raw.carriers.map((item) => item.carrierRef)).size, 24);
    assert.equal(new Set(raw.voyages.map((item) => item.voyageRef)).size, 6000);
});

test('every carrier evaluates five unchanged selectors against the same legal support', () => {
    const policies = [
        'range_pressure', 'medium_hold', 'short_approach', 'retreat_kite', 'best_response'
    ];
    for (const carrier of raw.carriers) {
        assert.deepEqual(carrier.policySelections.map((item) => item.policy), policies);
        const legal = new Set(carrier.legalActions.map((item) => item.actionKey));
        for (const selection of carrier.policySelections) {
            assert.ok(legal.has(selection.selectedActionKey));
        }
        const local = raw.voyages.filter((item) => item.carrierRef === carrier.carrierRef);
        assert.equal(local.length, 250);
        const byResponse = new Map<string, typeof local>();
        for (const voyage of local) {
            byResponse.set(voyage.responseRef, [...(byResponse.get(voyage.responseRef) ?? []), voyage]);
        }
        assert.equal(byResponse.size, 10);
        assert.ok([...byResponse.values()].every((items) => items.length === 25));
    }
});

test('assessment preserves rich response support and bounded terminal dominance', () => {
    assert.deepEqual(result.globalSummary, {
        routeCount: 12,
        carrierCount: 24,
        normalizedCarrierMotifCount: 6,
        legalResponseCount: 240,
        policySelectionCount: 120,
        voyageCount: 6000,
        responderWinVoyageCount: 4292,
        preparerWinVoyageCount: 1696,
        drawVoyageCount: 12,
        recurrenceVoyageCount: 0,
        dominanceWitnessCount: 752,
        dominatedPolicySelectionCount: 84,
        policiesWithRegretWitnesses: [
            'best_response', 'medium_hold', 'range_pressure', 'retreat_kite', 'short_approach'
        ],
        mirrorSensitivePolicySelectionCount: 12,
        mirrorSensitivePolicies: ['best_response'],
        allCarriersExposeFiveSelectedResponseKinds: true,
        allVoyagesTerminal: true
    });
    assert.ok(result.carrierAssessments.every((item) => item.selectedResponseKindCount === 5));
    assert.ok(result.carrierAssessments.every((item) => item.dominanceWitnesses.every((witness) =>
        witness.relation === 'terminal_outcome_componentwise' &&
        witness.improvedContextCount > 0 &&
        witness.improvedContextCount + witness.equalContextCount === 25
    )));
    assert.equal(result.navigationWake.classification, 'retain_mechanics_refine_policy_question');
});

test('later low-Stitching carriers expose several winning routes rather than a missing response', () => {
    const later = result.carrierAssessments.filter((item) => item.cycleIndex === 2);
    assert.equal(later.length, 12);
    assert.ok(later.every((item) => item.preparerStitching === 20));
    for (const carrier of later) {
        const threadballs = carrier.responseSummaries.filter((item) => item.responseKind === 'threadball');
        const unweave = carrier.responseSummaries.find((item) => item.responseKind === 'paid_unweave');
        assert.equal(threadballs.length, 3);
        assert.ok(threadballs.every((item) => item.responderWinCount === 25));
        assert.equal(unweave?.responderWinCount, 25);
    }
    const earlier = result.carrierAssessments.filter((item) => item.cycleIndex === 1);
    assert.ok(earlier.every((item) =>
        Math.max(...item.responseSummaries.map((response) => response.responderWinCount)) === 21
    ));
});

test('best-response low-Stitching tie is absolute-left and mirror-sensitive', () => {
    const later = raw.carriers.filter((item) => item.cycleIndex === 2);
    assert.equal(later.length, 12);
    const selectedRelations = later.map((carrier) => {
        const selected = carrier.policySelections.find((item) => item.policy === 'best_response');
        assert.equal(selected?.selectedActionKey, 'cast:threadball:left');
        const voyage = raw.voyages.find((item) =>
            item.carrierRef === carrier.carrierRef &&
            item.responseAction.actionKey === selected.selectedActionKey
        );
        assert.ok(voyage);
        return {
            distanceDelta: voyage.immediateResidue.distanceDelta,
            escapeSlackDelta: voyage.immediateResidue.responderEscapeSlackDelta
        };
    });
    assert.deepEqual(
        [...new Set(selectedRelations.map((item) => item.distanceDelta))].sort((a, b) => a - b),
        [-64, 64]
    );
    assert.deepEqual(
        [...new Set(selectedRelations.map((item) => item.escapeSlackDelta))].sort((a, b) => a - b),
        [-64, 0]
    );
});

test('boundary summaries separate exact carriers, legal support, policy selection, and continuation', () => {
    const first = result.boundarySummaries.find((item) => item.cycleIndex === 1);
    const second = result.boundarySummaries.find((item) => item.cycleIndex === 2);
    assert.ok(first && second);
    for (const boundary of [first, second]) {
        assert.equal(boundary.exactCarrier639Equals640, false);
        assert.equal(boundary.exactCarrier640Equals641, false);
        assert.equal(boundary.legalResponseOrientationReplicasConsistent, true);
        assert.equal(boundary.continuationOrientationReplicasConsistent, true);
        assert.equal(boundary.orientationReplicasConsistent, true);
        assert.equal(boundary.normalizedImmediateRelation639Equals640, true);
        assert.equal(boundary.normalizedImmediateRelation640Equals641, true);
        assert.equal(boundary.continuation639Equals640, true);
        assert.equal(boundary.continuation640Equals641, false);
    }
    assert.equal(first.policySelectionOrientationReplicasConsistent, true);
    assert.equal(first.policySelection640Equals641, true);
    assert.equal(second.policySelectionOrientationReplicasConsistent, false);
    assert.equal(second.policySelection639Equals640, true);
    assert.equal(second.policySelection640Equals641, false);
});

test('D2K assessment is deterministic, non-mutating, strict, and digest-bound', () => {
    const before = canonicalJson(raw);
    const repeated = assessPolicyChoices(raw);
    assert.equal(canonicalJson(raw), before);
    assert.equal(canonicalD2KResult(repeated), canonicalD2KResult(result));
    assert.equal(result.resultDigest, '5c544f6822744ac63a595ca4458bb2dfb72696836468a47bf494c628b5573832');
    const { resultDigest, ...payload } = result;
    assert.equal(resultDigest, sha256Digest(payload));

    const unknown = JSON.parse(before) as Record<string, unknown>;
    unknown.liveActivation = true;
    assert.equal(D2KRawExportSchema.safeParse(unknown).success, false);
    const drifted = JSON.parse(before) as D2KRawExport;
    drifted.sourceBindings.modelSha256 = '0'.repeat(64) as typeof drifted.sourceBindings.modelSha256;
    const { exportDigest: _ignored, ...driftedPayload } = drifted;
    drifted.exportDigest = sha256Digest(driftedPayload);
    assert.equal(D2KRawExportSchema.safeParse(drifted).success, false);
    const alteredResult = JSON.parse(canonicalD2KResult(result)) as Record<string, unknown>;
    alteredResult.resultDigest = '0'.repeat(64);
    assert.equal(D2KResultSchema.safeParse(alteredResult).success, false);
});

test('D2K runner is fixed, fail-closed, and output-confined', () => {
    assert.match(
        resolveD2KOutputPath('test-results/crpm-world/d2k-policy-choice/result.json').replaceAll('\\', '/'),
        /test-results\/crpm-world\/d2k-policy-choice\/result\.json$/
    );
    assert.throws(() => resolveD2KOutputPath('analysis/tactical_model/model.py'), /below/);
    assert.throws(
        () => resolveD2KOutputPath('test-results/crpm-world/d2k-policy-choice/result.txt'),
        /JSON/
    );
    const runnerSource = readFileSync('scripts/run-policy-choice-relation-audit.ts', 'utf8');
    assert.match(
        runnerSource,
        /\['-m', 'analysis\.tactical_model\.policy_choice_relation_probe'\]/
    );
    assert.doesNotMatch(runnerSource, /\beval\s*\(|new Function|import\s*\(/);
    const rejected = spawnSync(process.execPath, [
        '--import', 'tsx', 'scripts/run-policy-choice-relation-audit.ts',
        '--policy', 'arbitrary'
    ], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /accepts only one optional --output/);
});

test('D2K output rejects a symlink or junction escape', (context) => {
    const allowedRoot = resolve('test-results/crpm-world/d2k-policy-choice');
    mkdirSync(allowedRoot, { recursive: true });
    const linkPath = mkdtempSync(join(allowedRoot, 'link-test-'));
    const outside = mkdtempSync(join(tmpdir(), 'd2k-output-link-'));
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
            () => resolveD2KOutputPath(join(linkPath, 'escaped-result.json')),
            /must not traverse symbolic links or junctions/
        );
    } finally {
        unlinkSync(linkPath);
        rmSync(outside, { recursive: true, force: true });
    }
});
