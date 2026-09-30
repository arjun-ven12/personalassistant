ALTER TABLE used_nonces
  ADD COLUMN IF NOT EXISTS execution_request_id uuid REFERENCES execution_requests(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS result_signature_digest char(64);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'used_nonces_result_binding_check'
      AND conrelid = 'used_nonces'::regclass
  ) THEN
    ALTER TABLE used_nonces
      ADD CONSTRAINT used_nonces_result_binding_check CHECK (
        (execution_request_id IS NULL AND result_signature_digest IS NULL) OR
        (execution_request_id IS NOT NULL AND result_signature_digest IS NOT NULL)
      );
  END IF;
END;
$$;
