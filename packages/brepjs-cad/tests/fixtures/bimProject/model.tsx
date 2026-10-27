import { Room } from './families/room.js';
import { Slab } from './families/slab.js';
import { Storey } from './families/storey.js';
import { Wall } from './families/wall.js';
import { Window } from './families/window.js';

export default (
  <Storey
    key="ground"
    name="Ground floor"
    items={[
      <Slab key="slab" length={9000} width={4000} thickness={200} at={[0, 0, -200]} />,
      <Room key="lobby" width={5000} depth={4000} height={2700} doorAlong={2000} />,
      <Wall
        key="annex"
        length={4000}
        height={2700}
        thickness={200}
        at={[5000, 0, 0]}
        fireRating="REI60"
        psets={{ Pset_WallCommon: { IsExternal: true, FireRating: 'REI60' } }}
        voids={[<Window key="w1" width={1200} height={1200} at={[1400, 900]} />]}
      />,
    ]}
  />
);
