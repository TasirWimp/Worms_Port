const assert = require('node:assert/strict');
const test = require('node:test');

const {
  blendRepeatSeam,
  loadConfig,
  repeatSeamMetrics,
  repeatTwoDimensionally
} = require('../../scripts/normalize-terrain-interior-master.js');

function createOpaqueImage(width, height) {
  const pixels = Buffer.alloc(width * height * 4, 255);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      pixels[offset] = x * 10;
      pixels[offset + 1] = y * 20;
      pixels[offset + 2] = 200 - x * 10;
    }
  }
  return { width, height, channels: 4, pixels };
}

test('Terrain Interior reciprocal blends make both repeat boundaries exact without changing the core', () => {
  const source = createOpaqueImage(12, 12);
  const horizontal = blendRepeatSeam(source, 'horizontal', 3);
  const blended = blendRepeatSeam(horizontal, 'vertical', 3);
  const metrics = repeatSeamMetrics(blended);

  assert.equal(metrics.horizontal.edge_pixels_match_exactly, true);
  assert.equal(metrics.vertical.edge_pixels_match_exactly, true);
  const coreOffset = (4 * source.width + 4) * 4;
  assert.deepEqual(
    [...blended.pixels.subarray(coreOffset, coreOffset + 4)],
    [...source.pixels.subarray(coreOffset, coreOffset + 4)]
  );
});

test('Terrain Interior proof repeats the exact master on a two-dimensional grid', () => {
  const master = createOpaqueImage(4, 3);
  const proof = repeatTwoDimensionally(master, 3, 3);
  assert.deepEqual([proof.width, proof.height], [12, 9]);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      for (let y = 0; y < master.height; y += 1) {
        const actual = proof.pixels.subarray(
          ((row * master.height + y) * proof.width + column * master.width) * 4,
          ((row * master.height + y) * proof.width + (column + 1) * master.width) * 4
        );
        const expected = master.pixels.subarray(y * master.width * 4, (y + 1) * master.width * 4);
        assert.deepEqual([...actual], [...expected]);
      }
    }
  }
});

test('frozen B3C manual Terrain Interior configuration binds only the owner-repaired export', () => {
  const { config } = loadConfig();
  assert.equal(config.id, 'wp-015b3c-patch-terrain-interior-manual-v1');
  assert.equal(config.source.sha256,
    '6419C1E81F13FF75650A13F1FE6654711A7334C9A24EC48F86C4356533CF8095');
  assert.equal(config.source.editable_source.sha256,
    '2E94BBE46A3E901BB8EB14B21F413E8ACCB850D3443FFD72308D63B09DCDBC7B');
  assert.equal(config.source.channels, 4);
  assert.deepEqual(config.geometry.master.canvas, [256, 256]);
  assert.equal(config.geometry.master.horizontal_edge_blend.width_pixels, 32);
  assert.equal(config.geometry.master.vertical_edge_blend.width_pixels, 32);
  assert.deepEqual(config.geometry.source_crop, {
    x: 0, y: 0, width: 1024, height: 1024,
    method: 'fixed complete flattened owner-repaired canvas'
  });
  assert.ok(config.boundaries.blocked.includes('new FLUX or other generative request'));
  assert.ok(config.boundaries.blocked.includes('runtime integration'));
});
