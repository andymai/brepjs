const features = [
  {
    title: 'Exact geometry',
    description:
      'Boolean operations, fillets, chamfers, and shells on boundary representation solids. No mesh approximations.',
  },
  {
    title: 'Sketch to solid',
    description:
      'Draw 2D profiles, then extrude, revolve, loft, or sweep into solid parts.',
  },
  {
    title: 'Multi-format export',
    description:
      'STL, STEP, OBJ, glTF, and DXF. Tune mesh tolerance for file size vs. surface quality.',
  },
  {
    title: 'TypeScript-native',
    description:
      'Full type definitions and autocomplete. Catch errors at compile time, not after a failed print.',
  },
];

export default function FeaturesSection() {
  return (
    <section className="border-t border-border-subtle bg-surface-raised/50 py-12 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <h2 className="mb-2 text-center text-3xl font-bold text-white">
          Built on OpenCascade
        </h2>
        <p className="mb-12 text-center text-gray-400">
          The same geometry kernel behind FreeCAD, KiCad, and Fusion. brepjs wraps it in a
          TypeScript API designed for the browser.
        </p>
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
