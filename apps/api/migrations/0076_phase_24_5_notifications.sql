CREATE TABLE IF NOT EXISTS notification_subscriptions (
  device_id uuid PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  record jsonb NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS notification_subscriptions_owner_idx
  ON notification_subscriptions(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS notification_preferences (
  owner_id uuid PRIMARY KEY,
  record jsonb NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  category text NOT NULL,
  dedupe_key text NOT NULL,
  outcome text NOT NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS notification_deliveries_dedupe_idx
  ON notification_deliveries(owner_id, device_id, dedupe_key, created_at DESC);
CREATE INDEX IF NOT EXISTS notification_deliveries_rate_idx
  ON notification_deliveries(owner_id, device_id, created_at DESC);
