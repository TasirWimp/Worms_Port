import { z } from 'zod';

import { compareCanonicalText, sha256Digest } from '../canonical';
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

const MaturityGateInputSchema = z.strictObject({
    coherentOutput: z.boolean(),
    declaredContract: z.boolean(),
    boundedExecution: z.boolean(),
    acceptancePressureCases: z.boolean(),
    reenterableEvidence: z.boolean(),
    activeFalseClosureRules: z.array(FalseClosureRuleSchema).max(6),
    ownerDecision: EvaluationDeclarationSchema.shape.ownerDecision
});

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

function scalarProbes(result: WorldDesignResult) {
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

function falseClosureReason(
    rule: FalseClosureRule,
    pressureCase: EvaluationPressureCase,
    triggered: boolean
): string {
    const prefix = triggered ? 'Triggered' : 'Guard retained';
    switch (rule) {
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
        aggregate_parity_masks_port_split: caseId === 'h2' &&
            probes.has('h2.aggregate_first_actor_win_rate') && new Set(h2BandValues).size > 1,
        recurrence_repair_claimed_as_balance: caseId === 'f3',
        structural_success_claimed_as_initiative_repair: caseId === 'f4' &&
            probes.has('f4.distance_704_first_actor_win_rate'),
        delayed_response_claimed_as_immediate_counter: caseId === 'h3' &&
            [...probes.entries()].some(([id, value]) => id.startsWith('h3.distance_') &&
                id.endsWith('_forced_opening_actions') && value > 0),
        adapter_parity_claimed_as_design_landfall: caseId === 'v4_adapter' ||
            result.productAuthority === 'authority-adapter-parity',
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

export function assessEvaluationMaturity(input: unknown) {
    const gates = MaturityGateInputSchema.parse(input);
    if (!gates.coherentOutput) throw new Error('M0 requires a coherent deterministic output.');
    const activeFalseClosures = gates.activeFalseClosureRules.length > 0;
    const maturity = gates.declaredContract
        ? gates.boundedExecution
            ? gates.acceptancePressureCases && gates.reenterableEvidence && !activeFalseClosures
                ? 'M3_bounded_design_landfall'
                : 'M2_local_use'
            : 'M1_declaration'
        : 'M0_appearance';
    const approved = maturity === 'M3_bounded_design_landfall' &&
        gates.ownerDecision.versionedRulesetApproved && gates.ownerDecision.decisionRef !== null;
    const blockingReasons = [
        ...(!gates.declaredContract ? ['Cut, protected family, domain, witness, residue, or return declaration is incomplete.'] : []),
        ...(!gates.boundedExecution ? ['Bounded adapter execution and its tests are not witnessed as passing.'] : []),
        ...(!gates.acceptancePressureCases ? ['All acceptance pressure cases for the declared scope have not passed.'] : []),
        ...(!gates.reenterableEvidence ? ['The declared evidence is not fully re-enterable.'] : []),
        ...gates.activeFalseClosureRules.map((rule) => `False-closure rule remains active: ${rule}.`),
        ...(!approved ? ['No separate owner-approved versioned-ruleset decision grants product authority.'] : [])
    ];
    return MaturityAssessmentSchema.parse({
        schemaVersion: 1,
        maturity,
        gates: {
            coherentOutput: gates.coherentOutput,
            declaredContract: gates.declaredContract,
            boundedExecution: gates.boundedExecution,
            acceptancePressureCases: gates.acceptancePressureCases,
            reenterableEvidence: gates.reenterableEvidence
        },
        blockingReasons,
        productAuthority: approved ? 'versioned-ruleset-approved' : 'none',
        productAuthorityReason: approved
            ? `Product authority is limited to the separately recorded decision ${gates.ownerDecision.decisionRef}.`
            : 'Maturity, adapter parity, scalar probes, and pressure-case results do not create product authority.'
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
    const witnesses = sortedUnique(
        [...resultWitnesses(result), ...declaration.witnessReferences],
        (reference) => `${reference.witnessId}:${reference.digest}`
    );
    const detections = detectFalseClosures(declaration, result, witnesses);
    const allAcceptanceCasesPass = declaration.acceptancePressureCases.length > 0 &&
        declaration.acceptancePressureCases.every((pressureCase) => pressureCase.status === 'passed');
    const reenterable = result.sourceLocks.length > 0 && witnesses.length > 0 &&
        declaration.acceptancePressureCases.every((pressureCase) => pressureCase.reenterable);
    const activeRules = detections.filter((detection) => detection.triggered).map((detection) => detection.rule);
    const maturityAssessment = assessEvaluationMaturity({
        coherentOutput: true,
        declaredContract: true,
        boundedExecution: declaration.boundedExecution.passed,
        acceptancePressureCases: allAcceptanceCasesPass,
        reenterableEvidence: reenterable,
        activeFalseClosureRules: activeRules,
        ownerDecision: declaration.ownerDecision
    });
    const diagnosticProfile = buildProfile(declaration, result, witnesses, detections, reenterable);
    return buildEvaluationBundle({
        schemaVersion: 1,
        evaluationId: declaration.evaluationId,
        evaluationVersion: declaration.evaluationVersion,
        declaration,
        diagnosticProfile,
        scalarProbes: scalarProbes(result),
        falseClosureDetections: detections,
        maturityAssessment
    });
}
