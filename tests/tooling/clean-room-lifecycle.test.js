const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { sourceCommit, validateRecords } = require('../../scripts/check-clean-room-records');
const { validateEvidence } = require('../../scripts/check-work-package-evidence');

test('clean-room observation and work-package completion advance together', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nimble-knots-lifecycle-'));
  const behavior = 'Frozen observable behavior.\n';
  fs.writeFileSync(path.join(root, 'behavior.md'), behavior);

  const observed = {
    id: 'lifecycle-observation',
    work_package: 'WP-999D2Z',
    source_commit: sourceCommit,
    observed_material: ['visible behavior'],
    behavior_record: 'behavior.md',
    behavior_record_sha256: crypto.createHash('sha256').update(behavior).digest('hex').toUpperCase(),
    observer: 'observer-role',
    status: 'observed'
  };
  const inProgress = {
    id: 'WP-999D2Z',
    status: 'in_progress',
    starting_commit: 'abcdef0',
    branch: 'codex/test',
    initial_worktree: 'clean',
    starting_lock_sha256: 'A'.repeat(64),
    owning_roles: ['implementer-role'],
    scope: ['bounded behavior'],
    non_goals: ['unrelated behavior'],
    planned_checks: ['behavior test'],
    deterministic_seeds: [],
    sorcerers_reference_used: true,
    clean_room_records: [observed.id]
  };
  const completeEvidence = {
    ...inProgress,
    status: 'complete',
    check_results: [{ command: 'behavior test', status: 'pass' }],
    reviews: [{ role: 'reviewer-role', reviewer: 'reviewer-id', decision: 'pass' }],
    skipped_checks: [],
    residual_risks: []
  };
  const completeRecord = {
    ...observed,
    status: 'complete',
    implementer: 'implementer-role',
    reviewer: 'reviewer-role',
    implementation_declaration: 'Used only the frozen record and approved sources.',
    similarity_review: 'pass',
    behavioral_tests: ['behavior test']
  };

  try {
    assert.deepEqual(validateRecords([observed], root), []);
    assert.deepEqual(validateEvidence([inProgress], [observed], () => 'A'.repeat(64)), []);
    assert.match(validateEvidence([completeEvidence], [observed], () => 'A'.repeat(64)).join('\n'), /must be complete/);
    assert.deepEqual(validateRecords([completeRecord], root), []);
    assert.deepEqual(validateEvidence([completeEvidence], [completeRecord], () => 'A'.repeat(64)), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
