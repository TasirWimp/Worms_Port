import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    assessReachableCarriers,
    canonicalD2HResult
} from '../analysis/crpm_world/navigation/assess-reachable-carriers';

const OUTPUT_ROOT = resolve('test-results/crpm-world/d2h-reachable-carriers');
const DEFAULT_OUTPUT = resolve(OUTPUT_ROOT, 'reachable-carrier-result.json');

function parseArgs(args: readonly string[]): { outputPath: string } {
    if (args.length === 0) return { outputPath: DEFAULT_OUTPUT };
    if (args.length !== 2 || args[0] !== '--output' || args[1].startsWith('--')) {
        throw new TypeError('The D2H runner accepts only one optional --output <json-path> argument.');
    }
    return { outputPath: args[1] };
}

export function resolveD2HOutputPath(value: string): string {
    const target = resolve(value);
    const relativeTarget = relative(OUTPUT_ROOT, target);
    if (relativeTarget.startsWith('..') || relativeTarget === '..' || resolve(OUTPUT_ROOT, relativeTarget) !== target) {
        throw new RangeError('D2H output must remain below test-results/crpm-world/d2h-reachable-carriers.');
    }
    if (!target.toLowerCase().endsWith('.json')) {
        throw new TypeError('D2H output must be a JSON file.');
    }
    return target;
}

export function runD2HProbe(outputPath = DEFAULT_OUTPUT): string {
    const encodedRaw = execFileSync(
        'python',
        ['-m', 'analysis.tactical_model.reachable_carrier_probe'],
        {
            cwd: process.cwd(),
            encoding: 'utf8',
            maxBuffer: 128 * 1024 * 1024,
            windowsHide: true
        }
    );
    const result = assessReachableCarriers(JSON.parse(encodedRaw));
    const target = resolveD2HOutputPath(outputPath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${canonicalD2HResult(result)}\n`, 'utf8');
    return target;
}

function main(args = process.argv.slice(2)): number {
    try {
        const options = parseArgs(args);
        const target = runD2HProbe(options.outputPath);
        const result = JSON.parse(readFileSync(target, 'utf8')) as {
            resultDigest: string;
            navigationWake: { classification: string };
        };
        console.log(`Wrote deterministic WP-015D2H result: ${relative(process.cwd(), target)}`);
        console.log(`Result digest: ${result.resultDigest}`);
        console.log(`Navigation wake: ${result.navigationWake.classification}`);
        return 0;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`WP-015D2H reachable-carrier probe failed: ${message}`);
        return 1;
    }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
    process.exitCode = main();
}
