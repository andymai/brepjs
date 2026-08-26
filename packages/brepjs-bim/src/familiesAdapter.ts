/**
 * brepjs-families -> BimModel adapter. Consumes a resolved element tree and
 * feeds each element's PRE-DESUGARED props into the parametric specs — the
 * spec path stays authoritative for IFC (IfcExtrudedAreaSolid + placement),
 * while the IR path serves the viewport and dedup. GlobalIds derive from
 * families key paths (stable under reordering), not insertion order.
 *
 * Scope: Storey containers; Wall/Slab/Column/Beam/Roof/Stair, Footing/Pile,
 * Railing/Ramp, Covering/CurtainWall, and Space elements; and wall openings — a
 * fill-role void (Door/Window family) maps onto addDoor/addWindow, which cut
 * the wall and wire IfcRelVoidsElement + IfcRelFillsElement; the opening and
 * filler GlobalIds derive from the synthesized key paths. Anonymous (non-fill)
 * voids are rejected: they cut only the IR/viewport geometry, and exporting
 * the uncut spec body would silently diverge from what the user sees.
 */

import { clone, err, getSolids, isSolid, ok, validSolid, type Result, type csg } from 'brepjs';
import type { ResolvedElement } from 'brepjs-families';
import { BimModel, type OpeningIdentityOptions } from './model/bimModel.js';
import type { LocalId } from './identity/localId.js';
import { parseWallSpec } from './specs/wallSpec.js';
import { parseSlabSpec } from './specs/slabSpec.js';
import { parseColumnSpec } from './specs/columnSpec.js';
import { parseBeamSpec } from './specs/beamSpec.js';
import { parseRoofSpec } from './specs/roofSpec.js';
import { parseStairSpec } from './specs/stairSpec.js';
import { parseFootingSpec, parsePileSpec } from './specs/foundationSpec.js';
import { parseRailingSpec } from './specs/railingSpec.js';
import { parseRampSpec } from './specs/rampSpec.js';
import { parseCoveringSpec } from './specs/coveringSpec.js';
import { parseCurtainWallSpec } from './specs/curtainWallSpec.js';
import { parseSpaceSpec } from './specs/spaceSpec.js';
import { parseDoorSpec, parseWindowSpec } from './specs/openingSpec.js';
import type { ProxySpec } from './specs/proxySpec.js';
import type { ProjectSpec } from './specs/spatialSpec.js';
import { specError, type BimError } from './errors/bimError.js';
import type { FillsOpeningRel } from './types/relationships.js';

export interface FamiliesToBimOptions {
  readonly project: ProjectSpec;
  readonly siteName?: string | undefined;
  readonly buildingName?: string | undefined;
  /**
   * Enables the proxy route: an unrouted geometry-bearing element is
   * materialized through this evaluator and exported as an
   * IfcBuildingElementProxy (tessellated, world-frame body). Without it,
   * unrouted types stay a hard FAMILIES_UNSUPPORTED_TYPE error. The
   * evaluator's handles stay borrowed; the adapter clones what it hands the
   * model.
   */
  readonly proxyEvaluator?: csg.Evaluator | undefined;
}

export interface ProxiedElement {
  readonly keyPath: string;
  /** The family's display name, as resolved. */
  readonly type: string;
  readonly archetype: string | undefined;
}

export interface FamiliesBimResult {
  readonly model: BimModel;
  /** LocalId per geometry-bearing families key path. */
  readonly idByKeyPath: ReadonlyMap<string, LocalId>;
  /**
   * Elements exported as IfcBuildingElementProxy because no spec route
   * matched, in walk order. Only ever non-empty when `proxyEvaluator` is set:
   * without it an unrouted element is a hard error instead. A renamed family
   * that has lost its routing lands here rather than in the file as the type
   * you meant, so check this before trusting an export.
   */
  readonly proxied: readonly ProxiedElement[];
}

const SPEC_DEFAULTS = {
  origin: [0, 0, 0] as [number, number, number],
  axisX: [1, 0, 0] as [number, number, number],
  axisZ: [0, 0, 1] as [number, number, number],
  materialName: 'Default',
};

