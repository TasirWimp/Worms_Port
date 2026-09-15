const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');

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
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  await new Promise((resolve, reject) => {
    const force = setTimeout(() => child.kill('SIGKILL'), 2_000);
    const deadline = setTimeout(() => {
      child.off('exit', onExit);
      reject(new Error('Built server child did not exit after forced shutdown.'));
    }, 4_000);
    const onExit = () => {
      clearTimeout(force);
      clearTimeout(deadline);
      resolve();
    };
    child.once('exit', onExit);
    child.kill();
  });
}

function isolatedEnvironment(overrides = {}) {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (/^(NIMBLE_|PEI_|REWARD_|IDENTITY_|NIMIQ_|PRACTICE_TEST_|WP014_)/.test(name) ||
        ['DATABASE_URL', 'RENDER_EXTERNAL_URL', 'ALLOWED_ORIGINS', 'ALLOW_MISSING_ORIGIN',
          'SESSION_OPEN_RATE_CAPACITY'].includes(name)) delete environment[name];
  }
  return { ...environment, NODE_ENV: 'production', REWARD_MODE: 'disabled', ...overrides };
}

function emitAck(socket, event, payload) {
  return new Promise((resolve, reject) => {
    socket.timeout(2_000).emit(event, payload, (error, ack) => error ? reject(error) : resolve(ack));
  });
}

async function checkV10Combat(baseUrl) {
  const rulesetId = 'nimble-knots-artillery-v10-r7';
  const automationId = 'wp-024-v10-r7-live-v1';
  const socket = io(baseUrl, { transports: ['websocket'], reconnection: false,
    autoConnect: false, timeout: 2_000, extraHeaders: { Origin: baseUrl } });
  try {
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
      socket.connect();
    });
    const opened = await emitAck(socket, 'v1:session.open', {
      requestId: 'smoke_v10_session_01', action: 'create'
    });
    assert.equal(opened.ok, true);
    const created = await emitAck(socket, 'v10:challenge.create', {
      requestId: 'smoke_v10_creation_01', sequence: 0, mode: 'practice', calling: 'wizard',
      rulesetId, automationId
    });
    assert.equal(created.ok, true);
    assert.equal(created.data.mode, 'practice');
    assert.equal(created.data.calling, 'wizard');
    assert.equal(created.data.rulesetId, rulesetId);
    assert.equal(created.data.automationId, automationId);
    assert.equal(created.data.simulation.rulesetId, rulesetId);
    assert.equal(created.data.simulation.terrainProfileId, 'volcanic-ruin');
    assert.equal(created.data.simulation.terrainRevision, 0);
    assert.match(created.data.simulation.terrainHash, /^[a-f0-9]{64}$/);
    const paused = await emitAck(socket, 'v10:challenge.pause', {
      requestId: 'smoke_v10_pause_0001', sequence: created.nextSequence,
      challengeId: created.data.challengeId, rulesetId, automationId, paused: true
    });
    assert.equal(paused.ok, true);
    assert.equal(paused.data.paused, true);
    console.log('Validated standard V10 R7 volcanic Practice creation and pause.');
  } finally { socket.close(); }
}

