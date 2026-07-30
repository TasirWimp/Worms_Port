CREATE TABLE IF NOT EXISTS reward_days (
    challenge_day date PRIMARY KEY,
    reward_luna bigint NOT NULL CHECK (reward_luna > 0),
    daily_budget_luna bigint NOT NULL CHECK (daily_budget_luna >= reward_luna),
    committed_luna bigint NOT NULL DEFAULT 0 CHECK (committed_luna >= 0),
    paid_luna bigint NOT NULL DEFAULT 0 CHECK (paid_luna >= 0),
    paused boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (committed_luna <= daily_budget_luna),
    CHECK (paid_luna <= committed_luna)
);

CREATE TABLE IF NOT EXISTS reward_entitlements (
    id text PRIMARY KEY CHECK (length(id) BETWEEN 16 AND 64),
    challenge_id text NOT NULL UNIQUE CHECK (length(challenge_id) BETWEEN 16 AND 64),
    challenge_day date NOT NULL REFERENCES reward_days(challenge_day),
    wallet_address text NOT NULL CHECK (
        wallet_address ~ '^NQ[0-9]{2}( [0-9A-HJ-NP-VXY]{4}){8}$'
    ),
    calling text NOT NULL CHECK (calling IN ('wizard', 'thief', 'warrior')),
    seed bigint NOT NULL CHECK (seed BETWEEN 0 AND 4294967295),
    reward_luna bigint NOT NULL CHECK (reward_luna > 0),
    state text NOT NULL CHECK (state IN (
        'reserved', 'in_progress', 'lost', 'forfeited', 'expired', 'cancelled',
        'claimable', 'queued', 'signed', 'broadcast_unknown', 'included',
        'finalized', 'manual_review'
    )),
    attempt_consumed boolean NOT NULL DEFAULT false,
    eligibility_token_digest text CHECK (
        eligibility_token_digest IS NULL OR
        eligibility_token_digest ~ '^[A-Za-z0-9_-]{43}$'
    ),
    reservation_expires_at timestamptz NOT NULL,
    final_tick bigint,
    final_state_hash text,
    replay jsonb,
    claim_nonce_digest text CHECK (
        claim_nonce_digest IS NULL OR claim_nonce_digest ~ '^[A-Za-z0-9_-]{43}$'
    ),
    claim_nonce_expires_at timestamptz,
    signed_transaction text CHECK (
        signed_transaction IS NULL OR signed_transaction ~ '^(?:[a-f0-9]{2})+$'
    ),
    transaction_hash text,
    validity_start_height bigint,
    included_height bigint,
    finalized_at timestamptz,
    reason_code text CHECK (
        reason_code IS NULL OR reason_code ~ '^[a-z0-9_-]{1,64}$'
    ),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (final_state_hash IS NULL OR final_state_hash ~ '^[a-f0-9]{64}$'),
    CHECK (transaction_hash IS NULL OR transaction_hash ~ '^[a-f0-9]{64}$'),
    CHECK (
        state <> 'claimable' OR (
            final_tick IS NOT NULL AND final_state_hash IS NOT NULL AND
            replay IS NOT NULL AND claim_nonce_digest IS NOT NULL AND
            claim_nonce_expires_at IS NOT NULL
        )
    ),
    CHECK (
        state NOT IN ('signed', 'broadcast_unknown', 'included', 'finalized') OR (
            signed_transaction IS NOT NULL AND transaction_hash IS NOT NULL AND
            validity_start_height IS NOT NULL
        )
    ),
    CHECK (
        state NOT IN ('included', 'finalized') OR included_height IS NOT NULL
    ),
    CHECK (state <> 'finalized' OR finalized_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS reward_one_consumed_attempt
    ON reward_entitlements (challenge_day, wallet_address)
    WHERE attempt_consumed;

CREATE UNIQUE INDEX IF NOT EXISTS reward_one_active_reservation
    ON reward_entitlements (challenge_day, wallet_address)
    WHERE state = 'reserved';

CREATE TABLE IF NOT EXISTS reward_claims (
    idempotency_key text PRIMARY KEY CHECK (length(idempotency_key) BETWEEN 16 AND 64),
    entitlement_id text NOT NULL UNIQUE REFERENCES reward_entitlements(id),
    request_digest text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reward_events (
    event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entitlement_id text NOT NULL REFERENCES reward_entitlements(id),
    previous_state text,
    next_state text NOT NULL,
    reason_code text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reward_entitlements_worker_queue
    ON reward_entitlements (state, updated_at)
    WHERE state IN ('queued', 'signed', 'broadcast_unknown', 'included');

CREATE INDEX IF NOT EXISTS reward_entitlements_wallet_recovery
    ON reward_entitlements (wallet_address, challenge_day, updated_at DESC)
    WHERE attempt_consumed OR state IN (
        'claimable', 'queued', 'signed', 'broadcast_unknown', 'included',
        'finalized', 'manual_review'
    );
