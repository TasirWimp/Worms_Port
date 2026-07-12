import assert from 'node:assert/strict';
import test from 'node:test';

import {
    decideLoomkeeperTurn,
    LOOMKEEPER_POLICY_ID,
    LOOMKEEPER_PROFILES,
    type LoomkeeperDifficulty
} from '../../shared/loomkeeper';
import {
    advanceSimulationTicks,
    applySimulationCommand,
    canonicalSimulationJson,
    createSimulation
} from '../../shared/simulation';
import type { SimulationState } from '../../shared/simulation';
import { SessionRegistry } from '../../server/src/session/registry';
import { SimulationCoordinator } from '../../server/src/simulation/coordinator';

const SEEDS = [
    0x00000001,
    0x6D2B79F5,
    0xC0FFEE11,
    0xDEADBEEF,
    0xFFFFFFFF,
    0x13579BDF,
    0x2468ACE0
];
const DIFFICULTIES: LoomkeeperDifficulty[] = ['gentle', 'standard', 'sharp'];

function loomkeeperTurn(seed: number): SimulationState {
    return advanceSimulationTicks(createSimulation(seed, 'wizard'), 900).state;
}

function executeDecision(state: SimulationState, difficulty: LoomkeeperDifficulty) {
    const decision = decideLoomkeeperTurn(state, difficulty);
    assert.ok(decision);
    let current = structuredClone(state);
    for (const command of decision.commands) {
        const transition = applySimulationCommand(
            current,
            'loomkeeper',
            command,
            decision.expectedTurn
        );
        assert.equal(transition.accepted, true, JSON.stringify({ state, decision, command }));
        assert.equal(transition.mutated, true);
        current = transition.state;
    }
    return { decision, state: current };
}

test('decisions are deterministic, JSON-stable, and do not mutate their input', () => {
    for (const seed of SEEDS) {
        for (const difficulty of DIFFICULTIES) {
            const state = loomkeeperTurn(seed);
            const before = canonicalSimulationJson(state);
            const first = decideLoomkeeperTurn(state, difficulty);
            const second = decideLoomkeeperTurn(JSON.parse(JSON.stringify(state)), difficulty);
            assert.deepEqual(second, first, `${seed.toString(16)} ${difficulty}`);
            assert.equal(canonicalSimulationJson(state), before);
            assert.equal(first?.policyId, LOOMKEEPER_POLICY_ID);
        }
    }
});

test('every returned plan is legal and respects candidate, transition, and command budgets', () => {
    for (const seed of SEEDS) {
        for (const difficulty of DIFFICULTIES) {
            const { decision, state } = executeDecision(loomkeeperTurn(seed), difficulty);
            const profile = LOOMKEEPER_PROFILES[difficulty];
            assert.ok(decision.evaluatedCandidates <= profile.maximumCandidates);
            assert.ok(decision.evaluatedCandidates <= 256);
            assert.ok(decision.simulatedTransitions <= 3_072);
            assert.ok(decision.commands.length <= 11);
            assert.equal(decision.commands.at(-1)?.type, 'fire');
            assert.equal(decision.commands.filter((command) => command.type === 'select_relic').length, 1);
            assert.equal(decision.commands.filter((command) => command.type === 'aim').length, 1);
            assert.equal(Math.abs(decision.aimError.angleMilliDegrees) <= profile.maximumAngleError, true);
            assert.equal(Math.abs(decision.aimError.powerPermille) <= profile.maximumPowerError, true);
            assert.equal(state.phase === 'finished' || state.activeActor === 'player', true);
        }
    }
});

test('policy uses no wall clock or ambient randomness', () => {
    const originalRandom = Math.random;
    const originalNow = Date.now;
    Math.random = () => { throw new Error('Math.random is forbidden in Loomkeeper policy.'); };
    Date.now = () => { throw new Error('Date.now is forbidden in Loomkeeper policy.'); };
    try {
        assert.ok(decideLoomkeeperTurn(loomkeeperTurn(0xC0FFEE11), 'sharp'));
    } finally {
        Math.random = originalRandom;
        Date.now = originalNow;
    }
});

