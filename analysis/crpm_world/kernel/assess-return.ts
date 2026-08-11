import { canonicalJson, sha256Digest } from '../canonical';
import {
    ReturnAssessmentSchema,
    ReturnClassificationSchema,
    ScenarioDomainSchema
} from '../schemas';
import type {
    ReturnAssessment,
    ReturnClassAssessment,
    ScenarioDomain,
    VoyageTraceV3,
    WorldCarrierReference,
    CutReference
} from '../types';
import { carrierContinuationMatches } from './compose-edges';

type EqualityDeclaration = Readonly<{
    cut: CutReference;
    sourceKey: unknown;
    targetKey: unknown;
    witnessRefs?: readonly string[];
    declaredExclusions?: readonly string[];
}>;

export type ReturnAssessmentInput = Readonly<{
    assessmentId: string;
    assessmentVersion?: number;
    sourceCarrier: WorldCarrierReference;
    targetCarrier: WorldCarrierReference;
    declaredDomain: ScenarioDomain;
    visibleProjection?: EqualityDeclaration;
    protectedEquivalence?: Readonly<{
        cut: CutReference;
        decodable: boolean;
        witnessRefs?: readonly string[];
        declaredExclusions?: readonly string[];
    }>;
    recursiveCarrier?: EqualityDeclaration & Readonly<{
        supportCompleteForDeclaredDomain: boolean;
    }>;
    invariantRegion?: Readonly<{
        regionId: string;
        sourceInRegion: boolean;
        targetInRegion: boolean;
        pathRemainsInRegion: boolean;
        witnessRefs?: readonly string[];
        declaredExclusions?: readonly string[];
    }>;
    routeComparison?: Readonly<{
        leftVoyage: VoyageTraceV3;
        rightVoyage: VoyageTraceV3;
        leftTargetProjectionKey: unknown;
        rightTargetProjectionKey: unknown;
        witnessRefs?: readonly string[];
        declaredExclusions?: readonly string[];
    }>;
    blockedClaims?: readonly string[];
}>;

function equal(left: unknown, right: unknown): boolean {
    return canonicalJson(left) === canonicalJson(right);
}

function row(
    classification: ReturnClassAssessment['classification'],
    status: ReturnClassAssessment['status'],
    declaredCut: CutReference | null,
    declaredRegionId: string | null,
    rationale: string,
    witnessRefs: readonly string[] = [],
    declaredExclusions: readonly string[] = []
): ReturnClassAssessment {
    return {
        classification,
        status,
        declaredCut,
        declaredRegionId,
        witnessRefs: [...witnessRefs],
        declaredExclusions: [...declaredExclusions],
        rationale
    };
}

