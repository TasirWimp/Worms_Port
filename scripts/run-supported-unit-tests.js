const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const legacyFiles = new Set([
  'tests/protocol/action-turns-v8.test.ts',
  'tests/protocol/resource-turns-v9.test.ts',
  'tests/protocol/runtime.test.ts',
  'tests/protocol/simulation-limit.test.ts',
  'tests/protocol/staging-config.test.ts',
  'tests/simulation/action-turns-v8-replay.test.ts',
  'tests/simulation/action-turns-v8.test.ts',
  'tests/simulation/coordinator.test.ts',
  'tests/simulation/determinism.test.ts',
  'tests/simulation/golden-and-properties.test.ts',
  'tests/simulation/mechanics.test.ts',
  'tests/simulation/resource-turns-v9-replay.test.ts',
  'tests/simulation/resource-turns-v9.test.ts',
  'tests/combat/action-turns-v8-r1.test.ts',
  'tests/combat/action-turns-v8.test.ts',
  'tests/combat/camera-legacy.test.ts',
  'tests/combat/resource-turns-v9.test.ts',
  'tests/practice/action-turns-v8-client.test.ts',
  'tests/practice/action-turns-v8-r1-client.test.ts',
  'tests/practice/practice-client.test.ts',
  'tests/practice/resource-turns-v9-client.test.ts',
  'tests/reward/action-turns-v8.test.ts',
  'tests/reward/runtime.test.ts',
  'tests/reward/service.test.ts'
]);

function suiteFiles(suite) {
  const directory = path.join(root, 'tests', suite);
  if (!fs.statSync(directory).isDirectory()) throw new Error(`Unknown unit-test suite: ${suite}`);
  return fs.readdirSync(directory)
    .filter((filename) => filename.endsWith('.test.ts'))
    .map((filename) => `tests/${suite}/${filename}`)
    .filter((filename) => !legacyFiles.has(filename))
    .sort();
}

function main() {
  const args = process.argv.slice(2);
  const files = args[0] === '--legacy'
    ? [...legacyFiles].sort()
    : args.flatMap(suiteFiles);
  if (files.length === 0) {
    console.log(`No supported V10 unit files are registered for: ${args.join(', ')}`);
    return;
  }
  const result = childProcess.spawnSync(
    process.execPath,
    ['--import', 'tsx', '--test', ...files],
    { cwd: root, env: process.env, stdio: 'inherit' }
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Unit-test selector failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { legacyFiles, suiteFiles };
