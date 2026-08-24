import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test, { before } from 'node:test';

import {
    assessCocoonVoyages,
    canonicalD2IResult
} from '../../analysis/crpm_world/navigation/assess-cocoon-voyages';
import {
    D2IResultSchema,
    type D2IResult
} from '../../analysis/crpm_world/navigation/cocoon-voyage-schemas';
import {
    D2HRawExportSchema,
    type D2HRawExport
} from '../../analysis/crpm_world/navigation/reachable-carrier-schemas';
import { canonicalJson, sha256Digest } from '../../analysis/crpm_world/canonical';
import { resolveD2IOutputPath } from '../../scripts/run-cocoon-voyage-audit';

let raw: D2HRawExport;
let result: D2IResult;

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
    result = assessCocoonVoyages(raw);
});

test('D2I partitions every D2H policy-visible witness by its declared target', () => {
    assert.deepEqual(result.targetSummaries, [
        {
            schemaVersion: 1,
            caseScope: 'F4',
            witnessPairCount: 68,
            policySelectionSplitCount: 34,
            matchedActionPairCount: 34,
            visibleDescentDefectCount: 10,
            recurrenceSupportSplitCount: 12,
            exactTimeResidueCount: 12,
            matchedActionTerminalSplitCount: 0,
            visibleDefectActions: [
                { actionKey: 'cast:needlepoint:stay', witnessCount: 8 },
                { actionKey: 'cast:spoolburst:stay', witnessCount: 2 }
            ]
        },
        {
            schemaVersion: 1,
            caseScope: 'I2',
            witnessPairCount: 68,
            policySelectionSplitCount: 34,
            matchedActionPairCount: 34,
            visibleDescentDefectCount: 10,
            recurrenceSupportSplitCount: 12,
            exactTimeResidueCount: 12,
            matchedActionTerminalSplitCount: 0,
            visibleDefectActions: [
                { actionKey: 'cast:needlepoint:stay', witnessCount: 8 },
                { actionKey: 'cast:spoolburst:stay', witnessCount: 2 }
            ]
        }
    ]);
    assert.equal(result.targetWitnesses.length, 136);
    assert.equal(result.targetWitnesses.filter((item) => item.visibleDefect !== null).length, 20);
    assert.ok(result.targetWitnesses
        .filter((item) => item.classification === 'matched_action_exact_time_residue')
        .every((item) =>
            canonicalJson(item.sourceDifferenceFields) === canonicalJson(['completedTurns']) &&
            item.relations.visibleSuccessor === 'same' &&
            item.relations.tacticalRecurrenceSuccessor === 'same' &&
            item.relations.exactCarrierSuccessor === 'different'
        ));
});

test('matched-action visible defects are exact Cocoon damage witnesses', () => {
    const defects = result.targetWitnesses
        .map((item) => item.visibleDefect)
        .filter((item) => item !== null);
    assert.equal(defects.length, 20);
    assert.ok(defects.every((item) => {
        const sides = [item.left, item.right];
        const absorbed = sides.find((side) => side.cocoonBefore === 1);
        const control = sides.find((side) => side.cocoonBefore === 0);
        return item.cause === 'cocoon_absorption' &&
            absorbed?.cocoonAfter === 0 && absorbed.damage === 0 &&
            control?.cocoonAfter === 0 && (control?.damage ?? 0) > 0;
    }));
    assert.deepEqual(
        Object.fromEntries([...new Set(defects.map((item) => item.relicId))].sort().map((relicId) => [
            relicId,
            defects.filter((item) => item.relicId === relicId).length
        ])),
        { needlepoint: 16, spoolburst: 4 }
    );
});

