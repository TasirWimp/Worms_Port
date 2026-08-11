import assert from 'node:assert/strict';
import test from 'node:test';

import { sha256Digest } from '../../analysis/crpm_world/canonical';
import { traceVoyage } from '../../analysis/crpm_world/kernel/trace-voyage';
import {
    buildWorldDesignRequest,
    buildWorldDesignResult,
    DiagnosticProfileSchema,
    PortContractSchema,
    ProjectionTransportAssessmentSchema,
    ResidualLedgerSchema,
    ReturnAssessmentSchema,
    TransitionWitnessSchema,
    VoyageTraceSchema,
    WorldCarrierReferenceSchema,
    WorldCutDefinitionSchema,
    WorldDesignRequestSchema,
    WorldDesignResultSchema,
    WorldObligationSchema,
    WorldTransitionEdgeSchema,
    WorldTransitionEdgeV2Schema,
    parseRegisteredWorldDesignRequest
} from '../../analysis/crpm_world/schemas';
import {
    TEST_ADAPTER,
    digestLabel,
    makeCarrier,
    makeCut,
    makePortContract,
    makeResidualLedger,
    makeTransitionEdge,
    makeWorldDesignRequest,
    makeWorldDesignRequestPayload,
    makeWorldDesignResult,
    makeWorldDesignResultPayload
} from './fixtures';

test('all core versioned records accept their strict bounded fixtures', () => {
    const result = makeWorldDesignResult();
    const samples: Array<[string, { safeParse(input: unknown): { success: boolean } }, unknown]> = [
        ['WorldCarrierReference', WorldCarrierReferenceSchema, makeCarrier()],
        ['WorldCutDefinition', WorldCutDefinitionSchema, makeCut()],
        ['PortContract', PortContractSchema, makePortContract()],
        ['WorldTransitionEdge', WorldTransitionEdgeSchema, makeTransitionEdge()],
        ['TransitionWitness', TransitionWitnessSchema, result.transitionWitnesses[0]],
        ['ResidualLedger', ResidualLedgerSchema, makeResidualLedger()],
        ['WorldObligation', WorldObligationSchema, {
            schemaVersion: 2,
            obligationId: 'synthetic.open-obligation',
            obligationVersion: 2,
            obligationType: 'brace',
            origin: { kind: 'edge', edgeId: result.traces[0].transitionEdges[0].edgeId },
            roles: {
                owner: 'player', bearer: 'player', beneficiary: 'player', originator: 'player',
                eligibleResponders: ['player', 'loomkeeper']
            },
            supportCarrier: result.traces[0].transitionEdges[0].targetCarrier,
            legalResponses: ['Use only the declared synthetic response.'],
            expiryCondition: 'The declared support expires.',
            dischargeCondition: 'The declared support is discharged.',
            lifecycleStatus: 'open'
        }],
        ['ReturnAssessment', ReturnAssessmentSchema, result.returnAssessments[0]],
        ['VoyageTrace', VoyageTraceSchema, result.traces[0]],
        ['ProjectionTransportAssessment', ProjectionTransportAssessmentSchema, result.projectionAssessments[0]],
        ['DiagnosticProfile', DiagnosticProfileSchema, result.diagnostics[0]],
        ['WorldDesignRequest', WorldDesignRequestSchema, makeWorldDesignRequest()],
        ['WorldDesignResult', WorldDesignResultSchema, result]
    ];

    for (const [name, schema, sample] of samples) {
        assert.equal(schema.safeParse(sample).success, true, name);
        assert.equal(schema.safeParse({ ...(sample as object), unknownField: true }).success, false, `${name} strictness`);
        assert.equal(schema.safeParse({ ...(sample as object), schemaVersion: 99 }).success, false, `${name} version`);
    }
});

test('request and result digests bind meaningful content but exclude their own digest field', () => {
    const request = makeWorldDesignRequest();
    const { requestDigest, ...requestPayload } = request;
    assert.equal(requestDigest, sha256Digest(requestPayload));
    assert.equal(WorldDesignRequestSchema.safeParse({
        ...request,
        outputDetailLevel: 'summary'
    }).success, false);

    const result = makeWorldDesignResult();
    const { resultDigest, executionReceipt, ...resultPayload } = result;
    const { resultDigest: receiptResultDigest, ...receiptBase } = executionReceipt;
    assert.equal(receiptResultDigest, resultDigest);
    assert.equal(resultDigest, sha256Digest({ ...resultPayload, executionReceipt: receiptBase }));
    assert.equal(WorldDesignResultSchema.safeParse({
        ...result,
        blockedClaims: [...result.blockedClaims, 'A meaningful change.']
    }).success, false);
});

