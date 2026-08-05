const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  composeThreadballCast,
  loadConfig,
  writeApprovedMasters,
  writeOutputs
} = require('../../scripts/compose-threadball-cast-derivatives.js');
const { encodeRgbaPng, sha256 } = require('../../scripts/normalize-character-master.js');

test('frozen B3C cast configuration binds only the approved Threadball source and blocks synthetic effect work', () => {
  const { config } = loadConfig();
  assert.equal(config.id, 'wp-015b3c-threadball-cast-v1');
  assert.equal(config.input.sha256,
    '608F490CEE2A7FA79F0EA47BF7B15A8E49685B7B1E65E5AE38E15A34B4CD9B6F');
  assert.deepEqual(config.wizard_presentation_geometry.palm_anchor_and_emission_origin, [407, 228]);
  assert.deepEqual(config.wizard_presentation_geometry.emission_offset_from_root_pivot, [151, -223]);
  for (const stage of Object.values(config.stages)) assert.deepEqual(stage.visual_origin, [32, 32]);
  for (const blocked of ['new glow pixels', 'new loose-fiber pixels', 'tail generation', 'impact generation', 'animation', 'runtime integration']) {
    assert.ok(config.boundaries.blocked.includes(blocked));
  }
});

test('Threadball cast stages are byte deterministic, centered, and leave the approved master untouched', (context) => {
  const { config, resolved } = loadConfig();
  const sourceBefore = fs.readFileSync(config.input.path);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wormsport-threadball-cast-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const first = composeThreadballCast(config);
  const second = composeThreadballCast(config);
  for (const name of Object.keys(config.stages)) {
    assert.deepEqual(encodeRgbaPng(first.stages[name].image), encodeRgbaPng(second.stages[name].image));
    assert.deepEqual(first.stages[name].mappedOrigin, [32, 32]);
    assert.equal(first.stages[name].metrics.visible_component_count, 1);
    assert.equal(first.stages[name].metrics.disconnected_visible_pixels, 0);
    assert.equal(first.stages[name].metrics.border_alpha_pixels, 0);
  }
  assert.deepEqual(encodeRgbaPng(first.reviewSheet), encodeRgbaPng(second.reviewSheet));

  const firstWritten = writeOutputs(first, config, resolved, path.join(directory, 'first'));
  const secondWritten = writeOutputs(second, config, resolved, path.join(directory, 'second'));
  for (const name of [...Object.keys(config.stages), 'review_sheet']) {
    const firstHash = name === 'review_sheet'
      ? firstWritten.report.review_sheet.sha256
      : firstWritten.report.stages[name].output.sha256;
    const secondHash = name === 'review_sheet'
      ? secondWritten.report.review_sheet.sha256
      : secondWritten.report.stages[name].output.sha256;
    assert.equal(firstHash, config.outputs.expected_sha256[name]);
    assert.equal(firstHash, secondHash);
  }
  const approved = writeApprovedMasters(first, config, path.join(directory, 'approved'));
  for (const name of Object.keys(config.stages)) {
    assert.equal(approved[name].sha256, config.outputs.expected_sha256[name]);
  }
  assert.deepEqual(fs.readFileSync(config.input.path), sourceBefore);
  assert.equal(sha256(sourceBefore), config.input.sha256);
});
