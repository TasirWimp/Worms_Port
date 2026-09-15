const assert = require('node:assert/strict');
const test = require('node:test');

const { applyHexMask, createHexMask, loadConfig } = require('../../scripts/normalize-objective-coin-master.js');

test('generic objective coin mask remains a centered flat-top six-sided hexagon', () => {
  const { config } = loadConfig();
  const mask = createHexMask(256, 256, config.guide.vertices_master_pixels);
  assert.equal(mask[128 * 256 + 128], 255);
  assert.equal(mask[0], 0);
  assert.equal(mask[128 * 256 + 19], 0);
  assert.ok(mask[128 * 256 + 20] > 0);
  assert.ok(mask[44 * 256 + 128] > 0);
});

test('generic objective coin mask only reduces alpha and clears fully clipped RGB', () => {
  const image = { width: 2, height: 1, channels: 4, pixels: Buffer.from([1, 2, 3, 255, 4, 5, 6, 200]) };
  const output = applyHexMask(image, Uint8Array.from([255, 0]));
  assert.deepEqual([...output.pixels], [1, 2, 3, 255, 0, 0, 0, 0]);
});
