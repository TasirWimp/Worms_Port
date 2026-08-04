const assert = require('node:assert/strict');
const test = require('node:test');

const { createCloudMatteRgba, loadConfig } = require('../../scripts/normalize-cloud-master.js');

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

function rgbaAt(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return [...image.pixels.subarray(offset, offset + 4)];
}

test('Cloud matte retains an enclosed dark stitch instead of turning it into a transparent pinhole', () => {
  const image = createImage(9, 9);
  const yarn = [224, 210, 180];
  for (let x = 2; x <= 6; x += 1) {
    setRgb(image, x, 2, yarn);
    setRgb(image, x, 6, yarn);
  }
  for (let y = 3; y <= 5; y += 1) {
    setRgb(image, 2, y, yarn);
    setRgb(image, 6, y, yarn);
  }
  setRgb(image, 4, 4, [84, 70, 50]);
  setRgb(image, 0, 0, [84, 70, 50]);

  const result = createCloudMatteRgba(image, {
    background_rgb: [255, 255, 255],
    hard_foreground_threshold: 20,
    soft_edge_low_threshold: 3,
    soft_edge_high_threshold: 16,
    soft_edge_radius_pixels: 1,
    component_connectivity: 8
  });

  assert.equal(result.hard.componentCount, 3);
  assert.deepEqual(rgbaAt(result.image, 4, 4), [84, 70, 50, 255]);
  assert.equal(rgbaAt(result.image, 3, 3)[3], 255, 'enclosed white matte remains opaque');
  assert.equal(rgbaAt(result.image, 0, 0)[3], 0, 'detached background noise remains transparent');
  assert.ok(result.enclosedPixels > 0);
});

test('frozen B3A Cloud configuration binds the exact source and blocks generation or integration', () => {
  const { config } = loadConfig();
  assert.equal(config.id, 'wp-015b3a-patch-cloud-v1');
  assert.equal(config.source.sha256,
    'EA972B0B884AE5D144C74AE01E490E9C8961A42619172060C11F53925D48FFE7');
  assert.equal(config.matte.enclosed_holes, 'fill_enclosed_white_matte_only');
  assert.deepEqual(config.geometry.master.placement_anchor, [256, 256]);
  assert.deepEqual(config.geometry.review_sizes, [192, 48]);
  assert.ok(config.boundaries.blocked.includes('inference'));
  assert.ok(config.boundaries.blocked.includes('Terrain Top generation'));
  assert.ok(config.boundaries.blocked.includes('runtime integration'));
  assert.match(config.outputs.approved_master_path, /^assets\/masters\/environment\/patch-01\/clouds\//);
});