test('world-design request admission requires the supplied closed adapter/config/cut catalog', () => {
    const request = makeWorldDesignRequest();
    const port = makePortContract();
    assert.deepEqual(parseRegisteredWorldDesignRequest(request, port), request);

    const unregisteredAdapter = { id: 'not-registered', version: 1 };
    const payload = makeWorldDesignRequestPayload();
    const unregisteredRequest = buildWorldDesignRequest({
        ...payload,
        registeredAdapter: unregisteredAdapter,
        baselineOrConfigReference: {
            ...payload.baselineOrConfigReference,
            adapter: unregisteredAdapter
        }
    });
    assert.throws(
        () => parseRegisteredWorldDesignRequest(unregisteredRequest, port),
        /is not registered/
    );

    const noConfigPort = PortContractSchema.parse({
        ...port,
        catalogs: { ...port.catalogs, rulesetsOrConfigs: [] }
    });
    assert.throws(
        () => parseRegisteredWorldDesignRequest(request, noConfigPort),
        /Ruleset\/config .* is not registered/
    );
});

test('request schemas reject unsafe numeric content and unstable wall-clock fields', () => {
    for (const invalidNumber of [Number.NaN, Number.POSITIVE_INFINITY, -0, Number.MAX_SAFE_INTEGER + 1]) {
        const payload = makeWorldDesignRequestPayload();
        assert.throws(() => buildWorldDesignRequest({
            ...payload,
            scenarioDomain: { ...payload.scenarioDomain, seeds: [invalidNumber] },
            cut: {
                ...payload.cut,
                admissibleDomain: { ...payload.cut.admissibleDomain, seeds: [invalidNumber] }
            },
            seeds: [invalidNumber]
        }));
    }

    const payload = makeWorldDesignRequestPayload();
    assert.throws(() => buildWorldDesignRequest({
        ...payload,
        policyOrCommandSequence: [{
            ...payload.policyOrCommandSequence[0],
            payload: { type: 'move', direction: 1, generatedAt: '2026-08-10T12:00:00Z' }
        }]
    }));
});

test('request scope must remain inside its declared cut and protected family', () => {
    const payload = makeWorldDesignRequestPayload();
    assert.throws(() => buildWorldDesignRequest({
        ...payload,
        protectedFamily: ['An undeclared protected claim.']
    }));
    assert.throws(() => buildWorldDesignRequest({
        ...payload,
        scenarioDomain: {
            ...payload.scenarioDomain,
            scenarioIds: ['widened-scenario']
        }
    }));
});

test('edge typing keeps domain motifs separate from optional CRPM interpretation', () => {
    const edge = makeTransitionEdge();
    assert.equal(WorldTransitionEdgeSchema.safeParse(edge).success, true);
    assert.equal(WorldTransitionEdgeSchema.safeParse({
        ...edge,
        crpmTransitionInterpretation: 'move',
        crpmInterpretationJustification: 'A motif is not a primitive.'
    }).success, false);
    assert.equal(WorldTransitionEdgeSchema.safeParse({
        ...edge,
        crpmTransitionInterpretation: 'compress'
    }).success, false);
    assert.equal(WorldTransitionEdgeSchema.safeParse({
        ...edge,
        crpmTransitionInterpretation: 'compress',
        crpmInterpretationJustification: 'The declared cut intentionally drops the listed distinctions.'
    }).success, true);

    const { edgeKind: _edgeKind, ...withoutEdgeKind } = edge;
    assert.equal(WorldTransitionEdgeSchema.safeParse(withoutEdgeKind).success, false);
    assert.equal(WorldTransitionEdgeSchema.safeParse({
        ...edge,
        carrierRefs: [sha256Digest(edge.sourceCarrier), digestLabel('unrelated-carrier')]
    }).success, false);
    assert.equal(WorldTransitionEdgeSchema.safeParse({
        ...edge,
        reopeningCondition: 'Generated at 2026-08-10T12:00:00Z.'
    }).success, false);
});

