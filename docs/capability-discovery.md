# Capability Discovery

Capability discovery produces adapter capability records for trusted
applications. Capabilities are semantic categories such as navigation, editing,
searching, saving, opening files, sidebar navigation, terminal input, selection,
semantic registry, state inspection, and event subscription.

Planner-visible capabilities are computed from granted adapter permissions.
For example, terminal input maps to `execute_commands` and is high risk; it is
not exposed as planner-visible unless the owner grants the matching permission
and later policy approvals are satisfied.

Capability refreshes record application events, metrics, and governance audit
events. Discovery must never inspect pixels, OCR, screenshots, arbitrary app
content, hidden DOM text, or caller-supplied executable paths.
