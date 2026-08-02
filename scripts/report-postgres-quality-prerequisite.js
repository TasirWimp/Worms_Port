const configured = typeof process.env.WP014_TEST_DATABASE_URL === 'string' &&
  process.env.WP014_TEST_DATABASE_URL.trim().length > 0;

if (configured) {
  console.log('PostgreSQL quality prerequisite is configured. Run npm run verify:postgres as the separate authoritative database gate.');
} else {
  console.log('PostgreSQL quality was not run by verify:full: WP014_TEST_DATABASE_URL is unavailable. The separate npm run verify:postgres GitHub Actions gate remains mandatory.');
}
