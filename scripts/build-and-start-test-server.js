const childProcess = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function productionBuildEnvironment(environment) {
  return { ...environment, NODE_ENV: 'production' };
}

function main() {
  const build = childProcess.spawnSync('npm', ['run', 'build'], {
    cwd: root,
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

  require(path.join(root, 'server', 'build', 'server.js'));
}

if (require.main === module) main();

module.exports = { productionBuildEnvironment };
