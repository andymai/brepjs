import * as WebIFC from 'web-ifc';
import {
  applyMatrix,
  castShape,
  err,
  extrude,
  getKernel,
  isSolid,
  ok,
  polygon,
  revolve,
  validSolid,
  type MatrixTransform,
  type OrientedFace,
  type PlanarFace,
  type Result,
  type Solid,
  type ValidSolid,
  type Vec3,
} from 'brepjs';
import type { BimError } from '../errors/bimError.js';
import { importError } from '../errors/bimError.js';
import type { Profile } from '../specs/profile.js';
import { isExtendedProfile } from '../specs/profile.js';
import { extendedProfileToFace } from '../specs/profilesExtended.js';
import { profileToPolygon } from '../elementFns/profileFns.js';
import { issue, type ValidationIssue } from '../validation/severity.js';
import type { SpfReader } from './spfReader.js';
import { readPlaneAngleScale } from './placement.js';

/**
 * Outcome of reconstructing a single product's body geometry.
 *
 * - `SOLID` — a brepjs ValidSolid was rebuilt (parametrically from a swept
 *   solid, or by a manifold STL round-trip of a tessellated mesh).
 * - `MESH` — geometry exists but could not be turned into a closed solid;
 *   raw triangle data is returned and flagged lossy via `diagnostic`.
 * - `NONE` — the product carries no recognised body representation.
 */
export type GeometryResult =
  | { readonly kind: 'SOLID'; readonly solid: ValidSolid; readonly lossy: boolean }
  | {
      readonly kind: 'MESH';
      readonly vertices: Float32Array;
      readonly indices: Uint32Array;
      readonly diagnostic: string;
    }
  | { readonly kind: 'NONE' };

// web-ifc wraps measure/real values as { value | _representationValue } and
// references as { value: expressId }. Both are read via `.value`/`._representationValue`.
interface IfcRef {
  readonly value: number;
}

const NONE: GeometryResult = { kind: 'NONE' };

/**
 * Reconstructs the `Body` (SweptSolid) representation of a product into a brepjs
 * solid, falling back to tessellated mesh import when no parametric path exists.
 *
 * `scale` is metres-per-file-unit (1.0 for METRE files); all reconstructed
 * dimensions are converted to mm via `scale * 1000`. Per-item failures push a
 * diagnostic onto `diagnostics` and yield `NONE` rather than throwing, so a
 * single bad element never aborts a model import.
 */
export function readBodyGeometry(
  reader: SpfReader,
  productExpressId: number,
  scale: number,
  diagnostics: ValidationIssue[]
): GeometryResult {
  const product = reader.getLine<Record<string, unknown>>(productExpressId);
  if (product === null) return NONE;
  const representationRef = asRef(product['Representation']);
  if (representationRef === undefined) return NONE;

  const productShape = reader.getLine<Record<string, unknown>>(representationRef.value);
  const representations =
    productShape === null ? undefined : asRefArray(productShape['Representations']);
  if (representations === undefined) return NONE;

  const bodyItemId = findBodyItem(reader, representations);
  if (bodyItemId === undefined) return NONE;

  const worldTransform = readWorldTransform(reader, product, scale);

  const itemType = reader.getLineType(bodyItemId);
  try {
    if (itemType === WebIFC.IFCEXTRUDEDAREASOLID) {
      return reconstructExtrusion(reader, bodyItemId, scale, worldTransform, diagnostics);
    }
    if (itemType === WebIFC.IFCREVOLVEDAREASOLID) {
      return reconstructRevolution(reader, bodyItemId, scale, worldTransform, diagnostics);
    }
    if (isTessellatedType(itemType)) {
      return reconstructTessellated(reader, productExpressId, diagnostics);
    }
  } catch (e) {
    diagnostics.push(
      issue(
        'warning',
        'GEOMETRY_RECONSTRUCTION_FAILED',
        `Body geometry reconstruction threw: ${errMsg(e)}`,
        productExpressId
      )
    );
    return NONE;
  }

  diagnostics.push(
    issue(
      'warning',
      'UNSUPPORTED_REPRESENTATION_ITEM',
      `Unsupported body representation item type ${itemType}; geometry skipped`,
      productExpressId
    )
  );
  return NONE;
}

