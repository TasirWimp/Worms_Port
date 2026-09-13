const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const clientBuild = path.join(root, 'client', 'build');
const serverBundle = path.join(root, 'server', 'build', 'server.js');
const proxyBundle = path.join(root, 'server', 'build', 'pei-proxy-server.js');

const forbiddenPeiProxyInputs = [
  'server/src/game/',
  'server/src/protocol/',
  'server/src/reward/',
  'server/src/room/',
  'server/src/session/',
  'server/src/simulation/',
  'shared/loomkeeper',
  'shared/protocol',
  'shared/simulation'
];

function inspectPeiProxyInputs(metafile) {
  const output = Object.entries(metafile?.outputs || {}).find(([name]) =>
    path.posix.basename(name.replaceAll('\\', '/')) === 'pei-proxy-server.js'
  )?.[1];
  if (!output?.inputs) throw new Error('Server metafile does not describe the PEI proxy output.');
  return Object.keys(output.inputs)
    .map((name) => name.replaceAll('\\', '/'))
    .filter((name) => forbiddenPeiProxyInputs.some((prefix) => name.startsWith(prefix)))
    .sort();
}

function main() {
  if (!fs.existsSync(clientBuild) || !fs.existsSync(serverBundle) || !fs.existsSync(proxyBundle)) {
    throw new Error('Identity bundle inspection requires a fresh complete build.');
  }

  const clientJavaScript = listFiles(clientBuild)
    .filter((file) => file.endsWith('.js'))
    .map((file) => fs.readFileSync(file, 'utf8'));
  const joinedClient = clientJavaScript.join('\n');
  const servers = [serverBundle, proxyBundle].map((file) => fs.readFileSync(file, 'utf8'));

  for (const forbidden of ['@nimiq/core', 'index_bg.wasm', "Nimiq's Rust-to-WASM"]) {
    if (joinedClient.includes(forbidden)) {
      throw new Error(`Client bundle contains forbidden server-only marker: ${forbidden}`);
    }
  }
  if (!joinedClient.includes('Nimiq provider was not injected')) {
    throw new Error('The lazy Mini App SDK chunk was not found in the client build.');
  }
  for (const server of servers) {
    if (!/require\(["']@nimiq\/core["']\)/.test(server)) {
      throw new Error('A server bundle did not preserve @nimiq/core as an external Node dependency.');
    }
    if (server.includes('index_bg.wasm')) {
      throw new Error('A server bundle inlined a broken relative Nimiq WASM lookup.');
    }
  }

  const coupledInputs = inspectPeiProxyInputs(esbuild.buildSync({
    absWorkingDir: root,
    entryPoints: ['server/src/pei-proxy-server.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    external: ['@nimiq/core'],
    metafile: true,
    write: false,
    logLevel: 'silent'
  }).metafile);
  if (coupledInputs.length > 0) {
    throw new Error(`PEI proxy bundle crossed into game authority: ${coupledInputs.join(', ')}.`);
  }

  console.log('Identity bundle inspection passed.');
  console.log('Confirmed lazy Mini App SDK client chunk, server-only external @nimiq/core, and isolated PEI helper authority.');
}

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(file) : [file];
  });
}

if (require.main === module) main();

module.exports = { inspectPeiProxyInputs };
