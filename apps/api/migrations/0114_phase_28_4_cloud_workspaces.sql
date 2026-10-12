-- Infrastructure extension only; Engineering objectives/tasks remain canonical.
CREATE TABLE IF NOT EXISTS engineering_cloud_workspaces (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
 company_id uuid NOT NULL REFERENCES companies(id),
 repository_id uuid NOT NULL,
 version integer NOT NULL CHECK (version >= 0),
 state text NOT NULL CHECK (state IN ('REQUESTED','PROVISIONING','BOOTING','AUTHENTICATING','READY','BUSY','SUSPENDING','SUSPENDED','FAILED','DESTROYED')),
 expires_at timestamptz NOT NULL,
 record jsonb NOT NULL,
 UNIQUE(owner_id,company_id,repository_id)
);
CREATE INDEX IF NOT EXISTS engineering_cloud_cleanup ON engineering_cloud_workspaces(expires_at) WHERE state <> 'DESTROYED';
