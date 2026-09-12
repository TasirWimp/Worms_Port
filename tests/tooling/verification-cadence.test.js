const assert = require('node:assert/strict');
const test = require('node:test');

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { scripts } = require('../../package.json');
const {
  planChanges,
  changedFiles,
  parseArgs,
  browserRuns,
  verificationIdentity,
  recoveryGuidance,
  runPhase
} = require('../../scripts/verify-changes');
const { acquireVerificationLease } = require('../../scripts/verification-lease');
const { runFullVerification } = require('../../scripts/run-full-verification');
const {
  acceptedHistoricalDiagnostics,
  inspectWhitespaceDiagnostics
} = require('../../scripts/check-range-whitespace');
const {
  acceptedHistoricalDiagnostic: acceptedCrpmTypeDiagnostic,
  inspectTypeDiagnostics
} = require('../../scripts/check-crpm-world-types');

test('docs and Codex settings do not select a game build or test suite', () => {
  const plan = planChanges(['README.md', '.codex/config.toml', 'AGENTS.md', 'docs/planning/implementation_plan.md']);
  assert.deepEqual(plan.tasks, []);
  assert.deepEqual(plan.browser, []);
  assert.equal(plan.postgres, false);
  assert.equal(plan.performance, false);
});

test('evidence JSON runs its schema gate without product tests', () => {
  const plan = planChanges(['docs/evidence/wp-015d3a.json']);
  assert.deepEqual(plan.tasks, ['check:work-packages']);
  assert.deepEqual(plan.browser, []);
  assert.deepEqual(planChanges(['docs/evidence/wp-015d3a-v8-action-turns-behavior-record.md']).tasks, ['check:clean-room']);
  assert.deepEqual(planChanges(['docs/images/art-direction/knotkin-wizard-cowl-edit-mask.png']).tasks, ['check:generation-components']);
});

test('presentation work covers supported V10 browser journeys without retired previews', () => {
  const plan = planChanges(['client/src/combat/camera.ts']);
  for (const task of ['test:combat', 'test:practice', 'build:outputs']) assert.ok(plan.tasks.includes(task));
  for (const spec of ['smoke', 'practice', 'resilience']) assert.ok(plan.browser.includes(spec));
  assert.ok(!plan.browser.includes('combat'));
  for (const task of ['test:simulation', 'test:loomkeeper', 'test:reward', 'test:tooling']) assert.ok(!plan.tasks.includes(task));
  assert.equal(plan.postgres, false);
  assert.equal(plan.performance, false);
});

test('practice and identity retain reward dependencies and browser coverage', () => {
  for (const file of ['client/src/practice/client.ts', 'client/src/scenes/result.ts', 'server/src/identity/crypto.ts']) {
    const plan = planChanges([file]);
    for (const task of ['test:identity', 'test:reward', 'test:protocol']) assert.ok(plan.tasks.includes(task), `${file}: ${task}`);
    for (const spec of ['identity', 'reward']) assert.ok(plan.browser.includes(spec), `${file}: ${spec}`);
  }
  assert.equal(planChanges(['server/src/reward/postgres-store.ts']).postgres, true);
});

test('PEI helper changes select its operational boundary without legacy game families', () => {
  const plan = planChanges(['server/src/pei/transfer-store.ts']);
  for (const task of ['test:pei', 'test:reward', 'test:protocol', 'build:outputs']) {
    assert.ok(plan.tasks.includes(task), task);
  }
  for (const task of ['test:combat', 'test:simulation', 'test:loomkeeper']) {
    assert.ok(!plan.tasks.includes(task), task);
  }
  assert.deepEqual(plan.browser, ['pei', 'practice', 'reward', 'smoke']);
  assert.equal(plan.postgres, true);
});

test('result and style changes retain the five-project visual journey', () => {
  for (const file of ['client/src/result/fixture.ts', 'client/src/scenes/result.ts', 'client/src/style.css']) {
    const plan = planChanges([file]);
    assert.ok(plan.browser.includes('visual'), `${file}: visual`);
  }
});

