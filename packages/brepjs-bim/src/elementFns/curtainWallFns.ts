import { polygon, extrude, isValidSolid } from 'brepjs';
import type { ValidSolid, Result } from 'brepjs';
import { ok, err } from 'brepjs';
import type { CurtainWallSpec } from '../specs/curtainWallSpec.js';
import type { BimError } from '../errors/bimError.js';
import { fromBrepError, geometryError } from '../errors/bimError.js';
import { reportedGeometryCleanup } from '../geometryCleanupDiagnostics.js';
import {
  failedResources,
  generationFailure,
  uncertainGeneratedResources,
  type GeneratedResource,
} from '../geometryGeneration.js';
import { cleanupOwnedResources, cleanupReport } from '../productBodyCleanup.js';
import { wrappedResourceObject } from '../types/productBody.js';

interface CurtainGenerationScope {
  itemIndex: number;
  readonly temporaries: GeneratedResource[];
  readonly outputs: GeneratedResource[];
}

function registerResource<T extends Disposable>(
  owned: GeneratedResource[],
  resource: T,
  itemIndex: number
): T {
  const item: GeneratedResource = { resource, itemIndex, nativeResource: undefined };
  owned.push(item);
  // Retain ownership even if identity capture throws; never read it after cleanup.
  item.nativeResource = wrappedResourceObject(resource);
  return resource;
}

/**
 * A placed box component of the curtain wall. `origin` is the corner of the box
 * in the wall's local frame (X across the wall, Y through its depth, Z up);
 * `size` is its extent along each local axis (all mm). The owning IfcPlate /
 * IfcMember placement carries `origin`; `solid` is the local-origin template
 * geometry (corner at 0,0,0).
 */
export interface CurtainWallComponent {
  readonly origin: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly solid: ValidSolid;
}

/** A curtain wall decomposed into glazing panels (plates) and mullions (members). */
export interface CurtainWallGrid {
  readonly panels: readonly CurtainWallComponent[];
  readonly mullions: readonly CurtainWallComponent[];
}

// Builds a single axis-aligned box solid with one corner at the local origin,
// extending by [sizeX, sizeY, sizeZ]. Returned solid is unplaced template
// geometry; placement is applied IFC-side.
function boxSolid(
  scope: CurtainGenerationScope,
  sizeX: number,
  sizeY: number,
  sizeZ: number
): Result<ValidSolid, BimError> {
  const itemIndex = scope.outputs.length;
  scope.itemIndex = itemIndex;
  const profileResult = polygon([
    [0, 0, 0],
    [sizeX, 0, 0],
    [sizeX, sizeY, 0],
    [0, sizeY, 0],
  ]);
  if (!profileResult.ok) {
    return err(
      fromBrepError(
        profileResult.error,
        'CURTAIN_WALL_PROFILE_FAILED',
        'Failed to create component profile'
      )
    );
  }
  const profile = registerResource(scope.temporaries, profileResult.value, itemIndex);
  const solidResult = extrude(profile, [0, 0, sizeZ]);
  if (!solidResult.ok) {
    return err(
      fromBrepError(solidResult.error, 'CURTAIN_WALL_EXTRUDE_FAILED', 'Failed to extrude component')
    );
  }
  const solid = registerResource(scope.outputs, solidResult.value, itemIndex);
  if (!isValidSolid(solid)) {
    return err(
      geometryError(
        'CURTAIN_WALL_INVALID_SOLID',
        'Extruded curtain wall component failed validity check'
      )
    );
  }
  return ok(solid);
}

/**
 * Decomposes a curtain wall spec into its panel (plate) and mullion (member)
 * geometry. Mullions run along every vertical grid line (columns + 1 of them)
 * and every horizontal grid line (rows + 1); panels fill the cells between
 * adjacent mullions. The mullion section is centred on each grid line.
 *
 * Geometry is laid out in the wall's local frame: X across the wall, Z up, Y
 * through the depth. Each component's local-origin solid is returned alongside
 * its placement origin so the IFC writer can emit one IfcLocalPlacement per
 * component.
 */
