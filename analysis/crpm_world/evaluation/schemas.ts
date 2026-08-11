import { z } from 'zod';

import { sha256Digest } from '../canonical';
import {
    CarrierMaturitySchema,
    CutReferenceSchema,
    DiagnosticProfileV2Schema,
    DiagnosticWitnessReferenceSchema,
    EvaluationObjectKindSchema,
    ScalarProbeSchema,
    ScenarioDomainSchema
} from '../schemas';

const IdentifierSchema = z.string()
    .min(1)
    .max(160)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const TrimmedStringSchema = z.string().min(1).max(4_096).refine(
    (value) => value.trim() === value,
    'String values must not contain leading or trailing whitespace.'
);
const VersionSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
    .refine((value) => !Object.is(value, -0));
const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const ProbeIdListSchema = z.array(IdentifierSchema).max(256).superRefine((values, context) => {
    const seen = new Set<string>();
    for (let index = 0; index < values.length; index += 1) {
        if (seen.has(values[index])) {
            context.addIssue({ code: 'custom', path: [index], message: `Duplicate probe id ${values[index]}.` });
        }
        seen.add(values[index]);
    }
});

export const EvaluationPressureCaseSchema = z.enum([
    'none',
    'f2',
    'f3',
    'f4',
    'h2',
    'h3',
    'v4_adapter'
]);

export const FalseClosureRuleSchema = z.enum([
    'recursive_return_claimed_as_landfall',
    'aggregate_parity_masks_port_split',
    'recurrence_repair_claimed_as_balance',
    'structural_success_claimed_as_initiative_repair',
    'delayed_response_claimed_as_immediate_counter',
    'adapter_parity_claimed_as_design_landfall',
    'rendered_trace_claimed_as_full_relation'
]);

/**
 * A caller declares what registered historical surface to evaluate.  It cannot
 * declare acceptance, maturity, re-enterability, or product authority; those
 * are derived from the result and the closed registry in evaluate.ts.
 */
export const EvaluationDeclarationSchema = z.strictObject({
    schemaVersion: z.literal(2),
    evaluationId: IdentifierSchema,
    evaluationVersion: VersionSchema,
    evaluationMode: z.literal('registered_historical_pressure'),
    object: z.strictObject({
        kind: EvaluationObjectKindSchema,
        objectRef: IdentifierSchema
    }),
    activeFrame: z.strictObject({
        frameRef: IdentifierSchema,
        cut: CutReferenceSchema,
        admissibleScope: ScenarioDomainSchema
    }),
    protectedFamily: z.array(TrimmedStringSchema).min(1).max(256),
    excludedClaims: z.array(TrimmedStringSchema).min(1).max(256),
    pressureCaseId: EvaluationPressureCaseSchema,
    witnessReferences: z.array(DiagnosticWitnessReferenceSchema).min(1).max(256),
    residueDeclaration: z.array(TrimmedStringSchema).min(1).max(256),
    returnDeclaration: TrimmedStringSchema,
    boundedExecution: z.strictObject({
        reason: TrimmedStringSchema,
        witnessReferences: z.array(DiagnosticWitnessReferenceSchema).min(1).max(256)
    }),
    mandatoryEvidenceProbeIds: ProbeIdListSchema.min(1),
    optionalDisplayedScalarProbeIds: ProbeIdListSchema,
    assertedClaims: z.array(FalseClosureRuleSchema).max(7)
}).superRefine((declaration, context) => {
    const mandatory = new Set(declaration.mandatoryEvidenceProbeIds);
    for (let index = 0; index < declaration.optionalDisplayedScalarProbeIds.length; index += 1) {
        const probeId = declaration.optionalDisplayedScalarProbeIds[index];
        if (!mandatory.has(probeId)) {
            context.addIssue({
                code: 'custom',
                path: ['optionalDisplayedScalarProbeIds', index],
                message: 'Displayed scalar probes must be selected from the mandatory evaluated evidence set.'
            });
        }
    }
});

export const FalseClosureDetectionSchema = z.strictObject({
    schemaVersion: z.literal(2),
    rule: FalseClosureRuleSchema,
    primaryPressureCase: EvaluationPressureCaseSchema,
    triggered: z.boolean(),
    reason: TrimmedStringSchema,
    witnessReferences: z.array(DiagnosticWitnessReferenceSchema).min(1).max(256),
    blockedClaimId: IdentifierSchema
});

export const MaturityAssessmentSchema = z.strictObject({
    schemaVersion: z.literal(2),
    maturity: CarrierMaturitySchema.exclude(['M3_bounded_design_landfall']),
    gates: z.strictObject({
        coherentOutput: z.boolean(),
        declaredContract: z.boolean(),
        boundedExecution: z.boolean(),
        registeredSourceBinding: z.boolean(),
        mandatoryEvidenceComplete: z.boolean(),
        registeredAcceptancePressureCases: z.boolean(),
        reenterableEvidence: z.boolean()
    }),
    blockingReasons: z.array(TrimmedStringSchema).max(256),
    productAuthority: z.literal('none'),
    productAuthorityReason: TrimmedStringSchema
});

export const EvaluationBundlePayloadSchema = z.strictObject({
    schemaVersion: z.literal(2),
    evaluationId: IdentifierSchema,
    evaluationVersion: VersionSchema,
    declaration: EvaluationDeclarationSchema,
    diagnosticProfile: DiagnosticProfileV2Schema,
    scalarProbes: z.array(ScalarProbeSchema).max(256),
    falseClosureDetections: z.array(FalseClosureDetectionSchema).length(7),
    maturityAssessment: MaturityAssessmentSchema
});

export const EvaluationBundleSchema = z.strictObject({
    ...EvaluationBundlePayloadSchema.shape,
    evaluationDigest: DigestSchema
}).superRefine((bundle, context) => {
    const { evaluationDigest, ...payload } = bundle;
    if (sha256Digest(payload) !== evaluationDigest) {
        context.addIssue({
            code: 'custom',
            path: ['evaluationDigest'],
            message: 'Evaluation digest does not match canonical evaluation content.'
        });
    }
});

export function buildEvaluationBundle(input: unknown) {
    const payload = EvaluationBundlePayloadSchema.parse(input);
    return EvaluationBundleSchema.parse({ ...payload, evaluationDigest: sha256Digest(payload) });
}

export type EvaluationDeclaration = z.infer<typeof EvaluationDeclarationSchema>;
export type EvaluationPressureCase = z.infer<typeof EvaluationPressureCaseSchema>;
export type FalseClosureRule = z.infer<typeof FalseClosureRuleSchema>;
export type FalseClosureDetection = z.infer<typeof FalseClosureDetectionSchema>;
export type EvaluationBundle = z.infer<typeof EvaluationBundleSchema>;
