# Sequence Learning

Sequence learning records bounded ordered action windows. The implementation
limits sequence length, stores frequency, success rate, average interval,
confidence, and related project/workflow references.

Repeated high-confidence sequences can create a `SEQUENCE_PATTERN` learning
candidate and a workflow suggestion. Execution remains governed by the existing
Workflow Engine and approval system.
