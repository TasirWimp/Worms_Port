const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { copyApprovedAssets } = require('../../scripts/copy-approved-assets');
const {
  expectedRuntimeInventory,
  initialMediaByteCeiling,
  inventoryTotalBytes,
  validateB3cRuntimeInventory
} = require('../../scripts/check-b3c-runtime-inventory');

const repoRoot = path.resolve(__dirname, '..', '..');
const manifestPath = path.join(repoRoot, 'legal', 'asset-manifest.json');
const assetRoot = path.join(repoRoot, 'assets');

test('B3C.1 closes the runtime inventory to seven exact source masters below budget', () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.deepEqual(validateB3cRuntimeInventory(manifest), []);
  assert.equal(expectedRuntimeInventory.length, 7);
  assert.equal(inventoryTotalBytes(), 607427);
  assert.ok(inventoryTotalBytes() <= initialMediaByteCeiling);

  const invalid = structuredClone(manifest);
  invalid.assets.find((asset) => asset.id === expectedRuntimeInventory[0].id)
    .runtime_path = 'assets/product/characters/unexpected.png';
  assert.match(
    validateB3cRuntimeInventory(invalid).join('\n'),
    /runtime_path must remain the frozen B3C\.1 value/
  );

  invalid.assets.find((asset) => asset.id === expectedRuntimeInventory[0].id)
    .runtime_path = undefined;
  assert.match(
    validateB3cRuntimeInventory(invalid).join('\n'),
    /required B3C\.1 runtime asset is missing/
  );
});

test('B3C.1 build copies exactly the closed runtime inventory', () => {
  const buildRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nimble-knots-b3c-runtime-'));
  try {
    const copied = copyApprovedAssets({ manifest: manifestPath, assetRoot, buildRoot });
    assert.deepEqual(copied.map((asset) => ({
      id: asset.id,
      source: asset.source,
      runtime_path: asset.runtime_path,
      sha256: asset.sha256.toUpperCase()
    })), expectedRuntimeInventory.map((asset) => ({
      id: asset.id,
      source: asset.file,
      runtime_path: `/${asset.runtime_path}`,
      sha256: asset.sha256
    })));

    const approvedAssets = JSON.parse(fs.readFileSync(
      path.join(buildRoot, 'assets', 'approved-assets.json'),
      'utf8'
    ));
    assert.deepEqual(approvedAssets.assets, copied);
    for (const asset of expectedRuntimeInventory) {
      const source = path.join(assetRoot, asset.file.slice('assets/'.length));
      const copiedPath = path.join(buildRoot, asset.runtime_path);
      assert.deepEqual(fs.readFileSync(copiedPath), fs.readFileSync(source));
    }
  } finally {
    fs.rmSync(buildRoot, { recursive: true, force: true });
  }
});
