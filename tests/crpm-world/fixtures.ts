import { sha256Digest } from '../../analysis/crpm_world/canonical';
import {
    buildWorldDesignRequest,
    buildWorldDesignResult,
    PortContractSchema,
    ResidualLedgerSchema,
    ScenarioDomainSchema,
    WorldCarrierReferenceSchema,
    WorldCutDefinitionSchema,
    WorldTransitionEdgeSchema
} from '../../analysis/crpm_world/schemas';
import { assessReturn } from '../../analysis/crpm_world/kernel/assess-return';

export const TEST_SEED = 3_237_998_097;
export const TEST_COMMIT = 'af23717e61fea6995bf3b7209211ae1aaa2bb855';
export const TEST_ADAPTER = Object.freeze({ id: 'contract-test-adapter', version: 1 });
export const TEST_RULESET = 'nimble-knots-artillery-v4';

export function digestLabel(label: string): string {
    return sha256Digest({ label });
}

export function makeScenarioDomain() {
    return ScenarioDomainSchema.parse({
        schemaVersion: 1,
        scenarioIds: ['v4-contract-test'],
        actionFamilies: ['move'],
        policyFamilies: ['declared-command-sequence'],
        seeds: [TEST_SEED],
        constraints: ['One bounded contract-test scenario only.']
    });
}

export function makeCarrier(revisionOrStep = 0, stateLabel = 'source') {
    return WorldCarrierReferenceSchema.parse({
        schemaVersion: 1,
        profileVersion: 1,
        carrierKind: 'authority',
        adapter: TEST_ADAPTER,
        rulesetOrConfigId: TEST_RULESET,
        baselineDigest: digestLabel('baseline'),
        stateDigest: digestLabel(stateLabel),
        revisionOrStep,
        sourceReference: `shared/simulation.ts#${stateLabel}`
    });
}

export function makeResidualLedger() {
    return ResidualLedgerSchema.parse({
        schemaVersion: 1,
        positionDeltas: [],
        resourceDeltas: [],
        healthDeltas: [],
        statusDeltas: [],
        terrainDeltas: [],
        authorityDeltas: [],
        expiredRights: [],
        openedObligations: [],
        carriedObligations: [],
        dischargedObligations: [],
        unresolvedObligations: [],
        excludedUnmodelledResidue: ['No adapter or gameplay parity is claimed by this synthetic fixture.']
    });
}

export function makeCut() {
    return WorldCutDefinitionSchema.parse({
        schemaVersion: 1,
        cutId: 'authority-contract-cut',
        cutVersion: 1,
        sourceCarrierKind: 'authority',
        projectionDescription: 'Retain the bounded authority fields named by the contract test.',
        admissibleDomain: makeScenarioDomain(),
        protectedFamily: [
            'Existing V4 authority remains unchanged.',
            'The declared one-command domain remains recoverable.'
        ],
        includedSupport: ['source-lock', 'state-digest', 'ordered-event-digest'],
        intentionallyForgottenDistinctions: ['Presentation-only layout detail.'],
        excludedClaims: ['No full replay or all-command parity is claimed.'],
        deterministicContinuationClaim: 'bounded'
    });
}

export function makePortContract() {
    const port = (id: string, description: string) => ({ id, description, required: true });
    return PortContractSchema.parse({
        schemaVersion: 1,
        profileVersion: 1,
        portContractId: 'crpm-world-contract-test-port',
        portContractVersion: 1,
        catalogs: {
            adapters: [TEST_ADAPTER],
            rulesetsOrConfigs: [TEST_RULESET],
            cuts: [{ id: makeCut().cutId, version: makeCut().cutVersion }],
            edgeKinds: ['authority-projection'],
            domainMotifs: ['move']
        },
        contextPorts: [port('context-baseline', 'Sealed baseline context.')],
        inputPorts: [port('input-request', 'Strict world-design request.')],
        outputPorts: [port('output-result', 'Strict world-design result.')],
        observedPorts: [port('observed-authority', 'Read-only authority carrier.')],
        actuatedPorts: [port('actuated-domain', 'Bounded scenario-domain choice.')],
        evidencePorts: [port('evidence-witness', 'Digest-bound transition witness.')],
        supportPorts: [port('support-carrier', 'Source and target carrier support.')],
        returnPorts: [port('return-obligation', 'Separately typed return obligation.')],
        forbiddenPorts: [port('forbidden-activation', 'Live gameplay activation is forbidden.')],
        escalationTriggers: ['Stop on an unknown adapter, config, cut, field, or widened domain.']
    });
}

