# Execution Graph

The execution graph is a directed deterministic representation of a desktop
workflow. Nodes represent skills, waits, conditions, approval checkpoints,
parallel groups, recovery actions, or notifications. Edges represent sequential,
parallel-join, conditional, or recovery dependencies.

Graph records explicitly store that pixel automation, coordinate replay, and OCR
were not used. Dependent steps may proceed only after their semantic
dependencies are satisfied and verified.

Future native providers must attach to this graph model through the Universal
Application Adapter Framework and Desktop Capability Layer, not by adding a
parallel automation path.
