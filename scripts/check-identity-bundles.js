const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const clientBuild = path.join(root, 'client', 'build');
const serverBundle = path.join(root, 'server', 'build', 'server.js');

if (!fs.existsSync(clientBuild) || !fs.existsSync(serverBundle)) {
  throw new Error('Identity bundle inspection requires a fresh complete build.');
}

const clientJavaScript = listFiles(clientBuild)
  .filter((file) => file.endsWith('.js'))
  .map((file) => fs.readFileSync(file, 'utf8'));
const joinedClient = clientJavaScript.join('\n');
const server = fs.readFileSync(serverBundle, 'utf8');

for (const forbidden of ['@nimiq/core', 'index_bg.wasm', "Nimiq's Rust-to-WASM"]) {
  if (joinedClient.includes(forbidden)) {
    throw new Error(`Client bundle contains forbidden server-only marker: ${forbidden}`);
  }
}
if (!joinedClient.includes('Nimiq provider was not injected')) {
  throw new Error('The lazy Mini App SDK chunk was not found in the client build.');
}
if (!/require\(["']@nimiq\/core["']\)/.test(server)) {
  throw new Error('Server bundle did not preserve @nimiq/core as an external Node dependency.');
}
if (server.includes('index_bg.wasm')) {
  throw new Error('Server bundle inlined a broken relative Nimiq WASM lookup.');
}

console.log('Identity bundle inspection passed.');
console.log('Confirmed lazy Mini App SDK client chunk and server-only external @nimiq/core.');

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(file) : [file];
  });
}
