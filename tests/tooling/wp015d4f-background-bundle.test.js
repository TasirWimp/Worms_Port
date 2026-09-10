const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  backgroundBundleTotalBytes,
  expectedBackgroundBundle,
  previewBundleByteCeiling,
  validateWp015d4fBackgroundBundle
} = require('../../scripts/check-wp015d4f-background-bundle');
const { validateB3cRuntimeInventory } = require('../../scripts/check-b3c-runtime-inventory');

const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'legal', 'asset-manifest.json'), 'utf8'));

test('WP-015D4F admits five exact lazy-preview copies without reopening the WP-015C inventory', () => {
  assert.deepEqual(validateWp015d4fBackgroundBundle(manifest), []);
  assert.deepEqual(validateB3cRuntimeInventory(manifest), []);
  assert.equal(expectedBackgroundBundle.length, 5);
  assert.equal(backgroundBundleTotalBytes(), 1835347);
  assert.ok(backgroundBundleTotalBytes() <= previewBundleByteCeiling);
});

test('WP-015D4F rejects a transformed path or non-preview admission', () => {
  const invalid = structuredClone(manifest);
  const asset = invalid.assets.find((candidate) => candidate.id === expectedBackgroundBundle[0].id);
  asset.runtime_path = 'assets/product/environment/backgrounds/volcanic-ruin/atlas.png';
  asset.runtime_copy_admission = 'something else';
  const errors = validateWp015d4fBackgroundBundle(invalid).join('\n');
  assert.match(errors, /runtime_path must remain the approved WP-015D4F value/);
  assert.match(errors, /preview-only exact-copy admission/);
});
