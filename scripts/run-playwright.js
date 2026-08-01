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
  const args = rawArgs.filter((argument) => argument !== '--quality-gate');
  if (qualityGate) assertQualityGateEnvironment(process.env);
  const rewardRun = args.length === 0 ||
    args.some((argument) => argument.includes('reward.spec'));
  const child = childProcess.spawn(
    process.execPath,
    [cli, 'test', ...args],
    {
      cwd: path.resolve(__dirname, '..'),
      env: {
        ...process.env,
        PLAYWRIGHT_PORT: String(port),
        ...(qualityGate ? { PLAYWRIGHT_QUALITY_GATE: 'true' } : {}),
        ...(rewardRun ? {
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

function assertQualityGateEnvironment(env) {
  if (['testnet', 'mainnet'].includes(env.REWARD_MODE || '')) {
    throw new Error('WP-014 quality tests refuse inherited chain reward modes.');
  }
  const blocked = [
    'DATABASE_URL',
    'REWARD_PRIVATE_KEY_FILE',
    'REWARD_RPC_URL',
    'NIMIQ_RECOVERY_WORDS'
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

module.exports = { assertQualityGateEnvironment };
