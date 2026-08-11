import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { canonicalJson, compareCanonicalText, sha256Digest } from './canonical';

export const CRPM_WORLD_REPOSITORY_ID = 'worms-port';

/**
 * Frozen implementation surface used to render and evaluate CRPM-world
 * evidence. Documentation, examples, fixtures, and generated outputs are
 * intentionally excluded so a later sealing commit can bind this code commit
 * without creating a commit self-reference.
 */
export const CRPM_WORLD_IMPLEMENTATION_PATHS = Object.freeze([
    'analysis/crpm_world/adapters/d2a_export.py',
    'analysis/crpm_world/adapters/v4-authority-adapter.ts',
    'analysis/crpm_world/canonical.ts',
    'analysis/crpm_world/cuts/d2a-cuts.ts',
    'analysis/crpm_world/cuts/registry.ts',
    'analysis/crpm_world/cuts/v4-cuts.ts',
    'analysis/crpm_world/design-port/execute-request.ts',
    'analysis/crpm_world/design-port/registry.ts',
    'analysis/crpm_world/design-port/validate-request.ts',
    'analysis/crpm_world/evaluation/evaluate.ts',
    'analysis/crpm_world/evaluation/schemas.ts',
    'analysis/crpm_world/implementation-lock.ts',
    'analysis/crpm_world/kernel/assess-quotient-transport.ts',
    'analysis/crpm_world/kernel/assess-return.ts',
    'analysis/crpm_world/kernel/compose-edges.ts',
    'analysis/crpm_world/kernel/derive-voyage-evidence.ts',
    'analysis/crpm_world/kernel/project-cut.ts',
    'analysis/crpm_world/kernel/residual-ledger.ts',
    'analysis/crpm_world/kernel/trace-voyage.ts',
    'analysis/crpm_world/schemas.ts',
    'analysis/crpm_world/types.ts',
    'scripts/run-crpm-world-design.ts'
].sort(compareCanonicalText));

export type ExecutionReceiptSourceLock = Readonly<{
    repositoryId: string;
    commit: string;
    paths: readonly string[];
}>;

export type ExecutionReceiptAdapter = Readonly<{
    id: string;
    version: number;
}>;

export type RegisteredExecutionReceiptBase = Readonly<{
    schemaVersion: 1;
    repositoryId: typeof CRPM_WORLD_REPOSITORY_ID;
    implementationCommit: string;
    implementationTree: string;
    implementationPaths: readonly string[];
    implementationFileBlobs: readonly Readonly<{ path: string; blobOid: string }>[];
    implementationBundleDigest: string;
    adapterVersions: readonly ExecutionReceiptAdapter[];
    profileVersion: number;
    requestSchemaVersion: number;
    resultSchemaVersion: number;
    sourceLocks: readonly ExecutionReceiptSourceLock[];
    requestDigest: string;
}>;

function git(repositoryRoot: string, args: readonly string[]): string {
    return execFileSync('git', args, {
        cwd: repositoryRoot,
        encoding: 'utf8',
        windowsHide: true
    }).trim();
}

function repositoryRoot(): string {
    return git(process.cwd(), ['rev-parse', '--show-toplevel']);
}

/**
 * Resolve the newest commit touching the frozen implementation surface and
 * fail closed unless every current implementation file matches that commit.
 * This lets a later documentation-only commit record the lock without changing
 * the implementation identity.
 */
export function resolveRegisteredImplementationLock(): Omit<RegisteredExecutionReceiptBase,
    'adapterVersions' | 'profileVersion' | 'requestSchemaVersion' | 'resultSchemaVersion' | 'sourceLocks' | 'requestDigest'> {
    const root = repositoryRoot();
    const implementationCommit = git(root, [
        'log', '-1', '--format=%H', '--', ...CRPM_WORLD_IMPLEMENTATION_PATHS
    ]);
    if (!/^[0-9a-f]{40}$/.test(implementationCommit)) {
        throw new Error('Unable to resolve the frozen CRPM-world implementation commit.');
    }
    const implementationTree = git(root, ['show', '-s', '--format=%T', implementationCommit]);
    const implementationFileBlobs = CRPM_WORLD_IMPLEMENTATION_PATHS.map((path) => {
        const committedBlob = git(root, ['rev-parse', `${implementationCommit}:${path}`]);
        const currentBlob = git(root, ['hash-object', resolve(root, path)]);
        if (committedBlob !== currentBlob) {
            throw new Error(`CRPM-world implementation path is not frozen at ${implementationCommit}: ${path}`);
        }
        // Reading also fails closed on a missing/inaccessible implementation path.
        readFileSync(resolve(root, path));
        return { path, blobOid: committedBlob };
    });
    const implementationBundleDigest = sha256Digest({
        repositoryId: CRPM_WORLD_REPOSITORY_ID,
        implementationCommit,
        implementationTree,
        implementationFileBlobs
    });
    return Object.freeze({
        schemaVersion: 1 as const,
        repositoryId: CRPM_WORLD_REPOSITORY_ID,
        implementationCommit,
        implementationTree,
        implementationPaths: [...CRPM_WORLD_IMPLEMENTATION_PATHS],
        implementationFileBlobs,
        implementationBundleDigest
    });
}

export function buildRegisteredExecutionReceiptBase(input: Readonly<{
    adapterVersions: readonly ExecutionReceiptAdapter[];
    profileVersion: number;
    requestSchemaVersion: number;
    resultSchemaVersion: number;
    sourceLocks: readonly ExecutionReceiptSourceLock[];
    requestDigest: string;
}>): RegisteredExecutionReceiptBase {
    const implementation = resolveRegisteredImplementationLock();
    return Object.freeze({
        ...implementation,
        adapterVersions: [...input.adapterVersions]
            .sort((left, right) => compareCanonicalText(canonicalJson(left), canonicalJson(right))),
        profileVersion: input.profileVersion,
        requestSchemaVersion: input.requestSchemaVersion,
        resultSchemaVersion: input.resultSchemaVersion,
        sourceLocks: input.sourceLocks.map((lock) => ({ ...lock, paths: [...lock.paths] })),
        requestDigest: input.requestDigest
    });
}
