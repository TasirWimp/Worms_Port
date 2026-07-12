import {
    applySimulationCommand,
    cloneSimulation,
    LEGACY_RULESET_ID,
    relicsForRuleset,
    SIM_RULES
} from './simulation';
import type { RelicId, SimulationCommand, SimulationState } from './simulation';

export const LOOMKEEPER_POLICY_ID = 'nimble-knots-loomkeeper-v1' as const;
export const LEGACY_LOOMKEEPER_POLICY_ID = LOOMKEEPER_POLICY_ID;
export const LATEST_LOOMKEEPER_POLICY_ID = 'nimble-knots-loomkeeper-v2' as const;
export const LOOMKEEPER_MAX_COMMANDS = 11 as const;

export type LoomkeeperDifficulty = 'gentle' | 'standard' | 'sharp';

export type LoomkeeperDecision = {
    policyId: typeof LOOMKEEPER_POLICY_ID | typeof LATEST_LOOMKEEPER_POLICY_ID;
    difficulty: LoomkeeperDifficulty;
    expectedTurn: number;
    basisRevision: number;
    commands: SimulationCommand[];
    evaluatedCandidates: number;
    simulatedTransitions: number;
    chosenOrdinal: number;
    chosenScore: number;
    selectedRelic: RelicId;
    idealAim: { angleMilliDegrees: number; powerPermille: number };
    appliedAim: { angleMilliDegrees: number; powerPermille: number };
    aimError: { angleMilliDegrees: number; powerPermille: number };
    candidateCoverage: {
        movementSteps: number[];
        relicIds: RelicId[];
        angles: number[];
        powers: number[];
    };
};

type Profile = {
    movementSteps: readonly number[];
    angles: readonly number[];
    powers: readonly number[];
    maximumCandidates: number;
    maximumAngleError: number;
    maximumPowerError: number;
};

export const LOOMKEEPER_PROFILES: Readonly<Record<LoomkeeperDifficulty, Profile>> = Object.freeze({
    gentle: Object.freeze({
        movementSteps: Object.freeze([0, -4, 4]),
        angles: Object.freeze([20_000, 35_000, 50_000, 65_000]),
        powers: Object.freeze([400, 600, 800]),
        maximumCandidates: 36,
        maximumAngleError: 7_000,
        maximumPowerError: 120
    }),
    standard: Object.freeze({
        movementSteps: Object.freeze([0, -2, 2, -4, 4, -8, 8]),
        angles: Object.freeze([10_000, 20_000, 30_000, 40_000, 50_000, 60_000, 70_000, 80_000]),
        powers: Object.freeze([300, 450, 600, 750, 900, 1_000]),
        maximumCandidates: 128,
        maximumAngleError: 3_000,
        maximumPowerError: 60
    }),
    sharp: Object.freeze({
        movementSteps: Object.freeze([0, -1, 1, -2, 2, -4, 4, -8, 8]),
        angles: Object.freeze([
            5_000, 10_000, 15_000, 20_000, 25_000, 30_000, 35_000, 40_000, 45_000,
            50_000, 55_000, 60_000, 65_000, 70_000, 75_000, 80_000, 85_000
        ]),
        powers: Object.freeze([250, 350, 450, 550, 650, 750, 850, 950]),
        maximumCandidates: 256,
        maximumAngleError: 1_000,
        maximumPowerError: 20
    })
});

type Candidate = {
    ordinal: number;
    movementSteps: number;
    relicId: RelicId;
    angleMilliDegrees: number;
    powerPermille: number;
};

type Evaluation = {
    state: SimulationState;
    commands: SimulationCommand[];
    transitions: number;
    score: number;
};

/**
 * Selects a turn using only legal transitions exposed by the public simulation
 * API. Candidate rollouts are detached clones and never consume authoritative
 * RNG or replay capacity.
 */
