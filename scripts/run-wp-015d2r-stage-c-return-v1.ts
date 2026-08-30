import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
    closeSync,
    existsSync,
    fstatSync,
    fsyncSync,
    mkdirSync,
    openSync,
    readFileSync,
    rmSync,
    writeSync
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '../analysis/crpm_world/canonical';
import {
    STAGE_C_REPORT_PATH,
    STAGE_C_REVIEW_RETURN_PATH,
    STAGE_C_RESULT_PATH,
    STAGE_C_ROOT,
    buildStageCReviewReturn,
    parseStageCStrictJson,
    reconstructStageCReturn,
    renderStageCReport,
    stageCReviewReturnText,
    stageCResultText,
    verifyStageCStoredOutput,
    verifyStageCStoredReviewReturn,
    type StageCReviewReturn,
    type StageCResult
} from '../analysis/crpm_world/navigation/reconstruct-wp-015d2r-stage-c-return-v1';

export type StageCArgs =
    | Readonly<{
        mode: 'write_result';
        sourceCommit: string;
        resultOutput: typeof STAGE_C_RESULT_PATH;
        reportOutput: typeof STAGE_C_REPORT_PATH;
    }>
    | Readonly<{
        mode: 'verify_result';
        resultCommit?: string;
    }>
    | Readonly<{
        mode: 'write_review_return';
        resultCommit: string;
        reviewOutput: typeof STAGE_C_REVIEW_RETURN_PATH;
        pilotSynthesisStdin: true;
    }>
    | Readonly<{
        mode: 'verify_review_return';
        reviewCommit?: string;
    }>;

function assertCommit(value: string, label: string): void {
    assert(/^[0-9a-f]{40}$/.test(value), `${label} must be a full lowercase SHA-1 commit identity.`);
}

/**
 * Stage C has no implicit execution mode. Publication requires the exact two
 * registered output paths and a committed source identity.
 */
export function parseStageCArgs(args: readonly string[]): StageCArgs {
    assert(args.length > 0, 'Stage C requires --write-result or --verify-result.');
    if (args[0] === '--verify-result') {
        if (args.length === 1) return { mode: 'verify_result' };
        assert.equal(args.length, 3, 'Usage: --verify-result [--result-commit <commit>]');
        assert.equal(args[1], '--result-commit');
        assertCommit(args[2], 'Stage C result commit');
        return { mode: 'verify_result', resultCommit: args[2] };
    }
    if (args[0] === '--verify-review-return') {
        if (args.length === 1) return { mode: 'verify_review_return' };
        assert.equal(args.length, 3,
            'Usage: --verify-review-return [--review-commit <commit>]');
        assert.equal(args[1], '--review-commit');
        assertCommit(args[2], 'Stage C review-return commit');
        return { mode: 'verify_review_return', reviewCommit: args[2] };
    }
    if (args[0] === '--write-review-return') {
        const values = new Map<string, string>();
        let pilotSynthesisStdin = false;
        for (let index = 1; index < args.length;) {
            const key = args[index];
            if (key === '--pilot-synthesis-stdin') {
                assert.equal(pilotSynthesisStdin, false,
                    'Duplicate Stage C review-return argument: --pilot-synthesis-stdin');
                pilotSynthesisStdin = true;
                index += 1;
                continue;
            }
            const value = args[index + 1];
            assert(key && value, 'Stage C review-return arguments must be key/value pairs.');
            assert(['--result-commit', '--review-output'].includes(key),
                `Unknown Stage C review-return argument: ${key}`);
            assert(!values.has(key), `Duplicate Stage C review-return argument: ${key}`);
            values.set(key, value);
            index += 2;
        }
        assert.equal(values.size, 2,
            'Usage: --write-review-return --result-commit <commit> --review-output <path> --pilot-synthesis-stdin');
        assert(pilotSynthesisStdin,
            'Stage C review-return publication requires --pilot-synthesis-stdin.');
        const resultCommit = values.get('--result-commit') ?? '';
        const reviewOutput = values.get('--review-output') ?? '';
        assertCommit(resultCommit, 'Stage C result commit');
        assert.equal(reviewOutput, STAGE_C_REVIEW_RETURN_PATH);
        return {
            mode: 'write_review_return',
            resultCommit,
            reviewOutput: STAGE_C_REVIEW_RETURN_PATH,
            pilotSynthesisStdin: true
        };
    }
    assert.equal(args[0], '--write-result',
        'Stage C admits only --write-result or --verify-result.');
    const values = new Map<string, string>();
    for (let index = 1; index < args.length; index += 2) {
        const key = args[index];
        const value = args[index + 1];
        assert(key && value, 'Stage C write arguments must be key/value pairs.');
        assert(['--source-commit', '--result-output', '--report-output'].includes(key),
            `Unknown Stage C write argument: ${key}`);
        assert(!values.has(key), `Duplicate Stage C write argument: ${key}`);
        values.set(key, value);
    }
    assert.equal(values.size, 3,
        'Usage: --write-result --source-commit <commit> --result-output <path> --report-output <path>');
    const sourceCommit = values.get('--source-commit') ?? '';
    const resultOutput = values.get('--result-output') ?? '';
    const reportOutput = values.get('--report-output') ?? '';
    assertCommit(sourceCommit, 'Stage C source commit');
    assert.equal(resultOutput, STAGE_C_RESULT_PATH,
        'Stage C result output must equal the registered result path.');
    assert.equal(reportOutput, STAGE_C_REPORT_PATH,
        'Stage C report output must equal the registered report path.');
    return {
        mode: 'write_result',
        sourceCommit,
        resultOutput: STAGE_C_RESULT_PATH,
        reportOutput: STAGE_C_REPORT_PATH
    };
}