test('shared AI changes retain authoritative integration coverage', () => {
  const plan = planChanges(['shared/loomkeeper-v8.ts']);
  for (const task of ['test:loomkeeper', 'test:simulation', 'test:protocol', 'test:practice', 'test:reward']) assert.ok(plan.tasks.includes(task));
  assert.equal(plan.postgres, true);
});

test('mixed changes deduplicate checks and select both owners', () => {
  const plan = planChanges(['tests/identity/crypto.test.ts', 'client\\src\\combat\\camera.ts', 'client/src/combat/camera.ts']);
  assert.equal(plan.tasks.filter((task) => task === 'test:identity').length, 1);
  assert.equal(plan.tasks.filter((task) => task === 'build:outputs').length, 1);
  assert.ok(plan.tasks.includes('test:combat'));
});

test('test-only changes select their family and preserve browser fixture routing', () => {
  assert.deepEqual(planChanges(['tests/identity/crypto.test.ts']).tasks, ['test:identity']);
  assert.deepEqual(planChanges(['tests/browser/reward.spec.ts']).browser, ['reward']);
  assert.equal(planChanges(['tests/reward/postgres.integration.ts']).postgres, true);
  assert.equal(planChanges(['tests/browser/performance.spec.ts']).performance, true);
});

test('housekeeping audit changes select only tooling coverage', () => {
  const plan = planChanges(['scripts/audit-housekeeping.js']);
  assert.deepEqual(plan.tasks, ['test:tooling']);
  assert.deepEqual(plan.browser, []);
  assert.deepEqual(plan.fallback, []);
});

test('V10 assessment changes select the finite assessment instead of the ordinary Loomkeeper glob', () => {
  const plan = planChanges(['tests/loomkeeper/terrain-starts-v10.assessment.ts']);
  assert.deepEqual(plan.tasks, ['assess:v10']);
  assert.deepEqual(plan.browser, []);
});

test('verification tooling changes select only tooling coverage', () => {
  for (const file of [
    'scripts/check-crpm-world-types.js',
    'scripts/check-range-whitespace.js',
    'scripts/verify-changes.js',
    'scripts/verification-lease.js',
    'scripts/run-full-verification.js'
  ]) {
    const plan = planChanges([file]);
    assert.deepEqual(plan.tasks, ['test:tooling']);
    assert.deepEqual(plan.browser, []);
    assert.deepEqual(plan.fallback, []);
  }
});

test('verification workflow changes retain the disposable PostgreSQL gate', () => {
  const plan = planChanges(['.github/workflows/verify.yml']);
  assert.deepEqual(plan.tasks, ['test:tooling']);
  assert.equal(plan.postgres, true);
  assert.deepEqual(plan.browser, []);
  assert.deepEqual(plan.fallback, []);
});

test('range whitespace accepts only the exact blob-bound historical diagnostics', () => {
  const [file, rule] = Object.entries(acceptedHistoricalDiagnostics)[0];
  const diagnostic = `${file}:${rule.line}: new blank line at EOF.`;
  const accepted = inspectWhitespaceDiagnostics(`${diagnostic}\n`, () => rule.blob);
  assert.deepEqual(accepted.acceptedLines, [diagnostic]);
  assert.deepEqual(accepted.rejectedLines, []);

  const wrongBlob = inspectWhitespaceDiagnostics(`${diagnostic}\n`, () => '0'.repeat(40));
  assert.deepEqual(wrongBlob.acceptedLines, []);
  assert.match(wrongBlob.rejectedLines[0], /does not match/);

  const unknown = inspectWhitespaceDiagnostics('unknown.txt:1: new blank line at EOF.\n', () => rule.blob);
  assert.deepEqual(unknown.acceptedLines, []);
  assert.deepEqual(unknown.rejectedLines, ['unknown.txt:1: new blank line at EOF.']);

  const otherWhitespace = inspectWhitespaceDiagnostics(`${file}:${rule.line}: trailing whitespace.\n+bad \n`, () => rule.blob);
  assert.deepEqual(otherWhitespace.acceptedLines, []);
  assert.deepEqual(otherWhitespace.rejectedLines, [`${file}:${rule.line}: trailing whitespace.`, '+bad ']);
});

