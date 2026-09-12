const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { validateB3cRuntimeInventory } = require('./check-b3c-runtime-inventory');

const repoRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(repoRoot, 'legal', 'asset-manifest.json');
const previewBundleByteCeiling = 1_900_000;

const expectedBackgroundBundle = Object.freeze([
  ['volcanic-ruin-volcanic-cone-flux2-owned-original-source-master-v1', 'assets/masters/environment/backgrounds/volcanic-ruin/volcanic-cone-source-master-v1.png', '83E451892C13730D2EA1DE5794927EC9CD63110567F110DC485D5ED148D041AD', 'assets/product/environment/backgrounds/volcanic-ruin/volcanic-cone-v1.png', 499991],
  ['volcanic-ruin-stone-tower-flux2-owned-original-source-master-v1', 'assets/masters/environment/backgrounds/volcanic-ruin/stone-tower-source-master-v1.png', '0810A4F5D3A3CCB72352F01AF61899BFAD7F4FC6EF9306164078F8C92FECBFA0', 'assets/product/environment/backgrounds/volcanic-ruin/stone-tower-v1.png', 290125],
  ['volcanic-ruin-distant-jungle-flux2-owned-original-source-master-v1', 'assets/masters/environment/backgrounds/volcanic-ruin/distant-jungle-source-master-v1.png', '5174F7E0108F3CA11157D5A436BC2438389AF2FA7205050E43D3E5F5E19A964A', 'assets/product/environment/backgrounds/volcanic-ruin/distant-jungle-v1.png', 362342],
  ['volcanic-ruin-palm-cluster-flux2-owned-original-source-master-v1', 'assets/masters/environment/backgrounds/volcanic-ruin/palm-cluster-source-master-v1.png', 'A9D0C91D5CFD6647654A89A0F1B81110D7FC4C4B3A5ABE395C0FB5B2D8E4E380', 'assets/product/environment/backgrounds/volcanic-ruin/palm-cluster-v1.png', 339339],
  ['volcanic-ruin-bush-cluster-flux2-owned-original-source-master-v1', 'assets/masters/environment/backgrounds/volcanic-ruin/bush-cluster-source-master-v1.png', 'D5EEE8F1A0B7A9B758321F5B429B0D2B9EAC5F7726A2031195628F0103AB69E2', 'assets/product/environment/backgrounds/volcanic-ruin/bush-cluster-v1.png', 343550]
].map(([id, file, sha256, runtime_path, bytes]) => ({ id, file, sha256, runtime_path, bytes })));

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase(); }
function backgroundBundleTotalBytes(bundle = expectedBackgroundBundle) { return bundle.reduce((total, item) => total + item.bytes, 0); }

function validateWp015d4fBackgroundBundle(document, root = repoRoot) {
  const errors = validateB3cRuntimeInventory(document, root);
  const assets = Array.isArray(document?.assets) ? document.assets : [];
  const expectedById = new Map(expectedBackgroundBundle.map((item) => [item.id, item]));
  const runtimeBackgrounds = assets.filter((asset) => expectedById.has(asset.id));
  if (runtimeBackgrounds.length !== expectedBackgroundBundle.length)
    errors.push(`expected exactly ${expectedBackgroundBundle.length} WP-015D4F preview background assets, found ${runtimeBackgrounds.length}.`);
  for (const expected of expectedBackgroundBundle) {
    const asset = assets.find((candidate) => candidate.id === expected.id);
    if (!asset) { errors.push(`${expected.id}: required preview bundle asset is missing.`); continue; }
    for (const field of ['file', 'sha256', 'runtime_path']) {
      if (asset[field] !== expected[field]) errors.push(`${expected.id}: ${field} must remain the approved WP-015D4F value.`);
    }
    if (asset.runtime_copy_admission !== 'WP-015D4H: byte-identical lazy volcanic-ruin bundle for standard Practice and explicit preview; no source transform, atlas, or image-derived gameplay authority.')
      errors.push(`${expected.id}: must retain the approved standard-Practice exact-copy admission.`);
    const source = path.resolve(root, asset.file || '');
    if (!source.startsWith(path.resolve(root, 'assets') + path.sep) || !fs.existsSync(source)) {
      errors.push(`${expected.id}: source must resolve inside assets/.`); continue;
    }
    const bytes = fs.readFileSync(source);
    if (bytes.length !== expected.bytes) errors.push(`${expected.id}: source bytes must remain ${expected.bytes}.`);
    if (sha256(bytes) !== expected.sha256) errors.push(`${expected.id}: source hash must remain the approved WP-015D4F value.`);
  }
  const total = backgroundBundleTotalBytes();
  if (total !== 1835347) errors.push(`WP-015D4F preview bundle total must remain 1835347 bytes, received ${total}.`);
  if (total > previewBundleByteCeiling) errors.push(`WP-015D4F preview bundle exceeds ${previewBundleByteCeiling} bytes.`);
  return errors;
}

function main() {
  const document = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const errors = validateWp015d4fBackgroundBundle(document);
  if (errors.length) { console.error('WP-015D4F background bundle check failed:'); for (const error of errors) console.error(`- ${error}`); process.exitCode = 1; return; }
  console.log(`WP-015D4F preview background bundle passed (${expectedBackgroundBundle.length} assets, ${backgroundBundleTotalBytes()} source bytes).`);
}
if (require.main === module) main();

module.exports = { expectedBackgroundBundle, previewBundleByteCeiling, backgroundBundleTotalBytes, validateWp015d4fBackgroundBundle };
