import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    assessTacticalOrderAtlas,
    canonicalD2MResult
} from '../analysis/crpm_world/navigation/assess-tactical-order-atlas';
import { assessCocoonVoyages } from '../analysis/crpm_world/navigation/assess-cocoon-voyages';
import { assessPolicyChoices } from '../analysis/crpm_world/navigation/assess-policy-choices';
import { assessPolicyTransport } from '../analysis/crpm_world/navigation/assess-policy-transport';

const REPOSITORY_ROOT = resolve('.');
const OUTPUT_ROOT = resolve('test-results/crpm-world/d2m-tactical-order-atlas');
const DEFAULT_OUTPUT = resolve(OUTPUT_ROOT, 'tactical-order-atlas-result.json');

function parseArgs(args: readonly string[]): { outputPath: string } {
    if (args.length === 0) return { outputPath: DEFAULT_OUTPUT };
    if (args.length !== 2 || args[0] !== '--output' || args[1].startsWith('--')) {
        throw new TypeError('The D2M runner accepts only one optional --output <json-path> argument.');
    }
    return { outputPath: args[1] };
}

function assertNoLinkTraversal(target: string): void {
    const pathFromRepository = relative(REPOSITORY_ROOT, target);
    let cursor = REPOSITORY_ROOT;
    for (const segment of pathFromRepository.split(sep)) {
        cursor = resolve(cursor, segment);
        if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) {
            throw new RangeError('D2M output must not traverse symbolic links or junctions.');
        }
    }
}

export function resolveD2MOutputPath(value: string): string {
    if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
        throw new TypeError('D2M output must be a non-empty trimmed path.');
    }
    const target = resolve(value);
    const relativeTarget = relative(OUTPUT_ROOT, target);
    if (relativeTarget.startsWith('..') || relativeTarget === '..' ||
        resolve(OUTPUT_ROOT, relativeTarget) !== target) {
        throw new RangeError('D2M output must remain below test-results/crpm-world/d2m-tactical-order-atlas.');
    }
    if (!target.toLowerCase().endsWith('.json')) {
        throw new TypeError('D2M output must be a JSON file.');
    }
    assertNoLinkTraversal(target);
    return target;
}

function runProbe(moduleName: string): unknown {
    const encoded = execFileSync('python', ['-m', moduleName], {
        cwd: process.cwd(),
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        windowsHide: true
    });
    return JSON.parse(encoded);
}

export function runD2MTacticalOrderAtlas(outputPath = DEFAULT_OUTPUT): string {
    const d2iResult = assessCocoonVoyages(
        runProbe('analysis.tactical_model.reachable_carrier_probe')
    );
    const d2kRaw = runProbe('analysis.tactical_model.policy_choice_relation_probe');
    const d2kResult = assessPolicyChoices(d2kRaw);
    const d2lResult = assessPolicyTransport(
        runProbe('analysis.tactical_model.policy_transport_probe')
    );
    const result = assessTacticalOrderAtlas({ d2iResult, d2kRaw, d2kResult, d2lResult });
    const target = resolveD2MOutputPath(outputPath);
    mkdirSync(dirname(target), { recursive: true });
    assertNoLinkTraversal(target);
    writeFileSync(target, `${canonicalD2MResult(result)}\n`, 'utf8');
    return target;
}

function main(args = process.argv.slice(2)): number {
    try {
        const options = parseArgs(args);
        const target = runD2MTacticalOrderAtlas(options.outputPath);
        const result = JSON.parse(readFileSync(target, 'utf8')) as {
            resultDigest: string;
            globalAssembly: { classification: string };
        };
        console.log(`Wrote deterministic WP-015D2M result: ${relative(process.cwd(), target)}`);
        console.log(`Result digest: ${result.resultDigest}`);
        console.log(`Global assembly: ${result.globalAssembly.classification}`);
        return 0;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`WP-015D2M tactical-order atlas failed: ${message}`);
        return 1;
    }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
    process.exitCode = main();
}
