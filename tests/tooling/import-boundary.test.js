const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const probe = path.join(root, 'client', 'src', `.import-boundary-probe-${process.pid}.ts`);
const scriptProbe = path.join(root, 'scripts', `.import-boundary-probe-${process.pid}.mjs`);
const blockedRepository = ['lorgan3', 'sorcerers'].join('/');
const assetQuarantine = 'assets' + '-quarantine';
const blockedQuarantine = [assetQuarantine, 'sorcerers', 'raw'].join('/');
const blockedWindowsQuarantine = [assetQuarantine, 'sorcerers', 'raw'].join('\\');
const blockedPrivateQuarantine = '.' + 'quarantine';

function runGate() {
  return childProcess.spawnSync(process.execPath, ['scripts/check-import-boundary.js'], {
    cwd: root,
    encoding: 'utf8'
  });
}

test('import gate scans untracked implementation files and case variants', () => {
  try {
    fs.writeFileSync(probe, 'export const safeProbe = true;\n');
    assert.equal(runGate().status, 0);

    fs.writeFileSync(probe, `export const blocked = ${JSON.stringify(blockedRepository)};\n`);
    const blocked = runGate();
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /product code must not depend/i);

    fs.writeFileSync(probe, `export const blocked = ${JSON.stringify(blockedRepository.toUpperCase())};\n`);
    assert.notEqual(runGate().status, 0);

    fs.rmSync(probe, { force: true });
    fs.writeFileSync(scriptProbe, `export const blocked = ${JSON.stringify(blockedRepository)};\n`);
    assert.notEqual(runGate().status, 0);

    fs.writeFileSync(scriptProbe, `export const blocked = ${JSON.stringify(blockedQuarantine)};\n`);
    assert.notEqual(runGate().status, 0);

    fs.writeFileSync(scriptProbe, `export const blocked = ${JSON.stringify(blockedWindowsQuarantine)};\n`);
    assert.notEqual(runGate().status, 0);

    fs.writeFileSync(scriptProbe, `export const blocked = ${JSON.stringify(blockedPrivateQuarantine)};\n`);
    assert.notEqual(runGate().status, 0);
  } finally {
    fs.rmSync(probe, { force: true });
    fs.rmSync(scriptProbe, { force: true });
  }
});
