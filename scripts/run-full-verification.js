const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { acquireVerificationLease } = require('./verification-lease');

const repoRoot = path.resolve(__dirname, '..');

function runFullVerification({ mode, root = repoRoot, spawn = spawnSync }) {
  if (!['daily', 'full'].includes(mode)) throw new Error('Expected verification mode "daily" or "full".');
  const lease = acquireVerificationLease({ repoRoot: root, mode });
  console.log(`[verification-lease] acquired by ${mode} verification (PID ${process.pid})`);
  try {
    const result = spawn('npm', ['run', 'verify:full:unlocked'], {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Full verification failed (${result.status ?? result.signal}).`);
  } finally {
    if (lease.release()) console.log('[verification-lease] released');
  }
}

if (require.main === module) {
  try {
    runFullVerification({ mode: process.argv[2] });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { runFullVerification };
