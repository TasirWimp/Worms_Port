const childProcess = require('node:child_process');
const path = require('node:path');

const { verifyBuildProof } = require('./build-proof');

const repoRoot = path.resolve(__dirname, '..');

function productionBuildEnvironment(environment) {
  return { ...environment, NODE_ENV: 'production' };
}

function buildDecision(environment, root = repoRoot) {
  if (environment.PLAYWRIGHT_REUSE_BUILD !== 'true') {
    return { reuse: false, reason: 'verified reuse was not requested' };
  }
  const verification = verifyBuildProof(root);
  return { reuse: verification.valid, reason: verification.reason };
}

function main() {
  const decision = buildDecision(process.env);
  if (decision.reuse) {
    console.log(`Reusing verified production build: ${decision.reason}.`);
    require(path.join(repoRoot, 'server', 'build', 'server.js'));
    return;
  }
  if (process.env.PLAYWRIGHT_REUSE_BUILD === 'true') {
    console.log(`Verified production build cache miss: ${decision.reason}; rebuilding.`);
  }
  const build = childProcess.spawnSync('npm', ['run', 'build'], {
    cwd: repoRoot,
    env: productionBuildEnvironment(process.env),
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  if (build.error) {
    console.error(`Browser test build failed to start: ${build.error.message}`);
    process.exit(1);
  }
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }

  require(path.join(repoRoot, 'server', 'build', 'server.js'));
}

if (require.main === module) main();

module.exports = { buildDecision, productionBuildEnvironment };
