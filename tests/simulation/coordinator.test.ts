import assert from 'node:assert/strict';
import test from 'node:test';

import {
    canonicalSimulationJson,
    SIM_RULES
} from '../../shared/simulation';
import {
    hashSimulationState,
    SimulationCoordinator
} from '../../server/src/simulation/coordinator';

test('coordinator replay reconstructs every authoritative command and tick transition', () => {
    const coordinator = new SimulationCoordinator();
    try {
        const created = coordinator.create('challenge_reconstruct', 'session_reconstruct', 0xC0FFEE11, 'wizard');
        coordinator.apply('challenge_reconstruct', 'player', {
            type: 'aim', angleMilliDegrees: 45_000, powerPermille: 1_000
        }, 0);
        coordinator.apply('challenge_reconstruct', 'player', { type: 'fire' }, 0);
        coordinator.advance('challenge_reconstruct', 17);

        const replay = coordinator.replay('challenge_reconstruct')!;
        const restored = coordinator.reconstructAndVerify(replay);
        const live = coordinator.get('challenge_reconstruct')!;
        assert.equal(replay.initialStateHash, created.stateHash);
        assert.equal(restored.stateHash, live.stateHash);
        assert.equal(canonicalSimulationJson(restored.state), canonicalSimulationJson(live.state));
        assert.equal(restored.replayLength, 3);
    } finally {
        coordinator.dispose();
    }
});

test('consecutive tick advances coalesce without changing reconstruction', () => {
    const coordinator = new SimulationCoordinator({ maxReplayRecords: 2 });
    try {
        coordinator.create('challenge_coalesce', 'session_coalesce', 0x13579BDF, 'wizard');
        coordinator.advance('challenge_coalesce', 13);
        const second = coordinator.advance('challenge_coalesce', 31);
        const replay = coordinator.replay('challenge_coalesce')!;
        assert.equal(second.state.tick, 44);
        assert.equal(replay.records.length, 1);
        assert.deepEqual(replay.records[0].operation, { kind: 'ticks', count: 44 });
        const reconstructed = coordinator.reconstructAndVerify(replay);
        assert.equal(reconstructed.stateHash, second.stateHash);

        const command = coordinator.apply('challenge_coalesce', 'player', {
            type: 'aim', angleMilliDegrees: 20_000, powerPermille: 500
        }, 0);
        assert.equal(command.transition.accepted, true);
        assert.equal(command.replayLength, 2);
        const rejected = coordinator.advance('challenge_coalesce', 1);
        assert.equal(rejected.transition.accepted, false);
        assert.equal(rejected.transition.mutated, false);
        assert.equal(rejected.stateHash, command.stateHash);
    } finally {
        coordinator.dispose();
    }
});

test('coordinator snapshots and replay records are detached from live authority', () => {
    const coordinator = new SimulationCoordinator();
    try {
        const snapshot = coordinator.create('challenge_detached', 'session_detached', 1, 'thief');
        const originalHash = snapshot.stateHash;
        snapshot.state.units[0].x += 100;
        snapshot.state.terrain.words[0] ^= 1;
        assert.equal(coordinator.get('challenge_detached')!.stateHash, originalHash);

        coordinator.apply('challenge_detached', 'player', {
            type: 'aim', angleMilliDegrees: 30_000, powerPermille: 500
        }, 0);
        const replay = coordinator.replay('challenge_detached')!;
        replay.records[0].operation.kind === 'command' &&
            (replay.records[0].operation.expectedTurn = 99);
        assert.equal(coordinator.replay('challenge_detached')!.records[0].operation.kind, 'command');
        assert.equal(
            (coordinator.replay('challenge_detached')!.records[0].operation as { expectedTurn: number }).expectedTurn,
            0
        );
    } finally {
        coordinator.dispose();
    }
});

test('rejected wrong-actor and late commands do not enter replay or change hashes', () => {
    const coordinator = new SimulationCoordinator();
    try {
        const initial = coordinator.create('challenge_rejected', 'session_rejected', 1, 'wizard');
        for (const update of [
            coordinator.apply('challenge_rejected', 'loomkeeper', { type: 'move', direction: -1 }, 0),
            coordinator.apply('challenge_rejected', 'player', { type: 'move', direction: 1 }, 4)
        ]) {
            assert.equal(update.transition.accepted, false);
            assert.equal(update.transition.mutated, false);
            assert.equal(update.stateHash, initial.stateHash);
            assert.equal(update.replayLength, 0);
        }
    } finally {
        coordinator.dispose();
    }
});

