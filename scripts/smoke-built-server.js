const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const serverEntry = path.join(root, 'server', 'build', 'server.js');
const startupTimeoutMs = 10_000;
const retryDelayMs = 100;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForServer(url, child) {
  const deadline = Date.now() + startupTimeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited during startup with code ${child.exitCode}.`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
      lastError = new Error(`Startup probe returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }

    await delay(retryDelayMs);
  }

  throw new Error(`Server did not start within ${startupTimeoutMs}ms: ${lastError}`);
}

async function stopServer(child) {
  if (child.exitCode !== null) {
    return;
  }

  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(2_000).then(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
    })
  ]);
}

async function main() {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let stderr = '';
  const child = spawn(process.execPath, [serverEntry], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  try {
    const rootResponse = await waitForServer(`${baseUrl}/`, child);
    const rootBody = await rootResponse.text();
    if (!rootBody.includes('<div id="game"></div>')) {
      throw new Error('Root response did not contain the built game page.');
    }

    const roomResponse = await fetch(`${baseUrl}/.room.join_id`);
    const roomId = (await roomResponse.text()).trim();
    if (!roomResponse.ok || !/^[a-z0-9]+(?:-[a-z0-9]+){2}$/.test(roomId)) {
      throw new Error(
        `Room join ID probe failed: HTTP ${roomResponse.status}, body ${JSON.stringify(roomId)}.`
      );
    }

    console.log(`Built server smoke test passed on port ${port}.`);
    console.log(`Validated / and /.room.join_id (${roomId}).`);
  } finally {
    await stopServer(child);
    if (stderr.trim()) {
      process.stderr.write(stderr);
    }
  }
}

main().catch((error) => {
  console.error(`Built server smoke test failed: ${error.message}`);
  process.exitCode = 1;
});