export function makeTransitionEdge() {
    const sourceCarrier = makeCarrier(0, 'source');
    const targetCarrier = makeCarrier(1, 'target');
    return WorldTransitionEdgeSchema.parse({
        schemaVersion: 2,
        edgeId: 'authority-projection-edge',
        edgeVersion: 1,
        edgeKind: 'authority-projection',
        domainMotif: 'move',
        portBindings: {
            contextPorts: ['authority-state'],
            actionPorts: ['simulation-command'],
            responsePorts: ['simulation-transition'],
            evidencePorts: ['transition-witness'],
            supportPorts: ['authority-carrier'],
            returnPorts: ['authority-reentry']
        },
        sourceCarrier,
        targetCarrier,
        sourceCut: { id: 'authority-contract-cut', version: 1 },
        targetCut: { id: 'authority-contract-cut', version: 1 },
        fixedFrame: {
            schemaVersion: 1,
            sourceLocks: [{
                repositoryId: 'worms-port',
                commit: TEST_COMMIT,
                paths: ['shared/simulation.ts']
            }],
            baselineOrConfigId: TEST_RULESET,
            adapter: TEST_ADAPTER,
            scenarioDomain: makeScenarioDomain(),
            sourceCut: { id: 'authority-contract-cut', version: 1 },
            targetCut: { id: 'authority-contract-cut', version: 1 },
            actorOrPolicy: 'player',
            expectedRevisionOrStep: 0
        },
        commandOrDeclaration: { type: 'move', direction: 1 },
        response: { accepted: true, mutated: true },
        protectedFamily: makeCut().protectedFamily,
        sourceRefs: [`worms-port@${TEST_COMMIT}:shared/simulation.ts`],
        witnessReferences: [{ witnessId: 'authority-witness-0', digest: digestLabel('witness') }],
        decoderRefs: ['authority-state-decoder-v1'],
        carrierRefs: [sha256Digest(sourceCarrier), sha256Digest(targetCarrier)],
        pathPosition: 0,
        preserved: ['The declared accepted/mutated outcome.'],
        forgotten: ['Presentation-only layout detail.'],
        newlyVisible: ['Bounded projection support status.'],
        residual: makeResidualLedger(),
        reversibility: 'protected_equivalent',
        returnCondition: 'Compare through the declared authority-state decoder.',
        reopeningCondition: 'Reopen on any state, event, source-lock, or digest mismatch.',
        supportStatus: 'declared',
        productAuthority: 'none',
        authorityDefinitionMutationObserved: false
    });
}

export function makeWorldDesignRequestPayload() {
    const cut = makeCut();
    const domain = makeScenarioDomain();
    return {
        schemaVersion: 1 as const,
        requestId: 'world-design-request-test',
        requestVersion: 1,
        profileVersion: 1,
        registeredAdapter: TEST_ADAPTER,
        baselineOrConfigReference: makeCarrier(),
        scenarioDomain: domain,
        cut,
        protectedFamily: cut.protectedFamily,
        policyOrCommandSequence: [{
            sequence: 0,
            kind: 'command' as const,
            catalogId: 'move-right',
            payload: { type: 'move', direction: 1 }
        }],
        seeds: [TEST_SEED],
        outputDetailLevel: 'full' as const,
        excludedClaims: ['No runtime or all-command parity is claimed.']
    };
}

export function makeWorldDesignRequest() {
    return buildWorldDesignRequest(makeWorldDesignRequestPayload());
}

function makeDiagnosticAxis(assessment: string) {
    return {
        assessment,
        evidenceRefs: ['authority-witness-0'],
        visibleResidue: ['Finite synthetic fixture only.'],
        blockedClaims: ['No global conclusion.']
    };
}

