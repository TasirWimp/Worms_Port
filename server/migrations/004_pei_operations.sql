CREATE TABLE IF NOT EXISTS pei_journeys_v0 (
    earn_request_commitment VARCHAR(43) PRIMARY KEY,
    wallet_address VARCHAR(44) NOT NULL,
    earn_proof JSONB,
    spend_request JSONB,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT pei_journeys_commitment_shape
        CHECK (earn_request_commitment ~ '^[A-Za-z0-9_-]{43}$'),
    CONSTRAINT pei_journeys_acceptance_pair
        CHECK ((earn_proof IS NULL) = (spend_request IS NULL))
);

CREATE INDEX IF NOT EXISTS pei_journeys_expiry_idx
    ON pei_journeys_v0 (expires_at);

CREATE TABLE IF NOT EXISTS pei_proxy_transfers_v0 (
    request_commitment VARCHAR(43) PRIMARY KEY,
    signed_transaction TEXT NOT NULL,
    transaction_hash VARCHAR(64) NOT NULL,
    validity_start_height BIGINT NOT NULL,
    state VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT pei_proxy_commitment_shape
        CHECK (request_commitment ~ '^[A-Za-z0-9_-]{43}$'),
    CONSTRAINT pei_proxy_hash_shape
        CHECK (transaction_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT pei_proxy_state
        CHECK (state IN ('signed', 'broadcast_unknown')),
    CONSTRAINT pei_proxy_height
        CHECK (validity_start_height >= 0)
);

CREATE TABLE IF NOT EXISTS pei_proxy_issuances_v0 (
    request_commitment VARCHAR(43) PRIMARY KEY,
    wallet_address VARCHAR(44) NOT NULL,
    issuance_day DATE NOT NULL,
    amount_luna NUMERIC(20, 0) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    state VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT pei_proxy_issuance_commitment_shape
        CHECK (request_commitment ~ '^[A-Za-z0-9_-]{43}$'),
    CONSTRAINT pei_proxy_issuance_wallet_shape
        CHECK (wallet_address ~ '^NQ[0-9]{2}( [0-9A-HJ-NP-VXY]{4}){8}$'),
    CONSTRAINT pei_proxy_issuance_amount
        CHECK (amount_luna > 0 AND amount_luna <= 18446744073709551615),
    CONSTRAINT pei_proxy_issuance_state
        CHECK (state IN ('reserved', 'committed')),
    CONSTRAINT pei_proxy_issuance_expiry
        CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS pei_proxy_issuances_day_idx
    ON pei_proxy_issuances_v0 (issuance_day, state, expires_at);

CREATE INDEX IF NOT EXISTS pei_proxy_issuances_wallet_day_idx
    ON pei_proxy_issuances_v0 (wallet_address, issuance_day);
