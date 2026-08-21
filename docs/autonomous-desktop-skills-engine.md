# Autonomous Desktop Skills Engine

Phase 17F is the capstone of the semantic desktop automation layer. It lets the
assistant resolve goals to approved reusable desktop skills and orchestrate them
as deterministic workflow graphs.

The engine composes existing subsystems:

- Demonstration Learning supplies approved/saved reusable skills.
- Universal Application Adapters expose trusted application capabilities and
  permissions.
- Semantic Desktop Model, Navigation, and Interaction provide deterministic
  object-level execution surfaces.
- Planner, Voice, Gesture, Agents, and Browser workflows call the same desktop
  skill execution API.

The engine does not introduce a generic executor. It does not use pixels, OCR,
computer vision, coordinate replay, shell, AppleScript, code injection, hidden
capabilities, or unrestricted Accessibility.

## Execution flow

1. Resolve a goal to exactly one approved planner-visible skill.
2. Validate required variables, trusted application adapters, permissions,
   capabilities, and skill health.
3. Build a deterministic directed execution graph.
4. Schedule semantic steps.
5. Pause for approval checkpoints when high-risk permissions are required.
6. Verify each step semantically.
7. Preserve execution context, metrics, recovery suggestions, and audit records.

If preconditions fail, execution does not begin.
