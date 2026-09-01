-- Phase 25.3 organizational completion: departments remain company-scoped,
-- while agent identities remain reusable catalog definitions.

ALTER TABLE departments ADD COLUMN IF NOT EXISTS parent_department_id uuid;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS manager_assignment_id uuid;

UPDATE departments
SET parent_department_id = NULLIF(record->>'parentDepartmentId','')::uuid
WHERE parent_department_id IS NULL AND NULLIF(record->>'parentDepartmentId','') IS NOT NULL;

UPDATE departments
SET manager_assignment_id = NULLIF(record->>'managerAssignmentId','')::uuid
WHERE manager_assignment_id IS NULL AND NULLIF(record->>'managerAssignmentId','') IS NOT NULL;

CREATE INDEX IF NOT EXISTS departments_company_status_idx
  ON departments(owner_id,company_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS departments_company_parent_idx
  ON departments(owner_id,company_id,parent_department_id);

CREATE OR REPLACE FUNCTION alexa_enforce_company_department() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM organizations o
    WHERE o.id=NEW.organization_id AND o.owner_id=NEW.owner_id AND o.company_id=NEW.company_id
  ) THEN RAISE EXCEPTION 'department organization crosses company boundary'; END IF;
  IF NEW.parent_department_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM departments parent
    WHERE parent.id=NEW.parent_department_id AND parent.owner_id=NEW.owner_id
      AND parent.company_id=NEW.company_id
  ) THEN RAISE EXCEPTION 'department parent crosses company boundary'; END IF;
  IF NEW.manager_assignment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM company_agent_assignments manager
    WHERE manager.id=NEW.manager_assignment_id AND manager.owner_id=NEW.owner_id
      AND manager.company_id=NEW.company_id AND manager.status<>'REVOKED'
  ) THEN RAISE EXCEPTION 'department manager crosses company boundary'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_company_department ON departments;
CREATE CONSTRAINT TRIGGER enforce_company_department
  AFTER INSERT OR UPDATE ON departments DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION alexa_enforce_company_department();

CREATE OR REPLACE FUNCTION alexa_enforce_company_agent_assignment() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM companies c
    WHERE c.id=NEW.company_id AND c.owner_id=NEW.owner_id
  ) THEN RAISE EXCEPTION 'company assignment owner mismatch'; END IF;
  IF NEW.department_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM departments d
    WHERE d.id=NEW.department_id AND d.owner_id=NEW.owner_id
      AND d.company_id=NEW.company_id AND COALESCE(d.record->>'status','active')<>'archived'
  ) THEN RAISE EXCEPTION 'assignment department crosses company boundary'; END IF;
  IF NEW.manager_assignment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM company_agent_assignments m
    WHERE m.id=NEW.manager_assignment_id AND m.owner_id=NEW.owner_id
      AND m.company_id=NEW.company_id AND m.status<>'REVOKED'
  ) THEN RAISE EXCEPTION 'manager assignment crosses company boundary'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
