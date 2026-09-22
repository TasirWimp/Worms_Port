const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { acquireVerificationLease } = require('./verification-lease');
const { checkRangeWhitespace } = require('./check-range-whitespace');

const repoRoot = path.resolve(__dirname, '..');
const productSuites = ['protocol', 'simulation', 'loomkeeper', 'relics', 'combat', 'practice', 'identity', 'reward', 'pei'];
const browserSuites = ['smoke', 'practice', 'identity', 'reward', 'pei', 'resilience'];
const verificationEnvironmentPrefixes = ['NIMBLE_', 'PEI_', 'PLAYWRIGHT_', 'PRACTICE_', 'REWARD_', 'WP014_'];
const verificationEnvironmentNames = new Set(['CI', 'DATABASE_URL', 'NODE_ENV', 'TZ']);

// Keep cross-module dependencies conservative. Unclassified files never mean no tests.
function planChanges(paths) {
  const files = [...new Set(paths.map((file) => file.replaceAll('\\', '/')))].sort();
  const checks = new Set();
  const suites = new Set();
  const browser = new Set();
  const fallback = [];
  let runtime = false;
  let postgres = false;
  let performance = false;
  let audit = false;
  const add = (target, values) => values.forEach((value) => target.add(value));
  function product(unit = productSuites, specs = browserSuites) {
    runtime = true;
    add(checks, ['check:import-boundary', 'check:types']);
    add(suites, unit.map((suite) => `test:${suite}`));
    add(browser, specs);
  }
  function broad() {
    product();
    checks.add('check:compliance');
    suites.add('test:tooling');
    postgres = true;
  }
  for (const file of files) {
    if (/^docs\/evidence\/.*\.md$/.test(file)) {
      checks.add('check:clean-room');
    } else if (/^docs\/images\//.test(file)) {
      checks.add('check:generation-components');
    } else if (/^docs\/evidence\/.*\.json$/.test(file) || file === 'legal/work-package-evidence.schema.json') {
      checks.add('check:work-packages');
    } else if (/^legal\/clean-room/.test(file)) {
      checks.add('check:clean-room');
    } else if (/^(?:README\.md|AGENTS\.md|docs\/.*\.(?:md|png|jpg|svg)|\.codex\/.*\.(?:toml|md))$/.test(file)) {
      // Instructions and reference illustrations do not enter the product build.
    } else if (/^analysis\/crpm_world\/|^tests\/crpm-world\//.test(file) || /^scripts\/(?:run-crpm-world|run-wp-015d2r|run-(?:cocoon|f4|natural|policy|reachable|tactical-order|v4-command))/.test(file)) {
      add(suites, ['check:crpm-world-types', 'test:crpm-world', 'test:d2a-adapter']);
    } else if (/^analysis\/tactical_model\/|^tests\/tactical-model\//.test(file) || /^scripts\/(?:export-tactical|run-v5-balance)/.test(file)) {
      suites.add('test:tactical-model');
    } else if (file === 'tests/loomkeeper/terrain-starts-v10.assessment.ts') {
      suites.add('assess:v10');
    } else if (/^tests\/browser-postgres\//.test(file) || file === 'playwright.postgres.config.ts' || file === 'scripts/run-postgres-browser.js') {
      postgres = true;
      suites.add('test:tooling');
    } else if (/^tests\/browser\/performance\.spec\.ts$|^scripts\/performance-budget\.js$/.test(file)) {
      performance = true;
      suites.add('test:tooling');
    } else if (/^tests\/browser\/(?:visual\.spec\.ts|visual\.spec\.ts-snapshots\/)/.test(file)) {
      browser.add('visual');
    } else if (/^tests\/browser\//.test(file)) {
      const spec = /^tests\/browser\/([^/]+)\.spec\.ts$/.exec(file);
      if (spec && browserSuites.includes(spec[1])) browser.add(spec[1]);
      else add(browser, [...browserSuites, 'visual']);
      suites.add('test:tooling');
    } else if (/^tests\/reward\/postgres\.integration\.ts$/.test(file)) {
      postgres = true;
    } else if (/^tests\/support\//.test(file)) {
      product();
      postgres = true;
    } else if (/^tests\//.test(file)) {
      const family = file.split('/')[1];
      if ([...productSuites, 'tooling'].includes(family)) suites.add(`test:${family}`);
      else { fallback.push(file); broad(); }
    } else if (/^(?:package(?:-lock)?\.json|\.npmrc)$/.test(file)) {
      broad();
      audit = true;
      performance = true;
    } else if (/^client\/src\/identity\/|^server\/src\/identity\//.test(file)) {
      product(['identity', 'reward', 'protocol', 'practice'], ['smoke', 'identity', 'reward', 'practice']);
      postgres = true;
    } else if (/^client\/src\/(?:combat\/|scenes\/combat\.ts|lib\/(?:sideways|util)\.ts)/.test(file)) {
      product(['combat', 'practice'], ['smoke', 'practice', 'resilience']);
    } else if (/^client\/src\/(?:result\/|scenes\/result\.ts)/.test(file)) {
      product(['combat', 'practice', 'identity', 'reward', 'protocol'], [...browserSuites, 'visual']);
    } else if (/^client\/src\/practice\/|^client\/src\/scenes\/practice\.ts/.test(file)) {
      product(['combat', 'practice', 'identity', 'reward', 'protocol'], browserSuites);
    } else if (file === 'client/src/style.css') {
      product(['combat', 'practice', 'identity', 'reward', 'protocol'], [...browserSuites, 'visual']);
    } else if (/^client\//.test(file)) {
      product(['combat', 'practice', 'identity', 'reward', 'protocol']);
    } else if (/^server\/src\/pei(?:\/|-)|^server\/migrations\/004_pei_operations\.sql$/.test(file)) {
      product(['pei', 'reward', 'protocol'], ['smoke', 'practice', 'reward', 'pei']);
      postgres = true;
    } else if (/^server\/src\/reward\/|^server\/migrations\//.test(file)) {
      product(['reward', 'identity', 'protocol', 'practice'], ['smoke', 'practice', 'identity', 'reward']);
      postgres = true;
    } else if (/^(?:server|shared)\//.test(file)) {
      product();
      postgres = true;
    } else if (/^(?:assets|legal)\//.test(file)) {
      checks.add('check:compliance');
      suites.add('test:tooling');
      if (/^assets\/|^legal\/asset-manifest/.test(file)) {
        product(['combat', 'practice'], ['smoke', 'practice', 'visual']);
      }
    } else if (file === 'scripts/smoke-built-server.js') {
      add(suites, ['test:tooling', 'smoke:built']);
    } else if (file === 'scripts/run-wp027-shadow-probes.ts' ||
      file === 'scripts/run-wp027-micro-experiment.ts' ||
      file === 'scripts/wp027-micro-experiment-cases.ts') {
      checks.add('check:types');
      suites.add('test:loomkeeper');
    } else if (file === '.github/workflows/verify.yml') {
      suites.add('test:tooling');
      postgres = true;
    } else if (/^scripts\/(?:verify-changes|verification-lease|run-full-verification|report-postgres-quality-prerequisite|audit-housekeeping|check-range-whitespace|check-crpm-world-types)\.js$/.test(file)) {
      suites.add('test:tooling');
    } else if (/^scripts\/check-(?:identity-bundles|reward-security|bundle-budget)\.js$/.test(file)) {
      runtime = true;
      checks.add('check:types');
      suites.add('test:tooling');
    } else if (/^scripts\/(?:check-|normalize-|compose-|compare-|generate-|comfy-|asset-normalization\/)/.test(file)) {
      checks.add('check:compliance');
      suites.add('test:tooling');
      if (/threadball-effects/.test(file)) product(['combat', 'practice'], ['smoke', 'practice']);
    } else if (/^scripts\/(?:run-playwright|playwright-quality-policy|playwright-quality-reporter)\.js$/.test(file) || file === 'playwright.config.ts') {
      suites.add('test:tooling');
      add(browser, [...browserSuites, 'visual']);
    } else {
      fallback.push(file);
      broad();
    }
  }
  // Compliance already includes the individual boundary/manifest checks.
  if (checks.has('check:compliance')) {
    for (const check of [...checks]) if (check !== 'check:compliance' && check !== 'check:types') checks.delete(check);
  }
  const tasks = [...checks, ...suites];
  const appendTask = (task) => { if (!tasks.includes(task)) tasks.push(task); };
  if (runtime) {
    for (const task of ['build:outputs', 'smoke:built', 'check:identity-bundles', 'check:reward-security', 'check:bundle-budget']) appendTask(task);
  }
  if (audit) appendTask('audit');
  const buildIndex = tasks.indexOf('build:outputs');
  const smokeIndex = tasks.indexOf('smoke:built');
  if (buildIndex >= 0 && smokeIndex >= 0 && smokeIndex < buildIndex) {
    tasks.splice(smokeIndex, 1);
    tasks.splice(tasks.indexOf('build:outputs') + 1, 0, 'smoke:built');
  }
  return { files, tasks, browser: [...browser].sort(), postgres, performance, fallback };
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
}

