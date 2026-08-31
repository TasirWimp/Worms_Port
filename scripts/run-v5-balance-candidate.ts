import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { decideLoomkeeperTurn } from '../shared/loomkeeper';
import {
    applySimulationCommand,
    cloneSimulation,
    createSimulation,
    LATEST_RULESET_ID,
    RELIC_IDS,
    setTerrainSolid,
    SIM_RULES,
    V4_RULESET_ID,
    V5_LAUNCH_SPEED_RULES,
    V5_RELIC_RULES,
    V5_RULESET_ID,
    type RelicId,
    type SimulationActor,
    type SimulationCommand,
    type SimulationState
} from '../shared/simulation';

const PROFILE_ID = 'v5-marketing-candidate-v0';
const BASE_SEED = 0xC0FFEE11;
const SEED_STRIDE = 0x9E3779B9;
const SEED_COUNT = 25;

export type V5BalanceReport = {
    profileId: typeof PROFILE_ID;
    rulesetId: typeof V5_RULESET_ID;
    latestRulesetDuringCalibration: typeof LATEST_RULESET_ID;
    seedFormula: string;
    matches: number;
    terminalMatches: number;
    terminalRatePercent: number;
    draws: number;
    firstActorWins: number;
    firstActorWinSharePercent: number;
    recurrenceWitnesses: number;
    relicSelections: Record<RelicId, number>;
    maximumEvaluatedCandidates: number;
    maximumSimulatedTransitions: number;
    maximumCommands: number;
    flatRangeChecks: Record<RelicId, {
        targetSeparation: number;
        directAtTarget: boolean;
        directAtNextBand: boolean;
        achievedGroundDistance: number;
    }>;
    directDamage: Record<RelicId, number>;
    gates: {
        historicalDefaultStillV4: boolean;
        profileConfigParity: boolean;
        terminalRate: boolean;
        firstActorShare: boolean;
        noRecurrence: boolean;
        allRelicsUsed: boolean;
        noOneShot: boolean;
        policyBudgets: boolean;
        rangeOrdering: boolean;
    };
    pass: boolean;
};

type MatchResult = {
    winner: SimulationState['winner'];
    firstActor: SimulationActor;
    finishReason: SimulationState['finishReason'];
    recurrence: boolean;
    relicSelections: Record<RelicId, number>;
    maximumEvaluatedCandidates: number;
    maximumSimulatedTransitions: number;
    maximumCommands: number;
};

const RANGE_TARGETS: Readonly<Record<RelicId, number>> = Object.freeze({
    threadball: 576,
    needlepoint: 640,
    spoolburst: 512
});

function evidenceSeeds(): number[] {
    return Array.from(
        { length: SEED_COUNT },
        (_, index) => (BASE_SEED + Math.imul(index, SEED_STRIDE)) >>> 0
    );
}

function profileConfigParity(): boolean {
    const config = JSON.parse(readFileSync(new URL(
        '../analysis/tactical_model/configs/v5-marketing-candidate-v0.json',
        import.meta.url
    ), 'utf8')) as {
        id?: unknown;
        relics?: Partial<Record<RelicId, {
            maximum_range?: unknown;
            direct_damage?: unknown;
        }>>;
    };
    return config.id === PROFILE_ID && RELIC_IDS.every((relicId) =>
        config.relics?.[relicId]?.maximum_range === RANGE_TARGETS[relicId] &&
        config.relics?.[relicId]?.direct_damage === V5_RELIC_RULES[relicId].maximumDamage
    );
}

function flatState(relicId: RelicId, targetSeparation: number): SimulationState {
    const state = createSimulation(BASE_SEED, 'wizard', V5_RULESET_ID);
    state.terrain.words.fill(0);
    for (let x = 0; x < state.terrain.width; x += 1) {
        for (let y = 44; y < state.terrain.height; y += 1) {
            setTerrainSolid(state.terrain, x, y, true);
        }
    }
    state.units[0].x = 512;
    state.units[0].y = 340;
    state.units[0].facing = 1;
    state.units[1].x = state.units[0].x + targetSeparation;
    state.units[1].y = 340;
    state.units[1].facing = -1;
    state.selectedRelic = relicId;
    return state;
}