test('non-Loomkeeper and terminal states produce no decision', () => {
    assert.equal(decideLoomkeeperTurn(createSimulation(1, 'wizard')), undefined);
    const terminal = createSimulation(1, 'wizard');
    terminal.phase = 'finished';
    terminal.winner = 'draw';
    terminal.finishReason = 'turn_limit';
    assert.equal(decideLoomkeeperTurn(terminal), undefined);
});

test('standard seed-one decision is a stable policy golden', () => {
    const decision = decideLoomkeeperTurn(loomkeeperTurn(1), 'standard');
    assert.ok(decision);
    assert.deepEqual({
        policyId: decision.policyId,
        expectedTurn: decision.expectedTurn,
        chosenOrdinal: decision.chosenOrdinal,
        chosenScore: decision.chosenScore,
        idealAim: decision.idealAim,
        appliedAim: decision.appliedAim,
        evaluatedCandidates: decision.evaluatedCandidates,
        simulatedTransitions: decision.simulatedTransitions
    }, {
        policyId: 'nimble-knots-loomkeeper-v1',
        expectedTurn: 1,
        chosenOrdinal: 257,
        chosenScore: 1_039_116,
        idealAim: { angleMilliDegrees: 30_000, powerPermille: 1_000 },
        appliedAim: { angleMilliDegrees: 32_244, powerPermille: 1_000 },
        evaluatedCandidates: 128,
        simulatedTransitions: 903
    });
});

test('registry commits one chosen AI plan and replay reconstruction matches', () => {
    const registry = new SessionRegistry({
        simulationTickIntervalMs: false,
        sweepIntervalMs: 60_000,
        seedSource: () => 1
    });
    try {
        const opened = registry.create('socket-ai');
        assert.equal('code' in opened, false);
        const session = registry.getBound('socket-ai')!;
        const challenge = registry.createChallenge(session, 'practice', 'wizard');
        assert.equal('code' in challenge, false);
        if ('code' in challenge) return;
        assert.equal(challenge.loomkeeperPolicyId, LOOMKEEPER_POLICY_ID);
        const timeout = registry.advanceChallengeTicks(session, challenge.challengeId, 900);
        assert.equal('code' in timeout, false);
        const driven = registry.driveLoomkeeperTurn(session, challenge.challengeId);
        assert.ok(driven && !('code' in driven));
        assert.equal(driven.simulation.activeActor, 'player');
        assert.equal(registry.driveLoomkeeperTurn(session, challenge.challengeId), undefined);

        const replay = registry.replayForChallenge(session, challenge.challengeId)!;
        const aiRecords = replay.records.filter(
            (record) => record.operation.kind === 'command' && record.operation.actor === 'loomkeeper'
        );
        assert.equal(aiRecords.length > 0, true);
        assert.equal(aiRecords.at(-1)?.operation.kind, 'command');
        if (aiRecords.at(-1)?.operation.kind === 'command') {
            assert.equal(aiRecords.at(-1)!.operation.command.type, 'fire');
        }
        const verifier = new SimulationCoordinator();
        try {
            const reconstructed = verifier.reconstructAndVerify(replay);
            assert.equal(reconstructed.stateHash, driven.stateHash);
        } finally {
            verifier.dispose();
        }
    } finally {
        registry.dispose();
    }
});

