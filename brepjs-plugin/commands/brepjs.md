---
description: Generate CAD models using expert methodology
argument-hint: <model description>
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Task, AskUserQuestion]
model: sonnet
---

# /brepjs

5-phase workflow: Clarify → Explore → Design → Implement → Validate

## Phase 1: Requirements

Ask:

- What goes INTO/ONTO/THROUGH this part?
- Dimensions, tolerances?
- Manufacturing method?
- Complexity level?

Output: Functional requirements

## Phase 2: Exploration

Launch brepjs-modeler agent:

```
Explore examples/ for patterns relevant to: [description]
Report: files found, complexity, recommended workflow
```

## Phase 3: Design (Approval Required)

Agent presents 2-3 approaches:

- B-REP operations
- Profile complexity
- Stability/flexibility ratings
- Trade-offs

Use AskUserQuestion for approval.

## Phase 4: Implementation

Generate TypeScript file:

- Parametric interface
- Expert thinking comments
- Validation code
- STL export

## Phase 5: Validation (Approval Required)

Auto-hook validates:

- Runs file
- Analyzes STL
- Shows report + ASCII preview

Use AskUserQuestion for confirmation.

## Error Recovery

| Error            | Recovery            |
| ---------------- | ------------------- |
| Profile > 80 pts | Auto-simplify       |
| Boolean fails    | Try heal()          |
| Loft crashes     | Fallback to extrude |

Report recoveries to user.
