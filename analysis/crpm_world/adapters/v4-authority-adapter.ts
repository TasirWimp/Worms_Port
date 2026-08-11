import {
    LEGACY_RULESET_ID,
    V2_RULESET_ID,
    V3_RULESET_ID,
    V4_RULESET_ID,
    applySimulationCommand,
    canonicalSimulationJson,
    cloneSimulation,
    type SimulationActor,
    type SimulationCommand,
    type SimulationRulesetId,
    type SimulationState,
    type SimulationTransition
} from '../../../shared/simulation';

import {
    canonicalJson,
    deepSortJson,
    sha256Digest,
    sha256Text,
    type JsonValue
} from '../canonical';
import {
    CutReferenceSchema,
    ResidualLedgerSchema,
    TransitionWitnessSchema,
    WorldCarrierReferenceSchema,
    WorldTransitionEdgeV2Schema
} from '../schemas';
import { getCutDefinition } from '../cuts/registry';
import { V4_CUT_IDS, V4_CUT_VERSION, type V4SimulationStateCutId } from '../cuts/v4-cuts';
import { projectV4SimulationState } from '../kernel/project-cut';
import type {
    CutReference,
    ResidualLedger,
    TransitionWitness,
    WorldCarrierReference,
    WorldTransitionEdgeV2
} from '../types';

export const SIMULATION_AUTHORITY_ADAPTER_ID = 'nimble-knots-simulation-authority-adapter';
export const SIMULATION_AUTHORITY_ADAPTER_VERSION = 1;
export const DEFAULT_AUTHORITY_CUT = Object.freeze({ id: V4_CUT_IDS.authority, version: V4_CUT_VERSION });

export type AuthorityProjectionOutput = Readonly<{
    edge: WorldTransitionEdgeV2;
    witness: TransitionWitness;
    edgeDigest: string;
    witnessDigest: string;
}>;
export const WORMS_PORT_AUTHORITY_COMMIT = '0ca98ac32f9f7a265888ae342a3f3254269d61d9';
export const SIMULATION_AUTHORITY_BLOB = 'c9279c6f3b5d708ad0e54d32d2dca6d97234b4c0';

export type AuthorityDomainMotif =
    | 'move'
    | 'select_relic'
    | 'aim'
    | 'fire'
    | 'rejected_command';

export type AuthorityAdapterOutput = Readonly<{
    adapterId: typeof SIMULATION_AUTHORITY_ADAPTER_ID;
    adapterVersion: typeof SIMULATION_AUTHORITY_ADAPTER_VERSION;
    rulesetId: SimulationRulesetId;
    rulesetVersion: SimulationState['rulesetVersion'];
    preStateJson: string;
    preStateDigest: string;
    postStateJson: string;
    postStateDigest: string;
    eventsDigest: string;
    edgeDigest: string;
    witnessDigest: string;
    transition: SimulationTransition;
    edge: WorldTransitionEdgeV2;
    witness: TransitionWitness;
}>;

const RULESET_VERSIONS: Readonly<Record<SimulationRulesetId, SimulationState['rulesetVersion']>> = Object.freeze({
    [LEGACY_RULESET_ID]: 1,
    [V2_RULESET_ID]: 2,
    [V3_RULESET_ID]: 3,
    [V4_RULESET_ID]: 4
});

function assertSafeInteger(value: number, label: string, minimum?: number): void {
    if (!Number.isSafeInteger(value) || Object.is(value, -0) ||
        (minimum !== undefined && value < minimum)) {
        throw new TypeError(`${label} must be a deterministic safe integer.`);
    }
}

function assertExactKeys(record: Record<string, unknown>, expected: readonly string[]): void {
    const actual = Object.keys(record).sort();
    const required = [...expected].sort();
    if (canonicalJson(actual) !== canonicalJson(required)) {
        throw new TypeError(`Command fields must be exactly ${required.join(', ')}.`);
    }
}

