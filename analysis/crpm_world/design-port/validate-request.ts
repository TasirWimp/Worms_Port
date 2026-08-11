import { z } from 'zod';

import { canonicalJson, sha256Digest } from '../canonical';
import { getCutDefinition } from '../cuts/registry';
import { V4_SUPPORT_TWIN_SEED } from '../cuts/v4-cuts';
import { ScenarioDomainSchema } from '../schemas';
import {
    D2A_PRESSURE_ACTION_FAMILY,
    D2A_PRESSURE_POLICY_FAMILY,
    FORBIDDEN_DESIGN_PORTS,
    OFFLINE_ADAPTER_IDS,
    OFFLINE_DESIGN_PROFILE_VERSION,
    OFFLINE_DESIGN_REQUEST_VERSION,
    REGISTERED_PRESSURE_DISTANCES,
    REGISTERED_PRESSURE_SEED,
    getD2AConfigRegistration,
    getOfflineAdapterRegistration
} from './registry';

const IdentifierSchema = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const VersionSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
    .refine((value) => !Object.is(value, -0));
const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const DescriptionSchema = z.string().min(1).max(4_096).refine((value) => value.trim() === value);
const UniqueIdentifiersSchema = z.array(IdentifierSchema).max(256).superRefine((values, context) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
        if (seen.has(value)) context.addIssue({ code: 'custom', path: [index], message: `Duplicate value ${value}.` });
        seen.add(value);
    });
});
const NonEmptyDescriptionsSchema = z.array(DescriptionSchema).min(1).max(256).superRefine((values, context) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
        if (seen.has(value)) context.addIssue({ code: 'custom', path: [index], message: 'Descriptions must be unique.' });
        seen.add(value);
    });
});

const AdapterSchema = z.strictObject({
    id: z.enum([OFFLINE_ADAPTER_IDS.v4Authority, OFFLINE_ADAPTER_IDS.d2aTactical]),
    version: VersionSchema
});

const BaselineSchema = z.discriminatedUnion('kind', [
    z.strictObject({
        kind: z.literal('ruleset'),
        id: IdentifierSchema,
        version: VersionSchema,
        calling: z.enum(['wizard', 'thief', 'warrior'])
    }),
    z.strictObject({
        kind: z.literal('d2a_config'),
        id: IdentifierSchema,
        version: VersionSchema
    })
]);

const CutReferenceSchema = z.strictObject({ id: IdentifierSchema, version: VersionSchema });

const SimulationCommandSchema = z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('move'), direction: z.union([z.literal(-1), z.literal(0), z.literal(1)]) }),
    z.strictObject({ type: z.literal('select_relic'), relicId: z.enum(['threadball', 'needlepoint', 'spoolburst']) }),
    z.strictObject({
        type: z.literal('aim'),
        angleMilliDegrees: z.number().int().min(-90_000).max(90_000).refine((value) => !Object.is(value, -0)),
        powerPermille: z.number().int().min(0).max(1_000).refine((value) => !Object.is(value, -0))
    }),
    z.strictObject({ type: z.literal('fire') })
]);

export const OfflineCommandStepSchema = z.strictObject({
    sequence: z.number().int().min(0).max(4_095),
    kind: z.literal('command'),
    actor: z.enum(['player', 'loomkeeper']),
    expectedTurn: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).refine((value) => !Object.is(value, -0)),
    command: SimulationCommandSchema
});

export const OfflinePolicyStepSchema = z.strictObject({
    sequence: z.literal(0),
    kind: z.literal('policy'),
    configId: IdentifierSchema,
    policyFamily: z.literal(D2A_PRESSURE_POLICY_FAMILY)
});

const SequenceSchema = z.array(z.discriminatedUnion('kind', [
    OfflineCommandStepSchema,
    OfflinePolicyStepSchema
])).min(1).max(4_096).superRefine((steps, context) => {
    steps.forEach((step, index) => {
        if (step.sequence !== index) {
            context.addIssue({ code: 'custom', path: [index, 'sequence'], message: 'Sequence indices must be contiguous from zero.' });
        }
    });
});

