/**
 * brepjs/io — Import and export in CAD and mesh formats.
 *
 * @example
 * ```typescript
 * import { importSTEP, exportSTEP, exportGltf } from 'brepjs/io';
 * ```
 */

// ── Import ──

export { importSTEP, importSTL, importIGES } from './io/importFns.js';

// ── Export ──

export { exportOBJ } from './io/objExportFns.js';

export {
  exportGltf,
  exportGlb,
  type GltfMaterial,
  type GltfExportOptions,
} from './io/gltfExportFns.js';

export {
  exportDXF,
  blueprintToDXF,
  type DXFEntity,
  type DXFExportOptions,
} from './io/dxfExportFns.js';

export { exportThreeMF, type ThreeMFExportOptions } from './io/threemfExportFns.js';

export { importSVGPathD, importSVG, type SVGImportOptions } from './io/svgImportFns.js';