function cloneAndValidateCommand(command: SimulationCommand): SimulationCommand {
    const cloned = deepSortJson(command);
    if (!cloned || typeof cloned !== 'object' || Array.isArray(cloned)) {
        throw new TypeError('Simulation command must be a deterministic JSON object.');
    }
    const record = cloned as Record<string, JsonValue>;
    if (record.type === 'move') {
        assertExactKeys(record, ['direction', 'type']);
        if (record.direction !== -1 && record.direction !== 0 && record.direction !== 1) {
            throw new TypeError('Move direction must be -1, 0, or 1.');
        }
        return { type: 'move', direction: record.direction };
    }
    if (record.type === 'select_relic') {
        assertExactKeys(record, ['relicId', 'type']);
        if (typeof record.relicId !== 'string') {
            throw new TypeError('Relic id must be a string.');
        }
        return { type: 'select_relic', relicId: record.relicId };
    }
    if (record.type === 'aim') {
        assertExactKeys(record, ['angleMilliDegrees', 'powerPermille', 'type']);
        if (typeof record.angleMilliDegrees !== 'number' || typeof record.powerPermille !== 'number') {
            throw new TypeError('Aim values must be numbers.');
        }
        assertSafeInteger(record.angleMilliDegrees, 'Aim angle');
        assertSafeInteger(record.powerPermille, 'Aim power');
        return {
            type: 'aim',
            angleMilliDegrees: record.angleMilliDegrees,
            powerPermille: record.powerPermille
        };
    }
    if (record.type === 'fire') {
        assertExactKeys(record, ['type']);
        return { type: 'fire' };
    }
    throw new TypeError('Unknown simulation command type.');
}

function cloneAndValidateState(state: SimulationState): {
    state: SimulationState;
    authorityJson: string;
} {
    const cloned = cloneSimulation(state);
    const expectedVersion = RULESET_VERSIONS[cloned.rulesetId];
    if (expectedVersion === undefined || cloned.rulesetVersion !== expectedVersion ||
        cloned.formatVersion !== expectedVersion) {
        throw new TypeError('Simulation state ruleset, ruleset version, and format version must agree.');
    }
    for (const [label, value, minimum] of [
        ['seed', cloned.seed, 0],
        ['rngState', cloned.rngState, 0],
        ['tick', cloned.tick, 0],
        ['revision', cloned.revision, 0],
        ['turn', cloned.turn, 0],
        ['turnDeadlineTick', cloned.turnDeadlineTick, 0],
        ['movementRemaining', cloned.movementRemaining, 0]
    ] as const) {
        assertSafeInteger(value, `Simulation state ${label}`, minimum);
    }
    if (cloned.units.length !== 2 || cloned.units[0].id !== 'player' || cloned.units[1].id !== 'loomkeeper') {
        throw new TypeError('Simulation state must retain the authoritative player/loomkeeper unit tuple.');
    }
    const authorityJson = canonicalSimulationJson(cloned);
    if (authorityJson !== canonicalJson(cloned)) {
        throw new TypeError('Analysis canonical JSON diverged from authoritative simulation canonical JSON.');
    }
    return { state: cloned, authorityJson };
}

function baselineDigest(state: SimulationState): string {
    return sha256Digest({
        authorityCommit: WORMS_PORT_AUTHORITY_COMMIT,
        simulationBlob: SIMULATION_AUTHORITY_BLOB,
        rulesetId: state.rulesetId,
        rulesetVersion: state.rulesetVersion,
        formatVersion: state.formatVersion,
        seed: state.seed
    });
}

function carrierReference(
    state: SimulationState,
    stateDigest: string,
    position: 'pre' | 'post'
): WorldCarrierReference {
    return WorldCarrierReferenceSchema.parse({
        schemaVersion: 1,
        profileVersion: 1,
        carrierKind: 'authority',
        adapter: {
            id: SIMULATION_AUTHORITY_ADAPTER_ID,
            version: SIMULATION_AUTHORITY_ADAPTER_VERSION
        },
        rulesetOrConfigId: state.rulesetId,
        baselineDigest: baselineDigest(state),
        stateDigest,
        revisionOrStep: state.revision,
        sourceReference: `worms-port@${WORMS_PORT_AUTHORITY_COMMIT}:shared/simulation.ts:${position}:${stateDigest}`
    });
}

