DO $$
DECLARE
    current_definition text;
BEGIN
    SELECT replace(pg_get_constraintdef(oid), ' ', '')
      INTO current_definition
      FROM pg_constraint
     WHERE conname = 'reward_daily_attempt_limit_bounded'
       AND conrelid = 'reward_entitlements'::regclass;

    IF current_definition IS NULL OR
       position('daily_attempt_limit>=1' IN current_definition) = 0 OR
       position('daily_attempt_limit<=12' IN current_definition) = 0 THEN
        ALTER TABLE reward_entitlements
            DROP CONSTRAINT IF EXISTS reward_daily_attempt_limit_bounded;
        ALTER TABLE reward_entitlements
            ADD CONSTRAINT reward_daily_attempt_limit_bounded
            CHECK (daily_attempt_limit BETWEEN 1 AND 12);
    END IF;
END
$$;
