import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { canonicalJson, compareCanonicalText, sha256Digest } from './canonical';

export const CRPM_WORLD_REPOSITORY_ID = 'worms-port';
export const CRPM_WORLD_APPROVED_LOCK_PATH = 'docs/evidence/wp-015d2b-implementation-lock.json';

export const REGISTERED_EXECUTION_ADAPTER_CHAINS = Object.freeze({
    v4_authority: Object.freeze([
        Object.freeze({ id: 'v4_authority', version: 2 }),
        Object.freeze({ id: 'nimble-knots-simulation-authority-adapter', version: 2 })
    ]),
    d2a_tactical: Object.freeze([
        Object.freeze({ id: 'd2a_tactical', version: 2 }),
        Object.freeze({ id: 'd2a_analytical_export', version: 2 })
    ])
});

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
    'analysis/crpm_world/tsconfig.json',
    'package-lock.json',
    'package.json',
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

type ApprovedImplementationLock = Readonly<{
    schemaVersion: 1;
    repositoryId: typeof CRPM_WORLD_REPOSITORY_ID;
    implementationCommit: string;
    implementationTree: string;
    implementationPaths: readonly string[];
    implementationFileBlobs: readonly Readonly<{ path: string; blobOid: string }>[];
    implementationBundleDigest: string;
    registeredAdapterChains: typeof REGISTERED_EXECUTION_ADAPTER_CHAINS;
    profileVersion: number;
    requestSchemaVersion: number;
    resultSchemaVersion: number;
    sameRepositorySourceFileBlobs: readonly Readonly<{
        commit: string;
        path: string;
        blobOid: string;
    }>[];
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

function assertGitOid(value: unknown, label: string): asserts value is string {
    if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) {
        throw new Error(`Approved CRPM-world lock has an invalid ${label}.`);
    }
}

function readApprovedImplementationLock(root: string): ApprovedImplementationLock {
    const lockPath = resolve(root, CRPM_WORLD_APPROVED_LOCK_PATH);
    const parsed = JSON.parse(readFileSync(lockPath, 'utf8')) as Record<string, unknown>;
    const expectedKeys = [
        'implementationBundleDigest', 'implementationCommit', 'implementationFileBlobs',
        'implementationPaths', 'implementationTree', 'profileVersion', 'registeredAdapterChains',
        'repositoryId', 'requestSchemaVersion', 'resultSchemaVersion', 'sameRepositorySourceFileBlobs',
        'schemaVersion'
    ].sort(compareCanonicalText);
    if (canonicalJson(Object.keys(parsed).sort(compareCanonicalText)) !== canonicalJson(expectedKeys)) {
        throw new Error('Approved CRPM-world implementation lock contains an unknown or missing field.');
    }
    if (parsed.schemaVersion !== 1 || parsed.repositoryId !== CRPM_WORLD_REPOSITORY_ID ||
        !Array.isArray(parsed.implementationPaths) || !Array.isArray(parsed.implementationFileBlobs) ||
        !Array.isArray(parsed.sameRepositorySourceFileBlobs) ||
        typeof parsed.implementationBundleDigest !== 'string' ||
        typeof parsed.profileVersion !== 'number' || typeof parsed.requestSchemaVersion !== 'number' ||
        typeof parsed.resultSchemaVersion !== 'number') {
        throw new Error('Approved CRPM-world implementation lock has an invalid shape.');
    }
    assertGitOid(parsed.implementationCommit, 'implementation commit');
    assertGitOid(parsed.implementationTree, 'implementation tree');
    const lock = parsed as unknown as ApprovedImplementationLock;
    if (canonicalJson(lock.registeredAdapterChains) !== canonicalJson(REGISTERED_EXECUTION_ADAPTER_CHAINS)) {
        throw new Error('Approved CRPM-world lock does not contain the exact registered adapter chains.');
    }
    if (canonicalJson(lock.implementationPaths) !== canonicalJson(CRPM_WORLD_IMPLEMENTATION_PATHS)) {
        throw new Error('Approved CRPM-world lock does not contain the exact closed implementation path set.');
    }
    if (lock.profileVersion !== 2 || lock.requestSchemaVersion !== 2 || lock.resultSchemaVersion !== 3) {
        throw new Error('Approved CRPM-world lock contains unsupported contract versions.');
    }
    const blobPaths = lock.implementationFileBlobs.map((file) => file.path);
    if (canonicalJson(blobPaths) !== canonicalJson(lock.implementationPaths)) {
        throw new Error('Approved CRPM-world lock blob order must exactly match its implementation paths.');
    }
    for (const file of lock.implementationFileBlobs) {
        if (typeof file.path !== 'string') throw new Error('Approved CRPM-world lock has an invalid implementation path.');
        assertGitOid(file.blobOid, `blob for ${file.path}`);
    }
    if (sha256Digest({
        repositoryId: lock.repositoryId,
        implementationCommit: lock.implementationCommit,
        implementationTree: lock.implementationTree,
        implementationFileBlobs: lock.implementationFileBlobs
    }) !== lock.implementationBundleDigest) {
        throw new Error('Approved CRPM-world lock has an invalid implementation bundle digest.');
    }
    const sourceIdentities = new Set<string>();
    for (const file of lock.sameRepositorySourceFileBlobs) {
        if (typeof file.path !== 'string') throw new Error('Approved CRPM-world lock has an invalid source path.');
        assertGitOid(file.commit, `source commit for ${file.path}`);
        assertGitOid(file.blobOid, `source blob for ${file.path}`);
        const identity = `${file.commit}:${file.path}`;
        if (sourceIdentities.has(identity)) throw new Error(`Approved CRPM-world lock duplicates source identity ${identity}.`);
        sourceIdentities.add(identity);
    }

    const lockCommit = git(root, ['log', '-1', '--format=%H', '--', CRPM_WORLD_APPROVED_LOCK_PATH]);
    const lockParent = git(root, ['rev-parse', `${lockCommit}^`]);
    if (lockParent !== lock.implementationCommit) {
        throw new Error('Approved CRPM-world lock must be committed directly after its implementation commit.');
    }
    const committedLockBlob = git(root, ['rev-parse', `${lockCommit}:${CRPM_WORLD_APPROVED_LOCK_PATH}`]);
    const currentLockBlob = git(root, ['hash-object', lockPath]);
    if (committedLockBlob !== currentLockBlob) {
        throw new Error('Approved CRPM-world implementation lock differs from its committed evidence blob.');
    }
    git(root, ['merge-base', '--is-ancestor', lockCommit, 'HEAD']);
    return lock;
}