// ---------------------------------------------------------------------------
// Extruded-area-solid reconstruction (the lossless parametric path)
// ---------------------------------------------------------------------------

function reconstructExtrusion(
  reader: SpfReader,
  extrusionId: number,
  scale: number,
  worldTransform: MatrixTransform | null,
  diagnostics: ValidationIssue[]
): GeometryResult {
  const ext = reader.getLine<Record<string, unknown>>(extrusionId);
  if (ext === null) return NONE;

  const sweptArea = asRef(ext['SweptArea']);
  const depth = readMeasure(ext['Depth']);
  if (sweptArea === undefined || depth === undefined) {
    diagnostics.push(
      issue(
        'warning',
        'GEOMETRY_RECONSTRUCTION_FAILED',
        'Extrusion missing SweptArea or Depth',
        extrusionId
      )
    );
    return NONE;
  }

  const profileResult = readProfileDef(reader, sweptArea.value, scale);
  if (!profileResult.ok) {
    diagnostics.push(
      issue('warning', profileResult.error.code, profileResult.error.message, extrusionId)
    );
    return NONE;
  }

  const faceResult = profileToFace(profileResult.value);
  if (!faceResult.ok) {
    diagnostics.push(
      issue('warning', faceResult.error.code, faceResult.error.message, extrusionId)
    );
    return NONE;
  }

  const depthMm = depth * scale * 1000;
  const extrudeDir = readDirection(reader, ext['ExtrudedDirection']) ?? [0, 0, 1];
  const extrudeVec: Vec3 = [
    extrudeDir[0] * depthMm,
    extrudeDir[1] * depthMm,
    extrudeDir[2] * depthMm,
  ];

  const solidResult = (() => {
    using face = faceResult.value;
    return extrude(face, extrudeVec);
  })();
  if (!solidResult.ok) {
    diagnostics.push(
      issue('warning', 'GEOMETRY_RECONSTRUCTION_FAILED', solidResult.error.message, extrusionId)
    );
    return NONE;
  }

  // Compose: extrusion-local frame (Position) then the product world placement.
  const localFrame = readAxis2Placement3D(reader, ext['Position'], scale);
  const placed = placeSolid(solidResult.value, localFrame, worldTransform);
  if (!placed.ok) {
    diagnostics.push(issue('warning', placed.error.code, placed.error.message, extrusionId));
    return NONE;
  }

  return finalizeSolid(placed.value, extrusionId, diagnostics);
}

// ---------------------------------------------------------------------------
// Revolved-area-solid reconstruction (cheap addition)
// ---------------------------------------------------------------------------

