const configured = typeof process.env.WP014_TEST_DATABASE_URL === 'string' &&
  process.env.WP014_TEST_DATABASE_URL.trim().length > 0;

if (configured) {
  console.log('PostgreSQL prerequisite is configured; running the authoritative database gate.');
  const result = require('node:child_process').spawnSync('npm', ['run', 'verify:postgres'], {
    cwd: require('node:path').resolve(__dirname, '..'),
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} else {
  console.log('PostgreSQL quality was not run by verify:full: WP014_TEST_DATABASE_URL is unavailable. The separate npm run verify:postgres GitHub Actions gate remains mandatory.');
}
