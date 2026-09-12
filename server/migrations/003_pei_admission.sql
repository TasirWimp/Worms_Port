CREATE TABLE IF NOT EXISTS pei_admission_grants (
    id text PRIMARY KEY CHECK (length(id) BETWEEN 16 AND 64),
    wallet_address text NOT NULL CHECK (
        wallet_address ~ '^NQ[0-9]{2}( [0-9A-HJ-NP-VXY]{4}){8}$'
    ),
    challenge_day date NOT NULL,
    qualification_digest text NOT NULL CHECK (
        qualification_digest ~ '^[A-Za-z0-9_-]{43}$'
    ),
    token_digest text NOT NULL CHECK (
        token_digest ~ '^[A-Za-z0-9_-]{43}$'
    ),
    issued_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    entitlement_id text UNIQUE REFERENCES reward_entitlements(id),
    CHECK (expires_at > issued_at),
    CHECK (
        (consumed_at IS NULL AND entitlement_id IS NULL) OR
        (consumed_at IS NOT NULL AND entitlement_id IS NOT NULL)
    )
);

ALTER TABLE reward_entitlements
    ADD COLUMN IF NOT EXISTS pei_admission_grant_id text
    REFERENCES pei_admission_grants(id);

CREATE INDEX IF NOT EXISTS pei_admission_wallet_day
    ON pei_admission_grants (wallet_address, challenge_day, expires_at DESC);

CREATE INDEX IF NOT EXISTS pei_admission_unconsumed
    ON pei_admission_grants (expires_at)
    WHERE consumed_at IS NULL;
