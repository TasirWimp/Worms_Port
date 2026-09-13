const assert = require('node:assert/strict');
const test = require('node:test');

const {
  blendHorizontalRepeatSeam,
  horizontalSeamMetrics,
  loadConfig,
  repeatHorizontally
} = require('../../scripts/normalize-terrain-top-master.js');

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

test('Terrain Top reciprocal blend makes the horizontal repeat edge exact without changing the interior', () => {
  const source = createOpaqueImage(12, 3);
  const blended = blendHorizontalRepeatSeam(source, 3);
  const metrics = horizontalSeamMetrics(blended);

  assert.equal(metrics.edge_pixels_match_exactly, true);
  assert.equal(metrics.edge_maximum_absolute_difference, 0);
  for (let y = 0; y < source.height; y += 1) {
    const interiorOffset = (y * source.width + 3) * 4;
    assert.deepEqual(
      [...blended.pixels.subarray(interiorOffset, interiorOffset + 4)],
      [...source.pixels.subarray(interiorOffset, interiorOffset + 4)]
    );
  }
});

test('Terrain Top repeat proof copies the exact master side by side', () => {
  const master = createOpaqueImage(4, 2);
  const proof = repeatHorizontally(master, 3);
  assert.deepEqual([proof.width, proof.height], [12, 2]);
  for (let y = 0; y < master.height; y += 1) {
    for (let column = 0; column < 3; column += 1) {
      const actual = proof.pixels.subarray((y * proof.width + column * master.width) * 4,
        (y * proof.width + (column + 1) * master.width) * 4);
      const expected = master.pixels.subarray(y * master.width * 4, (y + 1) * master.width * 4);
      assert.deepEqual([...actual], [...expected]);
    }
  }
});

test('frozen B3A Terrain Top configuration binds the accepted source and blocks generation or integration', () => {
  const { config } = loadConfig();
  assert.equal(config.id, 'wp-015b3a-patch-terrain-top-v1');
  assert.equal(config.source.sha256,
    'BE5EB2E77062C9A86327ECC1EB7704C33F8511291709AE18A52D1AF51BE42B22');
  assert.deepEqual(config.geometry.source_crop, {
    x: 0, y: 392, width: 1024, height: 256,
    method: 'fixed full-width crop inside the reviewed uninterrupted material band; it removes only the white matte and partial transition rows above and below the 1024x281 visible source band'
  });
  assert.deepEqual(config.geometry.master.canvas, [256, 64]);
  assert.equal(config.geometry.master.horizontal_edge_blend.width_pixels, 16);
  assert.equal(config.geometry.review.repeat_columns, 3);
  assert.ok(config.boundaries.blocked.includes('inference'));
  assert.ok(config.boundaries.blocked.includes('Terrain Interior generation'));
  assert.ok(config.boundaries.blocked.includes('runtime integration'));
  assert.match(config.outputs.approved_master_path, /^assets\/masters\/environment\/patch-01\/terrain\//);
});
