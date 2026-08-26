/**
 * Your model. `export default` the element tree — the tools own evaluation:
 *
 *   npm run preview        live viewer (add -- --watch for re-render on save)
 *   npm start              print per-element mesh stats
 *   npm run export:ifc     write dist/model.ifc
 *   npm test               resolve + mesh every element
 *
 * Units are mm. Copy in richer starter families with `npx brepjs add room
 * storey slab` — they land in src/families/ as code you own.
 */
import { family, el, tTranslate } from 'brepjs-families';

const Doorway = family<{ readonly width: number; readonly height: number; readonly at: number }>(
  'Doorway',
  (p) =>
    el('Box', {
      size: [p.width, 300, p.height],
      transform: [tTranslate([p.at, 0, 0])],
    }),
  // fill role: placed in a host's voids, exported as a real IfcOpening + IfcDoor.
  { role: 'fill', archetype: 'door' }
);

const Wall = family<{
  readonly length: number;
  readonly height: number;
  readonly thickness: number;
  readonly voids?: readonly ReturnType<typeof Doorway>[];
}>('Wall', (p) => el('Box', { size: [p.length, p.thickness, p.height], voids: p.voids ?? [] }), {
  archetype: 'wall',
});

const Slab = family<{
  readonly length: number;
  readonly width: number;
  readonly thickness: number;
  readonly predefinedType: 'FLOOR' | 'ROOF' | 'LANDING' | 'BASESLAB';
}>('Slab', (p) => el('Box', { size: [p.length, p.width, p.thickness] }), { archetype: 'slab' });

const Storey = family<{ readonly children?: unknown }>(
  'Storey',
  (p) => el('Group', {}, p.children as never),
  { archetype: 'storey' }
);

export default (
  <Storey key="ground" name="Ground floor">
    <Slab
      key="slab"
      length={6000}
      width={4000}
      thickness={200}
      predefinedType="FLOOR"
      material="Concrete"
    />
    <Wall
      key="south"
      length={6000}
      height={2700}
      thickness={200}
      psets={{ Pset_WallCommon: { IsExternal: true, FireRating: 'REI120' } }}
      voids={[Doorway({ key: 'entry', width: 1000, height: 2100, at: 2500 })]}
    />
  </Storey>
);