function reconstructRevolution(
  reader: SpfReader,
  revolutionId: number,
  scale: number,
  worldTransform: MatrixTransform | null,
  diagnostics: ValidationIssue[]
): GeometryResult {
  const rev = reader.getLine<Record<string, unknown>>(revolutionId);
  if (rev === null) return NONE;

  const sweptArea = asRef(rev['SweptArea']);
  const angleRaw = readMeasure(rev['Angle']);
  const axisRef = asRef(rev['Axis']);
  if (sweptArea === undefined || angleRaw === undefined || axisRef === undefined) {
    diagnostics.push(
      issue(
        'warning',
        'GEOMETRY_RECONSTRUCTION_FAILED',
        'Revolution missing SweptArea/Angle/Axis',
        revolutionId
      )
    );
    return NONE;
  }

  const profileResult = readProfileDef(reader, sweptArea.value, scale);
  if (!profileResult.ok) {
    diagnostics.push(
      issue('warning', profileResult.error.code, profileResult.error.message, revolutionId)
    );
    return NONE;
  }
  const faceResult = profileToFace(profileResult.value);
  if (!faceResult.ok) {
    diagnostics.push(
      issue('warning', faceResult.error.code, faceResult.error.message, revolutionId)
    );
    return NONE;
  }

  const axis1 = reader.getLine<Record<string, unknown>>(axisRef.value);
  const center = (axis1 === null ? undefined : readPoint(reader, axis1['Location'], scale)) ?? [
    0, 0, 0,
  ];
  const direction = (axis1 === null ? undefined : readDirection(reader, axis1['Axis'])) ?? [
    0, 0, 1,
  ];

  const revolved = (() => {
    using face = faceResult.value;
    // revolve() takes degrees; angleRaw is in the file's plane-angle unit.
    const angleDeg = angleRaw * readPlaneAngleScale(reader) * (180 / Math.PI);
    return revolve(face, { at: center, axis: direction, angle: angleDeg });
  })();
  if (!revolved.ok) {
    diagnostics.push(
      issue('warning', 'GEOMETRY_RECONSTRUCTION_FAILED', revolved.error.message, revolutionId)
    );
    return NONE;
  }
  if (!isSolid(revolved.value)) {
    diagnostics.push(
      issue(
        'warning',
        'GEOMETRY_RECONSTRUCTION_FAILED',
        'Revolution did not yield a solid',
        revolutionId
      )
    );
    // Not a solid, but still a live WASM handle (shell/compound) to free.
    revolved.value[Symbol.dispose]();
    return NONE;
  }

  const localFrame = readAxis2Placement3D(reader, rev['Position'], scale);
  const placed = placeSolid(revolved.value, localFrame, worldTransform);
  if (!placed.ok) {
    diagnostics.push(issue('warning', placed.error.code, placed.error.message, revolutionId));
    return NONE;
  }
  return finalizeSolid(placed.value, revolutionId, diagnostics);
}

// ---------------------------------------------------------------------------
// Tessellated fallback (STL round-trip; lossy when not manifold)
// ---------------------------------------------------------------------------

function reconstructTessellated(
  reader: SpfReader,
  productExpressId: number,
  diagnostics: ValidationIssue[]
): GeometryResult {
  const mesh = collectMesh(reader, productExpressId);
  if (mesh === null || mesh.indices.length === 0) {
    diagnostics.push(
      issue(
        'warning',
        'GEOMETRY_RECONSTRUCTION_FAILED',
        'Tessellated geometry yielded no triangles',
        productExpressId
      )
    );
    return NONE;
  }

  // web-ifc emits geometry in metres; STL import expects mm to match the
  // parametric path's units.
  const stl = packBinaryStl(mesh.vertices, mesh.indices, 1000);
  let solid: ValidSolid | null = null;
  try {
    // getKernel().importSTL returns the kernel's KernelShape (typed `any` at the
    // WASM boundary); castShape brands it back into a brepjs handle.
    const cast = castShape(getKernel().importSTL(stl.buffer as ArrayBuffer));
    if (isSolid(cast)) {
      const valid = validSolid(cast);
      if (valid.ok) solid = valid.value;
      else cast[Symbol.dispose]();
    } else {
      cast[Symbol.dispose]();
    }
  } catch (e) {
    diagnostics.push(
      issue(
        'info',
        'TESSELLATION_NOT_MANIFOLD',
        `STL round-trip failed: ${errMsg(e)}`,
        productExpressId
      )
    );
  }

  if (solid !== null) {
    diagnostics.push(
      issue(
        'info',
        'TESSELLATED_MANIFOLD',
        'Tessellated mesh recovered as a closed solid via STL round-trip',
        productExpressId
      )
    );
    return { kind: 'SOLID', solid, lossy: true };
  }

  diagnostics.push(
    issue(
      'info',
      'TESSELLATION_NOT_MANIFOLD',
      'Tessellated mesh is not closed/manifold; returning raw triangle data (lossy)',
      productExpressId
    )
  );
  return {
    kind: 'MESH',
    vertices: mesh.vertices,
    indices: mesh.indices,
    diagnostic: 'TESSELLATED_LOSSY',
  };
}

interface MeshData {
  readonly vertices: Float32Array;
  readonly indices: Uint32Array;
}

