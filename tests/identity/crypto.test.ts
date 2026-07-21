import assert from 'node:assert/strict';
import test from 'node:test';

import { Hash, PrivateKey, PublicKey, Signature } from '@nimiq/core';

import {
    NIMIQ_SIGNED_MESSAGE_PREFIX,
    nimiqSignedMessageHash,
    normalizeNimiqAddress,
    verifyNimiqSignedMessage
} from '../../server/src/identity/crypto';

const VECTOR = {
    message: 'NIMble Knots identity golden vector',
    address: 'NQ46 KLJE 5TMF 4Y1A 1255 CJHJ YG1S H0NU T604',
    publicKey: '03a107bff3ce10be1d70dd18e74bc09967e4d6309ba50d5f1ddc8664125531b8',
    signature: '82305cdcae199159324cfe2878b7468d57185235c8ab736050228d4c20093b2c' +
        'f3bb5c99bae62f204da8ad01c11b4c3f8a4d9d00a60304d943982a25f0cbb102'
} as const;

test('official Nimiq signed-message golden vector verifies and derives its address', () => {
    assert.deepEqual(
        verifyNimiqSignedMessage(VECTOR.message, VECTOR.publicKey, VECTOR.signature),
        { address: VECTOR.address, publicKeyHex: VECTOR.publicKey }
    );
    assert.equal(
        normalizeNimiqAddress(VECTOR.address.replaceAll(' ', '').toLowerCase()),
        VECTOR.address
    );
});

test('raw-message and Connect Challenge signatures are not identity signatures', () => {
    const privateKey = PrivateKey.fromHex(
        '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'
    );
    const publicKey = PublicKey.derive(privateKey);
    try {
        const raw = Signature.create(
            privateKey,
            publicKey,
            new TextEncoder().encode(VECTOR.message)
        );
        const connectHash = Hash.computeSha256(new TextEncoder().encode(
            `\x19Nimiq Connect Challenge:\n${VECTOR.message.length}${VECTOR.message}`
        ));
        const connect = Signature.create(privateKey, publicKey, connectHash);
        try {
            assert.equal(
                verifyNimiqSignedMessage(VECTOR.message, VECTOR.publicKey, raw.toHex()),
                undefined
            );
            assert.equal(
                verifyNimiqSignedMessage(VECTOR.message, VECTOR.publicKey, connect.toHex()),
                undefined
            );
        } finally {
            connect.free();
            raw.free();
        }
    } finally {
        publicKey.free();
        privateKey.free();
    }
});

test('signed-message framing uses JavaScript character length and rejects malformed proof bytes', () => {
    const message = 'ASCII and 🧵';
    const expected = Hash.computeSha256(new TextEncoder().encode(
        `${NIMIQ_SIGNED_MESSAGE_PREFIX}${message.length}${message}`
    ));
    assert.deepEqual(nimiqSignedMessageHash(message), expected);
    assert.equal(verifyNimiqSignedMessage(VECTOR.message, '00', VECTOR.signature), undefined);
    assert.equal(verifyNimiqSignedMessage(VECTOR.message, VECTOR.publicKey, '00'), undefined);
    assert.throws(() => normalizeNimiqAddress('NQ00 INVALID ADDRESS'));
});
