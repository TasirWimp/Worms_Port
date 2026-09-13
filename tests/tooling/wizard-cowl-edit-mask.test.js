const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { decodePng } = require('../../scripts/compare-character-silhouettes');
const {
  MASK_CONTRACT,
  createMaskPng
} = require('../../scripts/generate-wizard-cowl-edit-mask');

const repoRoot = path.resolve(__dirname, '..', '..');
const maskPath = path.join(repoRoot, MASK_CONTRACT.sourcePath);

function redAt(image, x, y) {
  return image.pixels[(y * image.width + x) * image.channels];
}

test('Wizard cowl mask regenerates byte-for-byte', () => {
  assert.deepEqual(createMaskPng(), fs.readFileSync(maskPath));
});

test('Wizard cowl mask edits the crown and neck wrap while protecting gameplay anatomy', () => {
  const image = decodePng(maskPath);
  assert.equal(image.width, 1024);
  assert.equal(image.height, 1024);
  assert.equal(image.channels, 4);

  assert.equal(redAt(image, 500, 155), 255, 'crown halo must be editable');
  assert.equal(redAt(image, 270, 330), 255, 'outer hood side must be editable');
  assert.equal(redAt(image, 500, 560), 255, 'neck wrap must be editable');
  assert.equal(redAt(image, 520, 350), 0, 'eyes and face island must be protected');
  assert.equal(redAt(image, 520, 700), 0, 'body must be protected');
  assert.equal(redAt(image, 750, 650), 0, 'forward Relic hand must be protected');
  assert.equal(redAt(image, 500, 900), 0, 'feet and baseline must be protected');
  assert.equal(redAt(image, 20, 20), 0, 'unneeded background must be protected');

  let editablePixels = 0;
  for (let offset = 0; offset < image.pixels.length; offset += image.channels) {
    if (image.pixels[offset] >= 128) editablePixels += 1;
  }
  const editableRatio = editablePixels / (image.width * image.height);
  assert.ok(editableRatio > 0.1 && editableRatio < 0.2, `unexpected editable ratio ${editableRatio}`);
});