function collectMesh(reader: SpfReader, productExpressId: number): MeshData | null {
  const vertices: number[] = [];
  const indices: number[] = [];
  let base = 0;

  reader.streamMeshes([productExpressId], (flatMesh) => {
    try {
      const geometries = flatMesh.geometries;
      for (let g = 0; g < geometries.size(); g++) {
        const placed = geometries.get(g);
        const geom = reader.getGeometry(placed.geometryExpressID);
        try {
          const verts = reader.getVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
          const idx = reader.getIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
          const m = placed.flatTransformation;
          // web-ifc vertex stride is 6 floats: position(3) + normal(3).
          const vertexCount = verts.length / 6;
          for (let v = 0; v < vertexCount; v++) {
            const x = verts[v * 6] ?? 0;
            const y = verts[v * 6 + 1] ?? 0;
            const z = verts[v * 6 + 2] ?? 0;
            // Apply the 4x4 column-major placement transform.
            vertices.push(
              (m[0] ?? 1) * x + (m[4] ?? 0) * y + (m[8] ?? 0) * z + (m[12] ?? 0),
              (m[1] ?? 0) * x + (m[5] ?? 1) * y + (m[9] ?? 0) * z + (m[13] ?? 0),
              (m[2] ?? 0) * x + (m[6] ?? 0) * y + (m[10] ?? 1) * z + (m[14] ?? 0)
            );
          }
          for (let i = 0; i < idx.length; i++) {
            indices.push(base + (idx[i] ?? 0));
          }
          base += vertexCount;
        } finally {
          geom.delete();
        }
      }
    } finally {
      flatMesh.delete();
    }
  });

  if (vertices.length === 0) return null;
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}

// Packs interleaved triangle data into a binary STL buffer. `scaleToMm` converts
// the source units (metres) to millimetres so the imported solid matches the
// parametric reconstruction's coordinate space.
function packBinaryStl(
  vertices: Float32Array,
  indices: Uint32Array,
  scaleToMm: number
): Uint8Array {
  const triCount = Math.floor(indices.length / 3);
  const buffer = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triCount, true);

  let offset = 84;
  for (let t = 0; t < triCount; t++) {
    // Normal left as zero; OCCT recomputes face normals on import.
    offset += 12;
    for (let c = 0; c < 3; c++) {
      const vi = (indices[t * 3 + c] ?? 0) * 3;
      view.setFloat32(offset, (vertices[vi] ?? 0) * scaleToMm, true);
      view.setFloat32(offset + 4, (vertices[vi + 1] ?? 0) * scaleToMm, true);
      view.setFloat32(offset + 8, (vertices[vi + 2] ?? 0) * scaleToMm, true);
      offset += 12;
    }
    offset += 2; // attribute byte count
  }
  return new Uint8Array(buffer);
}

// ---------------------------------------------------------------------------
// Profile reconstruction
// ---------------------------------------------------------------------------

/** Scales a measure attribute to millimetres. */
type ScaleFn = (k: string) => number;

/**
 * Builders for the parametric (non-polyline) profile families, keyed by IFC
 * type constant. Each mirrors the writer's profile-def emission
 * (geometryWriter.writeProfile / profileDefWriter). `f` scales a measure
 * attribute to millimetres; `def`/`scale` cover the one non-`f` attribute.
 */
type ProfileBuilder = (f: ScaleFn, def: Record<string, unknown>, scale: number) => Profile;

const PARAMETRIC_PROFILE_BUILDERS: ReadonlyMap<number, ProfileBuilder> = new Map<
  number,
  ProfileBuilder
