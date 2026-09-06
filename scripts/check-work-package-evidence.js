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
  'residual_risks', 'support_episodes'
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

function isShallowRepository(root = repoRoot) {
  try {
    return childProcess.execFileSync(
      'git', ['rev-parse', '--is-shallow-repository'],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim() === 'true';
  } catch (error) {
    return false;
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isBoundSource(source) {
  return isRecord(source) &&
    typeof source.commit === 'string' && /^[0-9a-f]{7,40}$/.test(source.commit) &&
    Array.isArray(source.paths) && source.paths.length > 0 &&
    source.paths.every(isNonEmptyString);
}

function sameBoundSource(left, right) {
  return isBoundSource(left) && isBoundSource(right) &&
    left.commit === right.commit &&
    left.paths.length === right.paths.length &&
    left.paths.every((entry, index) => entry === right.paths[index]);
}

function reportUnexpectedFields(value, allowed, label, errors) {
  if (!isRecord(value)) return;
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) errors.push(`${label}: unexpected field ${field}.`);
  }
}

function validateSupportEpisodes(evidence, errors) {
  const label = evidence.id || '<missing id>';
  if (evidence.support_episodes === undefined) return;
  if (!Array.isArray(evidence.support_episodes)) {
    errors.push(`${label}: support_episodes must be an array when present.`);
    return;
  }

  const episodeIds = new Set();
  const supportParticipantIds = new Set();
  const episodeStatuses = new Set(['open', 'reduced', 'blocked', 'reopened']);

  for (const episode of evidence.support_episodes) {
    const episodeLabel = `${label}: support episode ${episode?.id || '<missing id>'}`;
    if (!episode || typeof episode !== 'object' || Array.isArray(episode)) {
      errors.push(`${episodeLabel} must be an object.`);
      continue;
    }
    reportUnexpectedFields(episode, new Set([
      'id', 'status', 'participants', 'source_binding', 'exchanges', 'closure'
    ]), episodeLabel, errors);
    if (!isNonEmptyString(episode.id)) errors.push(`${episodeLabel}: missing id.`);
    else if (episodeIds.has(episode.id)) errors.push(`${episodeLabel}: duplicate episode id.`);
    else episodeIds.add(episode.id);
    if (!episodeStatuses.has(episode.status)) errors.push(`${episodeLabel}: invalid status.`);

    const participants = Array.isArray(episode.participants) ? episode.participants : [];
    if (participants.length < 2) errors.push(`${episodeLabel}: requires at least two exchange participants.`);
    const participantIds = new Set();
    for (const participant of participants) {
      if (!participant || typeof participant !== 'object' || !isNonEmptyString(participant.id)) {
        errors.push(`${episodeLabel}: participant requires an id.`);
        continue;
      }
      reportUnexpectedFields(participant, new Set(['id', 'requested', 'runtime']),
        `${episodeLabel}: participant ${participant.id}`, errors);
      reportUnexpectedFields(participant.requested, new Set(['model', 'effort']),
        `${episodeLabel}: requested settings for ${participant.id}`, errors);
      reportUnexpectedFields(participant.runtime, new Set(['status', 'model', 'effort']),
        `${episodeLabel}: runtime settings for ${participant.id}`, errors);
      if (participantIds.has(participant.id)) errors.push(`${episodeLabel}: duplicate participant ${participant.id}.`);
      participantIds.add(participant.id);
      supportParticipantIds.add(participant.id);
      if (!isNonEmptyString(participant.requested?.model) || !isNonEmptyString(participant.requested?.effort)) {
        errors.push(`${episodeLabel}: participant ${participant.id} requires requested model and effort.`);
      }
      if (!['unknown', 'reported'].includes(participant.runtime?.status)) {
        errors.push(`${episodeLabel}: participant ${participant.id} requires runtime status unknown or reported.`);
      } else if (participant.runtime.status === 'reported' &&
          (!isNonEmptyString(participant.runtime.model) || !isNonEmptyString(participant.runtime.effort))) {
        errors.push(`${episodeLabel}: reported runtime for ${participant.id} requires model and effort.`);
      }
      for (const field of ['model', 'effort']) {
        if (participant.runtime?.[field] !== undefined && !isNonEmptyString(participant.runtime[field])) {
          errors.push(`${episodeLabel}: runtime ${field} for ${participant.id} must be a non-empty string when present.`);
        }
      }
    }

    const sourceBinding = episode.source_binding;
    reportUnexpectedFields(sourceBinding, new Set(['commit', 'paths', 'relationship']),
      `${episodeLabel}: source binding`, errors);
    if (!isBoundSource(sourceBinding) || !isNonEmptyString(sourceBinding?.relationship)) {
      errors.push(`${episodeLabel}: requires same-repository source binding and relationship.`);
    }

    const exchanges = Array.isArray(episode.exchanges) ? episode.exchanges : [];
    if (!Array.isArray(episode.exchanges)) {
      errors.push(`${episodeLabel}: exchanges must be an array.`);
    }
    if (exchanges.length < 1) {
      errors.push(`${episodeLabel}: requires at least one recorded exchange.`);
    }
    if (episode.status === 'reduced' && exchanges.length < 2) {
      errors.push(`${episodeLabel}: reduced support requires reciprocal exchanges.`);
    }
    const exchangeIds = new Set();
    const sentBy = new Set();
    const receivedBy = new Set();
    const pendingConsequential = [];
    for (const exchange of exchanges) {
      const exchangeLabel = `${episodeLabel}: exchange ${exchange?.id || '<missing id>'}`;
      if (!exchange || typeof exchange !== 'object' || !isNonEmptyString(exchange.id)) {
        errors.push(`${exchangeLabel} requires an id.`);
        continue;
      }
      reportUnexpectedFields(exchange, new Set([
        'id', 'from', 'to', 'source', 'probe', 'remaining_uncertainty', 'consequential', 'recipient_disposition'
      ]), exchangeLabel, errors);
      reportUnexpectedFields(exchange.source, new Set(['commit', 'paths']), `${exchangeLabel}: source`, errors);
      if (exchangeIds.has(exchange.id)) errors.push(`${exchangeLabel}: duplicate exchange id.`);
      exchangeIds.add(exchange.id);
      if (!participantIds.has(exchange.from) || !participantIds.has(exchange.to) || exchange.from === exchange.to) {
        errors.push(`${exchangeLabel}: from and to must be distinct episode participants.`);
      } else {
        sentBy.add(exchange.from);
        receivedBy.add(exchange.to);
      }
      if (!isBoundSource(exchange.source) || !isNonEmptyString(exchange.probe) ||
          !isNonEmptyString(exchange.remaining_uncertainty)) {
        errors.push(`${exchangeLabel}: requires source, probe, and remaining uncertainty.`);
      }
      if (typeof exchange.consequential !== 'boolean') {
        errors.push(`${exchangeLabel}: requires explicit consequential status.`);
      }
      const disposition = exchange.recipient_disposition;
      const hasDisposition = disposition !== undefined;
      const validDisposition = isRecord(disposition) &&
        ['received', 'pending'].includes(disposition.status) && isNonEmptyString(disposition.detail);
      if (hasDisposition) {
        reportUnexpectedFields(disposition, new Set(['status', 'detail']),
          `${exchangeLabel}: recipient disposition`, errors);
        if (!validDisposition) errors.push(`${exchangeLabel}: recipient disposition requires received or pending status and detail.`);
      }
      if (exchange.consequential) {
        if (!validDisposition) errors.push(`${exchangeLabel}: consequential exchange requires received or pending recipient disposition.`);
        else if (disposition.status === 'pending') pendingConsequential.push(exchange.id);
      }
    }
    if (episode.status === 'reduced') {
      for (const participantId of participantIds) {
        if (!sentBy.has(participantId) || !receivedBy.has(participantId)) {
          errors.push(`${episodeLabel}: reduced support participant ${participantId} must both send and receive an exchange.`);
        }
      }
    }

    const closure = episode.closure;
    const hasClosure = closure !== undefined;
    if (hasClosure && !isRecord(closure)) {
      errors.push(`${episodeLabel}: closure must be an object when present.`);
    }
    if (episode.status === 'reduced' && !isRecord(closure)) {
      errors.push(`${episodeLabel}: reduced support requires closure evidence.`);
    }
    if (isRecord(closure)) {
      reportUnexpectedFields(closure, new Set([
        'source_currentness', 'distinction', 'evidence', 'support_assumptions', 'reopen_cue'
      ]), `${episodeLabel}: closure`, errors);
      if (!isNonEmptyString(closure.distinction) || !Array.isArray(closure.evidence) || closure.evidence.length === 0 ||
          !closure.evidence.every(isNonEmptyString) || !Array.isArray(closure.support_assumptions) ||
          closure.support_assumptions.length === 0 || !closure.support_assumptions.every(isNonEmptyString) ||
          !isNonEmptyString(closure.reopen_cue)) {
        errors.push(`${episodeLabel}: closure requires distinction, evidence, support assumptions, and reopen cue.`);
      }
      const currentness = closure.source_currentness;
      reportUnexpectedFields(currentness, new Set(['commit', 'paths', 'manual_candidate_review']),
        `${episodeLabel}: closure source currentness`, errors);
      if (!isBoundSource(currentness) ||
          !isNonEmptyString(currentness?.manual_candidate_review)) {
        errors.push(`${episodeLabel}: closure requires bound source currentness and manual candidate review.`);
      } else if (episode.status === 'reduced' &&
          !sameBoundSource(currentness, sourceBinding)) {
        errors.push(`${episodeLabel}: reduced closure source currentness must match the declared source binding.`);
      }
    }
    if (episode.status === 'reduced' && pendingConsequential.length > 0) {
      errors.push(`${episodeLabel}: reduced support has pending consequential exchanges: ${pendingConsequential.join(', ')}.`);
    }
  }

  if (evidence.status === 'complete') {
    if (evidence.support_episodes.some((episode) => episode?.status !== 'reduced')) {
      errors.push(`${label}: completed evidence cannot retain open, blocked, or reopened support.`);
    }
    const reviews = Array.isArray(evidence.reviews) ? evidence.reviews : [];
    const finalReviews = reviews.filter((review) => review?.review_type === 'final');
    if (finalReviews.length === 0 || finalReviews.some((review) =>
      review.decision !== 'pass' || !isNonEmptyString(review.participant_id) || supportParticipantIds.has(review.participant_id)
    )) {
      errors.push(`${label}: completed support evidence requires a passing final review by an identified non-support participant.`);
    }
  }
  for (const review of Array.isArray(evidence.reviews) ? evidence.reviews : []) {
    if (review?.review_type === 'final' &&
        (!isNonEmptyString(review.participant_id) || supportParticipantIds.has(review.participant_id))) {
      errors.push(`${label}: final review participant must be identified and distinct from support participants.`);
    }
  }
}

function validateEvidence(
  records,
  cleanRoomRecords,
  resolveLockHash = canonicalLockHash,
  options = {}
) {
  const errors = [];
  const ids = new Set();
  const cleanRoomById = new Map(cleanRoomRecords.map((record) => [record.id, record]));
  const allowUnresolvedHistory = options.allowUnresolvedHistory === true;

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
    for (const field of ['check_results', 'reviews', 'support_episodes', 'skipped_checks', 'residual_risks']) {
      if (evidence[field] !== undefined && !Array.isArray(evidence[field])) {
        errors.push(`${label}: ${field} must be an array when present.`);
      }
    }
    for (const field of ['owning_roles', 'scope', 'non_goals', 'planned_checks']) {
      if (Array.isArray(evidence[field]) && evidence[field].length === 0) errors.push(`${label}: ${field} must be non-empty.`);
    }

    if (ids.has(evidence.id)) errors.push(`${label}: duplicate work-package id.`);
    ids.add(evidence.id);
    if (!/^WP-\d{3}[A-Z]?$/.test(evidence.id || '')) errors.push(`${label}: invalid work-package id.`);
    if (!['in_progress', 'complete', 'blocked'].includes(evidence.status)) errors.push(`${label}: invalid status.`);
    if (!/^[0-9a-f]{7,40}$/.test(evidence.starting_commit || '')) errors.push(`${label}: invalid starting_commit.`);
    if (!['clean', 'dirty-preserved'].includes(evidence.initial_worktree)) errors.push(`${label}: invalid initial_worktree.`);
    if (!/^[0-9A-F]{64}$/.test(evidence.starting_lock_sha256 || '')) errors.push(`${label}: invalid lock hash.`);

    const actualLockHash = resolveLockHash(evidence.starting_commit);
    if (!actualLockHash) {
      if (!allowUnresolvedHistory) {
        errors.push(`${label}: starting commit or package-lock.json cannot be resolved.`);
      }
    } else if (actualLockHash !== evidence.starting_lock_sha256) {
      errors.push(`${label}: starting lock hash mismatch.`);
    }

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

    validateSupportEpisodes(evidence, errors);

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
  const allowUnresolvedHistory =
    process.env.ALLOW_SHALLOW_WORK_PACKAGE_EVIDENCE === 'true' &&
    isShallowRepository();
  const errors = validateEvidence(
    records,
    cleanRoom.records || [],
    canonicalLockHash,
    { allowUnresolvedHistory }
  );

  if (errors.length) {
    console.error('Work-package evidence compliance failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  if (allowUnresolvedHistory) {
    console.log('Shallow checkout: historical lock resolution was unavailable by design.');
  }
  console.log(`Work-package evidence compliance passed (${files.length} record(s)).`);
}

if (require.main === module) main();

module.exports = { canonicalLockHash, isShallowRepository, validateEvidence };
