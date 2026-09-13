import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson, sha256Digest, type JsonValue } from '../analysis/crpm_world/canonical';
import {
    D2Q_CONTRACT_COMMIT, D2Q_ROOT, auditD2QRange, parseStrictJson, readD2QRegistration,
    renderD2QReport, runD2Q, verifyD2QReviewReturn,
    type buildD2QReviewReturn, type D2QResult
} from '../analysis/crpm_world/navigation/assess-v4-command-gates';

const OUTPUT_ROOT = resolve(D2Q_ROOT, 'test-results/crpm-world/d2q-v4-command-gates');
const DEFAULT_OUTPUT = resolve(OUTPUT_ROOT, 'result.json');

/** No request, operator, seed, authority state or output-root overrides exist. */
export function parseD2QArgs(args: readonly string[]): { mode: 'run'; outputPath: string } | { mode: 'verify_return' } {
    if (args.length === 1 && args[0] === '--verify-return') return { mode: 'verify_return' };
    if (args.length === 0) return { mode: 'run', outputPath: resolveD2QOutputPath(DEFAULT_OUTPUT) };
    assert(args.length === 2 && args[0] === '--output', 'Use only --output <confined.json> or --verify-return.');
    assert(!args[1].startsWith('--'), 'Missing output path.');
    return { mode: 'run', outputPath: resolveD2QOutputPath(args[1]) };
}

function assertRegularOutputPath(path: string): void {
    const within = relative(D2Q_ROOT, path);
    assert(within && !within.startsWith('..') && !isAbsolute(within));
    let cursor = D2Q_ROOT;
    for (const part of within.split(sep)) {
        cursor = resolve(cursor, part);
        let stat;
        try { stat = lstatSync(cursor); }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
            throw error;
        }
        assert(!stat.isSymbolicLink(), 'Output may not traverse a symlink or junction.');
        if (cursor === path) assert(stat.isFile() && stat.nlink === 1, 'Output must be a regular, unlinked file.');
        else assert(stat.isDirectory(), 'Output parent must be a directory.');
    }
}

export function resolveD2QOutputPath(value: string): string {
    assert(value && value.trim() === value, 'Output path must be explicit and unpadded.');
    const path = resolve(D2Q_ROOT, value);
    const within = relative(OUTPUT_ROOT, path);
    assert(within && !within.startsWith('..') && !isAbsolute(within), 'Output must remain in the D2Q ignored directory.');
    assert.equal(extname(path), '.json', 'Output must be a JSON file.');
    for (const part of within.split(sep)) {
        assert(/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part) && !part.endsWith('.'), 'Unsafe output path component.');
        assert(!/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part), 'Reserved output path component.');
    }
    assertRegularOutputPath(path);
    return path;
}

