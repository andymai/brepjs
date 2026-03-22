/**
 * Namespace: primitives — solid and curve constructors
 */
export {
  box,
  cylinder,
  sphere,
  cone,
  torus,
  ellipsoid,
  line,
  circle,
  ellipse,
  helix,
  threePointArc,
  ellipseArc,
  bsplineApprox,
  bezier,
  tangentArc,
  wire,
  wireLoop,
  face,
  filledFace,
  subFace,
  polygon,
  vertex,
  compound,
  solid,
  offsetFace,
  sewShells,
  addHoles,
} from '@/topology/primitiveFns.js';

export { fill } from '@/topology/surfaceBuilders.js';

export { polyhedron } from '@/topology/polyhedronFns.js';
