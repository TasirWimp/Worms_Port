const assert = require('node:assert/strict');
const test = require('node:test');

const { createRelicMatteRgba, loadConfig } = require('../../scripts/normalize-relic-master');

function createImage(width, height) {
  return {
    width,
    height,
    channels: 3,
    pixels: Buffer.alloc(width * height * 3, 255)
  };
}

function setRgb(image, x, y, rgb) {
  const offset = (y * image.width + x) * image.channels;
  image.pixels[offset] = rgb[0];
  image.pixels[offset + 1] = rgb[1];
  image.pixels[offset + 2] = rgb[2];
}

function alphaAt(image, x, y) {
  return image.pixels[(y * image.width + x) * 4 + 3];
}

test('Threadball matte preserves open gaps between connected world-thread strands', () => {
  const image = createImage(9, 9);
  for (const [x, y] of [
    [3, 2], [4, 2], [5, 2], [2, 3], [6, 3], [2, 4], [6, 4],
    [2, 5], [6, 5], [3, 6], [4, 6], [5, 6], [4, 3]
  ]) {
    setRgb(image, x, y, [83, 166, 235]);
  }
  setRgb(image, 4, 4, [235, 166, 33]);

  const result = createRelicMatteRgba(image, {
    background_rgb: [255, 255, 255],
    hard_foreground_threshold: 8,
    soft_edge_low_threshold: 3,
    soft_edge_high_threshold: 16,
    soft_edge_radius_pixels: 1,
    component_connectivity: 8,
    enclosed_holes: 'preserve_background'
  });
  assert.equal(result.hard.componentCount, 1);
  assert.equal(alphaAt(result.image, 4, 4), 255, 'gold core must remain opaque');
  assert.equal(alphaAt(result.image, 3, 3), 0, 'open strand gap must remain transparent');
  assert.equal(result.enclosedPixels, 0);
});

test('frozen B3A configuration binds the exact Threadball and blocks repair or integration', () => {
  const { config } = loadConfig();
  assert.equal(config.id, 'wp-015b3a-threadball-v1');
  assert.equal(config.source.sha256,
    '1F41AF26B9F15419BFB5A59E2485B70EC706AB505672EC57AC8C9295B43F56EC');
  assert.equal(config.matte.enclosed_holes, 'preserve_background');
  assert.deepEqual(config.geometry.master.projectile_origin, [128, 128]);
  assert.deepEqual(config.geometry.review_sizes, [48, 36, 28]);
  assert.ok(config.boundaries.blocked.includes('inference'));
  assert.ok(config.boundaries.blocked.includes('enclosed-hole filling'));
  assert.ok(config.boundaries.blocked.includes('runtime integration'));
  assert.match(config.outputs.approved_master_path, /^assets\/masters\/relics\/threadball\//);
});
