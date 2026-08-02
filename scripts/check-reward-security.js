const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const SYNTHETIC_TEST_PRIVATE_KEY = [
  '000102030405060708090a0b0c0d0e0f',
  '101112131415161718191a1b1c1d1e1f'
].join('');
const ALLOWED_TEST_KEY_FILE = 'tests/support/nimiq-signer.ts';
const TEXT_EXTENSIONS = new Set([
  '.cjs', '.css', '.html', '.js', '.json', '.log', '.md', '.mjs', '.sql',
  '.svg', '.ts', '.tsx', '.txt', '.xml'
]);

function scanRewardSecurity(projectRoot = root, options = {}) {
  const requireBuild = options.requireBuild !== false;
  const errors = [];
  const sourceDirectories = ['client/src', 'server/src', 'shared', 'scripts', 'tests'];
  for (const directory of sourceDirectories) {
    for (const file of listTextFiles(path.join(projectRoot, directory))) {
      const relative = relativePath(projectRoot, file);
      const text = fs.readFileSync(file, 'utf8');
      if (text.includes(SYNTHETIC_TEST_PRIVATE_KEY) && relative !== ALLOWED_TEST_KEY_FILE) {
        errors.push(`${relative}: fixed synthetic private key escaped its test-only helper.`);
      }
      if (/-----BEGIN (?:EC |RSA )?PRIVATE KEY-----/.test(text)) {
        errors.push(`${relative}: PEM private key material is forbidden.`);
      }
      if (/(?:privateKey|recoveryWords|mnemonic)\s*[:=]\s*['"][A-Fa-f0-9]{64}['"]/.test(text) &&
          relative !== ALLOWED_TEST_KEY_FILE) {
        errors.push(`${relative}: literal private-key-shaped source value is forbidden.`);
      }
    }
  }

  const clientBuild = path.join(projectRoot, 'client', 'build');
  const serverBundle = path.join(projectRoot, 'server', 'build', 'server.js');
  if (requireBuild && (!fs.existsSync(clientBuild) || !fs.existsSync(serverBundle))) {
    errors.push('Reward security inspection requires a fresh complete build.');
  }
  const clientText = listTextFiles(clientBuild)
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
  for (const marker of [
    '@nimiq/core',
    'PrivateKey.fromHex',
    'REWARD_PRIVATE_KEY_FILE',
    'NIMIQ_RECOVERY_WORDS',
    SYNTHETIC_TEST_PRIVATE_KEY
  ]) {
    if (clientText.includes(marker)) {
      errors.push(`client/build: forbidden payout or server-only marker ${marker}.`);
    }
  }
  if (fs.existsSync(serverBundle)) {
    const serverText = fs.readFileSync(serverBundle, 'utf8');
    if (serverText.includes(SYNTHETIC_TEST_PRIVATE_KEY)) {
      errors.push('server/build/server.js: fixed test private key entered the server bundle.');
    }
    if (/-----BEGIN (?:EC |RSA )?PRIVATE KEY-----/.test(serverText)) {
      errors.push('server/build/server.js: PEM private key material entered the server bundle.');
    }
  }

  for (const artifactDirectory of ['test-results', 'playwright-report']) {
    for (const file of listTextFiles(path.join(projectRoot, artifactDirectory))) {
      const relative = relativePath(projectRoot, file);
      const text = fs.readFileSync(file, 'utf8');
      if (text.includes(SYNTHETIC_TEST_PRIVATE_KEY) ||
          /-----BEGIN (?:EC |RSA )?PRIVATE KEY-----/.test(text)) {
        errors.push(`${relative}: private key material entered a generated artifact.`);
      }
      if (/nimble-knots\.session-token[^A-Za-z0-9_-]{0,160}[A-Za-z0-9_-]{43}/.test(text)) {
        errors.push(`${relative}: a session token entered a generated text artifact.`);
      }
      if (/"(?:publicKey|signature)"\s*:\s*"[A-Fa-f0-9]{64,128}"/.test(text)) {
        errors.push(`${relative}: a wallet authorization proof entered a generated artifact.`);
      }
    }
  }
  return errors;
}

function listTextFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return listTextFiles(file);
    if (!entry.isFile() || !TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) return [];
    if (entry.size > 5_000_000) return [];
    return [file];
  });
}

function relativePath(projectRoot, file) {
  return path.relative(projectRoot, file).replace(/\\/g, '/');
}

function main() {
  const errors = scanRewardSecurity();
  if (errors.length > 0) {
    console.error('Reward security inspection failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log('Reward security inspection passed.');
  console.log('No payout key fixture, wallet proof, session token, or server-only marker leaked.');
}

if (require.main === module) main();

module.exports = { scanRewardSecurity };
