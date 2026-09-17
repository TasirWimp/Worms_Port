const assert = require('node:assert/strict');
const test = require('node:test');
const { analyzeHousekeeping } = require('../../scripts/audit-housekeeping');
test('housekeeping audit separates current package, stale tracking, and failed-review reconciliation', () => {
  const report = analyzeHousekeeping({ currentBranch: 'codex/current', upstream: 'origin/codex/current', worktreeDirty: false, mergedBranches: ['codex/merged'], goneTrackingBranches: ['codex/gone'], evidence: [
    { id: 'WP-001', file: 'docs/evidence/one.json', branch: 'codex/current', status: 'in_progress', reviews: [] },
    { id: 'WP-002', file: 'docs/evidence/two.json', branch: 'codex/other', status: 'in_progress', reviews: [{ decision: 'fail', reviewer: 'astra' }] },
    { id: 'WP-003', file: 'docs/evidence/three.json', branch: 'codex/old', status: 'superseded', superseded_by: 'WP-004', reviews: [{ decision: 'fail', reviewer: 'historic-astra' }] }
  ] });
  assert.deepEqual(report.currentBranchPackages, [{ id: 'WP-001', file: 'docs/evidence/one.json', status: 'in_progress' }]);
  assert.deepEqual(report.supersededPackages, [{ id: 'WP-003', file: 'docs/evidence/three.json', branch: 'codex/old', superseded_by: 'WP-004' }]);
  assert.deepEqual(report.supersededFailedReviews, [{ id: 'WP-003', file: 'docs/evidence/three.json', branch: 'codex/old', reviewer: 'historic-astra' }]);
  assert.deepEqual(report.failedReviews, [{ id: 'WP-002', file: 'docs/evidence/two.json', branch: 'codex/other', reviewer: 'astra' }]);
  assert.equal(report.manualReconciliationRequired, true);
});
