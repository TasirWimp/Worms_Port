import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    assessPolicyTransport,
    canonicalD2LResult
} from '../analysis/crpm_world/navigation/assess-policy-transport';

const REPOSITORY_ROOT = resolve('.');
const OUTPUT_ROOT = resolve('test-results/crpm-world/d2l-policy-transport');
const DEFAULT_OUTPUT = resolve(OUTPUT_ROOT, 'policy-transport-result.json');

function parseArgs(args: readonly string[]): { outputPath: string } {
    if (args.length === 0) return { outputPath: DEFAULT_OUTPUT };
    if (args.length !== 2 || args[0] !== '--output' || args[1].startsWith('--')) {
        throw new TypeError('The D2L runner accepts only one optional --output <json-path> argument.');
    }
    return { outputPath: args[1] };
}

function assertNoLinkTraversal(target: string): void {
    const pathFromRepository = relative(REPOSITORY_ROOT, target);
    let cursor = REPOSITORY_ROOT;
    for (const segment of pathFromRepository.split(sep)) {
        cursor = resolve(cursor, segment);
        if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) {
            throw new RangeError('D2L output must not traverse symbolic links or junctions.');
        }
    }
}

export function resolveD2LOutputPath(value: string): string {
    if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
        throw new TypeError('D2L output must be a non-empty trimmed path.');
    }
    const target = resolve(value);
    const relativeTarget = relative(OUTPUT_ROOT, target);
    if (relativeTarget.startsWith('..') || relativeTarget === '..' ||
        resolve(OUTPUT_ROOT, relativeTarget) !== target) {
        throw new RangeError('D2L output must remain below test-results/crpm-world/d2l-policy-transport.');
    }
    if (!target.toLowerCase().endsWith('.json')) {
        throw new TypeError('D2L output must be a JSON file.');
    }
    assertNoLinkTraversal(target);
    return target;
}

export function runD2LPolicyTransport(outputPath = DEFAULT_OUTPUT): string {
    const encodedRaw = execFileSync(
        'python',
        ['-m', 'analysis.tactical_model.policy_transport_probe'],
        {
            cwd: process.cwd(),
            encoding: 'utf8',
            maxBuffer: 128 * 1024 * 1024,
            windowsHide: true
        }
    );
    const result = assessPolicyTransport(JSON.parse(encodedRaw));
    const target = resolveD2LOutputPath(outputPath);
    mkdirSync(dirname(target), { recursive: true });
    assertNoLinkTraversal(target);
    writeFileSync(target, `${canonicalD2LResult(result)}\n`, 'utf8');
    return target;
}

function main(args = process.argv.slice(2)): number {
    try {
        const options = parseArgs(args);
        const target = runD2LPolicyTransport(options.outputPath);
        const result = JSON.parse(readFileSync(target, 'utf8')) as {
            resultDigest: string;
            disposition: { classification: string };
        };
        console.log(`Wrote deterministic WP-015D2L result: ${relative(process.cwd(), target)}`);
        console.log(`Result digest: ${result.resultDigest}`);
        console.log(`Disposition: ${result.disposition.classification}`);
        return 0;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`WP-015D2L policy-transport falsifier failed: ${message}`);
        return 1;
    }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
    process.exitCode = main();
}
