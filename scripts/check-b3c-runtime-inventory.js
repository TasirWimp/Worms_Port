const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(repoRoot, 'legal', 'asset-manifest.json');
const initialMediaByteCeiling = 1_500_000;

const expectedRuntimeInventory = Object.freeze([
  {
    id: 'knotkin-wizard-loomseed-presentation-owned-original-master-v1',
    file: 'assets/masters/characters/knotkin/wizard/knotkin-wizard-loomseed-presentation-master-v1.png',
    sha256: '1CC252B45C93D2553AC733DAA6AA49D05D6351DCC85E61EA559ECED458C9419C',
    runtime_path: 'assets/product/characters/knotkin/wizard/knotkin-wizard-loomseed-v1.png',
    bytes: 196974
  },
  {
    id: 'knotkin-wizard-autosprite-idle-owned-original-master-v1',
    file: 'assets/masters/characters/knotkin/wizard/animation/knotkin-wizard-autosprite-idle-master-v1.png',
    sha256: '0CC0EF8ECED7B3BC24ED1AA678F164BFBB28554E8EC8E58745472F07EB447471',
    runtime_path: 'assets/product/characters/knotkin/wizard/animation/idle-v1.png',
    bytes: 156855
  },
  {
    id: 'knotkin-wizard-autosprite-walk-owned-original-master-v1',
    file: 'assets/masters/characters/knotkin/wizard/animation/knotkin-wizard-autosprite-walk-master-v1.png',
    sha256: '5FD4FCE8129D17D45D6EACD0434D8C823400398D79D2DF780924D7C60B0C00B7',
    runtime_path: 'assets/product/characters/knotkin/wizard/animation/walk-v1.png',
    bytes: 202558
  },
  {
    id: 'knotkin-wizard-autosprite-loomseed-spell-owned-original-master-v1',
    file: 'assets/masters/characters/knotkin/wizard/animation/knotkin-wizard-autosprite-loomseed-spell-master-v1.png',
    sha256: '0205356C56A51EA289B1BD4F911658EBD4BA4DE090F1664F1B8DF8ACE0C5A0F4',
    runtime_path: 'assets/product/characters/knotkin/wizard/animation/loomseed-spell-v1.png',
    bytes: 182204
  },
  {
    id: 'knotkin-wizard-autosprite-unravel-owned-original-master-v1',
    file: 'assets/masters/characters/knotkin/wizard/animation/knotkin-wizard-autosprite-unravel-master-v1.png',
    sha256: 'BED622A33F7308C498661862F81351A5D1698F2BD52A6D803D3EAC5999D88F1D',
    runtime_path: 'assets/product/characters/knotkin/wizard/animation/unravel-v1.png',
    bytes: 253535
  },
  {
    id: 'relic-threadball-cast-formation-start-presentation-owned-original-master-v1',
    file: 'assets/masters/relics/threadball/relic-threadball-cast-formation-start-presentation-master-v1.png',
    sha256: 'C189A2060BE92DFAE75B8FDDB2F6038DBB209808B764197C9F93473A8908FDD0',
    runtime_path: 'assets/product/relics/threadball/cast/formation-start-v1.png',
    bytes: 1074
  },
  {
    id: 'relic-threadball-cast-formation-ready-presentation-owned-original-master-v1',
    file: 'assets/masters/relics/threadball/relic-threadball-cast-formation-ready-presentation-master-v1.png',
    sha256: '94F0DEDC5ABCA6FF8E65B3F0CFA5EDC48ED869D382CD322CF90BAA492A3BCCA9',
    runtime_path: 'assets/product/relics/threadball/cast/formation-ready-v1.png',
    bytes: 2546
  },
  {
    id: 'relic-threadball-cast-projectile-presentation-owned-original-master-v1',
    file: 'assets/masters/relics/threadball/relic-threadball-cast-projectile-presentation-master-v1.png',
    sha256: '8ECA37C67C06B2A0C6D8E866FE2FE3E18E40E9F22E557CDEBF8F5470E95123E9',
    runtime_path: 'assets/product/relics/threadball/cast/projectile-v1.png',
    bytes: 1350
  },
  {
    id: 'patch-01-cloud-flux2-owned-original-source-master-v1',
    file: 'assets/masters/environment/patch-01/clouds/patch-01-cloud-source-master-v1.png',
    sha256: '7F327B515FBF89F7DD275C4385FA194AE3F95E677C60BE10126CA68D9024B23C',
    runtime_path: 'assets/product/environment/patch-01/clouds/cloud-v1.png',
    bytes: 211751
  },
  {
    id: 'patch-01-terrain-top-flux2-owned-original-source-master-v1',
    file: 'assets/masters/environment/patch-01/terrain/patch-01-terrain-top-source-master-v1.png',
    sha256: '41511E63D0DBF602FCA854EB983DB9B754631587F6E5234CBB9DAF9113E77897',
    runtime_path: 'assets/product/environment/patch-01/terrain/top-v1.png',
    bytes: 41834
  },
  {
    id: 'patch-01-terrain-interior-owner-manual-repair-source-master-v1',
    file: 'assets/masters/environment/patch-01/terrain/patch-01-terrain-interior-source-master-v1.png',
    sha256: 'D50C2C60A9941DEF0CD9E1C3C98A205A329CCFEC8766F3B1B70456728E2E40E9',
    runtime_path: 'assets/product/environment/patch-01/terrain/interior-v1.png',
    bytes: 151898
  }
]);