test('reconstruction rejects altered hashes, noncontiguous indexes, and excessive records', () => {
    const coordinator = new SimulationCoordinator({ maxReplayRecords: 2 });
    try {
        coordinator.create('challenge_tamper', 'session_tamper', 1, 'wizard');
        coordinator.apply('challenge_tamper', 'player', {
            type: 'aim', angleMilliDegrees: 30_000, powerPermille: 500
        }, 0);
        const replay = coordinator.replay('challenge_tamper')!;

        const badHash = structuredClone(replay);
        badHash.records[0].stateHash = '0'.repeat(64);
        assert.throws(() => coordinator.reconstructAndVerify(badHash), /diverged/);

        const badIndex = structuredClone(replay);
        badIndex.records[0].index = 2;
        assert.throws(() => coordinator.reconstructAndVerify(badIndex), /not contiguous/);

        const tooLong = structuredClone(replay);
        tooLong.records.push(structuredClone(tooLong.records[0]), structuredClone(tooLong.records[0]));
        assert.throws(() => coordinator.reconstructAndVerify(tooLong), /record limit/);
    } finally {
        coordinator.dispose();
    }
});

test('terminal results are emitted and consumed exactly once', () => {
    const terminals: unknown[] = [];
    const coordinator = new SimulationCoordinator({ onTerminal: (result) => terminals.push(result) });
    try {
        coordinator.create('challenge_terminal', 'session_terminal', 1, 'wizard');
        const update = coordinator.advance(
            'challenge_terminal',
            SIM_RULES.turnTicks * SIM_RULES.maximumTurns
        );
        assert.equal(update.terminalResult?.winner, 'draw');
        assert.equal(terminals.length, 1);
        assert.deepEqual(coordinator.takePendingTerminalResult('challenge_terminal'), update.terminalResult);
        assert.equal(coordinator.takePendingTerminalResult('challenge_terminal'), undefined);
        assert.throws(
            () => coordinator.advance('challenge_terminal', 1),
            /terminal/
        );
    } finally {
        coordinator.dispose();
    }
});

test('serialized authoritative coordinator snapshots remain below the V4 12 KiB event cap', () => {
    const coordinator = new SimulationCoordinator();
    try {
        const initial = coordinator.create('challenge_payload', 'session_payload', 0xFFFFFFFF, 'warrior');
        assert.equal(Buffer.byteLength(JSON.stringify(initial), 'utf8') <= 12 * 1024, true);
        assert.equal(Buffer.byteLength(canonicalSimulationJson(initial.state), 'utf8') <= 12 * 1024, true);

        const aim = coordinator.apply('challenge_payload', 'player', {
            type: 'aim', angleMilliDegrees: 75_000, powerPermille: 1_000
        }, 0);
        const fired = coordinator.apply('challenge_payload', 'player', { type: 'fire' }, 0);
        assert.equal(Buffer.byteLength(JSON.stringify(aim), 'utf8') <= 12 * 1024, true);
        assert.equal(Buffer.byteLength(JSON.stringify(fired), 'utf8') <= 12 * 1024, true);
        assert.equal(fired.stateHash, hashSimulationState(fired.state));
        const liveTraceX = fired.state.lastProjectile!.trace[0].x;
        fired.state.lastProjectile!.trace[0].x += 1;
        assert.equal(
            coordinator.get('challenge_payload')!.state.lastProjectile!.trace[0].x,
            liveTraceX
        );
    } finally {
        coordinator.dispose();
    }
});

test('coordinator pause suspends scheduled ticks without entering deterministic replay', () => {
    const coordinator = new SimulationCoordinator();
    try {
        const created = coordinator.create('challenge_paused', 'session_paused', 1, 'wizard');
        coordinator.setPaused('challenge_paused', true);
        assert.equal(coordinator.isPaused('challenge_paused'), true);
        assert.deepEqual(coordinator.tickAll(30), []);
        assert.equal(coordinator.get('challenge_paused')!.stateHash, created.stateHash);
        assert.equal(coordinator.replay('challenge_paused')!.records.length, 0);

        coordinator.setPaused('challenge_paused', false);
        const [advanced] = coordinator.tickAll(30);
        assert.equal(advanced.state.tick, 30);
        assert.equal(coordinator.replay('challenge_paused')!.records.length, 1);
    } finally {
        coordinator.dispose();
    }
});
