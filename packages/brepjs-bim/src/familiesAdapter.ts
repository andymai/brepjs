/**
 * brepjs-families -> BimModel adapter. Consumes a resolved element tree and
 * feeds each element's PRE-DESUGARED props into the parametric specs — the
 * spec path stays authoritative for IFC (IfcExtrudedAreaSolid + placement),
 * while the IR path serves the viewport and dedup. GlobalIds derive from
 * families key paths (stable under reordering), not insertion order.
 *
 * Scope: Storey containers, Wall/Slab/Column/Beam/Roof elements, and wall openings — a
 * fill-role void (Door/Window family) maps onto addDoor/addWindow, which cut
 * the wall and wire IfcRelVoidsElement + IfcRelFillsElement; the opening and
 * filler GlobalIds derive from the synthesized key paths. Anonymous (non-fill)
 * voids stay IR-only and never reach the spec path.
 */

import { ok, err, type Result, type csg } from 'brepjs';
import type { ResolvedElement } from 'brepjs-families';
import { BimModel, type OpeningIdentityOptions } from './model/bimModel.js';
import type { LocalId } from './identity/localId.js';
import { parseWallSpec } from './specs/wallSpec.js';
import { parseSlabSpec } from './specs/slabSpec.js';
import { parseColumnSpec } from './specs/columnSpec.js';
import { parseBeamSpec } from './specs/beamSpec.js';
import { parseRoofSpec } from './specs/roofSpec.js';
import { parseDoorSpec, parseWindowSpec } from './specs/openingSpec.js';
import type { ProjectSpec } from './specs/spatialSpec.js';
import { specError, type BimError } from './errors/bimError.js';
import type { FillsOpeningRel } from './types/relationships.js';

export interface FamiliesToBimOptions {
  readonly project: ProjectSpec;
  readonly siteName?: string | undefined;
  readonly buildingName?: string | undefined;
}

export interface FamiliesBimResult {
  readonly model: BimModel;
  /** LocalId per geometry-bearing families key path. */
  readonly idByKeyPath: ReadonlyMap<string, LocalId>;
}

const SPEC_DEFAULTS = {
  origin: [0, 0, 0] as [number, number, number],
  axisX: [1, 0, 0] as [number, number, number],
  axisZ: [0, 0, 1] as [number, number, number],
  materialName: 'Default',
};

const GEOMETRY_PROPS = new Set(['voids', 'fuse', 'transform', 'psets']);

const SPEC_ROUTES = {
  Wall: {
    parse: parseWallSpec,
    add: (m: BimModel, spec: unknown, key: string) => m.addWall(spec as never, { stableKey: key }),
  },
  Slab: {
    parse: parseSlabSpec,
    add: (m: BimModel, spec: unknown, key: string) => m.addSlab(spec as never, { stableKey: key }),
  },
  Column: {
    parse: parseColumnSpec,
    add: (m: BimModel, spec: unknown, key: string) =>
      m.addColumn(spec as never, { stableKey: key }),
  },
  Beam: {
    parse: parseBeamSpec,
    add: (m: BimModel, spec: unknown, key: string) => m.addBeam(spec as never, { stableKey: key }),
  },
  Roof: {
    parse: parseRoofSpec,
    add: (m: BimModel, spec: unknown, key: string) => m.addRoof(spec as never, { stableKey: key }),
  },
} as const;

function specRoute(type: string): (typeof SPEC_ROUTES)[keyof typeof SPEC_ROUTES] | undefined {
  return Object.hasOwn(SPEC_ROUTES, type)
    ? SPEC_ROUTES[type as keyof typeof SPEC_ROUTES]
    : undefined;
}

/** Total of the resolved geometry's OUTER literal translate chain. The
 *  transform vocabulary is translate-only, so frame differences are exact
 *  subtractions. Parameter-driven translations stop the peel. */
function peelTranslates(node: csg.IRNode): {
  readonly total: readonly [number, number, number];
  readonly moved: boolean;
} {
  const total: [number, number, number] = [0, 0, 0];
  let moved = false;
  let cur = node;
  while (cur.kind === 'Translate') {
    const v = cur.vector;
    if (v.kind !== 'Vec3Lit') break;
    total[0] += v.value[0];
    total[1] += v.value[1];
    total[2] += v.value[2];
    moved = true;
    cur = cur.target;
  }
  return { total, moved };
}

