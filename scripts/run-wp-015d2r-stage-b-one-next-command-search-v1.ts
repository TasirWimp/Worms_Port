import assert from 'node:assert/strict';
import {
    accessSync,
    closeSync,
    constants as fsConstants,
    existsSync,
    fstatSync,
    fsyncSync,
    lstatSync,
    mkdirSync,
    openSync,
    readFileSync,
    readdirSync,
    type Stats,
    unlinkSync,
    writeSync
} from 'node:fs';
import {
    dirname,
    isAbsolute,
    relative,
    resolve,
    sep
} from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson, compareCanonicalText } from '../analysis/crpm_world/canonical';
import {
    STAGE_B_RAW_PATHS,
    STAGE_B_REPORT_PATH,
    STAGE_B_RESULT_PATH,
    STAGE_B_ROOT,
    buildStageBResult,
    executeRegisteredRoutes,
    parseStrictJson,
    readStageBRegistration,
    renderStageBReport,
    serializeStageBRawOutputs,
    validateStageBResult,
    verifyStageBRecordedSourceIdentity,
    verifyStageBSourceBindings,
    type StageBResult
} from '../analysis/crpm_world/navigation/assess-wp-015d2r-stage-b-one-next-command-search-v1';

const EXACT_OUTPUT_PATHS = Object.freeze([
    ...Object.values(STAGE_B_RAW_PATHS),
    STAGE_B_REPORT_PATH,
    // Publish the authoritative result last. A preceding raw/report write
    // failure therefore cannot leave a complete positive result by itself.
    STAGE_B_RESULT_PATH
]);

/** The authorized runner has no seed, domain, command, output, or mode override. */
export function parseStageBArgs(args: readonly string[]): { mode: 'execute' | 'verify_result' } {
    if (args.length === 0) return { mode: 'execute' };
    if (args.length === 1 && args[0] === '--verify-result') return { mode: 'verify_result' };
    throw new assert.AssertionError({
        message: 'WP-015D2R Stage B accepts only no arguments or --verify-result; no execution coordinate is overridable.'
    });
}

function normalizedRelative(repositoryRoot: string, path: string): string {
    const within = relative(repositoryRoot, path);
    assert(within && !within.startsWith('..') && !isAbsolute(within),
        'Stage B output must remain below the repository root.');
    return within.split(sep).join('/');
}

function assertSafeExistingChain(repositoryRoot: string, target: string): void {
    const within = relative(repositoryRoot, target);
    let cursor = repositoryRoot;
    const rootStat = lstatSync(repositoryRoot);
    assert(rootStat.isDirectory() && !rootStat.isSymbolicLink(),
        'Stage B repository root must be a real directory.');
    for (const part of within.split(sep)) {
        assert(/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part) && !part.endsWith('.'),
            'Unsafe Stage B output path component.');
        assert(!/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
            'Reserved Stage B output path component.');
        cursor = resolve(cursor, part);
        let stat;
        try {
            stat = lstatSync(cursor);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
            throw error;
        }
        assert(!stat.isSymbolicLink(), 'Stage B output may not traverse a symlink or junction.');
        if (cursor === target) {
            assert(stat.isFile() && stat.nlink === 1,
                'Existing Stage B output must be a singly linked regular file.');
        } else {
            assert(stat.isDirectory(), 'Stage B output parent must be a directory.');
        }
    }
}

export function resolveStageBOutputPath(
    value: string,
    repositoryRoot = STAGE_B_ROOT
): string {
    assert(value && value.trim() === value && !isAbsolute(value),
        'Stage B output path must be an explicit unpadded repository-relative path.');
    const root = resolve(repositoryRoot);
    const target = resolve(root, value);
    const normalized = normalizedRelative(root, target);
    assert(EXACT_OUTPUT_PATHS.includes(normalized),
        `Undeclared Stage B output path: ${normalized}`);
    assertSafeExistingChain(root, target);
    return target;
}

