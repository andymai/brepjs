import { mkdirSync, writeFileSync } from 'node:fs';
import { init, unwrap } from 'brepjs';
import { resolve } from 'brepjs-families';
import { familiesToBim, toIfc } from 'brepjs-bim';
import model from '../src/main.tsx';

await init();
const tree = resolve(model);
const projected = unwrap(
  familiesToBim(tree, { project: { name: 'brepjs-app', projectId: 'brepjs-app' } })
);
using bim = projected.model;
const bytes = unwrap(await toIfc(bim, { applicationName: 'brepjs-app', applicationVersion: '0' }));
mkdirSync('dist', { recursive: true });
writeFileSync('dist/model.ifc', Buffer.from(bytes));
console.log(`wrote dist/model.ifc (${projected.idByKeyPath.size} elements)`);
if (projected.proxied.length > 0) {
  console.warn(`proxied (no typed IFC route): ${projected.proxied.map((p) => p.keyPath).join(', ')}`);
}
