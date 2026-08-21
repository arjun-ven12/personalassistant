# Adapter Plugin Architecture

Adapter plugins are optional extensions for applications that need deeper
semantic integration. A plugin may expose additional semantic objects, custom
commands, domain-specific workflows, application APIs, enhanced navigation, or
language-specific understanding.

Plugins do not replace the generic adapter. The generic semantic interface must
remain available for every trusted application, and plugins must route through
the same authentication, permission, policy, approval, audit, and Desktop
Capability Layer boundaries.

Plugins must not inject code into applications, bypass macOS permissions,
accept executable paths, expose generic OS automation, or modify user-created
skills/workflows without approval.