function terrainDigest(state: SimulationState): string {
    return sha256Digest({
        width: state.terrain.width,
        height: state.terrain.height,
        cellSize: state.terrain.cellSize,
        words: state.terrain.words
    });
}

function projectileDigest(state: SimulationState): string {
    return sha256Digest(state.lastProjectile);
}

function delta(subject: string, before: JsonValue, after: JsonValue, description: string) {
    return { subject, before, after, description };
}

function canonicalClone(value: unknown): JsonValue {
    return JSON.parse(canonicalJson(value)) as JsonValue;
}

function extractResidual(before: SimulationState, after: SimulationState, rejected: boolean): ResidualLedger {
    const beforeUnits = new Map(before.units.map((unit) => [unit.id, unit]));
    const afterUnits = new Map(after.units.map((unit) => [unit.id, unit]));
    const positionDeltas = (['player', 'loomkeeper'] as const).map((actor) => {
        const previous = beforeUnits.get(actor)!;
        const next = afterUnits.get(actor)!;
        return delta(
            `unit.${actor}.position`,
            { x: previous.x, y: previous.y },
            { x: next.x, y: next.y },
            `Authoritative ${actor} position before and after the command.`
        );
    });
    const healthDeltas = (['player', 'loomkeeper'] as const).map((actor) => {
        const previous = beforeUnits.get(actor)!;
        const next = afterUnits.get(actor)!;
        return delta(
            `unit.${actor}.stitching-alive`,
            { stitching: previous.stitching, alive: previous.alive },
            { stitching: next.stitching, alive: next.alive },
            `Authoritative ${actor} Stitching and alive state.`
        );
    });

    return ResidualLedgerSchema.parse({
        schemaVersion: 1,
        positionDeltas,
        resourceDeltas: [
            delta('state.tick', before.tick, after.tick, 'Authoritative simulation tick.'),
            delta('state.revision', before.revision, after.revision, 'Authoritative state revision.'),
            delta('state.turn', before.turn, after.turn, 'Authoritative turn index.'),
            delta('state.movement-remaining', before.movementRemaining, after.movementRemaining,
                'Authoritative movement budget.')
        ],
        healthDeltas,
        statusDeltas: [
            delta('state.active-actor', before.activeActor, after.activeActor, 'Authoritative active actor.'),
            delta('state.selected-relic', before.selectedRelic, after.selectedRelic, 'Authoritative selected Relic.'),
            delta('state.aim', before.aim, after.aim, 'Authoritative aim declaration.'),
            delta('state.last-projectile-digest', projectileDigest(before), projectileDigest(after),
                'Digest of the authoritative last-projectile carrier.'),
            delta('state.phase', before.phase, after.phase, 'Authoritative match phase.'),
            delta('state.winner', before.winner, after.winner, 'Authoritative winner.'),
            delta('state.finish-reason', before.finishReason, after.finishReason, 'Authoritative finish reason.')
        ],
        terrainDeltas: [
            delta('state.terrain-digest', terrainDigest(before), terrainDigest(after),
                'Digest of packed authoritative terrain; words are not flattened into the residual report.')
        ],
        authorityDeltas: [{
            subject: 'simulation-authority',
            before: 'none',
            after: 'none',
            rationale: 'Exact adapter parity is authority-derived support provenance; it does not create product authority.'
        }],
        expiredRights: [],
        openedObligations: [],
        carriedObligations: [],
        dischargedObligations: [],
        unresolvedObligations: [],
        excludedUnmodelledResidue: [
            'Packed terrain words remain recoverable through the authority carrier and digest, not this human-readable ledger.',
            'Presentation, protocol transport, replay serialization, and player interpretation are outside this adapter cut.',
            ...(rejected ? ['The rejected command is a witnessed response, not a successful state edge.'] : [])
        ]
    });
}

function responseProjection(
    transition: SimulationTransition,
    preStateDigest: string,
    postStateDigest: string,
    eventsDigest: string
): JsonValue {
    const response: Record<string, JsonValue> = {
        accepted: transition.accepted,
        mutated: transition.mutated,
        preStateDigest,
        postStateDigest,
        eventsDigest,
        authoritativeEvents: canonicalClone(transition.events)
    };
    if (transition.error) response.error = canonicalClone(transition.error);
    return canonicalClone(response);
}