test('every Cocoon formation re-enters through a strict response and resolution voyage', () => {
    assert.equal(result.voyages.length, 160);
    assert.equal(new Set(result.voyages.map((item) => item.voyageRef)).size, 160);
    assert.ok(result.voyages.every((item) =>
        item.reentryItemRefs[0] === item.formation.itemRef &&
        item.reentryItemRefs[1] === item.response.itemRef &&
        item.response.actor !== item.preparer &&
        item.response.relation !== 'other' &&
        item.resolutionDisposition !== 'unresolved'
    ));
    assert.deepEqual(result.voyageSummaries, [
        {
            schemaVersion: 1, caseScope: 'F4', preparerPhase: 'first',
            formationCount: 40, uniqueMatchCount: 20,
            responseCounts: { needlepointAbsorbed: 16, spoolburstAbsorbed: 8, threadballBypassed: 8, unweaveCleared: 8, counterPreparation: 0, other: 0 },
            cocoonDispositionCounts: { consumedByNeedlepoint: 16, consumedBySpoolburst: 8, clearedByUnweave: 8, expiredOnRelease: 8, terminalOrUnresolved: 0 },
            resolutionCounts: { releasedSpoolburst: 32, unwoven: 8, terminalBeforeResolution: 0, unresolved: 0 },
            recurrenceReturnCount: 0, terminalVoyageCount: 12, aggregateResponseDamage: 360
        },
        {
            schemaVersion: 1, caseScope: 'F4', preparerPhase: 'second',
            formationCount: 40, uniqueMatchCount: 20,
            responseCounts: { needlepointAbsorbed: 16, spoolburstAbsorbed: 0, threadballBypassed: 8, unweaveCleared: 8, counterPreparation: 8, other: 0 },
            cocoonDispositionCounts: { consumedByNeedlepoint: 16, consumedBySpoolburst: 0, clearedByUnweave: 8, expiredOnRelease: 16, terminalOrUnresolved: 0 },
            resolutionCounts: { releasedSpoolburst: 32, unwoven: 8, terminalBeforeResolution: 0, unresolved: 0 },
            recurrenceReturnCount: 0, terminalVoyageCount: 8, aggregateResponseDamage: 360
        },
        {
            schemaVersion: 1, caseScope: 'I2', preparerPhase: 'first',
            formationCount: 40, uniqueMatchCount: 20,
            responseCounts: { needlepointAbsorbed: 16, spoolburstAbsorbed: 8, threadballBypassed: 8, unweaveCleared: 8, counterPreparation: 0, other: 0 },
            cocoonDispositionCounts: { consumedByNeedlepoint: 16, consumedBySpoolburst: 8, clearedByUnweave: 8, expiredOnRelease: 8, terminalOrUnresolved: 0 },
            resolutionCounts: { releasedSpoolburst: 32, unwoven: 8, terminalBeforeResolution: 0, unresolved: 0 },
            recurrenceReturnCount: 0, terminalVoyageCount: 12, aggregateResponseDamage: 360
        },
        {
            schemaVersion: 1, caseScope: 'I2', preparerPhase: 'second',
            formationCount: 40, uniqueMatchCount: 20,
            responseCounts: { needlepointAbsorbed: 16, spoolburstAbsorbed: 0, threadballBypassed: 8, unweaveCleared: 8, counterPreparation: 8, other: 0 },
            cocoonDispositionCounts: { consumedByNeedlepoint: 16, consumedBySpoolburst: 0, clearedByUnweave: 8, expiredOnRelease: 16, terminalOrUnresolved: 0 },
            resolutionCounts: { releasedSpoolburst: 32, unwoven: 8, terminalBeforeResolution: 0, unresolved: 0 },
            recurrenceReturnCount: 0, terminalVoyageCount: 8, aggregateResponseDamage: 360
        }
    ]);
});