test('two complete policy golden matches reconstruct to their exact final hashes', () => {
    const goldens = [
        {
            seed: 0x00000001,
            winner: 'player',
            tick: 141,
            replayLength: 15,
            stateHash: '424506e3eb1d3b0490ea63de620b785835242cd784e74abcb26690c0a58f5652'
        },
        {
            seed: 0xDEADBEEF,
            winner: 'player',
            tick: 255,
            replayLength: 18,
            stateHash: 'ead792a7448694ce3b4c91c6867cc3d291ade12d5316673f539d737b5e9a0d6d'
        }
    ] as const;
    for (const golden of goldens) {
        const registry = new SessionRegistry({
            simulationTickIntervalMs: false,
            sweepIntervalMs: 60_000,
            seedSource: () => golden.seed
        });
        try {
            registry.create(`socket-${golden.seed}`);
            const session = registry.getBound(`socket-${golden.seed}`)!;
            const created = registry.createChallenge(session, 'practice', 'wizard');
            assert.equal('code' in created, false);
            if ('code' in created) continue;
            let snapshot = created;
            while (snapshot.simulation.phase !== 'finished') {
                const turn = snapshot.simulation.turn;
                const aimed = registry.submitCommand(session, created.challengeId, {
                    type: 'aim', angleMilliDegrees: 35_000, powerPermille: 1_000
                }, turn);
                assert.equal('code' in aimed, false);
                const fired = registry.submitCommand(
                    session, created.challengeId, { type: 'fire' }, turn
                );
                assert.equal('code' in fired, false);
                if ('code' in fired) break;
                snapshot = fired;
                const reply = registry.driveLoomkeeperTurn(session, created.challengeId);
                if (reply && !('code' in reply)) snapshot = reply;
            }
            assert.equal(snapshot.simulation.winner, golden.winner);
            assert.equal(snapshot.simulation.tick, golden.tick);
            assert.equal(snapshot.stateHash, golden.stateHash);
            const replay = registry.replayForChallenge(session, created.challengeId)!;
            assert.equal(replay.records.length, golden.replayLength);
            const verifier = new SimulationCoordinator();
            try {
                assert.equal(verifier.reconstructAndVerify(replay).stateHash, golden.stateHash);
            } finally {
                verifier.dispose();
            }
        } finally {
            registry.dispose();
        }
    }
});

test('player turn and replay reservations prevent an incomplete AI handoff', () => {
    assert.throws(() => new SessionRegistry({
        simulationTickIntervalMs: false,
        simulationMaxReplayRecords: 2
    }), /at least 512/);

    const bounded = new SessionRegistry({
        simulationTickIntervalMs: false,
        sweepIntervalMs: 60_000,
        seedSource: () => 1
    });
    try {
        bounded.create('socket-turn-cap');
        const session = bounded.getBound('socket-turn-cap')!;
        const created = bounded.createChallenge(session, 'practice', 'wizard');
        assert.equal('code' in created, false);
        if ('code' in created) return;
        for (let index = 0; index < 16; index += 1) {
            assert.equal('code' in bounded.submitCommand(session, created.challengeId, {
                type: 'aim', angleMilliDegrees: 20_000 + index, powerPermille: 500
            }, 0), false);
        }
        const overflow = bounded.submitCommand(session, created.challengeId, {
            type: 'select_relic', relicId: 'threadball'
        }, 0);
        assert.equal('code' in overflow, true);
        if ('code' in overflow) assert.match(overflow.message, /command budget/);
        assert.equal(bounded.replayForChallenge(session, created.challengeId)!.records.length, 16);
    } finally {
        bounded.dispose();
    }
});

test('timeout scheduling drives exactly one AI turn and queued work is lifecycle-safe', async () => {
    const registry = new SessionRegistry({
        simulationTickIntervalMs: false,
        sweepIntervalMs: 60_000,
        seedSource: () => 1
    });
    try {
        registry.create('socket-timeout');
        const session = registry.getBound('socket-timeout')!;
        const created = registry.createChallenge(session, 'practice', 'wizard');
        assert.equal('code' in created, false);
        if ('code' in created) return;
        registry.advanceChallengeTicks(session, created.challengeId, 900);
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        const driven = registry.activeSnapshot(session)!;
        assert.equal(driven.simulation.turn, 2);
        assert.equal(driven.simulation.activeActor, 'player');
        const replay = registry.replayForChallenge(session, created.challengeId)!;
        assert.equal(replay.records.filter(
            (record) => record.operation.kind === 'command' && record.operation.actor === 'loomkeeper'
        ).length > 0, true);

        registry.advanceChallengeTicks(session, created.challengeId, 900);
        registry.leaveChallenge(session, created.challengeId);
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        assert.equal(registry.replayForChallenge(session, created.challengeId), undefined);
    } finally {
        registry.dispose();
    }
});
