const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  alphaComposite,
  composeWizardLoomseed,
  loadConfig,
  writeOutputs
} = require('../../scripts/compose-wizard-loomseed-presentation.js');
const { encodeRgbaPng, sha256 } = require('../../scripts/normalize-character-master.js');

test('Loomseed alpha composition keeps the permanent focus in front of the Wizard palm', () => {
  const background = {
    width: 1,
    height: 1,
    channels: 4,
    pixels: Buffer.from([20, 60, 200, 255])
  };
  const foreground = {
    width: 1,
    height: 1,
    channels: 4,
    pixels: Buffer.from([220, 180, 30, 128])
  };
  const composed = alphaComposite(background, foreground);
  assert.deepEqual([...composed.pixels], [120, 120, 115, 255]);
});

test('frozen B3C configuration binds the two exact masters and blocks synthesis or runtime integration', () => {
  const { config } = loadConfig();
  assert.equal(config.id, 'wp-015b3c-wizard-loomseed-v1');
  assert.equal(config.inputs.wizard.sha256,
    '7AF4864E00C7206A05684312916092C6881127F921FA7CEA01524899093318A9');
  assert.equal(config.inputs.threadball.sha256,
    '608F490CEE2A7FA79F0EA47BF7B15A8E49685B7B1E65E5AE38E15A34B4CD9B6F');
  assert.deepEqual(config.geometry.wizard_palm_anchor, [407, 228]);
  assert.deepEqual(config.geometry.loomseed_center, [407, 228]);
  assert.deepEqual(config.geometry.temporary_cast_emission_origin, [407, 228]);
  assert.deepEqual(config.geometry.layer_order, ['wizard', 'loomseed']);
  assert.ok(config.boundaries.blocked.includes('projectile generation'));
  assert.ok(config.boundaries.blocked.includes('animation'));
  assert.ok(config.boundaries.blocked.includes('runtime integration'));
});

test('Wizard Loomseed composition is byte deterministic and preserves its exact source parents', (context) => {
  const { config, resolved } = loadConfig();
  const wizardBefore = fs.readFileSync(config.inputs.wizard.path);
  const threadballBefore = fs.readFileSync(config.inputs.threadball.path);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wormsport-loomseed-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const first = composeWizardLoomseed(config);
  const second = composeWizardLoomseed(config);
  const firstBytes = encodeRgbaPng(first.master);
  const secondBytes = encodeRgbaPng(second.master);
  assert.deepEqual(firstBytes, secondBytes);
  assert.equal(sha256(firstBytes), config.outputs.expected_sha256.master);
  assert.deepEqual(first.mappedCenter, [407, 228]);
  assert.ok(first.visibleLoomseedPixels > 0);
  assert.ok(first.opaqueWizard.differences > 0,
    'The foreground Loomseed should visibly cover part of the source palm without editing either source file.');

  const firstWritten = writeOutputs(first, config, resolved, path.join(directory, 'first'));
  const secondWritten = writeOutputs(second, config, resolved, path.join(directory, 'second'));
  for (const key of ['master', 'review_192', 'review_48', 'edge_review']) {
    assert.equal(firstWritten.report.outputs[key].sha256, config.outputs.expected_sha256[key]);
    assert.equal(firstWritten.report.outputs[key].sha256, secondWritten.report.outputs[key].sha256);
  }
  assert.deepEqual(fs.readFileSync(config.inputs.wizard.path), wizardBefore);
  assert.deepEqual(fs.readFileSync(config.inputs.threadball.path), threadballBefore);
});
