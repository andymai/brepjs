---
description: Analyze STL mesh quality and dimensions
argument-hint: <file.stl>
allowed-tools: [Read, Bash]
model: haiku
---

# /brepjs:analyze

Quick STL analysis.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/analyze-stl.js" "$1"
```

Reports:

- File size, triangles
- Dimensions, volume
- Edge lengths
- Degenerate triangles
- ASCII preview
