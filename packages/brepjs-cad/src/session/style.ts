import type { ElementLayer, ElementStyle } from 'brepjs-viewer';
import { globMatcher } from './query.js';
import type { ElementRecord } from './records.js';
import type { RenderSection } from './render.js';

export const COLOR_BY = ['category', 'storey', 'family'] as const;
export type ColorBy = (typeof COLOR_BY)[number];

export const HIGHLIGHT_COLOR = '#ff6b00';
// Tableau 10 without its orange, which would read as the highlight.
const PALETTE = [
  '#4e79a7',
  '#e15759',
  '#76b7b2',
  '#59a14f',
  '#edc948',
  '#b07aa1',
  '#ff9da7',
  '#9c755f',
] as const;
const OTHER_COLOR = '#8c8c8c';
const DEFAULT_CUT_HEIGHT_MM = 1200;

export interface StyleRequest {
  readonly highlight?: readonly string[] | undefined;
  readonly isolate?: readonly string[] | undefined;
  readonly colorBy?: ColorBy | undefined;
  /** Restricts what is drawn before `isolate` applies, as a storey plan does. */
  readonly scope?: ReadonlySet<string> | undefined;
}

export interface LegendEntry {
  readonly label: string;
  readonly color: string;
  readonly count: number;
}

export interface StylePlan {
  readonly style: ElementStyle | undefined;
  readonly drawn: number;
  readonly highlighted: number;
  readonly legend: readonly LegendEntry[];
  /** Requested ids or globs that matched nothing. */
  readonly unmatched: readonly string[];
}

/**
 * The geometry-bearing ids that a list of ids or globs selects. A selected container (an element
 * with no geometry of its own: a storey, a composed family) stands for everything under it. A
 * selected element with geometry stands for itself, so a wall does not pull in the windows it hosts.
 */
export function selectIds(
  records: readonly ElementRecord[],
  patterns: readonly string[]
): { ids: Set<string>; unmatched: string[] } {
  const byId = new Map(records.map((r) => [r.id, r]));
  const ids = new Set<string>();
  const expanded = new Set<string>();
  const unmatched: string[] = [];
  // `under` marks an element reached through a selected container: it brings its whole subtree.
  const take = (r: ElementRecord, under: boolean): void => {
    if (r.hasGeometry) ids.add(r.id);
    if ((r.hasGeometry && !under) || expanded.has(r.id)) return;
    expanded.add(r.id);
    for (const c of r.children) {
      const child = byId.get(c);
      if (child) take(child, true);
    }
  };
  for (const p of patterns) {
    let hits: ElementRecord[];
    if (/[*?]/.test(p)) {
      const test = globMatcher(p);
      hits = records.filter((r) => test(r.id));
    } else {
      const exact = byId.get(p);
      hits = exact ? [exact] : [];
    }
    if (hits.length === 0) unmatched.push(p);
    for (const r of hits) take(r, false);
  }
  return { ids, unmatched };
}

function groupLabel(r: ElementRecord, by: ColorBy): string {
  switch (by) {
    case 'category':
      return r.category;
    case 'family':
      return r.type;
    case 'storey':
      return r.storey ? (r.storey.name ?? r.storey.id) : '(no storey)';
  }
}

/** Groups by size, largest first; past the palette, the rest share one grey "other" layer. */
function colorGroups(
  records: readonly ElementRecord[],
  by: ColorBy
): { layers: ElementLayer[]; legend: LegendEntry[] } {
  const groups = new Map<string, string[]>();
  for (const r of records) {
    const label = groupLabel(r, by);
    groups.set(label, [...(groups.get(label) ?? []), r.id]);
  }
  const sorted = [...groups.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])
  );
  const named = sorted.length > PALETTE.length ? sorted.slice(0, PALETTE.length - 1) : sorted;
  const rest = sorted.slice(named.length).flatMap(([, ids]) => ids);
  const layers: ElementLayer[] = [];
  const legend: LegendEntry[] = [];
  named.forEach(([label, ids], i) => {
    const color = PALETTE[i] ?? OTHER_COLOR;
    layers.push({ keyPaths: ids, color, mode: 'solid' });
    legend.push({ label, color, count: ids.length });
  });
  if (rest.length > 0) {
    layers.push({ keyPaths: rest, color: OTHER_COLOR, mode: 'solid' });
    legend.push({
      label: `other (${sorted.length - named.length} groups)`,
      color: OTHER_COLOR,
      count: rest.length,
    });
  }
  return { layers, legend };
}