test('CRPM type gate accepts only the exact blob-bound historical diagnostic', () => {
  const resolveAcceptedBlob = (file) => acceptedCrpmTypeDiagnostic.blobs[file];
  const accepted = inspectTypeDiagnostics(
    `${acceptedCrpmTypeDiagnostic.diagnostic}\n`,
    resolveAcceptedBlob
  );
  assert.deepEqual(accepted.acceptedLines, [acceptedCrpmTypeDiagnostic.diagnostic]);
  assert.deepEqual(accepted.rejectedLines, []);

  const wrongBlob = inspectTypeDiagnostics(
    `${acceptedCrpmTypeDiagnostic.diagnostic}\n`,
    () => '0'.repeat(40)
  );
  assert.deepEqual(wrongBlob.acceptedLines, []);
  assert.match(wrongBlob.rejectedLines[0], /blob .* does not match/);

  const changedDiagnostic = `${acceptedCrpmTypeDiagnostic.diagnostic.replace('TS2739', 'TS9999')}\n`;
  const changed = inspectTypeDiagnostics(changedDiagnostic, resolveAcceptedBlob);
  assert.deepEqual(changed.acceptedLines, []);
  assert.deepEqual(changed.rejectedLines, [changedDiagnostic.trim()]);

  const additional = inspectTypeDiagnostics(
    `${acceptedCrpmTypeDiagnostic.diagnostic}\nunexpected.ts(1,1): error TS2322: incompatible\n`,
    resolveAcceptedBlob
  );
  assert.deepEqual(additional.acceptedLines, [acceptedCrpmTypeDiagnostic.diagnostic]);
  assert.deepEqual(additional.rejectedLines, ['unexpected.ts(1,1): error TS2322: incompatible']);
});

test('one checkout permits only one active verification lease', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worms-verification-lease-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const first = acquireVerificationLease({ repoRoot: root, mode: 'daily' });
  assert.throws(
    () => acquireVerificationLease({ repoRoot: root, mode: 'change-selected' }),
    new RegExp(`already running.*PID ${process.pid}`, 's')
  );
  assert.equal(first.release(), true);
  const second = acquireVerificationLease({ repoRoot: root, mode: 'change-selected' });
  assert.equal(second.release(), true);
});

test('a dead verification owner is recovered without releasing its successor', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worms-verification-stale-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const stale = acquireVerificationLease({ repoRoot: root, mode: 'interrupted', pid: 2_147_483_647 });
  const successor = acquireVerificationLease({ repoRoot: root, mode: 'daily', isProcessAlive: () => false });
  assert.equal(stale.release(), false);
  assert.equal(successor.release(), true);
});

test('the full runner holds and releases its lease around the internal gate', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worms-full-verification-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let observedOwner;
  runFullVerification({
    mode: 'daily',
    root,
    spawn(command, args, options) {
      observedOwner = JSON.parse(fs.readFileSync(path.join(root, '.cache', 'verification-run', 'owner.json'), 'utf8'));
      assert.equal(command, 'npm');
      assert.deepEqual(args, ['run', 'verify:full:unlocked']);
      assert.equal(options.cwd, root);
      return { status: 0 };
    }
  });
  assert.equal(observedOwner.mode, 'daily');
  const successor = acquireVerificationLease({ repoRoot: root, mode: 'change-selected' });
  assert.equal(successor.release(), true);
});

test('the full runner releases its lease when the internal gate fails', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worms-failed-verification-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.throws(
    () => runFullVerification({ mode: 'full', root, spawn: () => ({ status: 7 }) }),
    /Full verification failed \(7\)/
  );
  const successor = acquireVerificationLease({ repoRoot: root, mode: 'daily' });
  assert.equal(successor.release(), true);
});

test('visual comparisons cover every baseline without multiplying ordinary browser work', () => {
  assert.deepEqual(browserRuns(['combat', 'reward', 'visual']), [
    { specs: ['combat', 'reward'], projects: ['--project=chromium-390x844'] },
    { specs: ['visual'], projects: [] }
  ]);
  assert.deepEqual(planChanges(['tests/browser/visual.spec.ts-snapshots/result-webkit-390x844.png']).browser, ['visual']);
});