function gitBuffer(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 });
}

function changedFiles(root = repoRoot, base) {
  const paths = [];
  const append = (output) => paths.push(...output.split('\0').filter(Boolean));
  if (base) {
    if (base.startsWith('-')) throw new Error('Base must be a Git revision, not an option.');
    const ancestor = git(root, ['merge-base', base, 'HEAD']).trim();
    append(git(root, ['diff', '--name-only', '--no-renames', '-z', ancestor, 'HEAD', '--']));
  }
  // Read separately: an unstaged reversal must not hide a staged change.
  // --no-renames keeps both the old and new paths when ownership changes.
  append(git(root, ['diff', '--name-only', '--no-renames', '-z', '--']));
  append(git(root, ['diff', '--cached', '--name-only', '--no-renames', '-z', '--']));
  append(git(root, ['ls-files', '--others', '--exclude-standard', '-z']));
  return [...new Set(paths)].sort();
}

function parseArgs(args) {
  const options = { phase: 'all', dryRun: false };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--dry-run') options.dryRun = true;
    else if (['--base', '--phase', '--github-output'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) {
      options[args[i].slice(2)] = args[++i];
    } else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
  }
  if (!['all', 'checks', 'browser', 'postgres', 'performance'].includes(options.phase)) throw new Error('Invalid verification phase.');
  return options;
}

