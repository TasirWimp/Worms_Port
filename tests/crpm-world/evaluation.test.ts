import assert from 'node:assert/strict';
import test from 'node:test';

import { sha256Digest } from '../../analysis/crpm_world/canonical';

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
    evaluateWorldDesignResult
} from '../../analysis/crpm_world/evaluation/evaluate';
import { DiagnosticProfileV2Schema, buildWorldDesignResult } from '../../analysis/crpm_world/schemas';
import type { WorldDesignResult, WorldDesignResultPayload } from '../../analysis/crpm_world/types';
import type {
    EvaluationBundle,
    EvaluationPressureCase,
    FalseClosureRule
} from '../../analysis/crpm_world/evaluation/schemas';

const D2A_TEMPLATE = 'analysis/crpm_world/examples/d2a-f3-pressure-request.json';
const V4_TEMPLATE = 'analysis/crpm_world/examples/v4-transcript-request.json';
const cache = new Map<string, ReturnType<typeof executeWorldDesignEvaluation>>();

function rebuildResult(
    result: WorldDesignResult,
    overrides: Partial<WorldDesignResultPayload>
): WorldDesignResult {
    const { resultDigest: _resultDigest, executionReceipt, ...base } = result;
    const { resultDigest: _receiptResultDigest, ...receiptBase } = executionReceipt;
    const next = { ...base, ...overrides };
    const suppliedReceipt = overrides.executionReceipt ?? receiptBase;
    return buildWorldDesignResult({
        ...next,
        executionReceipt: {
            ...suppliedReceipt,
            sourceLocks: next.sourceLocks,
            requestDigest: next.requestDigest
        }
    });
}