export function adaptSimulationCommand(
    inputState: SimulationState,
    actor: SimulationActor,
    command: SimulationCommand,
    expectedTurn: number,
    declaredCutInput?: CutReference
): AuthorityAdapterOutput {
    if (actor !== 'player' && actor !== 'loomkeeper') {
        throw new TypeError('Actor must be player or loomkeeper.');
    }
    assertSafeInteger(expectedTurn, 'Expected turn');
    const callerStateJson = canonicalSimulationJson(inputState);
    const validated = cloneAndValidateState(inputState);
    if (callerStateJson !== validated.authorityJson) {
        throw new TypeError('Cloned authority state diverged from the caller state.');
    }
    const commandCopy = cloneAndValidateCommand(command);
    const declaredCut = CutReferenceSchema.parse(declaredCutInput ?? (
        validated.state.rulesetId === V4_RULESET_ID
            ? DEFAULT_AUTHORITY_CUT
            : { id: V4_CUT_IDS.historicalAuthority, version: V4_CUT_VERSION }
    ));
    const cutDefinition = getCutDefinition(declaredCut.id, declaredCut.version);
    const compatibleCutId = validated.state.rulesetId === V4_RULESET_ID
        ? V4_CUT_IDS.authority
        : V4_CUT_IDS.historicalAuthority;
    if (declaredCut.id !== compatibleCutId || cutDefinition.sourceCarrierKind !== 'authority') {
        throw new RangeError(`Cut ${declaredCut.id}@${declaredCut.version} is not compatible with ${validated.state.rulesetId} authority transitions.`);
    }
    if (!cutDefinition.admissibleDomain.seeds.includes(validated.state.seed) ||
        !cutDefinition.admissibleDomain.actionFamilies.includes(commandCopy.type)) {
        throw new RangeError('Authority state seed or command family is outside the registered cut domain.');
    }
    const preStateJson = validated.authorityJson;
    const preStateDigest = sha256Text(preStateJson);

    const transition = applySimulationCommand(validated.state, actor, commandCopy, expectedTurn);
    if (canonicalSimulationJson(inputState) !== callerStateJson) {
        throw new Error('Authority adapter observed mutation of its caller-owned input state.');
    }
    const postStateJson = canonicalSimulationJson(transition.state);
    if (postStateJson !== canonicalJson(transition.state)) {
        throw new TypeError('Post-state canonical JSON diverged from authoritative simulation JSON.');
    }
    const postStateDigest = sha256Text(postStateJson);
    const eventsDigest = sha256Digest(transition.events);
    const sourceCarrier = carrierReference(validated.state, preStateDigest, 'pre');
    const targetCarrier = carrierReference(transition.state, postStateDigest, 'post');
    const rejected = !transition.accepted;
    const domainMotif: AuthorityDomainMotif = rejected ? 'rejected_command' : commandCopy.type;
    const sourceRefs = [
        `worms-port@${WORMS_PORT_AUTHORITY_COMMIT}:shared/simulation.ts`,
        `git-blob:${SIMULATION_AUTHORITY_BLOB}`,
        `source-authority-carrier:${preStateDigest}`,
        `target-authority-carrier:${postStateDigest}`
    ];
    const decoderRefs = ['authoritative-simulation-state-v1', 'authoritative-simulation-events-v1'];
    const commandDeclaration = canonicalClone({ actor, command: commandCopy, expectedTurn });
    const inputDigest = sha256Digest({
        adapterId: SIMULATION_AUTHORITY_ADAPTER_ID,
        adapterVersion: SIMULATION_AUTHORITY_ADAPTER_VERSION,
        cut: declaredCut,
        preStateDigest,
        commandDeclaration
    });
    const projectedResponse = responseProjection(transition, preStateDigest, postStateDigest, eventsDigest);
    const outputDigest = sha256Digest(projectedResponse);
    const edgeIdentity = sha256Digest({ inputDigest, outputDigest, domainMotif });
    const edgeId = `authority-edge-${edgeIdentity.slice(0, 24)}`;
    const deduplicationIdentity = sha256Digest({
        sourceCommit: WORMS_PORT_AUTHORITY_COMMIT,
        simulationBlob: SIMULATION_AUTHORITY_BLOB,
        rulesetId: inputState.rulesetId,
        seed: inputState.seed,
        preStateDigest,
        actor,
        command: commandCopy,
        expectedTurn
    });
    const witnessId = `authority-witness-${deduplicationIdentity.slice(0, 24)}`;
    const witness = TransitionWitnessSchema.parse({
        schemaVersion: 1,
        witnessId,
        witnessVersion: 1,
        edgeId,
        evidenceOrigin: 'authority-derived',
        covarianceGroup: `simulation-authority-${inputState.rulesetId}`,
        deduplicationIdentity,
        sourceRefs,
        decoderRefs,
        inputDigest,
        outputDigest,
        orderedEventsDigest: eventsDigest,
        status: 'exact',
        excludedClaims: [
            'The rendered edge is not the full source state; re-entry requires the authority carrier digest and source reference.',
            'A domain motif does not establish a CRPM transition interpretation.',
            'This witness does not prove replay ABI parity, balance, global continuation, or production activation.'
        ]
    });
    const witnessDigest = sha256Digest(witness);
    const residual = extractResidual(validated.state, transition.state, rejected);
    const edge = WorldTransitionEdgeV2Schema.parse({
        schemaVersion: 2,
        edgeId,
        edgeVersion: 1,
        edgeKind: rejected ? 'authority-rejected-transition-witness' : 'authority-state-transition',
        domainMotif,
        portBindings: {
            contextPorts: ['authority-state', 'ruleset', 'expected-turn', 'declared-cut'],
            actionPorts: ['simulation-command'],
            responsePorts: ['simulation-transition'],
            evidencePorts: ['pre-state-digest', 'post-state-digest', 'ordered-events-digest', 'transition-witness'],
            supportPorts: ['source-carrier', 'target-carrier', 'authority-source-lock', 'terrain-digest', 'projectile-digest'],
            returnPorts: ['authority-state-reentry', 'authority-result-reentry']
        },
        sourceCarrier,
        targetCarrier,
        sourceCut: declaredCut,
        targetCut: declaredCut,
        fixedFrame: {
            schemaVersion: 1,
            sourceLocks: [{
                repositoryId: 'worms-port',
                commit: WORMS_PORT_AUTHORITY_COMMIT,
                paths: ['shared/simulation.ts']
            }],
            baselineOrConfigId: inputState.rulesetId,
            adapter: {
                id: SIMULATION_AUTHORITY_ADAPTER_ID,
                version: SIMULATION_AUTHORITY_ADAPTER_VERSION
            },
            scenarioDomain: {
                schemaVersion: 1,
                scenarioIds: [...cutDefinition.admissibleDomain.scenarioIds],
                actionFamilies: [commandCopy.type],
                policyFamilies: [],
                seeds: [inputState.seed],
                constraints: [
                    'One direct applySimulationCommand invocation under the supplied actor and expected turn.'
                ]
            },
            sourceCut: declaredCut,
            targetCut: declaredCut,
            actorOrPolicy: actor,
            expectedRevisionOrStep: inputState.revision
        },
        commandOrDeclaration: commandDeclaration,
        response: projectedResponse,
        protectedFamily: cutDefinition.protectedFamily,
        sourceRefs,
        witnessReferences: [{ witnessId, digest: witnessDigest }],
        decoderRefs,
        carrierRefs: [sha256Digest(sourceCarrier), sha256Digest(targetCarrier)],
        pathPosition: inputState.revision,
        preserved: [
            'Exact authoritative command acceptance and mutation flags.',
            'Exact authoritative post-state carrier digest.',
            'Exact authoritative ordered events and event digest.',
            'Exact authoritative error presence and value.'
        ],
        forgotten: [
            'Packed terrain words are not flattened into the residual ledger.',
            'Presentation and source-code layout distinctions are outside the authority cut.'
        ],
        newlyVisible: [
            'Typed context, action, response, evidence, support, and return ports.',
            'Cut-scoped residual deltas and an exact authority-derived witness.'
        ],
        residual,
        reversibility: rejected ? 'exact' : 'one_way',
        returnCondition: 'Re-enter through the exact authority commit, carrier digest, command declaration, and ordered result digest.',
        reopeningCondition: 'Reopen on any authority source, state, event, error, digest, cut, adapter, or parity mismatch.',
        supportStatus: 'witnessed',
        productAuthority: 'none',
        authorityDefinitionMutationObserved: false
    });
    const edgeDigest = sha256Digest(edge);

    return Object.freeze({
        adapterId: SIMULATION_AUTHORITY_ADAPTER_ID,
        adapterVersion: SIMULATION_AUTHORITY_ADAPTER_VERSION,
        rulesetId: inputState.rulesetId,
        rulesetVersion: inputState.rulesetVersion,
        preStateJson,
        preStateDigest,
        postStateJson,
        postStateDigest,
        eventsDigest,
        edgeDigest,
        witnessDigest,
        transition,
        edge,
        witness
    });
}