test('interleaved short-approach voyages retain the exact ordered response split', () => {
    assert.deepEqual(result.orderedRouteSummaries, [
        {
            schemaVersion: 1, caseScope: 'F4', formationCountsEqual: true,
            releaseUnweaveDispositionEqual: true, firstPhaseSpoolburstResponseCount: 8,
            secondPhaseCounterPreparationResponseCount: 8, orderedWitnessCount: 8,
            uniqueWitnessMatchCount: 4, firstActorWinMatchCount: 4,
            classification: 'ordered_response_split'
        },
        {
            schemaVersion: 1, caseScope: 'I2', formationCountsEqual: true,
            releaseUnweaveDispositionEqual: true, firstPhaseSpoolburstResponseCount: 8,
            secondPhaseCounterPreparationResponseCount: 8, orderedWitnessCount: 8,
            uniqueWitnessMatchCount: 4, firstActorWinMatchCount: 4,
            classification: 'ordered_response_split'
        }
    ]);
    assert.equal(result.orderedRouteWitnesses.length, 16);
    assert.ok(result.orderedRouteWitnesses.every((item) =>
        item.playerPolicy === 'short_approach' &&
        item.loomkeeperPolicy === 'short_approach' &&
        item.secondActorReleaseDamage === 0 &&
        [20, 80].includes(item.firstActorReleaseDamage) &&
        item.finalWinner === item.firstActor &&
        item.finalCompletedTurns === 9 &&
        item.firstActorWins
    ));
    for (const caseScope of ['F4', 'I2'] as const) {
        const local = result.orderedRouteWitnesses.filter((item) => item.caseScope === caseScope);
        assert.equal(local.filter((item) => item.firstActorReleaseDamage === 80).length, 4);
        assert.equal(local.filter((item) => item.firstActorReleaseDamage === 20).length, 4);
        assert.equal(new Set(local.map((item) => item.matchRef)).size, 4);
    }
});

test('D2I advances only to a candidate question and remains deterministic and non-mutating', () => {
    assert.equal(result.navigationWake.classification, 'advance_to_candidate_question');
    assert.match(result.navigationWake.nextPermittedAction, /candidate-question contract/);
    assert.equal(result.productAuthority, 'none');
    const before = canonicalJson(raw);
    const repeated = assessCocoonVoyages(raw);
    assert.equal(canonicalJson(raw), before);
    assert.equal(canonicalD2IResult(repeated), canonicalD2IResult(result));
    assert.equal(result.resultDigest, 'ff29c8a1d18a201ca9047e72f458e919151ec53cd581567219b307e393a4b7b0');
    const { resultDigest, ...payload } = result;
    assert.equal(resultDigest, sha256Digest(payload));
});

test('D2I schemas and source bindings fail closed', () => {
    const unknown = JSON.parse(canonicalD2IResult(result)) as Record<string, unknown>;
    unknown.liveActivation = true;
    assert.equal(D2IResultSchema.safeParse(unknown).success, false);
    const alteredResult = JSON.parse(canonicalD2IResult(result)) as Record<string, unknown>;
    alteredResult.resultDigest = '0'.repeat(64);
    assert.equal(D2IResultSchema.safeParse(alteredResult).success, false);
    const alteredRaw = JSON.parse(canonicalJson(raw)) as D2HRawExport;
    alteredRaw.blockedClaims = [...alteredRaw.blockedClaims, 'tampered'];
    const { exportDigest: ignoredDigest, ...payload } = alteredRaw;
    alteredRaw.exportDigest = sha256Digest(payload);
    assert.throws(() => assessCocoonVoyages(alteredRaw), /frozen D2H raw export digest/);
});

test('D2I runner is fixed and output-confined', () => {
    assert.match(
        resolveD2IOutputPath('test-results/crpm-world/d2i-cocoon-voyages/result.json').replaceAll('\\', '/'),
        /test-results\/crpm-world\/d2i-cocoon-voyages\/result\.json$/
    );
    assert.throws(() => resolveD2IOutputPath('analysis/tactical_model/model.py'), /below/);
    assert.throws(
        () => resolveD2IOutputPath('test-results/crpm-world/d2i-cocoon-voyages/result.txt'),
        /JSON/
    );
    const runnerSource = readFileSync('scripts/run-cocoon-voyage-audit.ts', 'utf8');
    assert.match(runnerSource, /\['-m', 'analysis\.tactical_model\.reachable_carrier_probe'\]/);
    assert.doesNotMatch(runnerSource, /\beval\s*\(|new Function|import\s*\(/);
    const rejected = spawnSync(process.execPath, [
        '--import', 'tsx', 'scripts/run-cocoon-voyage-audit.ts',
        '--config', 'unknown-candidate'
    ], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /accepts only one optional --output/);
});
