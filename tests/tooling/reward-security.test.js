const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { scanRewardSecurity } = require('../../scripts/check-reward-security');

const TEST_KEY = [
  '000102030405060708090a0b0c0d0e0f',
  '101112131415161718191a1b1c1d1e1f'
].join('');

test('reward security scan permits one test helper and rejects source, bundle, and artifact leaks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nimble-knots-reward-security-'));
  try {
    write(root, 'tests/support/nimiq-signer.ts', `export const TEST_PRIVATE_KEY='${TEST_KEY}';`);
    write(root, 'client/build/app.js', 'Nimiq provider was not injected');
    write(root, 'server/build/server.js', 'require("@nimiq/core")');
    assert.deepEqual(scanRewardSecurity(root), []);

    write(root, 'client/src/leak.ts', `const privateKey='${TEST_KEY}';`);
    assert.match(scanRewardSecurity(root).join('\n'), /escaped its test-only helper/);
    fs.rmSync(path.join(root, 'client', 'src'), { recursive: true, force: true });

    write(root, 'client/build/app.js', 'require("@nimiq/core")');
    assert.match(scanRewardSecurity(root).join('\n'), /forbidden payout or server-only marker/);
    write(root, 'client/build/app.js', 'clean client bundle');

    write(
      root,
      'test-results/result.json',
      `{"nimble-knots.session-token":"${'t'.repeat(43)}"}`
    );
    assert.match(scanRewardSecurity(root).join('\n'), /session token entered/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}