function buildCurtainWallGrid(
  spec: CurtainWallSpec,
  scope: CurtainGenerationScope
): Result<CurtainWallGrid, BimError> {
  const { width, height, columns, rows, panelThickness, mullionWidth, mullionDepth } = spec;

  const cellWidth = width / columns;
  const cellHeight = height / rows;
  const halfMullion = mullionWidth / 2;

  // Each panel fills its cell inset by half a mullion on every side so the
  // mullions and panels share the same grid lines without overlapping.
  const panelWidth = cellWidth - mullionWidth;
  const panelHeight = cellHeight - mullionWidth;
  if (panelWidth <= 0 || panelHeight <= 0) {
    return err(
      geometryError(
        'CURTAIN_WALL_DEGENERATE_PANEL',
        'mullionWidth leaves no room for panels in the grid'
      )
    );
  }

  const panels: CurtainWallComponent[] = [];
  const mullions: CurtainWallComponent[] = [];

  for (let c = 0; c < columns; c++) {
    for (let r = 0; r < rows; r++) {
      const solidResult = boxSolid(scope, panelWidth, panelThickness, panelHeight);
      if (!solidResult.ok) {
        return err(solidResult.error);
      }
      panels.push({
        origin: [c * cellWidth + halfMullion, 0, r * cellHeight + halfMullion],
        size: [panelWidth, panelThickness, panelHeight],
        solid: solidResult.value,
      });
    }
  }

  // Vertical mullions: full-height bars on each of the (columns + 1) grid lines.
  for (let c = 0; c <= columns; c++) {
    const solidResult = boxSolid(scope, mullionWidth, mullionDepth, height);
    if (!solidResult.ok) {
      return err(solidResult.error);
    }
    mullions.push({
      origin: [c * cellWidth - halfMullion, 0, 0],
      size: [mullionWidth, mullionDepth, height],
      solid: solidResult.value,
    });
  }

  // Horizontal mullions (transoms): full-width bars on each of the (rows + 1)
  // grid lines.
  for (let r = 0; r <= rows; r++) {
    const solidResult = boxSolid(scope, width, mullionDepth, mullionWidth);
    if (!solidResult.ok) {
      return err(solidResult.error);
    }
    mullions.push({
      origin: [0, 0, r * cellHeight - halfMullion],
      size: [width, mullionDepth, mullionWidth],
      solid: solidResult.value,
    });
  }

  return ok({ panels, mullions });
}

/** Generate owned components, releasing every partial output on failure or failed temporary cleanup. */
export function curtainWallToGrid(spec: CurtainWallSpec): Result<CurtainWallGrid, BimError> {
  const scope: CurtainGenerationScope = { temporaries: [], outputs: [], itemIndex: 0 };
  const context = { operation: 'curtainWallToGrid' };
  let result: Result<CurtainWallGrid, BimError>;
  try {
    result = buildCurtainWallGrid(spec, scope);
  } catch (cause) {
    result = err(
      geometryError('CURTAIN_WALL_BUILD_FAILED', 'Curtain wall generation threw', cause)
    );
  }
  const cleanup = cleanupOwnedResources(scope.temporaries, context);
  const diagnostics = [
    ...(result.ok
      ? []
      : reportedGeometryCleanup(result.error, context.operation, { itemIndex: scope.itemIndex })),
    ...(cleanup.kind === 'FAILED' ? cleanup.diagnostics : []),
  ];
  if (result.ok && diagnostics.length === 0) return result;
  // A profile and its output share a component position. Map failed releases
  // within each group so one failure does not claim its successfully freed sibling.
  const outputCleanup = cleanupOwnedResources(scope.outputs, context);
  if (outputCleanup.kind === 'FAILED') diagnostics.push(...outputCleanup.diagnostics);
  const uncertain = [
    ...(result.ok ? [] : uncertainGeneratedResources(result.error)),
    ...failedResources(cleanup, scope.temporaries),
    ...failedResources(outputCleanup, scope.outputs),
  ];
  return generationFailure(
    result.ok
      ? {
          ...geometryError('CURTAIN_WALL_CLEANUP_FAILED', 'Curtain wall temporary cleanup failed'),
          metadata: { cleanup: cleanupReport(diagnostics) },
        }
      : {
          ...result.error,
          metadata: { ...result.error.metadata, cleanup: cleanupReport(diagnostics) },
        },
    uncertain
  );
}
