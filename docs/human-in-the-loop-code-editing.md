# Human-in-the-loop code editing

Phase 5.1 introduces code-editing support through explicit owner-approved
patches. The assistant may generate patch proposals, but no file is modified
until the owner approves and executes the exact patch.

## Lifecycle

1. Generate a patch proposal with strict file operations.
2. Review the unified diff, risk score, affected files, and impact metadata.
3. Approve, reject, or cancel the patch.
4. Approved patches receive a one-time approval token shown to the owner.
5. Execution creates a signed `workspace.apply_patch` request for a trusted Mac
   agent.
6. The Mac agent verifies the patch digest, workspace, relative paths, blocked
   patterns, expected original hashes, and approval token before writing.
7. The result includes rollback snapshots and validation flags.

## Security boundary

There is no generic filesystem endpoint. The only write-capable execution tool
is `workspace.apply_patch`, and it accepts only the exact stored patch
operations approved by the owner.

The API never silently executes a patch during generation. Execution requires:

- authenticated owner session
- trusted origin
- CSRF token
- private-network verification
- repository ownership
- patch status `APPROVED`
- approval token hash match
- governance approval for the exact patch action digest
- signed server execution envelope
- trusted Mac-agent signature on the result
- emergency-stop and policy checks

## Current limitations

The first patch generator accepts explicit operations and produces a reviewable
unified diff. Later phases can connect richer code generation to the same
proposal endpoint. Rollback snapshots are returned in the execution result; a
dedicated rollback execution endpoint can be layered onto the same patch
operation model.
