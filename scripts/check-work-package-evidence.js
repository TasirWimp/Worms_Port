const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const allowedFields = new Set([
  'id', 'status', 'starting_commit', 'branch', 'initial_worktree',
  'starting_lock_sha256', 'owning_roles', 'scope', 'non_goals',
  'planned_checks', 'deterministic_seeds', 'sorcerers_reference_used',
  'clean_room_records', 'check_results', 'reviews', 'skipped_checks',
  'residual_risks'
]);

function canonicalLockHash(commit, root = repoRoot) {
  if (!/^[0-9a-f]{7,40}$/.test(commit || '')) return null;
  try {
    childProcess.execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], {
      cwd: root,
      stdio: 'ignore'
    });
    const bytes = childProcess.execFileSync('git', ['show', `${commit}:package-lock.json`], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    return crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
  } catch (error) {
    return null;
  }
}

function validateEvidence(records, cleanRoomRecords, resolveLockHash = canonicalLockHash) {
  const errors = [];
  const ids = new Set();
  const cleanRoomById = new Map(cleanRoomRecords.map((record) => [record.id, record]));

  for (const evidence of records) {
    const label = evidence.id || '<missing id>';
    const requiredStrings = ['id', 'status', 'starting_commit', 'branch', 'initial_worktree', 'starting_lock_sha256'];
    const requiredArrays = ['owning_roles', 'scope', 'non_goals', 'planned_checks', 'deterministic_seeds', 'clean_room_records'];

    for (const field of Object.keys(evidence)) {
      if (!allowedFields.has(field)) errors.push(`${label}: unexpected field ${field}.`);
    }
    for (const field of requiredStrings) {
      if (typeof evidence[field] !== 'string' || !evidence[field]) errors.push(`${label}: missing ${field}.`);
    }
    for (const field of requiredArrays) {
      if (!Array.isArray(evidence[field])) errors.push(`${label}: ${field} must be an array.`);
      else if (evidence[field].some((item) => typeof item !== 'string')) errors.push(`${label}: ${field} must contain strings.`);
    }
    for (const field of ['check_results', 'reviews', 'skipped_checks', 'residual_risks']) {
      if (evidence[field] !== undefined && !Array.isArray(evidence[field])) {
        errors.push(`${label}: ${field} must be an array when present.`);
      }
    }
    for (const field of ['owning_roles', 'scope', 'non_goals', 'planned_checks']) {
      if (Array.isArray(evidence[field]) && evidence[field].length === 0) errors.push(`${label}: ${field} must be non-empty.`);
    }

    if (ids.has(evidence.id)) errors.push(`${label}: duplicate work-package id.`);
    ids.add(evidence.id);
    if (!/^WP-\d{3}$/.test(evidence.id || '')) errors.push(`${label}: invalid work-package id.`);
    if (!['in_progress', 'complete', 'blocked'].includes(evidence.status)) errors.push(`${label}: invalid status.`);
    if (!/^[0-9a-f]{7,40}$/.test(evidence.starting_commit || '')) errors.push(`${label}: invalid starting_commit.`);
    if (!['clean', 'dirty-preserved'].includes(evidence.initial_worktree)) errors.push(`${label}: invalid initial_worktree.`);
    if (!/^[0-9A-F]{64}$/.test(evidence.starting_lock_sha256 || '')) errors.push(`${label}: invalid lock hash.`);

    const actualLockHash = resolveLockHash(evidence.starting_commit);
    if (!actualLockHash) errors.push(`${label}: starting commit or package-lock.json cannot be resolved.`);
    else if (actualLockHash !== evidence.starting_lock_sha256) errors.push(`${label}: starting lock hash mismatch.`);

    if (typeof evidence.sorcerers_reference_used !== 'boolean') {
      errors.push(`${label}: sorcerers_reference_used must be explicit.`);
    }
    if (evidence.sorcerers_reference_used && evidence.clean_room_records?.length === 0) {
      errors.push(`${label}: reference use requires a clean-room record.`);
    }
    if (!evidence.sorcerers_reference_used && evidence.clean_room_records?.length > 0) {
      errors.push(`${label}: clean-room links require explicit reference use.`);
    }
    for (const recordId of evidence.clean_room_records || []) {
      const cleanRecord = cleanRoomById.get(recordId);
      if (!cleanRecord) errors.push(`${label}: unknown clean-room record ${recordId}.`);
      else if (cleanRecord.work_package !== evidence.id) {
        errors.push(`${label}: clean-room record ${recordId} belongs to ${cleanRecord.work_package}.`);
      } else if (evidence.status === 'complete' && cleanRecord.status !== 'complete') {
        errors.push(`${label}: clean-room record ${recordId} must be complete.`);
      }
    }

    if (evidence.status === 'complete') {
      for (const field of ['check_results', 'reviews', 'skipped_checks', 'residual_risks']) {
        if (!Array.isArray(evidence[field])) errors.push(`${label}: completed evidence requires ${field}.`);
      }
      const checkResults = Array.isArray(evidence.check_results) ? evidence.check_results : [];
      const resultCommands = new Set(checkResults.map((result) => result.command));
      if (checkResults.length !== evidence.planned_checks?.length ||
          checkResults.some((result) => typeof result.command !== 'string' || result.status !== 'pass') ||
          evidence.planned_checks?.some((command) => !resultCommands.has(command))) {
        errors.push(`${label}: completed evidence requires one passing result for every planned check.`);
      }
      const reviews = Array.isArray(evidence.reviews) ? evidence.reviews : [];
      if (reviews.length === 0 || reviews.some((review) =>
        typeof review.role !== 'string' || typeof review.reviewer !== 'string' || review.decision !== 'pass'
      )) {
        errors.push(`${label}: completed evidence requires identified passing reviews.`);
      }
    }
  }

  for (const cleanRecord of cleanRoomRecords) {
    const evidence = records.find((record) => record.id === cleanRecord.work_package);
    if (!evidence || !evidence.clean_room_records?.includes(cleanRecord.id)) {
      errors.push(`${cleanRecord.id}: clean-room record lacks a reverse work-package link.`);
    }
  }

  return errors;
}

function main() {
  const evidenceRoot = path.join(repoRoot, 'docs', 'evidence');
  const files = fs.readdirSync(evidenceRoot).filter((file) => file.endsWith('.json'));
  const records = files.map((file) => JSON.parse(fs.readFileSync(path.join(evidenceRoot, file), 'utf8')));
  const cleanRoom = JSON.parse(fs.readFileSync(path.join(repoRoot, 'legal', 'clean-room-records.json'), 'utf8'));
  const errors = validateEvidence(records, cleanRoom.records || []);

  if (errors.length) {
    console.error('Work-package evidence compliance failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Work-package evidence compliance passed (${files.length} record(s)).`);
}

if (require.main === module) main();

module.exports = { canonicalLockHash, validateEvidence };
