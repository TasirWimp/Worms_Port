const { execFileSync, spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const acceptedHistoricalDiagnostics = Object.freeze({
  'analysis/crpm_world/admissions/i2/cut.ts': Object.freeze({
    line: 53,
    blob: '072f26ce6023cd70597f4f9333b3c9e426071cef'
  }),
  'analysis/crpm_world/examples/d2e-i2-spawn-pressure-request.json': Object.freeze({
    line: 118,
    blob: '49e73ce5b87fd8fabd8aecdd7fa27014a9a93d0d'
  }),
  'client/src/combat/action-turns-v8-fixture.ts': Object.freeze({
    line: 114,
    blob: '1ee958578f8b8d590b67049f0288570c95d6ba8c'
  }),
  'docs/evidence/wp-015d4d-v10g-weapon-terrain-reference.md': Object.freeze({
    line: 28,
    blob: '7007da642401f809e92e7eab6847fc8aa19f74c4'
  }),
  'scripts/run-crpm-world-design-i2.ts': Object.freeze({
    line: 57,
    blob: '1d258247168815e66f7b55c1cee704dcd946079e'
  }),
  'tests/crpm-world/d2e-i2-admission.test.ts': Object.freeze({
    line: 141,
    blob: '103aa6becb91a90c54a874c50b237eb2baeae64d'
  })
});

function inspectWhitespaceDiagnostics(output, resolveHeadBlob, accepted = acceptedHistoricalDiagnostics) {
  const acceptedLines = [];
  const rejectedLines = [];
  const lines = output.split(/\r?\n/).filter((line) => line.length > 0);

  for (const diagnostic of lines) {
    const match = /^(.+):([1-9]\d*): (.+)$/.exec(diagnostic);
    if (!match) {
      rejectedLines.push(diagnostic);
      continue;
    }

    const [, file, rawLine, message] = match;
    const rule = accepted[file];
    if (!rule || Number(rawLine) !== rule.line || message !== 'new blank line at EOF.') {
      rejectedLines.push(diagnostic);
      continue;
    }

    let blob;
    try {
      blob = resolveHeadBlob(file);
    } catch (error) {
      rejectedLines.push(`${diagnostic} (unable to resolve HEAD blob: ${error.message})`);
      continue;
    }
    if (blob !== rule.blob) {
      rejectedLines.push(`${diagnostic} (HEAD blob ${blob || '<empty>'} does not match ${rule.blob})`);
      continue;
    }
    acceptedLines.push(diagnostic);
  }

  return { acceptedLines, rejectedLines };
}

function headBlob(file, root = repoRoot) {
  return execFileSync('git', ['rev-parse', `HEAD:${file}`], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024
  }).trim();
}

function checkRangeWhitespace(base, root = repoRoot) {
  if (!base || base.startsWith('-')) throw new Error('Base must be a Git revision, not an option.');
  const result = spawnSync('git', ['diff', '--check', `${base}...HEAD`, '--'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`git diff --check ended from signal ${result.signal}.`);
  if (result.stderr || ![0, 2].includes(result.status)) {
    throw new Error(result.stderr.trim() || `git diff --check exited with status ${result.status}.`);
  }

  const inspection = inspectWhitespaceDiagnostics(result.stdout, (file) => headBlob(file, root));
  if (inspection.rejectedLines.length > 0) {
    throw new Error(`git diff --check rejected:\n${inspection.rejectedLines.join('\n')}`);
  }
  if (result.status === 2 && inspection.acceptedLines.length === 0) {
    throw new Error('git diff --check reported whitespace errors without a recognized diagnostic.');
  }
  return inspection;
}

function main(args = process.argv.slice(2)) {
  if (args.length !== 1) throw new Error('Usage: node scripts/check-range-whitespace.js <base>');
  const result = checkRangeWhitespace(args[0]);
  if (result.acceptedLines.length > 0) {
    console.log(`Range whitespace check passed with ${result.acceptedLines.length} exact blob-bound historical exception(s).`);
  } else {
    console.log('Range whitespace check passed.');
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
  acceptedHistoricalDiagnostics,
  inspectWhitespaceDiagnostics,
  checkRangeWhitespace,
  main
};