export function makeWorldDesignResultPayload() {
    const request = makeWorldDesignRequest();
    const edge = makeTransitionEdge();
    const residual = makeResidualLedger();
    const witnessRef = edge.witnessReferences[0];
    return {
        schemaVersion: 1 as const,
        resultId: 'world-design-result-test',
        resultVersion: 1,
        requestDigest: request.requestDigest,
        sourceLocks: edge.fixedFrame.sourceLocks,
        traces: [{
            schemaVersion: 1 as const,
            voyageId: 'voyage-test',
            voyageVersion: 1,
            initialCarrier: edge.sourceCarrier,
            transitionEdges: [edge],
            finalCarrier: edge.targetCarrier,
            compatibilityResult: {
                compatible: true,
                checkedEdgeIds: [edge.edgeId],
                issues: []
            },
            accumulatedResidual: residual,
            terminalResult: {
                status: 'completed' as const,
                summary: 'The bounded synthetic edge composed.',
                excludedClaims: ['No production voyage or return is claimed.']
            },
            recurrenceWitnesses: [],
            returnWitnesses: [],
            replaySupport: {
                supported: false,
                replayRecordRefs: [],
                stateHashRefs: [],
                limitations: ['No replay adapter exists in this gate.']
            }
        }],
        transitionWitnesses: [{
            schemaVersion: 1 as const,
            witnessId: witnessRef.witnessId,
            witnessVersion: 1,
            edgeId: edge.edgeId,
            evidenceOrigin: 'synthetic-contract-test' as const,
            covarianceGroup: 'contract-test-lineage',
            deduplicationIdentity: digestLabel('deduplication'),
            sourceRefs: edge.sourceRefs,
            decoderRefs: edge.decoderRefs,
            inputDigest: edge.sourceCarrier.stateDigest,
            outputDigest: edge.targetCarrier.stateDigest,
            status: 'exact' as const,
            excludedClaims: ['No authority parity is established.']
        }],
        projectionAssessments: [{
            schemaVersion: 1 as const,
            assessmentId: 'projection-assessment-test',
            assessmentVersion: 1,
            sourceClasses: [{ classKey: 'source-class', memberRefs: ['source-item'] }],
            targetClasses: [{ classKey: 'target-class', memberRefs: ['target-item'] }],
            deterministicMapEligibility: true,
            aliasingKeys: [],
            leftAliasingWitness: null,
            rightAliasingWitness: null,
            recommendedShape: 'map' as const,
            sampledDomain: makeScenarioDomain(),
            blockedClaims: ['Finite support does not prove a globally complete state map.']
        }],
        worldObligations: [],
        returnAssessments: [assessReturn({
            assessmentId: 'current-readout-check',
            sourceCarrier: edge.sourceCarrier,
            targetCarrier: edge.targetCarrier,
            declaredDomain: makeScenarioDomain(),
            visibleProjection: {
                cut: edge.targetCut,
                sourceKey: 'visible-duel',
                targetKey: 'visible-duel',
                witnessRefs: [edge.witnessReferences[0].witnessId]
            }
        })],
        diagnostics: [{
            schemaVersion: 1 as const,
            diagnosticId: 'diagnostic-test',
            diagnosticVersion: 1,
            evaluationObjectRef: edge.edgeId,
            cut: edge.targetCut,
            protectedFamily: edge.protectedFamily,
            scope: 'One synthetic contract edge.',
            pathPressure: makeDiagnosticAxis('No path pressure inferred.'),
            residueVisibility: makeDiagnosticAxis('Finite-scope residue is explicit.'),
            localReorganization: makeDiagnosticAxis('No local reorganization inferred.'),
            cutFidelity: makeDiagnosticAxis('Declared fields remain linked.'),
            returnStrength: makeDiagnosticAxis('Only a current-readout obligation is open.'),
            closureRisk: makeDiagnosticAxis('Global and production closure remain blocked.'),
            scalarProbes: [{
                probeId: 'fixture-count',
                value: 1,
                unit: 'witnesses',
                scope: 'Synthetic contract fixture only.'
            }],
            blockedClaims: ['No scalar probe establishes landfall.'],
            excludedClaims: ['No gameplay, balance, or empirical claim.']
        }],
        residualLedger: residual,
        blockedClaims: ['No live gameplay activation.'],
        maturity: 'M1_declaration' as const,
        productAuthority: 'none' as const,
        authorityProvenance: { relationship: 'none' as const },
        evidenceOrigin: 'synthetic-contract-test' as const,
        covarianceGroup: 'contract-test-lineage',
        deduplicationIdentity: digestLabel('result-deduplication')
    };
}

export function makeWorldDesignResult() {
    return buildWorldDesignResult(makeWorldDesignResultPayload());
}
