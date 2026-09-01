import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createLatestSimulation,
    createSimulation,
    V6_RULESET_ID,
    V7_RULESET_ID
} from '../../shared/simulation';

import {
    ChallengeCreateRequestSchema,
    ChallengeLeaveRequestSchema,
    ChallengePauseRequestSchema,
    ChallengeResultSchema,
    ChallengeSnapshotSchema,
    CommandSubmitRequestSchema,
    IdentityBeginDataSchema,
    IdentityBeginRequestSchema,
    IdentityCancelDataSchema,
    IdentityCancelRequestSchema,
    IdentityCompleteDataSchema,
    IdentityCompleteRequestSchema,
    ProtocolFailureAckSchema,
    ProtocolSuccessAckSchema,
    SESSION_TOKEN_PATTERN,
    SessionOpenDataSchema,
    SessionOpenRequestSchema
} from '../../shared/protocol';

const requestId = 'request_01';
const challengeId = 'challenge_000001';
const token = 'a'.repeat(43);
const now = 1_700_000_000_000;
const expiresAt = new Date(now + 60_000).toISOString();

test('session request schema enforces strict ids, actions, and opaque tokens', () => {
    assert.equal(SessionOpenRequestSchema.safeParse({
        requestId: 'a'.repeat(8), action: 'create'
    }).success, true);
    assert.equal(SessionOpenRequestSchema.safeParse({
        requestId: 'a'.repeat(64), action: 'create'
    }).success, true);
    assert.equal(SessionOpenRequestSchema.safeParse({
        requestId, action: 'resume', token
    }).success, true);
    assert.match(token, SESSION_TOKEN_PATTERN);

    for (const invalid of [
        { requestId: 'a'.repeat(7), action: 'create' },
        { requestId: 'a'.repeat(65), action: 'create' },
        { requestId, action: 'create', extra: true },
        { requestId, action: 'resume', token: 'short' },
        { requestId, action: 'resume', token, extra: true },
        { requestId, action: 'authorize', proof: {} },
        null,
        []
    ]) {
        assert.equal(SessionOpenRequestSchema.safeParse(invalid).success, false);
    }
});

test('identity schemas require strict server challenge and exact Nimiq proof fields', () => {
    const address = 'NQ46 KLJE 5TMF 4Y1A 1255 CJHJ YG1S H0NU T604';
    const authorizationId = 'A'.repeat(32);
    const identity = { address, authorizedAt: expiresAt };
    const session = {
        protocolVersion: 1 as const,
        serverTimeMs: now,
        sessionId: 'session_00000001',
        token,
        resumed: false,
        expiresAt,
        identity
    };
    assert.equal(IdentityBeginRequestSchema.safeParse({ requestId, address }).success, true);
    assert.equal(IdentityCompleteRequestSchema.safeParse({
        requestId,
        authorizationId,
        address,
        publicKey: 'ab'.repeat(32),
        signature: 'cd'.repeat(64)
    }).success, true);
    assert.equal(IdentityCancelRequestSchema.safeParse({
        requestId,
        authorizationId
    }).success, true);
    assert.equal(IdentityBeginDataSchema.safeParse({
        authorizationId,
        address,
        message: 'A'.repeat(64),
        expiresAt
    }).success, true);
    assert.equal(IdentityCompleteDataSchema.safeParse(session).success, true);
    assert.equal(IdentityCancelDataSchema.safeParse({ cancelled: true }).success, true);

    for (const invalid of [
        { requestId, address: 'NQ00 BAD!' },
        { requestId, address, extra: true }
    ]) assert.equal(IdentityBeginRequestSchema.safeParse(invalid).success, false);
    for (const invalid of [
        { requestId, authorizationId: 'short', address, publicKey: 'ab'.repeat(32), signature: 'cd'.repeat(64) },
        { requestId, authorizationId, address: address.toLowerCase(), publicKey: 'ab'.repeat(32), signature: 'cd'.repeat(64) },
        { requestId, authorizationId, address, publicKey: 'ab'.repeat(31), signature: 'cd'.repeat(64) },
        { requestId, authorizationId, address, publicKey: 'ab'.repeat(32), signature: 'cd'.repeat(63) }
    ]) assert.equal(IdentityCompleteRequestSchema.safeParse(invalid).success, false);
    for (const invalid of [
        { requestId, authorizationId: 'short' },
        { requestId, authorizationId, extra: true }
    ]) assert.equal(IdentityCancelRequestSchema.safeParse(invalid).success, false);
});

