const childProcess = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function main() {
  const port = await getFreePort();
  const cli = require.resolve('@playwright/test/cli');
  const rawArgs = process.argv.slice(2);
  const qualityGate = rawArgs.includes('--quality-gate');
  const qualityShard = rawArgs.includes('--quality-shard');
  const performanceGate = rawArgs.includes('--performance-gate');
  const reuseBuild = rawArgs.includes('--reuse-build');
  const args = rawArgs.filter((argument) =>
    argument !== '--quality-gate' && argument !== '--quality-shard' &&
    argument !== '--performance-gate' && argument !== '--reuse-build'
  );
  if (qualityShard && !qualityGate) {
    throw new Error('A quality shard requires --quality-gate.');
  }
  if (qualityShard && !args.some((argument) => argument.startsWith('--project='))) {
    throw new Error('A quality shard requires at least one explicit --project=<name>.');
  }
  assertSerialGateWorkers(args, { qualityGate, performanceGate });
  const qualityProjects = args
    .filter((argument) => argument.startsWith('--project='))
    .map((argument) => argument.slice('--project='.length))
    .filter(Boolean);
  if (qualityGate && process.env.CI && args.includes('--ignore-snapshots')) {
    throw new Error('WP-014 CI quality tests cannot ignore Linux visual comparisons.');
  }
  if (qualityGate && process.platform !== 'linux' && !args.includes('--ignore-snapshots')) {
    console.log('Non-Linux WP-014 run: visual comparisons are explicitly omitted; authoritative Linux CI remains mandatory.');
    args.push('--ignore-snapshots');
  }
  if (qualityGate || performanceGate) assertQualityGateEnvironment(process.env);
  const rewardRun = qualityGate || (!performanceGate && args.length === 0) || args.some((argument) =>
    argument.includes('reward.spec') || argument.includes('pei.spec') || argument.includes('visual.spec')
  );
  const child = childProcess.spawn(
    process.execPath,
    [cli, 'test', ...args],
    {
      cwd: path.resolve(__dirname, '..'),
      env: {
        ...process.env,
        PLAYWRIGHT_PORT: String(port),
        ...(reuseBuild ? { PLAYWRIGHT_REUSE_BUILD: 'true' } : {}),
        ...(qualityGate ? { PLAYWRIGHT_QUALITY_GATE: 'true' } : {}),
        ...(qualityShard ? { PLAYWRIGHT_QUALITY_SHARD: 'true' } : {}),
        ...(qualityShard ? { PLAYWRIGHT_QUALITY_PROJECTS: qualityProjects.join(',') } : {}),
        ...(performanceGate ? { PLAYWRIGHT_PERFORMANCE_GATE: 'true' } : {}),
        ...(rewardRun ? {
          WP014_QUALITY_TEST: 'true',
          REWARD_MODE: 'record-only',
          REWARD_PAUSED: 'false',
          REWARD_TEST_MEMORY_STORE: 'true',
          REWARD_TEST_SEED: '1',
          REWARD_LUNA: '100000',
          REWARD_DAILY_BUDGET_LUNA: '400000'
        } : {})
      },
      stdio: 'inherit'
    }
  );

  const result = await new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  if (result.signal) process.kill(process.pid, result.signal);
  else process.exit(result.code ?? 1);
}

function workerOverrides(args) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--workers' || argument === '-j') {
      values.push(args[index + 1] || '');
      index += 1;
    } else if (argument.startsWith('--workers=')) {
      values.push(argument.slice('--workers='.length));
    } else if (argument.startsWith('-j=')) {
      values.push(argument.slice('-j='.length));
    }
  }
  return values;
}

function assertSerialGateWorkers(args, { qualityGate, performanceGate }) {
  if (!qualityGate && !performanceGate) return;
  const invalid = workerOverrides(args).filter((value) => value !== '1');
  if (invalid.length > 0) {
    throw new Error('WP-014 quality and performance gates require exactly one worker per project shard.');
  }
}

function assertQualityGateEnvironment(env) {
  if (['testnet', 'mainnet'].includes(env.REWARD_MODE || '')) {
    throw new Error('WP-014 quality tests refuse inherited chain reward modes.');
  }
  const blocked = [
    'DATABASE_URL',
    'REWARD_PRIVATE_KEY_FILE',
    'REWARD_RPC_URL',
    'NIMIQ_RECOVERY_WORDS',
    'REWARD_MAINNET_ACKNOWLEDGEMENT',
    'REWARD_TEST_WALLET_ADDRESS',
    'REWARD_TEST_DAILY_ATTEMPT_LIMIT',
    'REWARD_TEST_REPEAT_ACKNOWLEDGEMENT'
  ];
  const configured = blocked.filter((name) => typeof env[name] === 'string' && env[name].trim());
  if (configured.length > 0) {
    throw new Error(`WP-014 quality tests refuse inherited external authority: ${configured.join(', ')}.`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Playwright runner failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { assertQualityGateEnvironment, assertSerialGateWorkers, workerOverrides };
