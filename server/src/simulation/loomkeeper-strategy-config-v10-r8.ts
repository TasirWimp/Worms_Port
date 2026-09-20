import { GeminiStrategicDecisionProviderV10R8, WP027_GEMINI_MODEL_ID } from './gemini-strategy-provider-v10-r8';
import { StrategicDecisionAdapterV10R8 } from './loomkeeper-strategy-provider-v10-r8';
import { StrategicShadowTelemetryV10R8 } from './loomkeeper-strategy-telemetry-v10-r8';
import { MistralStrategicDecisionProviderV10R8, WP027_MISTRAL_MODEL_ID } from './mistral-strategy-provider-v10-r8';

export type LoomkeeperProviderModeV10R8 = 'deterministic' | 'gemini-shadow' | 'gemini' | 'mistral-shadow';

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
    if (!['deterministic', 'gemini-shadow', 'gemini', 'mistral-shadow'].includes(configured)) {
        throw new Error('LOOMKEEPER_PROVIDER must be deterministic, gemini-shadow, gemini or mistral-shadow.');
    }
    const mode = configured as LoomkeeperProviderModeV10R8;
    if (mode === 'deterministic') return Object.freeze({ mode });
    if (environment.WP014_QUALITY_TEST === 'true') {
        throw new Error('WP-014 quality tests refuse an external Loomkeeper provider.');
    }
    if (mode === 'mistral-shadow') {
        const model = environment.MISTRAL_MODEL?.trim();
        if (model !== WP027_MISTRAL_MODEL_ID) {
            throw new Error(`MISTRAL_MODEL must be the frozen stable model ${WP027_MISTRAL_MODEL_ID}.`);
        }
        const apiKey = environment.MISTRAL_API_KEY?.trim();
        if (!apiKey) throw new Error('MISTRAL_API_KEY is required for the Mistral Loomkeeper provider.');
        const telemetry = new StrategicShadowTelemetryV10R8(logger);
        return Object.freeze({
            mode,
            strategicAdapter: new StrategicDecisionAdapterV10R8(
                new MistralStrategicDecisionProviderV10R8(apiKey, fetchImpl),
                strategicAdapterOptions()
            ),
            telemetry
        });
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
            strategicAdapterOptions()
        ),
        telemetry
    });
}

function strategicAdapterOptions() {
    return Object.freeze({
        deadlineMs: 8_000,
        maxConcurrentRequests: 2,
        maxRequests: 250,
        failureThreshold: 3,
        circuitCooldownMs: 60_000
    });
}
