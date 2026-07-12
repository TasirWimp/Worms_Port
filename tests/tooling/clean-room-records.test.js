const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { sourceCommit, validateRecords } = require('../../scripts/check-clean-room-records');

test('clean-room records fail closed on hash and role-separation errors', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nimble-knots-clean-room-'));
  const behaviorPath = path.join(root, 'behavior.md');
  const behavior = 'Observable input and output only.\n';
  fs.writeFileSync(behaviorPath, behavior);

  const valid = {
    id: 'bounded-observation',
    work_package: 'WP-999',
    source_commit: sourceCommit,
    observed_material: ['visible running behavior'],
    behavior_record: 'behavior.md',
    behavior_record_sha256: crypto.createHash('sha256').update(behavior).digest('hex').toUpperCase(),
    observer: 'observer-role',
    status: 'complete',
    implementer: 'implementer-role',
    reviewer: 'reviewer-role',
    implementation_declaration: 'Used only the frozen record and approved sources.',
    similarity_review: 'pass',
    behavioral_tests: ['bounded behavior test']
  };

  try {
    assert.deepEqual(validateRecords([valid], root), []);
    const observed = {
      id: valid.id,
      work_package: valid.work_package,
      source_commit: valid.source_commit,
      observed_material: valid.observed_material,
      behavior_record: valid.behavior_record,
      behavior_record_sha256: valid.behavior_record_sha256,
      observer: valid.observer,
      status: 'observed'
    };
    assert.deepEqual(validateRecords([observed], root), []);
    assert.match(
      validateRecords([{ ...observed, implementer: 123, similarity_review: 'invalid' }], root).join('\n'),
      /observed records must not include/
    );
    assert.match(validateRecords([{ ...valid, behavior_record_sha256: '0'.repeat(64) }], root).join('\n'), /hash mismatch/);
    assert.match(validateRecords([{ ...valid, reviewer: valid.implementer }], root).join('\n'), /separate identities/);
    assert.match(validateRecords([{ ...valid, id: 'Invalid_ID' }], root).join('\n'), /invalid id/);
    assert.match(validateRecords([{ ...valid, unexpected: true }], root).join('\n'), /unexpected field/);
    assert.match(validateRecords([{ ...valid, behavioral_tests: [] }], root).join('\n'), /must be non-empty/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
