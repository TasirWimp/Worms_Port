import { relative } from 'node:path';

import {
    defaultD2EI2OutputPath,
    executeD2EI2Request,
    readD2EI2RequestFile,
    writeD2EI2Result
} from '../analysis/crpm_world/admissions/i2/execute-request';
import { parseOrBuildD2EI2Request } from '../analysis/crpm_world/admissions/i2/schemas';

type CliOptions = Readonly<{ requestPath: string; outputPath?: string }>;

function parseArgs(args: readonly string[]): CliOptions {
    let requestPath: string | undefined;
    let outputPath: string | undefined;
    for (let index = 0; index < args.length; index += 1) {
        const flag = args[index];
        const value = args[index + 1];
        if ((flag !== '--request' && flag !== '--output') || value === undefined || value.startsWith('--')) {
            throw new TypeError(`Unknown or incomplete D2E I2 design-port argument ${flag}.`);
        }
        if (flag === '--request') {
            if (requestPath !== undefined) throw new TypeError('--request may be supplied only once.');
            requestPath = value;
        } else {
            if (outputPath !== undefined) throw new TypeError('--output may be supplied only once.');
            outputPath = value;
        }
        index += 1;
    }
    if (!requestPath) throw new TypeError('--request is required.');
    return { requestPath, outputPath };
}

export function main(args = process.argv.slice(2)): number {
    try {
        const options = parseArgs(args);
        const request = parseOrBuildD2EI2Request(readD2EI2RequestFile(options.requestPath));
        const result = executeD2EI2Request(request);
        const target = writeD2EI2Result(
            options.outputPath ?? defaultD2EI2OutputPath(request),
            result
        );
        console.log(`Wrote deterministic WP-015D2E result: ${relative(process.cwd(), target)}`);
        console.log(`Request digest: ${request.requestDigest}`);
        console.log(`Analytical export digest: ${result.analyticalEvidence.exportDigest}`);
        console.log(`Result digest: ${result.resultDigest}`);
        return 0;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`WP-015D2E I2 design port failed: ${message}`);
        return 1;
    }
}

process.exitCode = main();