test('analysis changes select analytical checks without product browser work', () => {
  const plan = planChanges(['analysis/crpm_world/canonical.ts']);
  assert.ok(plan.tasks.includes('test:crpm-world'));
  assert.ok(plan.tasks.includes('test:d2a-adapter'));
  assert.deepEqual(plan.browser, []);
});

test('unknown paths broaden coverage instead of silently skipping it', () => {
  const plan = planChanges(['new-runtime/entry.ts']);
  assert.deepEqual(plan.fallback, ['new-runtime/entry.ts']);
  for (const task of ['test:simulation', 'test:tooling', 'smoke:built']) assert.ok(plan.tasks.includes(task));
  assert.ok(plan.browser.includes('reward'));
});

test('built smoke harness edits select only tooling and the supported runtime smoke', () => {
  const plan = planChanges(['scripts/smoke-built-server.js']);
  assert.deepEqual(plan.tasks, ['test:tooling', 'smoke:built']);
  assert.deepEqual(plan.browser, []);
  assert.deepEqual(plan.fallback, []);
  const combined = planChanges(['scripts/smoke-built-server.js', 'server/src/pei/transfer-store.ts']);
  assert.equal(combined.tasks.filter(task => task === 'smoke:built').length, 1);
  assert.equal(combined.tasks.indexOf('smoke:built'), combined.tasks.indexOf('build:outputs') + 1);
});

test('dependency edits retain audit, PostgreSQL and performance checks', () => {
  const plan = planChanges(['package-lock.json']);
  assert.ok(plan.tasks.includes('audit'));
  assert.equal(plan.postgres, true);
  assert.equal(plan.performance, true);
});

test('invalid selector arguments cannot quietly become an empty selection', () => {
  for (const args of [['--base'], ['--phase', 'typo'], ['--unknown'], ['--base', '--dry-run']]) assert.throws(() => parseArgs(args));
  assert.equal(parseArgs(['--base', 'HEAD~1', '--dry-run']).base, 'HEAD~1');
});

test('verification identity binds HEAD, index, working tree, untracked files and relevant environment', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worms-verification-identity-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init');
  git('config', 'user.email', 'verification@example.invalid');
  git('config', 'user.name', 'Verification Test');
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}\n');
  fs.writeFileSync(path.join(root, 'tracked.ts'), 'original\n');
  git('add', '.');
  git('-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'fixture');

  const identify = (env = { NODE_ENV: 'test' }) => verificationIdentity(root, {
    plan: planChanges(changedFiles(root)),
    env
  }).sha256;
  const clean = identify();
  assert.equal(clean, identify());

  fs.writeFileSync(path.join(root, 'tracked.ts'), 'working tree\n');
  const workingTree = identify();
  assert.notEqual(workingTree, clean);
  git('add', 'tracked.ts');
  const staged = identify();
  assert.notEqual(staged, workingTree);
  fs.writeFileSync(path.join(root, 'tracked.ts'), 'original\n');
  const stagedWithReversal = identify();
  assert.notEqual(stagedWithReversal, staged);

  fs.writeFileSync(path.join(root, 'untracked.ts'), 'one\n');
  const untrackedOne = identify();
  fs.writeFileSync(path.join(root, 'untracked.ts'), 'two\n');
  assert.notEqual(identify(), untrackedOne);
  assert.notEqual(identify({ NODE_ENV: 'test', PLAYWRIGHT_BROWSERS_PATH: 'alternate' }), identify());
});

test('phase failure guidance preserves passing evidence and names the narrow rerun', () => {
  const identity = { sha256: 'abc123' };
  const guidance = recoveryGuidance('browser', { base: 'HEAD~1' }, identity);
  assert.match(guidance, /fingerprint: abc123/);
  assert.match(guidance, /--phase browser --base 'HEAD~1'/);
  assert.match(guidance, /passing command/);
  assert.throws(
    () => runPhase('browser', {}, identity, () => { throw new Error('browser failed'); }),
    /browser failed[\s\S]*--phase browser/
  );
});