export function decideLoomkeeperTurn(
    source: SimulationState,
    difficulty: LoomkeeperDifficulty = 'standard'
): LoomkeeperDecision | undefined {
    if (source.phase !== 'awaiting_command' || source.activeActor !== 'loomkeeper') {
        return undefined;
    }
    const profile = LOOMKEEPER_PROFILES[difficulty];
    if (!profile) throw new RangeError(`Unknown Loomkeeper difficulty: ${String(difficulty)}.`);

    const candidates = boundedCandidates(
        profile,
        relicsForRuleset(source.rulesetId),
        source.rulesetId === LEGACY_RULESET_ID
    );
    let best: { candidate: Candidate; evaluation: Evaluation } | undefined;
    let evaluatedCandidates = 0;
    let simulatedTransitions = 0;
    for (const candidate of candidates) {
        const evaluation = evaluateCandidate(source, candidate);
        simulatedTransitions += evaluation?.transitions ?? movementCommandCount(candidate.movementSteps) + 1;
        if (!evaluation) continue;
        evaluatedCandidates += 1;
        if (!best || evaluation.score > best.evaluation.score) {
            best = { candidate, evaluation };
        }
    }
    if (!best) return undefined;

    const angleError = scaledError(source, 0xA341316C, profile.maximumAngleError);
    const powerError = scaledError(source, 0xC8013EA4, profile.maximumPowerError);
    const appliedAim = {
        angleMilliDegrees: clamp(best.candidate.angleMilliDegrees + angleError, -90_000, 90_000),
        powerPermille: clamp(best.candidate.powerPermille + powerError, 0, 1_000)
    };
    const appliedCandidate = {
        ...best.candidate,
        angleMilliDegrees: appliedAim.angleMilliDegrees,
        powerPermille: appliedAim.powerPermille
    };
    const applied = evaluateCandidate(source, appliedCandidate);
    if (!applied) throw new Error('A bounded Loomkeeper aim adjustment produced an illegal plan.');
    simulatedTransitions += applied.transitions;

    return {
        policyId: loomkeeperPolicyIdFor(source),
        difficulty,
        expectedTurn: source.turn,
        basisRevision: source.revision,
        commands: applied.commands.map((command) => structuredClone(command)),
        evaluatedCandidates,
        simulatedTransitions,
        chosenOrdinal: best.candidate.ordinal,
        chosenScore: applied.score,
        selectedRelic: best.candidate.relicId,
        idealAim: {
            angleMilliDegrees: best.candidate.angleMilliDegrees,
            powerPermille: best.candidate.powerPermille
        },
        appliedAim,
        aimError: {
            angleMilliDegrees: appliedAim.angleMilliDegrees - best.candidate.angleMilliDegrees,
            powerPermille: appliedAim.powerPermille - best.candidate.powerPermille
        },
        candidateCoverage: {
            movementSteps: unique(candidates.map((candidate) => candidate.movementSteps)),
            relicIds: unique(candidates.map((candidate) => candidate.relicId)),
            angles: unique(candidates.map((candidate) => candidate.angleMilliDegrees)),
            powers: unique(candidates.map((candidate) => candidate.powerPermille))
        }
    };
}

export function loomkeeperPolicyIdFor(
    state: Pick<SimulationState, 'rulesetId'>
): LoomkeeperDecision['policyId'] {
    return state.rulesetId === LEGACY_RULESET_ID
        ? LEGACY_LOOMKEEPER_POLICY_ID
        : LATEST_LOOMKEEPER_POLICY_ID;
}

