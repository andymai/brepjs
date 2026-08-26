import { init, csg } from 'brepjs';
import { resolve, evaluateModel } from 'brepjs-families';
import model from '../src/main.tsx';

await init();
const tree = resolve(model);
using evaluator = new csg.Evaluator();
const evaluated = evaluateModel(tree, evaluator);
for (const [keyPath, node] of evaluated.byKeyPath) {
  if (node.mesh.ok) {
    console.log(`${keyPath}: ${node.mesh.value.triangles.length / 3} triangles`);
  } else {
    console.error(`${keyPath}: ${node.mesh.error.message}`);
    process.exitCode = 1;
  }
}
