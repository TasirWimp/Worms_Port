const assert = require('node:assert/strict');
const test = require('node:test');

const { validateEvidence } = require('../../scripts/check-work-package-evidence');

const hash = 'A'.repeat(64);
const base = {
  id: 'WP-999',
  status: 'in_progress',
  starting_commit: 'abcdef0',
  branch: 'codex/test',
  initial_worktree: 'clean',
  starting_lock_sha256: hash,
  owning_roles: ['test-role'],
  scope: ['bounded test'],
  non_goals: ['production behavior'],
  planned_checks: ['test command'],
  deterministic_seeds: [],
  sorcerers_reference_used: false,
  clean_room_records: []
};

test('work-package evidence enforces schema fields and clean-room linkage', () => {
  assert.deepEqual(validateEvidence([base], [], () => hash), []);
  assert.match(validateEvidence([{ ...base, unexpected: true }], [], () => hash).join('\n'), /unexpected field/);
  assert.match(validateEvidence([{ ...base, check_results: 'invalid' }], [], () => hash).join('\n'), /must be an array/);
  assert.match(validateEvidence([{ ...base, starting_lock_sha256: 'B'.repeat(64) }], [], () => hash).join('\n'), /hash mismatch/);

  const cleanRecord = { id: 'observed-behavior', work_package: 'WP-998' };
  const linked = { ...base, sorcerers_reference_used: true, clean_room_records: [cleanRecord.id] };
  assert.match(validateEvidence([linked], [cleanRecord], () => hash).join('\n'), /belongs to WP-998/);

  const observed = { id: 'observed-behavior', work_package: base.id, status: 'observed' };
  const observedLink = { ...base, sorcerers_reference_used: true, clean_room_records: [observed.id] };
  assert.deepEqual(validateEvidence([observedLink], [observed], () => hash), []);
  const completed = {
    ...observedLink,
    status: 'complete',
    check_results: [{ command: 'test command', status: 'pass' }],
    reviews: [{ role: 'reviewer-role', reviewer: 'reviewer-id', decision: 'pass' }],
    skipped_checks: [],
    residual_risks: []
  };
  assert.match(validateEvidence([completed], [observed], () => hash).join('\n'), /must be complete/);
});