export function validateStageBRawDirectory(
    expected: 'empty' | 'complete',
    repositoryRoot = STAGE_B_ROOT
): void {
    const root = resolve(repositoryRoot);
    const rawRoot = resolve(root, dirname(STAGE_B_RAW_PATHS.routeAttempts));
    if (!existsSync(rawRoot)) {
        assert.equal(expected, 'empty', 'The complete Stage B raw directory is absent.');
        return;
    }
    const stat = lstatSync(rawRoot);
    assert(stat.isDirectory() && !stat.isSymbolicLink(),
        'Stage B raw output root must be a real directory.');
    const entries = readdirSync(rawRoot).sort(compareCanonicalText);
    const expectedEntries = expected === 'empty'
        ? []
        : Object.values(STAGE_B_RAW_PATHS)
            .map((path) => path.slice(path.lastIndexOf('/') + 1))
            .sort(compareCanonicalText);
    assert.deepEqual(entries, expectedEntries,
        `Stage B raw directory must be ${expected === 'empty' ? 'empty' : 'exactly the five registered JSONL files'}.`);
    if (expected === 'complete') {
        for (const path of Object.values(STAGE_B_RAW_PATHS)) {
            const output = resolveStageBOutputPath(path, root);
            const outputStat = lstatSync(output);
            assert(outputStat.isFile() && !outputStat.isSymbolicLink() && outputStat.nlink === 1,
                `Stage B raw output is not a singly linked regular file: ${path}`);
        }
    }
}

type StageBPlannedOutput = Readonly<{
    path: string;
    target: string;
    bytes: Buffer;
}>;

type StageBReservedOutput = {
    plan: StageBPlannedOutput;
    fd: number;
    dev: number;
    ino: number;
    closed: boolean;
};

function sameFileIdentity(stat: Stats, record: StageBReservedOutput): boolean {
    // Node exposes the same Windows file ID as ino through both APIs, while
    // path-side lstat reports dev=0 and descriptor-side fstat reports a volume
    // serial. POSIX dev values remain directly comparable.
    return stat.ino === record.ino && (process.platform === 'win32' || stat.dev === record.dev);
}

function sameReservedFile(record: StageBReservedOutput): boolean {
    const stat = lstatSync(record.plan.target);
    return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 &&
        sameFileIdentity(stat, record);
}

