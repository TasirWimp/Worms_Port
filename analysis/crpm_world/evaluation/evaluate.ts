import { canonicalJson, compareCanonicalText, sha256Digest } from '../canonical';
import {
    DiagnosticProfileV2Schema,
    ScalarProbeSchema,
    WorldDesignResultSchema
} from '../schemas';
import type {
    DiagnosticProfileV2,
    WorldDesignResult
} from '../types';
import {
    D2A_CONFIG_REGISTRATIONS,
    OFFLINE_ADAPTER_IDS,
    getOfflineAdapterRegistration
} from '../design-port/registry';
import { D2A_TACTICAL_CUT_ID, D2A_TACTICAL_CUT_VERSION } from '../cuts/d2a-cuts';
import { getCutDefinition } from '../cuts/registry';
import { V4_CUT_IDS, V4_CUT_VERSION } from '../cuts/v4-cuts';
import {
    EvaluationDeclarationSchema,
    FalseClosureRuleSchema,
    MaturityAssessmentSchema,
    buildEvaluationBundle,
    type EvaluationBundle,
    type EvaluationDeclaration,
    type EvaluationPressureCase,
    type FalseClosureDetection,
    type FalseClosureRule
} from './schemas';

type DiagnosticWitnessReference = EvaluationDeclaration['witnessReferences'][number];
type ScalarProbe = ReturnType<typeof ScalarProbeSchema.parse>;

const D2A_SOURCE_COMMIT = 'af23717e61fea6995bf3b7209211ae1aaa2bb855';
const V4_SOURCE_COMMIT = '0ca98ac32f9f7a265888ae342a3f3254269d61d9';
const CRPM_SOURCE_COMMIT = '995236df60924f790506cf5badec3c102abf3fd1';

function sortedUnique<T>(items: readonly T[], key: (item: T) => string): T[] {
    const byKey = new Map<string, T>();
    for (const item of items) byKey.set(key(item), item);
    return [...byKey.entries()]
        .sort(([left], [right]) => compareCanonicalText(left, right))
        .map(([, item]) => item);
}

function witnessForReference(reference: string): DiagnosticWitnessReference {
    const digest = /^[0-9a-f]{64}$/.test(reference) ? reference : sha256Digest(reference);
    return { witnessId: `source-evidence-${digest.slice(0, 24)}`, digest };
}

function resultWitnesses(result: WorldDesignResult): DiagnosticWitnessReference[] {
    const references: DiagnosticWitnessReference[] = [
        ...result.transitionWitnesses.map((witness) => ({
            witnessId: witness.witnessId,
            digest: sha256Digest(witness)
        })),
        ...result.traces.flatMap((trace) => [
            ...trace.recurrenceWitnesses,
            ...trace.returnWitnesses,
            ...(trace.schemaVersion === 2 ? trace.witnessReferences : [])
        ]),
        ...result.diagnostics.flatMap((diagnostic) => diagnostic.schemaVersion === 1
            ? diagnostic.pathPressure.evidenceRefs.map(witnessForReference)
            : diagnostic.blockedClaims.flatMap((claim) => claim.witnessReferences))
    ];
    return sortedUnique(references, (reference) => `${reference.witnessId}:${reference.digest}`);
}

function scalarProbes(result: WorldDesignResult): ScalarProbe[] {
    const probes = result.diagnostics.flatMap((diagnostic) =>
        diagnostic.schemaVersion === 1 ? diagnostic.scalarProbes : []
    );
    const byId = new Map<string, z.infer<typeof ScalarProbeSchema>>();
    for (const probe of probes) {
        const prior = byId.get(probe.probeId);
        if (prior && sha256Digest(prior) !== sha256Digest(probe)) {
            throw new Error(`Conflicting scalar probe ${probe.probeId}.`);
        }
        byId.set(probe.probeId, probe);
    }
    return [...byId.values()].sort((left, right) => compareCanonicalText(left.probeId, right.probeId));
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
    return canonicalJson([...left].sort(compareCanonicalText)) ===
        canonicalJson([...right].sort(compareCanonicalText));
}

function containsSourceLock(
    result: WorldDesignResult,
    repositoryId: string,
    commit: string,
    requiredPaths: readonly string[]
): boolean {
    return result.sourceLocks.some((lock) => lock.repositoryId === repositoryId &&
        lock.commit === commit && requiredPaths.every((path) => lock.paths.includes(path)));
}

