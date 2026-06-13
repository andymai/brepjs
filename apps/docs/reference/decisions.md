---
title: Design Decisions
description: 'Index of architectural decision records: short ADRs explaining context, choice, alternatives, and consequences for major decisions.'
---

# Design Decisions

The brepjs repository tracks architectural decision records (ADRs) under `docs/decisions/`. Each ADR is a short markdown document explaining one decision: the context, the choice, the alternatives, and the consequences. This chapter is the index.

## Why ADRs

Architecture decisions accumulate over a project's lifetime. Without records, future contributors (and future me) have to reverse-engineer the decision from the code, often missing the context that justified it. ADRs make the rationale durable: they survive when the original author forgets, leaves, or simply moves on.

The brepjs ADRs are intentionally short, typically a page or two each. Longer than a comment, shorter than a chapter.

## The ADRs

| ID   | Title                                                                                                                           | Summary                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 0001 | [Layered architecture](https://github.com/andymai/brepjs/blob/main/docs/decisions/0001-layered-architecture.md)                 | Why imports flow downward only, what each layer contains                                |
| 0002 | [Kernel abstraction](https://github.com/andymai/brepjs/blob/main/docs/decisions/0002-kernel-abstraction.md)                     | Why brepjs has a `KernelInterface` rather than coupling to OpenCascade directly         |
| 0003 | [Branded types](https://github.com/andymai/brepjs/blob/main/docs/decisions/0003-branded-types.md)                               | Why `Edge`, `Wire`, `Face` are nominal not structural types                             |
| 0004 | [Phantom dimension types](https://github.com/andymai/brepjs/blob/main/docs/decisions/0004-phantom-dimension-types.md)           | Why shapes carry a `D extends '2D' \| '3D'` parameter                                   |
| 0005 | [Topological validity types](https://github.com/andymai/brepjs/blob/main/docs/decisions/0005-topological-validity-types.md)     | Why `ClosedWire`, `OrientedFace`, `ManifoldShell`, `ValidSolid` exist as separate types |
| 0006 | [Domain boundaries](https://github.com/andymai/brepjs/blob/main/docs/decisions/0006-domain-boundaries.md)                       | How Layer 2 modules relate to each other (peer imports allowed)                         |
| 0007 | [Kernel interface segregation](https://github.com/andymai/brepjs/blob/main/docs/decisions/0007-kernel-interface-segregation.md) | Why `KernelInterface` is decomposed into smaller fragments                              |
| 0008 | [Layer 1 core audit](https://github.com/andymai/brepjs/blob/main/docs/decisions/0008-layer1-core-audit.md)                      | Audit of what belongs in `core/` vs higher layers                                       |
| 0009 | [Tolerance as type parameter](https://github.com/andymai/brepjs/blob/main/docs/decisions/0009-tolerance-as-type-parameter.md)   | Whether tolerance should be encoded in the type system                                  |
| 0010 | [Layer 2 domain audit](https://github.com/andymai/brepjs/blob/main/docs/decisions/0010-layer2-domain-audit.md)                  | Audit of what belongs in each Layer 2 module                                            |
| 0011 | [Geometric validity brands](https://github.com/andymai/brepjs/blob/main/docs/decisions/0011-geometric-validity-brands.md)       | The validity brand system (extending 0005 with concrete patterns)                       |

The list grows as decisions accumulate. The full directory is the source of truth.

## ADR template

When proposing a new architectural decision, copy `docs/decisions/template.md` and fill it in:

```markdown
# ADR NNNN: Title

## Status

Proposed | Accepted | Superseded by NNNN | Deprecated

## Context

What's the situation that requires a decision? What are the constraints?

## Decision

What did we decide to do?

## Alternatives considered

What other options were on the table? Why weren't they chosen?

## Consequences

What does this enable? What does it constrain? What follow-up work does it imply?
```

Status starts at `Proposed`, transitions to `Accepted` when merged. Deprecation or supersession adds new ADRs that point back at the original.

## When to write an ADR

Roughly: when a decision affects more than one module, when there's a real alternative someone might choose differently, when the rationale isn't obvious from the code. Examples:

- Adding a new layer or moving a module between layers
- Introducing a new kind of brand or type-level enforcement
- Choosing between two approaches with different long-term consequences (e.g. "should tolerance be a type parameter or a runtime field?")
- Defining a public API contract (e.g. "what's the canonical surface for query operations?")

Don't write an ADR for routine code changes: bug fixes, performance improvements, dependency bumps. The git history is enough for those.

## Reading order

If you want to understand the brepjs architecture from first principles:

1. **0001: Layered architecture**: the foundation
2. **0002: Kernel abstraction**: why the kernel is replaceable
3. **0003: Branded types**: the type-system foundation
4. **0004: Phantom dimension types**: extends 0003 for 2D/3D safety
5. **0005: Topological validity types** + **0011: Geometric validity brands**: the validity layer
6. **0006: Domain boundaries** + **0008, 0010: audits**: what's in each module

The rest are deeper drills into specific subsystems.

## Next steps

- [Architecture & Layers](../extending/architecture): the user-facing summary of these decisions
- [Types That Prove Geometry Is Valid](../concepts/types): the type system the ADRs justify
- [GitHub repository](https://github.com/andymai/brepjs): for the latest ADRs
