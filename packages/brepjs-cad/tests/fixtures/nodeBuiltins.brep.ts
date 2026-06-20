import { readFile } from 'node:fs/promises';
import { box } from 'brepjs';

// A real part may need Node built-ins — e.g. reading a font or a STEP file from disk. `--check`
// must type-check such a part rather than failing on the `node:` import. (Not executed by the
// typecheck test; the path need not exist.)
export default async () => {
  await readFile('/tmp/does-not-exist');
  return box(1, 1, 1);
};