function registeredEvaluationBinding(
    declaration: EvaluationDeclaration,
    result: WorldDesignResult,
    availableProbes: readonly ScalarProbe[],
    availableWitnesses: readonly DiagnosticWitnessReference[]
) {
    const witnessKeys = new Set(availableWitnesses.map((item) => canonicalJson(item)));
    const declaredWitnessesBound = declaration.witnessReferences.every((item) => witnessKeys.has(canonicalJson(item))) &&
        declaration.boundedExecution.witnessReferences.every((item) => witnessKeys.has(canonicalJson(item)));
    const actualProbeIds = availableProbes.map((probe) => probe.probeId);
    let expectedProbeIds: readonly string[] = [];
    let expectedProtectedFamily: readonly string[] = [];
    let expectedCut = { id: 'unregistered', version: 1 };
    let sourceBound = false;
    let registeredAcceptancePassed = false;

    if (declaration.pressureCaseId === 'v4_adapter') {
        const registration = getOfflineAdapterRegistration(OFFLINE_ADAPTER_IDS.v4Authority, 1);
        expectedProbeIds = registration.mandatoryEvidenceProbes;
        expectedProtectedFamily = registration.mandatoryProtectedFamily;
        expectedCut = { id: V4_CUT_IDS.authority, version: V4_CUT_VERSION };
        sourceBound = containsSourceLock(result, 'worms-port', V4_SOURCE_COMMIT, ['shared/simulation.ts']) &&
            result.transitionWitnesses.length > 0 && result.evidenceOrigin === 'authority-derived';
    } else if (declaration.pressureCaseId !== 'none') {
        const registration = D2A_CONFIG_REGISTRATIONS.find((item) => item.caseId === declaration.pressureCaseId);
        if (registration) {
            expectedProbeIds = registration.mandatoryEvidenceProbes;
            expectedProtectedFamily = getCutDefinition(D2A_TACTICAL_CUT_ID, D2A_TACTICAL_CUT_VERSION).protectedFamily;
            expectedCut = { id: D2A_TACTICAL_CUT_ID, version: D2A_TACTICAL_CUT_VERSION };
            const diagnostic = result.diagnostics.find((item) => item.schemaVersion === 1 &&
                item.evaluationObjectRef === registration.configId);
            const reportBound = diagnostic?.schemaVersion === 1 && [
                diagnostic.pathPressure,
                diagnostic.residueVisibility,
                diagnostic.localReorganization,
                diagnostic.cutFidelity,
                diagnostic.returnStrength,
                diagnostic.closureRisk
            ].every((axis) => axis.evidenceRefs.includes(registration.reportDigest));
            sourceBound = Boolean(reportBound) && result.evidenceOrigin === 'analysis-derived' &&
                containsSourceLock(result, 'worms-port', D2A_SOURCE_COMMIT, [
                    'analysis/tactical_model/model.py',
                    'analysis/tactical_model/run.py',
                    registration.sourcePath
                ]) && containsSourceLock(result, 'crpm', CRPM_SOURCE_COMMIT, [
                    'docs/architecture/CRPM_Evaluation_Language_Operational_Note_v0.md',
                    'emergence_lab_crpm/dynamic_return_obligation_crosswalk_source.py'
                ]);
            // Every currently registered D2A pressure case is historical rejected
            // evidence. A future acceptance can only be introduced by changing this
            // closed source registry with reviewed witness requirements.
            registeredAcceptancePassed = false;
        }
    }
    const declarationMatchesRegistry = sameStringSet(declaration.mandatoryEvidenceProbeIds, expectedProbeIds);
    const relevantDiagnostics = result.diagnostics.filter((item) => item.schemaVersion === 1);
    const protectedFamilyBound = expectedProtectedFamily.length > 0 &&
        sameStringSet(declaration.protectedFamily, expectedProtectedFamily) &&
        canonicalJson(declaration.activeFrame.cut) === canonicalJson(expectedCut) &&
        relevantDiagnostics.length > 0 && relevantDiagnostics.every((item) =>
            sameStringSet(item.protectedFamily, expectedProtectedFamily)
        ) && result.traces.flatMap((trace) => trace.transitionEdges).every((edge) =>
            sameStringSet(edge.protectedFamily, expectedProtectedFamily)
        );
    sourceBound = sourceBound && protectedFamilyBound;
    const mandatoryEvidenceComplete = declarationMatchesRegistry &&
        expectedProbeIds.every((probeId) => actualProbeIds.includes(probeId));
    return {
        sourceBound,
        mandatoryEvidenceComplete,
        boundedExecution: sourceBound && mandatoryEvidenceComplete && declaredWitnessesBound,
        reenterableEvidence: sourceBound && declaredWitnessesBound && availableWitnesses.length > 0,
        registeredAcceptancePassed
    };
}