function boundedCandidates(
    profile: Profile,
    relicIds: readonly RelicId[],
    legacySampling: boolean
): Candidate[] {
    const all: Candidate[] = [];
    let ordinal = 0;
    for (const movementSteps of profile.movementSteps) {
        for (const relicId of relicIds) {
            for (const angleMilliDegrees of profile.angles) {
                for (const powerPermille of profile.powers) {
                    all.push({ ordinal, movementSteps, relicId, angleMilliDegrees, powerPermille });
                    ordinal += 1;
                }
            }
        }
    }
    if (all.length <= profile.maximumCandidates) return all;
    if (legacySampling) {
        return Array.from(
            { length: profile.maximumCandidates },
            (_, index) => all[Math.trunc(index * all.length / profile.maximumCandidates)]
        );
    }
    const selected: Candidate[] = [];
    const stride = coprimeStride(all.length, Math.trunc(all.length / profile.maximumCandidates) + 1);
    let cursor = 0;
    for (let index = 0; index < profile.maximumCandidates; index += 1) {
        selected.push(all[cursor]);
        cursor = (cursor + stride) % all.length;
    }
    return selected;
}

function coprimeStride(length: number, start: number): number {
    let stride = Math.max(1, start);
    while (greatestCommonDivisor(stride, length) !== 1) stride += 1;
    return stride;
}

function greatestCommonDivisor(left: number, right: number): number {
    let a = left;
    let b = right;
    while (b !== 0) {
        const remainder = a % b;
        a = b;
        b = remainder;
    }
    return a;
}

function unique<T>(values: readonly T[]): T[] {
    return [...new Set(values)];
}

function evaluateCandidate(source: SimulationState, candidate: Candidate): Evaluation | undefined {
    let state = cloneSimulation(source);
    const commands: SimulationCommand[] = [];
    let transitions = 0;
    const direction = Math.sign(candidate.movementSteps) as -1 | 0 | 1;
    for (let step = 0; step < movementCommandCount(candidate.movementSteps); step += 1) {
        const command: SimulationCommand = { type: 'move', direction };
        const transition = applySimulationCommand(state, 'loomkeeper', command, source.turn);
        transitions += 1;
        if (!transition.accepted || !transition.mutated) return undefined;
        state = transition.state;
        commands.push(command);
    }
    const turnCommands: SimulationCommand[] = [
        { type: 'select_relic', relicId: candidate.relicId },
        {
            type: 'aim',
            angleMilliDegrees: candidate.angleMilliDegrees,
            powerPermille: candidate.powerPermille
        },
        { type: 'fire' }
    ];
    for (const command of turnCommands) {
        const transition = applySimulationCommand(state, 'loomkeeper', command, source.turn);
        transitions += 1;
        if (!transition.accepted || !transition.mutated) return undefined;
        state = transition.state;
        commands.push(command);
    }
    return { state, commands, transitions, score: scoreState(source, state, commands.length) };
}

function scoreState(before: SimulationState, after: SimulationState, commandCount: number): number {
    const beforePlayer = before.units[0];
    const beforeLoomkeeper = before.units[1];
    const player = after.units[0];
    const loomkeeper = after.units[1];
    const targetDamage = beforePlayer.stitching - player.stitching;
    const selfDamage = beforeLoomkeeper.stitching - loomkeeper.stitching;
    const projectile = after.lastProjectile!;
    const dx = projectile.endX - player.x;
    const dy = projectile.endY - player.y;
    const proximityPenalty = Math.min(1_000_000, dx * dx + dy * dy);
    const terminal = after.winner === 'loomkeeper'
        ? 10_000_000
        : after.winner === 'player'
            ? -10_000_000
            : 0;
    return terminal + targetDamage * 20_000 - selfDamage * 25_000 - proximityPenalty - commandCount;
}

function scaledError(state: SimulationState, salt: number, maximum: number): number {
    let value = (state.seed ^ state.rngState ^ state.turn ^ salt) >>> 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    const signedPermille = Number(value >>> 0) % 2_001 - 1_000;
    return Math.trunc(signedPermille * maximum / 1_000);
}

function movementCommandCount(steps: number): number {
    return Math.min(Math.abs(steps), SIM_RULES.movementPerTurn / SIM_RULES.movementStep);
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}