// WP-015D4F is the only successor that may coexist with this frozen initial
// inventory. Its own guard verifies paths, hashes, byte budget and admission.
const registeredSuccessorRuntimeIds = new Set([
  'volcanic-ruin-volcanic-cone-flux2-owned-original-source-master-v1',
  'volcanic-ruin-stone-tower-flux2-owned-original-source-master-v1',
  'volcanic-ruin-distant-jungle-flux2-owned-original-source-master-v1',
  'volcanic-ruin-palm-cluster-flux2-owned-original-source-master-v1',
  'volcanic-ruin-bush-cluster-flux2-owned-original-source-master-v1'
]);

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

function inventoryTotalBytes(inventory = expectedRuntimeInventory) {
  return inventory.reduce((total, item) => total + item.bytes, 0);
}

function validateB3cRuntimeInventory(document, root = repoRoot) {
  const errors = [];
  const assets = Array.isArray(document?.assets) ? document.assets : [];
  const runtimeAssets = assets.filter((asset) => asset.runtime_path);
  const b3cRuntimeAssets = runtimeAssets.filter((asset) => !registeredSuccessorRuntimeIds.has(asset.id));
  const expectedById = new Map(expectedRuntimeInventory.map((item) => [item.id, item]));

  if (b3cRuntimeAssets.length !== expectedRuntimeInventory.length) {
    errors.push(`expected exactly ${expectedRuntimeInventory.length} approved WP-015C runtime assets, found ${b3cRuntimeAssets.length}.`);
  }

  for (const asset of b3cRuntimeAssets) {
    const expected = expectedById.get(asset.id);
    if (!expected) {
      errors.push(`${asset.id}: unexpected runtime asset is blocked.`);
      continue;
    }
    for (const field of ['file', 'sha256', 'runtime_path']) {
      if (asset[field] !== expected[field]) {
        errors.push(`${asset.id}: ${field} must remain the approved WP-015C value.`);
      }
    }
    if (asset.file.startsWith('assets/product/')) {
      errors.push(`${asset.id}: runtime admission must not add a duplicate source under assets/product/.`);
    }
    const sourcePath = path.resolve(root, asset.file || '');
    if (!sourcePath.startsWith(path.resolve(root, 'assets') + path.sep) || !fs.existsSync(sourcePath)) {
      errors.push(`${asset.id}: approved source must resolve inside assets/.`);
      continue;
    }
    const sourceBytes = fs.readFileSync(sourcePath);
    if (sourceBytes.length !== expected.bytes) {
      errors.push(`${asset.id}: source byte size must remain ${expected.bytes}.`);
    }
    if (sha256(sourceBytes) !== expected.sha256) {
      errors.push(`${asset.id}: source hash must remain the frozen B3C.1 value.`);
    }
  }

  for (const expected of expectedRuntimeInventory) {
    const asset = b3cRuntimeAssets.find((candidate) => candidate.id === expected.id);
    if (!asset) errors.push(`${expected.id}: required approved WP-015C runtime asset is missing.`);
  }

  const totalBytes = inventoryTotalBytes();
  if (totalBytes !== 1402579) {
    errors.push(`WP-015C runtime source total must remain 1402579 bytes, received ${totalBytes}.`);
  }
  if (totalBytes > initialMediaByteCeiling) {
    errors.push(`WP-015C runtime source total exceeds ${initialMediaByteCeiling} bytes.`);
  }

  return errors;
}

function main() {
  const document = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const errors = validateB3cRuntimeInventory(document);
  if (errors.length > 0) {
    console.error('WP-015C runtime inventory check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`WP-015C runtime inventory passed (${expectedRuntimeInventory.length} assets, ${inventoryTotalBytes()} source bytes).`);
}

if (require.main === module) main();

module.exports = {
  expectedRuntimeInventory,
  initialMediaByteCeiling,
  inventoryTotalBytes,
  validateB3cRuntimeInventory,
  registeredSuccessorRuntimeIds
};
