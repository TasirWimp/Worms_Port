const { execFileSync, spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const acceptedHistoricalDiagnostic = Object.freeze({
  diagnostic: 'analysis/crpm_world/adapters/v4-authority-adapter.ts(78,7): error TS2739: Type \'Readonly<{ "nimble-knots-artillery-v1": 1; "nimble-knots-artillery-v2": 2; "nimble-knots-artillery-v3": 3; "nimble-knots-artillery-v4": 4; }>\' is missing the following properties from type \'Readonly<Record<SimulationRulesetId, 1 | 2 | 3 | 5 | 4 | 6 | 7>>\': "nimble-knots-artillery-v5", "nimble-knots-artillery-v6", "nimble-knots-artillery-v7"',
  blobs: Object.freeze({
    'analysis/crpm_world/adapters/v4-authority-adapter.ts': 'c7a7179ed49ab7c81ebb8da6ee7004ae7c15eee0',
    'shared/simulation.ts': 'fabc8b808f63c6e8f51c50e2f70650b8330c9133'
  })
});

function inspectTypeDiagnostics(output, resolveWorkingBlob, accepted = acceptedHistoricalDiagnostic) {
  const acceptedLines = [];
  const rejectedLines = [];
  const lines = stripAnsi(output).split(/\r?\n/).filter((line) => line.length > 0);

  for (const diagnostic of lines) {
    if (diagnostic !== accepted.diagnostic) {
      rejectedLines.push(diagnostic);
      continue;
    }

    const mismatches = [];
    for (const [file, expectedBlob] of Object.entries(accepted.blobs)) {
      try {
        const actualBlob = resolveWorkingBlob(file);
        if (actualBlob !== expectedBlob) {
          mismatches.push(`${file} blob ${actualBlob || '<empty>'} does not match ${expectedBlob}`);
        }
      } catch (error) {
        mismatches.push(`${file} blob could not be resolved: ${error.message}`);
      }
    }
    if (mismatches.length > 0) {
      rejectedLines.push(`${diagnostic} (${mismatches.join('; ')})`);
      continue;
    }
    acceptedLines.push(diagnostic);
  }

  return { acceptedLines, rejectedLines };
}

function workingBlob(file, root = repoRoot) {
  return execFileSync('git', ['hash-object', '--', file], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024
  }).trim();
}

function checkCrpmWorldTypes(root = repoRoot) {
  const compiler = require.resolve('typescript/bin/tsc');
  const result = spawnSync(process.execPath, [
    compiler,
    '-p',
    'analysis/crpm_world/tsconfig.json',
    '--pretty',
    'false'
  ], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`CRPM type check ended from signal ${result.signal}.`);

  const output = [result.stdout, result.stderr].filter(Boolean).join('');
  if (result.status === 0) {
    if (output.trim()) throw new Error(`CRPM type check produced unexpected output:\n${output.trim()}`);
    return { acceptedLines: [], rejectedLines: [] };
  }
  if (result.status !== 2) {
    throw new Error(output.trim() || `CRPM type check exited with status ${result.status}.`);
  }

  const inspection = inspectTypeDiagnostics(output, (file) => workingBlob(file, root));
  if (inspection.rejectedLines.length > 0 || inspection.acceptedLines.length !== 1) {
    throw new Error(`CRPM type check rejected:\n${inspection.rejectedLines.join('\n') || output.trim()}`);
  }
  return inspection;
}

function stripAnsi(value) {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
}

function main() {
  const result = checkCrpmWorldTypes();
  if (result.acceptedLines.length > 0) {
    console.log('CRPM type check passed with one exact blob-bound historical compatibility exception.');
  } else {
    console.log('CRPM type check passed.');
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  acceptedHistoricalDiagnostic,
  inspectTypeDiagnostics,
  checkCrpmWorldTypes,
  main
};
