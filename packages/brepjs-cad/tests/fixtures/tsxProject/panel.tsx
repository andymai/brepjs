import { Box, type Element } from 'brepjs-families';
import { panelSize } from './dims.js';

export function Panel(): Element {
  return <Box key="panel" size={panelSize} />;
}
