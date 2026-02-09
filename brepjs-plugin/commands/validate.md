---
description: Execute brepjs model and validate output geometry
argument-hint: <file.ts>
allowed-tools: [Bash, Read]
model: haiku
---

# /brepjs:validate

Run TS file and validate STL output.

```bash
cd "$(dirname "$FILE")"
npx tsx "$(basename "$FILE")"

# Find generated STL
STL=$(find . -name "*.stl" -newer "$FILE" | head -1)

# Analyze
node "${CLAUDE_PLUGIN_ROOT}/scripts/analyze-stl.js" "$STL"
```

Reports: Execution status, geometry validity, mesh quality, dimensions.
