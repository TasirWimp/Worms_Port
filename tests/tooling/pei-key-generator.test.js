const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { generatePeiProxyKey } = require('../../scripts/generate-pei-proxy-key');

test('PEI proxy key generation writes once outside the repository without printing a secret', async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'nimble-knots-project-'));
  const secrets = fs.mkdtempSync(path.join(os.tmpdir(), 'nimble-knots-secrets-'));
  const output = path.join(secrets, 'pei-proxy-key');
  try {
    await assert.rejects(
      generatePeiProxyKey(path.join(project, 'key'), project),
      /outside the repository/
    );
    const result = await generatePeiProxyKey(output, project);
    assert.match(result.address, /^NQ[0-9]{2}(?: [0-9A-HJ-NP-VXY]{4}){8}$/);
    assert.match(fs.readFileSync(output, 'utf8'), /^[a-f0-9]{64}\n$/);
    await assert.rejects(generatePeiProxyKey(output, project), /EEXIST/);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(secrets, { recursive: true, force: true });
  }
});
