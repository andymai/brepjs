# brepjs Plugin Architecture

## Core Principle

Expert CAD decomposition before code generation.

## Component Hierarchy

```
/brepjs → brepjs-modeler (exploration, design, implementation)
       → brepjs-validator (validation)
       → Post-write hook (auto-validation)
```

## Workflow Phases

1. **Requirements** - Ask INTO/ONTO/THROUGH, dimensions, manufacturing
2. **Exploration** - Search examples/, identify patterns, estimate complexity
3. **Design** - Present 2-3 approaches, get user approval
4. **Implementation** - Generate parametric TypeScript
5. **Validation** - Auto-validate geometry, get user confirmation

## Agent Coordination

**brepjs-modeler** (sonnet)

- Phase 2-4: Exploration → Design → Implementation
- Self-contained CAD methodology
- References examples/ for patterns

**brepjs-validator** (haiku)

- Phase 5: Validation
- Execution + geometry + mesh checks
- ASCII preview generation

## Error Recovery

| Error            | Recovery                   |
| ---------------- | -------------------------- |
| Profile > 80 pts | Auto-reduce points/feature |
| Boolean fails    | Try heal() first           |
| Loft crashes     | Fallback to extrude        |
| WASM not init    | Add initFromOC()           |

## Hook System

**Post-Write Hook**

- Trigger: Write on \*.ts with brepjs imports
- Action: Run file, analyze STL, report
- Non-blocking (exit 0)

## Design Decisions

| Aspect   | Choice              | Rationale           |
| -------- | ------------------- | ------------------- |
| Entry    | Single /brepjs      | Simple              |
| Workflow | 5-phase + gates     | User control        |
| Agents   | Modeler + validator | Specialized         |
| Model    | Sonnet/Haiku split  | Cost optimization   |
| Examples | Progressive series  | Learn by complexity |

## Critical Patterns

**Helical:** ALWAYS loft, NEVER slices
**Profile:** < 60 safe, 60-80 risky, > 80 fatal
**Functional:** INTO=hollow, ONTO=solid, THROUGH=channel
**Gears:** Profile at pitch circle, 6 pts/tooth max
