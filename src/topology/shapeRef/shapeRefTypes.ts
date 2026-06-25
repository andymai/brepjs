/**
 * Type definitions for the ShapeRef system — stable, serializable face references
 * that survive parametric replay.
 */

import type { Vec3 } from '@/core/types.js';
import type { SurfaceType } from '@/topology/faceFns.js';
import type { Face, Edge, Vertex } from '@/core/shapeTypes.js';

// ---------------------------------------------------------------------------
// Geometric hint — snapshot of a face's geometric properties
// ---------------------------------------------------------------------------

/** Geometric snapshot of a face, used for fallback matching when hashes change. */
export interface GeometricHint {
  readonly entityType: 'face';
  readonly surfaceType?: SurfaceType;
  readonly normal?: Vec3;
  readonly centroid?: Vec3;
  readonly area?: number | undefined;
}

// ---------------------------------------------------------------------------
// ShapeRef — stable, serializable face reference
// ---------------------------------------------------------------------------

/**
 * A stable reference to a face, combining a role-based name with a geometric hint.
 * Survives parametric replay even when face hashes change.
 */
export interface ShapeRef {
  /** Generic command/step identifier (e.g., 'step_0', 'box_1'). */
  readonly origin: string;
  /** Role name within the origin (e.g., 'box:top', 'fillet:round_0'). */
  readonly role: string;
  /** Geometric snapshot for fallback matching. */
  readonly hint: GeometricHint;
}

// ---------------------------------------------------------------------------
// Role table — maps origin -> role -> face hash
// ---------------------------------------------------------------------------

/**
 * Immutable table mapping `origin -> role -> faceHashes`.
 * Updated through evolution records when the model is rebuilt.
 *
 * A role usually maps to a single hash, but maps to several after its face
 * splits (a 1→many `modified` evolution); resolution then disambiguates among
 * the surviving successors rather than competing against the whole shape.
 */
export type RoleTable = ReadonlyMap<string, ReadonlyMap<string, readonly number[]>>;

// ---------------------------------------------------------------------------
// Resolution results
// ---------------------------------------------------------------------------

/** A successfully resolved face reference. */
export interface ResolvedRef {
  readonly face: Face;
  readonly confidence: 'exact' | 'geometric-fallback';
}

/** A face reference that could not be resolved. */
export interface BrokenRef {
  readonly ref: ShapeRef;
  readonly reason: 'deleted' | 'ambiguous' | 'not-found';
  readonly candidates?: readonly Face[];
}

// ---------------------------------------------------------------------------
// EdgeRef — lineage-based edge reference (named by its two adjacent faces)
// ---------------------------------------------------------------------------

/**
 * Geometric snapshot of an edge — a tiebreaker for the rare case where an edge's
 * two faces share more than one edge.
 */
export interface EdgeHint {
  readonly entityType: 'edge';
  readonly length?: number | undefined;
  /** Midpoint of the edge's endpoint vertices. */
  readonly midpoint?: Vec3 | undefined;
}

/**
 * A stable reference to an edge, identified by the roles of its two adjacent
 * faces — its lineage. An edge *is* the intersection of its two faces, so this
 * resolves by finding the edge shared by the current faces of those roles
 * (`sharedEdges`). Identity rides on the already-stable face roles rather than
 * the edge's own hash, so it survives edits that re-hash the edge — and it
 * sidesteps the kernel's unreliable `generated`-face hashes entirely.
 */
export interface EdgeRef {
  readonly origin: string;
  /** Roles of the two faces this edge bounds. */
  readonly faceRoles: readonly [string, string];
  readonly hint: EdgeHint;
}

/** A successfully resolved edge reference. */
export interface ResolvedEdgeRef {
  readonly edge: Edge;
  readonly confidence: 'exact' | 'geometric-fallback';
}

/** An edge reference that could not be resolved. */
export interface BrokenEdgeRef {
  readonly ref: EdgeRef;
  // No 'deleted': an edge ref tracks its faces, not the edge's own hash, so a
  // vanished edge surfaces as 'not-found' (no shared edge) — it can't be
  // distinguished from never-resolved.
  readonly reason: 'ambiguous' | 'not-found';
  readonly candidates?: readonly Edge[];
}

// ---------------------------------------------------------------------------
// VertexRef — lineage-based vertex reference (named by its ≥3 adjacent faces)
// ---------------------------------------------------------------------------

/** Geometric snapshot of a vertex — a tiebreaker when several candidates survive. */
export interface VertexHint {
  readonly entityType: 'vertex';
  readonly position?: Vec3 | undefined;
}

/**
 * A stable reference to a vertex, identified by the roles of the faces meeting
 * at it. A solid corner is where **≥3** faces meet at a point; two faces meet
 * along an *edge* (two endpoints → ambiguous), so a vertex needs ≥3 face-roles.
 * Resolves by finding the vertex common to those roles' current faces.
 */
export interface VertexRef {
  readonly origin: string;
  /** Roles of the ≥3 faces meeting at this vertex (sorted). */
  readonly faceRoles: readonly string[];
  readonly hint: VertexHint;
}

/** A successfully resolved vertex reference. */
export interface ResolvedVertexRef {
  readonly vertex: Vertex;
  readonly confidence: 'exact' | 'geometric-fallback';
}

/** A vertex reference that could not be resolved. */
export interface BrokenVertexRef {
  readonly ref: VertexRef;
  readonly reason: 'ambiguous' | 'not-found';
  readonly candidates?: readonly Vertex[];
}

// ---------------------------------------------------------------------------
// DerivedFaceRef — a generated face (fillet/chamfer) named by the faces it bridges
// ---------------------------------------------------------------------------

/**
 * Snapshot for re-deriving a generated face. fillet/chamfer evolution is empty
 * on the OCCT kernels, so the role table can't track the bridged faces — they
 * are re-found by their captured outward normals; the edge midpoint breaks ties.
 */
export interface DerivedFaceHint {
  readonly entityType: 'derived-face';
  readonly normalA: Vec3;
  readonly normalB: Vec3;
  readonly edgeMidpoint?: Vec3 | undefined;
}

/**
 * A reference to a *generated* face — a fillet round or chamfer bevel — named by
 * the two faces it bridges. The generated face has no stable hash (it didn't
 * exist at capture time, and fillet evolution is empty), so it's resolved as the
 * face adjacent to both bridged faces whose normal blends both — the orthogonal
 * flanking faces are rejected. Lineage-by-neighbors for geometry created by the
 * very edit being referenced across.
 */
export interface DerivedFaceRef {
  readonly origin: string;
  /**
   * Which op generated the face — descriptive metadata for consumers. Resolution
   * is op-agnostic (the normal-blend isolates both a fillet round and a chamfer
   * bevel), so the resolver doesn't consult it.
   */
  readonly op: 'fillet' | 'chamfer';
  /** Roles of the two faces the generated face bridges. */
  readonly betweenRoles: readonly [string, string];
  readonly hint: DerivedFaceHint;
}

/** A successfully resolved derived-face reference (always geometric). */
export interface ResolvedDerivedFaceRef {
  readonly face: Face;
  readonly confidence: 'geometric-fallback';
}

/** A derived-face reference that could not be resolved. */
export interface BrokenDerivedFaceRef {
  readonly ref: DerivedFaceRef;
  readonly reason: 'ambiguous' | 'not-found';
  readonly candidates?: readonly Face[];
}
