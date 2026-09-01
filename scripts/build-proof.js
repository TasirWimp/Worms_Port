const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const defaultProofPath = 'server/build/.browser-build-proof.json';
const defaultInputPaths = [
  'package.json',
  'package-lock.json',
  'vite.client.config.ts',
  'client/assets',
  'client/src',
  'client/tsconfig.json',
  'server/data',
  'server/migrations',
  'server/src',
  'server/tsconfig.json',
  'shared',
  'assets',
  'legal',
  'scripts'
];
const defaultOutputPaths = ['client/build', 'server/build'];

function normalizePath(value) {
  return value.split(path.sep).join('/');
}

function collectFiles(root, relativePaths, excludedPaths = []) {
  const excluded = new Set(excludedPaths.map(normalizePath));
  const files = [];

  function visit(relativePath) {
    const normalized = normalizePath(relativePath);
    if (excluded.has(normalized)) return;
    const absolute = path.resolve(root, relativePath);
    if (!fs.existsSync(absolute)) {
      throw new Error(`build proof path is missing: ${normalized}`);
    }
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      throw new Error(`build proof refuses symbolic links: ${normalized}`);
    }
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(absolute).sort()) {
        visit(path.join(relativePath, entry));
      }
      return;
    }
    if (!stat.isFile()) {
      throw new Error(`build proof path is not a regular file: ${normalized}`);
    }
    files.push(normalized);
  }

  for (const relativePath of [...relativePaths].sort()) visit(relativePath);
  return files.sort();
}

function digestPaths(root, relativePaths, excludedPaths = []) {
  const hash = crypto.createHash('sha256');
  hash.update('nimble-knots-browser-build-proof-v1\0');
  for (const relativePath of collectFiles(root, relativePaths, excludedPaths)) {
    const bytes = fs.readFileSync(path.resolve(root, relativePath));
    hash.update(relativePath);
    hash.update('\0');
    hash.update(String(bytes.length));
    hash.update('\0');
    hash.update(bytes);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function resolveOptions(root, options = {}) {
  const proofPath = normalizePath(options.proofPath || defaultProofPath);
  return {
    root: path.resolve(root),
    proofPath,
    inputPaths: options.inputPaths || defaultInputPaths,
    outputPaths: options.outputPaths || defaultOutputPaths,
    nodeVersion: options.nodeVersion || process.version
  };
}

function currentDigests(root, options = {}) {
  const resolved = resolveOptions(root, options);
  return {
    inputDigest: digestPaths(resolved.root, resolved.inputPaths),
    outputDigest: digestPaths(resolved.root, resolved.outputPaths, [resolved.proofPath])
  };
}

function writeBuildProof(root = repoRoot, options = {}) {
  const resolved = resolveOptions(root, options);
  const proof = {
    schemaVersion: 1,
    nodeVersion: resolved.nodeVersion,
    ...currentDigests(resolved.root, resolved)
  };
  const absoluteProof = path.resolve(resolved.root, resolved.proofPath);
  fs.mkdirSync(path.dirname(absoluteProof), { recursive: true });
  fs.writeFileSync(absoluteProof, `${JSON.stringify(proof, null, 2)}\n`);
  return proof;
}

function verifyBuildProof(root = repoRoot, options = {}) {
  const resolved = resolveOptions(root, options);
  const absoluteProof = path.resolve(resolved.root, resolved.proofPath);
  if (!fs.existsSync(absoluteProof)) {
    return { valid: false, reason: 'proof is missing' };
  }

  let proof;
  try {
    proof = JSON.parse(fs.readFileSync(absoluteProof, 'utf8'));
  } catch (error) {
    return { valid: false, reason: `proof is unreadable: ${error.message}` };
  }
  if (!proof || typeof proof !== 'object' || proof.schemaVersion !== 1) {
    return { valid: false, reason: 'proof schema is unsupported' };
  }
  if (proof.nodeVersion !== resolved.nodeVersion) {
    return { valid: false, reason: 'Node.js version changed' };
  }

  let digests;
  try {
    digests = currentDigests(resolved.root, resolved);
  } catch (error) {
    return { valid: false, reason: error.message };
  }
  if (proof.inputDigest !== digests.inputDigest) {
    return { valid: false, reason: 'declared build inputs changed' };
  }
  if (proof.outputDigest !== digests.outputDigest) {
    return { valid: false, reason: 'built output changed' };
  }
  return { valid: true, reason: 'declared inputs and exact outputs match', proof };
}

if (require.main === module) {
  try {
    if (process.argv[2] !== '--write') {
      throw new Error('Usage: node scripts/build-proof.js --write');
    }
    const proof = writeBuildProof();
    console.log(`Browser build proof written: ${proof.inputDigest.slice(0, 12)} / ${proof.outputDigest.slice(0, 12)}.`);
  } catch (error) {
    console.error(`Browser build proof failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  collectFiles,
  digestPaths,
  verifyBuildProof,
  writeBuildProof
};