function fire(
    source: SimulationState,
    actor: SimulationActor,
    relicId: RelicId,
    angleMilliDegrees: number,
    powerPermille: number
): SimulationState {
    let state = source;
    const commands: SimulationCommand[] = [
        { type: 'select_relic', relicId },
        { type: 'aim', angleMilliDegrees, powerPermille },
        { type: 'fire' }
    ];
    for (const command of commands) {
        const transition = applySimulationCommand(state, actor, command, state.turn);
        assert.equal(transition.accepted, true, `${actor}/${relicId}/${command.type}`);
        state = transition.state;
    }
    return state;
}

function flatRangeCheck(relicId: RelicId): V5BalanceReport['flatRangeChecks'][RelicId] {
    const targetSeparation = RANGE_TARGETS[relicId];
    const atTarget = fire(flatState(relicId, targetSeparation), 'player', relicId, 45_000, 1_000);
    const nextBand = fire(flatState(relicId, targetSeparation + 64), 'player', relicId, 45_000, 1_000);
    const ground = flatState(relicId, 1_288);
    const groundResult = fire(ground, 'player', relicId, 45_000, 1_000);
    return {
        targetSeparation,
        directAtTarget: atTarget.lastProjectile?.impact === 'loomkeeper',
        directAtNextBand: nextBand.lastProjectile?.impact === 'loomkeeper',
        achievedGroundDistance: groundResult.lastProjectile!.endX - groundResult.lastProjectile!.startX
    };
}

function directDamage(relicId: RelicId): number {
    const state = fire(flatState(relicId, 88), 'player', relicId, 0, 0);
    assert.equal(state.lastProjectile?.impact, 'loomkeeper');
    return SIM_RULES.maximumStitching - state.units[1].stitching;
}

function playerAsLoomkeeperView(source: SimulationState): SimulationState {
    const view = cloneSimulation(source);
    view.activeActor = 'loomkeeper';
    view.units = [
        {
            ...source.units[1],
            id: 'player',
            calling: 'wizard'
        },
        {
            ...source.units[0],
            id: 'loomkeeper',
            calling: 'loomkeeper'
        }
    ];
    return view;
}

function commandsForActiveActor(source: SimulationState) {
    const decision = decideLoomkeeperTurn(
        source.activeActor === 'loomkeeper' ? source : playerAsLoomkeeperView(source),
        'standard'
    );
    if (!decision) throw new Error(`No deterministic plan for ${source.activeActor} turn ${source.turn}.`);
    return decision;
}

function recurrenceKey(state: SimulationState): string {
    return JSON.stringify({
        activeActor: state.activeActor,
        selectedRelic: state.selectedRelic,
        units: state.units.map((unit) => ({
            x: unit.x,
            y: unit.y,
            stitching: unit.stitching,
            alive: unit.alive
        })),
        terrainWords: state.terrain.words
    });
}

function runMatch(seed: number, firstActor: SimulationActor): MatchResult {
    let state = createSimulation(seed, 'wizard', V5_RULESET_ID);
    state.activeActor = firstActor;
    const seen = new Set<string>();
    let recurrence = false;
    const relicSelections: Record<RelicId, number> = {
        threadball: 0,
        needlepoint: 0,
        spoolburst: 0
    };
    let maximumEvaluatedCandidates = 0;
    let maximumSimulatedTransitions = 0;
    let maximumCommands = 0;

    while (state.phase === 'awaiting_command') {
        const key = recurrenceKey(state);
        if (seen.has(key)) recurrence = true;
        seen.add(key);

        const actor = state.activeActor;
        const turn = state.turn;
        const decision = commandsForActiveActor(state);
        maximumEvaluatedCandidates = Math.max(
            maximumEvaluatedCandidates,
            decision.evaluatedCandidates
        );
        maximumSimulatedTransitions = Math.max(
            maximumSimulatedTransitions,
            decision.simulatedTransitions
        );
        maximumCommands = Math.max(maximumCommands, decision.commands.length);
        relicSelections[decision.selectedRelic] += 1;

        for (const command of decision.commands) {
            const transition = applySimulationCommand(state, actor, command, turn);
            if (!transition.accepted || !transition.mutated) {
                throw new Error(
                    `Rejected ${actor} ${command.type} at turn ${turn}: ${transition.error?.message}`
                );
            }
            state = transition.state;
            if (state.phase === 'finished' || state.turn !== turn) break;
        }
        if (state.turn === turn && state.phase !== 'finished') {
            throw new Error(`Plan for ${actor} did not complete turn ${turn}.`);
        }
    }

    return {
        winner: state.winner,
        firstActor,
        finishReason: state.finishReason,
        recurrence,
        relicSelections,
        maximumEvaluatedCandidates,
        maximumSimulatedTransitions,
        maximumCommands
    };
}

