import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { V10_R8_PROMPT_VERSION } from '../shared/strategic-voyage-v10-r8';
import {
    WP027_BATTLEFIELD_IMAGE_CELL_PX,
    WP027_BATTLEFIELD_IMAGE_VERSION
} from '../server/src/simulation/loomkeeper-battlefield-image-v10-r8';
import { loomkeeperStrategyRuntimeFromEnvironmentV10R8 } from '../server/src/simulation/loomkeeper-strategy-config-v10-r8';
import {
    createWp027ProbeScenarioV10R8,
    evaluateWp027ProbeV10R8,
    prepareWp027ProbeFixtureV10R8,
    WP027_MISTRAL_PROBE_THRESHOLDS,
    WP027_PROBE_THRESHOLDS,
    WP027_PROBE_IDS,
    summarizeWp027ProbesV10R8,
    type Wp027ProbeFixture,
    type Wp027ProbeResult
} from '../server/src/simulation/loomkeeper-strategy-probes-v10-r8';

async function main(): Promise<void> {
    const runtime = loomkeeperStrategyRuntimeFromEnvironmentV10R8(process.env, fetch, () => {});
    if ((runtime.mode !== 'gemini-shadow' && runtime.mode !== 'mistral-shadow') || !runtime.strategicAdapter) {
        throw new Error('WP-027 probes require an external shadow Loomkeeper provider.');
    }
    const thresholds = runtime.mode === 'mistral-shadow'
        ? WP027_MISTRAL_PROBE_THRESHOLDS : WP027_PROBE_THRESHOLDS;
    const fixtures: Wp027ProbeFixture[] = [];
    const results: Wp027ProbeResult[] = [];
    for (let index = 0; index < WP027_PROBE_IDS.length; index += 1) {
        const scenario = createWp027ProbeScenarioV10R8(WP027_PROBE_IDS[index]);
        const preparationStarted = performance.now();
        const fixture = prepareWp027ProbeFixtureV10R8(scenario);
        const preparationMs = Math.max(0, performance.now() - preparationStarted);
        fixtures.push(fixture);
        const providerResult = await runtime.strategicAdapter.request(
            `wp027_shadow_probe_${String(index + 1).padStart(2, '0')}`,
            fixture.boundary.brief,
            preparationMs
        );
        results.push(evaluateWp027ProbeV10R8(fixture, providerResult, thresholds));
    }
    const report = summarizeWp027ProbesV10R8(results, thresholds);
    const artifact = Object.freeze({
        generatedAt: new Date().toISOString(),
        modelId: runtime.strategicAdapter.provider.modelId,
        promptVersion: V10_R8_PROMPT_VERSION,
        visualInput: runtime.mode === 'mistral-shadow' ? Object.freeze({
            version: WP027_BATTLEFIELD_IMAGE_VERSION,
            source: 'brief.battlefield.ascii',
            mimeType: 'image/png',
            cellPixels: WP027_BATTLEFIELD_IMAGE_CELL_PX
        }) : null,
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
