import { box } from 'brepjs';
import { Group, resolve } from 'brepjs-families';
import { Panel } from './panel.js';

export default function part() {
  const model = resolve(
    <Group key="assembly">
      <Panel />
    </Group>
  );
  const panel = model.children[0];
  if (!panel) throw new Error('resolve produced no children');
  const size = panel.props['size'] as readonly [number, number, number];
  return box(size[0], size[1], size[2]);
}
