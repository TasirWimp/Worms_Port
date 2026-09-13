import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { canonicalJson, compareCanonicalText, sha256Digest } from '../../canonical';
import {
    D2EImplementationReceiptBaseSchema,
    type D2EImplementationReceiptBase
} from './schemas';
import {
    D2E_ANALYTICAL_ADAPTER,
    D2E_PROFILE_VERSION,
    D2E_REQUEST_SCHEMA_VERSION,
    D2E_RESULT_SCHEMA_VERSION,
    D2E_SOURCE_COMMIT,
    D2E_WORLD_ADAPTER
} from './registry';

export const D2E_APPROVED_IMPLEMENTATION_LOCK_PATH = 'docs/evidence/wp-015d2e-implementation-lock.json';

export const D2E_IMPLEMENTATION_PATHS = Object.freeze([
    'analysis/crpm_world/adapters/d2a_export.py',
    'analysis/crpm_world/adapters/d2e_i2_export.py',
    'analysis/crpm_world/admissions/i2/cut.ts',
    'analysis/crpm_world/admissions/i2/execute-request.ts',
    'analysis/crpm_world/admissions/i2/implementation-lock.ts',
    'analysis/crpm_world/admissions/i2/registry.ts',
    'analysis/crpm_world/admissions/i2/schemas.ts',
    'analysis/crpm_world/canonical.ts',
    'analysis/crpm_world/kernel/compose-edges.ts',
    'analysis/crpm_world/kernel/derive-voyage-evidence.ts',
    'analysis/crpm_world/kernel/residual-ledger.ts',
    'analysis/crpm_world/kernel/trace-voyage.ts',
    'analysis/crpm_world/schemas.ts',
    'analysis/crpm_world/types.ts',
    'package-lock.json',
    'scripts/run-crpm-world-design-i2.ts'
].sort(compareCanonicalText));

type ApprovedD2ELock = Readonly<{
    schemaVersion: 1;
    repositoryId: 'worms-port';
    implementationCommit: string;
    implementationTree: string;
    implementationPaths: readonly string[];
    implementationFileBlobs: readonly Readonly<{ path: string; blobOid: string }>[];
    implementationBundleDigest: string;
    registeredAdapterChain: readonly [typeof D2E_WORLD_ADAPTER, typeof D2E_ANALYTICAL_ADAPTER];
    profileVersion: typeof D2E_PROFILE_VERSION;
    requestSchemaVersion: typeof D2E_REQUEST_SCHEMA_VERSION;
    resultSchemaVersion: typeof D2E_RESULT_SCHEMA_VERSION;
    sourceCommit: typeof D2E_SOURCE_COMMIT;
}>;

function git(root: string, args: readonly string[]): string {
    return execFileSync('git', args, {
        cwd: root,
        encoding: 'utf8',
        windowsHide: true
    }).trim();
}

function repositoryRoot(): string {
    return git(process.cwd(), ['rev-parse', '--show-toplevel']);
}

function assertGitOid(value: unknown, label: string): asserts value is string {
    if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) {
        throw new Error(`D2E implementation lock has an invalid ${label}.`);
    }
}

