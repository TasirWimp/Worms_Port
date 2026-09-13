const assert = require('node:assert/strict');
const test = require('node:test');

const { discardContactShadowRows, loadConfig } = require('../../scripts/normalize-stone-tower-master.js');

function rgbaImage(width, height) {
  return { width, height, channels: 4, pixels: Buffer.alloc(width * height * 4) };
}

function setRgba(image, x, y, rgba) {
  image.pixels.set(rgba, (y * image.width + x) * 4);
}

test('Stone Tower config binds the reviewed source, non-runtime master, and baseline anchor', () => {
  const { config } = loadConfig();
  assert.equal(config.id, 'wp-015d4e-stone-tower-v1');
  assert.equal(config.source.sha256, '6DDE21C23C9CF96D445DA3119D6EB9D282BE619B6BB2E3597CB699576D58D264');
  assert.deepEqual(config.geometry.master.canvas, [1024, 576]);
  assert.deepEqual(config.geometry.master.placement_anchor, [512, 528]);
  assert.equal(config.matte.contact_shadow.first_discarded_source_y, 712);
  assert.match(config.boundaries.blocked.join(' '), /runtime integration/);
});

test('Stone Tower cleanup removes all alpha only in and below its frozen shadow row', () => {
  const matte = { image: rgbaImage(3, 4) };
  setRgba(matte.image, 1, 1, [90, 90, 90, 255]);
  setRgba(matte.image, 1, 2, [170, 170, 170, 100]);
  setRgba(matte.image, 2, 3, [200, 200, 200, 255]);
  const result = discardContactShadowRows(matte, 2);
  assert.equal(result.removedPixels, 2);
  assert.equal(result.image.pixels[(1 * 3 + 1) * 4 + 3], 255);
  assert.equal(result.image.pixels[(2 * 3 + 1) * 4 + 3], 0);
  assert.equal(result.image.pixels[(3 * 3 + 2) * 4 + 3], 0);
});