export const OfflineWorldDesignRequestPayloadSchema = z.strictObject({
    schemaVersion: z.literal(1),
    requestId: IdentifierSchema,
    requestVersion: z.literal(OFFLINE_DESIGN_REQUEST_VERSION),
    profileVersion: z.literal(OFFLINE_DESIGN_PROFILE_VERSION),
    adapter: AdapterSchema,
    baseline: BaselineSchema,
    scenarioDomain: ScenarioDomainSchema,
    cut: CutReferenceSchema,
    protectedFamily: NonEmptyDescriptionsSchema,
    sequence: SequenceSchema,
    seeds: z.array(z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
        .refine((value) => !Object.is(value, -0))).min(1).max(1_024),
    outputDetailLevel: z.enum(['summary', 'witnesses', 'full']),
    mandatoryEvidenceProbes: UniqueIdentifiersSchema.min(1),
    optionalDisplayedScalarProbes: UniqueIdentifiersSchema,
    requestedPorts: UniqueIdentifiersSchema.min(1),
    activation: z.literal('offline_only'),
    explicitExclusions: NonEmptyDescriptionsSchema
});

export const OfflineWorldDesignRequestSchema = z.strictObject({
    ...OfflineWorldDesignRequestPayloadSchema.shape,
    requestDigest: DigestSchema
}).superRefine((request, context) => {
    const { requestDigest, ...payload } = request;
    if (sha256Digest(payload) !== requestDigest) {
        context.addIssue({ code: 'custom', path: ['requestDigest'], message: 'Request digest does not match canonical request content.' });
    }
});

export type OfflineWorldDesignRequestPayload = z.infer<typeof OfflineWorldDesignRequestPayloadSchema>;
export type OfflineWorldDesignRequest = z.infer<typeof OfflineWorldDesignRequestSchema>;
export type OfflineCommandStep = z.infer<typeof OfflineCommandStepSchema>;

function sameSet(left: readonly string[], right: readonly string[]): boolean {
    return canonicalJson([...left].sort()) === canonicalJson([...right].sort());
}

