import type { z } from 'zod';

import type {
    AdapterReferenceSchema,
    AliasingWitnessSchema,
    AliasingWitnessPairSchema,
    CarrierMaturitySchema,
    CompositionIssueCodeSchema,
    CompositionIssueSchema,
    CompositionWitnessSchema,
    ContractCatalogsSchema,
    DiagnosticAxisSchema,
    DiagnosticProfileSchema,
    DiagnosticProfileV1Schema,
    DiagnosticProfileV2Schema,
    EvaluationObjectKindSchema,
    EdgePortBindingsSchema,
    EdgeCompositionResultSchema,
    EvidenceOriginSchema,
    FixedFrameSchema,
    PortContractSchema,
    PortDefinitionSchema,
    ProductAuthoritySchema,
    ProjectionClassSchema,
    ProjectionTransportAssessmentSchema,
    ProjectionTransportAssessmentV1Schema,
    ProjectionTransportAssessmentV2Schema,
    ResidualLedgerSchema,
    ReturnAssessmentSchema,
    ReturnClassAssessmentSchema,
    ReturnClassificationSchema,
    ReturnObligationSchema,
    ScenarioDomainSchema,
    SourceLockSchema,
    SupportStatusSchema,
    TransitionWitnessSchema,
    VoyageTraceSchema,
    VoyageTraceV1Schema,
    VoyageTraceV2Schema,
    WorldCarrierReferenceSchema,
    WorldCutDefinitionSchema,
    WorldDesignRequestPayloadSchema,
    WorldDesignRequestSchema,
    WorldDesignResultPayloadSchema,
    WorldDesignResultSchema,
    WorldTransitionEdgeSchema,
    WorldTransitionEdgeV1Schema,
    WorldTransitionEdgeV2Schema
} from './schemas';

export type AdapterReference = z.infer<typeof AdapterReferenceSchema>;
export type AliasingWitness = z.infer<typeof AliasingWitnessSchema>;
export type AliasingWitnessPair = z.infer<typeof AliasingWitnessPairSchema>;
export type CarrierMaturity = z.infer<typeof CarrierMaturitySchema>;
export type CompositionIssueCode = z.infer<typeof CompositionIssueCodeSchema>;
export type CompositionIssue = z.infer<typeof CompositionIssueSchema>;
export type CompositionWitness = z.infer<typeof CompositionWitnessSchema>;
export type ContractCatalogs = z.infer<typeof ContractCatalogsSchema>;
export type DiagnosticAxis = z.infer<typeof DiagnosticAxisSchema>;
export type DiagnosticProfile = z.infer<typeof DiagnosticProfileSchema>;
export type DiagnosticProfileV1 = z.infer<typeof DiagnosticProfileV1Schema>;
export type DiagnosticProfileV2 = z.infer<typeof DiagnosticProfileV2Schema>;
export type EvaluationObjectKind = z.infer<typeof EvaluationObjectKindSchema>;
export type EdgePortBindings = z.infer<typeof EdgePortBindingsSchema>;
export type EdgeCompositionResult = z.infer<typeof EdgeCompositionResultSchema>;
export type EvidenceOrigin = z.infer<typeof EvidenceOriginSchema>;
export type FixedFrame = z.infer<typeof FixedFrameSchema>;
export type PortContract = z.infer<typeof PortContractSchema>;
export type PortDefinition = z.infer<typeof PortDefinitionSchema>;
export type ProductAuthority = z.infer<typeof ProductAuthoritySchema>;
export type ProjectionClass = z.infer<typeof ProjectionClassSchema>;
export type ProjectionTransportAssessment = z.infer<typeof ProjectionTransportAssessmentSchema>;
export type ProjectionTransportAssessmentV1 = z.infer<typeof ProjectionTransportAssessmentV1Schema>;
export type ProjectionTransportAssessmentV2 = z.infer<typeof ProjectionTransportAssessmentV2Schema>;
export type ResidualLedger = z.infer<typeof ResidualLedgerSchema>;
export type ReturnAssessment = z.infer<typeof ReturnAssessmentSchema>;
export type ReturnClassAssessment = z.infer<typeof ReturnClassAssessmentSchema>;
export type ReturnClassification = z.infer<typeof ReturnClassificationSchema>;
export type ReturnObligation = z.infer<typeof ReturnObligationSchema>;
export type ScenarioDomain = z.infer<typeof ScenarioDomainSchema>;
export type SourceLock = z.infer<typeof SourceLockSchema>;
export type SupportStatus = z.infer<typeof SupportStatusSchema>;
export type TransitionWitness = z.infer<typeof TransitionWitnessSchema>;
export type VoyageTrace = z.infer<typeof VoyageTraceSchema>;
export type VoyageTraceV1 = z.infer<typeof VoyageTraceV1Schema>;
export type VoyageTraceV2 = z.infer<typeof VoyageTraceV2Schema>;
export type WorldCarrierReference = z.infer<typeof WorldCarrierReferenceSchema>;
export type WorldCutDefinition = z.infer<typeof WorldCutDefinitionSchema>;
export type WorldDesignRequestPayload = z.infer<typeof WorldDesignRequestPayloadSchema>;
export type WorldDesignRequest = z.infer<typeof WorldDesignRequestSchema>;
export type WorldDesignResultPayload = z.infer<typeof WorldDesignResultPayloadSchema>;
export type WorldDesignResult = z.infer<typeof WorldDesignResultSchema>;
export type WorldTransitionEdge = z.infer<typeof WorldTransitionEdgeSchema>;
export type WorldTransitionEdgeV1 = z.infer<typeof WorldTransitionEdgeV1Schema>;
export type WorldTransitionEdgeV2 = z.infer<typeof WorldTransitionEdgeV2Schema>;

export type { JsonPrimitive, JsonValue } from './canonical';
