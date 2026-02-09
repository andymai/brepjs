# brepjs Plugin

Generate CAD models using expert methodology.

## Installation

```bash
claude-code plugins add ./brepjs-plugin
claude-code plugins list | grep brepjs
```

## Commands

### `/brepjs <description>`

5-phase workflow: Clarify → Explore → Design → Implement → Validate

- Asks functional questions (INTO/ONTO/THROUGH?)
- Presents 2-3 approaches with trade-offs
- Generates parametric TypeScript
- Auto-validates geometry

### `/brepjs:analyze <file.stl>`

Quick STL analysis (dimensions, mesh quality, ASCII preview)

### `/brepjs:validate <file.ts>`

Run model and validate output

### `/brepjs:export <format>`

Export to STEP/GLTF/OBJ/SVG

## Agents

**brepjs-modeler** (sonnet) - Decomposes designs into B-REP operations

- Workflow selection: extrude/loft/revolve/sweep
- Profile management: < 80 points
- Auto-recovery on errors

**brepjs-validator** (haiku) - Validates geometry

- Checks: execution, volume, mesh quality, dimensions
- ASCII preview generation

## Key Patterns

**Profile Complexity:**

- Safe: < 60 points
- Risky: 60-80 points
- Fatal: > 100 points (auto-simplifies)

**Helical Geometry:**

```typescript
// ✓ Use loft (smooth)
loft([bottomWire, topWire], { ruled: false });

// ✗ Never stacked slices (stair-stepping)
```

**Functional Requirements:**

- INTO → HOLLOW
- ONTO → SOLID with mounting
- THROUGH → HOLLOW channel

## Examples

Progressive: `examples/progressive/01-04` (simple → complex)
Functional: `examples/functional/` (real-world parts)

## Requirements

- brepjs >= 1.0.0
- Node.js >= 18
- TypeScript >= 5.0.0