function readApprovedLock(root: string): ApprovedD2ELock {
    const path = resolve(root, D2E_APPROVED_IMPLEMENTATION_LOCK_PATH);
    if (!existsSync(path)) {
        throw new Error(
            'WP-015D2E implementation is not sealed: commit the implementation paths, then add the approved D2E implementation lock in the directly following evidence commit.'
        );
    }
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    const expectedKeys = [
        'implementationBundleDigest', 'implementationCommit', 'implementationFileBlobs',
        'implementationPaths', 'implementationTree', 'profileVersion', 'registeredAdapterChain',
        'repositoryId', 'requestSchemaVersion', 'resultSchemaVersion', 'schemaVersion', 'sourceCommit'
    ].sort(compareCanonicalText);
    if (canonicalJson(Object.keys(parsed).sort(compareCanonicalText)) !== canonicalJson(expectedKeys)) {
        throw new Error('D2E approved implementation lock has an unknown or missing field.');
    }
    const lock = parsed as unknown as ApprovedD2ELock;
    assertGitOid(lock.implementationCommit, 'implementation commit');
    assertGitOid(lock.implementationTree, 'implementation tree');
    if (lock.schemaVersion !== 1 || lock.repositoryId !== 'worms-port' ||
        lock.profileVersion !== D2E_PROFILE_VERSION ||
        lock.requestSchemaVersion !== D2E_REQUEST_SCHEMA_VERSION ||
        lock.resultSchemaVersion !== D2E_RESULT_SCHEMA_VERSION ||
        lock.sourceCommit !== D2E_SOURCE_COMMIT) {
        throw new Error('D2E approved implementation lock has unsupported identities or versions.');
    }
    if (canonicalJson(lock.registeredAdapterChain) !== canonicalJson([
        D2E_WORLD_ADAPTER,
        D2E_ANALYTICAL_ADAPTER
    ])) {
        throw new Error('D2E approved implementation lock has the wrong adapter chain.');
    }
    if (canonicalJson(lock.implementationPaths) !== canonicalJson(D2E_IMPLEMENTATION_PATHS) ||
        canonicalJson(lock.implementationFileBlobs.map((file) => file.path)) !== canonicalJson(D2E_IMPLEMENTATION_PATHS)) {
        throw new Error('D2E approved implementation lock has the wrong path/blob set.');
    }
    for (const file of lock.implementationFileBlobs) {
        assertGitOid(file.blobOid, `blob for ${file.path}`);
    }
    const expectedDigest = sha256Digest({
        repositoryId: lock.repositoryId,
        implementationCommit: lock.implementationCommit,
        implementationTree: lock.implementationTree,
        implementationFileBlobs: lock.implementationFileBlobs
    });
    if (expectedDigest !== lock.implementationBundleDigest) {
        throw new Error('D2E approved implementation bundle digest is invalid.');
    }

    const lockCommit = git(root, ['log', '-1', '--format=%H', '--', D2E_APPROVED_IMPLEMENTATION_LOCK_PATH]);
    const lockParent = git(root, ['rev-parse', `${lockCommit}^`]);
    if (lockParent !== lock.implementationCommit) {
        throw new Error('D2E approved lock must be committed directly after its implementation commit.');
    }
    const committedLockBlob = git(root, ['rev-parse', `${lockCommit}:${D2E_APPROVED_IMPLEMENTATION_LOCK_PATH}`]);
    if (committedLockBlob !== git(root, ['hash-object', path])) {
        throw new Error('D2E approved implementation lock differs from its committed evidence blob.');
    }
    git(root, ['merge-base', '--is-ancestor', lockCommit, 'HEAD']);
    return lock;
}

export function buildD2EImplementationReceiptBase(
    requestDigest: string,
    analyticalExportDigest: string
): D2EImplementationReceiptBase {
    const root = repositoryRoot();
    const lock = readApprovedLock(root);
    for (const file of lock.implementationFileBlobs) {
        const committedBlob = git(root, ['rev-parse', `${lock.implementationCommit}:${file.path}`]);
        const currentBlob = git(root, ['hash-object', resolve(root, file.path)]);
        if (committedBlob !== file.blobOid || currentBlob !== file.blobOid) {
            throw new Error(`D2E implementation path is not sealed at ${lock.implementationCommit}: ${file.path}`);
        }
    }
    return D2EImplementationReceiptBaseSchema.parse({
        schemaVersion: 1,
        repositoryId: 'worms-port',
        implementationCommit: lock.implementationCommit,
        implementationTree: lock.implementationTree,
        implementationPaths: lock.implementationPaths,
        implementationFileBlobs: lock.implementationFileBlobs,
        implementationBundleDigest: lock.implementationBundleDigest,
        adapterVersions: [D2E_WORLD_ADAPTER, D2E_ANALYTICAL_ADAPTER],
        profileVersion: D2E_PROFILE_VERSION,
        requestSchemaVersion: D2E_REQUEST_SCHEMA_VERSION,
        resultSchemaVersion: D2E_RESULT_SCHEMA_VERSION,
        sourceCommit: D2E_SOURCE_COMMIT,
        requestDigest,
        analyticalExportDigest
    });
}

export function assertD2EImplementationSealed(): void {
    const root = repositoryRoot();
    const lock = readApprovedLock(root);
    for (const file of lock.implementationFileBlobs) {
        const committedBlob = git(root, ['rev-parse', `${lock.implementationCommit}:${file.path}`]);
        const currentBlob = git(root, ['hash-object', resolve(root, file.path)]);
        if (committedBlob !== file.blobOid || currentBlob !== file.blobOid) {
            throw new Error(`D2E implementation path is not sealed at ${lock.implementationCommit}: ${file.path}`);
        }
    }
}