>([
  [WebIFC.IFCRECTANGLEPROFILEDEF, (f) => ({ kind: 'RECTANGULAR', width: f('XDim'), height: f('YDim') })],
  [WebIFC.IFCCIRCLEPROFILEDEF, (f) => ({ kind: 'CIRCULAR', radius: f('Radius') })],
  [WebIFC.IFCISHAPEPROFILEDEF, (f) => ({ kind: 'I_BEAM', overallWidth: f('OverallWidth'), overallDepth: f('OverallDepth'), webThickness: f('WebThickness'), flangeThickness: f('FlangeThickness') })],
  [WebIFC.IFCLSHAPEPROFILEDEF, (f) => ({ kind: 'L_SHAPE', depth: f('Depth'), width: f('Width'), legThickness: f('Thickness') })],
  [WebIFC.IFCTSHAPEPROFILEDEF, (f) => ({ kind: 'T_SHAPE', depth: f('Depth'), flangeWidth: f('FlangeWidth'), webThickness: f('WebThickness'), flangeThickness: f('FlangeThickness') })],
  [WebIFC.IFCUSHAPEPROFILEDEF, (f) => ({ kind: 'U_SHAPE', depth: f('Depth'), flangeWidth: f('FlangeWidth'), webThickness: f('WebThickness'), flangeThickness: f('FlangeThickness') })],
  [WebIFC.IFCZSHAPEPROFILEDEF, (f) => ({ kind: 'Z_SHAPE', depth: f('Depth'), flangeWidth: f('FlangeWidth'), webThickness: f('WebThickness'), flangeThickness: f('FlangeThickness') })],
  [WebIFC.IFCCSHAPEPROFILEDEF, (f) => ({ kind: 'C_SHAPE', depth: f('Depth'), width: f('Width'), wallThickness: f('WallThickness'), girth: f('Girth') })],
  // Writer maps bottom flange → OverallWidth/FlangeThickness, top → TopFlange*.
  [WebIFC.IFCASYMMETRICISHAPEPROFILEDEF, (f) => ({ kind: 'ASYMMETRIC_I', overallDepth: f('OverallDepth'), webThickness: f('WebThickness'), bottomFlangeWidth: f('OverallWidth'), bottomFlangeThickness: f('FlangeThickness'), topFlangeWidth: f('TopFlangeWidth'), topFlangeThickness: f('TopFlangeThickness') })],
  [WebIFC.IFCELLIPSEPROFILEDEF, (f) => ({ kind: 'ELLIPSE', semiAxis1: f('SemiAxis1'), semiAxis2: f('SemiAxis2') })],
  [WebIFC.IFCTRAPEZIUMPROFILEDEF, (f, def, scale) => ({ kind: 'TRAPEZIUM', bottomXDim: f('BottomXDim'), topXDim: f('TopXDim'), yDim: f('YDim'), topXOffset: (readMeasure(def['TopXOffset']) ?? 0) * scale * 1000 })],
  [WebIFC.IFCRECTANGLEHOLLOWPROFILEDEF, (f) => ({ kind: 'RECTANGLE_HOLLOW', xDim: f('XDim'), yDim: f('YDim'), wallThickness: f('WallThickness') })],
  [WebIFC.IFCCIRCLEHOLLOWPROFILEDEF, (f) => ({ kind: 'CIRCLE_HOLLOW', radius: f('Radius'), wallThickness: f('WallThickness') })],
]);

/**
 * Reads the parametric (non-polyline) profile families. Returns `null` for
 * profile types that require reader/scale polyline traversal so the caller can
 * handle them.
 */
function readParametricProfile(
  type: number,
  def: Record<string, unknown>,
  f: ScaleFn,
  scale: number
): Profile | null {
  const build = PARAMETRIC_PROFILE_BUILDERS.get(type);
  return build === undefined ? null : build(f, def, scale);
}

/**
 * Reads an IfcProfileDef into a brepjs Profile (mm). Mirrors the writer's
 * profile-def emission (geometryWriter.writeProfile / profileDefWriter).
 */