/** Classifies six return notions independently; it never emits a single loop boolean. */
export function assessReturn(input: ReturnAssessmentInput): ReturnAssessment {
    const domain = ScenarioDomainSchema.parse(input.declaredDomain);
    const exact = carrierContinuationMatches(input.sourceCarrier, input.targetCarrier);
    const visibleStatus = input.visibleProjection
        ? equal(input.visibleProjection.sourceKey, input.visibleProjection.targetKey)
            ? 'satisfied' : 'not_satisfied'
        : 'not_assessed';
    const recursiveStatus = input.recursiveCarrier
        ? input.recursiveCarrier.supportCompleteForDeclaredDomain &&
            equal(input.recursiveCarrier.sourceKey, input.recursiveCarrier.targetKey)
            ? 'satisfied' : 'not_satisfied'
        : 'not_assessed';
    const invariantStatus = input.invariantRegion
        ? input.invariantRegion.sourceInRegion && input.invariantRegion.targetInRegion &&
            input.invariantRegion.pathRemainsInRegion &&
            !exact && recursiveStatus !== 'satisfied'
            ? 'satisfied' : 'not_satisfied'
        : 'not_assessed';

    let routeStatus: ReturnClassAssessment['status'] = 'not_assessed';
    let routeRationale = 'No paired route comparison was declared.';
    if (input.routeComparison) {
        const routesAppearEqual = equal(
            input.routeComparison.leftTargetProjectionKey,
            input.routeComparison.rightTargetProjectionKey
        );
        const left = input.routeComparison.leftVoyage;
        const right = input.routeComparison.rightVoyage;
        const incompatibleSupport = !carrierContinuationMatches(left.finalCarrier, right.finalCarrier) ||
            sha256Digest(left.accumulatedResidual) !== sha256Digest(right.accumulatedResidual) ||
            !equal(left.obligationHistory.unresolved, right.obligationHistory.unresolved);
        routeStatus = routesAppearEqual && incompatibleSupport ? 'satisfied' : 'not_satisfied';
        routeRationale = routeStatus === 'satisfied'
            ? 'The declared target projections agree, but final carrier support, residue, or unresolved obligations differ.'
            : routesAppearEqual
                ? 'The declared target projections and compared route support remain compatible.'
                : 'The paired routes do not reach the same declared target projection.';
    }

    const classifications: ReturnClassAssessment[] = [
        row(
            'visible_equal',
            visibleStatus,
            input.visibleProjection?.cut ?? null,
            null,
            input.visibleProjection
                ? visibleStatus === 'satisfied'
                    ? 'Source and target keys are equal under the declared visible projection; no stronger return is implied.'
                    : 'Source and target keys differ under the declared visible projection.'
                : 'No visible projection equality was declared.',
            input.visibleProjection?.witnessRefs,
            input.visibleProjection?.declaredExclusions
        ),
        row(
            'protected_equivalent',
            input.protectedEquivalence
                ? input.protectedEquivalence.decodable ? 'satisfied' : 'not_satisfied'
                : 'not_assessed',
            input.protectedEquivalence?.cut ?? null,
            null,
            input.protectedEquivalence
                ? input.protectedEquivalence.decodable
                    ? 'The declared protected family remains decodable; full carrier equality is not implied.'
                    : 'The declared protected family is not decodable at the target.'
                : 'No protected-family decoder assessment was declared.',
            input.protectedEquivalence?.witnessRefs,
            input.protectedEquivalence?.declaredExclusions
        ),
        row(
            'recursive_carrier_return',
            recursiveStatus,
            input.recursiveCarrier?.cut ?? null,
            null,
            input.recursiveCarrier
                ? recursiveStatus === 'satisfied'
                    ? 'The exact declared cut/domain-specific support-complete recursive carrier key repeats.'
                    : input.recursiveCarrier.supportCompleteForDeclaredDomain
                        ? 'The declared recursive carrier key does not repeat.'
                        : 'The supplied recurrence key is not declared support-complete for this domain.'
                : 'No recursive carrier key was declared.',
            input.recursiveCarrier?.witnessRefs,
            input.recursiveCarrier?.declaredExclusions
        ),
        row(
            'invariant_region_return',
            invariantStatus,
            null,
            input.invariantRegion?.regionId ?? null,
            input.invariantRegion
                ? invariantStatus === 'satisfied'
                    ? 'Both states remain in the declared invariant region without exact or recursive-carrier repetition.'
                    : 'The declared invariant-region conditions are not independently satisfied.'
                : 'No invariant-region membership assessment was declared.',
            input.invariantRegion?.witnessRefs,
            input.invariantRegion?.declaredExclusions
        ),
        row(
            'finite_exact_return',
            exact ? 'satisfied' : 'not_satisfied',
            null,
            null,
            exact
                ? 'The full declared carrier support, authority state digest, revision/step, ruleset, adapter, and source lineage repeat.'
                : 'The full declared carrier support does not repeat.',
            [...new Set([input.sourceCarrier.stateDigest, input.targetCarrier.stateDigest])],
            []
        ),
        row(
            'route_mismatch',
            routeStatus,
            null,
            input.routeComparison ? 'paired-voyage-route' : null,
            routeRationale,
            input.routeComparison?.witnessRefs,
            input.routeComparison?.declaredExclusions
        )
    ];
    const satisfiedClassifications = classifications
        .filter((assessment) => assessment.status === 'satisfied')
        .map((assessment) => assessment.classification);

    return ReturnAssessmentSchema.parse({
        schemaVersion: 1,
        assessmentId: input.assessmentId,
        assessmentVersion: input.assessmentVersion ?? 1,
        sourceCarrier: input.sourceCarrier,
        targetCarrier: input.targetCarrier,
        declaredDomain: domain,
        classifications,
        satisfiedClassifications,
        blockedClaims: [...new Set([
            'No return classification implies another classification, global convergence, recurrence outside its declared cut, or gameplay activation.',
            'Elapsed turn, tick, revision, and path fields are never removed globally; every recurrence-key exclusion belongs to its declared cut.',
            ...[...(input.blockedClaims ?? [])].sort()
        ])]
    });
}

export const RETURN_CLASSIFICATIONS = ReturnClassificationSchema.options;
