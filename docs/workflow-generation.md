# Workflow Generation

`WorkflowGenerationService` behavior is implemented inside the Phase 17D
Demonstration Learning layer.

On stop recording, the service deterministically creates:

- a semantic workflow timeline;
- inferred parameters;
- workflow dependencies;
- validation records;
- a review-required generated skill;
- version history;
- analytics and optimization suggestions.

Parameter detection looks for non-secret values such as repository, branch, URL,
application, workspace, environment, file, and folder. Parameters default to
`ask_each_execution` until the owner changes the policy.

No coordinate playback is generated.
