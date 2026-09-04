CREATE TABLE commercial_mutation_leases (
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  provider text NOT NULL, resource_type text NOT NULL, resource_id text NOT NULL,
  lease_token uuid NOT NULL, fence bigint NOT NULL CHECK(fence>0),
  lease_expires_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  PRIMARY KEY(owner_id,company_id,provider,resource_type,resource_id)
);
CREATE INDEX commercial_mutation_leases_expiry_idx ON commercial_mutation_leases(lease_expires_at);

CREATE TABLE commercial_mutation_history (
  id bigserial PRIMARY KEY, owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  provider text NOT NULL, resource_type text NOT NULL, resource_id text NOT NULL,
  capability text NOT NULL, idempotency_key text NOT NULL, succeeded_at timestamptz NOT NULL,
  fence bigint NOT NULL CHECK(fence>0), record jsonb NOT NULL,
  UNIQUE(owner_id,company_id,provider,idempotency_key)
);
CREATE INDEX commercial_mutation_history_cooldown_idx ON commercial_mutation_history(owner_id,company_id,provider,resource_type,resource_id,capability,succeeded_at DESC);

CREATE TABLE commercial_aggregate_buckets (
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  provider text NOT NULL, action_class text NOT NULL, currency char(3) NOT NULL,
  day_key date NOT NULL, consumed_minor bigint NOT NULL CHECK(consumed_minor>=0), updated_at timestamptz NOT NULL,
  PRIMARY KEY(owner_id,company_id,provider,action_class,currency,day_key)
);
CREATE TABLE commercial_aggregate_reservations (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  provider text NOT NULL, action_class text NOT NULL, currency char(3) NOT NULL,
  day_key date NOT NULL, amount_minor bigint NOT NULL CHECK(amount_minor>0),
  idempotency_key text NOT NULL, status text NOT NULL CHECK(status IN ('RESERVED','COMMITTED','RELEASED')),
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, record jsonb NOT NULL,
  UNIQUE(owner_id,company_id,provider,action_class,currency,day_key,idempotency_key)
);
CREATE INDEX commercial_aggregate_reservations_scope_idx ON commercial_aggregate_reservations(owner_id,company_id,provider,action_class,currency,day_key,status);

CREATE TABLE commercial_workflow_runs (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  template text NOT NULL CHECK(template IN ('REFUND','ACCOUNTS_RECEIVABLE','INVENTORY','CAMPAIGN_OPTIMIZATION')),
  trigger_key text NOT NULL, status text NOT NULL CHECK(status IN ('PLANNED','WAITING_APPROVAL','EXECUTING','RECONCILING','COMPLETED','BLOCKED')),
  step integer NOT NULL CHECK(step>=0), updated_at timestamptz NOT NULL, record jsonb NOT NULL,
  UNIQUE(owner_id,company_id,template,trigger_key)
);
CREATE INDEX commercial_workflow_runs_status_idx ON commercial_workflow_runs(owner_id,company_id,status,updated_at);
