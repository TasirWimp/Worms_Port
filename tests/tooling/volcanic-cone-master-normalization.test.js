const assert = require('node:assert/strict');
const test = require('node:test');

const {
  discardBelowHardSubjectExtent,
  discardNeutralContactShadow,
  loadConfig
} = require('../../scripts/normalize-volcanic-cone-master.js');

function rgbaImage(width, height) {
  return { width, height, channels: 4, pixels: Buffer.alloc(width * height * 4) };
}

function rgbImage(width, height) {
  return { width, height, channels: 3, pixels: Buffer.alloc(width * height * 3, 255) };
}

function setRgba(image, x, y, rgba) {
  image.pixels.set(rgba, (y * image.width + x) * 4);
}

function setRgb(image, x, y, rgb) {
  image.pixels.set(rgb, (y * image.width + x) * 3);
}

test('Volcanic Cone config binds the reviewed source, non-runtime master, and baseline anchor', () => {
  const { config } = loadConfig();
  assert.equal(config.id, 'wp-015d4e-volcanic-cone-v1');
  assert.equal(config.source.sha256, '4B34F5EEB08C831164BE403204723E73FB95B10E8C7AA8CD5013C4E5974E329C');
  assert.deepEqual(config.geometry.master.canvas, [1024, 576]);
  assert.deepEqual(config.geometry.master.placement_anchor, [512, 528]);
  assert.equal(config.matte.neutral_contact_shadow.operation, 'discard_alpha_only');
  assert.match(config.boundaries.blocked.join(' '), /runtime integration/);
});

test('Volcanic Cone cleanup removes only below-extent and neutral contact-shadow alpha', () => {
  const matte = {
    image: rgbaImage(4, 4),
    hard: { bounds: { maxY: 2 } }
  };
  const source = rgbImage(4, 4);
  setRgba(matte.image, 1, 2, [30, 80, 150, 255]);
  setRgba(matte.image, 1, 3, [240, 240, 244, 80]);
  setRgba(matte.image, 2, 2, [232, 234, 239, 255]);
  setRgba(matte.image, 3, 2, [50, 100, 160, 255]);
  setRgb(source, 1, 2, [30, 80, 150]);
  setRgb(source, 2, 2, [232, 234, 239]);
  setRgb(source, 3, 2, [50, 100, 160]);

  const below = discardBelowHardSubjectExtent(matte);
  assert.equal(below.removedPixels, 1);
  assert.equal(below.image.pixels[(3 * 4 + 1) * 4 + 3], 0);

  const shadow = discardNeutralContactShadow(below, source, {
    min_source_y: 2,
    min_rgb_channel: 170,
    max_rgb_channel_spread: 25
  });
  assert.equal(shadow.removedPixels, 1);
  assert.equal(shadow.image.pixels[(2 * 4 + 2) * 4 + 3], 0);
  assert.equal(shadow.image.pixels[(2 * 4 + 3) * 4 + 3], 255,
    'saturated yarn remains visible even in the reviewed bottom band');
});
