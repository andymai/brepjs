import { box } from 'brepjs';
import { Box, resolve } from 'brepjs-families';

export default function part() {
  const el = resolve(<Box key="p" size={[10, 10, 10]} />);
  const size = el.props['size'] as readonly [number, number, number];
  return box(size[0], size[1], size[2]);
}