function gitText(args: readonly string[], repositoryRoot = STAGE_C_ROOT): string {
    return execFileSync('git', [...args], {
        cwd: repositoryRoot,
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true
    }).trim();
}

function resolveRegisteredOutput(path: string, repositoryRoot: string): string {
    assert(path === STAGE_C_RESULT_PATH || path === STAGE_C_REPORT_PATH ||
        path === STAGE_C_REVIEW_RETURN_PATH,
        `Undeclared Stage C output path: ${path}`);
    const root = resolve(repositoryRoot);
    const target = resolve(root, path);
    const relative = target.slice(root.length).replaceAll('\\', '/');
    assert(relative.startsWith('/') && !relative.includes('/../'),
        `Stage C output escapes the repository: ${path}`);
    return target;
}

type Reservation = { path: string; target: string; fd: number; wrote: boolean };

function closeReservations(reservations: Reservation[]): Error[] {
    const errors: Error[] = [];
    for (const reservation of reservations) {
        if (reservation.fd < 0) continue;
        try {
            closeSync(reservation.fd);
            reservation.fd = -1;
        } catch (error) {
            errors.push(error instanceof Error ? error : new Error(String(error)));
        }
    }
    return errors;
}

function reserveOutputs(paths: readonly string[], repositoryRoot: string): Reservation[] {
    const reservations: Reservation[] = [];
    try {
        for (const path of paths) {
            const target = resolveRegisteredOutput(path, repositoryRoot);
            mkdirSync(dirname(target), { recursive: true });
            assert(!existsSync(target), `Stage C output already exists: ${path}`);
            const fd = openSync(target, 'wx', 0o644);
            const stat = fstatSync(fd);
            assert(stat.isFile() && stat.nlink === 1 && stat.size === 0,
                `Stage C output reservation is not a new regular file: ${path}`);
            reservations.push({ path, target, fd, wrote: false });
        }
        return reservations;
    } catch (error) {
        closeReservations(reservations);
        for (const reservation of reservations) {
            if (!reservation.wrote && existsSync(reservation.target)) {
                rmSync(reservation.target);
            }
        }
        throw error;
    }
}

function writeReservation(reservation: Reservation, text: string): void {
    const bytes = Buffer.from(text, 'utf8');
    let offset = 0;
    while (offset < bytes.length) {
        const written = writeSync(reservation.fd, bytes, offset, bytes.length - offset, null);
        assert(written > 0, `Stage C output write made no progress: ${reservation.path}`);
        reservation.wrote = true;
        offset += written;
    }
    assert.equal(fstatSync(reservation.fd).size, bytes.length,
        `Stage C output length mismatch: ${reservation.path}`);
    fsyncSync(reservation.fd);
}

function assertCleanSourceBoundary(sourceCommit: string, repositoryRoot: string): void {
    assert.equal(gitText(['rev-parse', 'HEAD'], repositoryRoot), sourceCommit,
        'Stage C write must run at the exact committed source HEAD.');
    assert.equal(gitText(['status', '--porcelain=v1', '--untracked-files=all'], repositoryRoot), '',
        'Stage C write requires a clean source worktree before output reservation.');
}

export function writeStageCOutputs(
    options: Extract<StageCArgs, { mode: 'write_result' }>,
    repositoryRoot = STAGE_C_ROOT
): StageCResult {
    assert.equal(options.resultOutput, STAGE_C_RESULT_PATH);
    assert.equal(options.reportOutput, STAGE_C_REPORT_PATH);
    assertCleanSourceBoundary(options.sourceCommit, repositoryRoot);
    const result = reconstructStageCReturn(options.sourceCommit, repositoryRoot);
    assert.equal(result.hardGatesPass, true, 'Stage C hard gates did not pass; outputs were not reserved.');
    const payloads = [
        // Publish the human report first and the authoritative result last.
        // Both paths are reserved before either receives a payload byte.
        { path: options.reportOutput, text: renderStageCReport(result) },
        { path: options.resultOutput, text: stageCResultText(result) }
    ];
    const reservations = reserveOutputs(payloads.map((payload) => payload.path), repositoryRoot);
    let writeError: unknown;
    try {
        for (let index = 0; index < reservations.length; index += 1) {
            writeReservation(reservations[index], payloads[index].text);
        }
    } catch (error) {
        writeError = error;
    }
    const closeErrors = closeReservations(reservations);
    if (writeError !== undefined || closeErrors.length > 0) {
        // Once payload publication begins, retain every reserved path for
        // forensic inspection. Never silently remove partial evidence.
        throw new Error(
            `Stage C publication failed; reserved outputs retained: ${
                writeError instanceof Error ? writeError.message : String(writeError ?? closeErrors[0])}`
        );
    }
    for (const payload of payloads) {
        assert.equal(readFileSync(resolveRegisteredOutput(payload.path, repositoryRoot), 'utf8'), payload.text,
            `Stage C output byte verification failed: ${payload.path}`);
    }
    return result;
}

