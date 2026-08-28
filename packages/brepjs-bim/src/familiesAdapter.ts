/**
 * brepjs-families -> BimModel adapter. Consumes a resolved element tree and
 * feeds each element's PRE-DESUGARED props into the parametric specs — the
 * spec path stays authoritative for IFC (IfcExtrudedAreaSolid + placement),
 * while the IR path serves the viewport and dedup. GlobalIds derive from
 * families key paths (stable under reordering), not insertion order.
 *
 * Scope: building Storey containers; civil Site/Bridge/recursive Bridge Part
 * structure and Earthworks Fill bodies; Wall/Slab/Column/Beam/Roof/Stair,
 * Footing/Pile, Railing/Ramp, Covering/CurtainWall, and Space elements; and
 * wall openings — a fill-role void (Door/Window family) maps onto
 * addDoor/addWindow, which cut
 * the wall and wire IfcRelVoidsElement + IfcRelFillsElement; the opening and
 * filler GlobalIds derive from the synthesized key paths. Anonymous (non-fill)
 * voids are rejected: they cut only the IR/viewport geometry, and exporting
 * the uncut spec body would silently diverge from what the user sees.
 */

import {
  applyMatrix,
  clone,
  err,
  getSolids,
  isSolid,
  ok,
  translate,
  validSolid,
  type Result,
  type ValidSolid,
  type csg,
} from 'brepjs';
import type { ResolvedElement } from 'brepjs-families';
import { placementToMatrix, type Vec3 } from './import/placement.js';
import {
  IDENTITY_FRAME,
  decomposeFrame,
  frameFromOps,
  frameFromPlacement,
  frameInverse,
  frameMul,
  frameOrigin,
  isPureTranslation,
  translationFrame,
  type Frame,
} from './placementFrame.js';
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
import {
  parseBridgePartSpec,
  parseBridgeSpec,
  type BridgePartPredefinedType,
  type BridgePredefinedType,
  type EarthworksFillSpec,
  type EarthworksFillPredefinedType,
  type FacilityUsageType,
} from './specs/infrastructureSpec.js';
import type { ProxySpec } from './specs/proxySpec.js';
import {
  parseSiteSpec,
  type IfcElementCompositionType,
  type ProjectSpec,
} from './specs/spatialSpec.js';
import { specError, type BimError } from './errors/bimError.js';
import type { FillsOpeningRel } from './types/relationships.js';

