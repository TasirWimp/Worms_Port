import { Address, Hash, PublicKey, Signature } from '@nimiq/core';

export const NIMIQ_SIGNED_MESSAGE_PREFIX = '\x16Nimiq Signed Message:\n';
export const NIMIQ_PUBLIC_KEY_HEX_PATTERN = /^[0-9a-fA-F]{64}$/;
export const NIMIQ_SIGNATURE_HEX_PATTERN = /^[0-9a-fA-F]{128}$/;

export type VerifiedNimiqProof = {
    address: string;
    publicKeyHex: string;
};

export function normalizeNimiqAddress(value: string): string {
    if (value.length > 64 || !/^[\x20-\x7E]+$/.test(value)) {
        throw new Error('Invalid Nimiq address.');
    }
    const address = Address.fromAny(value.toUpperCase());
    try {
        return address.toUserFriendlyAddress();
    } finally {
        address.free();
    }
}

export function nimiqSignedMessageHash(message: string): Uint8Array {
    const framed = `${NIMIQ_SIGNED_MESSAGE_PREFIX}${message.length}${message}`;
    return Hash.computeSha256(new TextEncoder().encode(framed));
}

export function verifyNimiqSignedMessage(
    message: string,
    publicKeyHex: string,
    signatureHex: string
): VerifiedNimiqProof | undefined {
    if (!NIMIQ_PUBLIC_KEY_HEX_PATTERN.test(publicKeyHex) ||
        !NIMIQ_SIGNATURE_HEX_PATTERN.test(signatureHex)) {
        return undefined;
    }

    let publicKey: PublicKey | undefined;
    let signature: Signature | undefined;
    let address: Address | undefined;
    try {
        publicKey = PublicKey.fromHex(publicKeyHex);
        signature = Signature.fromHex(signatureHex);
        if (!publicKey.verify(signature, nimiqSignedMessageHash(message))) {
            return undefined;
        }
        address = publicKey.toAddress();
        return {
            address: address.toUserFriendlyAddress(),
            publicKeyHex: publicKey.toHex().toLowerCase()
        };
    } catch {
        return undefined;
    } finally {
        address?.free();
        signature?.free();
        publicKey?.free();
    }
}
