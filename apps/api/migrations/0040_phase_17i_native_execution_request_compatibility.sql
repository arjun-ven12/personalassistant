ALTER TABLE execution_requests
  DROP CONSTRAINT IF EXISTS execution_requests_tool_name_check;

ALTER TABLE execution_requests
  ADD CONSTRAINT execution_requests_tool_name_check CHECK (tool_name IN (
    'workspace.inspect_metadata',
    'workspace.read_file',
    'git.status',
    'git.diff',
    'git.current_branch',
    'repository.scan_metadata',
    'workspace.apply_patch',
    'workspace.validate_profile',
    'native.provider_capability'
  ));
