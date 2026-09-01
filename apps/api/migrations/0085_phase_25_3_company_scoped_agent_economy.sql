-- Economy accounts belong to CompanyAgentAssignments, not reusable definitions.
-- A reusable specialist may therefore have one independent economy account per company.

ALTER TABLE agent_economy_ledger
  DROP CONSTRAINT IF EXISTS agent_economy_ledger_owner_id_agent_id_fkey;
ALTER TABLE agent_economy_reservations
  DROP CONSTRAINT IF EXISTS agent_economy_reservations_owner_id_agent_id_fkey;
ALTER TABLE agent_economy_performance
  DROP CONSTRAINT IF EXISTS agent_economy_performance_owner_id_agent_id_fkey;

ALTER TABLE agent_economy_accounts
  DROP CONSTRAINT IF EXISTS agent_economy_accounts_pkey;
ALTER TABLE agent_economy_accounts
  ADD PRIMARY KEY(owner_id,company_id,agent_id);

ALTER TABLE agent_economy_performance
  DROP CONSTRAINT IF EXISTS agent_economy_performance_pkey;
ALTER TABLE agent_economy_performance
  ADD PRIMARY KEY(owner_id,company_id,agent_id);

ALTER TABLE agent_economy_ledger
  DROP CONSTRAINT IF EXISTS agent_economy_ledger_owner_id_idempotency_key_key;
ALTER TABLE agent_economy_ledger
  ADD CONSTRAINT agent_economy_ledger_company_idempotency_key
  UNIQUE(owner_id,company_id,idempotency_key);

ALTER TABLE agent_economy_reservations
  DROP CONSTRAINT IF EXISTS agent_economy_reservations_owner_id_idempotency_key_key;
ALTER TABLE agent_economy_reservations
  ADD CONSTRAINT agent_economy_reservations_company_idempotency_key
  UNIQUE(owner_id,company_id,idempotency_key);

ALTER TABLE agent_economy_ledger
  ADD CONSTRAINT agent_economy_ledger_company_account_fkey
  FOREIGN KEY(owner_id,company_id,agent_id)
  REFERENCES agent_economy_accounts(owner_id,company_id,agent_id) ON DELETE CASCADE;
ALTER TABLE agent_economy_reservations
  ADD CONSTRAINT agent_economy_reservations_company_account_fkey
  FOREIGN KEY(owner_id,company_id,agent_id)
  REFERENCES agent_economy_accounts(owner_id,company_id,agent_id) ON DELETE CASCADE;
ALTER TABLE agent_economy_performance
  ADD CONSTRAINT agent_economy_performance_company_account_fkey
  FOREIGN KEY(owner_id,company_id,agent_id)
  REFERENCES agent_economy_accounts(owner_id,company_id,agent_id) ON DELETE CASCADE;