/** Fold the resolved geometry's outer translate chain into the spec placement
 *  origin, so IfcLocalPlacement matches the IR world frame no matter where the
 *  transform came from (family-internal or prop-level). */
function composedOrigin(el: ResolvedElement): [number, number, number] | undefined {
  const base = (el.props['origin'] as [number, number, number] | undefined) ?? [0, 0, 0];
  const { total, moved } = peelTranslates(el.geometry);
  if (!moved && el.props['origin'] === undefined) return undefined;
  return [base[0] + total[0], base[1] + total[1], base[2] + total[2]];
}

function stripGeometryProps(props: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (!GEOMETRY_PROPS.has(k)) out[k] = v;
  }
  return out;
}

function specInput(el: ResolvedElement): Record<string, unknown> {
  // Pre-desugared props feed the spec 1:1 (geometry-only props stripped);
  // identity-side attributes carry pset-shaped fields under their spec names.
  const origin = composedOrigin(el);
  return {
    ...SPEC_DEFAULTS,
    ...stripGeometryProps(el.props),
    ...(origin ? { origin } : {}),
    ...collectSpecProps(el),
  };
}

function collectSpecProps(el: ResolvedElement): Record<string, unknown> {
  const psets = el.attributes['psets'];
  const out: Record<string, unknown> = {};
  if (psets && typeof psets === 'object') {
    const common = (psets as Record<string, unknown>)['Pset_WallCommon'];
    if (common && typeof common === 'object') {
      const c = common as Record<string, unknown>;
      if (typeof c['IsExternal'] === 'boolean') out['isExternal'] = c['IsExternal'];
      if (typeof c['FireRating'] === 'string') out['fireRating'] = c['FireRating'];
    }
  }
  delete out['psets'];
  return out;
}

function addFill(
  model: BimModel,
  fill: ResolvedElement,
  input: Record<string, unknown>,
  identity: OpeningIdentityOptions
): Result<LocalId, BimError> {
  if (fill.type === 'Door') {
    const parsed = parseDoorSpec(input);
    if (!parsed.ok) return parsed;
    return model.addDoor(parsed.value, identity);
  }
  if (fill.type === 'Window') {
    const parsed = parseWindowSpec(input);
    if (!parsed.ok) return parsed;
    return model.addWindow(parsed.value, identity);
  }
  return err(
    specError(
      'FAMILIES_UNSUPPORTED_FILL',
      `familiesToBim: no fill mapping for element type '${fill.type}' at '${fill.keyPath}'`
    )
  );
}

/** Map a wall's synthesized Opening children onto addDoor/addWindow. The
 *  wall-relative offsets come from the void geometry's frame minus the host's:
 *  exact because both carry the same outer host transform. */
function addOpenings(
  model: BimModel,
  host: ResolvedElement,
  wallId: LocalId,
  containerId: LocalId,
  idByKeyPath: Map<string, LocalId>
): Result<void, BimError> {
  const hostT = peelTranslates(host.geometry).total;
  for (const opening of host.children) {
    if (opening.type !== 'Opening') continue;
    const fill = opening.children[0];
    if (fill === undefined) {
      return err(
        specError(
          'FAMILIES_OPENING_NO_FILL',
          `familiesToBim: opening '${opening.keyPath}' has no fill element`
        )
      );
    }
    const keyed = requireKeyed(opening);
    if (!keyed.ok) return keyed;
    const fillT = peelTranslates(opening.geometry).total;
    // Project the frame difference onto the wall's along axis so openings on
    // rotated walls (axisX from props) land at the right wall-relative offset;
    // the sill stays the world-Z difference (axisZ is up in v1).
    const axisX = (host.props['axisX'] as readonly [number, number, number] | undefined) ?? [
      1, 0, 0,
    ];
    const delta = [fillT[0] - hostT[0], fillT[1] - hostT[1], fillT[2] - hostT[2]] as const;
    const input = {
      materialName: SPEC_DEFAULTS.materialName,
      ...stripGeometryProps(fill.props),
      wallLocalId: wallId,
      offsetAlongWall: delta[0] * axisX[0] + delta[1] * axisX[1] + delta[2] * axisX[2],
      offsetFromFloor: delta[2],
    };
    const added = addFill(model, fill, input, {
      stableKey: fill.keyPath,
      openingStableKey: opening.keyPath,
    });
    if (!added.ok) return added;
    // Fillers are spatially contained like any element (openings are not:
    // they relate to the wall through IfcRelVoidsElement alone).
    model.placeIn(added.value, containerId);
    idByKeyPath.set(fill.keyPath, added.value);
    const fillsRel = model
      .getAllRelationships()
      .find(
        (r): r is FillsOpeningRel => r.kind === 'FILLS_OPENING' && r.fillerLocalId === added.value
      );
    if (fillsRel !== undefined) idByKeyPath.set(opening.keyPath, fillsRel.openingLocalId);
  }
  return ok(undefined);
}