test('challenge schemas separate strict practice and reward creation', () => {
    assert.equal(ChallengeCreateRequestSchema.safeParse({
        requestId, sequence: 0, mode: 'practice', calling: 'wizard'
    }).success, true);
    assert.equal(ChallengeCreateRequestSchema.safeParse({
        requestId,
        sequence: 0xFFFFFFFF,
        mode: 'reward',
        calling: 'warrior',
        eligibility: {
            challengeId: 'reward_challenge_01',
            token: 'e'.repeat(43)
        }
    }).success, true);

    for (const invalid of [
        { requestId, sequence: -1, mode: 'practice', calling: 'wizard' },
        { requestId, sequence: 0x100000000, mode: 'practice', calling: 'wizard' },
        { requestId, sequence: 0, mode: 'practice', calling: 'bard' },
        { requestId, sequence: 0, mode: 'practice', calling: 'wizard', eligibility: { token: 'eligibility_token_01' } },
        { requestId, sequence: 0, mode: 'reward', calling: 'thief' },
        { requestId, sequence: 0, mode: 'reward', calling: 'thief', eligibility: { challengeId: 'reward_challenge_01', token: 'too-short' } }
    ]) {
        assert.equal(ChallengeCreateRequestSchema.safeParse(invalid).success, false);
    }
});

test('command schema accepts exact field boundaries and rejects unsafe intent', () => {
    const validCommands = [
        { type: 'move', direction: -1 },
        { type: 'move', direction: 0 },
        { type: 'move', direction: 1 },
        { type: 'select_relic', relicId: 'a' },
        { type: 'select_relic', relicId: `a${'b'.repeat(31)}` },
        { type: 'aim', angleMilliDegrees: -90_000, powerPermille: 0 },
        { type: 'aim', angleMilliDegrees: 90_000, powerPermille: 1_000 },
        { type: 'fire' }
    ];
    for (const command of validCommands) {
        assert.equal(CommandSubmitRequestSchema.safeParse({
            requestId, sequence: 0, challengeId, expectedTurn: 0, command
        }).success, true);
    }

    const invalidCommands = [
        { type: 'move', direction: 2 },
        { type: 'move', direction: 1, extra: true },
        { type: 'select_relic', relicId: '' },
        { type: 'select_relic', relicId: 'A relic' },
        { type: 'aim', angleMilliDegrees: -90_001, powerPermille: 500 },
        { type: 'aim', angleMilliDegrees: 0.5, powerPermille: 500 },
        { type: 'aim', angleMilliDegrees: 0, powerPermille: 1_001 },
        { type: 'aim', angleMilliDegrees: Number.NaN, powerPermille: 500 },
        { type: 'aim', angleMilliDegrees: Number.POSITIVE_INFINITY, powerPermille: 500 },
        { type: 'fire', payload: {} },
        { type: 'unknown' }
    ];
    for (const command of invalidCommands) {
        assert.equal(CommandSubmitRequestSchema.safeParse({
            requestId, sequence: 0, challengeId, expectedTurn: 0, command
        }).success, false);
    }

    assert.equal(CommandSubmitRequestSchema.safeParse({
        requestId,
        sequence: 0,
        challengeId: 'a'.repeat(15),
        expectedTurn: 0,
        command: { type: 'fire' }
    }).success, false);
    assert.equal(ChallengeLeaveRequestSchema.safeParse({
        requestId,
        sequence: 0,
        challengeId: 'a'.repeat(64)
    }).success, true);
    assert.equal(ChallengePauseRequestSchema.safeParse({
        requestId, sequence: 1, challengeId, paused: true
    }).success, true);
    assert.equal(ChallengePauseRequestSchema.safeParse({
        requestId, sequence: 1, challengeId, paused: 'true'
    }).success, false);
    assert.equal(ChallengePauseRequestSchema.safeParse({
        requestId, sequence: 1, challengeId, paused: false, extra: true
    }).success, false);
});

