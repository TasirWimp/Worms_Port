import fs from 'node:fs/promises';
import path from 'node:path';

import { V10_R8_PROMPT_VERSION } from '../shared/strategic-voyage-v10-r8';
import { WP027_GEMINI_MODEL_ID } from '../server/src/simulation/gemini-strategy-provider-v10-r8';
import { loomkeeperStrategyRuntimeFromEnvironmentV10R8 } from '../server/src/simulation/loomkeeper-strategy-config-v10-r8';
import {
    createWp027ProbeFixturesV10R8,
    evaluateWp027ProbeV10R8,
    summarizeWp027ProbesV10R8
} from '../server/src/simulation/loomkeeper-strategy-probes-v10-r8';

async function main(): Promise<void> {
    const runtime = loomkeeperStrategyRuntimeFromEnvironmentV10R8(process.env, fetch, () => {});
    if (runtime.mode !== 'gemini-shadow' || !runtime.strategicAdapter) {
        throw new Error('WP-027 probes require LOOMKEEPER_PROVIDER=gemini-shadow.');
    }
    const fixtures = createWp027ProbeFixturesV10R8();
    const results = [];
    for (let index = 0; index < fixtures.length; index += 1) {
        const fixture = fixtures[index];
        const providerResult = await runtime.strategicAdapter.request(
            `wp027_shadow_probe_${String(index + 1).padStart(2, '0')}`,
            fixture.boundary.brief,
            0
        );
        results.push(evaluateWp027ProbeV10R8(fixture, providerResult));
    }
    const report = summarizeWp027ProbesV10R8(results);
    const artifact = Object.freeze({
        generatedAt: new Date().toISOString(),
        modelId: WP027_GEMINI_MODEL_ID,
        promptVersion: V10_R8_PROMPT_VERSION,
        fixtures: fixtures.map(fixture => Object.freeze({
            id: fixture.id,
            ...fixture.boundary.evidence(),
            reviewQuestion: fixture.reviewQuestion
        })),
        ...report
    });
    const output = path.resolve('test-results/wp027-shadow-probes.json');
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
        artifact: path.relative(process.cwd(), output).replace(/\\/g, '/'),
        passed: report.passed,
        totals: report.totals
    }));
    if (!report.passed) process.exitCode = 1;
}

void main().catch(error => {
    console.error(error instanceof Error ? error.message : 'WP-027 shadow probes failed.');
    process.exitCode = 1;
});