function verificationIdentity(root = repoRoot, { base, plan, env = process.env } = {}) {
  const selectedPlan = plan || planChanges(changedFiles(root, base));
  const head = git(root, ['rev-parse', 'HEAD']).trim();
  const baseAncestor = base ? git(root, ['merge-base', base, 'HEAD']).trim() : null;
  const packageLockPath = path.join(root, 'package-lock.json');
  const packageLockSha256 = fs.existsSync(packageLockPath)
    ? crypto.createHash('sha256').update(fs.readFileSync(packageLockPath)).digest('hex')
    : null;
  const hash = crypto.createHash('sha256');
  const add = (label, value) => {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
    hash.update(`${label}\0${bytes.length}\0`);
    hash.update(bytes);
    hash.update('\0');
  };

  add('head', head);
  add('base', base || '');
  add('base-ancestor', baseAncestor || '');
  add('node', process.version);
  add('platform', `${process.platform}-${process.arch}-${os.release()}`);
  add('package-lock', packageLockSha256 || 'missing');
  add('plan', JSON.stringify(selectedPlan));
  add('status', gitBuffer(root, ['status', '--porcelain=v2', '-z', '--untracked-files=all']));

  const environment = Object.keys(env)
    .filter((name) => verificationEnvironmentNames.has(name) || verificationEnvironmentPrefixes.some((prefix) => name.startsWith(prefix)))
    .sort()
    .map((name) => [name, String(env[name])]);
  add('environment', JSON.stringify(environment));

  for (const file of selectedPlan.files) {
    const absolute = path.resolve(root, file);
    const relative = path.relative(root, absolute);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`Changed path escapes repository: ${file}`);
    }
    add('path', file);
    add('index', gitBuffer(root, ['ls-files', '--stage', '-z', '--', file]));
    if (!fs.existsSync(absolute)) {
      add('working-tree', 'missing');
      continue;
    }
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) add('working-tree-symlink', fs.readlinkSync(absolute));
    else if (stat.isFile()) add('working-tree-file', fs.readFileSync(absolute));
    else add('working-tree-other', `${stat.mode}:${stat.size}`);
  }

  return {
    sha256: hash.digest('hex'),
    head,
    base: base || null,
    baseAncestor,
    node: process.version,
    platform: `${process.platform}-${process.arch}-${os.release()}`,
    packageLockSha256
  };
}

function recoveryGuidance(phase, options, identity) {
  const base = options.base ? ` --base '${String(options.base).replaceAll("'", "''")}'` : '';
  return [
    `Verification input fingerprint: ${identity.sha256}`,
    'Preserve the first failure and every passing command while this fingerprint and the build proof remain unchanged.',
    'Reproduce the smallest failing case with zero automatic retries. A passing isolated case is diagnostic evidence, not proof by itself of an infrastructure failure.',
    `If the cause remains uncertain, rerun only the affected phase: npm.cmd run verify:changes -- --phase ${phase}${base}`,
    'Rerun the complete selector only after tested inputs or the plan change, or when evidence points to contamination across phases.'
  ].join('\n');
}