function d2aRequest(
    registration: D2AConfigRegistration,
    optionalDisplayedScalarProbes: readonly string[] = registration.mandatoryEvidenceProbes
): OfflineWorldDesignRequestPayload {
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
        mandatoryEvidenceProbes: [...registration.mandatoryEvidenceProbes],
        optionalDisplayedScalarProbes: [...optionalDisplayedScalarProbes]
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

test('H2 aggregate parity remains a separate probe and cannot yield design landfall', () => {
    const registration = D2A_CONFIG_REGISTRATIONS.find((item) => item.caseId === 'h2')!;
    const request = buildOfflineWorldDesignRequest(d2aRequest(registration, [
        'h2.aggregate_first_actor_win_rate'
    ]));
    const { evaluation } = executeWorldDesignEvaluation(request);
    const rule = detection(evaluation, 'aggregate_parity_masks_port_split');

    assert.equal(rule.triggered, true);
    assert.equal(evaluation.maturityAssessment.maturity, 'M2_local_use');
    assert.equal(evaluation.maturityAssessment.productAuthority, 'none');
    assert.equal(evaluation.diagnosticProfile.closureRisk.value, 'blocked_landfall');
    assert.deepEqual(evaluation.scalarProbes.map((probe) => probe.probeId), ['h2.aggregate_first_actor_win_rate']);
    assert.equal('scalarProbes' in evaluation.diagnosticProfile, false);
    assert.equal(DiagnosticProfileV2Schema.safeParse({
        ...evaluation.diagnosticProfile,
        scalarProbes: evaluation.scalarProbes
    }).success, false);
});

test('mandatory historical evidence cannot be filtered out by a request', () => {
    for (const caseId of ['h2', 'f4', 'h3'] as const) {
        const registration = D2A_CONFIG_REGISTRATIONS.find((item) => item.caseId === caseId)!;
        const payload = d2aRequest(registration);
        assert.throws(() => buildOfflineWorldDesignRequest({
            ...payload,
            mandatoryEvidenceProbes: [registration.mandatoryEvidenceProbes[0]]
        }), /must exactly match registered D2A config/);
    }
});

test('F2 recursive carrier return remains failure pressure and cannot yield M3', () => {
    const { evaluation } = executeD2A('f2');
    assert.equal(detection(evaluation, 'recursive_return_claimed_as_landfall').triggered, true);
    assert.equal(evaluation.maturityAssessment.maturity, 'M2_local_use');
    assert.equal(evaluation.maturityAssessment.gates.registeredAcceptancePressureCases, false);
});

test('F3 recurrence repair is material reorganization without initiative success', () => {
    const { evaluation } = executeD2A('f3');
    const rule = detection(evaluation, 'recurrence_repair_claimed_as_balance');

    assert.equal(rule.triggered, true);
    assert.equal(evaluation.diagnosticProfile.localReorganization.value, 'material_reorganization');
    assert.match(evaluation.diagnosticProfile.localReorganization.reason, /does not establish initiative fairness/);
    assert.equal(evaluation.maturityAssessment.maturity, 'M2_local_use');
});

test('F4 structural success retains the 704 initiative warning', () => {
    const { evaluation } = executeD2A('f4');
    const rule = detection(evaluation, 'structural_success_claimed_as_initiative_repair');

    assert.equal(rule.triggered, true);
    assert.match(rule.reason, /704/);
    assert.match(evaluation.diagnosticProfile.localReorganization.reason, /704-band/);
    assert.equal(evaluation.scalarProbes.find((probe) => probe.probeId === 'f4.distance_704_first_actor_win_rate')?.value, 0.8);
    assert.equal(evaluation.maturityAssessment.maturity, 'M2_local_use');
});

test('H3 retains the same-horizon response failure', () => {
    const { evaluation } = executeD2A('h3');
    const rule = detection(evaluation, 'delayed_response_claimed_as_immediate_counter');

    assert.equal(rule.triggered, true);
    assert.equal(evaluation.diagnosticProfile.pathPressure.value, 'forced_route_pressure');
    assert.equal(evaluation.diagnosticProfile.localReorganization.value, 'delay_only');
    assert.match(evaluation.diagnosticProfile.localReorganization.reason, /intervening normal action/);
    assert.equal(evaluation.maturityAssessment.maturity, 'M2_local_use');
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
    assert.equal(result.productAuthority, 'none');
    assert.equal(result.evidenceOrigin, 'authority-derived');
    assert.equal(result.authorityProvenance.relationship, 'authority_adapter_parity');
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

test('caller-authored decisions, pass flags, and synthetic locks cannot mint maturity or authority', () => {
    const { result, evaluation } = executeD2A('f3');
    assert.throws(() => evaluateWorldDesignResult({
        ...evaluation.declaration,
        ownerDecision: { versionedRulesetApproved: true, decisionRef: 'arbitrary-decision' }
    }, result));
    assert.throws(() => evaluateWorldDesignResult({
        ...evaluation.declaration,
        boundedExecution: { ...evaluation.declaration.boundedExecution, passed: true },
        acceptancePressureCases: [{ status: 'passed', reenterable: true }]
    }, result));

    const synthetic = rebuildResult(result, {
        sourceLocks: [{
            repositoryId: 'worms-port',
            commit: '1111111111111111111111111111111111111111',
            paths: ['analysis/tactical_model/model.py']
        }]
    });
    const assessed = evaluateWorldDesignResult(evaluation.declaration, synthetic);
    assert.equal(assessed.maturityAssessment.maturity, 'M1_declaration');
    assert.equal(assessed.maturityAssessment.productAuthority, 'none');
    assert.equal(assessed.maturityAssessment.gates.registeredSourceBinding, false);

    const shortenedProtectedFamily = evaluateWorldDesignResult({
        ...evaluation.declaration,
        protectedFamily: [evaluation.declaration.protectedFamily[0]]
    }, result);
    assert.equal(shortenedProtectedFamily.maturityAssessment.maturity, 'M1_declaration');
    assert.equal(shortenedProtectedFamily.maturityAssessment.gates.registeredSourceBinding, false);

    const genericReference = {
        witnessId: 'generic-evidence-string',
        digest: sha256Digest('generic evidence is not a re-entry witness')
    };
    const genericEvidence = evaluateWorldDesignResult({
        ...evaluation.declaration,
        witnessReferences: [genericReference],
        boundedExecution: {
            ...evaluation.declaration.boundedExecution,
            witnessReferences: [genericReference]
        }
    }, result);
    assert.equal(genericEvidence.maturityAssessment.maturity, 'M1_declaration');
    assert.equal(genericEvidence.maturityAssessment.gates.reenterableEvidence, false);

    const fakeCommit = '1'.repeat(40);
    const fakeTree = '2'.repeat(40);
    const fakeBlobs = result.executionReceipt.implementationPaths.map((path) => ({
        path,
        blobOid: '3'.repeat(40)
    }));
    const fakeReceipt = {
        ...result.executionReceipt,
        implementationCommit: fakeCommit,
        implementationTree: fakeTree,
        implementationFileBlobs: fakeBlobs,
        implementationBundleDigest: sha256Digest({
            repositoryId: 'worms-port',
            implementationCommit: fakeCommit,
            implementationTree: fakeTree,
            implementationFileBlobs: fakeBlobs
        })
    };
    const selfConsistentFiction = rebuildResult(result, { executionReceipt: fakeReceipt });
    const fictionAssessment = evaluateWorldDesignResult(evaluation.declaration, selfConsistentFiction);
    assert.equal(fictionAssessment.maturityAssessment.maturity, 'M1_declaration');
    assert.equal(fictionAssessment.maturityAssessment.gates.registeredSourceBinding, false);
});

test('registered probe bundle values are source-bound and cannot be altered under valid ids and locks', () => {
    for (const caseId of ['f2', 'f4', 'h2', 'h3'] as const) {
        const { result, evaluation } = executeD2A(caseId);
        const diagnostics = result.diagnostics.map((diagnostic) => {
            if (diagnostic.schemaVersion !== 1 || diagnostic.scalarProbes.length === 0) return diagnostic;
            return {
                ...diagnostic,
                scalarProbes: diagnostic.scalarProbes.map((probe, index) => index === 0
                    ? { ...probe, value: probe.value + 1 }
                    : probe)
            };
        });
        const altered = rebuildResult(result, { diagnostics });
        const reassessed = evaluateWorldDesignResult(evaluation.declaration, altered);
        assert.equal(reassessed.maturityAssessment.maturity, 'M1_declaration', caseId);
        assert.equal(reassessed.maturityAssessment.gates.registeredSourceBinding, false, caseId);
        assert.equal(reassessed.maturityAssessment.productAuthority, 'none', caseId);
    }
});

test('V4 mandatory probe values are derived from authoritative edge responses', () => {
    const request = buildOfflineWorldDesignRequest(
        readWorldDesignRequestFile(V4_TEMPLATE) as OfflineWorldDesignRequestPayload
    );
    const { result, evaluation } = executeWorldDesignEvaluation(request);
    const diagnostics = result.diagnostics.map((diagnostic) => {
        if (diagnostic.schemaVersion !== 1) return diagnostic;
        return {
            ...diagnostic,
            scalarProbes: diagnostic.scalarProbes.map((probe) =>
                probe.probeId === 'v4.event_count' ? { ...probe, value: probe.value + 1 } : probe
            )
        };
    });
    const altered = rebuildResult(result, { diagnostics });
    const reassessed = evaluateWorldDesignResult(evaluation.declaration, altered);
    assert.equal(reassessed.maturityAssessment.maturity, 'M1_declaration');
    assert.equal(reassessed.maturityAssessment.gates.registeredSourceBinding, false);
    assert.equal(reassessed.maturityAssessment.productAuthority, 'none');
});
