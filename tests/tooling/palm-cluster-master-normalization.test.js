const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const configPath = path.join(root, 'scripts', 'asset-normalization', 'wp-015d4e-palm-cluster-v1.json');
const masterPath = path.join(root, 'assets', 'masters', 'environment', 'backgrounds', 'volcanic-ruin', 'palm-cluster-source-master-v1.png');
const {norm} = require(path.join(root, 'scripts', 'normalize-palm-cluster-master.js'));
const {encodeRgbaPng, sha256} = require(path.join(root, 'scripts', 'normalize-character-master.js'));

test('palm cluster source master is a deterministic, isolated transparent normalization', () => {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const result = norm(config.source.default_external_path, config);
  const regenerated = encodeRgbaPng(result.out);
  const actual = fs.readFileSync(masterPath);

  assert.equal(sha256(regenerated), 'A9D0C91D5CFD6647654A89A0F1B81110D7FC4C4B3A5ABE395C0FB5B2D8E4E380');
  assert.equal(crypto.createHash('sha256').update(actual).digest('hex').toUpperCase(),
    'A9D0C91D5CFD6647654A89A0F1B81110D7FC4C4B3A5ABE395C0FB5B2D8E4E380');
  assert.deepEqual(config.geometry.master.placement_anchor, [512, 528]);
  assert.equal(result.a.border_alpha_pixels, 0);
  assert.equal(result.a.visible_component_count, 1);
  assert.equal(result.a.disconnected_visible_pixels, 0);
});
