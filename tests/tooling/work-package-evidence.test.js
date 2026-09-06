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

function pendingSupportEpisode(status = 'open') {
  const source = { commit: 'abcdef0', paths: ['scripts/check-work-package-evidence.js'] };
  return {
    id: 'pending-support',
    status,
    participants: [
      { id: 'implementer', requested: { model: 'gpt-5.6-terra', effort: 'high' }, runtime: { status: 'unknown' } },
      { id: 'advisor', requested: { model: 'gpt-6-astra', effort: 'high' }, runtime: { status: 'unknown' } }
    ],
    source_binding: { ...source, relationship: 'Tooling support is scoped to this repository source.' },
    exchanges: [{
      id: 'initial-request',
      from: 'implementer',
      to: 'advisor',
      source,
      probe: 'Can this pending support request be preserved before a reply?',
      remaining_uncertainty: 'The advisor response is still pending.',
      consequential: true,
      recipient_disposition: { status: 'pending', detail: 'Awaiting the advisor response.' }
    }]
  };
}

function reducedSupportEpisode() {
  const sourceS1 = { commit: 'abcdef0', paths: ['scripts/check-work-package-evidence.js'] };
  const sourceS2 = { commit: 'abcdef1', paths: ['scripts/check-work-package-evidence.js'] };
  return {
    id: 'reduced-support',
    status: 'reduced',
    participants: [
      { id: 'implementer', requested: { model: 'gpt-5.6-terra', effort: 'high' }, runtime: { status: 'unknown' } },
      { id: 'advisor', requested: { model: 'gpt-6-astra', effort: 'high' }, runtime: { status: 'unknown' } }
    ],
    source_binding: { ...sourceS2, relationship: 'Tooling support is scoped to this repository source.' },
    exchanges: [
      {
        id: 'request', from: 'implementer', to: 'advisor', source: sourceS1,
        probe: 'Does this record align with the schema?', remaining_uncertainty: 'The correction is pending.',
        consequential: true, recipient_disposition: { status: 'received', detail: 'Advisor returned a bounded correction.' }
      },
      {
        id: 'reply', from: 'advisor', to: 'implementer', source: sourceS1,
        probe: 'Keep source checks structural.', remaining_uncertainty: 'Manual currentness review remains required.',
        consequential: false
      }
    ],
    closure: {
      source_currentness: { ...sourceS2, manual_candidate_review: 'The declared candidate was inspected.' },
      distinction: 'Recorded binding consistency is not a runtime or semantic claim.',
      evidence: ['tests/tooling/work-package-evidence.test.js'],
      support_assumptions: ['The exchange record is accurate.'],
      reopen_cue: 'Reopen when source or unresolved obligations change.'
    }
  };
}

