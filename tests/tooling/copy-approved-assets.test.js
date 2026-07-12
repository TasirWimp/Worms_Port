const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { copyApprovedAssets } = require('../../scripts/copy-approved-assets');

test('copies only explicitly approved runtime assets with byte equality', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nimble-knots-assets-'));
  const assetRoot = path.join(fixtureRoot, 'assets');
  const buildRoot = path.join(fixtureRoot, 'build');
  const source = path.join(assetRoot, 'ui', 'fixture.txt');
  const ignored = path.join(assetRoot, 'ui', 'not-runtime.txt');
  const manifest = path.join(fixtureRoot, 'manifest.json');

  try {
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, 'approved runtime fixture\n');
    fs.writeFileSync(ignored, 'must not be copied\n');
    fs.writeFileSync(manifest, JSON.stringify({
      assets: [
        {
          id: 'fixture',
          file: 'assets/ui/fixture.txt',
          sha256: crypto.createHash('sha256').update('approved runtime fixture\n').digest('hex').toUpperCase(),
          runtime_path: 'assets/product/ui/fixture.txt',
          decision: 'approved'
        }
      ]
    }));

    const copied = copyApprovedAssets({ manifest, assetRoot, buildRoot });
    const destination = path.join(buildRoot, 'assets', 'product', 'ui', 'fixture.txt');

    assert.equal(copied.length, 1);
    assert.deepEqual(fs.readFileSync(destination), fs.readFileSync(source));
    assert.equal(fs.existsSync(path.join(buildRoot, 'assets', 'product', 'ui', 'not-runtime.txt')), false);
    fs.writeFileSync(source, 'tampered runtime fixture\n');
    assert.throws(
      () => copyApprovedAssets({ manifest, assetRoot, buildRoot }),
      /does not match the approved manifest hash/
    );
    assert.equal(fs.readFileSync(destination, 'utf8'), 'approved runtime fixture\n');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
