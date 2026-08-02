const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const DEFAULT_BUILD_DIRECTORY = path.join(root, 'client', 'build');
const DEFAULT_OUTPUT = path.join(root, 'test-results', 'wp014-bundle.json');

const BUDGETS = Object.freeze({
  largestInitialJavascriptRawBytes: 1_500_000,
  initialJavascriptAndCssGzipBytes: 430_000
});

function collectInitialAssetNames(manifest) {
  const entries = Object.entries(manifest).filter(([, chunk]) => chunk.isEntry === true);
  if (entries.length !== 1) {
    throw new Error(`Expected exactly one Vite client entry, found ${entries.length}.`);
  }

  const assets = new Set();
  const visited = new Set();
  const visit = (key) => {
    if (visited.has(key)) return;
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Vite manifest references missing static import: ${key}`);
    visited.add(key);
    if (typeof chunk.file === 'string' && chunk.file.endsWith('.js')) assets.add(chunk.file);
    for (const css of chunk.css || []) assets.add(css);
    for (const imported of chunk.imports || []) visit(imported);
  };
  visit(entries[0][0]);
  return [...assets].sort();
}

function measureBundle(buildDirectory = DEFAULT_BUILD_DIRECTORY) {
  const manifestPath = path.join(buildDirectory, '.vite', 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Bundle budget inspection requires a fresh production build with a Vite manifest.');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const names = collectInitialAssetNames(manifest);
  const assets = names.map((name) => {
    const absolute = path.resolve(buildDirectory, name);
    const relative = path.relative(path.resolve(buildDirectory), absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Vite manifest asset escapes the client build: ${name}`);
    }
    const bytes = fs.readFileSync(absolute);
    return {
      path: name.replaceAll('\\', '/'),
      type: name.endsWith('.js') ? 'javascript' : 'css',
      rawBytes: bytes.length,
      gzipBytes: zlib.gzipSync(bytes, { level: 9 }).length
    };
  });
  const javascript = assets.filter((asset) => asset.type === 'javascript');
  if (javascript.length === 0) throw new Error('The initial Vite graph contains no JavaScript.');

  const measurements = {
    largestInitialJavascriptRawBytes: Math.max(...javascript.map((asset) => asset.rawBytes)),
    initialJavascriptAndCssGzipBytes: assets.reduce((sum, asset) => sum + asset.gzipBytes, 0)
  };
  const violations = evaluateBundleMeasurements(measurements);
  return {
    schemaVersion: 1,
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch
    },
    budgets: BUDGETS,
    measurements,
    initialAssets: assets,
    passed: violations.length === 0,
    violations
  };
}

function evaluateBundleMeasurements(measurements, budgets = BUDGETS) {
  const violations = [];
  for (const [measure, budget] of Object.entries(budgets)) {
    const actual = measurements[measure];
    if (!Number.isFinite(actual)) violations.push(`${measure} was not measured.`);
    else if (actual > budget) violations.push(`${measure} ${actual} exceeded ${budget} bytes.`);
  }
  return violations;
}

function writeReport(report, outputPath = DEFAULT_OUTPUT) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function main() {
  let report;
  try {
    report = measureBundle();
    writeReport(report);
  } catch (error) {
    console.error(`Bundle budget inspection failed: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Largest initial JavaScript chunk: ${report.measurements.largestInitialJavascriptRawBytes} / ${BUDGETS.largestInitialJavascriptRawBytes} bytes.`);
  console.log(`Initial JavaScript plus CSS gzip: ${report.measurements.initialJavascriptAndCssGzipBytes} / ${BUDGETS.initialJavascriptAndCssGzipBytes} bytes.`);
  console.log(`Sanitized bundle evidence: ${path.relative(root, DEFAULT_OUTPUT).replaceAll('\\', '/')}`);
  if (!report.passed) {
    for (const violation of report.violations) console.error(`- ${violation}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  BUDGETS,
  collectInitialAssetNames,
  evaluateBundleMeasurements,
  measureBundle,
  writeReport
};
