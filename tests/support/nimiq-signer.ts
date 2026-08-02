import { PrivateKey, PublicKey, Signature } from '@nimiq/core';

import { nimiqSignedMessageHash } from '../../server/src/identity/crypto';

export const TEST_PRIVATE_KEY =
  '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
export const TEST_DEVICE_ID = 'ab'.repeat(32);

export function createTestSigner(privateKeyHex = TEST_PRIVATE_KEY) {
  const privateKey = PrivateKey.fromHex(privateKeyHex);
  const publicKey = PublicKey.derive(privateKey);
  const addressObject = publicKey.toAddress();
  const address = addressObject.toUserFriendlyAddress();
  addressObject.free();
  return {
    address,
    sign(message: string) {
      const signature = Signature.create(
        privateKey,
        publicKey,
        nimiqSignedMessageHash(message)
      );
      try {
        return { publicKey: publicKey.toHex(), signature: signature.toHex() };
      } finally {
        signature.free();
      }
    },
    dispose() {
      publicKey.free();
      privateKey.free();
    }
  };
}

export function privateKeyForProject(projectName: string): string {
  const suffixes: Record<string, string> = {
    'chromium-360x640': '20',
    'chromium-390x844': '21',
    'chromium-412x915': '24',
    'chromium-844x390': '22',
    'webkit-390x844': '23'
  };
  return `${TEST_PRIVATE_KEY.slice(0, -2)}${suffixes[projectName] || '25'}`;
}
