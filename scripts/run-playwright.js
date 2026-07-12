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
  const child = childProcess.spawn(
    process.execPath,
    [cli, 'test', ...process.argv.slice(2)],
    {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, PLAYWRIGHT_PORT: String(port) },
      stdio: 'inherit'
    }
  );

  const result = await new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  if (result.signal) process.kill(process.pid, result.signal);
  else process.exit(result.code ?? 1);
}

main().catch((error) => {
  console.error(`Playwright runner failed: ${error.message}`);
  process.exitCode = 1;
});