export function writeStageCReviewReturnOutput(
    options: Extract<StageCArgs, { mode: 'write_review_return' }>,
    repositoryRoot = STAGE_C_ROOT,
    pilotSynthesisInput?: Buffer | string
): StageCReviewReturn {
    assert.equal(options.reviewOutput, STAGE_C_REVIEW_RETURN_PATH);
    assert.equal(options.pilotSynthesisStdin, true);
    assertCleanSourceBoundary(options.resultCommit, repositoryRoot);
    const pilotSynthesis = parseStageCPilotSynthesisStdin(
        pilotSynthesisInput ?? readFileSync(0)
    );
    const review = buildStageCReviewReturn(options.resultCommit, pilotSynthesis, repositoryRoot);
    const reservations = reserveOutputs([options.reviewOutput], repositoryRoot);
    let writeError: unknown;
    try {
        writeReservation(reservations[0], stageCReviewReturnText(review));
    } catch (error) {
        writeError = error;
    }
    const closeErrors = closeReservations(reservations);
    if (writeError !== undefined || closeErrors.length > 0) {
        throw new Error(
            `Stage C review-return publication failed; reserved output retained: ${
                writeError instanceof Error ? writeError.message : String(writeError ?? closeErrors[0])}`
        );
    }
    assert.equal(
        readFileSync(resolveRegisteredOutput(options.reviewOutput, repositoryRoot), 'utf8'),
        stageCReviewReturnText(review),
        'Stage C review-return output byte verification failed.'
    );
    return review;
}

/** Strictly parses the single reviewer-authored JSON object supplied on fd 0. */
export function parseStageCPilotSynthesisStdin(input: Buffer | string): unknown {
    const text = typeof input === 'string' ? input : input.toString('utf8');
    assert(text.length > 0, 'Stage C pilot synthesis stdin is empty.');
    return parseStageCStrictJson(text);
}

export function verifyStageCStoredOutputBytes(
    repositoryRoot = STAGE_C_ROOT,
    resultCommit?: string
): StageCResult {
    return verifyStageCStoredOutput(repositoryRoot, resultCommit);
}

export function main(args = process.argv.slice(2)): number {
    try {
        const options = parseStageCArgs(args);
        if (options.mode === 'verify_result') {
            const result = verifyStageCStoredOutputBytes(STAGE_C_ROOT, options.resultCommit);
            console.log(canonicalJson({
                status: 'verified_stage_c_stopped',
                sourceCommit: result.source.sourceCommit,
                sourceDigest: result.source.sourceDigest,
                resultDigest: result.resultDigest,
                tauStatus: result.tauReturn.status,
                hardGatesPass: result.hardGatesPass,
                stopStatement: result.stopStatement
            }));
            return 0;
        }
        if (options.mode === 'verify_review_return') {
            const review = verifyStageCStoredReviewReturn(STAGE_C_ROOT, options.reviewCommit);
            console.log(canonicalJson({
                status: 'verified_stage_c_review_return_stopped',
                sourceCommit: review.sourceCommit,
                resultCommit: review.resultCommit,
                returnDigest: review.returnDigest,
                tauStatus: review.tauReturn.status,
                stopStatement: review.stopStatement
            }));
            return 0;
        }
        if (options.mode === 'write_review_return') {
            const review = writeStageCReviewReturnOutput(options);
            console.log(canonicalJson({
                status: 'stage_c_review_return_written_stopped',
                reviewPath: options.reviewOutput,
                sourceCommit: review.sourceCommit,
                resultCommit: review.resultCommit,
                returnDigest: review.returnDigest,
                tauStatus: review.tauReturn.status,
                stopStatement: review.stopStatement
            }));
            return 0;
        }
        const result = writeStageCOutputs(options);
        console.log(canonicalJson({
            status: 'stage_c_result_written_stopped',
            resultPath: options.resultOutput,
            reportPath: options.reportOutput,
            sourceCommit: result.source.sourceCommit,
            sourceDigest: result.source.sourceDigest,
            resultDigest: result.resultDigest,
            endpointCount: result.reconstruction.endpointCount,
            pairCount: result.reconstruction.pairCount,
            primaryOutcomeCounts: result.reconstruction.primaryOutcomeCounts,
            qSupportVerdict: result.candidateAssessments.Q_support.verdict,
            qCommandVerdict: result.candidateAssessments.Q_command.verdict,
            tauStatus: result.tauReturn.status,
            hardGatesPass: result.hardGatesPass,
            stopStatement: result.stopStatement
        }));
        return 0;
    } catch (error) {
        console.error(`WP-015D2R Stage C stopped: ${error instanceof Error ? error.message : String(error)}`);
        return 1;
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.exitCode = main();
}
