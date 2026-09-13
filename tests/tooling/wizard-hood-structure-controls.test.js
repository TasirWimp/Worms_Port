const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { decodePng } = require('../../scripts/compare-character-silhouettes');
const {
  CONTROL_CONTRACT,
  createGuidePng,
  createMaskPng,
  createScaffoldPng
} = require('../../scripts/generate-wizard-hood-structure-controls');

const repoRoot = path.resolve(__dirname, '..', '..');
const guidePath = path.join(repoRoot, CONTROL_CONTRACT.guidePath);
const maskPath = path.join(repoRoot, CONTROL_CONTRACT.maskPath);

function redAt(image, x, y) {
  return image.pixels[(y * image.width + x) * image.channels];
}

test('Wizard hood controls regenerate byte-for-byte', () => {
  assert.deepEqual(createGuidePng(), fs.readFileSync(guidePath));
  assert.deepEqual(createMaskPng(), fs.readFileSync(maskPath));
});

test('Wizard hood mask permits a tall crown and open neck while protecting accepted anatomy', () => {
  const image = decodePng(maskPath);
  assert.equal(image.width, 1024);
  assert.equal(image.height, 1024);
  assert.equal(image.channels, 4);

  assert.equal(redAt(image, 330, 44), 255, 'folded crown tip must be editable');
  assert.equal(redAt(image, 520, 150), 255, 'hood crown must be editable');
  assert.equal(redAt(image, 270, 430), 255, 'hood side must be editable');
  assert.equal(redAt(image, 520, 535), 255, 'old neck wrap must be removable');
  assert.equal(redAt(image, 520, 350), 0, 'eyes and upper face must be protected');
  assert.equal(redAt(image, 550, 445), 0, 'accepted mouth must be protected');
  assert.equal(redAt(image, 520, 700), 0, 'body must be protected');
  assert.equal(redAt(image, 750, 650), 0, 'forward Relic hand must be protected');
  assert.equal(redAt(image, 500, 900), 0, 'feet and baseline must be protected');
  assert.equal(redAt(image, 20, 20), 0, 'unneeded background must be protected');

  let editablePixels = 0;
  for (let offset = 0; offset < image.pixels.length; offset += image.channels) {
    if (image.pixels[offset] >= 128) editablePixels += 1;
  }
  const editableRatio = editablePixels / (image.width * image.height);
  assert.ok(editableRatio > 0.18 && editableRatio < 0.25, `unexpected editable ratio ${editableRatio}`);
});

test('Wizard hood guide reads as a pointed hood with a split mantle', () => {
  const image = decodePng(guidePath);
  assert.equal(image.width, 1024);
  assert.equal(image.height, 1024);
  assert.equal(image.channels, 4);

  assert.ok(redAt(image, 350, 60) < 100, 'crown tip must remain dark indigo');
  assert.ok(redAt(image, 330, 530) < 100, 'left mantle must remain dark indigo');
  assert.ok(redAt(image, 690, 520) < 100, 'right mantle must remain dark indigo');
  assert.ok(redAt(image, 520, 530) > 180, 'center neck must remain visibly open');
  assert.ok(redAt(image, 370, 580) > 150, 'mantle edge must retain a warm accent');
});

test('Wizard hood scaffold rejects any base other than the exact reviewed B2D bytes', () => {
  assert.throws(
    () => createScaffoldPng(guidePath),
    /Expected exact B2D base/
  );
});
