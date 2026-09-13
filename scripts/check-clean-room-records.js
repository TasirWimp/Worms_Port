const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const sourceCommit = '0f45c4920321c0a3a14de30fe5cf44131a38da89';

function canonicalBehaviorRecordHash(filePath) {
  // Git stores these text records with LF endings, while Windows worktrees may
  // materialize them as CRLF. The hash binds the frozen document's Git-stable
  // content, not the checkout-specific line-ending conversion.
  const canonicalBytes = Buffer.from(
    fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n'),
    'utf8'
  );
  return crypto.createHash('sha256').update(canonicalBytes).digest('hex').toUpperCase();
}

function validateRecords(records, root = repoRoot) {
  const errors = [];
  const ids = new Set();
  const allowedFields = new Set([
    'id', 'work_package', 'source_commit', 'observed_material', 'behavior_record',
    'behavior_record_sha256', 'observer', 'status', 'implementer', 'reviewer',
    'implementation_declaration', 'similarity_review', 'behavioral_tests', 'execution_mode'
  ]);

  for (const record of records || []) {
    const observedStrings = [
      'id', 'work_package', 'source_commit', 'behavior_record', 'behavior_record_sha256',
      'observer', 'status'
    ];
    for (const field of observedStrings) {
      if (typeof record[field] !== 'string' || !record[field]) {
        errors.push(`${record.id || '<missing id>'}: missing ${field}.`);
      }
    }
    for (const field of Object.keys(record)) {
      if (!allowedFields.has(field)) errors.push(`${record.id || '<missing id>'}: unexpected field ${field}.`);
    }
    if (!/^[a-z0-9-]+$/.test(record.id || '')) errors.push(`${record.id || '<missing id>'}: invalid id.`);
    if (!/^WP-\d{3}(?:[A-Z]|[A-Z]\d[A-Z])?$/.test(record.work_package || '')) {
      errors.push(`${record.id}: invalid work_package.`);
    }
    if (record.execution_mode !== undefined && record.execution_mode !== 'single_owner') errors.push(`${record.id}: invalid execution_mode.`);
    if (!['observed', 'complete'].includes(record.status)) errors.push(`${record.id}: invalid status.`);
    if (!/^[0-9A-F]{64}$/.test(record.behavior_record_sha256 || '')) {
      errors.push(`${record.id}: invalid behavior_record_sha256.`);
    }
    if (ids.has(record.id)) errors.push(`${record.id}: duplicate clean-room record id.`);
    ids.add(record.id);
    if (record.source_commit !== sourceCommit) {
      errors.push(`${record.id}: source commit does not match the quarantined pin.`);
    }
    if (!Array.isArray(record.observed_material) || record.observed_material.length === 0 ||
        record.observed_material.some((item) => typeof item !== 'string')) {
      errors.push(`${record.id}: observed_material must be non-empty.`);
    }
    if (record.status === 'observed') {
      for (const field of ['implementer', 'reviewer', 'implementation_declaration', 'similarity_review', 'behavioral_tests']) {
        if (record[field] !== undefined) errors.push(`${record.id}: observed records must not include ${field}.`);
      }
    } else if (record.status === 'complete') {
      for (const field of ['implementer', 'reviewer', 'implementation_declaration', 'similarity_review']) {
        if (typeof record[field] !== 'string' || !record[field]) errors.push(`${record.id}: missing ${field}.`);
      }
      if (!Array.isArray(record.behavioral_tests) || record.behavioral_tests.length === 0 ||
          record.behavioral_tests.some((item) => typeof item !== 'string')) {
        errors.push(`${record.id}: behavioral_tests must be non-empty.`);
      }
      if (record.execution_mode === 'single_owner' && record.implementer !== record.reviewer) {
        errors.push(`${record.id}: single_owner requires the same implementer and direct reviewer.`);
      }
      if (record.execution_mode !== 'single_owner' && new Set([record.observer, record.implementer, record.reviewer]).size !== 3) {
        errors.push(`${record.id}: observer, implementer, and reviewer must be separate identities.`);
      }
      if (record.similarity_review !== 'pass') {
        errors.push(`${record.id}: similarity_review must pass before completion.`);
      }
    }

    const behaviorPath = path.resolve(root, record.behavior_record || '');
    if (!behaviorPath.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(behaviorPath)) {
      errors.push(`${record.id}: behavior_record must resolve to an existing repository file.`);
    } else {
      const hash = canonicalBehaviorRecordHash(behaviorPath);
      if (hash !== record.behavior_record_sha256) {
        errors.push(`${record.id}: frozen behavior record hash mismatch.`);
      }
    }
  }

  return errors;
}

function main() {
  const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, 'legal', 'clean-room-records.json'), 'utf8'));
  const errors = validateRecords(registry.records);

  if (errors.length) {
    console.error('Clean-room record compliance failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Clean-room record compliance passed (${(registry.records || []).length} record(s)).`);
}

if (require.main === module) main();

module.exports = { canonicalBehaviorRecordHash, sourceCommit, validateRecords };