test('Git selection includes staged, unstaged, untracked, renamed, deleted and committed paths', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worms-verification-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init');
  git('config', 'user.email', 'verification@example.invalid');
  git('config', 'user.name', 'Verification Test');
  for (const file of ['staged.ts', 'deleted.ts', 'old name.ts']) fs.writeFileSync(path.join(root, file), 'original\n');
  git('add', '.');
  git('-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'fixture');
  const base = git('rev-parse', 'HEAD');
  assert.deepEqual(changedFiles(root), []);
  fs.writeFileSync(path.join(root, 'committed.ts'), 'committed\n');
  git('add', '.');
  git('-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'committed change');
  fs.writeFileSync(path.join(root, 'staged.ts'), 'staged\n');
  git('add', 'staged.ts');
  fs.writeFileSync(path.join(root, 'staged.ts'), 'original\n');
  fs.unlinkSync(path.join(root, 'deleted.ts'));
  git('mv', 'old name.ts', 'new name.ts');
  fs.writeFileSync(path.join(root, 'untracked space.ts'), 'new\n');
  assert.deepEqual(changedFiles(root, base), ['committed.ts', 'deleted.ts', 'new name.ts', 'old name.ts', 'staged.ts', 'untracked space.ts']);
  assert.throws(() => changedFiles(root, 'missing-base'), /./);
  assert.throws(() => changedFiles(root, '--help'), /revision/);
});

function expand(name) {
  return scripts[name].split(' && ').flatMap((step) => {
    const match = /^npm run ([\w:-]+)$/.exec(step);
    return match ? expand(match[1]) : [step];
  });
}

test('daily coverage stays complete with a single compliance/types/build pass', () => {
  assert.equal(scripts['verify:daily'], 'node scripts/run-full-verification.js daily');
  assert.equal(scripts['verify:full'], 'node scripts/run-full-verification.js full');
  assert.equal(scripts['test:tooling'], 'node --test --test-concurrency=1 tests/tooling/*.test.js');
  const full = expand('verify:full:unlocked');
  const count = (pattern) => full.filter((step) => pattern.test(step)).length;
  assert.equal(count(/node scripts\/check-asset-manifest.js/), 1);
  assert.equal(count(/^tsc -p server\/tsconfig/), 1);
  assert.equal(count(/^vite build/), 1);
  assert.equal(count(/^esbuild /), 1);
  for (const pattern of [/quality-gate/, /performance-gate/, /check-bundle-budget/, /smoke-built-server/, /report-postgres-quality-prerequisite/, /^npm audit$/]) assert.equal(count(pattern), 1, `${pattern}`);
  for (const suite of ['tooling', 'protocol', 'simulation', 'loomkeeper', 'relics', 'combat', 'practice', 'identity', 'reward']) assert.ok(full.some((step) => step.includes(`tests/${suite}/`)), suite);
  assert.equal(scripts['verify:feature'], scripts['verify:changes']);
});

test('selected CI jobs retain enough time for the serial zero-retry gates', () => {
  const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/verify.yml'), 'utf8');
  assert.match(workflow, /CHANGE_BASE: \$\{\{ github\.event\.before \|\| github\.event\.pull_request\.base\.sha \}\}/);
  assert.equal((workflow.match(/CHANGE_BASE: \$\{\{ needs\.changes\.outputs\.base \}\}/g) ?? []).length, 2);
  const fast = workflow.match(/\n  fast:\n([\s\S]*?)\n  browser-quality:/)?.[1] ?? '';
  const browser = workflow.match(/\n  browser-quality:\n([\s\S]*?)\n  performance-bundle:/)?.[1] ?? '';
  const postgres = workflow.match(/\n  postgres-reward-security:\n([\s\S]*)$/)?.[1] ?? '';
  assert.match(fast, /\n    timeout-minutes: 60\n/);
  assert.match(browser, /\n    timeout-minutes: 45\n/);
  assert.match(postgres, /\n      - run: npm run test:pei:postgres\n/);
});
