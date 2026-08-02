const assert = require('node:assert/strict');
const test = require('node:test');

const {
  productionBuildEnvironment
} = require('../../scripts/build-and-start-test-server');

test('browser harness builds production output while preserving other test authority', () => {
  const source = { NODE_ENV: 'test', WP014_QUALITY_TEST: 'true', SAMPLE: 'kept' };
  const result = productionBuildEnvironment(source);
  assert.equal(result.NODE_ENV, 'production');
  assert.equal(result.WP014_QUALITY_TEST, 'true');
  assert.equal(result.SAMPLE, 'kept');
  assert.equal(source.NODE_ENV, 'test');
});