function closeReservations(records: readonly StageBReservedOutput[]): string[] {
    const failures: string[] = [];
    for (const record of records) {
        if (record.closed) continue;
        try {
            closeSync(record.fd);
            record.closed = true;
        } catch (error) {
            failures.push(`${record.plan.path}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    return failures;
}

function removeInvocationEmptyReservations(records: readonly StageBReservedOutput[]): string[] {
    const failures: string[] = [];
    for (const record of records) {
        try {
            if (!existsSync(record.plan.target)) continue;
            const stat = lstatSync(record.plan.target);
            // A changed identity or material file is not ours to remove. The
            // cleanup is deliberately narrower than the publication paths.
            if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 ||
                !sameFileIdentity(stat, record) || stat.size !== 0) {
                continue;
            }
            unlinkSync(record.plan.target);
        } catch (error) {
            failures.push(`${record.plan.path}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    return failures;
}

function publicationError(prefix: string, error: unknown, cleanupFailures: readonly string[] = []): Error {
    const detail = error instanceof Error ? error.message : String(error);
    const cleanup = cleanupFailures.length === 0
        ? ''
        : ` Cleanup failures: ${cleanupFailures.join(' | ')}`;
    return new Error(`${prefix}: ${detail}.${cleanup}`);
}

/**
 * Read/write-boundary preflight. It deliberately runs before source binding or
 * authority execution so an unsafe or already occupied publication surface
 * cannot consume the one registered run.
 */
export function preflightStageBExecutionOutputs(repositoryRoot = STAGE_B_ROOT): void {
    const root = resolve(repositoryRoot);
    assertUniqueExactPaths(EXACT_OUTPUT_PATHS);
    validateStageBRawDirectory('empty', root);
    const targets = new Set<string>();
    for (const path of EXACT_OUTPUT_PATHS) {
        const target = resolveStageBOutputPath(path, root);
        assert(!targets.has(target), `Duplicate Stage B output destination: ${path}`);
        targets.add(target);
        assert(!existsSync(target), `Stage B output already exists: ${path}`);
        mkdirSync(dirname(target), { recursive: true });
        // Close a parent substitution window after recursive creation.
        assert.equal(resolveStageBOutputPath(path, root), target);
        const parentStat = lstatSync(dirname(target));
        assert(parentStat.isDirectory() && !parentStat.isSymbolicLink(),
            `Stage B output parent must be a real directory: ${path}`);
        accessSync(dirname(target), fsConstants.W_OK);
        assert(!existsSync(target), `Stage B output became occupied during preflight: ${path}`);
    }
    validateStageBRawDirectory('empty', root);
}

function assertUniqueExactPaths(paths: readonly string[]): void {
    assert.equal(new Set(paths).size, paths.length, 'Duplicate exact Stage B output path.');
    assert.deepEqual(
        [...paths].sort(compareCanonicalText),
        [...EXACT_OUTPUT_PATHS].sort(compareCanonicalText),
        'Stage B publication surface is not the exact seven registered outputs.'
    );
}

export function runStageBExecution(): {
    result: StageBResult;
    rawOutputs: ReturnType<typeof serializeStageBRawOutputs>;
    report: string;
} {
    preflightStageBExecutionOutputs();
    const registration = readStageBRegistration();
    const source = verifyStageBSourceBindings(registration);
    const execution = executeRegisteredRoutes(registration);
    const result = buildStageBResult(execution, source, registration);
    const rawOutputs = serializeStageBRawOutputs(execution);
    const report = renderStageBReport(result);
    return { result, rawOutputs, report };
}

export function writeStageBExecutionOutputs(
    run: ReturnType<typeof runStageBExecution>,
    repositoryRoot = STAGE_B_ROOT
): void {
    validateStageBResult(run.result);
    assert.equal(run.report, renderStageBReport(run.result),
        'Stage B report bytes do not match the validated result.');
    assertUniqueExactPaths([
        ...run.rawOutputs.map((row) => row.path),
        STAGE_B_RESULT_PATH,
        STAGE_B_REPORT_PATH
    ]);
    const rawByPath = new Map(run.rawOutputs.map((row) => [row.path, row]));
    assert.equal(rawByPath.size, Object.values(STAGE_B_RAW_PATHS).length,
        'Stage B raw output set contains a duplicate or missing path.');
    const expectedRaw = serializeStageBRawOutputs({
        registeredWords: [],
        routeAttempts: run.result.records.routeAttempts,
        rejectedPrefixes: run.result.records.rejectedPrefixes,
        eligibleEndpoints: run.result.records.eligibleEndpoints,
        aliasPairs: run.result.records.aliasPairs,
        frameSupportFailures: run.result.records.frameSupportFailures,
        sourceClassCount: run.result.domain.sourceClassCount,
        eligibleAliasClassCount: run.result.domain.eligibleAliasClassCount,
        executionComplete: run.result.domain.complete
    });
    for (const output of expectedRaw) {
        const supplied = rawByPath.get(output.path);
        assert(supplied, `Missing raw output bytes: ${output.path}`);
        assert.equal(supplied.text, output.text, `Raw output bytes mismatch: ${output.path}`);
        assert.equal(canonicalJson(supplied.manifest), canonicalJson(output.manifest),
            `Raw output manifest mismatch: ${output.path}`);
        const manifest = run.result.rawOutputs.find((row) => row.path === output.path);
        assert(manifest && canonicalJson(manifest) === canonicalJson(output.manifest),
            `Raw output manifest mismatch: ${output.path}`);
    }

    preflightStageBExecutionOutputs(repositoryRoot);
    const root = resolve(repositoryRoot);
    const textByPath = new Map<string, string>([
        ...expectedRaw.map((output) => [output.path, output.text] as const),
        [STAGE_B_RESULT_PATH, canonicalJson(run.result) + '\n'],
        [STAGE_B_REPORT_PATH, run.report]
    ]);
    const plan: StageBPlannedOutput[] = EXACT_OUTPUT_PATHS.map((path) => {
        const text = textByPath.get(path);
        assert.notEqual(text, undefined, `Missing planned Stage B output bytes: ${path}`);
        const target = resolveStageBOutputPath(path, root);
        assert(!existsSync(target), `Stage B output became occupied before reservation: ${path}`);
        return { path, target, bytes: Buffer.from(text!, 'utf8') };
    });

    const reserved: StageBReservedOutput[] = [];
    try {
        for (const output of plan) {
            const fd = openSync(output.target, 'wx', 0o644);
            let descriptorStat;
            try {
                descriptorStat = fstatSync(fd);
            } catch (error) {
                closeSync(fd);
                throw error;
            }
            const record: StageBReservedOutput = {
                plan: output,
                fd,
                dev: descriptorStat.dev,
                ino: descriptorStat.ino,
                closed: false
            };
            // Track the exclusive-create identity before any path-side lookup
            // so every later pre-write failure enters the guarded cleanup.
            reserved.push(record);
            const pathStat = lstatSync(output.target);
            assert(pathStat.isFile() && !pathStat.isSymbolicLink() && pathStat.nlink === 1 &&
                pathStat.size === 0 && descriptorStat.isFile() && descriptorStat.nlink === 1 &&
                descriptorStat.size === 0 && descriptorStat.dev === record.dev &&
                descriptorStat.ino === record.ino && sameFileIdentity(pathStat, record),
            `Stage B reservation is not a new singly linked empty file: ${output.path}`);
        }
        // All seven paths are reserved before the first payload byte. Recheck
        // every parent/target and the raw directory while descriptors are held.
        for (const record of reserved) {
            assert.equal(resolveStageBOutputPath(record.plan.path, root), record.plan.target);
            assert(sameReservedFile(record),
                `Stage B reservation identity changed before publication: ${record.plan.path}`);
        }
        validateStageBRawDirectory('complete', root);
    } catch (error) {
        const cleanupFailures = [
            ...closeReservations(reserved),
            ...removeInvocationEmptyReservations(reserved)
        ];
        throw publicationError('Stage B all-target reservation failed before data writes', error, cleanupFailures);
    }

    let dataFailure: unknown;
    try {
        for (const record of reserved) {
            let offset = 0;
            while (offset < record.plan.bytes.length) {
                const written = writeSync(
                    record.fd,
                    record.plan.bytes,
                    offset,
                    record.plan.bytes.length - offset,
                    null
                );
                assert(written > 0, `Stage B output write made no progress: ${record.plan.path}`);
                offset += written;
            }
            assert.equal(fstatSync(record.fd).size, record.plan.bytes.length,
                `Stage B descriptor length mismatch: ${record.plan.path}`);
            fsyncSync(record.fd);
        }
    } catch (error) {
        dataFailure = error;
    }
    const closeFailures = closeReservations(reserved);
    if (dataFailure !== undefined || closeFailures.length > 0) {
        // Once any payload write begins, retain all reserved paths—including
        // partial material—for forensic recovery. Never unlink in this branch.
        throw publicationError(
            'Stage B data publication failed; partial outputs were retained',
            dataFailure ?? new Error('One or more output descriptors failed to close'),
            closeFailures
        );
    }

    for (const record of reserved) {
        assert.equal(resolveStageBOutputPath(record.plan.path, root), record.plan.target);
        assert(sameReservedFile(record),
            `Stage B output identity changed after publication: ${record.plan.path}`);
        const actual = readFileSync(record.plan.target);
        assert(actual.equals(record.plan.bytes),
            `Stage B output byte verification failed: ${record.plan.path}`);
    }
    validateStageBRawDirectory('complete', root);
}

/** Byte/parity verification helper. Publication verification additionally authenticates Git. */
export function verifyStageBStoredOutputBytes(repositoryRoot = STAGE_B_ROOT): StageBResult {
    validateStageBRawDirectory('complete', repositoryRoot);
    const resultPath = resolveStageBOutputPath(STAGE_B_RESULT_PATH, repositoryRoot);
    const result = validateStageBResult(parseStrictJson(readFileSync(resultPath, 'utf8')));
    const execution = {
        registeredWords: [],
        routeAttempts: result.records.routeAttempts,
        rejectedPrefixes: result.records.rejectedPrefixes,
        eligibleEndpoints: result.records.eligibleEndpoints,
        aliasPairs: result.records.aliasPairs,
        frameSupportFailures: result.records.frameSupportFailures,
        sourceClassCount: result.domain.sourceClassCount,
        eligibleAliasClassCount: result.domain.eligibleAliasClassCount,
        executionComplete: result.domain.complete
    };
    const serialized = serializeStageBRawOutputs(execution);
    for (const output of serialized) {
        assert.equal(
            readFileSync(resolveStageBOutputPath(output.path, repositoryRoot), 'utf8'),
            output.text,
            `Raw Stage B JSONL bytes drifted: ${output.path}`
        );
    }
    assert.equal(
        readFileSync(resolveStageBOutputPath(STAGE_B_REPORT_PATH, repositoryRoot), 'utf8'),
        renderStageBReport(result),
        'Stage B human report/result parity failed.'
    );
    return result;
}

/** Verifies stored bytes and independently re-authenticates their recorded source in Git. */
export function verifyStageBExecutionOutputs(repositoryRoot = STAGE_B_ROOT): StageBResult {
    const result = verifyStageBStoredOutputBytes(repositoryRoot);
    verifyStageBRecordedSourceIdentity(result.source, repositoryRoot);
    return result;
}

export function main(args = process.argv.slice(2)): number {
    try {
        const options = parseStageBArgs(args);
        if (options.mode === 'verify_result') {
            const result = verifyStageBExecutionOutputs();
            console.log(canonicalJson({
                status: result.hardGatesPass
                    ? 'verified_stopped_for_review'
                    : 'invalid_frame_or_support',
                sourceCommit: result.source.commit,
                sourceDigest: result.source.sourceDigest,
                resultDigest: result.resultDigest,
                hardGatesPass: result.hardGatesPass,
                stopStatement: result.stopStatement
            }));
            return result.hardGatesPass ? 0 : 1;
        }
        const run = runStageBExecution();
        writeStageBExecutionOutputs(run);
        console.log(canonicalJson({
            resultPath: STAGE_B_RESULT_PATH,
            reportPath: STAGE_B_REPORT_PATH,
            rawPaths: run.rawOutputs.map((row) => row.path),
            sourceCommit: run.result.source.commit,
            sourceDigest: run.result.source.sourceDigest,
            resultDigest: run.result.resultDigest,
            attemptedWordCount: run.result.domain.attemptedWordCount,
            eligibleEndpointCount: run.result.domain.naturallyReachableEndpointCount,
            eligiblePairCount: run.result.domain.eligiblePairCount,
            primaryOutcomeCounts: run.result.primaryOutcomeCounts,
            hardGatesPass: run.result.hardGatesPass,
            stopStatement: run.result.stopStatement
        }));
        return run.result.hardGatesPass ? 0 : 1;
    } catch (error) {
        console.error(`WP-015D2R Stage B stopped: ${error instanceof Error ? error.message : String(error)}`);
        return 1;
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.exitCode = main();
}
