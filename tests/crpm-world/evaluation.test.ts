import assert from 'node:assert/strict';
import test from 'node:test';

import {
    executeWorldDesignEvaluation,
    readWorldDesignRequestFile
} from '../../analysis/crpm_world/design-port/execute-request';
import {
    D2A_CONFIG_REGISTRATIONS,
    type D2AConfigRegistration
} from '../../analysis/crpm_world/design-port/registry';
import {
    buildOfflineWorldDesignRequest,
    type OfflineWorldDesignRequestPayload
} from '../../analysis/crpm_world/design-port/validate-request';
import {
    assessEvaluationMaturity,
    evaluateWorldDesignResult
} from '../../analysis/crpm_world/evaluation/evaluate';
import { DiagnosticProfileV2Schema } from '../../analysis/crpm_world/schemas';
import type {
    EvaluationBundle,
    EvaluationPressureCase,
    FalseClosureRule
} from '../../analysis/crpm_world/evaluation/schemas';

const D2A_TEMPLATE = 'analysis/crpm_world/examples/d2a-f3-pressure-request.json';
const V4_TEMPLATE = 'analysis/crpm_world/examples/v4-transcript-request.json';
const cache = new Map<string, ReturnType<typeof executeWorldDesignEvaluation>>();

function d2aRequest(registration: D2AConfigRegistration): OfflineWorldDesignRequestPayload {
    const template = structuredClone(
        readWorldDesignRequestFile(D2A_TEMPLATE) as OfflineWorldDesignRequestPayload
    );
    return {
        ...template,
        requestId: `d2a-${registration.caseId}-evaluation-test`,
        baseline: {
            kind: 'd2a_config',
            id: registration.configId,
            version: registration.schemaVersion
        },
        scenarioDomain: {
            ...template.scenarioDomain,
            scenarioIds: [448, 512, 576, 640, 704].map((distance) =>
                `d2a-${registration.caseId}-distance-${distance}`
            ),
            constraints: [
                `Only the registered ${registration.caseId.toUpperCase()} five-distance deterministic sweep is requested.`,
                'The Python tactical model remains the analytical source and is not rewritten in TypeScript.'
            ]
        },
        sequence: [{
            sequence: 0,
            kind: 'policy',
            configId: registration.configId,
            policyFamily: 'registered-pressure-suite'
        }],
        requestedScalarProbes: [...registration.scalarProbes]
    };
}

function executeD2A(caseId: Exclude<EvaluationPressureCase, 'none' | 'v4_adapter'>) {
    const cached = cache.get(caseId);
    if (cached) return cached;
    const registration = D2A_CONFIG_REGISTRATIONS.find((item) => item.caseId === caseId);
    if (!registration) throw new Error(`Missing test registration ${caseId}.`);
    const execution = executeWorldDesignEvaluation(buildOfflineWorldDesignRequest(d2aRequest(registration)));
    cache.set(caseId, execution);
    return execution;
}

function detection(bundle: EvaluationBundle, rule: FalseClosureRule) {
    const found = bundle.falseClosureDetections.find((item) => item.rule === rule);
    if (!found) throw new Error(`Missing false-closure detection ${rule}.`);
    return found;
}

function claimAttempt(bundle: EvaluationBundle, caseId: 'f2' | 'f3' | 'f4' | 'h2' | 'h3') {
    return {
        ...bundle.declaration,
        acceptancePressureCases: [{
            caseId,
            status: 'passed' as const,
            reenterable: true,
            reason: 'Test pressure: pretend the local scalar or structural result was accepted.',
            witnessReferences: bundle.declaration.witnessReferences
        }]
    };
}

test('H2 aggregate parity remains a separate probe and cannot yield design landfall', () => {
    const { result, evaluation } = executeD2A('h2');
    const attempted = evaluateWorldDesignResult(claimAttempt(evaluation, 'h2'), result);
    const rule = detection(attempted, 'aggregate_parity_masks_port_split');

    assert.equal(rule.triggered, true);
    assert.equal(attempted.maturityAssessment.maturity, 'M2_local_use');
    assert.equal(attempted.maturityAssessment.productAuthority, 'none');
    assert.equal(attempted.diagnosticProfile.closureRisk.value, 'blocked_landfall');
    assert.equal(attempted.scalarProbes.find((probe) => probe.probeId === 'h2.aggregate_first_actor_win_rate')?.value, 0.488);
    assert.equal(attempted.scalarProbes.find((probe) => probe.probeId === 'h2.distance_704_first_actor_win_rate')?.value, 0.76);
    assert.equal('scalarProbes' in attempted.diagnosticProfile, false);
    assert.equal(DiagnosticProfileV2Schema.safeParse({
        ...attempted.diagnosticProfile,
        scalarProbes: attempted.scalarProbes
    }).success, false);
});

test('F3 recurrence repair is material reorganization without initiative success', () => {
    const { result, evaluation } = executeD2A('f3');
    const attempted = evaluateWorldDesignResult(claimAttempt(evaluation, 'f3'), result);
    const rule = detection(attempted, 'recurrence_repair_claimed_as_balance');

    assert.equal(rule.triggered, true);
    assert.equal(attempted.diagnosticProfile.localReorganization.value, 'material_reorganization');
    assert.match(attempted.diagnosticProfile.localReorganization.reason, /does not establish initiative fairness/);
    assert.equal(attempted.maturityAssessment.maturity, 'M2_local_use');
});

