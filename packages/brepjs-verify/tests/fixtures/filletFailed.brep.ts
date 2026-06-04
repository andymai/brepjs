import { box, fuse, fillet, unwrap } from 'brepjs';

// Filleting EVERY edge (the no-edge-list form) at a radius the thin 5 mm plates cannot
// take makes the kernel fail. The part `unwrap()`s the Err, so it reaches runPart as a
// thrown Error with the BrepError code flattened into the message — the case where the
// hint table used to go dark.
export default () => {
  const vertical = box(60, 5, 40, { at: [0, -2.5, 20] });
  const foot = box(60, 30, 5, { at: [0, 15, 2.5] });
  const bracket = unwrap(fuse(vertical, foot));
  return unwrap(fillet(bracket, 5));
};
