# Programming by Demonstration

Phase 17D uses semantic programming by demonstration.

Instead of:

1. move mouse
2. click
3. type

the timeline stores:

1. focus field “Project Name”
2. set value
3. click Save
4. wait until dialog closes

This makes demonstrated workflows reusable, editable, auditable, and resilient
to layout changes. Demonstrations are deterministic and do not require LLM
reasoning during recording.