/**
 * Render an explicit authority-to-projection bridge.  A thin or repaired
 * readout is never substituted for an authority transition edge.
 */
export function projectSimulationAuthorityCut(
    inputState: SimulationState,
    targetCutInput: CutReference
): AuthorityProjectionOutput {
    const validated = cloneAndValidateState(inputState);
    if (validated.state.rulesetId !== V4_RULESET_ID) {
        throw new RangeError('Authority projection edges are registered only for V4 states.');
    }
    const sourceCut: CutReference = { id: V4_CUT_IDS.authority, version: V4_CUT_VERSION };
    const targetCut = CutReferenceSchema.parse(targetCutInput);
    if (targetCut.id === sourceCut.id && targetCut.version === sourceCut.version) {
        throw new RangeError('An authority projection edge requires a distinct target cut.');
    }
    const targetDefinition = getCutDefinition(targetCut.id, targetCut.version);
    if (![V4_CUT_IDS.thinVisibleDuel, V4_CUT_IDS.boundedCommandSupport].includes(
        targetCut.id as typeof V4_CUT_IDS.thinVisibleDuel | typeof V4_CUT_IDS.boundedCommandSupport
    )) {
        throw new RangeError(`Cut ${targetCut.id}@${targetCut.version} is not a registered V4 authority projection target.`);
    }
    if (!targetDefinition.admissibleDomain.seeds.includes(validated.state.seed)) {
        throw new RangeError('Authority projection state is outside the target cut seed domain.');
    }
    const authorityDigest = sha256Text(validated.authorityJson);
    const sourceCarrier = carrierReference(validated.state, authorityDigest, 'pre');
    const projection = projectV4SimulationState(targetCut.id as V4SimulationStateCutId, validated.state);
    const projectedDigest = sha256Digest(projection.projectedValue);
    const targetCarrier = WorldCarrierReferenceSchema.parse({
        schemaVersion: 1,
        profileVersion: 1,
        carrierKind: targetDefinition.sourceCarrierKind,
        adapter: sourceCarrier.adapter,
        rulesetOrConfigId: sourceCarrier.rulesetOrConfigId,
        baselineDigest: sourceCarrier.baselineDigest,
        stateDigest: projectedDigest,
        revisionOrStep: sourceCarrier.revisionOrStep,
        sourceReference: `${sourceCarrier.sourceReference};projection=${targetCut.id}@${targetCut.version};authority=${authorityDigest}`
    });
    const declaration = canonicalClone({ type: 'authority_projection', sourceCut, targetCut });
    const inputDigest = sha256Digest({ sourceCarrier, declaration });
    const outputDigest = sha256Digest({ targetCarrier, projectedValue: projection.projectedValue });
    const edgeId = `authority-projection-edge-${sha256Digest({ inputDigest, outputDigest }).slice(0, 24)}`;
    const witnessId = `authority-projection-witness-${sha256Digest({ edgeId, authorityDigest, projectedDigest }).slice(0, 24)}`;
    const sourceRefs = [
        `worms-port@${WORMS_PORT_AUTHORITY_COMMIT}:shared/simulation.ts`,
        `source-authority-carrier:${authorityDigest}`,
        `target-cut:${targetCut.id}@${targetCut.version}`
    ];
    const decoderRefs = ['authoritative-simulation-state-v1', `cut-projection-${targetCut.id}-v${targetCut.version}`];
    const witness = TransitionWitnessSchema.parse({
        schemaVersion: 1,
        witnessId,
        witnessVersion: 1,
        edgeId,
        evidenceOrigin: 'authority-derived',
        covarianceGroup: `simulation-authority-projection-${targetCut.id}`,
        deduplicationIdentity: sha256Digest({ authorityDigest, targetCut, projectedDigest }),
        sourceRefs,
        decoderRefs,
        inputDigest,
        outputDigest,
        status: 'exact',
        excludedClaims: [
            'Projection equality is not authority-state equality, recurrence, return, or global continuation.',
            'This projection edge does not execute or mutate gameplay authority.'
        ]
    });
    const witnessDigest = sha256Digest(witness);
    const edge = WorldTransitionEdgeV2Schema.parse({
        schemaVersion: 2,
        edgeId,
        edgeVersion: 1,
        edgeKind: 'authority-cut-projection',
        domainMotif: 'project_authority_readout',
        portBindings: {
            contextPorts: ['authority-state', 'ruleset', 'declared-cut'],
            actionPorts: ['projection-declaration'],
            responsePorts: ['projected-readout'],
            evidencePorts: ['authority-state-digest', 'projected-state-digest', 'transition-witness'],
            supportPorts: ['source-carrier', 'target-carrier', 'authority-source-lock'],
            returnPorts: ['authority-state-reentry']
        },
        sourceCarrier,
        targetCarrier,
        sourceCut,
        targetCut,
        fixedFrame: {
            schemaVersion: 1,
            sourceLocks: [{
                repositoryId: 'worms-port',
                commit: WORMS_PORT_AUTHORITY_COMMIT,
                paths: ['shared/simulation.ts']
            }],
            baselineOrConfigId: validated.state.rulesetId,
            adapter: sourceCarrier.adapter,
            scenarioDomain: targetDefinition.admissibleDomain,
            sourceCut,
            targetCut,
            actorOrPolicy: 'projection',
            expectedRevisionOrStep: validated.state.revision
        },
        commandOrDeclaration: declaration,
        response: canonicalClone({ projectedValue: projection.projectedValue, classKey: projection.classKey }),
        protectedFamily: targetDefinition.protectedFamily,
        sourceRefs,
        witnessReferences: [{ witnessId, digest: witnessDigest }],
        decoderRefs,
        carrierRefs: [sha256Digest(sourceCarrier), sha256Digest(targetCarrier)],
        pathPosition: validated.state.revision,
        preserved: [
            'The authority carrier remains re-enterable by source reference and digest.',
            'The exact registered target-cut projection and cut version remain digest-bound.'
        ],
        forgotten: targetDefinition.intentionallyForgottenDistinctions,
        newlyVisible: ['The projection boundary is an explicit edge rather than a silently replaced authority carrier.'],
        residual: ResidualLedgerSchema.parse({
            schemaVersion: 1,
            positionDeltas: [], resourceDeltas: [], healthDeltas: [], statusDeltas: [], terrainDeltas: [], authorityDeltas: [],
            expiredRights: [], openedObligations: [], carriedObligations: [], dischargedObligations: [], unresolvedObligations: [],
            excludedUnmodelledResidue: targetDefinition.intentionallyForgottenDistinctions
        }),
        reversibility: 'repair_dependent',
        returnCondition: 'Return requires the retained source authority reference and digest; the projected readout alone is insufficient.',
        reopeningCondition: 'Reopen on source-lock drift, cut-version drift, projection mismatch, aliasing, or missing authority re-entry support.',
        supportStatus: 'witnessed',
        productAuthority: 'none',
        authorityDefinitionMutationObserved: false
    });
    return Object.freeze({ edge, witness, edgeDigest: sha256Digest(edge), witnessDigest });
}
