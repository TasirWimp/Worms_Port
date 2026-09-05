const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  verifyBuildProof,
  writeBuildProof
} = require('../../scripts/build-proof');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nimble-knots-build-proof-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'entry.ts'), 'export const value = 1;\n');
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}\n');
  fs.writeFileSync(path.join(root, 'dist', 'bundle.js'), 'const value=1;\n');
  return {
    root,
    options: {
      inputPaths: ['package-lock.json', 'src'],
      outputPaths: ['dist'],
      proofPath: 'dist/.browser-build-proof.json',
      nodeVersion: 'v20-test'
    }
  };
}

test('verified browser build proof accepts unchanged declared inputs and exact outputs', (t) => {
  const { root, options } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeBuildProof(root, options);
  assert.deepEqual(verifyBuildProof(root, options).valid, true);
});

test('verified browser build proof rejects a source or lockfile change', (t) => {
  const { root, options } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeBuildProof(root, options);
  fs.writeFileSync(path.join(root, 'src', 'entry.ts'), 'export const value = 2;\n');
  assert.deepEqual(verifyBuildProof(root, options), {
    valid: false,
    reason: 'declared build inputs changed'
  });
});

test('verified browser build proof rejects modified build output', (t) => {
  const { root, options } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeBuildProof(root, options);
  fs.writeFileSync(path.join(root, 'dist', 'bundle.js'), 'const value=3;\n');
  assert.deepEqual(verifyBuildProof(root, options), {
    valid: false,
    reason: 'built output changed'
  });
});

test('verified browser build proof treats malformed proof data as a cache miss', (t) => {
  const { root, options } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, options.proofPath), 'null\n');
  assert.deepEqual(verifyBuildProof(root, options), {
    valid: false,
    reason: 'proof schema is unsupported'
  });
});
