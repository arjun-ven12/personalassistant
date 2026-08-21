# Learning Events

Learning events are first-class, owner-scoped, structured records. They capture
category, subject, observed value, expected value, positive/negative evidence,
source type, bounded context, and safe source references.

Events are not raw logs. Private mode and `doNotLearn` skip persistence and
create only a bounded audit event. Metadata is filtered for secret-like keys.

Supported sources include Human Understanding, corrections, workflow results,
application/project/agent selections, response feedback, knowledge graph
updates, manual teaching, voice, gesture, dashboard, and API events.
