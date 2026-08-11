import { z } from 'zod';

import { sha256Digest } from '../canonical';
import {
    CarrierMaturitySchema,
    DiagnosticProfileV2Schema,
    DiagnosticWitnessReferenceSchema,
    EvaluationObjectKindSchema,
    ProductAuthoritySchema,
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
    'aggregate_parity_masks_port_split',
    'recurrence_repair_claimed_as_balance',
    'structural_success_claimed_as_initiative_repair',
    'delayed_response_claimed_as_immediate_counter',
    'adapter_parity_claimed_as_design_landfall',
    'rendered_trace_claimed_as_full_relation'
]);

export const AcceptancePressureCaseSchema = z.strictObject({
    caseId: EvaluationPressureCaseSchema.exclude(['none', 'v4_adapter']),
    status: z.enum(['passed', 'failed', 'not_tested']),
    reenterable: z.boolean(),
    reason: TrimmedStringSchema,
    witnessReferences: z.array(DiagnosticWitnessReferenceSchema).min(1).max(256)
});

export const EvaluationDeclarationSchema = z.strictObject({
    schemaVersion: z.literal(1),
    evaluationId: IdentifierSchema,
    evaluationVersion: VersionSchema,
    object: z.strictObject({
        kind: EvaluationObjectKindSchema,
        objectRef: IdentifierSchema
    }),
    activeFrame: z.strictObject({
        frameRef: IdentifierSchema,
        cutId: IdentifierSchema,
        cutVersion: VersionSchema,
        admissibleScope: ScenarioDomainSchema
    }),
    protectedFamily: z.array(TrimmedStringSchema).min(1).max(256),
    excludedClaims: z.array(TrimmedStringSchema).min(1).max(256),
    pressureCaseId: EvaluationPressureCaseSchema,
    witnessReferences: z.array(DiagnosticWitnessReferenceSchema).min(1).max(256),
    residueDeclaration: z.array(TrimmedStringSchema).min(1).max(256),
    returnDeclaration: TrimmedStringSchema,
    boundedExecution: z.strictObject({
        passed: z.boolean(),
        reason: TrimmedStringSchema,
        witnessReferences: z.array(DiagnosticWitnessReferenceSchema).max(256)
    }),
    acceptancePressureCases: z.array(AcceptancePressureCaseSchema).max(16),
    assertedClaims: z.array(FalseClosureRuleSchema).max(6),
    ownerDecision: z.strictObject({
        versionedRulesetApproved: z.boolean(),
        decisionRef: IdentifierSchema.nullable()
    })
}).superRefine((declaration, context) => {
    if (declaration.boundedExecution.passed && declaration.boundedExecution.witnessReferences.length === 0) {
        context.addIssue({
            code: 'custom',
            path: ['boundedExecution', 'witnessReferences'],
            message: 'Passing bounded execution requires a witness.'
        });
    }
    if (declaration.ownerDecision.versionedRulesetApproved !== (declaration.ownerDecision.decisionRef !== null)) {
        context.addIssue({
            code: 'custom',
            path: ['ownerDecision'],
            message: 'A versioned ruleset approval and its decision reference must be declared together.'
        });
    }
});

export const FalseClosureDetectionSchema = z.strictObject({
    schemaVersion: z.literal(1),
    rule: FalseClosureRuleSchema,
    primaryPressureCase: EvaluationPressureCaseSchema,
    triggered: z.boolean(),
    reason: TrimmedStringSchema,
    witnessReferences: z.array(DiagnosticWitnessReferenceSchema).min(1).max(256),
    blockedClaimId: IdentifierSchema
});

export const MaturityAssessmentSchema = z.strictObject({
    schemaVersion: z.literal(1),
    maturity: CarrierMaturitySchema,
    gates: z.strictObject({
        coherentOutput: z.boolean(),
        declaredContract: z.boolean(),
        boundedExecution: z.boolean(),
        acceptancePressureCases: z.boolean(),
        reenterableEvidence: z.boolean()
    }),
    blockingReasons: z.array(TrimmedStringSchema).max(256),
    productAuthority: ProductAuthoritySchema,
    productAuthorityReason: TrimmedStringSchema
});

export const EvaluationBundlePayloadSchema = z.strictObject({
    schemaVersion: z.literal(1),
    evaluationId: IdentifierSchema,
    evaluationVersion: VersionSchema,
    declaration: EvaluationDeclarationSchema,
    diagnosticProfile: DiagnosticProfileV2Schema,
    scalarProbes: z.array(ScalarProbeSchema).max(256),
    falseClosureDetections: z.array(FalseClosureDetectionSchema).length(6),
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
