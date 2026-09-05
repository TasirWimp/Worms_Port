const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const productSuites = ['protocol', 'simulation', 'loomkeeper', 'relics', 'combat', 'practice', 'identity', 'reward'];
const browserSuites = ['smoke', 'combat', 'practice', 'identity', 'reward', 'resilience'];

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
      product(['combat', 'practice'], ['smoke', 'combat', 'practice', 'resilience']);
    } else if (/^client\/src\/(?:practice\/|result\/|scenes\/(?:practice|result)\.ts)/.test(file)) {
      product(['combat', 'practice', 'identity', 'reward', 'protocol'], browserSuites);
    } else if (/^client\//.test(file)) {
      product(['combat', 'practice', 'identity', 'reward', 'protocol']);
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
        product(['combat', 'practice'], ['smoke', 'combat', 'practice', 'visual']);
      }
    } else if (/^scripts\/(?:verify-changes|report-postgres-quality-prerequisite)\.js$/.test(file)) {
      suites.add('test:tooling');
    } else if (/^scripts\/check-(?:identity-bundles|reward-security|bundle-budget)\.js$/.test(file)) {
      runtime = true;
      checks.add('check:types');
      suites.add('test:tooling');
    } else if (/^scripts\/(?:check-|normalize-|compose-|compare-|generate-|comfy-|asset-normalization\/)/.test(file)) {
      checks.add('check:compliance');
      suites.add('test:tooling');
      if (/threadball-effects/.test(file)) product(['combat', 'practice'], ['smoke', 'combat', 'practice']);
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
  if (runtime) tasks.push('build:outputs', 'smoke:built', 'check:identity-bundles', 'check:reward-security', 'check:bundle-budget');
  if (audit) tasks.push('audit');
  return { files, tasks, browser: [...browser].sort(), postgres, performance, fallback };
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
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
  console.log(JSON.stringify(plan, null, 2));
  if (options['github-output']) {
    fs.appendFileSync(options['github-output'], `checks=${plan.tasks.length > 0}\nbrowser=${plan.browser.length > 0}\nvisual=${plan.browser.includes('visual')}\npostgres=${plan.postgres}\nperformance=${plan.performance}\n`);
  }
  if (options.dryRun) return;
  run('git', ['diff', '--check']);
  run('git', ['diff', '--cached', '--check']);
  if (options.base) {
    const ancestor = git(repoRoot, ['merge-base', options.base, 'HEAD']).trim();
    run('git', ['diff', '--check', ancestor, 'HEAD']);
  }
  const phase = (name) => options.phase === 'all' || options.phase === name;
  if (phase('checks')) {
    for (const task of plan.tasks) run('npm', task === 'audit' ? ['audit'] : ['run', task]);
  }
  if (phase('browser') && plan.browser.length) {
    for (const selection of browserRuns(plan.browser)) {
      const args = ['scripts/run-playwright.js', '--reuse-build', ...selection.projects, ...selection.specs.map((spec) => `tests/browser/${spec}.spec.ts`)];
      if (selection.specs.includes('visual') && process.platform !== 'linux') {
        console.log('SKIPPED: Linux visual comparisons require Ubuntu CI; visual logic still runs.');
        args.push('--ignore-snapshots');
      }
      run(process.execPath, args);
    }
  }
  if (phase('performance') && plan.performance) {
    run('npm', ['run', 'test:browser:performance']);
    run('npm', ['run', 'check:bundle-budget']);
  }
  if (phase('postgres') && plan.postgres) {
    if (process.env.WP014_TEST_DATABASE_URL?.trim()) run('npm', ['run', 'verify:postgres']);
    else if (process.env.CI) throw new Error('Selected PostgreSQL gate requires WP014_TEST_DATABASE_URL in CI.');
    else console.log('SKIPPED: PostgreSQL checks require WP014_TEST_DATABASE_URL; CI must run the database gate.');
  }
  if (!plan.files.length) console.log('No working-tree changes. Use --base <starting-commit> to include committed work.');
  console.log('Change-selected verification passed. Daily/release full coverage remains npm run verify:daily.');
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { planChanges, changedFiles, parseArgs, browserRuns };