test('work-package evidence enforces schema fields and clean-room linkage', () => {
  assert.deepEqual(validateEvidence([base], [], () => hash), []);
  assert.match(validateEvidence([{ ...base, unexpected: true }], [], () => hash).join('\n'), /unexpected field/);
  assert.match(validateEvidence([{ ...base, check_results: 'invalid' }], [], () => hash).join('\n'), /must be an array/);
  assert.match(validateEvidence([{ ...base, starting_lock_sha256: 'B'.repeat(64) }], [], () => hash).join('\n'), /hash mismatch/);
  assert.match(validateEvidence([base], [], () => null).join('\n'), /cannot be resolved/);
  assert.deepEqual(validateEvidence(
    [base], [], () => null, { allowUnresolvedHistory: true }
  ), []);
  assert.match(validateEvidence(
    [{ ...base, starting_lock_sha256: 'invalid' }], [], () => null,
    { allowUnresolvedHistory: true }
  ).join('\n'), /invalid lock hash/);

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

test('work-package evidence accepts a single uppercase stabilization suffix', () => {
  assert.deepEqual(validateEvidence([{ ...base, id: 'WP-011A' }], [], () => hash), []);
  assert.match(
    validateEvidence([{ ...base, id: 'WP-011AA' }], [], () => hash).join('\n'),
    /invalid work-package id/
  );
});

test('support episodes retain an open request before reciprocal reduction', () => {
  const open = pendingSupportEpisode();
  assert.deepEqual(validateEvidence([{ ...base, support_episodes: [open] }], [], () => hash), []);
  assert.match(
    validateEvidence([{
      ...base,
      status: 'complete',
      check_results: [{ command: 'test command', status: 'pass' }],
      reviews: [{ role: 'final-reviewer', reviewer: 'reviewer-id', participant_id: 'independent', review_type: 'final', decision: 'pass' }],
      skipped_checks: [],
      residual_risks: [],
      support_episodes: [open]
    }], [], () => hash).join('\n'),
    /cannot retain open, blocked, or reopened support/
  );
  assert.match(
    validateEvidence([{ ...base, support_episodes: [{ ...open, status: 'reduced' }], }], [], () => hash).join('\n'),
    /reduced support requires reciprocal exchanges/
  );
  assert.match(
    validateEvidence([{ ...base, support_episodes: [{ ...open, exchanges: 'missing' }] }], [], () => hash).join('\n'),
    /exchanges must be an array/
  );
  assert.match(
    validateEvidence([{ ...base, support_episodes: [{ ...open, exchanges: [] }] }], [], () => hash).join('\n'),
    /requires at least one recorded exchange/
  );
});

for (const { name, episode, expected } of [
  {
    name: 'a numeric source-binding commit',
    episode: () => ({ ...pendingSupportEpisode(), source_binding: { ...pendingSupportEpisode().source_binding, commit: 1234567 } }),
    expected: /same-repository source binding/
  },
  {
    name: 'a numeric exchange-source commit',
    episode: () => {
      const open = pendingSupportEpisode();
      return { ...open, exchanges: [{ ...open.exchanges[0], source: { ...open.exchanges[0].source, commit: 1234567 } }] };
    },
    expected: /requires source, probe, and remaining uncertainty/
  },
  {
    name: 'a numeric closure-currentness commit',
    episode: () => {
      const reduced = reducedSupportEpisode();
      return { ...reduced, closure: { ...reduced.closure, source_currentness: { ...reduced.closure.source_currentness, commit: 1234567 } } };
    },
    expected: /closure requires bound source currentness/
  },
  ...['model', 'effort'].map((field) => ({
    name: `a numeric optional runtime ${field} when runtime is unknown`,
    episode: () => {
      const open = pendingSupportEpisode();
      return { ...open, participants: open.participants.map((participant, index) => index === 0
        ? { ...participant, runtime: { ...participant.runtime, [field]: 1234567 } }
        : participant) };
    },
    expected: new RegExp(`runtime ${field}.*non-empty string`)
  })),
  {
    name: 'a nonconsequential disposition with invalid status',
    episode: () => {
      const open = pendingSupportEpisode();
      return { ...open, exchanges: [{ ...open.exchanges[0], consequential: false, recipient_disposition: { status: 'invalid', detail: 'Recorded optional disposition.' } }] };
    },
    expected: /recipient disposition requires received or pending status and detail/
  },
  {
    name: 'a consequential disposition with invalid status',
    episode: () => {
      const open = pendingSupportEpisode();
      return { ...open, exchanges: [{ ...open.exchanges[0], recipient_disposition: { status: 'invalid', detail: 'Recorded consequential disposition.' } }] };
    },
    expected: /consequential exchange requires received or pending recipient disposition/
  },
  {
    name: 'a nonconsequential disposition with numeric detail',
    episode: () => {
      const open = pendingSupportEpisode();
      return { ...open, exchanges: [{ ...open.exchanges[0], consequential: false, recipient_disposition: { status: 'received', detail: 1234567 } }] };
    },
    expected: /recipient disposition requires received or pending status and detail/
  },
  {
    name: 'a nonconsequential disposition with an unexpected field',
    episode: () => {
      const open = pendingSupportEpisode();
      return { ...open, exchanges: [{ ...open.exchanges[0], consequential: false, recipient_disposition: { status: 'received', detail: 'Recorded optional disposition.', invented: true } }] };
    },
    expected: /recipient disposition: unexpected field invented/
  },
  {
    name: 'a null nonconsequential disposition',
    episode: () => {
      const open = pendingSupportEpisode();
      return { ...open, exchanges: [{ ...open.exchanges[0], consequential: false, recipient_disposition: null }] };
    },
    expected: /recipient disposition requires received or pending status and detail/
  },
  ...[
    ['null', null], ['false', false], ['zero', 0], ['empty-string', ''], ['array', []]
  ].map(([kind, closure]) => ({
    name: `a ${kind} closure on open support`,
    episode: () => ({ ...pendingSupportEpisode(), closure }),
    expected: /closure must be an object when present/
  }))
]) {
  test(`support episodes reject ${name}`, () => {
    assert.match(validateEvidence([{ ...base, support_episodes: [episode()] }], [], () => hash).join('\n'), expected);
  });
}

test('support episodes retain reciprocal source-bound support without substituting for final review', () => {
  const sourceS1 = { commit: 'abcdef0', paths: ['scripts/check-work-package-evidence.js'] };
  const sourceS2 = { commit: 'abcdef1', paths: ['scripts/check-work-package-evidence.js'] };
  const supportEpisode = {
    id: 'support-1',
    status: 'reduced',
    participants: [
      {
        id: 'implementer',
        requested: { model: 'gpt-5.6-terra', effort: 'high' },
        runtime: { status: 'unknown' }
      },
      {
        id: 'advisor',
        requested: { model: 'gpt-6-astra', effort: 'high' },
        runtime: { status: 'unknown' }
      }
    ],
    source_binding: {
      ...sourceS2,
      relationship: 'The tooling change records support without changing product behavior.'
    },
    exchanges: [
      {
        id: 'request',
        from: 'implementer',
        to: 'advisor',
        source: sourceS1,
        probe: 'Should closure bind to the declared source?',
        remaining_uncertainty: 'Whether a closure needs a recipient receipt.',
        consequential: true,
        recipient_disposition: { status: 'received', detail: 'Advisor supplied the receipt condition.' }
      },
      {
        id: 'reply',
        from: 'advisor',
        to: 'implementer',
        source: sourceS1,
        probe: 'Use a reduced-only binding check.',
        remaining_uncertainty: 'Candidate bytes still need manual inspection.',
        consequential: false
      }
    ],
    closure: {
      source_currentness: {
        ...sourceS2,
        manual_candidate_review: 'The named candidate was inspected against this declared binding.'
      },
      distinction: 'Declared binding consistency is recoverability, not proof of runtime service or semantic truth.',
      evidence: ['tests/tooling/work-package-evidence.test.js'],
      support_assumptions: ['The support exchange was captured accurately in this record.'],
      reopen_cue: 'Reopen if the candidate binding or unresolved obligation changes.'
    }
  };
  const completed = {
    ...base,
    status: 'complete',
    check_results: [{ command: 'test command', status: 'pass' }],
    reviews: [{
      role: 'independent-reviewer',
      reviewer: 'reviewer-id',
      participant_id: 'final-reviewer',
      review_type: 'final',
      decision: 'pass'
    }],
    skipped_checks: [],
    residual_risks: [],
    support_episodes: [supportEpisode]
  };

  assert.deepEqual(validateEvidence([completed], [], () => hash), []);
  assert.match(
    validateEvidence([{
      ...completed,
      support_episodes: [{
        ...supportEpisode,
        source_binding: { ...supportEpisode.source_binding, invented_snapshot: 'not supported' }
      }]
    }], [], () => hash).join('\n'),
    /source binding: unexpected field invented_snapshot/
  );
  assert.match(
    validateEvidence([{ ...completed, reviews: [] }], [], () => hash).join('\n'),
    /identified non-support participant/
  );
  assert.match(
    validateEvidence([{
      ...completed,
      reviews: [{ ...completed.reviews[0], participant_id: undefined }]
    }], [], () => hash).join('\n'),
    /identified non-support participant/
  );
  assert.match(
    validateEvidence([{
      ...completed,
      reviews: [{ ...completed.reviews[0], participant_id: 'advisor' }]
    }], [], () => hash).join('\n'),
    /distinct from support participants/
  );
  assert.match(
    validateEvidence([{
      ...completed,
      reviews: [completed.reviews[0], { role: 'historic-reviewer', reviewer: 'historic-id', decision: 'fail' }]
    }], [], () => hash).join('\n'),
    /identified passing reviews/
  );

  const staleReduced = {
    ...supportEpisode,
    closure: {
      ...supportEpisode.closure,
      source_currentness: { ...supportEpisode.closure.source_currentness, commit: sourceS1.commit }
    }
  };
  assert.match(
    validateEvidence([{ ...completed, support_episodes: [staleReduced] }], [], () => hash).join('\n'),
    /must match the declared source binding/
  );
  const reopenedWithHistory = { ...staleReduced, status: 'reopened' };
  assert.deepEqual(validateEvidence([{
    ...completed,
    status: 'in_progress',
    support_episodes: [reopenedWithHistory]
  }], [], () => hash), []);

  const pendingReduced = {
    ...supportEpisode,
    exchanges: supportEpisode.exchanges.map((exchange) => exchange.id === 'request'
      ? { ...exchange, recipient_disposition: { status: 'pending', detail: 'Awaiting implementation response.' } }
      : exchange)
  };
  assert.match(
    validateEvidence([{ ...completed, support_episodes: [pendingReduced] }], [], () => hash).join('\n'),
    /pending consequential exchanges/
  );
  assert.match(
    validateEvidence([{
      ...completed,
      support_episodes: [{
        ...supportEpisode,
        closure: { ...supportEpisode.closure, evidence: [], reopen_cue: '' }
      }]
    }], [], () => hash).join('\n'),
    /closure requires distinction, evidence, support assumptions, and reopen cue/
  );
  assert.deepEqual(validateEvidence([{
    ...completed,
    status: 'in_progress',
    support_episodes: [{ ...pendingReduced, status: 'reopened' }]
  }], [], () => hash), []);
});
