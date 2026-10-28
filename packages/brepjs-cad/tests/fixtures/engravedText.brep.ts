import { box, cut, sketchText, unwrap } from 'brepjs';

export default () => {
  using plate = box(40, 20, 3);
  using text = sketchText('Pi 5', { fontSize: 8, startX: 6, startY: 6 }, { plane: 'XY', origin: 2.4 }).extrude(1);
  return unwrap(cut(plate, text));
};