/** Every element that mints an IFC identity needs an explicit key: an
 *  index-fallback path is order-dependent, which would silently break the
 *  reorder-stable GlobalId contract. */
function requireKeyed(el: ResolvedElement): Result<void, BimError> {
  if (el.keyed) return ok(undefined);
  return err(
    specError(
      'FAMILIES_UNKEYED_ELEMENT',
      `familiesToBim: '${el.keyPath}' has no explicit key — IFC identity needs order-independent key paths (add a key to the element)`
    )
  );
}

/**
 * Project a resolved families tree into an eager BimModel. The caller owns
 * the returned model (`using`); families stays domain-neutral — this adapter
 * is where families types meet the IFC vocabulary.
 */
export function familiesToBim(
  root: ResolvedElement,
  options: FamiliesToBimOptions
): Result<FamiliesBimResult, BimError> {
  const model = new BimModel();
  const initResult = model.init(options.project);
  if (!initResult.ok) return initResult;
  const siteId = model.addSite({ name: options.siteName ?? 'Site' });
  const buildingId = model.addBuilding({ name: options.buildingName ?? 'Building' });
  model.aggregate(siteId, buildingId);

  const idByKeyPath = new Map<string, LocalId>();
  const walk = (el: ResolvedElement, storeyId: LocalId | null): Result<void, BimError> => {
    let containerId = storeyId;
    const route = specRoute(el.type);
    if (el.type === 'Storey') {
      const keyed = requireKeyed(el);
      if (!keyed.ok) return keyed;
      const id = model.addStorey(
        {
          name: (el.attributes['name'] as string | undefined) ?? el.keyPath,
          elevation: (el.props['elevation'] as number | undefined) ?? 0,
        },
        { stableKey: el.keyPath }
      );
      model.aggregate(buildingId, id);
      idByKeyPath.set(el.keyPath, id);
      containerId = id;
    } else if (route !== undefined) {
      const keyed = requireKeyed(el);
      if (!keyed.ok) return keyed;
      const parsed = route.parse(specInput(el));
      if (!parsed.ok) return parsed;
      const added = route.add(model, parsed.value, el.keyPath);
      if (!added.ok) return added;
      idByKeyPath.set(el.keyPath, added.value);
      if (containerId === null) {
        return err(
          specError(
            'FAMILIES_NO_STOREY',
            `familiesToBim: '${el.keyPath}' has no Storey ancestor — IFC elements need spatial containment`
          )
        );
      }
      model.placeIn(added.value, containerId);
      if (el.type === 'Wall') {
        const opened = addOpenings(model, el, added.value, containerId, idByKeyPath);
        if (!opened.ok) return opened;
      }
    } else if (el.type === 'Opening') {
      return err(
        specError(
          'FAMILIES_OPENING_OUTSIDE_WALL',
          `familiesToBim: opening '${el.keyPath}' is not hosted by a Wall — only wall openings are mapped`
        )
      );
    } else if (el.type !== 'Group' && el.geometry.kind !== 'Empty') {
      return err(
        specError(
          'FAMILIES_UNSUPPORTED_TYPE',
          `familiesToBim: no spec mapping for element type '${el.type}' at '${el.keyPath}'`
        )
      );
    }
    for (const child of el.children) {
      if (el.type === 'Wall' && child.type === 'Opening') continue;
      const r = walk(child, containerId);
      if (!r.ok) return r;
    }
    return ok(undefined);
  };

  const walked = walk(root, null);
  if (!walked.ok) {
    model[Symbol.dispose]();
    return walked;
  }
  return ok({ model, idByKeyPath });
}