async function checkLegacyCombat(baseUrl, staging, v9 = false) {
  const wire = v9 ? 'v9' : 'v8';
  const socket = io(baseUrl, { transports: ['websocket'], reconnection: false,
    autoConnect: false, timeout: 2_000, extraHeaders: { Origin: baseUrl },
    // A query cannot activate or downgrade the server-selected ruleset.
    query: { NIMBLE_RUNTIME_PROFILE: staging ? 'forged-production-profile' : 'staging-v8d-practice' } });
  try {
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
      socket.connect();
    });
    const opened = await emitAck(socket, 'v1:session.open', { requestId: 'smoke_session_01', action: 'create' });
    assert.equal(opened.ok, true);
    const request = { requestId: 'smoke_creation_01', sequence: 0, mode: 'practice', calling: 'wizard',
      ...(v9 ? { rulesetId: 'nimble-knots-artillery-v9', automationId: 'wp-015d3b-v9d-v1' } : {}) };
    for (const selector of [{ rulesetId: 'nimble-knots-artillery-v8-r1' },
      { automationId: 'wp-015d3a-v8d-r1-v1' }]) {
      const rejected = await emitAck(socket, 'v8:challenge.create', { ...request, ...selector });
      assert.equal(rejected.ok, false);
      assert.equal(rejected.error.code, 'BAD_REQUEST');
    }
    if (staging) {
      const legacy = await emitAck(socket, 'v1:challenge.create', {
        requestId: request.requestId, sequence: request.sequence, mode: 'practice', calling: 'wizard' });
      assert.equal(legacy.ok, false);
      assert.equal(legacy.error.code, 'FEATURE_UNAVAILABLE');
      const identity = await emitAck(socket, 'v1:identity.begin', {
        requestId: 'smoke_identity_01', address: 'NQ00 0000 0000 0000 0000 0000 0000 0000 0000' });
      assert.equal(identity.ok, false);
      assert.equal(identity.error.code, 'FEATURE_UNAVAILABLE');
      const reward = await emitAck(socket, `${wire}:challenge.create`, { ...request,
        requestId: 'smoke_reward_001', mode: 'reward',
        ...(v9 ? { challengeId: 'a'.repeat(32), eligibilityToken: 'a'.repeat(43) }
          : { eligibility: { challengeId: 'a'.repeat(32), token: 'a'.repeat(43) } }) });
      assert.equal(reward.ok, false);
      assert.equal(reward.error.code, v9 ? 'FEATURE_UNAVAILABLE' : 'REWARD_UNAVAILABLE');
      request.sequence = reward.nextSequence;
      const info = await emitAck(socket, 'v1:reward.info', { requestId: 'smoke_reward_info' });
      assert.equal(info.ok, false);
      assert.equal(info.error.code, 'REWARD_UNAVAILABLE');
    }
    const created = await emitAck(socket, `${wire}:challenge.create`, request);
    assert.equal(created.ok, true);
    if (!v9) assert.equal(created.data.kind, staging ? 'v8' : 'legacy');
    const snapshot = v9 ? created.data : created.data.snapshot;
    assert.equal(staging ? snapshot.rulesetId : snapshot.simulation.rulesetId,
      staging ? (v9 ? 'nimble-knots-artillery-v9' : 'nimble-knots-artillery-v8-r1') : 'nimble-knots-artillery-v7');
    if (staging) {
      assert.equal(snapshot.automationId, v9 ? 'wp-015d3b-v9d-v1' : 'wp-015d3a-v8d-r1-v1');
      assert.equal(snapshot.loomkeeperPolicyId, v9 ? 'nimble-knots-loomkeeper-v4' : 'nimble-knots-loomkeeper-v3');
      assert.equal(snapshot.loomkeeperProfileId, v9 ? 'standard-v9-0' : 'standard-v8-0');
      // No seeds, clock injection, artificial tick advance or player shortcuts:
      // allow the actual 15s player timeout and observe live AI progression.
      // A legal no-plan timeout is allowed by policy, not a flaky random-seed failure.
      await new Promise((resolve, reject) => {
        let aiObserved = false;
        const done = (error) => {
          clearTimeout(timer);
          socket.off(`${wire}:challenge.snapshot`, onSnapshot);
          socket.off('disconnect', onDisconnect);
          socket.off(`${wire}:challenge.result`, onResult);
          error ? reject(error) : resolve();
        };
        const onSnapshot = update => {
          if (update.challengeId !== snapshot.challengeId || update.simulation.tick <= snapshot.simulation.tick) return;
          if (update.status === 'expired') return done(new Error('Staging simulation expired during live AI.'));
          if (update.simulation.finishReason === 'simulation_limit') {
            return done(new Error('Staging simulation hit a safety limit during live AI.'));
          }
          if (update.simulation.activeActor === 'loomkeeper') {
            aiObserved = true;
            if (update.simulation.castUsed) {
              console.log('Observed real-clock Loomkeeper cast.');
              done();
            }
          } else if (aiObserved && update.status === 'active' && update.simulation.activeActor === 'player') {
            console.log('Observed real-clock Loomkeeper turn handback without a cast.');
            done();
          }
        };
        const onResult = result => {
          if (result.challengeId !== snapshot.challengeId) return;
          if (aiObserved && ['player_win', 'loomkeeper_win', 'draw'].includes(result.outcome)) done();
          else done(new Error('Staging ended without valid live AI progression.'));
        };
        const onDisconnect = () => done(new Error('Staging disconnected before live AI progression.'));
        const timer = setTimeout(() => done(new Error('Staging real-clock AI progression was not observed within 40s.')), 40_000);
        socket.on(`${wire}:challenge.snapshot`, onSnapshot);
        socket.on(`${wire}:challenge.result`, onResult);
        socket.once('disconnect', onDisconnect);
      });
      console.log(`Validated deployed ${v9 ? 'V9D' : 'V8D'} Practice: live timer/AI, no identity/rewards.`);
    } else console.log('Validated ordinary production-runtime V7 creation; query cannot select V8.');
  } finally { socket.close(); }
}

