# Athena Four Foundations Engineering Program

> Program version 0.1 · 2026-10-26 · INTERNAL REVIEW DRAFT
> Only MCP-1A is authorized for implementation in this run. Other foundations are designs and acceptance plans.

## Mission and scope

Build reusable governed infrastructure for external tool compatibility, engineering-model research, model lifecycle management and computational optimization. The shared invariant is that proposals, observations, credits, models and research artifacts never grant execution authority. Human and deterministic governance remain authoritative.

The current delivery is a program architecture plus one bounded implementation: **MCP-1A, trusted local read-only stdio compatibility**. No remote server, credentials, side-effect tool, GPU training, weights download, model deployment or quantum job is authorized. The later acceptance matrices are requirements rather than completed results.

## Program sequence

1. Baseline and architectural decisions across all four workstreams.
2. MCP-1A: one reviewed local server/tool, initialization, validated discovery/invocation, existing company/workspace permissions, bounded transport, cancellation and audit.
3. MCP-1B/2: reviewed registration/version lifecycle and resource accounting with persistent authorization tests; remote connectivity follows SSRF/credential review.
4. CODER-1 and MODEL-1 as separately reviewable offline vertical slices, once accepted-example rights and artifact storage decisions are approved.
5. QUANTUM-1: validated binary optimization and independently verified classical experiments, without quantum-advantage claims.
6. Only then consider remote tools, staging/canary serving, GPU pilots or quantum providers under separate reviewed approvals.

Each slice carries contract, implementation, runtime composition, appropriate persistence, negative tests, acceptance artifact, rollback instructions and a narrowly scoped capability claim. The four foundations should not become four new planners, identity systems, authorization engines or databases.

## Deliverable and release policy

This directory contains the program source, baseline, ADRs, threat model, individual plans, dependency graph, risks and acceptance evidence. `implementation-logs/` separates pre-change evidence from new checks. The institutional register remains canonical for claim IDs; historical audit evidence is preserved and current additions are versioned.

Release decision for the implementation will be recorded after tests. READY_FOR_REVIEW means a concrete bounded change can be reviewed; it does not authorize merging, publishing, production enablement or promotion. A fixture receipt verifies local compatibility only.