test('F4 structural success retains the 704 initiative warning', () => {
    const { result, evaluation } = executeD2A('f4');
    const attempted = evaluateWorldDesignResult(claimAttempt(evaluation, 'f4'), result);
    const rule = detection(attempted, 'structural_success_claimed_as_initiative_repair');

    assert.equal(rule.triggered, true);
    assert.match(rule.reason, /704/);
    assert.match(attempted.diagnosticProfile.localReorganization.reason, /704-band/);
    assert.equal(attempted.scalarProbes.find((probe) => probe.probeId === 'f4.distance_704_first_actor_win_rate')?.value, 0.8);
    assert.equal(attempted.maturityAssessment.maturity, 'M2_local_use');
});

test('H3 retains the same-horizon response failure', () => {
    const { result, evaluation } = executeD2A('h3');
    const attempted = evaluateWorldDesignResult(claimAttempt(evaluation, 'h3'), result);
    const rule = detection(attempted, 'delayed_response_claimed_as_immediate_counter');

    assert.equal(rule.triggered, true);
    assert.equal(attempted.diagnosticProfile.pathPressure.value, 'forced_route_pressure');
    assert.equal(attempted.diagnosticProfile.localReorganization.value, 'delay_only');
    assert.match(attempted.diagnosticProfile.localReorganization.reason, /intervening normal action/);
    assert.equal(attempted.maturityAssessment.maturity, 'M2_local_use');
});

test('V4 adapter parity is primary qualitative evidence but cannot produce M3 gameplay landfall', () => {
    const request = buildOfflineWorldDesignRequest(
        readWorldDesignRequestFile(V4_TEMPLATE) as OfflineWorldDesignRequestPayload
    );
    const { result, evaluation } = executeWorldDesignEvaluation(request);
    const rule = detection(evaluation, 'adapter_parity_claimed_as_design_landfall');

    assert.equal(result.diagnostics[0].schemaVersion, 2);
    assert.equal(rule.triggered, true);
    assert.equal(evaluation.diagnosticProfile.pathPressure.value, 'not_assessed');
    assert.equal(evaluation.maturityAssessment.maturity, 'M2_local_use');
    assert.equal(evaluation.maturityAssessment.productAuthority, 'none');
    assert.equal(result.productAuthority, 'authority-adapter-parity');
});

test('rendered full-relation claims fail closed and blocked claims are deterministic and witness-linked', () => {
    const { result, evaluation } = executeD2A('f3');
    const declaration = {
        ...evaluation.declaration,
        assertedClaims: ['rendered_trace_claimed_as_full_relation' as const]
    };
    const first = evaluateWorldDesignResult(declaration, result);
    const second = evaluateWorldDesignResult(declaration, result);
    const renderedRule = detection(first, 'rendered_trace_claimed_as_full_relation');

    assert.equal(renderedRule.triggered, true);
    assert.deepEqual(first, second);
    assert.equal(first.evaluationDigest, second.evaluationDigest);
    for (const claim of first.diagnosticProfile.blockedClaims) {
        assert.ok(claim.witnessReferences.length > 0);
        assert.ok(claim.witnessReferences.every((reference) => /^[0-9a-f]{64}$/.test(reference.digest)));
    }
    const claimIds = new Set(first.diagnosticProfile.blockedClaims.map((claim) => claim.claimId));
    for (const axis of [
        first.diagnosticProfile.pathPressure,
        first.diagnosticProfile.residueVisibility,
        first.diagnosticProfile.localReorganization,
        first.diagnosticProfile.cutFidelity,
        first.diagnosticProfile.returnStrength,
        first.diagnosticProfile.closureRisk
    ]) {
        assert.ok(axis.blockedClaimIds.every((claimId) => claimIds.has(claimId)));
    }
});

test('maturity gates are deterministic and M3 remains authority-none without a separate owner decision', () => {
    const base = {
        coherentOutput: true,
        declaredContract: true,
        boundedExecution: true,
        acceptancePressureCases: true,
        reenterableEvidence: true,
        activeFalseClosureRules: [],
        ownerDecision: { versionedRulesetApproved: false, decisionRef: null }
    };
    const withoutDecision = assessEvaluationMaturity(base);
    assert.equal(withoutDecision.maturity, 'M3_bounded_design_landfall');
    assert.equal(withoutDecision.productAuthority, 'none');

    const withDecision = assessEvaluationMaturity({
        ...base,
        ownerDecision: {
            versionedRulesetApproved: true,
            decisionRef: 'owner-decision/ruleset-v-next'
        }
    });
    assert.equal(withDecision.maturity, 'M3_bounded_design_landfall');
    assert.equal(withDecision.productAuthority, 'versioned-ruleset-approved');

    assert.equal(assessEvaluationMaturity({ ...base, declaredContract: false }).maturity, 'M0_appearance');
    assert.equal(assessEvaluationMaturity({ ...base, boundedExecution: false }).maturity, 'M1_declaration');
    assert.equal(assessEvaluationMaturity({ ...base, acceptancePressureCases: false }).maturity, 'M2_local_use');
});