function exactAdapterChain(adapters: readonly ExecutionReceiptAdapter[]): boolean {
    return Object.values(REGISTERED_EXECUTION_ADAPTER_CHAINS).some((chain) =>
        canonicalJson(chain) === canonicalJson(adapters)
    );
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
        adapterVersions: [...input.adapterVersions],
        profileVersion: input.profileVersion,
        requestSchemaVersion: input.requestSchemaVersion,
        resultSchemaVersion: input.resultSchemaVersion,
        sourceLocks: input.sourceLocks.map((lock) => ({ ...lock, paths: [...lock.paths] })),
        requestDigest: input.requestDigest
    });
}

/**
 * Authenticate a serialized receipt against the approved evidence lock and
 * the exact Git objects available in this checkout. Internal digest
 * consistency alone is deliberately insufficient.
 */
export function verifyRegisteredExecutionReceipt(receipt: RegisteredExecutionReceiptBase): void {
    const root = repositoryRoot();
    const approved = readApprovedImplementationLock(root);
    if (!exactAdapterChain(receipt.adapterVersions)) {
        throw new Error('Execution receipt does not contain one exact registered adapter chain.');
    }
    if (receipt.profileVersion !== approved.profileVersion ||
        receipt.requestSchemaVersion !== approved.requestSchemaVersion ||
        receipt.resultSchemaVersion !== approved.resultSchemaVersion) {
        throw new Error('Execution receipt versions do not match the approved implementation lock.');
    }
    for (const [field, actual, expected] of [
        ['implementationCommit', receipt.implementationCommit, approved.implementationCommit],
        ['implementationTree', receipt.implementationTree, approved.implementationTree],
        ['implementationPaths', receipt.implementationPaths, approved.implementationPaths],
        ['implementationFileBlobs', receipt.implementationFileBlobs, approved.implementationFileBlobs],
        ['implementationBundleDigest', receipt.implementationBundleDigest, approved.implementationBundleDigest]
    ] as const) {
        if (canonicalJson(actual) !== canonicalJson(expected)) {
            throw new Error(`Execution receipt ${field} does not match the approved implementation lock.`);
        }
    }

    git(root, ['cat-file', '-e', `${receipt.implementationCommit}^{commit}`]);
    const actualTree = git(root, ['show', '-s', '--format=%T', receipt.implementationCommit]);
    if (actualTree !== receipt.implementationTree) {
        throw new Error('Execution receipt tree is not the tree of its implementation commit.');
    }
    for (const file of receipt.implementationFileBlobs) {
        const committedBlob = git(root, ['rev-parse', `${receipt.implementationCommit}:${file.path}`]);
        const currentBlob = git(root, ['hash-object', resolve(root, file.path)]);
        if (committedBlob !== file.blobOid || currentBlob !== file.blobOid) {
            throw new Error(`Execution receipt blob does not authenticate ${file.path}.`);
        }
    }

    for (const sourceLock of receipt.sourceLocks.filter((lock) => lock.repositoryId === CRPM_WORLD_REPOSITORY_ID)) {
        git(root, ['cat-file', '-e', `${sourceLock.commit}^{commit}`]);
        for (const path of sourceLock.paths) {
            const registered = approved.sameRepositorySourceFileBlobs.find((file) =>
                file.commit === sourceLock.commit && file.path === path
            );
            if (!registered) {
                throw new Error(`Same-repository executable source lock is not approved: ${sourceLock.commit}:${path}`);
            }
            const committedBlob = git(root, ['rev-parse', `${sourceLock.commit}:${path}`]);
            const currentBlob = git(root, ['hash-object', resolve(root, path)]);
            if (committedBlob !== registered.blobOid || currentBlob !== registered.blobOid) {
                throw new Error(`Same-repository executable source does not match its approved Git blob: ${path}`);
            }
        }
    }
}
