# MCP-1A test-first implementation record

2026-10-26. Protocol, transport and service tests were written before their implementation modules. Initial focused run exited 1 with three suites unable to load the absent modules (RED). The first implementation pass exposed composition placement, default-filled fixture inputs and test-loader resolution errors. These were corrected without changing existing source behavior.

The next focused pass ran 35 passing tests, including actual SDK stdio and API composition. Expanded security/config tests then ran 45 passing tests with one disposable PostgreSQL test skipped. Later full results are authoritative in the acceptance log; these intermediate counts do not establish live or deployed compatibility.

Source inspection of PostgreSQL CHECK constraints required migration 0111, despite no new tables/stores. The design was amended to record that prerequisite. No production database or remote server was used.
