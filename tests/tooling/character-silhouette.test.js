const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
  compareImages,
  getBounds,
  intersectionOverUnion,
  normalizeMask
} = require('../../scripts/compare-character-silhouettes');

test('silhouette comparator reads the tracked RGBA guide deterministically', () => {
  const guide = path.resolve(
    __dirname,
    '..',
    '..',
    'docs',
    'images',
    'art-direction',
    'knotkin-wizard-structure-guide.png'
  );
  const result = compareImages(guide, guide);
  assert.equal(result.normalized_iou, 1);
  assert.equal(result.canvas_iou, 1);
  assert.equal(result.baseline_drift_pixels, 0);
  assert.equal(result.numeric_gate_pass, true);
});

test('silhouette normalization separates shape overlap from canvas placement', () => {
  const left = Uint8Array.from([
    0, 0, 0, 0,
    0, 1, 1, 0,
    0, 1, 1, 0,
    0, 0, 0, 0
  ]);
  const shifted = Uint8Array.from([
    0, 0, 0, 0,
    0, 0, 1, 1,
    0, 0, 1, 1,
    0, 0, 0, 0
  ]);
  const leftBounds = getBounds(left, 4, 4);
  const shiftedBounds = getBounds(shifted, 4, 4);
  const normalizedLeft = normalizeMask(left, 4, leftBounds, 8);
  const normalizedShifted = normalizeMask(shifted, 4, shiftedBounds, 8);

  assert.equal(intersectionOverUnion(left, shifted), 1 / 3);
  assert.equal(intersectionOverUnion(normalizedLeft, normalizedShifted), 1);
});
