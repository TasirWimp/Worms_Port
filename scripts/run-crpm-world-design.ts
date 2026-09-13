import { relative } from 'node:path';

import {
    defaultWorldDesignOutputPath,
    executeWorldDesignRequest,
    readWorldDesignRequestFile,
    writeWorldDesignResult
} from '../analysis/crpm_world/design-port/execute-request';
import { parseOrBuildOfflineWorldDesignRequest } from '../analysis/crpm_world/design-port/validate-request';

type CliOptions = Readonly<{ requestPath: string; outputPath?: string }>;

function parseArgs(args: readonly string[]): CliOptions {
    if (args.length > 0 && args.every((argument) => !argument.startsWith('--'))) {
        if (args.length > 2) throw new TypeError('Expected only request and optional output paths.');
        return { requestPath: args[0], outputPath: args[1] };
    }
    let requestPath: string | undefined;
    let outputPath: string | undefined;
    for (let index = 0; index < args.length; index += 1) {
        const flag = args[index];
        const value = args[index + 1];
        if ((flag !== '--request' && flag !== '--output') || value === undefined || value.startsWith('--')) {
            throw new TypeError(`Unknown or incomplete CRPM-world design CLI argument ${flag}.`);
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
        const rawRequest = readWorldDesignRequestFile(options.requestPath);
        const request = parseOrBuildOfflineWorldDesignRequest(rawRequest);
        const result = executeWorldDesignRequest(request);
        const target = writeWorldDesignResult(
            options.outputPath ?? defaultWorldDesignOutputPath(request),
            result
        );
        console.log(`Wrote deterministic CRPM-world result: ${relative(process.cwd(), target)}`);
        console.log(`Request digest: ${request.requestDigest}`);
        console.log(`Result digest: ${result.resultDigest}`);
        return 0;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`CRPM-world design failed: ${message}`);
        return 1;
    }
}

process.exitCode = main();