function falseClosureReason(
    rule: FalseClosureRule,
    pressureCase: EvaluationPressureCase,
    triggered: boolean
): string {
    const prefix = triggered ? 'Triggered' : 'Guard retained';
    switch (rule) {
        case 'recursive_return_claimed_as_landfall':
            return `${prefix}: F2 recursive carrier return is a witnessed failure pressure, not a design-landfall acceptance.`;
        case 'aggregate_parity_masks_port_split':
            return `${prefix}: H2 aggregate first-actor rate cannot hide its distance-conditioned 704-band residue.`;
        case 'recurrence_repair_claimed_as_balance':
            return `${prefix}: F3 removes the witnessed recurrence through Threadback and 64 Escape Slack, but that structural repair does not establish initiative balance.`;
        case 'structural_success_claimed_as_initiative_repair':
            return `${prefix}: F4 structural success retains the 0.8 first-actor rate at distance 704 and cannot be promoted to initiative repair.`;
        case 'delayed_response_claimed_as_immediate_counter':
            return `${prefix}: H3 opens its Frayed Seam response only after the forced opening edge and an intervening normal action.`;
        case 'adapter_parity_claimed_as_design_landfall':
            return `${prefix}: authority-adapter equality witnesses wrapping parity only, not design quality, bounded landfall, or production activation.`;
        case 'rendered_trace_claimed_as_full_relation':
            return `${prefix}: a rendered or compact trace remains a reference-bearing projection and cannot stand in for the full source relation.`;
        default: {
            const exhaustive: never = rule;
            return `${prefix}: unsupported rule ${exhaustive} for ${pressureCase}.`;
        }
    }
}

function detectFalseClosures(
    declaration: EvaluationDeclaration,
    result: WorldDesignResult,
    witnesses: readonly DiagnosticWitnessReference[]
): FalseClosureDetection[] {
    const probes = new Map(scalarProbes(result).map((probe) => [probe.probeId, probe.value]));
    const caseId = declaration.pressureCaseId;
    const asserted = new Set(declaration.assertedClaims);
    const edges = result.traces.flatMap((trace) => trace.transitionEdges);
    const missingRenderedReferences = edges.some((edge) =>
        edge.sourceRefs.length === 0 || edge.carrierRefs.length < 2 || edge.witnessReferences.length === 0
    );
    const h2BandValues = [...probes.entries()]
        .filter(([id]) => id.startsWith('h2.distance_') && id.endsWith('_first_actor_win_rate'))
        .map(([, value]) => value);
    const conditions: Record<FalseClosureRule, boolean> = {
        recursive_return_claimed_as_landfall: caseId === 'f2' &&
            probes.has('f2.recurrence_matches') && Number(probes.get('f2.recurrence_matches')) > 0,
        aggregate_parity_masks_port_split: caseId === 'h2' &&
            probes.has('h2.aggregate_first_actor_win_rate') && new Set(h2BandValues).size > 1,
        recurrence_repair_claimed_as_balance: caseId === 'f3',
        structural_success_claimed_as_initiative_repair: caseId === 'f4' &&
            probes.has('f4.distance_704_first_actor_win_rate'),
        delayed_response_claimed_as_immediate_counter: caseId === 'h3' &&
            [...probes.entries()].some(([id, value]) => id.startsWith('h3.distance_') &&
                id.endsWith('_forced_opening_actions') && value > 0),
        adapter_parity_claimed_as_design_landfall: caseId === 'v4_adapter' &&
            result.evidenceOrigin === 'authority-derived',
        rendered_trace_claimed_as_full_relation: missingRenderedReferences
    };
    return FalseClosureRuleSchema.options.map((rule) => {
        const triggered = conditions[rule] || asserted.has(rule);
        return {
            schemaVersion: 1,
            rule,
            primaryPressureCase: caseId,
            triggered,
            reason: falseClosureReason(rule, caseId, triggered),
            witnessReferences: [...witnesses],
            blockedClaimId: `false-closure/${rule}`
        };
    });
}

