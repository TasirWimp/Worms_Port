import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../../shared/simulation';

import {
    ChallengeCreateRequestSchema,
    ChallengeLeaveRequestSchema,
    ChallengeResultSchema,
    ChallengeSnapshotSchema,
    CommandSubmitRequestSchema,
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
    assert.equal(SessionOpenRequestSchema.safeParse({
        requestId,
        action: 'authorize',
        proof: {
            address: 'NQ00 TEST ADDRESS',
            challenge: 'challenge_nonce_01',
            signature: 'a'.repeat(64)
        }
    }).success, true);
    assert.match(token, SESSION_TOKEN_PATTERN);

    for (const invalid of [
        { requestId: 'a'.repeat(7), action: 'create' },
        { requestId: 'a'.repeat(65), action: 'create' },
        { requestId, action: 'create', extra: true },
        { requestId, action: 'resume', token: 'short' },
        { requestId, action: 'resume', token, extra: true },
        {
            requestId,
            action: 'authorize',
            proof: { address: 'bad!', challenge: 'short', signature: 'short' }
        },
        null,
        []
    ]) {
        assert.equal(SessionOpenRequestSchema.safeParse(invalid).success, false);
    }
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
        eligibility: { token: 'eligibility_token_01' }
    }).success, true);

    for (const invalid of [
        { requestId, sequence: -1, mode: 'practice', calling: 'wizard' },
        { requestId, sequence: 0x100000000, mode: 'practice', calling: 'wizard' },
        { requestId, sequence: 0, mode: 'practice', calling: 'bard' },
        { requestId, sequence: 0, mode: 'practice', calling: 'wizard', eligibility: { token: 'eligibility_token_01' } },
        { requestId, sequence: 0, mode: 'reward', calling: 'thief' },
        { requestId, sequence: 0, mode: 'reward', calling: 'thief', eligibility: { token: 'too-short' } }
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
