const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function parseOptions(argv) {
  const options = {
    manifest: path.join(repoRoot, 'legal', 'asset-manifest.json'),
    assetRoot: path.join(repoRoot, 'assets'),
    buildRoot: path.join(repoRoot, 'client', 'build')
  };

  for (let index = 0; index < argv.length; index += 2) {
    const value = argv[index + 1];
    if (!value) {
      throw new Error(`Missing value for ${argv[index]}.`);
    }
    if (argv[index] === '--manifest') options.manifest = path.resolve(value);
    else if (argv[index] === '--asset-root') options.assetRoot = path.resolve(value);
    else if (argv[index] === '--build-root') options.buildRoot = path.resolve(value);
    else throw new Error(`Unknown option ${argv[index]}.`);
  }

  return options;
}

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function copyApprovedAssets({ manifest, assetRoot, buildRoot }) {
  const document = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  const runtimeAssets = (document.assets || []).filter((asset) => asset.runtime_path);
  const seenDestinations = new Set();
  const copied = [];

  for (const asset of runtimeAssets) {
    if (asset.decision !== 'approved') {
      throw new Error(`${asset.id}: runtime assets must have an approved decision.`);
    }
    if (!asset.runtime_path.startsWith('assets/product/')) {
      throw new Error(`${asset.id}: runtime_path must start with assets/product/.`);
    }
    if (typeof asset.file !== 'string' || !asset.file.startsWith('assets/')) {
      throw new Error(`${asset.id}: source must be declared below assets/.`);
    }

    const expectedAssetRoot = path.resolve(assetRoot);
    const source = path.resolve(expectedAssetRoot, asset.file.slice('assets/'.length));
    const destination = path.resolve(buildRoot, asset.runtime_path);
    const expectedBuildRoot = path.resolve(buildRoot);

    if (!inside(expectedAssetRoot, source)) {
      throw new Error(`${asset.id}: source resolves outside the approved asset root.`);
    }
    if (!inside(expectedBuildRoot, destination)) {
      throw new Error(`${asset.id}: runtime_path resolves outside the client build.`);
    }
    if (seenDestinations.has(destination)) {
      throw new Error(`${asset.id}: duplicate runtime destination ${asset.runtime_path}.`);
    }
    if (!fs.existsSync(source)) {
      throw new Error(`${asset.id}: approved source does not exist: ${asset.file}.`);
    }
    if (!fs.lstatSync(source).isFile() || !inside(expectedAssetRoot, fs.realpathSync(source))) {
      throw new Error(`${asset.id}: approved source must be a regular file inside assets/.`);
    }

    const sourceHash = sha256(source);
    if (sourceHash.toUpperCase() !== asset.sha256) {
      throw new Error(`${asset.id}: source hash does not match the approved manifest hash.`);
    }

    seenDestinations.add(destination);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);

    const destinationHash = sha256(destination);
    if (sourceHash !== destinationHash) {
      throw new Error(`${asset.id}: copied asset hash does not match its approved source.`);
    }

    copied.push({
      id: asset.id,
      source: asset.file,
      runtime_path: `/${asset.runtime_path}`,
      sha256: sourceHash
    });
  }

  const outputManifest = path.join(buildRoot, 'assets', 'approved-assets.json');
  fs.mkdirSync(path.dirname(outputManifest), { recursive: true });
  fs.writeFileSync(outputManifest, `${JSON.stringify({ assets: copied }, null, 2)}\n`);
  return copied;
}

if (require.main === module) {
  try {
    const copied = copyApprovedAssets(parseOptions(process.argv.slice(2)));
    console.log(`Approved asset build path verified; copied ${copied.length} runtime asset(s).`);
  } catch (error) {
    console.error(`Approved asset copy failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { copyApprovedAssets };
