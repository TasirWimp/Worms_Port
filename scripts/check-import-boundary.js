const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourceManifestPath = path.join(root, 'legal', 'source-manifest.json');
const allowedQuarantineExtensions = new Set(['.md', '.json', '.txt', '.csv']);
const allowedQuarantineBasenames = new Set(['.gitkeep']);
const productCodeRoots = ['client/', 'server/', 'shared/'];
const productCodeFiles = ['package.json', 'package-lock.json'];

function toRepoPath(file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function walk(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') {
      continue;
    }
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(absolute));
    } else {
      files.push(toRepoPath(absolute));
    }
  }
  return files;
}

function trackedOrWorkingFiles() {
  try {
    const output = childProcess.execFileSync('git', ['ls-files'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    const files = output.split(/\r?\n/).filter(Boolean);
    if (files.length > 0) {
      return files;
    }
  } catch (error) {
    // Fall back to filesystem scan before the repo is initialized.
  }
  return walk(root);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function isProductCodePath(file) {
  return productCodeRoots.some((rootPath) => file.startsWith(rootPath)) ||
    productCodeFiles.includes(file);
}

const errors = [];
const sourceManifest = readJson(sourceManifestPath);
const turtle = sourceManifest.sources.find((source) => source.repository === 'TurtlePU/worms-ii');
const sorcerers = sourceManifest.sources.find((source) => source.repository === 'lorgan3/sorcerers');

if (!turtle || turtle.role !== 'base_code' || turtle.license !== 'MIT' || turtle.decision !== 'approved_base') {
  errors.push('TurtlePU/worms-ii must be recorded as the MIT approved base_code source.');
}

if (!sorcerers || sorcerers.role !== 'quarantine_reference_only' || sorcerers.license !== 'GPL-3.0' || sorcerers.decision !== 'not_imported') {
  errors.push('lorgan3/sorcerers must be recorded as GPL-3.0 quarantine_reference_only and not_imported.');
}

for (const file of trackedOrWorkingFiles()) {
  const absoluteFile = path.join(root, file);
  if (!fs.existsSync(absoluteFile)) {
    continue;
  }

  if (file.startsWith('assets-quarantine/sorcerers/raw/')) {
    const basename = path.basename(file);
    if (basename !== 'README.md' && !allowedQuarantineBasenames.has(basename)) {
      errors.push(`${file}: raw Sorcerers quarantine files must not be tracked.`);
    }
  }

  if (file.startsWith('assets-quarantine/sorcerers/reviewed/')) {
    const basename = path.basename(file);
    const ext = path.extname(file);
    if (!allowedQuarantineExtensions.has(ext) && !allowedQuarantineBasenames.has(basename)) {
      errors.push(`${file}: quarantine review records must be text metadata, not product assets.`);
    }
  }

  if (isProductCodePath(file) && /\.(ts|js|json|html|css|scss|md)$/.test(file)) {
    const text = fs.readFileSync(absoluteFile, 'utf8');
    if (/github\.com\/lorgan3\/sorcerers|lorgan3\/sorcerers/.test(text)) {
      errors.push(`${file}: product code must not depend on or import from Sorcerers.`);
    }
  }
}

if (errors.length > 0) {
  console.error('Import boundary compliance failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Import boundary compliance passed.');