export interface FamiliesToBimOptions {
  readonly project: ProjectSpec;
  readonly siteName?: string | undefined;
  readonly buildingName?: string | undefined;
  /**
   * Materializes exact evaluated Product Bodies for supported typed routes
   * such as Earthworks Fill. Supplying this option does not opt unsupported
   * products into the proxy fallback.
   */
  readonly bodyEvaluator?: csg.Evaluator | undefined;
  /**
   * Enables the proxy route: an unrouted geometry-bearing element is
   * materialized through this evaluator and exported as an
   * IfcBuildingElementProxy (tessellated authoritative body). Without it,
   * unrouted types stay a hard FAMILIES_UNSUPPORTED_TYPE error. The
   * evaluator's handles stay borrowed; the adapter clones what it hands the
   * model. For backward compatibility it also supplies the body evaluator when
   * `bodyEvaluator` is absent.
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

const CIVIL_PRODUCT_ROUTES: Readonly<
  Record<
    string,
    {
      readonly archetype: keyof typeof SPEC_ROUTES;
      readonly roles: readonly string[];
    }
  >
> = {
  beam: { archetype: 'beam', roles: ['beam', 'cross-girder', 'girder'] },
  column: { archetype: 'column', roles: ['pier-stem'] },
  footing: { archetype: 'footing', roles: ['pad'] },
  railing: { archetype: 'railing', roles: ['guardrail'] },
  slab: { archetype: 'slab', roles: ['deck'] },
  wall: { archetype: 'wall', roles: ['wall'] },
};

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
  return el.archetype ?? lookup(NAME_ARCHETYPES, el.type);
}

function specRoute(
  archetype: string | undefined
): (typeof SPEC_ROUTES)[keyof typeof SPEC_ROUTES] | undefined {
  return archetype !== undefined && Object.hasOwn(SPEC_ROUTES, archetype)
    ? SPEC_ROUTES[archetype as keyof typeof SPEC_ROUTES]
    : undefined;
}

/** Own-property lookup: semantics categories and roles are free-form author
 *  strings, so Object.prototype keys must never resolve to a route. */
function lookup<T>(map: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

function civilProductArchetype(el: ResolvedElement): keyof typeof SPEC_ROUTES | undefined {
  if (el.semantics?.kind !== 'product') return undefined;
  const definition = lookup(CIVIL_PRODUCT_ROUTES, el.semantics.category);
  if (definition === undefined || !definition.roles.includes(el.semantics.role)) return undefined;
  return definition.archetype;
}

function semanticDimension(el: ResolvedElement, ...names: readonly string[]): number | undefined {
  if (el.semantics?.kind !== 'product') return undefined;
  for (const name of names) {
    const value = el.semantics.dimensionsMm[name];
    if (value !== undefined) return value;
  }
  return undefined;
}

/** Beam/column solids centre their cross-section on the placement axis, while
 *  the semantics envelope sits corner-anchored at the folded IR origin — shift
 *  the origin to the envelope centre so the exported body occupies the same
 *  space as the viewport body. */
function centreOrigin(
  base: Record<string, unknown>,
  shift: readonly [number, number, number]
): [number, number, number] {
  const origin = (base['origin'] as readonly [number, number, number] | undefined) ?? [0, 0, 0];
  return [origin[0] + shift[0], origin[1] + shift[1], origin[2] + shift[2]];
}

/** A cross-section synthesized from civil envelope dimensions, plus the
 *  placement shift that centres it on the beam/column axis. Shared by the
 *  translation path (which bakes the shift into `origin`) and the rotation path
 *  (which folds it into the placement frame), so the two never drift. */
interface SynthesizedProfile {
  readonly profile: {
    readonly kind: 'RECTANGULAR';
    readonly width: number;
    readonly height: number;
  };
  readonly shift: readonly [number, number, number];
}

function synthesizedProfile(el: ResolvedElement): SynthesizedProfile | undefined {
  if (el.semantics?.kind !== 'product' || el.props['profile'] !== undefined) return undefined;
  const length = semanticDimension(el, 'length');
  const width = semanticDimension(el, 'width');
  const height = semanticDimension(el, 'height');
  if (el.semantics.category === 'beam' && width !== undefined && height !== undefined) {
    return { profile: { kind: 'RECTANGULAR', width, height }, shift: [0, width / 2, height / 2] };
  }
  if (el.semantics.category === 'column' && length !== undefined && width !== undefined) {
    return {
      profile: { kind: 'RECTANGULAR', width: length, height: width },
      shift: [length / 2, width / 2, 0],
    };
  }
  return undefined;
}

/**
 * Adapts target-independent civil envelope dimensions onto existing typed BIM
 * spec inputs. Reference infrastructure Families intentionally author domain
 * props such as `depth`, `capOffset`, and compound railing profiles rather than
 * BIM `profile`/`thickness` fields; semantics is the stable projection seam.
 */
function civilProductSpecInput(el: ResolvedElement): Record<string, unknown> {
  const base = specInput(el);
  if (el.semantics?.kind !== 'product') return base;
  const length = semanticDimension(el, 'length');
  const width = semanticDimension(el, 'width');
  const height = semanticDimension(el, 'height');
  switch (el.semantics.category) {
    case 'beam': {
      const synthesized = synthesizedProfile(el);
      return {
        ...base,
        ...(synthesized !== undefined
          ? { origin: centreOrigin(base, synthesized.shift), profile: synthesized.profile }
          : {}),
        length: length ?? base['length'],
        predefinedType: base['predefinedType'] ?? 'BEAM',
      };
    }
    case 'column': {
      const synthesized = synthesizedProfile(el);
      return {
        ...base,
        ...(synthesized !== undefined
          ? { origin: centreOrigin(base, synthesized.shift), profile: synthesized.profile }
          : {}),
        height: height ?? base['height'],
        predefinedType: base['predefinedType'] ?? 'COLUMN',
      };
    }
    case 'footing':
      return {
        ...base,
        length: length ?? base['length'],
        width: width ?? base['width'],
        thickness: height ?? base['thickness'],
        predefinedType: base['predefinedType'] ?? 'PAD_FOOTING',
      };
    case 'railing':
      return {
        ...base,
        length: length ?? base['length'],
        thickness: width ?? base['thickness'],
        height: height ?? base['height'],
        predefinedType: base['predefinedType'] ?? 'GUARDRAIL',
      };
    case 'slab':
      return {
        ...base,
        length: length ?? base['length'],
        width: width ?? base['width'],
        thickness: height ?? base['thickness'],
        predefinedType: base['predefinedType'] ?? 'FLOOR',
      };
    case 'wall':
      return {
        ...base,
        length: length ?? base['length'],
        thickness: width ?? base['thickness'],
        height: height ?? base['height'],
        predefinedType: base['predefinedType'] ?? 'NOTDEFINED',
      };
    default:
      return base;
  }
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

/** True when the element's rendered local transform carries a rotation, which
 *  switches the walk to the rigid-frame placement path (the composed rotation
 *  folds into origin + axisX + axisZ). Only authored `transform` rotations
 *  count: a rotation a family render bakes into its own body geometry (e.g. a
 *  circular beam oriented along axisX) stays in the body, which the spec
 *  rebuilds parametrically from props. */
function hasRotateOp(el: ResolvedElement): boolean {
  return el.localTransforms.some((op) => op.op === 'rotate');
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
  const semanticsMaterial = el.semantics?.kind === 'product' ? el.semantics.material : undefined;
  if (el.props['materialName'] === undefined) {
    if (typeof material === 'string') out['materialName'] = material;
    else if (semanticsMaterial !== undefined) out['materialName'] = semanticsMaterial;
  }
  const psets = el.attributes['psets'];
  const custom: Record<string, Record<string, string | number | boolean>> = {};
  if (psets && typeof psets === 'object') {
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
  }
  // Declared `customProperties` merge over attribute-derived psets, sanitized to
  // primitive fields so the writer never enumerates a non-pset-shaped value —
  // and they survive when no psets attribute exists.
  const declared = el.props['customProperties'];
  if (declared && typeof declared === 'object' && !Array.isArray(declared)) {
    for (const [psetName, fields] of Object.entries(declared as Record<string, unknown>)) {
      if (!fields || typeof fields !== 'object' || Array.isArray(fields)) continue;
      const values: Record<string, string | number | boolean> = {};
      for (const [field, value] of Object.entries(fields as Record<string, unknown>)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          values[field] = value;
        }
      }
      if (Object.keys(values).length > 0) custom[psetName] = values;
    }
  }
  if (Object.keys(custom).length > 0) out['customProperties'] = custom;
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

interface BodyMaterializationErrors {
  readonly evalCode: string;
  readonly notSolidCode: string;
  readonly invalidCode: string;
  readonly routeName: string;
}

function materializeOwnedSolid(
  el: ResolvedElement,
  evaluator: csg.Evaluator,
  errors: BodyMaterializationErrors
): Result<ValidSolid, BimError> {
  const evaluated = evaluator.evaluate(el.geometry);
  if (!evaluated.ok) {
    return err(
      specError(
        errors.evalCode,
        `familiesToBim: '${el.keyPath}' failed to materialize for the ${errors.routeName} route: ${evaluated.error.message}`,
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
          errors.notSolidCode,
          `familiesToBim: '${el.keyPath}' materialized to ${solids.length} solids — the ${errors.routeName} body must be exactly one`
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
        errors.evalCode,
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
        errors.invalidCode,
        `familiesToBim: '${el.keyPath}' materialized to an invalid solid: ${valid.error}`
      )
    );
  }
  return ok(valid.value);
}

/** Materialize an unrouted element's IR and add it as a proxy. The body is
 *  authoritative for a proxy (no parametric spec to diverge from), so baked
 *  transforms — rotations included — are fine here. */
function addProxyElement(
  model: BimModel,
  el: ResolvedElement,
  evaluator: csg.Evaluator,
  spatialFrame: Frame
): Result<LocalId, BimError> {
  const body = materializeOwnedSolid(el, evaluator, {
    evalCode: 'FAMILIES_PROXY_EVAL_FAILED',
    notSolidCode: 'FAMILIES_PROXY_NOT_SOLID',
    invalidCode: 'FAMILIES_PROXY_INVALID',
    routeName: 'proxy',
  });
  if (!body.ok) return body;
  const localized = localizeBodyToFrame(
    el,
    body.value,
    spatialFrame,
    'FAMILIES_PROXY_LOCALIZE_FAILED',
    'spatial parent'
  );
  if (!localized.ok) return localized;
  const nameAttr = el.attributes['name'];
  const materialProp = el.props['materialName'];
  const specProps = collectSpecProps(el);
  const added = model.addProxy(
    {
      name: typeof nameAttr === 'string' ? nameAttr : el.type,
      solid: localized.value,
      materialName:
        typeof materialProp === 'string'
          ? materialProp
          : (specProps['materialName'] as string | undefined),
      customProperties: specProps['customProperties'] as ProxySpec['customProperties'],
    },
    { stableKey: el.keyPath }
  );
  if (!added.ok) localized.value[Symbol.dispose]();
  return added;
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

type CivilSpatialKind = 'site' | 'bridge' | 'bridge-part';
type CivilParentKind = 'project' | CivilSpatialKind;

const BRIDGE_ROLE: Readonly<Record<string, BridgePredefinedType>> = {
  arched: 'ARCHED',
  'cable-stayed': 'CABLE_STAYED',
  cantilever: 'CANTILEVER',
  culvert: 'CULVERT',
  framework: 'FRAMEWORK',
  girder: 'GIRDER',
  suspension: 'SUSPENSION',
  truss: 'TRUSS',
};

const BRIDGE_PART_ROLE: Readonly<Record<string, BridgePartPredefinedType>> = {
  abutment: 'ABUTMENT',
  deck: 'DECK',
  'deck-segment': 'DECK_SEGMENT',
  foundation: 'FOUNDATION',
  pier: 'PIER',
  'pier-segment': 'PIER_SEGMENT',
  pylon: 'PYLON',
  substructure: 'SUBSTRUCTURE',
  superstructure: 'SUPERSTRUCTURE',
  'surface-structure': 'SURFACESTRUCTURE',
};

const CIVIL_COMPOSITION: Readonly<Record<string, IfcElementCompositionType>> = {
  collection: 'COMPLEX',
  element: 'ELEMENT',
  partial: 'PARTIAL',
};

const CIVIL_USAGE: Readonly<Record<string, FacilityUsageType>> = {
  lateral: 'LATERAL',
  longitudinal: 'LONGITUDINAL',
  regional: 'REGION',
  vertical: 'VERTICAL',
};

const EARTHWORKS_FILL_ROLE: Readonly<Record<string, EarthworksFillPredefinedType>> = {
  backfill: 'BACKFILL',
  counterweight: 'COUNTERWEIGHT',
  embankment: 'EMBANKMENT',
  'slope-fill': 'SLOPEFILL',
  subgrade: 'SUBGRADE',
  'subgrade-bed': 'SUBGRADEBED',
  'transition-section': 'TRANSITIONSECTION',
};

function unsupportedCivilRole(
  el: ResolvedElement,
  entity: 'Site' | 'Bridge' | 'Bridge Part' | 'Earthworks Fill'
): Result<never, BimError> {
  return err(
    specError(
      'FAMILIES_UNSUPPORTED_CIVIL_SEMANTICS',
      `familiesToBim: unsupported ${entity} role '${el.semantics?.role ?? ''}' at '${el.keyPath}'`
    )
  );
}

function civilSpatialKind(el: ResolvedElement): CivilSpatialKind | undefined {
  const semantics = el.semantics;
  if (semantics?.kind === 'site' && semantics.category === 'site') return 'site';
  if (semantics?.kind === 'facility' && semantics.category === 'bridge') return 'bridge';
  if (semantics?.kind === 'spatial-part' && semantics.category === 'bridge-part') {
    return 'bridge-part';
  }
  return undefined;
}

function isCivilSpatialIntent(el: ResolvedElement): boolean {
  return (
    el.semantics?.kind === 'site' ||
    el.semantics?.kind === 'facility' ||
    el.semantics?.kind === 'spatial-part'
  );
}

function hasCivilSpatialIntent(el: ResolvedElement): boolean {
  return isCivilSpatialIntent(el) || el.children.some(hasCivilSpatialIntent);
}

function isEarthworksFillOccurrence(el: ResolvedElement): boolean {
  return el.semantics?.kind === 'product' && el.semantics.category === 'earthworks-fill';
}

function semanticName(el: ResolvedElement): string {
  const name = el.attributes['name'];
  if (typeof name === 'string' && name.trim().length > 0) return name;
  const semanticNameValue = el.semantics?.properties?.['name'];
  return typeof semanticNameValue === 'string' && semanticNameValue.trim().length > 0
    ? semanticNameValue
    : el.keyPath;
}

type Translation = readonly [number, number, number];

const ZERO_TRANSLATION: Translation = [0, 0, 0];

function addTranslation(a: Translation, b: Translation): Translation {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtractTranslation(a: Translation, b: Translation): Translation {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function hasTranslation(value: Translation): boolean {
  return value[0] !== 0 || value[1] !== 0 || value[2] !== 0;
}

const DEFAULT_AXIS_X: Translation = [1, 0, 0];
const DEFAULT_AXIS_Z: Translation = [0, 0, 1];

function axisEquals(value: unknown, axis: Translation): boolean {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((component, i) => typeof component === 'number' && component === axis[i])
  );
}

/** True when a civil node authors non-default `axisX`/`axisZ` props: like a
 *  tRotate, this puts the node (and its subtree) on the rigid-frame placement
 *  path so descendants relativize against the rotated parent frame. */
function hasRotatedAxes(el: ResolvedElement): boolean {
  const axisX = el.props['axisX'];
  const axisZ = el.props['axisZ'];
  return (
    (axisX !== undefined && !axisEquals(axisX, DEFAULT_AXIS_X)) ||
    (axisZ !== undefined && !axisEquals(axisZ, DEFAULT_AXIS_Z))
  );
}

function authoredSpecOrigin(el: ResolvedElement): Translation {
  const origin = el.props['origin'];
  return Array.isArray(origin) && origin.length === 3 && origin.every((c) => typeof c === 'number')
    ? (origin as unknown as Translation)
    : ZERO_TRANSLATION;
}

function localizeOwnedSolid(
  el: ResolvedElement,
  body: ValidSolid,
  projectedSpatialTranslation: Translation,
  errorCode: string,
  frameName: string
): Result<ValidSolid, BimError> {
  if (!hasTranslation(projectedSpatialTranslation)) return ok(body);
  try {
    const localized = translate(body, [
      -projectedSpatialTranslation[0],
      -projectedSpatialTranslation[1],
      -projectedSpatialTranslation[2],
    ]);
    body[Symbol.dispose]();
    return ok(localized);
  } catch (cause) {
    body[Symbol.dispose]();
    return err(
      specError(
        errorCode,
        `familiesToBim: '${el.keyPath}' could not move its body into the ${frameName} frame`,
        cause
      )
    );
  }
}

function authoredTranslation(el: ResolvedElement): Translation {
  const total: [number, number, number] = [0, 0, 0];
  for (const op of el.localTransforms) {
    if (op.op !== 'translate') continue;
    total[0] += op.v[0];
    total[1] += op.v[1];
    total[2] += op.v[2];
  }
  return total;
}

function authoredAxisX(el: ResolvedElement): Vec3 {
  const v = el.props['axisX'];
  return Array.isArray(v) && v.length === 3 ? (v as unknown as Vec3) : DEFAULT_AXIS_X;
}

function authoredAxisZ(el: ResolvedElement): Vec3 {
  const v = el.props['axisZ'];
  return Array.isArray(v) && v.length === 3 ? (v as unknown as Vec3) : DEFAULT_AXIS_Z;
}

/** The placement shift that centres a synthesized beam/column cross-section on
 *  its axis, in the element's own (body) frame. Zero for every other route. */
function specLocalShift(el: ResolvedElement): Vec3 {
  return synthesizedProfile(el)?.shift ?? [0, 0, 0];
}

/** World frame of an element's own body: the walk's cumulative frame (all
 *  authored transforms, ancestors + own) composed with the body's authored axes
 *  (`axisX`/`axisZ` props) and its local origin (`origin` prop + centring
 *  shift). Under no rotation this reduces to `composedOrigin` + shift. */
function elementBodyFrame(el: ResolvedElement, cumulativeFrame: Frame): Frame {
  const axes = frameFromPlacement({
    origin: authoredSpecOrigin(el),
    axisX: authoredAxisX(el),
    axisZ: authoredAxisZ(el),
  });
  return frameMul(frameMul(cumulativeFrame, axes), translationFrame(specLocalShift(el)));
}

/** World frame of a civil spatial node: cumulative transforms composed with any
 *  authored `origin`/`axisX`/`axisZ` props (identity when default). */
function civilNodeFrame(el: ResolvedElement, cumulativeFrame: Frame): Frame {
  return frameMul(
    cumulativeFrame,
    frameFromPlacement({
      origin: authoredSpecOrigin(el),
      axisX: authoredAxisX(el),
      axisZ: authoredAxisZ(el),
    })
  );
}

/** Places a routed element's spec input through the composed placement frame:
 *  the flat spec input keeps its dimensions/profile/psets, but `origin`/`axisX`/
 *  `axisZ` are recomputed from the element's world frame relative to its spatial
 *  container. Stair/ramp flights, which carry their own per-flight frame, are
 *  each re-placed the same way. */
function rotatedRoutedInput(
  flatInput: Record<string, unknown>,
  el: ResolvedElement,
  cumulativeFrame: Frame,
  spatialFrame: Frame
): Record<string, unknown> {
  const toSpatial = frameInverse(spatialFrame);
  if (Array.isArray(flatInput['flights'])) {
    // Flights place per-flight (no element-level origin); compose each flight's
    // authored frame under the element's world transform.
    const flights: readonly unknown[] = flatInput['flights'];
    return {
      ...flatInput,
      origin: [0, 0, 0],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
      flights: flights.map((flight): unknown => {
        if (typeof flight !== 'object' || flight === null) return flight;
        const f = flight as Record<string, unknown>;
        const world = frameMul(
          cumulativeFrame,
          frameFromPlacement({
            origin: (f['origin'] as Vec3 | undefined) ?? [0, 0, 0],
            axisX: (f['axisX'] as Vec3 | undefined) ?? DEFAULT_AXIS_X,
            axisZ: (f['axisZ'] as Vec3 | undefined) ?? DEFAULT_AXIS_Z,
          })
        );
        const placed = decomposeFrame(frameMul(toSpatial, world));
        return { ...f, origin: placed.origin, axisX: placed.axisX, axisZ: placed.axisZ };
      }),
    };
  }
  const placed = decomposeFrame(frameMul(toSpatial, elementBodyFrame(el, cumulativeFrame)));
  return { ...flatInput, origin: placed.origin, axisX: placed.axisX, axisZ: placed.axisZ };
}

/** Moves an owned world-baked body into its spatial container's local frame.
 *  A pure translation keeps the fast `translate` path (identical to the prior
 *  behaviour); a rotated container applies the inverse frame via `applyMatrix`. */
function localizeBodyToFrame(
  el: ResolvedElement,
  body: ValidSolid,
  spatialFrame: Frame,
  errorCode: string,
  frameName: string
): Result<ValidSolid, BimError> {
  if (isPureTranslation(spatialFrame)) {
    return localizeOwnedSolid(el, body, frameOrigin(spatialFrame), errorCode, frameName);
  }
  const inverse = decomposeFrame(frameInverse(spatialFrame));
  try {
    const localized = applyMatrix(body, placementToMatrix(inverse));
    if (!localized.ok) {
      body[Symbol.dispose]();
      return err(
        specError(
          errorCode,
          `familiesToBim: '${el.keyPath}' could not move its body into the ${frameName} frame`,
          localized.error
        )
      );
    }
    body[Symbol.dispose]();
    return ok(localized.value);
  } catch (cause) {
    body[Symbol.dispose]();
    return err(
      specError(
        errorCode,
        `familiesToBim: '${el.keyPath}' could not move its body into the ${frameName} frame`,
        cause
      )
    );
  }
}

function civilSpatialInput(
  el: ResolvedElement,
  localTranslation: Translation
): Record<string, unknown> {
  const semantics = el.semantics;
  const composition =
    semantics !== undefined && 'composition' in semantics
      ? CIVIL_COMPOSITION[semantics.composition]
      : undefined;
  const explicitOrigin = (el.props['origin'] as Translation | undefined) ?? ZERO_TRANSLATION;
  const origin = addTranslation(explicitOrigin, localTranslation);
  return {
    name: semanticName(el),
    ...(el.props['origin'] !== undefined || hasTranslation(localTranslation) ? { origin } : {}),
    ...(el.props['axisX'] !== undefined ? { axisX: el.props['axisX'] } : {}),
    ...(el.props['axisZ'] !== undefined ? { axisZ: el.props['axisZ'] } : {}),
    ...(composition !== undefined ? { compositionType: composition } : {}),
  };
}

/** Relativizes a civil node's world frame against its parent civil frame into
 *  the origin/axisX/axisZ the spatial specs consume. */
function civilSpatialFrameInput(
  el: ResolvedElement,
  nodeFrame: Frame,
  parentFrame: Frame
): Record<string, unknown> {
  const semantics = el.semantics;
  const composition =
    semantics !== undefined && 'composition' in semantics
      ? CIVIL_COMPOSITION[semantics.composition]
      : undefined;
  const local = decomposeFrame(frameMul(frameInverse(parentFrame), nodeFrame));
  return {
    name: semanticName(el),
    origin: local.origin,
    axisX: local.axisX,
    axisZ: local.axisZ,
    ...(composition !== undefined ? { compositionType: composition } : {}),
  };
}

function civilParentAccepts(kind: CivilSpatialKind, parent: CivilParentKind): boolean {
  if (kind === 'site') return parent === 'project';
  if (kind === 'bridge') return parent === 'site';
  return parent === 'bridge' || parent === 'bridge-part';
}

function addCivilSpatialOccurrence(
  model: BimModel,
  el: ResolvedElement,
  kind: CivilSpatialKind,
  input: Record<string, unknown>
): Result<LocalId, BimError> {
  if (kind === 'site') {
    if (el.semantics?.role !== 'transport-site') return unsupportedCivilRole(el, 'Site');
    const parsed = parseSiteSpec(input);
    return parsed.ok ? model.addSite(parsed.value, { stableKey: el.keyPath }) : parsed;
  }
  if (kind === 'bridge') {
    const predefinedType = lookup(BRIDGE_ROLE, el.semantics?.role ?? '');
    if (predefinedType === undefined) return unsupportedCivilRole(el, 'Bridge');
    const parsed = parseBridgeSpec({ ...input, predefinedType });
    return parsed.ok ? model.addBridge(parsed.value, { stableKey: el.keyPath }) : parsed;
  }
  const subdivision = el.semantics?.kind === 'spatial-part' ? el.semantics.subdivision : undefined;
  const predefinedType = lookup(BRIDGE_PART_ROLE, el.semantics?.role ?? '');
  if (predefinedType === undefined) return unsupportedCivilRole(el, 'Bridge Part');
  const parsed = parseBridgePartSpec({
    ...input,
    predefinedType,
    usageType: subdivision !== undefined ? CIVIL_USAGE[subdivision] : 'NOTDEFINED',
  });
  return parsed.ok ? model.addBridgePart(parsed.value, { stableKey: el.keyPath }) : parsed;
}

function relativeSpecInput(
  input: Record<string, unknown>,
  projectedSpatialTranslation: Translation
): Record<string, unknown> {
  const relativeOrigin = (origin: unknown): unknown =>
    Array.isArray(origin) &&
    origin.length === 3 &&
    origin.every((value) => typeof value === 'number')
      ? subtractTranslation(origin as [number, number, number], projectedSpatialTranslation)
      : origin;
  if (Array.isArray(input['flights'])) {
    const flights: readonly unknown[] = input['flights'];
    return {
      ...input,
      flights: flights.map((flight): unknown => {
        if (typeof flight !== 'object' || flight === null) return flight;
        const flightInput = flight as Record<string, unknown>;
        return {
          ...flightInput,
          origin: relativeOrigin(flightInput['origin']),
        };
      }),
    };
  }
  return { ...input, origin: relativeOrigin(input['origin']) };
}

function addEarthworksFillElement(
  model: BimModel,
  el: ResolvedElement,
  evaluator: csg.Evaluator,
  spatialFrame: Frame
): Result<LocalId, BimError> {
  if (el.semantics?.kind !== 'product') {
    return err(
      specError(
        'FAMILIES_UNSUPPORTED_CIVIL_SEMANTICS',
        `familiesToBim: '${el.keyPath}' is not authored as a civil Product`
      )
    );
  }
  const predefinedType = lookup(EARTHWORKS_FILL_ROLE, el.semantics.role);
  if (predefinedType === undefined) return unsupportedCivilRole(el, 'Earthworks Fill');
  const body = materializeOwnedSolid(el, evaluator, {
    evalCode: 'FAMILIES_EARTHWORKS_EVAL_FAILED',
    notSolidCode: 'FAMILIES_EARTHWORKS_NOT_SOLID',
    invalidCode: 'FAMILIES_EARTHWORKS_INVALID',
    routeName: 'Earthworks Fill',
  });
  if (!body.ok) return body;

  const localized = localizeBodyToFrame(
    el,
    body.value,
    spatialFrame,
    'FAMILIES_EARTHWORKS_LOCALIZE_FAILED',
    'Bridge Part'
  );
  if (!localized.ok) return localized;

  const specProps = collectSpecProps(el);
  const authoredMaterial = el.props['materialName'];
  const added = model.addEarthworksFill(
    {
      name: semanticName(el),
      solid: localized.value,
      materialName:
        typeof authoredMaterial === 'string'
          ? authoredMaterial
          : ((specProps['materialName'] as string | undefined) ?? el.semantics.material),
      predefinedType,
      customProperties: specProps['customProperties'] as EarthworksFillSpec['customProperties'],
    },
    { stableKey: el.keyPath }
  );
  if (!added.ok) localized.value[Symbol.dispose]();
  return added;
}

interface ProjectionWalkState {
  readonly spatialStructureId: LocalId | null;
  readonly civilParent: CivilParentKind;
  readonly rotated: boolean;
  readonly cumulativeTranslation: Translation;
  readonly projectedSpatialTranslation: Translation;
  /** World frame of the current element's parent: every authored transform
   *  (ancestors, composed) as a rigid motion. Drives the rotation-aware
   *  placement path; its translation column equals `cumulativeTranslation`. */
  readonly cumulativeFrame: Frame;
  /** World frame of the nearest enclosing spatial container (Storey / Site /
   *  Bridge / Bridge Part). A routed element's IfcLocalPlacement is its world
   *  frame relative to this. Pure translation on the building path. */
  readonly spatialFrame: Frame;
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
  const usesAuthoredCivilHierarchy = hasCivilSpatialIntent(root);
  if (usesAuthoredCivilHierarchy) {
    const keyed = requireKeyed(root);
    if (!keyed.ok) return keyed;
  }
  const model = new BimModel();
  // A root that is itself the civil Site would otherwise collide with the
  // Project's stableKey.
  const initResult = model.init(
    options.project,
    usesAuthoredCivilHierarchy
      ? {
          stableKey:
            civilSpatialKind(root) !== undefined ? `${root.keyPath}#project` : root.keyPath,
        }
      : undefined
  );
  if (!initResult.ok) return initResult;
  const projectId = initResult.value;
  let buildingId: LocalId | null = null;
  if (!usesAuthoredCivilHierarchy) {
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
    buildingId = buildingResult.value;
    model.aggregate(projectId, siteResult.value);
    model.aggregate(siteResult.value, buildingId);
  }

  const idByKeyPath = new Map<string, LocalId>(
    usesAuthoredCivilHierarchy ? [[root.keyPath, projectId]] : []
  );
  const proxied: ProxiedElement[] = [];
  const walk = (el: ResolvedElement, state: ProjectionWalkState): Result<void, BimError> => {
    // A rotate op anywhere on the ancestor chain taints every routed
    // descendant: inherited transforms carry it into their geometry.
    const rotatedHere = state.rotated || hasRotateOp(el);
    const cumulativeTranslationHere = addTranslation(
      state.cumulativeTranslation,
      authoredTranslation(el)
    );
    const cumulativeFrameHere = frameMul(state.cumulativeFrame, frameFromOps(el.localTransforms));
    let proxiedHere = false;
    let nextRotated = rotatedHere;
    let nextSpatialStructureId = state.spatialStructureId;
    let nextCivilParent = state.civilParent;
    let nextProjectedSpatialTranslation = state.projectedSpatialTranslation;
    let nextCumulativeFrame = cumulativeFrameHere;
    let nextSpatialFrame = state.spatialFrame;
    const archetype = archetypeFor(el);
    // An explicitly authored civil Product is routed by its semantic category.
    // Do not let a coincidental legacy archetype silently change its IFC class.
    const effectiveArchetype =
      el.semantics?.kind === 'product' ? civilProductArchetype(el) : archetype;
    const route = specRoute(effectiveArchetype);
    const civilKind = civilSpatialKind(el);
    if (civilKind !== undefined) {
      if (
        !usesAuthoredCivilHierarchy ||
        !civilParentAccepts(civilKind, state.civilParent) ||
        state.spatialStructureId === null
      ) {
        return err(
          specError(
            'FAMILIES_INVALID_CIVIL_HIERARCHY',
            `familiesToBim: civil '${civilKind}' at '${el.keyPath}' cannot occur under '${state.civilParent}'`
          )
        );
      }
      const keyed = requireKeyed(el);
      if (!keyed.ok) return keyed;
      if (el.geometry.kind !== 'Empty') {
        return err(
          specError(
            'FAMILIES_UNSUPPORTED_CIVIL_SEMANTICS',
            `familiesToBim: civil spatial element '${el.keyPath}' carries its own geometry — Site/Bridge/Bridge Part export no body, so author it as a child Product (e.g. Earthworks Fill)`
          )
        );
      }
      const nodeFrame = civilNodeFrame(el, cumulativeFrameHere);
      // A rotated frame (from a tRotate ancestor/self or authored axisX/axisZ)
      // relativizes this node against its parent civil frame; a pure translation
      // keeps the exact-subtraction path. Either way descendants inherit the full
      // frame, so a rotated Site/Bridge/Bridge Part orients its children.
      const rotatedFrame = rotatedHere || hasRotatedAxes(el);
      const input = rotatedFrame
        ? civilSpatialFrameInput(el, nodeFrame, state.spatialFrame)
        : civilSpatialInput(
            el,
            subtractTranslation(cumulativeTranslationHere, state.projectedSpatialTranslation)
          );
      const added = addCivilSpatialOccurrence(model, el, civilKind, input);
      if (!added.ok) return added;
      model.aggregate(state.spatialStructureId, added.value);
      idByKeyPath.set(el.keyPath, added.value);
      nextSpatialStructureId = added.value;
      nextCivilParent = civilKind;
      nextRotated = rotatedFrame;
      // Descendants inherit the node's full frame (transforms + authored axes +
      // origin prop), so their own transforms compose in the node's coordinate
      // system and relativize against it.
      nextCumulativeFrame = nodeFrame;
      nextSpatialFrame = nodeFrame;
      // The frame's IfcLocalPlacement origin includes the spec `origin` prop on
      // top of the walk's translates, so translation-path descendants relativize
      // by both.
      nextProjectedSpatialTranslation = addTranslation(
        cumulativeTranslationHere,
        authoredSpecOrigin(el)
      );
    } else if (isCivilSpatialIntent(el)) {
      return err(
        specError(
          'FAMILIES_UNSUPPORTED_CIVIL_SEMANTICS',
          `familiesToBim: unsupported civil '${el.semantics?.kind ?? 'unknown'}' category '${el.semantics?.category ?? ''}' at '${el.keyPath}'`
        )
      );
    } else if (archetype === 'storey') {
      if (buildingId === null) {
        return err(
          specError(
            'FAMILIES_INVALID_CIVIL_HIERARCHY',
            `familiesToBim: Storey '${el.keyPath}' is not part of the civil Bridge hierarchy`
          )
        );
      }
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
      nextSpatialStructureId = storeyResult.value;
    } else if (isEarthworksFillOccurrence(el)) {
      if (
        !usesAuthoredCivilHierarchy ||
        nextSpatialStructureId === null ||
        state.civilParent !== 'bridge-part'
      ) {
        return err(
          specError(
            'FAMILIES_INVALID_CIVIL_HIERARCHY',
            `familiesToBim: Earthworks Fill '${el.keyPath}' needs a Bridge Part ancestor`
          )
        );
      }
      const bodyEvaluator = options.bodyEvaluator ?? options.proxyEvaluator;
      if (bodyEvaluator === undefined) {
        return err(
          specError(
            'FAMILIES_EARTHWORKS_EVALUATOR_REQUIRED',
            `familiesToBim: Earthworks Fill '${el.keyPath}' needs bodyEvaluator to materialize its exact Product Body`
          )
        );
      }
      const keyed = requireKeyed(el);
      if (!keyed.ok) return keyed;
      const added = addEarthworksFillElement(model, el, bodyEvaluator, state.spatialFrame);
      if (!added.ok) return added;
      model.placeIn(added.value, nextSpatialStructureId);
      idByKeyPath.set(el.keyPath, added.value);
    } else if (route !== undefined) {
      const keyed = requireKeyed(el);
      if (!keyed.ok) return keyed;
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
      const routedInput =
        el.semantics?.kind === 'product'
          ? civilProductSpecInput(el)
          : ('input' in route ? route.input : specInput)(el);
      // A tRotate on the element or its ancestors folds into the IfcLocalPlacement
      // frame (origin + axisX + axisZ); the translation-only path stays the exact
      // subtraction so unrotated placements are byte-identical. Flight routes
      // re-place off the UNFOLDED flights (specInput): flightsSpecInput already
      // adds the element origin to each flight, which the frame would double-count.
      const rotatedBase = Array.isArray(routedInput['flights']) ? specInput(el) : routedInput;
      const placedInput = rotatedHere
        ? rotatedRoutedInput(rotatedBase, el, cumulativeFrameHere, state.spatialFrame)
        : usesAuthoredCivilHierarchy
          ? relativeSpecInput(routedInput, state.projectedSpatialTranslation)
          : routedInput;
      const parsed = route.parse(placedInput);
      if (!parsed.ok) return parsed;
      const added = route.add(model, parsed.value, el.keyPath);
      if (!added.ok) return added;
      idByKeyPath.set(el.keyPath, added.value);
      if (
        nextSpatialStructureId === null ||
        (usesAuthoredCivilHierarchy && state.civilParent !== 'bridge-part')
      ) {
        return err(
          specError(
            usesAuthoredCivilHierarchy ? 'FAMILIES_INVALID_CIVIL_HIERARCHY' : 'FAMILIES_NO_STOREY',
            usesAuthoredCivilHierarchy
              ? `familiesToBim: physical product '${el.keyPath}' needs a Bridge Part ancestor`
              : `familiesToBim: '${el.keyPath}' has no Storey ancestor — IFC elements need spatial containment; a container family needs archetype: 'storey' to be recognised under any name`
          )
        );
      }
      model.placeIn(added.value, nextSpatialStructureId);
      if (effectiveArchetype === 'wall') {
        const opened = addOpenings(model, el, added.value, nextSpatialStructureId, idByKeyPath);
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
            `familiesToBim: no supported spec mapping for element type '${el.type}' at '${el.keyPath}' (archetype: ${el.archetype ?? 'none'}) — declare a recognized archetype or civil Product category/role, add a spec route, or pass proxyEvaluator to export it as an IfcBuildingElementProxy`
          )
        );
      }
      const keyed = requireKeyed(el);
      if (!keyed.ok) return keyed;
      if (
        nextSpatialStructureId === null ||
        (usesAuthoredCivilHierarchy && state.civilParent !== 'bridge-part')
      ) {
        return err(
          specError(
            usesAuthoredCivilHierarchy ? 'FAMILIES_INVALID_CIVIL_HIERARCHY' : 'FAMILIES_NO_STOREY',
            usesAuthoredCivilHierarchy
              ? `familiesToBim: physical product '${el.keyPath}' needs a Bridge Part ancestor`
              : `familiesToBim: '${el.keyPath}' has no Storey ancestor — IFC elements need spatial containment; a container family needs archetype: 'storey' to be recognised under any name`
          )
        );
      }
      const added = addProxyElement(model, el, options.proxyEvaluator, state.spatialFrame);
      if (!added.ok) return added;
      model.placeIn(added.value, nextSpatialStructureId);
      idByKeyPath.set(el.keyPath, added.value);
      proxied.push({ keyPath: el.keyPath, type: el.type, archetype: el.archetype });
      proxiedHere = true;
    }
    for (const child of el.children) {
      // A wall's openings were mapped by addOpenings; a proxy's are baked
      // into its authoritative tessellated body — neither wants the
      // outside-wall rejection on the synthesized Opening child.
      if ((effectiveArchetype === 'wall' || proxiedHere) && child.type === 'Opening') continue;
      const r = walk(child, {
        spatialStructureId: nextSpatialStructureId,
        civilParent: nextCivilParent,
        rotated: nextRotated,
        cumulativeTranslation: cumulativeTranslationHere,
        projectedSpatialTranslation: nextProjectedSpatialTranslation,
        cumulativeFrame: nextCumulativeFrame,
        spatialFrame: nextSpatialFrame,
      });
      if (!r.ok) return r;
    }
    return ok(undefined);
  };

  const walked = walk(root, {
    spatialStructureId: usesAuthoredCivilHierarchy ? projectId : null,
    civilParent: 'project',
    rotated: false,
    cumulativeTranslation: ZERO_TRANSLATION,
    projectedSpatialTranslation: ZERO_TRANSLATION,
    cumulativeFrame: IDENTITY_FRAME,
    spatialFrame: IDENTITY_FRAME,
  });
  if (!walked.ok) {
    model[Symbol.dispose]();
    return walked;
  }
  return ok({ model, idByKeyPath, proxied });
}
