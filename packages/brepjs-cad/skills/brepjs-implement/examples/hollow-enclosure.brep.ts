import { box, edgeFinder, faceFinder, fillet, shell, unwrap } from 'brepjs';

const WIDTH = 80; // X (mm)
const DEPTH = 50; // Y (mm)
const HEIGHT = 30; // Z (mm)
const WALL = 2; // shell wall thickness (mm)
const EDGE_RADIUS = 4; // outer vertical-edge fillet (mm)

export default () => {
  const body = box(WIDTH, DEPTH, HEIGHT, { centered: true });

  const verticalEdges = edgeFinder().inDirection('Z').findAll(body);
  const rounded = unwrap(fillet(body, verticalEdges, EDGE_RADIUS));

  const topFaces = faceFinder().inDirection('Z').findAll(rounded);
  return unwrap(shell(rounded, topFaces, WALL));
};