function validateDeclaredScope(request: OfflineWorldDesignRequest): void {
    const registration = getOfflineAdapterRegistration(request.adapter.id, request.adapter.version);
    if (request.outputDetailLevel !== 'witnesses') {
        throw new RangeError('Only the registered witnesses output-detail level is implemented in this gate.');
    }
    if (request.baseline.kind !== registration.baselineKind ||
        !registration.rulesetsOrConfigs.includes(request.baseline.id)) {
        throw new RangeError(`Baseline/config ${request.baseline.id} is not registered for ${request.adapter.id}.`);
    }
    if (!registration.cutIds.includes(request.cut.id) || request.cut.version !== 1) {
        throw new RangeError(`Cut ${request.cut.id}@${request.cut.version} is incompatible with ${request.adapter.id}.`);
    }
    const cutDefinition = getCutDefinition(request.cut.id, request.cut.version);
    const expectedCarrierKind = request.adapter.id === OFFLINE_ADAPTER_IDS.v4Authority
        ? 'authority'
        : 'tactical-analysis';
    if (cutDefinition.sourceCarrierKind !== expectedCarrierKind) {
        throw new RangeError(`Cut ${request.cut.id}@${request.cut.version} has an incompatible source carrier kind.`);
    }
    if (!sameSet(request.protectedFamily, registration.mandatoryProtectedFamily) ||
        !sameSet(request.protectedFamily, cutDefinition.protectedFamily)) {
        throw new RangeError('The request protected family must exactly match the mandatory registered adapter/cut family.');
    }
    if (request.scenarioDomain.scenarioIds.some((item) => !cutDefinition.admissibleDomain.scenarioIds.includes(item)) ||
        request.scenarioDomain.actionFamilies.some((item) => !cutDefinition.admissibleDomain.actionFamilies.includes(item)) ||
        request.scenarioDomain.policyFamilies.some((item) => !cutDefinition.admissibleDomain.policyFamilies.includes(item)) ||
        request.scenarioDomain.seeds.some((item) => !cutDefinition.admissibleDomain.seeds.includes(item))) {
        throw new RangeError('The request domain is outside the registered versioned cut domain.');
    }
    const forbidden = request.requestedPorts.filter((port) =>
        (FORBIDDEN_DESIGN_PORTS as readonly string[]).includes(port)
    );
    if (forbidden.length > 0) throw new RangeError(`Forbidden design port requested: ${forbidden.join(', ')}.`);
    const unknownPorts = request.requestedPorts.filter((port) => !registration.allowedPorts.includes(port));
    if (unknownPorts.length > 0) throw new RangeError(`Unknown or inadmissible design port: ${unknownPorts.join(', ')}.`);
    if (!sameSet(request.seeds.map(String), request.scenarioDomain.seeds.map(String))) {
        throw new RangeError('Request seeds must exactly match the declared scenario-domain seeds.');
    }

    if (request.adapter.id === OFFLINE_ADAPTER_IDS.v4Authority) {
        if (request.baseline.kind !== 'ruleset' || request.baseline.version !== 4) {
            throw new RangeError('v4_authority requires the registered V4 ruleset and version 4.');
        }
        if (request.sequence.some((step) => step.kind !== 'command')) {
            throw new RangeError('v4_authority accepts only a declarative command transcript.');
        }
        const actionFamilies = [...new Set(request.sequence.map((step) =>
            step.kind === 'command' ? step.command.type : 'invalid'
        ))];
        if (!sameSet(actionFamilies, request.scenarioDomain.actionFamilies) ||
            !sameSet(request.scenarioDomain.policyFamilies, ['declared-command-sequence'])) {
            throw new RangeError('V4 scenario action/policy families must exactly describe the command transcript.');
        }
        if (!sameSet(request.scenarioDomain.scenarioIds, ['v4-authority-c0ffee11'])) {
            throw new RangeError('The V4 request is outside the registered scenario domain.');
        }
        if (request.seeds.length !== 1 || request.seeds[0] !== V4_SUPPORT_TWIN_SEED) {
            throw new RangeError(`v4_authority requires exactly the registered seed ${V4_SUPPORT_TWIN_SEED}.`);
        }
        if (!sameSet(request.mandatoryEvidenceProbes, registration.mandatoryEvidenceProbes)) {
            throw new RangeError('V4 mandatory evidence probes must exactly match the registered evidence set.');
        }
        if (request.optionalDisplayedScalarProbes.some((probe) => !registration.mandatoryEvidenceProbes.includes(probe))) {
            throw new RangeError('Unknown optional V4 scalar probe requested for display.');
        }
        return;
    }

    if (request.baseline.kind !== 'd2a_config') throw new RangeError('d2a_tactical requires a D2A config baseline.');
    const config = getD2AConfigRegistration(request.baseline.id);
    if (request.baseline.version !== config.schemaVersion) {
        throw new RangeError(`D2A config schema version mismatch for ${request.baseline.id}.`);
    }
    if (request.sequence.length !== 1 || request.sequence[0].kind !== 'policy' ||
        request.sequence[0].configId !== config.configId) {
        throw new RangeError('d2a_tactical requires one registered policy declaration matching the baseline config.');
    }
    if (!sameSet(request.scenarioDomain.actionFamilies, [D2A_PRESSURE_ACTION_FAMILY]) ||
        !sameSet(request.scenarioDomain.policyFamilies, [D2A_PRESSURE_POLICY_FAMILY])) {
        throw new RangeError('D2A scenario action/policy families are undeclared or incompatible.');
    }
    const expectedScenarios = REGISTERED_PRESSURE_DISTANCES.map((distance) => `d2a-${config.caseId}-distance-${distance}`);
    if (!sameSet(request.scenarioDomain.scenarioIds, expectedScenarios)) {
        throw new RangeError('The D2A pressure request must declare the complete registered five-distance domain.');
    }
    if (request.seeds.length !== 1 || request.seeds[0] !== REGISTERED_PRESSURE_SEED) {
        throw new RangeError(`d2a_tactical requires exactly the registered pressure seed ${REGISTERED_PRESSURE_SEED}.`);
    }
    if (!sameSet(request.mandatoryEvidenceProbes, config.mandatoryEvidenceProbes)) {
        throw new RangeError(`Mandatory evidence probes must exactly match registered D2A config ${config.configId}.`);
    }
    if (request.optionalDisplayedScalarProbes.some((probe) => !config.mandatoryEvidenceProbes.includes(probe))) {
        throw new RangeError(`Unknown optional displayed probe for registered D2A config ${config.configId}.`);
    }
}

export function buildOfflineWorldDesignRequest(input: unknown): OfflineWorldDesignRequest {
    const payload = OfflineWorldDesignRequestPayloadSchema.parse(input);
    return validateOfflineWorldDesignRequest({ ...payload, requestDigest: sha256Digest(payload) });
}

export function validateOfflineWorldDesignRequest(input: unknown): OfflineWorldDesignRequest {
    const request = OfflineWorldDesignRequestSchema.parse(input);
    validateDeclaredScope(request);
    return request;
}

export function parseOrBuildOfflineWorldDesignRequest(input: unknown): OfflineWorldDesignRequest {
    if (input && typeof input === 'object' && !Array.isArray(input) && 'requestDigest' in input) {
        return validateOfflineWorldDesignRequest(input);
    }
    return buildOfflineWorldDesignRequest(input);
}
