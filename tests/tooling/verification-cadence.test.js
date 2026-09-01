const assert = require('node:assert/strict');
const test = require('node:test');

const { scripts } = require('../../package.json');

test('feature verification stays quick, built, and browser-visible', () => {
  assert.equal(
    scripts['verify:feature'],
    'npm run verify:fast && npm run build:outputs && npm run smoke:built && npm run test:browser:focused'
  );
  assert.equal(
    scripts['build:outputs'],
    'npm run build-server && npm run build-client && node scripts/build-proof.js --write'
  );
  assert.doesNotMatch(scripts['verify:feature'], /browser:matrix|browser:performance|verify:full|npm audit/);
});

test('daily verification remains the unchanged complete gate', () => {
  assert.equal(scripts['verify:daily'], 'npm run verify:full');
  assert.match(scripts['verify:full'], /verify:fast/);
  assert.match(scripts['verify:full'], /verify:runtime/);
  assert.match(scripts['verify:full'], /verify:quality/);
  assert.match(scripts['verify:full'], /npm audit/);
});
