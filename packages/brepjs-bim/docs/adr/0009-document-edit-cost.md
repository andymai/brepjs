# ADR-0009: Validation cost for repeated document edits

**Status**: Deferred
**Date**: 2026-11-26
**Authors**: viktar-b

## Context

Step 3 validates a proposed document before committing edits. A containment assignment copies both maps, snapshots the storey's growing member list and validates the graph. A reparent operation also copies both maps and validates the graph.

On occt-wasm, assigning 2,000 Members to one storey took 5 ms on step 2 (`61a8f8eb`) and 1,080 ms on the initial step-3 implementation (`3a0005bd`). Reparenting all 2,000 Members took another 1,108 ms on step 3. At 1,000 Members those step-3 operations took 252 and 256 ms. Each measurement covers all Members. The solid adoption phase was timed separately.

## Decision for future review

Keep full-graph validation as the correctness reference. Compare validating affected edges and ancestor chains with staging a group of edits in one transaction. Review the change in the document layer after profiling a workload that includes containment transfer, deep placement chains and failed edits. Decide whether the measured costs justify a public batch operation.

## Acceptance

- Run `node packages/brepjs-bim/scripts/benchmarkDocumentEdits.mjs` after building the workspace. Record the kernel, runtime and separate adoption, containment and reparent durations at 250, 500, 1,000 and 2,000 Members. Repeat on the same machine and compare scaling.
- Run the candidate and reference validator on the same successful and rejected edits. Compare graph state, revision, prior frame snapshots, Body ownership and release counts. Include a mixed decomposition cycle and a failed edit at the end of a group.
- For a batch proposal, specify when references become visible and how failed adoption returns ownership. For incremental validation, demonstrate that an indirect dependant still blocks an invalid edit.

[Document placement and edit invariants](0004-document-resolved-placement-and-datum.md) · [Benchmark](../../scripts/benchmarkDocumentEdits.mjs)
