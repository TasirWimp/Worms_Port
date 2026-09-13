import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    assessPolicyChoices,
    canonicalD2KResult
} from '../analysis/crpm_world/navigation/assess-policy-choices';

const OUTPUT_ROOT = resolve('test-results/crpm-world/d2k-policy-choice');
const DEFAULT_OUTPUT = resolve(OUTPUT_ROOT, 'policy-choice-relation-result.json');
const REPOSITORY_ROOT = resolve('.');

function parseArgs(args: readonly string[]): { outputPath: string } {
    if (args.length === 0) return { outputPath: DEFAULT_OUTPUT };
    if (args.length !== 2 || args[0] !== '--output' || args[1].startsWith('--')) {
        throw new TypeError('The D2K runner accepts only one optional --output <json-path> argument.');
    }
    return { outputPath: args[1] };
}

export function resolveD2KOutputPath(value: string): string {
    if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
        throw new TypeError('D2K output must be a non-empty trimmed path.');
    }
    const target = resolve(value);
    const relativeTarget = relative(OUTPUT_ROOT, target);
    if (relativeTarget.startsWith('..') || relativeTarget === '..' ||
        resolve(OUTPUT_ROOT, relativeTarget) !== target) {
        throw new RangeError('D2K output must remain below test-results/crpm-world/d2k-policy-choice.');
    }
    if (!target.toLowerCase().endsWith('.json')) {
        throw new TypeError('D2K output must be a JSON file.');
    }
    assertNoLinkTraversal(target);
    return target;
}

function assertNoLinkTraversal(target: string): void {
    const pathFromRepository = relative(REPOSITORY_ROOT, target);
    let cursor = REPOSITORY_ROOT;
    for (const segment of pathFromRepository.split(sep)) {
        cursor = resolve(cursor, segment);
        if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) {
            throw new RangeError('D2K output must not traverse symbolic links or junctions.');
        }
    }
}

export function runD2KPolicyChoiceAudit(outputPath = DEFAULT_OUTPUT): string {
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
    const result = assessPolicyChoices(JSON.parse(encodedRaw));
    const target = resolveD2KOutputPath(outputPath);
    mkdirSync(dirname(target), { recursive: true });
    assertNoLinkTraversal(target);
    writeFileSync(target, `${canonicalD2KResult(result)}\n`, 'utf8');
    return target;
}

function main(args = process.argv.slice(2)): number {
    try {
        const options = parseArgs(args);
        const target = runD2KPolicyChoiceAudit(options.outputPath);
        const result = JSON.parse(readFileSync(target, 'utf8')) as {
            resultDigest: string;
            navigationWake: { classification: string };
        };
        console.log(`Wrote deterministic WP-015D2K result: ${relative(process.cwd(), target)}`);
        console.log(`Result digest: ${result.resultDigest}`);
        console.log(`Navigation wake: ${result.navigationWake.classification}`);
        return 0;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`WP-015D2K policy-choice relation audit failed: ${message}`);
        return 1;
    }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
    process.exitCode = main();
}
