# Workspace security

The registry controls workspace ID, absolute root, enabled state, permissions,
and blocked patterns. The browser and Electron renderer cannot replace the
root.

Phase 3.2 adds local workspace-mapping confirmation in the Mac agent. The
confirmation records only a timestamp in assistant-owned non-secret metadata;
it does not give the renderer a file browser, path reader, or filesystem API.
Execution requests still use only the server-registered workspace ID and root.

The Mac agent resolves the signed root with `realpath`, rejects `/`, system
roots, `/Users`, and a complete home directory, and requires a directory. File
inputs are one normalised relative path with no absolute prefix, drive letter,
null byte, empty, `.` or `..` segment, wildcard, glob, or multiple selection.

Every component is checked with `lstat`. Phase 3.1 rejects symlinked files and
parents even when they remain inside the workspace. Final containment uses path
boundaries, not string prefixes. Directories, sockets, FIFOs, devices, binary
files, invalid UTF-8, oversized files, and missing files fail closed.

Mandatory patterns cover `.env`, key files, SSH/cloud credentials,
package-manager auth, service accounts, and Keychain-related paths. The API and
agent both enforce them. Obvious inline private keys, bearer tokens,
credentialed database URLs, and common GitHub/OpenAI/AWS tokens are redacted.
This is defense in depth, not perfect secret detection. Contents never enter
audit metadata.

TOCTOU risk is reduced through symlink rejection, metadata checks, read-only
descriptors, and bounded operations. This does not provide snapshot semantics
against another local process concurrently replacing a regular file.