const GEOMETRY_PROPS = new Set(['voids', 'fuse', 'transform', 'psets']);

const SPEC_ROUTES = {
  wall: {
    parse: parseWallSpec,
    add: (m: BimModel, spec: unknown, key: string) => m.addWall(spec as never, { stableKey: key }),
  },
  slab: {
    parse: parseSlabSpec,
    add: (m: BimModel, spec: unknown, key: string) => m.addSlab(spec as never, { stableKey: key }),
  },
  column: {
    parse: parseColumnSpec,
    add: (m: BimModel, spec: unknown, key: string) =>
      m.addColumn(spec as never, { stableKey: key }),
  },
  beam: {
    parse: parseBeamSpec,
    add: (m: BimModel, spec: unknown, key: string) => m.addBeam(spec as never, { stableKey: key }),
  },
  roof: {
    parse: parseRoofSpec,
    add: (m: BimModel, spec: unknown, key: string) => m.addRoof(spec as never, { stableKey: key }),
  },
  stair: {
    parse: parseStairSpec,
    add: (m: BimModel, spec: unknown, key: string) => m.addStair(spec as never, { stableKey: key }),
    input: flightsSpecInput,
  },
  footing: {
    parse: parseFootingSpec,
    add: (m: BimModel, spec: unknown, key: string) =>
      m.addFooting(spec as never, { stableKey: key }),
  },
  pile: {
    parse: parsePileSpec,
    add: (m: BimModel, spec: unknown, key: string) => m.addPile(spec as never, { stableKey: key }),
  },
  railing: {
    parse: parseRailingSpec,
    add: (m: BimModel, spec: unknown, key: string) =>
      m.addRailing(spec as never, { stableKey: key }),
  },
  ramp: {
    parse: parseRampSpec,
    add: (m: BimModel, spec: unknown, key: string) => m.addRamp(spec as never, { stableKey: key }),
    input: flightsSpecInput,
  },
  covering: {
    parse: parseCoveringSpec,
    add: (m: BimModel, spec: unknown, key: string) =>
      m.addCovering(spec as never, undefined, { stableKey: key }),
  },
  curtainWall: {
    parse: parseCurtainWallSpec,
    add: (m: BimModel, spec: unknown, key: string) =>
      m.addCurtainWall(spec as never, { stableKey: key }),
  },
  space: {
    parse: parseSpaceSpec,
    add: (m: BimModel, spec: unknown, key: string) => m.addSpace(spec as never, { stableKey: key }),
  },
} as const;

/** Stair and ramp specs have no top-level origin — placement lives per flight —
 *  so the element's folded translate lands on every flight's origin instead. */
function flightsSpecInput(el: ResolvedElement): Record<string, unknown> {
  const base = specInput(el);
  const fold = (base['origin'] as readonly [number, number, number] | undefined) ?? [0, 0, 0];
  const flights = Array.isArray(base['flights'])
    ? (base['flights'] as ReadonlyArray<Record<string, unknown>>)
    : [];
  return {
    ...base,
    flights: flights.map((f) => {
      const fo = (f['origin'] as readonly [number, number, number] | undefined) ?? [0, 0, 0];
      return { ...f, origin: [fo[0] + fold[0], fo[1] + fold[1], fo[2] + fold[2]] };
    }),
  };
}

/**
 * Families predating `archetype` are routed by their display name. Keeping
 * this fallback makes the declaration purely additive, at the cost of the
 * original trap surviving for undeclared families: rename one and it stops
 * routing.
 */
const NAME_ARCHETYPES: Readonly<Record<string, string>> = {
  Storey: 'storey',
  Wall: 'wall',
  Slab: 'slab',
  Column: 'column',
  Beam: 'beam',
  Roof: 'roof',
  Stair: 'stair',
  Door: 'door',
  Window: 'window',
  Footing: 'footing',
  Pile: 'pile',
  Railing: 'railing',
  Ramp: 'ramp',
  Covering: 'covering',
  CurtainWall: 'curtainWall',
  Space: 'space',
};