test('projection transport requires explicit left/right witnesses for an aliasing split', () => {
    const base = makeWorldDesignResult().projectionAssessments[0];
    const left = {
        witnessRef: { witnessId: 'alias-left', digest: digestLabel('alias-left') },
        sourceClassKey: 'thin-source-class',
        targetClassKey: 'accepted-target-class',
        sourceItemRef: 'state-with-budget',
        targetItemRef: 'accepted-result'
    };
    const right = {
        witnessRef: { witnessId: 'alias-right', digest: digestLabel('alias-right') },
        sourceClassKey: 'thin-source-class',
        targetClassKey: 'rejected-target-class',
        sourceItemRef: 'state-without-budget',
        targetItemRef: 'rejected-result'
    };
    const relational = {
        ...base,
        sourceClasses: [{ classKey: 'thin-source-class', memberRefs: ['state-with-budget', 'state-without-budget'] }],
        targetClasses: [
            { classKey: 'accepted-target-class', memberRefs: ['accepted-result'] },
            { classKey: 'rejected-target-class', memberRefs: ['rejected-result'] }
        ],
        deterministicMapEligibility: false,
        aliasingKeys: ['thin-source-class'],
        leftAliasingWitness: left,
        rightAliasingWitness: right,
        recommendedShape: 'relation_or_kernel'
    };

    assert.equal(ProjectionTransportAssessmentSchema.safeParse(relational).success, true);
    assert.equal(ProjectionTransportAssessmentSchema.safeParse({
        ...relational,
        rightAliasingWitness: null
    }).success, false);
    assert.equal(ProjectionTransportAssessmentSchema.safeParse({
        ...relational,
        recommendedShape: 'map'
    }).success, false);
});

test('voyage compatibility checks ordered carrier and cut composition', () => {
    const voyage = makeWorldDesignResult().traces[0];
    assert.equal(VoyageTraceSchema.safeParse(voyage).success, true);

    const disconnectedEdge = {
        ...voyage.transitionEdges[0],
        sourceCarrier: makeCarrier(9, 'disconnected')
    };
    assert.equal(VoyageTraceSchema.safeParse({
        ...voyage,
        transitionEdges: [disconnectedEdge]
    }).success, false);
    assert.equal(VoyageTraceSchema.safeParse({
        ...voyage,
        transitionEdges: [disconnectedEdge],
        compatibilityResult: {
            compatible: false,
            checkedEdgeIds: [disconnectedEdge.edgeId],
            issues: ['The supplied source carrier does not compose.']
        }
    }).success, false, 'the edge itself still fails because its bound carrierRefs no longer match');
});

test('return assessments remain separate from world obligations and cannot mint landfall or authority', () => {
    const assessment = makeWorldDesignResult().returnAssessments[0];
    assert.deepEqual(
        assessment.classifications.map((item) => item.classification),
        ['visible_equal', 'protected_equivalent', 'recursive_carrier_return', 'invariant_region_return', 'finite_exact_return', 'route_mismatch']
    );
    const payload = makeWorldDesignResultPayload();
    assert.throws(() => buildWorldDesignResult({
        ...payload,
        maturity: 'M3_bounded_design_landfall'
    }));
    assert.throws(() => buildWorldDesignResult({
        ...payload,
        productAuthority: 'versioned-ruleset-approved'
    }));
});

test('carrier schema/profile changes require an explicit migration edge', () => {
    const edge = makeTransitionEdge();
    const migratedTarget = { ...edge.targetCarrier, profileVersion: edge.targetCarrier.profileVersion + 1 };
    const changed = {
        ...edge,
        targetCarrier: migratedTarget,
        carrierRefs: [sha256Digest(edge.sourceCarrier), sha256Digest(migratedTarget)]
    };
    assert.equal(WorldTransitionEdgeSchema.safeParse(changed).success, false);
    assert.equal(WorldTransitionEdgeSchema.safeParse({ ...changed, edgeKind: 'carrier-profile-migration' }).success, true);
});