export function readProfileDef(
  reader: SpfReader,
  profileExpressId: number,
  scale: number
): Result<Profile, BimError> {
  const def = reader.getLine<Record<string, unknown>>(profileExpressId);
  if (def === null) {
    return err(importError('UNSUPPORTED_PROFILE', `Profile ${profileExpressId} could not be read`));
  }
  const type = reader.getLineType(profileExpressId);
  const f = (k: string): number => (readMeasure(def[k]) ?? 0) * scale * 1000;

  const parametric = readParametricProfile(type, def, f, scale);
  if (parametric !== null) return ok(parametric);

  switch (type) {
    case WebIFC.IFCARBITRARYCLOSEDPROFILEDEF: {
      const points = readPolylinePoints(reader, def['OuterCurve'], scale);
      if (points === undefined) {
        return err(
          importError('UNSUPPORTED_PROFILE', 'ARBITRARY_CLOSED OuterCurve could not be read')
        );
      }
      return ok({ kind: 'ARBITRARY_CLOSED', points });
    }
    case WebIFC.IFCARBITRARYPROFILEDEFWITHVOIDS: {
      const outerPoints = readPolylinePoints(reader, def['OuterCurve'], scale);
      if (outerPoints === undefined) {
        return err(
          importError('UNSUPPORTED_PROFILE', 'ARBITRARY_WITH_VOIDS OuterCurve could not be read')
        );
      }
      const innerRefs = asRefArray(def['InnerCurves']) ?? [];
      const voids: Array<Array<[number, number]>> = [];
      for (const innerRef of innerRefs) {
        const loop = readPolylinePoints(reader, innerRef, scale);
        if (loop !== undefined) voids.push(loop);
      }
      return ok({ kind: 'ARBITRARY_WITH_VOIDS', outerPoints, voids });
    }
    default:
      return err(importError('UNSUPPORTED_PROFILE', `Unsupported profile type ${type}`));
  }
}

function profileToFace(profile: Profile): Result<OrientedFace & PlanarFace, BimError> {
  if (isExtendedProfile(profile)) {
    return extendedProfileToFace(profile);
  }
  const ptsResult = profileToPolygon(profile);
  if (!ptsResult.ok) return err(ptsResult.error);
  const face = polygon(ptsResult.value.map(([x, y, z]) => [x, y, z] as Vec3));
  if (!face.ok) {
    return err(
      importError(
        'GEOMETRY_RECONSTRUCTION_FAILED',
        `Profile face build failed: ${face.error.message}`
      )
    );
  }
  return ok(face.value);
}

// ---------------------------------------------------------------------------
// Placement & matrix helpers
// ---------------------------------------------------------------------------

function placeSolid(
  solid: Solid,
  localFrame: MatrixTransform | null,
  worldTransform: MatrixTransform | null
): Result<Solid, BimError> {
  let current = solid;
  for (const transform of [localFrame, worldTransform]) {
    if (transform === null || isIdentity(transform)) continue;
    const applied = applyMatrix(current, transform);
    if (!applied.ok) {
      // Free the solid we own (the input on iter 1, an intermediate after) before
      // bailing — applyMatrix returns a fresh solid and does not consume its input.
      current[Symbol.dispose]();
      return err(
        importError('PLACEMENT_READ_FAILED', `Placement transform failed: ${applied.error.message}`)
      );
    }
    // Dispose the prior solid (caller's input on iter 1, which this consumes).
    current[Symbol.dispose]();
    current = applied.value;
  }
  return ok(current);
}

function finalizeSolid(
  solid: Solid,
  entity: number,
  diagnostics: ValidationIssue[]
): GeometryResult {
  if (!isSolid(solid)) {
    diagnostics.push(
      issue(
        'warning',
        'GEOMETRY_RECONSTRUCTION_FAILED',
        'Reconstructed shape is not a solid',
        entity
      )
    );
    // isSolid narrows `solid` to never here, but at runtime it is a live handle
    // (e.g. a compound) that still owns WASM memory — cast back to dispose it.
    (solid as Solid)[Symbol.dispose]();
    return NONE;
  }
  const valid = validSolid(solid);
  if (!valid.ok) {
    diagnostics.push(issue('warning', 'GEOMETRY_RECONSTRUCTION_FAILED', valid.error, entity));
    solid[Symbol.dispose]();
    return NONE;
  }
  // validSolid brands the same handle in place, so the returned solid IS `solid`.
  return { kind: 'SOLID', solid: valid.value, lossy: false };
}

