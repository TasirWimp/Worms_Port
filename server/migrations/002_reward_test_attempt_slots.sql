ALTER TABLE reward_entitlements
    ADD COLUMN IF NOT EXISTS attempt_number integer NOT NULL DEFAULT 1;

ALTER TABLE reward_entitlements
    ADD COLUMN IF NOT EXISTS daily_attempt_limit integer NOT NULL DEFAULT 1;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'reward_attempt_number_positive'
           AND conrelid = 'reward_entitlements'::regclass
    ) THEN
        ALTER TABLE reward_entitlements
            ADD CONSTRAINT reward_attempt_number_positive
            CHECK (attempt_number >= 1);
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'reward_daily_attempt_limit_bounded'
           AND conrelid = 'reward_entitlements'::regclass
    ) THEN
        ALTER TABLE reward_entitlements
            ADD CONSTRAINT reward_daily_attempt_limit_bounded
            CHECK (daily_attempt_limit BETWEEN 1 AND 5);
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'reward_attempt_within_limit'
           AND conrelid = 'reward_entitlements'::regclass
    ) THEN
        ALTER TABLE reward_entitlements
            ADD CONSTRAINT reward_attempt_within_limit
            CHECK (attempt_number <= daily_attempt_limit);
    END IF;
END
$$;

DO $$
DECLARE
    current_definition text;
BEGIN
    SELECT indexdef
      INTO current_definition
      FROM pg_indexes
     WHERE schemaname = current_schema()
       AND indexname = 'reward_one_consumed_attempt';

    IF current_definition IS NOT NULL AND
       position('attempt_number' IN current_definition) = 0 THEN
        DROP INDEX reward_one_consumed_attempt;
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS reward_one_consumed_attempt
    ON reward_entitlements (challenge_day, wallet_address, attempt_number)
    WHERE attempt_consumed;
