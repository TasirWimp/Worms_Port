ALTER TABLE pei_admission_grants
    ALTER COLUMN challenge_day DROP NOT NULL,
    ALTER COLUMN token_digest DROP NOT NULL,
    ALTER COLUMN expires_at DROP NOT NULL;

DROP INDEX IF EXISTS pei_admission_wallet_day;
DROP INDEX IF EXISTS pei_admission_unconsumed;

CREATE INDEX IF NOT EXISTS pei_admission_receipt_proof
    ON pei_admission_grants (wallet_address, qualification_digest, issued_at, id);

CREATE INDEX IF NOT EXISTS pei_admission_available_receipts
    ON pei_admission_grants (wallet_address, issued_at, id)
    WHERE consumed_at IS NULL;
