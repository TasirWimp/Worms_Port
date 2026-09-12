const fs = require('node:fs/promises');
const path = require('node:path');

const { KeyPair, PrivateKey } = require('@nimiq/core');

const repoRoot = path.resolve(__dirname, '..');

async function generatePeiProxyKey(outputPath, projectRoot = repoRoot) {
  if (!outputPath || !path.isAbsolute(outputPath)) {
    throw new Error('Provide one absolute output path outside the repository.');
  }
  const output = path.resolve(outputPath);
  const relative = path.relative(path.resolve(projectRoot), output);
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
    throw new Error('The PEI proxy key must be written outside the repository.');
  }
  const privateKey = PrivateKey.generate();
  const keyPair = KeyPair.derive(privateKey);
  const address = keyPair.toAddress();
  try {
    const handle = await fs.open(output, 'wx', 0o600);
    try {
      await handle.writeFile(`${privateKey.toHex()}\n`, 'utf8');
    } finally {
      await handle.close();
    }
    return {
      output,
      address: address.toUserFriendlyAddress()
    };
  } finally {
    address.free();
    keyPair.free();
    privateKey.free();
  }
}

async function main() {
  if (process.argv.length !== 3) {
    throw new Error('Usage: npm run pei:generate-proxy-key -- <absolute-output-path>');
  }
  const result = await generatePeiProxyKey(process.argv[2]);
  console.log(`PEI proxy address: ${result.address}`);
  console.log(`Private key written outside the repository: ${result.output}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { generatePeiProxyKey };
