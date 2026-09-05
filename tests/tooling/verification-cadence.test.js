const assert = require('node:assert/strict');
const test = require('node:test');

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { scripts } = require('../../package.json');
const { planChanges, changedFiles, parseArgs, browserRuns, assertAvailableTasks } = require('../../scripts/verify-changes');

test('docs and Codex settings do not select a game build or test suite', () => {
  const plan = planChanges(['README.md', '.codex/config.toml', 'AGENTS.md', 'docs/planning/implementation_plan.md']);
  assert.deepEqual(plan.tasks, []);
  assert.deepEqual(plan.browser, []);
  assert.equal(plan.postgres, false);
  assert.equal(plan.performance, false);
});

test('combat scene result routing keeps reward browser coverage', () => {
  assert.ok(planChanges(['client/src/scenes/combat.ts']).browser.includes('reward'));
});

test('evidence JSON runs its schema gate without product tests', () => {
  const plan = planChanges(['docs/evidence/wp-015d3a.json']);
  assert.deepEqual(plan.tasks, ['check:work-packages']);
  assert.deepEqual(plan.browser, []);
  assert.deepEqual(planChanges(['docs/evidence/wp-015d3a-v8-action-turns-behavior-record.md']).tasks, ['check:clean-room']);
  const images = planChanges(['docs/images/art-direction/reference.png']);
  assert.deepEqual(images.tasks, [scripts['check:generation-components'] ? 'check:generation-components' : 'check:compliance']);
  assertAvailableTasks(images);
});

test('missing infrastructure cannot silently remove selected checks', () => {
  assert.throws(() => assertAvailableTasks({ tasks: ['test:new-analysis'] }), /unavailable.*test:new-analysis/);
  assert.doesNotThrow(() => assertAvailableTasks(planChanges(['client/src/combat/camera.ts'])));
});

test('presentation work covers whole combat specs without unrelated AI units', () => {
  const plan = planChanges(['client/src/combat/camera.ts']);
  for (const task of ['test:combat', 'test:practice', 'build:outputs']) assert.ok(plan.tasks.includes(task));
  for (const spec of ['combat', 'resilience']) assert.ok(plan.browser.includes(spec));
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
  assert.equal(scripts['verify:daily'], 'npm run verify:full');
  const full = expand('verify:daily');
  const count = (pattern) => full.filter((step) => pattern.test(step)).length;
  assert.equal(count(/node scripts\/check-asset-manifest.js/), 1);
  assert.equal(count(/^tsc -p server\/tsconfig/), 1);
  assert.equal(count(/^vite build/), 1);
  assert.equal(count(/^esbuild /), 1);
  for (const pattern of [/quality-gate/, /performance-gate/, /check-bundle-budget/, /smoke-built-server/, /report-postgres-quality-prerequisite/, /^npm audit$/]) assert.equal(count(pattern), 1, `${pattern}`);
  for (const suite of ['tooling', 'protocol', 'simulation', 'loomkeeper', 'relics', 'combat', 'practice', 'identity', 'reward']) assert.ok(full.some((step) => step.includes(`tests/${suite}/`)), suite);
  assert.equal(scripts['verify:feature'], scripts['verify:changes']);
});