function assessRegisteredEvaluationMaturity(
    gates: ReturnType<typeof registeredEvaluationBinding>,
    activeFalseClosureRules: readonly FalseClosureRule[]
) {
    const maturity = gates.boundedExecution ? 'M2_local_use' : 'M1_declaration';
    const blockingReasons = [
        ...(!gates.boundedExecution ? ['Bounded adapter execution and its tests are not witnessed as passing.'] : []),
        ...(!gates.sourceBound ? ['The result does not match the closed source-lock and report-witness registry.'] : []),
        ...(!gates.mandatoryEvidenceComplete ? ['The complete registered mandatory evidence family is not present.'] : []),
        ...(!gates.registeredAcceptancePassed ? ['The registered historical pressure case is not an acceptance pass.'] : []),
        ...(!gates.reenterableEvidence ? ['The declared evidence is not fully re-enterable.'] : []),
        ...activeFalseClosureRules.map((rule) => `False-closure rule remains active: ${rule}.`),
        'This evaluator cannot grant product authority; a separate closed owner-decision record is required.'
    ];
    return MaturityAssessmentSchema.parse({
        schemaVersion: 1,
        maturity,
        gates: {
            coherentOutput: true,
            declaredContract: true,
            boundedExecution: gates.boundedExecution,
            registeredSourceBinding: gates.sourceBound,
            mandatoryEvidenceComplete: gates.mandatoryEvidenceComplete,
            registeredAcceptancePressureCases: gates.registeredAcceptancePassed,
            reenterableEvidence: gates.reenterableEvidence
        },
        blockingReasons,
        productAuthority: 'none',
        productAuthorityReason: 'Maturity, adapter parity, scalar probes, and pressure-case results do not create product authority.'
    });
}

function axisValues(caseId: EvaluationPressureCase) {
    switch (caseId) {
        case 'f2': return {
            pathPressure: 'blocked_continuation' as const,
            localReorganization: 'same_line' as const,
            pathReason: 'The exact prepare_spoolburst then unweave_spoolburst line repeats a nonterminal tactical carrier.',
            localReason: 'The available line reconstructs the same declared tactical continuation rather than reorganizing it.'
        };
        case 'f3': return {
            pathPressure: 'mixed_routes' as const,
            localReorganization: 'material_reorganization' as const,
            pathReason: 'Threadback changes position and spends 64 Escape Slack, breaking the selected F2 recurrence while leaving initiative pressure explicit.',
            localReason: 'The response creates a different tactical carrier, but that does not establish initiative fairness.'
        };
        case 'f4': return {
            pathPressure: 'viable_routes' as const,
            localReorganization: 'material_reorganization' as const,
            pathReason: 'The declared sweep has no bounded forced opening, recurrence witness, or turn-limit result, with initiative residue retained.',
            localReason: 'Structural continuation is reorganized in the bounded model while the 704-band initiative warning remains.'
        };
        case 'h2': return {
            pathPressure: 'mixed_routes' as const,
            localReorganization: 'partial_reorganization' as const,
            pathReason: 'Aggregate near-parity coexists with materially different distance-conditioned routes.',
            localReason: 'The aggregate changes without eliminating the 704-band port split.'
        };
        case 'h3': return {
            pathPressure: 'forced_route_pressure' as const,
            localReorganization: 'delay_only' as const,
            pathReason: 'Forced openings remain at declared distance bands before the later counter port becomes usable.',
            localReason: 'The Frayed Seam counter follows a partial response and an intervening normal action, so it does not reorganize the same-horizon edge.'
        };
        case 'v4_adapter': return {
            pathPressure: 'not_assessed' as const,
            localReorganization: 'not_assessed' as const,
            pathReason: 'Authority wrapping preserves a command path but does not assess tactical route quality.',
            localReason: 'Adapter parity credits only authoritative state and event outcomes, not game-design reorganization.'
        };
        case 'none': return {
            pathPressure: 'not_assessed' as const,
            localReorganization: 'not_assessed' as const,
            pathReason: 'No registered pressure case was declared for route assessment.',
            localReason: 'No registered local-reorganization claim was declared.'
        };
    }
}

