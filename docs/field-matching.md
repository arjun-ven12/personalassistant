# Semantic Field Matching

`FieldMatchingService` resolves fields from registered semantic metadata:

- accessibility label
- accessibility identifier
- field key
- aliases
- semantic tags
- role
- context object
- hierarchy

Ambiguous matches are not guessed. The response includes a clarification prompt
that names the matching controls and their context.

Baseline field mapping currently registers the dashboard Global Command Palette
as a safe search field. Native application fields must be registered by a
reviewed semantic provider before they can be interacted with.