// Reads the product's world placement (IfcLocalPlacement chain) via web-ifc's
// composer, scaling the translation to mm. Returns null on identity/absent.
function readWorldTransform(
  reader: SpfReader,
  product: Record<string, unknown>,
  scale: number
): MatrixTransform | null {
  const placementRef = asRef(product['ObjectPlacement']);
  if (placementRef === undefined) return null;
  const m = reader.getWorldTransform(placementRef.value);
  if (m.length < 16) return null;
  return columnMajorToTransform(m, scale);
}

// Reads an IfcAxis2Placement3D into a transform (local frame → parent frame).
function readAxis2Placement3D(
  reader: SpfReader,
  ref: unknown,
  scale: number
): MatrixTransform | null {
  const placementRef = asRef(ref);
  if (placementRef === undefined) return null;
  const placement = reader.getLine<Record<string, unknown>>(placementRef.value);
  if (placement === null) return null;

  const origin = readPoint(reader, placement['Location'], scale) ?? [0, 0, 0];
  const axisZ = readDirection(reader, placement['Axis']) ?? [0, 0, 1];
  const refDir = readDirection(reader, placement['RefDirection']) ?? [1, 0, 0];

  const zN = normalize(axisZ);
  // Gram-Schmidt: project RefDirection off Z to get an orthonormal X, Y = Z × X.
  const dotXZ = refDir[0] * zN[0] + refDir[1] * zN[1] + refDir[2] * zN[2];
  const xRaw: Vec3 = [
    refDir[0] - dotXZ * zN[0],
    refDir[1] - dotXZ * zN[1],
    refDir[2] - dotXZ * zN[2],
  ];
  // RefDirection parallel to Axis ⇒ projected X is ~0. normalize() falls back to
  // +Z, which would leave X parallel to Z and Y = Z × X = 0, so pick any vector
  // orthogonal to Z instead.
  const xRawLenSq = xRaw[0] * xRaw[0] + xRaw[1] * xRaw[1] + xRaw[2] * xRaw[2];
  const orthoZ: Vec3 = Math.abs(zN[0]) < 0.9 ? cross(zN, [1, 0, 0]) : cross(zN, [0, 1, 0]);
  const xN = xRawLenSq < 1e-12 ? normalize(orthoZ) : normalize(xRaw);
  const yN = cross(zN, xN);

  // Column-major basis [X | Y | Z] → row-major linear part for MatrixTransform.
  const linear: MatrixTransform['linear'] = [
    xN[0],
    yN[0],
    zN[0],
    xN[1],
    yN[1],
    zN[1],
    xN[2],
    yN[2],
    zN[2],
  ];
  return { linear, translation: origin };
}

// web-ifc world matrices are column-major 16-floats: columns [X | Y | Z | T].
function columnMajorToTransform(m: readonly number[], scale: number): MatrixTransform {
  const lengthFactor = scale * 1000;
  const linear: MatrixTransform['linear'] = [
    m[0] ?? 1,
    m[4] ?? 0,
    m[8] ?? 0,
    m[1] ?? 0,
    m[5] ?? 1,
    m[9] ?? 0,
    m[2] ?? 0,
    m[6] ?? 0,
    m[10] ?? 1,
  ];
  const translation: Vec3 = [
    (m[12] ?? 0) * lengthFactor,
    (m[13] ?? 0) * lengthFactor,
    (m[14] ?? 0) * lengthFactor,
  ];
  return { linear, translation };
}

function isIdentity(t: MatrixTransform): boolean {
  const expected = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let i = 0; i < 9; i++) {
    if (Math.abs((t.linear[i] ?? 0) - (expected[i] ?? 0)) > 1e-9) return false;
  }
  return (
    Math.abs(t.translation[0]) < 1e-9 &&
    Math.abs(t.translation[1]) < 1e-9 &&
    Math.abs(t.translation[2]) < 1e-9
  );
}

// ---------------------------------------------------------------------------
// Line / value extraction helpers
// ---------------------------------------------------------------------------