test('response schemas are strict and carry versioned timing metadata', () => {
    const session = {
        protocolVersion: 1 as const,
        serverTimeMs: now,
        sessionId: 'session_00000001',
        token,
        resumed: false,
        expiresAt
    };
    const simulation = createSimulation(1, 'wizard');
    const snapshot = {
        protocolVersion: 1 as const,
        serverTimeMs: now,
        sessionId: session.sessionId,
        challengeId,
        mode: 'practice' as const,
        calling: 'wizard' as const,
        loomkeeperPolicyId: 'nimble-knots-loomkeeper-v1' as const,
        loomkeeperDifficulty: 'standard' as const,
        status: 'active' as const,
        paused: false,
        revision: 0,
        nextSequence: 1,
        expiresAt,
        stateHash: 'a'.repeat(64),
        simulation
    };
    const result = {
        protocolVersion: 1 as const,
        serverTimeMs: now,
        sessionId: session.sessionId,
        challengeId,
        outcome: 'left' as const,
        revision: 1,
        nextSequence: 2,
        finalTick: 0,
        finalStateHash: 'b'.repeat(64)
    };

    assert.equal(SessionOpenDataSchema.safeParse(session).success, true);
    assert.equal(ChallengeSnapshotSchema.safeParse(snapshot).success, true);
    const v2Snapshot = {
        ...snapshot,
        loomkeeperPolicyId: 'nimble-knots-loomkeeper-v2',
        simulation: createSimulation(1, 'wizard', 'nimble-knots-artillery-v2')
    } as const;
    assert.equal(ChallengeSnapshotSchema.safeParse(v2Snapshot).success, true);
    const currentSnapshot = {
        ...snapshot,
        loomkeeperPolicyId: 'nimble-knots-loomkeeper-v2',
        simulation: createLatestSimulation(1, 'wizard')
    } as const;
    assert.equal(ChallengeSnapshotSchema.safeParse(currentSnapshot).success, true);
    assert.equal(currentSnapshot.simulation.rulesetId, V7_RULESET_ID);
    const v6Snapshot = {
        ...snapshot,
        loomkeeperPolicyId: 'nimble-knots-loomkeeper-v2',
        simulation: createSimulation(1, 'wizard', V6_RULESET_ID)
    } as const;
    assert.equal(ChallengeSnapshotSchema.safeParse(v6Snapshot).success, true);
    const v5Snapshot = {
        ...snapshot,
        loomkeeperPolicyId: 'nimble-knots-loomkeeper-v2',
        simulation: createSimulation(1, 'wizard', 'nimble-knots-artillery-v5')
    } as const;
    assert.equal(ChallengeSnapshotSchema.safeParse(v5Snapshot).success, true);
    assert.equal(ChallengeSnapshotSchema.safeParse({
        ...snapshot,
        loomkeeperPolicyId: 'nimble-knots-loomkeeper-v2'
    }).success, false);
    assert.equal(ChallengeSnapshotSchema.safeParse({
        ...currentSnapshot,
        loomkeeperPolicyId: 'nimble-knots-loomkeeper-v1'
    }).success, false);
    assert.equal(ChallengeSnapshotSchema.safeParse({
        ...currentSnapshot,
        simulation: {
            ...createLatestSimulation(1, 'wizard'),
            rulesetVersion: 6
        }
    }).success, false);
    assert.equal(ChallengeSnapshotSchema.safeParse({
        ...currentSnapshot,
        simulation: {
            ...createLatestSimulation(1, 'wizard'),
            rulesetId: V6_RULESET_ID
        }
    }).success, false);
    assert.equal(ChallengeResultSchema.safeParse(result).success, true);
    assert.equal(ProtocolSuccessAckSchema(SessionOpenDataSchema).safeParse({
        protocolVersion: 1,
        serverTimeMs: now,
        ok: true,
        requestId,
        data: session
    }).success, true);
    assert.equal(ProtocolFailureAckSchema.safeParse({
        protocolVersion: 1,
        serverTimeMs: now,
        ok: false,
        requestId,
        error: { code: 'BAD_REQUEST', message: 'Invalid.', retryable: false }
    }).success, true);

    assert.equal(SessionOpenDataSchema.safeParse({ ...session, token: 'bad' }).success, false);
    assert.equal(ChallengeSnapshotSchema.safeParse({ ...snapshot, extra: true }).success, false);
    assert.equal(ChallengeResultSchema.safeParse({ ...result, revision: -1 }).success, false);
    assert.equal(ProtocolFailureAckSchema.safeParse({
        protocolVersion: 1,
        serverTimeMs: now,
        ok: false,
        requestId,
        error: { code: 'BAD_REQUEST', message: 'Invalid.', retryable: false },
        token
    }).success, false);
});