function git(args: readonly string[]): string {
    return execFileSync('git', [...args], { cwd: D2Q_ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
}

export function readD2QPlannedChecks(): string[] {
    const original = parseStrictJson(git(['show', `${D2Q_CONTRACT_COMMIT}:docs/evidence/wp-015d2q.json`])) as { planned_checks: string[] };
    return original.planned_checks;
}

/** Matching copies alone cannot turn empty or incomplete validation into closeout. */
export function validateD2QPublicationEvidence(result: D2QResult, validation: Record<string, JsonValue>, input: unknown): void {
    const workPackage = input as Record<string, unknown>;
    assert(workPackage && typeof workPackage === 'object' && !Array.isArray(workPackage));
    assert.equal(workPackage.id, result.packageId);
    assert.equal(workPackage.status, result.analysis.hardGatesPass ? 'complete' : 'blocked');
    assert.equal(validation.sourceCommit, result.source.commit);
    const planned = readD2QPlannedChecks();
    assert.equal(canonicalJson(workPackage.planned_checks), canonicalJson(planned), 'The frozen planned validation set changed.');
    assert.equal(canonicalJson(validation.checks), canonicalJson(workPackage.check_results), 'Validation/work-package check parity failed.');
    assert.equal(canonicalJson(validation.reviews), canonicalJson(workPackage.reviews), 'Validation/work-package review parity failed.');
    assert(Array.isArray(validation.checks) && validation.checks.length === planned.length, 'Every planned check needs one recorded result.');
    const checks = validation.checks as { command: string; status: string; detail: string }[];
    assert.equal(new Set(checks.map((row) => row.command)).size, planned.length, 'Duplicate validation command.');
    assert.deepEqual(checks.map((row) => row.command).sort(), [...planned].sort());
    assert(checks.every((row) => typeof row.detail === 'string' && row.detail.trim().length > 0));
    assert(checks.every((row) => result.analysis.hardGatesPass ? row.status === 'pass' : ['pass', 'fail', 'not_run'].includes(row.status)), 'Incomplete or failed validation cannot close a positive result.');
    assert(Array.isArray(validation.reviews) && validation.reviews.length > 0, 'Closeout requires identified read-only review.');
    const reviews = validation.reviews as { role: string; reviewer: string; decision: string; detail: string }[];
    assert(reviews.every((row) => [row.role, row.reviewer, row.detail].every((value) => typeof value === 'string' && value.trim().length > 0) && row.decision === 'pass'));
    assert(Array.isArray(validation.executionRuns) && validation.executionRuns.length === 2, 'Exactly two recorded process runs are required.');
    const runs = validation.executionRuns as { runId: string; sourceCommit: string; resultDigest: string; evidenceDigest: string; analysisDigest: string }[];
    assert.deepEqual(runs.map((row) => row.runId), ['run_1', 'run_2']);
    for (const row of runs) {
        assert.equal(row.sourceCommit, result.source.commit);
        assert.equal(row.resultDigest, result.resultDigest);
        assert.equal(row.evidenceDigest, result.evidenceDigest);
        assert.equal(row.analysisDigest, result.analysisDigest);
    }
}

export function verifyD2QPublication() {
    const registration = readD2QRegistration();
    const result = runD2Q();
    const commit = git(['rev-parse', 'HEAD']).trim();
    const report = git(['show', `${commit}:${registration.reportPath}`]);
    const receipt = parseStrictJson(git(['show', `${commit}:${registration.returnPath}`])) as ReturnType<typeof buildD2QReviewReturn>;
    verifyD2QReviewReturn(result, report, receipt);
    const range = auditD2QRange(registration.sourceBasis.wormsBaseCommit, commit, registration.allowedOutputs);
    assert.deepEqual(range.endpointRows.map((row) => row.path).sort(), [...registration.allowedOutputs].sort(), 'Publication must contain exactly the eleven declared outputs.');
    const additive = new Set([
        'docs/planning/implementation_plan.md',
        'docs/planning/wp-015d2g-relational-gameplay-navigation-review.md',
        'analysis/crpm_world/README.md'
    ]);
    for (const delta of range.commits) {
        for (const row of delta.rows.filter((candidate) => additive.has(candidate.path))) {
            const columns = git(['diff', '--no-ext-diff', '--numstat', '--no-renames', delta.parent, delta.commit, '--', row.path]).trim().split('\t');
            assert.equal(columns[1], '0', `Historical discovery text was removed: ${row.path}`);
        }
    }
    const workPackage = parseStrictJson(git(['show', `${commit}:docs/evidence/wp-015d2q.json`])) as Record<string, unknown>;
    validateD2QPublicationEvidence(result, receipt.validation, workPackage);
    return {
        status: 'verified_stopped_for_review', terminalCommit: commit,
        sourceCommit: result.source.commit, sourceDigest: result.source.sourceDigest,
        reportBlob: git(['rev-parse', `${commit}:${registration.reportPath}`]).trim(),
        returnBlob: git(['rev-parse', `${commit}:${registration.returnPath}`]).trim(),
        reportDigest: receipt.report.sha256, resultDigest: result.resultDigest,
        parityDigest: receipt.parityDigest, validationDigest: receipt.validationDigest, receiptDigest: receipt.receiptDigest,
        terminalRangeDigest: sha256Digest(range), terminalRange: range,
        hardGatesPass: result.analysis.hardGatesPass, analyticalDisposition: result.analysis.analyticalDisposition,
        crpmBoundary: 'Frozen commit is provenance metadata only; the coordinator checks the separate checkout. No CRPM runtime dependency.',
        frozenCrpmCommit: registration.sourceBasis.crpmFrozenCommit,
        productAuthority: 'none', mathematicalPlacementImplication: 'none', successorExecutionOpened: false
    };
}

export function main(args = process.argv.slice(2)): number {
    try {
        const options = parseD2QArgs(args);
        if (options.mode === 'verify_return') {
            console.log(canonicalJson(verifyD2QPublication()));
            return 0;
        }
        const target = resolveD2QOutputPath(options.outputPath);
        const preview = target.slice(0, -5) + '.md';
        assertRegularOutputPath(preview);
        const result = runD2Q();
        mkdirSync(dirname(target), { recursive: true });
        resolveD2QOutputPath(target); // Check again after creating any parents.
        assertRegularOutputPath(preview);
        writeFileSync(target, canonicalJson(result) + '\n', 'utf8');
        writeFileSync(preview, renderD2QReport(result), 'utf8');
        console.log(canonicalJson({
            output: relative(D2Q_ROOT, target).split(sep).join('/'),
            reportPreview: relative(D2Q_ROOT, preview).split(sep).join('/'),
            sourceCommit: result.source.commit, sourceDigest: result.source.sourceDigest,
            registrationDigest: result.registrationDigest, contextDigest: result.contextDigest,
            caseSetDigest: result.caseSetDigest, evidenceDigest: result.evidenceDigest,
            analysisDigest: result.analysisDigest, resultDigest: result.resultDigest,
            hardGatesPass: result.analysis.hardGatesPass,
            analyticalDisposition: result.analysis.analyticalDisposition
        }));
        return result.analysis.hardGatesPass ? 0 : 1;
    } catch (error) {
        console.error(`WP-015D2Q stopped: ${error instanceof Error ? error.message : String(error)}`);
        return 1;
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
