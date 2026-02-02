# Text

Layer 3 font loading and text-to-blueprint conversion.

## Key Files

| File                | Description                                                                                                                                                                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `textBlueprints.ts` | **loadFont(path\|ArrayBuffer, fontFamily?, force?)** loads TrueType/OpenType fonts into registry. **getFont(fontFamily?)** retrieves loaded font. **textBlueprints(text, options?)** converts text string to Blueprints (2D curves). **sketchText(text, textConfig?, planeConfig?)** creates Sketches on a plane. |

## Gotchas

1. **Font loading required**: Must call `loadFont()` before using text functions, otherwise throws error.
2. **Font registry**: Fonts are keyed by family name — calling `loadFont()` with same family overwrites previous font unless `force: false` is passed.
3. **Coordinate flipping**: Text Y-axis is flipped for CAD conventions (mirror transformation applied internally).
4. **2D output**: `textBlueprints()` returns 2D Blueprints — use `.sketchOnPlane()` or `sketchText()` to create 3D sketches, then `.extrude()` for 3D text.