function archetypeFor(el: ResolvedElement): string | undefined {
  return el.archetype ?? NAME_ARCHETYPES[el.type];
}

function specRoute(
  archetype: string | undefined
): (typeof SPEC_ROUTES)[keyof typeof SPEC_ROUTES] | undefined {
  return archetype !== undefined && Object.hasOwn(SPEC_ROUTES, archetype)
    ? SPEC_ROUTES[archetype as keyof typeof SPEC_ROUTES]
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

/** True when the element's transform PROP carries a rotation. The spec path
 *  folds only translations into IfcLocalPlacement (walls orient via `axisX`),
 *  so a tRotate placement would export un-rotated while the viewport shows it
 *  rotated — reject instead of diverging. Rotations a family render bakes
 *  into its own body geometry (e.g. a circular beam oriented along axisX) are
 *  fine: the spec rebuilds that body parametrically from props. */
function hasRotateOp(el: ResolvedElement): boolean {
  const ops = el.props['transform'];
  return (
    Array.isArray(ops) &&
    ops.some(
      (op) => typeof op === 'object' && op !== null && (op as { op?: unknown }).op === 'rotate'
    )
  );
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

/** `Pset_<Type>Common` fields the specs model first-class: mapped onto their
 *  spec names so the writer emits them in the element's own common pset. */
const COMMON_PSET_FIELDS: Readonly<Record<string, string>> = {
  IsExternal: 'isExternal',
  FireRating: 'fireRating',
  AcousticRating: 'acousticRating',
  ThermalTransmittance: 'thermalTransmittance',
  LoadBearing: 'loadBearing',
  Status: 'status',
};

function collectSpecProps(el: ResolvedElement): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const material = el.attributes['material'];
  if (typeof material === 'string' && el.props['materialName'] === undefined) {
    out['materialName'] = material;
  }
  const psets = el.attributes['psets'];
  if (psets && typeof psets === 'object') {
    const custom: Record<string, Record<string, string | number | boolean>> = {};
    // Only the element's OWN common pset maps onto spec fields — a foreign
    // Common pset (e.g. Pset_DoorCommon on a Wall) must not be relabeled onto
    // this element's common pset, so it flows through as a custom pset.
    const ownCommonPset = `Pset_${el.type}Common`;
    for (const [psetName, fields] of Object.entries(psets as Record<string, unknown>)) {
      if (!fields || typeof fields !== 'object') continue;
      const record = fields as Record<string, unknown>;
      if (psetName === ownCommonPset) {
        for (const [field, specKey] of Object.entries(COMMON_PSET_FIELDS)) {
          if (record[field] !== undefined) out[specKey] = record[field];
        }
      } else {
        // Non-Common psets flow through as custom properties; the writer emits
        // them verbatim. The element's own common pset stays spec-generated,
        // so it is never duplicated here.
        const values: Record<string, string | number | boolean> = {};
        for (const [field, value] of Object.entries(record)) {
          if (
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
          ) {
            values[field] = value;
          }
        }
        if (Object.keys(values).length > 0) custom[psetName] = values;
      }
    }
    if (Object.keys(custom).length > 0) {
      const declared = el.props['customProperties'];
      out['customProperties'] =
        declared && typeof declared === 'object'
          ? { ...custom, ...(declared as Record<string, unknown>) }
          : custom;
    }
  }
  return out;
}

function addFill(
  model: BimModel,
  fill: ResolvedElement,
  input: Record<string, unknown>,
  identity: OpeningIdentityOptions
): Result<LocalId, BimError> {
  const archetype = archetypeFor(fill);
  if (archetype === 'door') {
    const parsed = parseDoorSpec(input);
    if (!parsed.ok) return parsed;
    return model.addDoor(parsed.value, identity);
  }
  if (archetype === 'window') {
    const parsed = parseWindowSpec(input);
    if (!parsed.ok) return parsed;
    return model.addWindow(parsed.value, identity);
  }
  return err(
    specError(
      'FAMILIES_UNSUPPORTED_FILL',
      `familiesToBim: no fill mapping for element type '${fill.type}' at '${fill.keyPath}' (archetype: ${archetype ?? 'none'}) — a filler needs archetype: 'door' or 'window'`
    )
  );
}

/** Materialize an unrouted element's IR and add it as a proxy. The body is
 *  authoritative for a proxy (no parametric spec to diverge from), so baked
 *  transforms — rotations included — are fine here. */
function addProxyElement(
  model: BimModel,
  el: ResolvedElement,
  evaluator: csg.Evaluator
): Result<LocalId, BimError> {
  const evaluated = evaluator.evaluate(el.geometry);
  if (!evaluated.ok) {
    return err(
      specError(
        'FAMILIES_PROXY_EVAL_FAILED',
        `familiesToBim: '${el.keyPath}' failed to materialize for the proxy route: ${evaluated.error.message}`,
        evaluated.error
      )
    );
  }
  // Booleans can materialize as a compound wrapping one solid; accept that,
  // reject anything that is not exactly one solid body.
  let source = evaluated.value;
  if (!isSolid(source)) {
    const solids = getSolids(source);
    const only = solids.length === 1 ? solids[0] : undefined;
    if (only === undefined) {
      return err(
        specError(
          'FAMILIES_PROXY_NOT_SOLID',
          `familiesToBim: '${el.keyPath}' materialized to ${solids.length} solids — a proxy body must be exactly one`
        )
      );
    }
    source = only;
  }
  // The evaluator (or its topology cache) owns `source`; addProxy takes
  // ownership of what it is handed, so give the model an independent copy.
  const copy = clone(source);
  if (!copy.ok) {
    return err(
      specError(
        'FAMILIES_PROXY_EVAL_FAILED',
        `familiesToBim: '${el.keyPath}' could not copy the materialized body`,
        copy.error
      )
    );
  }
  const valid = validSolid(copy.value);
  if (!valid.ok) {
    copy.value[Symbol.dispose]();
    return err(
      specError(
        'FAMILIES_PROXY_INVALID',
        `familiesToBim: '${el.keyPath}' materialized to an invalid solid: ${valid.error}`
      )
    );
  }
  const nameAttr = el.attributes['name'];
  const materialProp = el.props['materialName'];
  const specProps = collectSpecProps(el);
  return model.addProxy(
    {
      name: typeof nameAttr === 'string' ? nameAttr : el.type,
      solid: valid.value,
      materialName:
        typeof materialProp === 'string'
          ? materialProp
          : (specProps['materialName'] as string | undefined),
      customProperties: specProps['customProperties'] as ProxySpec['customProperties'],
    },
    { stableKey: el.keyPath }
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
      ...collectSpecProps(fill),
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
  const siteResult = model.addSite({ name: options.siteName ?? 'Site' });
  if (!siteResult.ok) {
    model[Symbol.dispose]();
    return siteResult;
  }
  const buildingResult = model.addBuilding({ name: options.buildingName ?? 'Building' });
  if (!buildingResult.ok) {
    model[Symbol.dispose]();
    return buildingResult;
  }
  const buildingId = buildingResult.value;
  const project = model.getProject();
  if (project !== null) model.aggregate(project.localId, siteResult.value);
  model.aggregate(siteResult.value, buildingId);

  const idByKeyPath = new Map<string, LocalId>();
  const proxied: ProxiedElement[] = [];
  const walk = (
    el: ResolvedElement,
    storeyId: LocalId | null,
    rotated: boolean
  ): Result<void, BimError> => {
    // A rotate op anywhere on the ancestor chain taints every routed
    // descendant: inherited transforms carry it into their geometry.
    const rotatedHere = rotated || hasRotateOp(el);
    let proxiedHere = false;
    let containerId = storeyId;
    const archetype = archetypeFor(el);
    const route = specRoute(archetype);
    if (archetype === 'storey') {
      const keyed = requireKeyed(el);
      if (!keyed.ok) return keyed;
      const storeyResult = model.addStorey(
        {
          name: (el.attributes['name'] as string | undefined) ?? el.keyPath,
          elevation: (el.props['elevation'] as number | undefined) ?? 0,
        },
        { stableKey: el.keyPath }
      );
      if (!storeyResult.ok) return storeyResult;
      model.aggregate(buildingId, storeyResult.value);
      idByKeyPath.set(el.keyPath, storeyResult.value);
      containerId = storeyResult.value;
    } else if (route !== undefined) {
      const keyed = requireKeyed(el);
      if (!keyed.ok) return keyed;
      if (rotatedHere) {
        return err(
          specError(
            'FAMILIES_UNSUPPORTED_TRANSFORM',
            `familiesToBim: '${el.keyPath}' carries a rotated placement — the spec path folds only translations into IfcLocalPlacement; orient walls via axisX instead of tRotate`
          )
        );
      }
      // The spec path rebuilds the body parametrically: an anonymous
      // (non-fill) void cuts only the IR/viewport geometry, so exporting it
      // silently would diverge the IFC body from what the user sees.
      const voids = el.props['voids'];
      if (Array.isArray(voids)) {
        const openings = el.children.filter((c) => c.type === 'Opening').length;
        if (voids.length > openings) {
          return err(
            specError(
              'FAMILIES_ANONYMOUS_VOID',
              `familiesToBim: '${el.keyPath}' has ${voids.length - openings} anonymous void(s) the IFC body cannot carry — use a fill-role family (Door/Window) for each void`
            )
          );
        }
      }
      const parsed = route.parse(('input' in route ? route.input : specInput)(el));
      if (!parsed.ok) return parsed;
      const added = route.add(model, parsed.value, el.keyPath);
      if (!added.ok) return added;
      idByKeyPath.set(el.keyPath, added.value);
      if (containerId === null) {
        return err(
          specError(
            'FAMILIES_NO_STOREY',
            `familiesToBim: '${el.keyPath}' has no Storey ancestor — IFC elements need spatial containment; a container family needs archetype: 'storey' to be recognised under any name`
          )
        );
      }
      model.placeIn(added.value, containerId);
      if (archetype === 'wall') {
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
      if (options.proxyEvaluator === undefined) {
        return err(
          specError(
            'FAMILIES_UNSUPPORTED_TYPE',
            `familiesToBim: no spec mapping for element type '${el.type}' at '${el.keyPath}' (archetype: ${el.archetype ?? 'none'}) — routing is by archetype, so declare one on the family, add a spec route, or pass proxyEvaluator to export it as an IfcBuildingElementProxy`
          )
        );
      }
      const keyed = requireKeyed(el);
      if (!keyed.ok) return keyed;
      if (containerId === null) {
        return err(
          specError(
            'FAMILIES_NO_STOREY',
            `familiesToBim: '${el.keyPath}' has no Storey ancestor — IFC elements need spatial containment; a container family needs archetype: 'storey' to be recognised under any name`
          )
        );
      }
      const added = addProxyElement(model, el, options.proxyEvaluator);
      if (!added.ok) return added;
      model.placeIn(added.value, containerId);
      idByKeyPath.set(el.keyPath, added.value);
      proxied.push({ keyPath: el.keyPath, type: el.type, archetype: el.archetype });
      proxiedHere = true;
    }
    for (const child of el.children) {
      // A wall's openings were mapped by addOpenings; a proxy's are baked
      // into its authoritative tessellated body — neither wants the
      // outside-wall rejection on the synthesized Opening child.
      if ((archetype === 'wall' || proxiedHere) && child.type === 'Opening') continue;
      const r = walk(child, containerId, rotatedHere);
      if (!r.ok) return r;
    }
    return ok(undefined);
  };

  const walked = walk(root, null, false);
  if (!walked.ok) {
    model[Symbol.dispose]();
    return walked;
  }
  return ok({ model, idByKeyPath, proxied });
}