/**
 * Turn highlight / isolate / colorBy into viewer layers. Isolate (and a plan's scope) decide what
 * is drawn; highlight draws its elements solid and ghosts the rest of what is drawn; colorBy
 * colors the highlighted elements, or everything drawn when nothing is highlighted.
 */
export function planStyle(records: readonly ElementRecord[], req: StyleRequest): StylePlan {
  const geometry = records.filter((r) => r.renderable);
  const unmatched: string[] = [];
  let drawn = new Set(geometry.map((r) => r.id));
  if (req.scope) drawn = new Set([...drawn].filter((id) => req.scope?.has(id)));
  const limited = req.scope !== undefined || (req.isolate !== undefined && req.isolate.length > 0);
  if (req.isolate && req.isolate.length > 0) {
    const s = selectIds(records, req.isolate);
    unmatched.push(...s.unmatched);
    drawn = new Set([...drawn].filter((id) => s.ids.has(id)));
  }
  let focus: Set<string> | undefined;
  if (req.highlight && req.highlight.length > 0) {
    const s = selectIds(records, req.highlight);
    unmatched.push(...s.unmatched);
    focus = new Set([...s.ids].filter((id) => drawn.has(id)));
  }
  if (!limited && focus === undefined && req.colorBy === undefined) {
    return { style: undefined, drawn: drawn.size, highlighted: 0, legend: [], unmatched };
  }

  const colored = geometry.filter((r) => (focus ?? drawn).has(r.id));
  const layers: ElementLayer[] = [];
  let legend: LegendEntry[] = [];
  if (req.colorBy) {
    const groups = colorGroups(colored, req.colorBy);
    layers.push(...groups.layers);
    legend = groups.legend;
  } else if (focus) {
    layers.push({ keyPaths: [...focus], color: HIGHLIGHT_COLOR, mode: 'solid' });
    legend = [{ label: 'highlighted', color: HIGHLIGHT_COLOR, count: focus.size }];
  } else {
    layers.push({ keyPaths: colored.map((r) => r.id), mode: 'solid' });
  }
  if (focus) {
    layers.push({ keyPaths: [...drawn].filter((id) => !focus.has(id)), mode: 'ghost' });
  }
  return {
    style: { layers, others: limited ? 'hidden' : 'ghost' },
    drawn: drawn.size,
    highlighted: focus?.size ?? 0,
    legend,
    unmatched,
  };
}

export interface StoreyPlan {
  readonly storey: ElementRecord;
  readonly members: ReadonlySet<string>;
  readonly section: RenderSection;
}

/**
 * A storey plan: the storey's elements, cut `cutHeight` above its floor and seen from above. The
 * floor is the storey's declared elevation when it has one, else the lowest point of its elements.
 */
export function storeyPlan(
  records: readonly ElementRecord[],
  storey: string,
  cutHeight: number = DEFAULT_CUT_HEIGHT_MM
): StoreyPlan | undefined {
  const isStorey = (r: ElementRecord) => r.category.toLowerCase() === 'storey';
  const match =
    records.find((r) => r.id === storey && isStorey(r)) ??
    records.find((r) => isStorey(r) && r.name?.toLowerCase() === storey.toLowerCase());
  if (match === undefined) return undefined;
  const members = records.filter((r) => r.hasGeometry && r.storey?.id === match.id);
  const declared = match.props?.['elevationMm'] ?? match.props?.['elevation'];
  const lowest = Math.min(...members.flatMap((r) => (r.bounds ? [r.bounds.zMin] : [])));
  const floor = typeof declared === 'number' ? declared : Number.isFinite(lowest) ? lowest : 0;
  return {
    storey: match,
    members: new Set(members.map((r) => r.id)),
    section: { axis: 'z', at: floor + cutHeight, keep: 'below' },
  };
}
