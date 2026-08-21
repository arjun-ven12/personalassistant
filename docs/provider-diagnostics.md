# Provider Diagnostics

The Mac Agent provider host reports:

- host version;
- native bridge status;
- Accessibility trust status;
- provider implementation coverage;
- unsupported capability coverage;
- raw automation availability flags, all fixed to `false`.

Provider execution results include:

- provider ID;
- application ID;
- capability;
- status;
- verification summary;
- result summary;
- error code;
- latency;
- native bridge usage, currently always `false`.

Diagnostics must not include secrets, raw Accessibility dumps, screenshots,
filesystem contents, command output, passwords, tokens, cookies, or sensitive
action arguments.
