/**
 * brepjs-families -> BimModel adapter. Consumes a resolved element tree and
 * feeds each element's PRE-DESUGARED props into the parametric specs — the
 * spec path stays authoritative for IFC (IfcExtrudedAreaSolid + placement),
 * while the IR path serves the viewport and dedup. GlobalIds derive from
 * families key paths (stable under reordering), not insertion order.
 *
 * v1 scope: Storey containers and Wall/Slab elements. Openings, fills, and
 * relationship wiring (IfcRelVoidsElement) follow with the opening writer.
 */

import { ok, err, type Result, type csg } from 'brepjs';
import type { ResolvedElement } from 'brepjs-families';
import { BimModel } from './model/bimModel.js';
import type { LocalId } from './identity/localId.js';
import { parseWallSpec } from './specs/wallSpec.js';
import { parseSlabSpec } from './specs/slabSpec.js';
import type { ProjectSpec } from './specs/spatialSpec.js';
import { specError, type BimError } from './errors/bimError.js';

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

/** Fold the resolved geometry's OUTER literal translate chain into the spec
 *  placement origin, so IfcLocalPlacement matches the IR world frame no
 *  matter where the transform came from (family-internal or prop-level).
 *  Parameter-driven translations cannot fold and keep the default origin. */
function composedOrigin(el: ResolvedElement): [number, number, number] | undefined {
  const base = (el.props['origin'] as [number, number, number] | undefined) ?? [0, 0, 0];
  const out: [number, number, number] = [...base];
  let moved = false;
  let node: csg.IRNode = el.geometry;
  while (node.kind === 'Translate') {
    const v = node.vector;
    if (v.kind !== 'Vec3Lit') break;
    out[0] += v.value[0];
    out[1] += v.value[1];
    out[2] += v.value[2];
    moved = true;
    node = node.target;
  }
  return moved || el.props['origin'] !== undefined ? out : undefined;
}

function specInput(el: ResolvedElement): Record<string, unknown> {
  // Pre-desugared props feed the spec 1:1 (geometry-only props stripped);
  // identity-side attributes carry pset-shaped fields under their spec names.
  const fromProps: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(el.props)) {
    if (!GEOMETRY_PROPS.has(k)) fromProps[k] = v;
  }
  const origin = composedOrigin(el);
  return {
    ...SPEC_DEFAULTS,
    ...fromProps,
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
    if (el.type === 'Storey') {
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
    } else if (el.type === 'Wall' || el.type === 'Slab') {
      const parsed =
        el.type === 'Wall' ? parseWallSpec(specInput(el)) : parseSlabSpec(specInput(el));
      if (!parsed.ok) return parsed;
      const added =
        el.type === 'Wall'
          ? model.addWall(parsed.value as never, { stableKey: el.keyPath })
          : model.addSlab(parsed.value as never, { stableKey: el.keyPath });
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
    } else if (el.type !== 'Opening' && el.type !== 'Group' && el.geometry.kind !== 'Empty') {
      return err(
        specError(
          'FAMILIES_UNSUPPORTED_TYPE',
          `familiesToBim: no spec mapping for element type '${el.type}' at '${el.keyPath}'`
        )
      );
    }
    for (const child of el.children) {
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
