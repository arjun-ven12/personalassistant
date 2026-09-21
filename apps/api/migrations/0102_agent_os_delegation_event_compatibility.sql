ALTER TABLE agent_runtime_events
  DROP CONSTRAINT IF EXISTS agent_runtime_events_event_type_check;

ALTER TABLE agent_runtime_events
  ADD CONSTRAINT agent_runtime_events_event_type_check CHECK (event_type IN (
    'AgentCreated',
    'AgentStarted',
    'AgentPaused',
    'AgentResumed',
    'AgentCompleted',
    'AgentFailed',
    'CapabilityLoaded',
    'ToolInvoked',
    'MemoryUpdated',
    'KnowledgeRetrieved',
    'WorkflowJoined',
    'WorkflowLeft',
    'ContextPackaged',
    'DelegationStarted',
    'DelegationCompleted',
    'DelegationFailed',
    'ConfigurationChanged',
    'PackageValidated'
  ));