function findBodyItem(reader: SpfReader, representations: readonly IfcRef[]): number | undefined {
  for (const repRef of representations) {
    const rep = reader.getLine<Record<string, unknown>>(repRef.value);
    if (rep === null) continue;
    const repId = readLabel(rep['RepresentationIdentifier']);
    if (repId !== 'Body') continue;
    const items = asRefArray(rep['Items']);
    if (items === undefined || items.length === 0) continue;
    return items[0]?.value;
  }
  return undefined;
}

function readPolylinePoints(
  reader: SpfReader,
  ref: unknown,
  scale: number
): Array<[number, number]> | undefined {
  const curveRef = asRef(ref);
  if (curveRef === undefined) return undefined;
  const curve = reader.getLine<Record<string, unknown>>(curveRef.value);
  if (curve === null) return undefined;
  const pointRefs = asRefArray(curve['Points']);
  if (pointRefs === undefined) return undefined;

  const out: Array<[number, number]> = [];
  for (const pRef of pointRefs) {
    const pt = reader.getLine<Record<string, unknown>>(pRef.value);
    if (pt === null) continue;
    const coords = asMeasureArray(pt['Coordinates']);
    if (coords.length < 2) continue;
    out.push([(coords[0] ?? 0) * scale * 1000, (coords[1] ?? 0) * scale * 1000]);
  }
  // Writer closes loops by repeating the first point; drop the duplicate so the
  // brepjs polygon builder receives an open vertex list.
  if (out.length > 3) {
    const first = out[0];
    const last = out[out.length - 1];
    if (first !== undefined && last !== undefined && first[0] === last[0] && first[1] === last[1]) {
      out.pop();
    }
  }
  return out.length >= 3 ? out : undefined;
}

function readPoint(reader: SpfReader, ref: unknown, scale: number): Vec3 | undefined {
  const pointRef = asRef(ref);
  if (pointRef === undefined) return undefined;
  const pt = reader.getLine<Record<string, unknown>>(pointRef.value);
  if (pt === null) return undefined;
  const coords = asMeasureArray(pt['Coordinates']);
  if (coords.length < 3) return undefined;
  return [
    (coords[0] ?? 0) * scale * 1000,
    (coords[1] ?? 0) * scale * 1000,
    (coords[2] ?? 0) * scale * 1000,
  ];
}

function readDirection(reader: SpfReader, ref: unknown): Vec3 | undefined {
  const dirRef = asRef(ref);
  if (dirRef === undefined) return undefined;
  const dir = reader.getLine<Record<string, unknown>>(dirRef.value);
  if (dir === null) return undefined;
  const ratios = asMeasureArray(dir['DirectionRatios']);
  if (ratios.length < 3) return undefined;
  return [ratios[0] ?? 0, ratios[1] ?? 0, ratios[2] ?? 0];
}

function asRef(value: unknown): IfcRef | undefined {
  if (value !== null && typeof value === 'object' && 'value' in value) {
    const v = value.value;
    if (typeof v === 'number') return { value: v };
  }
  return undefined;
}

function asRefArray(value: unknown): IfcRef[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: IfcRef[] = [];
  for (const entry of value) {
    const ref = asRef(entry);
    if (ref !== undefined) out.push(ref);
  }
  return out;
}

// Extracts a numeric scalar from a measure/real wrapper or a bare number.
function readMeasure(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (value !== null && typeof value === 'object') {
    const obj = value as { value?: unknown; _representationValue?: unknown };
    if (typeof obj.value === 'number') return obj.value;
    if (typeof obj._representationValue === 'number') return obj._representationValue;
  }
  return undefined;
}

function asMeasureArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => readMeasure(v) ?? 0);
}

function readLabel(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value !== null && typeof value === 'object' && 'value' in value) {
    const v = value.value;
    if (typeof v === 'string') return v;
  }
  return undefined;
}

function isTessellatedType(type: number): boolean {
  return (
    type === WebIFC.IFCTRIANGULATEDFACESET ||
    type === WebIFC.IFCPOLYGONALFACESET ||
    type === WebIFC.IFCFACEBASEDSURFACEMODEL
  );
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-12) return [0, 0, 1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