test('result obligations are referentially closed and cannot discharge before opening', () => {
    const payload = makeWorldDesignResultPayload();
    const baseEdge = payload.traces[0].transitionEdges[0];
    const obligationId = 'synthetic.fixture.obligation';
    const openLedger = ResidualLedgerSchema.parse({
        ...baseEdge.residual,
        openedObligations: [obligationId],
        unresolvedObligations: [obligationId]
    });
    const openEdge = WorldTransitionEdgeV2Schema.parse({ ...baseEdge, residual: openLedger });
    const obligation = {
        schemaVersion: 2 as const,
        obligationId,
        obligationVersion: 2,
        obligationType: 'brace' as const,
        origin: { kind: 'edge' as const, edgeId: openEdge.edgeId },
        roles: {
            owner: 'player', bearer: 'player', beneficiary: 'player', originator: 'player',
            eligibleResponders: ['player', 'loomkeeper']
        },
        supportCarrier: openEdge.targetCarrier,
        legalResponses: ['Carry or discharge this exact synthetic obligation.'],
        expiryCondition: 'The synthetic right expires.',
        dischargeCondition: 'The synthetic obligation is discharged.',
        lifecycleStatus: 'open' as const
    };
    const openTrace = traceVoyage([openEdge], {
        voyageId: 'synthetic-open-voyage',
        externallySuppliedInputPorts: ['simulation-command']
    });
    const validPayload = {
        ...payload,
        traces: [openTrace],
        residualLedger: openLedger,
        worldObligations: [obligation]
    };
    assert.doesNotThrow(() => buildWorldDesignResult(validPayload));

    const unknownLedger = ResidualLedgerSchema.parse({
        ...openLedger,
        openedObligations: ['synthetic.unknown.obligation'],
        unresolvedObligations: ['synthetic.unknown.obligation']
    });
    const unknownEdge = WorldTransitionEdgeV2Schema.parse({ ...openEdge, residual: unknownLedger });
    const unknownTrace = traceVoyage([unknownEdge], {
        voyageId: 'synthetic-unknown-voyage',
        externallySuppliedInputPorts: ['simulation-command']
    });
    assert.throws(() => buildWorldDesignResult({
        ...validPayload,
        traces: [unknownTrace],
        residualLedger: unknownLedger
    }), /no typed world-obligation record/);

    const prematureLedger = ResidualLedgerSchema.parse({
        ...openLedger,
        openedObligations: [],
        dischargedObligations: [obligationId],
        unresolvedObligations: []
    });
    const prematureEdge = WorldTransitionEdgeV2Schema.parse({ ...openEdge, residual: prematureLedger });
    const prematureTrace = traceVoyage([prematureEdge], {
        voyageId: 'synthetic-premature-voyage',
        externallySuppliedInputPorts: ['simulation-command']
    });
    assert.throws(() => buildWorldDesignResult({
        ...validPayload,
        traces: [prematureTrace],
        residualLedger: prematureLedger,
        worldObligations: [{ ...obligation, lifecycleStatus: 'discharged' }]
    }), /cannot discharge before it opens/);
});

test('voyage and result summaries are derived from edges and reject caller-only mutations', () => {
    const payload = makeWorldDesignResultPayload();
    const trace = payload.traces[0];
    assert.throws(() => buildWorldDesignResult({
        ...payload,
        traces: [{
            ...trace,
            accumulatedResidual: {
                ...trace.accumulatedResidual,
                excludedUnmodelledResidue: [
                    ...trace.accumulatedResidual.excludedUnmodelledResidue,
                    'Caller-only trace residue mutation.'
                ]
            }
        }]
    }), /accumulatedResidual must equal the canonical edge-derived voyage summary/);

    assert.throws(() => buildWorldDesignResult({
        ...payload,
        traces: [{
            ...trace,
            obligationHistory: {
                ...trace.obligationHistory,
                carried: ['caller-only-obligation']
            }
        }]
    }), /obligationHistory must equal the canonical edge-derived voyage summary/);

    assert.throws(() => buildWorldDesignResult({
        ...payload,
        residualLedger: {
            ...payload.residualLedger,
            excludedUnmodelledResidue: [
                ...payload.residualLedger.excludedUnmodelledResidue,
                'Caller-only result residue mutation.'
            ]
        }
    }), /Result residual ledger must equal the canonical aggregation/);
});

test('diagnostic axes stay non-scalar while scalar probes remain subordinate', () => {
    const profile = makeWorldDesignResult().diagnostics[0];
    assert.equal(profile.schemaVersion, 1);
    if (profile.schemaVersion !== 1) throw new Error('Fixture requires the v1 compatibility profile.');
    assert.equal(DiagnosticProfileSchema.safeParse(profile).success, true);
    assert.equal(DiagnosticProfileSchema.safeParse({
        ...profile,
        pathPressure: 0.5
    }).success, false);
    assert.equal(DiagnosticProfileSchema.safeParse({
        ...profile,
        scalarProbes: [{ ...profile.scalarProbes[0], value: -0 }]
    }).success, false);
});

test('witness mismatch status requires explicit residual and exact evidence lineage', () => {
    const witness = makeWorldDesignResult().transitionWitnesses[0];
    assert.equal(TransitionWitnessSchema.safeParse({
        ...witness,
        status: 'mismatch'
    }).success, false);
    assert.equal(TransitionWitnessSchema.safeParse({
        ...witness,
        status: 'mismatch',
        mismatchResidual: makeResidualLedger()
    }).success, true);
    assert.equal(TransitionWitnessSchema.safeParse({
        ...witness,
        covarianceGroup: ''
    }).success, false);
});

test('fixture adapter remains analysis-only and synthetic', () => {
    assert.equal(TEST_ADAPTER.id, 'contract-test-adapter');
    assert.notEqual(TEST_ADAPTER.id, 'v4-authority-adapter');
});
