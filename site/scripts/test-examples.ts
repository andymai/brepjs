/**
 * Test all playground examples against the actual brepjs API.
 * Run with: npx tsx scripts/test-examples.ts
 */
const opencascade = (await import('brepjs-opencascade')).default;
const oc = await opencascade();

const brepjs = await import('brepjs');
brepjs.setOC(oc);

// Inject all brepjs exports onto globalThis (same as worker does)
const globalAny = globalThis as Record<string, unknown>;
for (const [key, value] of Object.entries(brepjs)) {
  if (key === 'default') continue;
  globalAny[key] = value;
}

// Import examples
const { examples } = await import('../src/lib/examples.js');

for (const ex of examples) {
  process.stdout.write(`Testing "${ex.title}" (${ex.id})... `);
  try {
    const fn = new Function(ex.code);
    const result = fn();

    if (result == null) {
      console.log('WARN: returned null/undefined');
      continue;
    }

    // Try to mesh it (same as worker)
    const fnShape =
      result && typeof result === 'object' && 'wrapped' in result
        ? brepjs.castShape(result.wrapped)
        : result;

    const shapeMesh = brepjs.meshShape(fnShape, { tolerance: 0.1, angularTolerance: 0.5 });
    const edgeMesh = brepjs.meshShapeEdges(fnShape, { tolerance: 0.1, angularTolerance: 0.5 });
    const bufData = brepjs.toBufferGeometryData(shapeMesh);
    const lineData = brepjs.toLineGeometryData(edgeMesh);

    console.log(
      `OK (${bufData.position.length / 3} verts, ${bufData.index.length / 3} tris, ${lineData.position.length / 3} edge pts)`
    );
  } catch (e) {
    console.log(`FAIL: ${e instanceof Error ? e.message : String(e)}`);
  }
}

process.exit(0);
