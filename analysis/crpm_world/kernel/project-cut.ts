import {
    V4_RULESET_ID,
    canonicalSimulationJson,
    type SimulationActor,
    type SimulationCommand,
    type SimulationState
} from '../../../shared/simulation';

import { canonicalJson, deepSortJson, sha256Digest, sha256Text, type JsonValue } from '../canonical';
import { getCutDefinition } from '../cuts/registry';
import { V4_CUT_IDS, V4_CUT_VERSION, type V4SimulationStateCutId } from '../cuts/v4-cuts';
import { WorldCutDefinitionSchema } from '../schemas';
import type { WorldCutDefinition } from '../types';

export type CutProjection<TProjection extends JsonValue = JsonValue> = Readonly<{
    cutId: string;
    cutVersion: number;
    classKey: string;
    projectedValue: TProjection;
}>;

export type V4CommandSample = Readonly<{
    state: SimulationState;
    actor: SimulationActor;
    command: SimulationCommand;
    expectedTurn: number;
}>;

function detachedClone<T>(value: T): T {
    return JSON.parse(canonicalJson(value)) as T;
}

export function projectCut<TInput, TProjection extends JsonValue>(
    cutDefinition: WorldCutDefinition,
    input: TInput,
    projector: (detachedInput: TInput) => TProjection
): CutProjection<TProjection> {
    const cut = WorldCutDefinitionSchema.parse(cutDefinition);
    const projectedValue = deepSortJson(projector(detachedClone(input))) as TProjection;
    return Object.freeze({
        cutId: cut.cutId,
        cutVersion: cut.cutVersion,
        classKey: `cut-${sha256Digest({
            cutId: cut.cutId,
            cutVersion: cut.cutVersion,
            projectedValue
        })}`,
        projectedValue
    });
}

function assertV4State(state: SimulationState): void {
    if (state.rulesetId !== V4_RULESET_ID || state.rulesetVersion !== 4 || state.formatVersion !== 4) {
        throw new TypeError('V4 cut projection requires a canonical V4 simulation state.');
    }
    canonicalSimulationJson(state);
}

function authorityProjection(state: SimulationState): JsonValue {
    return {
        authoritySource: 'shared/simulation.ts',
        rulesetId: state.rulesetId,
        revision: state.revision,
        canonicalStateDigest: sha256Text(canonicalSimulationJson(state))
    };
}

function thinVisibleProjection(state: SimulationState): JsonValue {
    return {
        activeActor: state.activeActor,
        units: state.units.map((unit) => ({
            id: unit.id,
            x: unit.x,
            y: unit.y,
            stitching: unit.stitching
        }))
    };
}

function boundedMovementProjection(state: SimulationState): JsonValue {
    return {
        rulesetId: state.rulesetId,
        rulesetVersion: state.rulesetVersion,
        turn: state.turn,
        activeActor: state.activeActor,
        phase: state.phase,
        movementRemaining: state.movementRemaining,
        terrainDigest: sha256Digest(state.terrain),
        terrainBounds: {
            width: state.terrain.width,
            height: state.terrain.height,
            cellSize: state.terrain.cellSize
        },
        units: state.units.map((unit) => ({
            id: unit.id,
            x: unit.x,
            y: unit.y,
            facing: unit.facing,
            alive: unit.alive
        }))
    };
}

export function projectV4SimulationState(
    cutId: V4SimulationStateCutId,
    state: SimulationState
): CutProjection {
    assertV4State(state);
    const cut = getCutDefinition(cutId, V4_CUT_VERSION);
    if (cutId === V4_CUT_IDS.authority || cutId === V4_CUT_IDS.historicalAuthority) {
        return projectCut(cut, state, authorityProjection);
    }
    if (cutId === V4_CUT_IDS.thinVisibleDuel) {
        return projectCut(cut, state, thinVisibleProjection);
    }
    return projectCut(cut, state, boundedMovementProjection);
}

export function projectV4CommandSample(
    cutId: V4SimulationStateCutId,
    sample: V4CommandSample
): CutProjection {
    assertV4State(sample.state);
    if (!Number.isSafeInteger(sample.expectedTurn) || Object.is(sample.expectedTurn, -0) || sample.expectedTurn < 0) {
        throw new TypeError('Expected turn must be a non-negative deterministic safe integer.');
    }
    const cut = getCutDefinition(cutId, V4_CUT_VERSION);
    if (!cut.admissibleDomain.actionFamilies.includes(sample.command.type)) {
        throw new RangeError(`Command family ${sample.command.type} is outside cut ${cutId}.`);
    }
    const stateProjection = projectV4SimulationState(cutId, sample.state).projectedValue;
    return projectCut(cut, sample, (detached) => {
        if (cutId === V4_CUT_IDS.thinVisibleDuel) {
            return stateProjection;
        }
        return {
            stateSupport: stateProjection,
            actor: detached.actor,
            expectedTurn: detached.expectedTurn,
            command: detached.command
        };
    });
}
