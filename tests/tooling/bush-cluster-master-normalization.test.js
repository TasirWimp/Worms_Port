const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const configPath = path.join(root, 'scripts', 'asset-normalization', 'wp-015d4e-bush-cluster-v1.json');
const masterPath = path.join(root, 'assets', 'masters', 'environment', 'backgrounds', 'volcanic-ruin', 'bush-cluster-source-master-v1.png');
const {normalizeBushCluster} = require(path.join(root, 'scripts', 'normalize-bush-cluster-master.js'));
const {encodeRgbaPng, sha256} = require(path.join(root, 'scripts', 'normalize-character-master.js'));

test('bush cluster source master integrity is portable and bound regeneration fails closed', () => {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const actual = fs.readFileSync(masterPath);
  assert.equal(crypto.createHash('sha256').update(actual).digest('hex').toUpperCase(),
    'D5EEE8F1A0B7A9B758321F5B429B0D2B9EAC5F7726A2031195628F0103AB69E2');
  if (!fs.existsSync(config.source.default_external_path)) {
    assert.throws(
      () => normalizeBushCluster(config.source.default_external_path, config),
      /ENOENT/
    );
    return;
  }

  const result = normalizeBushCluster(config.source.default_external_path, config);
  const regenerated = encodeRgbaPng(result.master);
  assert.equal(sha256(regenerated), 'D5EEE8F1A0B7A9B758321F5B429B0D2B9EAC5F7726A2031195628F0103AB69E2');
  assert.deepEqual(result.anchor, [511.99999999999994, 528]);
  assert.equal(result.metrics.border_alpha_pixels, 0);
  assert.equal(result.metrics.visible_component_count, 1);
  assert.equal(result.metrics.disconnected_visible_pixels, 0);
});
