const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  BUDGETS,
  evaluateBundleMeasurements,
  measureBundle
} = require('../../scripts/check-bundle-budget');

test('bundle measurement follows only the initial static Vite graph', () => {
  const build = fs.mkdtempSync(path.join(os.tmpdir(), 'nimble-knots-bundle-'));
  try {
    write(build, '.vite/manifest.json', JSON.stringify({
      'client/src/script.ts': {
        file: 'assets/entry.js',
        isEntry: true,
        imports: ['_shared.js'],
        dynamicImports: ['client/src/lazy.ts'],
        css: ['assets/app.css']
      },
      '_shared.js': { file: 'assets/shared.js' },
      'client/src/lazy.ts': { file: 'assets/lazy.js', isDynamicEntry: true }
    }));
    write(build, 'assets/entry.js', 'entry');
    write(build, 'assets/shared.js', 'shared');
    write(build, 'assets/app.css', 'style');
    write(build, 'assets/lazy.js', 'x'.repeat(BUDGETS.largestInitialJavascriptRawBytes + 1));

    const report = measureBundle(build);
    assert.equal(report.passed, true);
    assert.deepEqual(report.initialAssets.map((asset) => asset.path), [
      'assets/app.css',
      'assets/entry.js',
      'assets/shared.js'
    ]);
    assert.equal(report.measurements.largestInitialJavascriptRawBytes, 6);
  } finally {
    fs.rmSync(build, { recursive: true, force: true });
  }
});

test('bundle evaluation fails each exact byte ceiling independently', () => {
  assert.deepEqual(evaluateBundleMeasurements({
    largestInitialJavascriptRawBytes: BUDGETS.largestInitialJavascriptRawBytes,
    initialJavascriptAndCssGzipBytes: BUDGETS.initialJavascriptAndCssGzipBytes
  }), []);
  assert.match(evaluateBundleMeasurements({
    largestInitialJavascriptRawBytes: BUDGETS.largestInitialJavascriptRawBytes + 1,
    initialJavascriptAndCssGzipBytes: BUDGETS.initialJavascriptAndCssGzipBytes
  }).join('\n'), /largestInitialJavascriptRawBytes/);
  assert.match(evaluateBundleMeasurements({
    largestInitialJavascriptRawBytes: BUDGETS.largestInitialJavascriptRawBytes,
    initialJavascriptAndCssGzipBytes: BUDGETS.initialJavascriptAndCssGzipBytes + 1
  }).join('\n'), /initialJavascriptAndCssGzipBytes/);
});

function write(root, relative, contents) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}
