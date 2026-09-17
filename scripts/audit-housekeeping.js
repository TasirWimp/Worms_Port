const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const repoRoot = path.resolve(__dirname, '..');
function command(args) { try { return childProcess.execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } }
function readEvidence() { const directory = path.join(repoRoot, 'docs', 'evidence'); return fs.readdirSync(directory).flatMap((file) => { if (!file.endsWith('.json')) return []; try { const record = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')); return record.id && record.branch ? [{ file: `docs/evidence/${file}`, ...record }] : []; } catch { return []; } }); }
function analyzeHousekeeping({ currentBranch, upstream, worktreeDirty, mergedBranches, goneTrackingBranches, evidence }) {
  const inProgress = evidence.filter((record) => record.status === 'in_progress');
  const superseded = evidence.filter((record) => record.status === 'superseded');
  const supersededPackages = superseded.map(({ id, file, branch, superseded_by }) => ({ id, file, branch, superseded_by }));
  const supersededFailedReviews = superseded.flatMap((record) => (record.reviews || []).filter((review) => review.decision === 'fail').map((review) => ({ id: record.id, file: record.file, branch: record.branch, reviewer: review.reviewer })));
  const failedReviews = inProgress.flatMap((record) => (record.reviews || []).filter((review) => review.decision === 'fail').map((review) => ({ id: record.id, file: record.file, branch: record.branch, reviewer: review.reviewer })));
  return { currentBranch, upstream, worktreeDirty, mergedBranches, goneTrackingBranches,
    currentBranchPackages: inProgress.filter((record) => record.branch === currentBranch).map(({ id, file, status }) => ({ id, file, status })),
    otherInProgressPackages: inProgress.filter((record) => record.branch !== currentBranch).map(({ id, file, branch, status }) => ({ id, file, branch, status })),
    supersededPackages, supersededFailedReviews, failedReviews, manualReconciliationRequired: failedReviews.length > 0 || goneTrackingBranches.length > 0 };
}
function main() {
  const currentBranch = command(['branch', '--show-current']) || '(detached)';
  const upstream = command(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
  const mergedBranches = (command(['branch', '--format=%(refname:short)', '--merged', 'main']) || '').split(/\r?\n/).filter((branch) => branch && branch !== 'main' && branch !== currentBranch);
  const tracking = command(['for-each-ref', '--format=%(refname:short)|%(upstream:track)', 'refs/heads']) || '';
  const goneTrackingBranches = tracking.split(/\r?\n/).flatMap((line) => { const [branch, state] = line.split('|'); return state === '[gone]' ? [branch] : []; });
  console.log(JSON.stringify(analyzeHousekeeping({ currentBranch, upstream, worktreeDirty: Boolean(command(['status', '--porcelain'])), mergedBranches, goneTrackingBranches, evidence: readEvidence() }), null, 2));
  console.log('Housekeeping audit is report-only: reconcile findings in planning/evidence; do not rename, delete, merge, or push automatically.');
}
if (require.main === module) main();
module.exports = { analyzeHousekeeping };