export function createV5BalanceReport(): V5BalanceReport {
    const matches = evidenceSeeds().flatMap((seed) => [
        runMatch(seed, 'player'),
        runMatch(seed, 'loomkeeper')
    ]);
    const terminalMatches = matches.filter((match) => match.finishReason === 'unravelled').length;
    const firstActorWins = matches.filter((match) => match.winner === match.firstActor).length;
    const relicSelections = matches.reduce<Record<RelicId, number>>((total, match) => {
        for (const relicId of RELIC_IDS) total[relicId] += match.relicSelections[relicId];
        return total;
    }, { threadball: 0, needlepoint: 0, spoolburst: 0 });
    const flatRangeChecks = {
        threadball: flatRangeCheck('threadball'),
        needlepoint: flatRangeCheck('needlepoint'),
        spoolburst: flatRangeCheck('spoolburst')
    };
    const directDamageValues = {
        threadball: directDamage('threadball'),
        needlepoint: directDamage('needlepoint'),
        spoolburst: directDamage('spoolburst')
    };
    const terminalRatePercent = terminalMatches * 100 / matches.length;
    const firstActorWinSharePercent = terminalMatches === 0
        ? 0
        : firstActorWins * 100 / terminalMatches;
    const maximumEvaluatedCandidates = Math.max(...matches.map(
        (match) => match.maximumEvaluatedCandidates
    ));
    const maximumSimulatedTransitions = Math.max(...matches.map(
        (match) => match.maximumSimulatedTransitions
    ));
    const maximumCommands = Math.max(...matches.map((match) => match.maximumCommands));
    const achievedDistances = RELIC_IDS.map(
        (relicId) => flatRangeChecks[relicId].achievedGroundDistance
    );
    const gates = {
        historicalDefaultStillV4: LATEST_RULESET_ID === V4_RULESET_ID,
        profileConfigParity: profileConfigParity(),
        terminalRate: terminalRatePercent >= 90,
        firstActorShare: firstActorWinSharePercent >= 35 && firstActorWinSharePercent <= 65,
        noRecurrence: matches.every((match) => !match.recurrence),
        allRelicsUsed: RELIC_IDS.every((relicId) => relicSelections[relicId] > 0),
        noOneShot: RELIC_IDS.every((relicId) => directDamageValues[relicId] < 100),
        policyBudgets: maximumEvaluatedCandidates <= 128 &&
            maximumSimulatedTransitions <= 3_072 && maximumCommands <= 11,
        rangeOrdering: flatRangeChecks.threadball.directAtTarget &&
            flatRangeChecks.needlepoint.directAtTarget &&
            flatRangeChecks.spoolburst.directAtTarget &&
            !flatRangeChecks.threadball.directAtNextBand &&
            !flatRangeChecks.needlepoint.directAtNextBand &&
            !flatRangeChecks.spoolburst.directAtNextBand &&
            achievedDistances[1] > achievedDistances[0] &&
            achievedDistances[0] > achievedDistances[2]
    };
    return {
        profileId: PROFILE_ID,
        rulesetId: V5_RULESET_ID,
        latestRulesetDuringCalibration: LATEST_RULESET_ID,
        seedFormula: '0xC0FFEE11 + i*0x9E3779B9 mod 2^32, i=0..24',
        matches: matches.length,
        terminalMatches,
        terminalRatePercent,
        draws: matches.length - terminalMatches,
        firstActorWins,
        firstActorWinSharePercent,
        recurrenceWitnesses: matches.filter((match) => match.recurrence).length,
        relicSelections,
        maximumEvaluatedCandidates,
        maximumSimulatedTransitions,
        maximumCommands,
        flatRangeChecks,
        directDamage: directDamageValues,
        gates,
        pass: Object.values(gates).every(Boolean)
    };
}

function main(): void {
    const report = createV5BalanceReport();
    const outputIndex = process.argv.indexOf('--output');
    if (outputIndex >= 0) {
        const output = process.argv[outputIndex + 1];
        if (!output) throw new Error('--output requires a path.');
        const path = resolve(output);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (process.argv.includes('--verify') && !report.pass) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();

export const V5_MARKETING_PROFILE = Object.freeze({
    id: PROFILE_ID,
    rangeTargets: RANGE_TARGETS,
    relicRules: V5_RELIC_RULES,
    launchSpeedRules: V5_LAUNCH_SPEED_RULES
});
