const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'legal', 'asset-manifest.json');
const licensesPath = path.join(root, 'legal', 'allowed-licenses.json');
const productAssetRoot = path.join(root, 'assets');
const ignoredPlaceholderNames = new Set(['README.md', '.gitkeep']);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function toRepoPath(file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(absolute));
    } else {
      files.push(absolute);
    }
  }

  return files;
}

function isUrl(value) {
  return typeof value === 'string' && /^https?:\/\//.test(value);
}

const manifest = readJson(manifestPath);
const licensePolicy = readJson(licensesPath);
const approvedLicenses = new Set(licensePolicy.approved_for_product_assets);
const blockedLicenses = new Set(licensePolicy.blocked_for_product_assets);
const errors = [];

if (!Array.isArray(manifest.assets)) {
  errors.push('legal/asset-manifest.json must contain an assets array.');
}

const manifestAssets = Array.isArray(manifest.assets) ? manifest.assets : [];
const byFile = new Map();
const ids = new Set();

const requiredFields = [
  'id',
  'file',
  'sha256',
  'origin_repo',
  'original_source_url',
  'author',
  'license',
  'commercial_use_allowed',
  'redistribution_allowed',
  'modification_allowed',
  'attribution_required',
  'share_alike',
  'no_technical_restrictions',
  'evidence_url',
  'checked_date',
  'decision',
  'notes'
];

for (const asset of manifestAssets) {
  for (const field of requiredFields) {
    if (!(field in asset)) {
      errors.push(`${asset.id || '<missing id>'}: missing required field "${field}".`);
    }
  }

  if (ids.has(asset.id)) {
    errors.push(`${asset.id}: duplicate asset id.`);
  }
  ids.add(asset.id);

  if (typeof asset.file !== 'string' || !asset.file.startsWith('assets/')) {
    errors.push(`${asset.id}: file must be under assets/.`);
  } else {
    const absoluteFile = path.resolve(root, asset.file);
    if (!absoluteFile.startsWith(productAssetRoot + path.sep)) {
      errors.push(`${asset.id}: file resolves outside assets/.`);
    }
    if (!fs.existsSync(absoluteFile)) {
      errors.push(`${asset.id}: listed file does not exist: ${asset.file}`);
    } else if (!fs.lstatSync(absoluteFile).isFile()) {
      errors.push(`${asset.id}: product assets must be regular files, not links or directories.`);
    } else {
      const actualHash = crypto.createHash('sha256').update(fs.readFileSync(absoluteFile)).digest('hex').toUpperCase();
      if (!/^[0-9A-F]{64}$/.test(asset.sha256 || '') || actualHash !== asset.sha256) {
        errors.push(`${asset.id}: sha256 does not match the exact product asset bytes.`);
      }
    }
    if (byFile.has(asset.file)) {
      errors.push(`${asset.id}: duplicate manifest file entry: ${asset.file}`);
    }
    byFile.set(asset.file, asset);
  }

  if (asset.decision !== 'approved') {
    errors.push(`${asset.id}: decision must be "approved".`);
  }
  if (blockedLicenses.has(asset.license)) {
    errors.push(`${asset.id}: blocked license ${asset.license}.`);
  }
  if (!approvedLicenses.has(asset.license)) {
    errors.push(`${asset.id}: license ${asset.license} is not approved for product assets.`);
  }
  if (asset.commercial_use_allowed !== true) {
    errors.push(`${asset.id}: commercial_use_allowed must be true.`);
  }
  if (asset.redistribution_allowed !== true) {
    errors.push(`${asset.id}: redistribution_allowed must be true.`);
  }
  if (asset.modification_allowed !== true) {
    errors.push(`${asset.id}: modification_allowed must be true.`);
  }
  if (asset.share_alike !== false) {
    errors.push(`${asset.id}: share_alike must be false for product assets.`);
  }
  if (asset.no_technical_restrictions !== false) {
    errors.push(`${asset.id}: no_technical_restrictions must be false.`);
  }
  if (!isUrl(asset.original_source_url)) {
    errors.push(`${asset.id}: original_source_url must be an http(s) URL.`);
  }
  if (!isUrl(asset.evidence_url)) {
    errors.push(`${asset.id}: evidence_url must be an http(s) URL.`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asset.checked_date || '')) {
    errors.push(`${asset.id}: checked_date must be YYYY-MM-DD.`);
  }
  if (asset.attribution_required === true && !asset.attribution_text) {
    errors.push(`${asset.id}: attribution_text is required when attribution_required is true.`);
  }
  if (asset.runtime_path !== undefined && (
    typeof asset.runtime_path !== 'string' ||
    !asset.runtime_path.startsWith('assets/product/') ||
    asset.runtime_path.includes('..')
  )) {
    errors.push(`${asset.id}: runtime_path must stay under assets/product/.`);
  }
}

for (const absoluteFile of listFiles(productAssetRoot)) {
  const repoPath = toRepoPath(absoluteFile);
  const basename = path.basename(repoPath);
  if (ignoredPlaceholderNames.has(basename)) {
    continue;
  }
  if (!byFile.has(repoPath)) {
    errors.push(`${repoPath}: product asset has no approved manifest entry.`);
  }
}

if (errors.length > 0) {
  console.error('Asset manifest compliance failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Asset manifest compliance passed.');
