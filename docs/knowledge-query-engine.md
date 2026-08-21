# Knowledge Query Engine

The query engine supports:

- exact entity lookup
- alias lookup
- bounded search
- neighborhood expansion
- bounded path search
- context assembly for Human Understanding and Planner

All traversal is bounded by depth and result limits. The implementation uses
PostgreSQL-backed tables and in-memory maps for tests/development. Future
ranking can use existing retrieval infrastructure, but graph decisions remain
deterministic and explainable.