function buildProfile(
    declaration: EvaluationDeclaration,
    result: WorldDesignResult,
    witnesses: readonly DiagnosticWitnessReference[],
    detections: readonly FalseClosureDetection[],
    reenterable: boolean
): DiagnosticProfileV2 {
    const active = detections.filter((detection) => detection.triggered);
    const blockedClaims = detections.map((detection) => ({
        claimId: detection.blockedClaimId,
        reason: detection.reason,
        witnessReferences: [...detection.witnessReferences]
    }));
    const blockedClaimIds = blockedClaims.map((claim) => claim.claimId);
    const values = axisValues(declaration.pressureCaseId);
    const closureValue = active.length > 0 ? 'blocked_landfall' as const : 'present' as const;
    const boundaryResidue = declaration.pressureCaseId === 'v4_adapter' || declaration.pressureCaseId === 'none'
        ? 'within_cut' as const
        : 'boundary_residue' as const;
    const visibleResidue = [...declaration.residueDeclaration];
    const commonAxis = {
        witnessReferences: [...witnesses],
        visibleResidue,
        blockedClaimIds
    };
    return DiagnosticProfileV2Schema.parse({
        schemaVersion: 2,
        diagnosticId: `${declaration.evaluationId}-diagnostic`,
        diagnosticVersion: 2,
        evaluationObject: declaration.object,
        activeFrame: declaration.activeFrame,
        protectedFamily: declaration.protectedFamily,
        excludedClaims: declaration.excludedClaims,
        pathPressure: {
            ...commonAxis,
            value: values.pathPressure,
            reason: values.pathReason
        },
        residueVisibility: {
            ...commonAxis,
            value: 'explicit',
            reason: 'Resource, position, status, damage, timing, authority, and unmodelled residue remain explicit in the result and declaration.'
        },
        localReorganization: {
            ...commonAxis,
            value: values.localReorganization,
            reason: values.localReason
        },
        cutFidelity: {
            ...commonAxis,
            value: boundaryResidue,
            reason: boundaryResidue === 'within_cut'
                ? 'The conclusion remains limited to the declared authority cut and deterministic transcript.'
                : 'The conclusion remains bounded by the declared D2A policy, distance, terrain, aim, information, and authority exclusions.'
        },
        returnStrength: {
            ...commonAxis,
            value: reenterable ? 'reenterable' : 'partially_reenterable',
            reason: reenterable
                ? 'Source locks, carrier or report digests, witnesses, and the declared return route support deterministic re-entry.'
                : 'Some source support remains visible, but the declared evidence cannot yet be re-entered without reconstruction.'
        },
        closureRisk: {
            ...commonAxis,
            value: closureValue,
            reason: active.length > 0
                ? `Landfall is blocked by ${active.length} active false-closure rule(s).`
                : 'No registered false-closure rule fired, but qualitative owner judgment and excluded domains remain outside this evaluation.'
        },
        blockedClaims
    });
}

export function evaluateWorldDesignResult(
    declarationInput: unknown,
    resultInput: unknown
): EvaluationBundle {
    const declaration = EvaluationDeclarationSchema.parse(declarationInput);
    const result = WorldDesignResultSchema.parse(resultInput);
    if (declaration.object.objectRef !== result.resultId) {
        throw new Error('Evaluation object reference must match the supplied registered result.');
    }
    const witnesses = resultWitnesses(result);
    const probes = scalarProbes(result);
    const registered = registeredEvaluationBinding(declaration, result, probes, witnesses);
    const detections = detectFalseClosures(declaration, result, witnesses);
    const activeRules = detections.filter((detection) => detection.triggered).map((detection) => detection.rule);
    const maturityAssessment = assessRegisteredEvaluationMaturity(registered, activeRules);
    const diagnosticProfile = buildProfile(declaration, result, witnesses, detections, registered.reenterableEvidence);
    const displayed = new Set(declaration.optionalDisplayedScalarProbeIds);
    return buildEvaluationBundle({
        schemaVersion: 1,
        evaluationId: declaration.evaluationId,
        evaluationVersion: declaration.evaluationVersion,
        declaration,
        diagnosticProfile,
        scalarProbes: probes.filter((probe) => displayed.has(probe.probeId)),
        falseClosureDetections: detections,
        maturityAssessment
    });
}
import type { z } from 'zod';
