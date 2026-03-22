/**
 * Namespace: io — import and export operations
 * (Named ioNs to avoid collision with existing src/io.ts)
 */

// Exports
export { exportSTEP, exportSTL, exportIGES } from '@/topology/meshFns.js';
export { exportOBJ } from '@/io/objExportFns.js';
export { exportGltf, exportGlb } from '@/io/gltfExportFns.js';
export { exportDXF, blueprintToDXF } from '@/io/dxfExportFns.js';
export { exportThreeMF } from '@/io/threemfExportFns.js';
export { exportSTEPConfigured } from '@/io/stepConfigFns.js';
export { exportAssemblySTEP } from '@/operations/exporterFns.js';

// Imports
export { importSTEP, importSTL, importIGES } from '@/io/importFns.js';
export { importDXF } from '@/io/dxfImportFns.js';
export { importOBJ } from '@/io/objImportFns.js';
export { importThreeMF } from '@/io/threemfImportFns.js';
export { importGLB } from '@/io/gltfImportFns.js';
export { importSVGPathD, importSVG } from '@/io/svgImportFns.js';
