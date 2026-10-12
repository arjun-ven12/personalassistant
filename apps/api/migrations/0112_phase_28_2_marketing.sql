CREATE TABLE marketing_campaigns (
  owner_id uuid NOT NULL,
  company_id uuid NOT NULL,
  id uuid NOT NULL,
  objective_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL,
  version integer NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, company_id, id),
  UNIQUE (owner_id, company_id, idempotency_key)
);

CREATE INDEX marketing_campaigns_objective_idx
  ON marketing_campaigns (owner_id, company_id, objective_id);

CREATE TABLE marketing_artifacts (
  owner_id uuid NOT NULL,
  company_id uuid NOT NULL,
  id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  deliverable_id uuid NOT NULL,
  version integer NOT NULL,
  status text NOT NULL,
  content_digest char(64) NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, company_id, id),
  UNIQUE (owner_id, company_id, deliverable_id, version),
  FOREIGN KEY (owner_id, company_id, campaign_id)
    REFERENCES marketing_campaigns (owner_id, company_id, id)
);

CREATE INDEX marketing_artifacts_campaign_idx
  ON marketing_artifacts (owner_id, company_id, campaign_id);
