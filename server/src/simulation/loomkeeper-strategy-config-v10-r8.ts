import { GeminiStrategicDecisionProviderV10R8, WP027_GEMINI_MODEL_ID } from './gemini-strategy-provider-v10-r8';
import { StrategicDecisionAdapterV10R8 } from './loomkeeper-strategy-provider-v10-r8';
import { StrategicShadowTelemetryV10R8 } from './loomkeeper-strategy-telemetry-v10-r8';

export type LoomkeeperProviderModeV10R8 = 'deterministic' | 'gemini-shadow' | 'gemini';

export type LoomkeeperStrategyRuntimeV10R8 = Readonly<{
    mode: LoomkeeperProviderModeV10R8;
    strategicAdapter?: StrategicDecisionAdapterV10R8;
    telemetry?: StrategicShadowTelemetryV10R8;
}>;

type FetchLike = typeof fetch;

export function loomkeeperStrategyRuntimeFromEnvironmentV10R8(
    environment: NodeJS.ProcessEnv = process.env,
    fetchImpl: FetchLike = fetch,
    logger: (line: string) => void = line => console.log(line)
): LoomkeeperStrategyRuntimeV10R8 {
    const configured = environment.LOOMKEEPER_PROVIDER?.trim() || 'deterministic';
    if (!['deterministic', 'gemini-shadow', 'gemini'].includes(configured)) {
        throw new Error('LOOMKEEPER_PROVIDER must be deterministic, gemini-shadow or gemini.');
    }
    const mode = configured as LoomkeeperProviderModeV10R8;
    if (mode === 'deterministic') return Object.freeze({ mode });
    if (environment.WP014_QUALITY_TEST === 'true') {
        throw new Error('WP-014 quality tests refuse an external Loomkeeper provider.');
    }
    const model = environment.GEMINI_MODEL?.trim();
    if (model !== WP027_GEMINI_MODEL_ID) {
        throw new Error(`GEMINI_MODEL must be the frozen stable model ${WP027_GEMINI_MODEL_ID}.`);
    }
    const apiKey = environment.GEMINI_API_KEY?.trim();
    if (!apiKey) throw new Error('GEMINI_API_KEY is required for an external Loomkeeper provider.');
    const providerMode = mode === 'gemini-shadow' ? 'gemini_shadow' : 'gemini';
    const telemetry = new StrategicShadowTelemetryV10R8(logger);
    return Object.freeze({
        mode,
        strategicAdapter: new StrategicDecisionAdapterV10R8(
            new GeminiStrategicDecisionProviderV10R8(providerMode, apiKey, fetchImpl),
            {
                deadlineMs: 8_000,
                maxConcurrentRequests: 2,
                maxRequests: 250,
                failureThreshold: 3,
                circuitCooldownMs: 60_000
            }
        ),
        telemetry
    });
}
