const assert = require('node:assert/strict');
const test = require('node:test');

const { SIZE, VERTICES, pointInPolygon, createGuide } = require('../../scripts/generate-objective-coin-guide.js');

test('generic objective coin guide is an original flat-top hexagon with no alpha cutout', () => {
  const image = createGuide();
  assert.equal(SIZE, 1024);
  assert.equal(VERTICES.length, 6);
  assert.deepEqual(VERTICES.map(([, y]) => y), [176, 176, 512, 848, 848, 512]);
  assert.equal(pointInPolygon(512, 512), true);
  assert.equal(pointInPolygon(20, 20), false);
  assert.equal(image.channels, 4);
  assert.equal(image.pixels[(512 * SIZE + 512) * 4 + 3], 255);
});
