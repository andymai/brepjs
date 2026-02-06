const features = [
  {
    title: 'Precise CAD Modeling',
    description:
      'Built on OpenCascade, the same kernel used in FreeCAD and Fusion. Boolean operations, fillets, chamfers — all exact geometry, not mesh approximations.',
  },
  {
    title: '2D Sketches to 3D Solids',
    description:
      'Draw 2D profiles with the sketching API, then extrude, revolve, loft, or sweep into solid parts. The same workflow used by professional CAD tools.',
  },
  {
    title: 'Export STL for Printing',
    description:
      'Export watertight STL meshes directly from your code. Tune mesh tolerance for file size vs. surface quality. Supports STEP, OBJ, and glTF too.',
  },
  {
    title: 'TypeScript-First',
    description:
      'Full type definitions, autocomplete, and compile-time checks. Catch dimension errors before they waste filament. Works with any editor or CI pipeline.',
  },
];

export default function FeaturesSection() {
  return (
    <section className="border-t border-border-subtle bg-surface-raised/50 py-20">
      <div className="mx-auto max-w-7xl px-6">
        <h2 className="mb-12 text-center text-3xl font-bold text-white">
          Why brepjs?
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-border-subtle bg-surface p-6"
            >
              <h3 className="mb-2 text-lg font-semibold text-white">{f.title}</h3>
              <p className="text-sm leading-relaxed text-gray-400">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