function runPhase(phase, options, identity, action) {
  try {
    action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\n${recoveryGuidance(phase, options, identity)}`);
  }
}

function run(command, args) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  // Only fixed, repository-owned npm task names use the Windows command shim.
  // Changed paths and Git refs are never interpolated into a shell command.
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit', shell: command === 'npm' && process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status ?? result.signal}).`);
}

function browserRuns(specs) {
  const runs = [];
  const ordinary = specs.filter((spec) => spec !== 'visual');
  if (ordinary.length) runs.push({ specs: ordinary, projects: ['--project=chromium-390x844'] });
  // Empty project filter means all five maintained projects, only for visual specs.
  if (specs.includes('visual')) runs.push({ specs: ['visual'], projects: [] });
  return runs;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  // npm.ps1 may consume this flag on Windows; a requested dry run must stay dry.
  if (process.env.npm_config_dry_run === 'true') options.dryRun = true;
  for (const flag of ['base', 'phase']) {
    if (process.env[`npm_config_${flag}`]) throw new Error(`npm consumed --${flag}; use npm.cmd or invoke this Node script directly.`);
  }
  const plan = planChanges(changedFiles(repoRoot, options.base));
  const identity = verificationIdentity(repoRoot, { base: options.base, plan });
  console.log(JSON.stringify({ ...plan, verification: identity }, null, 2));
  if (options['github-output']) {
    fs.appendFileSync(options['github-output'], `checks=${plan.tasks.length > 0}\nbrowser=${plan.browser.length > 0}\nvisual=${plan.browser.includes('visual')}\npostgres=${plan.postgres}\nperformance=${plan.performance}\n`);
  }
  if (options.dryRun) return;
  const lease = acquireVerificationLease({ repoRoot, mode: `change-selected:${options.phase}` });
  console.log(`[verification-lease] acquired by change-selected verification (PID ${process.pid})`);
  try {
    run('git', ['diff', '--check']);
    run('git', ['diff', '--cached', '--check']);
    if (options.base) {
      const inspection = checkRangeWhitespace(options.base, repoRoot);
      if (inspection.acceptedLines.length > 0) {
        console.log(`Range whitespace check passed with ${inspection.acceptedLines.length} exact blob-bound historical exception(s).`);
      }
    }
    const phase = (name) => options.phase === 'all' || options.phase === name;
    if (phase('checks')) {
      runPhase('checks', options, identity, () => {
        for (const task of plan.tasks) run('npm', task === 'audit' ? ['audit'] : ['run', task]);
      });
    }
    if (phase('browser') && plan.browser.length) {
      runPhase('browser', options, identity, () => {
        for (const selection of browserRuns(plan.browser)) {
          const args = ['scripts/run-playwright.js', '--reuse-build', ...selection.projects, ...selection.specs.map((spec) => `tests/browser/${spec}.spec.ts`)];
          if (selection.specs.includes('visual') && process.platform !== 'linux') {
            console.log('SKIPPED: Linux visual comparisons require Ubuntu CI; visual logic still runs.');
            args.push('--ignore-snapshots');
          }
          run(process.execPath, args);
        }
      });
    }
    if (phase('performance') && plan.performance) {
      runPhase('performance', options, identity, () => {
        run('npm', ['run', 'test:browser:performance']);
        run('npm', ['run', 'check:bundle-budget']);
      });
    }
    if (phase('postgres') && plan.postgres) {
      runPhase('postgres', options, identity, () => {
        if (process.env.WP014_TEST_DATABASE_URL?.trim()) run('npm', ['run', 'verify:postgres']);
        else if (process.env.CI) throw new Error('Selected PostgreSQL gate requires WP014_TEST_DATABASE_URL in CI.');
        else console.log('SKIPPED: PostgreSQL checks require WP014_TEST_DATABASE_URL; CI must run the database gate.');
      });
    }
    const completedIdentity = verificationIdentity(repoRoot, { base: options.base, plan });
    if (completedIdentity.sha256 !== identity.sha256) {
      throw new Error(
        `Verification inputs changed during the run; passing results are stale.\n` +
        `Initial fingerprint: ${identity.sha256}\nCurrent fingerprint: ${completedIdentity.sha256}`
      );
    }
    if (!plan.files.length) console.log('No working-tree changes. Use --base <starting-commit> to include committed work.');
    console.log('Change-selected verification passed. Daily/release full coverage remains npm run verify:daily.');
  } finally {
    if (lease.release()) console.log('[verification-lease] released');
  }
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = {
  planChanges,
  changedFiles,
  parseArgs,
  browserRuns,
  verificationIdentity,
  recoveryGuidance,
  runPhase
};