async function connectionTripwire() {
  let contacts = 0;
  const server = net.createServer(socket => { contacts++; socket.destroy(); });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { port: server.address().port, contacts: () => contacts,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

async function smokeProfile(profile) {
  const practiceOnly = profile !== undefined;
  const v9 = profile === 'development-v9d-practice';
  const development = profile === 'development-v8d-practice' || v9;
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const database = development ? await connectionTripwire() : undefined;
  const rpc = development ? await connectionTripwire() : undefined;
  const dormantMarker = 'DORMANT_SECRET_SENTINEL';
  let stderr = '';
  let stdout = '';
  const child = spawn(process.execPath, [serverEntry], {
    cwd: root,
    env: isolatedEnvironment({ PORT: String(port), ...(practiceOnly ? {
      NIMBLE_RUNTIME_PROFILE: profile, NIMBLE_DEPLOYMENT: development ? undefined : 'staging',
      RENDER_EXTERNAL_URL: 'https://staging.example', ALLOWED_ORIGINS: baseUrl
    } : {}), ...(development ? {
      REWARD_MODE: 'mainnet', REWARD_PAUSED: 'true', REWARD_NETWORK: 'main-albatross',
      REWARD_LUNA: dormantMarker, REWARD_EXPECTED_SIGNER_ADDRESS: dormantMarker,
      REWARD_PRIVATE_KEY_FILE: path.join(root, 'test-results', dormantMarker, 'nonexistent.key'),
      REWARD_MAINNET_ACKNOWLEDGEMENT: dormantMarker,
      REWARD_RPC_URL: `http://127.0.0.1:${rpc.port}/${dormantMarker}`,
      DATABASE_URL: `postgres://unused:${dormantMarker}@127.0.0.1:${database.port}/unused`,
      NIMIQ_NETWORK: dormantMarker, IDENTITY_PUBLIC_ORIGIN: dormantMarker
    } : {}) }),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  child.stdout.on('data', chunk => { stdout += chunk; });

  try {
    const rootResponse = await waitForServer(`${baseUrl}/`, child);
    const rootBody = await rootResponse.text();
    if (!rootBody.includes('<div id="game"></div>')) {
      throw new Error('Root response did not contain the built game page.');
    }

    const overlayResponse = await fetch(`${baseUrl}/overlay/join.html`);
    const overlayBody = await overlayResponse.text();
    if (!overlayResponse.ok || !overlayBody.includes('NIMble Knots')) {
      throw new Error('Built join overlay was not served from the client build.');
    }

    const approvedAssetsResponse = await fetch(`${baseUrl}/assets/approved-assets.json`);
    const approvedAssets = await approvedAssetsResponse.json();
    if (!approvedAssetsResponse.ok || !Array.isArray(approvedAssets.assets)) {
      throw new Error('Approved asset build manifest was not served from the client build.');
    }

    const roomResponse = await fetch(`${baseUrl}/.room.join_id`);
    const roomId = (await roomResponse.text()).trim();
    if (!roomResponse.ok || !/^[a-z0-9]+(?:-[a-z0-9]+){2}$/.test(roomId)) {
      throw new Error(
        `Room join ID probe failed: HTTP ${roomResponse.status}, body ${JSON.stringify(roomId)}.`
      );
    }

    const runtimeResponse = await fetch(`${baseUrl}/api/practice-profile`);
    const runtimeMetadata = await runtimeResponse.json();
    assert.equal(runtimeResponse.ok, true);
    assert.equal(runtimeMetadata.ruleset, practiceOnly ? 'legacy' : 'volcanic-v10');

    if (practiceOnly) await checkLegacyCombat(baseUrl, practiceOnly, v9);
    else await checkV10Combat(baseUrl);
    if (practiceOnly) assert.ok(stdout.includes(`Runtime ${profile} / ${v9 ? 'nimble-knots-artillery-v9 / wp-015d3b-v9d-v1' : 'nimble-knots-artillery-v8-r1 / wp-015d3a-v8d-r1-v1'} / rewards disabled`));
    console.log(`Built server ${profile ?? 'standard V10 R7'} smoke test passed on port ${port}.`);
    console.log(`Validated /, built overlays, approved asset plumbing, and /.room.join_id (${roomId}).`);
  } finally {
    try {
      await stopServer(child);
    } finally {
      if (development) await Promise.all([database.close(), rpc.close()]);
    }
    if (development) {
      assert.equal(database.contacts(), 0, 'Development must never contact the dormant database, including shutdown.');
      assert.equal(rpc.contacts(), 0, 'Development must never contact the dormant RPC, including shutdown.');
      assert.ok(!stdout.includes(dormantMarker) && !stderr.includes(dormantMarker),
        'Development must never log dormant setting values.');
      console.log('Validated zero dormant DB/RPC contacts through shutdown and no dormant config-value logging.');
    }
    if (stderr.trim()) {
      process.stderr.write(stderr);
    }
  }
}

async function rejectedStartup(overrides) {
  const port = await getFreePort();
  const child = spawn(process.execPath, [serverEntry], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    env: isolatedEnvironment({ PORT: String(port), NIMBLE_RUNTIME_PROFILE: 'staging-v8d-practice',
      NIMBLE_DEPLOYMENT: 'staging', ...overrides }) });
  let stdout = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.resume();
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Unsafe staging startup did not fail promptly.')), startupTimeoutMs);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => {
        clearTimeout(timer);
        code === 1 ? resolve() : reject(new Error('Unsafe staging startup did not exit with code 1.'));
      });
    });
    assert.ok(!stdout.includes('Listening on') && !stdout.includes('Runtime '));
    await assert.rejects(fetch(`http://127.0.0.1:${port}/`));
  } finally { await stopServer(child); }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(argument => argument !== '--legacy')) {
    throw new Error(`Unknown built smoke option: ${args.find(argument => argument !== '--legacy')}`);
  }
  await smokeProfile();
  if (!args.includes('--legacy')) {
    console.log('Retired V7/V8/V9 profiles were excluded from routine built smoke.');
    return;
  }
  await smokeProfile('staging-v8d-practice');
  await smokeProfile('development-v8d-practice');
  await smokeProfile('development-v9d-practice');
  for (const overrides of [
    { NIMBLE_RUNTIME_PROFILE: 'unknown' }, { NIMBLE_DEPLOYMENT: 'production' },
    { NODE_ENV: 'test', PRACTICE_TEST_SEEDS: '1' }, { REWARD_MODE: 'record-only' },
    { REWARD_MODE: 'testnet' }, { REWARD_MODE: 'mainnet' },
    { DATABASE_URL: 'postgres://invalid.invalid/must-not-connect' },
    { NIMIQ_NETWORK: 'main-albatross' }, { IDENTITY_PUBLIC_ORIGIN: 'https://identity.example' },
    { REWARD_PRIVATE_KEY_FILE: 'must-not-read' }, { REWARD_RPC_URL: 'https://must-not-contact.invalid' },
    { PRACTICE_TEST_SEEDS: '1' }, { WP014_QUALITY_TEST: 'true' }
  ]) await rejectedStartup(overrides);
  for (const overrides of [
    { REWARD_PAUSED: undefined }, { REWARD_PAUSED: 'false' }, { REWARD_PAUSED: ' true ' },
    { NODE_ENV: 'test' }, { NIMBLE_DEPLOYMENT: 'staging' }, { NIMBLE_DEPLOYMENT: 'unknown' },
    { REWARD_TEST_MEMORY_STORE: 'true' }, { REWARD_TEST_SEED: '1' },
    { PRACTICE_TEST_SEEDS: '1' }, { WP014_QUALITY_TEST: 'true' },
    { ALLOW_MISSING_ORIGIN: 'true' }, { SESSION_OPEN_RATE_CAPACITY: '100' }
  ]) await rejectedStartup({ NIMBLE_RUNTIME_PROFILE: 'development-v8d-practice',
    NIMBLE_DEPLOYMENT: undefined, REWARD_PAUSED: 'true', ...overrides });
  // Removing the development selector restores ordinary parsing, not a sticky bypass.
  await rejectedStartup({ NIMBLE_RUNTIME_PROFILE: undefined, NIMBLE_DEPLOYMENT: undefined,
    REWARD_PAUSED: 'true', REWARD_LUNA: 'malformed-rollback-value' });
  console.log('Validated unsafe staging configurations exit before listening.');
}

main().catch((error) => {
  console.error(`Built server smoke test failed: ${error.message}`);
  process.exitCode = 1;
});
