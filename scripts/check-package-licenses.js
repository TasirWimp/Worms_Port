const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const lockPath = path.join(root, 'package-lock.json');
const assetPolicyPath = path.join(root, 'legal', 'allowed-licenses.json');
const overridesPath = path.join(root, 'legal', 'dependency-license-overrides.json');

const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const assetPolicy = JSON.parse(fs.readFileSync(assetPolicyPath, 'utf8'));
const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8')).packages || {};

const allowedLicenses = new Set([
  ...assetPolicy.approved_for_product_assets,
  '0BSD',
  'BlueOak-1.0.0'
]);
const blockedLicenses = new Set([
  ...assetPolicy.blocked_for_product_assets,
  'UNLICENSED'
]);
const expressionOperators = new Set(['AND', 'OR', 'WITH']);
const errors = [];

function packageNameFromLockPath(lockPackagePath) {
  const parts = lockPackagePath.split('/');
  const nodeModulesIndex = parts.lastIndexOf('node_modules');
  const packageParts = parts.slice(nodeModulesIndex + 1);

  if (packageParts[0] && packageParts[0].startsWith('@')) {
    return packageParts.slice(0, 2).join('/');
  }

  return packageParts[0];
}

function normalizeLicenseValue(value) {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeLicenseValue(entry))
      .filter(Boolean)
      .join(' OR ');
  }

  if (value && typeof value === 'object') {
    return value.type || value.license || '';
  }

  return '';
}

function licenseFromInstalledManifest(lockPackagePath) {
  const manifestPath = path.join(root, lockPackagePath, 'package.json');
  if (!fs.existsSync(manifestPath)) {
    return '';
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return normalizeLicenseValue(manifest.license || manifest.licenses);
}

function validateLicense(packageName, license) {
  if (!license) {
    errors.push(`${packageName}: missing license metadata.`);
    return;
  }

  const tokens = license.match(/[A-Za-z0-9.+-]+/g) || [];
  const blocked = tokens.filter((token) => blockedLicenses.has(token));
  const unknown = tokens.filter((token) =>
    !expressionOperators.has(token) &&
    !allowedLicenses.has(token)
  );

  if (blocked.length > 0) {
    errors.push(`${packageName}: blocked license expression "${license}".`);
  }

  if (unknown.length > 0) {
    errors.push(`${packageName}: unapproved license expression "${license}".`);
  }

}

for (const [lockPackagePath, packageRecord] of Object.entries(lock.packages || {})) {
  if (!lockPackagePath || !lockPackagePath.includes('node_modules/')) {
    continue;
  }

  const packageName = packageNameFromLockPath(lockPackagePath);
  const override = overrides[packageName];
  const license = normalizeLicenseValue(
    packageRecord.license ||
    (override && override.license) ||
    licenseFromInstalledManifest(lockPackagePath)
  );

  validateLicense(packageName, license);
}

if (errors.length > 0) {
  console.error('Package license compliance failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Package license compliance passed.');
