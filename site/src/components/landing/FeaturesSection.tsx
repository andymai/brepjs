import { useInView } from '../../hooks/useInView';

type Feature = {
  title: string;
  description: string;
  icon: 'geometry' | 'typescript' | 'sketch' | 'wasm' | 'export' | 'functional';
  large?: boolean;
};

const features: Feature[] = [
  {
    title: 'Exact geometry',
    description:
      'Boolean operations, fillets, chamfers, and shells on boundary representation solids. No mesh approximations.',
    icon: 'geometry',
    large: true,
  },
  {
    title: 'TypeScript-native',
    description:
      'Full type definitions and autocomplete. Catch errors at compile time, not after a failed print.',
    icon: 'typescript',
    large: true,
  },
  {
    title: 'Sketch to solid',
    description:
      'Draw 2D profiles, then extrude, revolve, loft, or sweep into solid parts.',
    icon: 'sketch',
  },
  {
    title: 'Browser WASM',
    description:
      'Runs entirely in the browser via WebAssembly. No server, no install, no plugins.',
    icon: 'wasm',
  },
  {
    title: 'Multi-format export',
    description:
      'STL, STEP, OBJ, glTF, and DXF. Tune mesh tolerance for file size vs. surface quality.',
    icon: 'export',
  },
  {
    title: 'Functional API',
    description:
      'Pure functions with branded types. No class hierarchy — compose operations like building blocks.',
    icon: 'functional',
  },
];

function FeatureIcon({ name }: { name: Feature['icon'] }) {
  const cls = 'h-6 w-6 text-teal-primary';
  switch (name) {
    case 'geometry':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <path d="M3.27 6.96 12 12.01l8.73-5.05" />
          <path d="M12 22.08V12" />
        </svg>
      );
    case 'typescript':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
          <line x1="14" y1="4" x2="10" y2="20" />
        </svg>
      );
    case 'sketch':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19l7-7 3 3-7 7-3-3z" />
          <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
          <path d="M2 2l7.586 7.586" />
          <circle cx="11" cy="11" r="2" />
        </svg>
      );
    case 'wasm':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
    case 'export':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      );
    case 'functional':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          {/* f(x) drawn as paths for cross-browser consistency */}
          <path d="M7 20c0-6 2-9 4-9s2.5-1.5 2.5-4S12 4 10 4" />
          <path d="M5 11h6" />
          <path d="M15 8l3 4-3 4" />
          <path d="M21 8l-3 4 3 4" />
        </svg>
      );
  }
}

export default function FeaturesSection() {
  const [ref, inView] = useInView();

  return (
    <section ref={ref} className="py-12 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div
          className={inView ? 'animate-reveal-up' : ''}
          style={{ opacity: inView ? undefined : 0 }}
        >
          <span className="section-accent-bar" />
        </div>
        <h2
          className={`mb-2 text-center text-3xl font-bold text-white ${inView ? 'animate-reveal-up' : ''}`}
          style={{ opacity: inView ? undefined : 0, animationDelay: '25ms' }}
        >
          Built on OpenCascade
        </h2>
        <p
          className={`mb-12 text-center text-gray-400 ${inView ? 'animate-reveal-up' : ''}`}
          style={{ opacity: inView ? undefined : 0, animationDelay: '50ms' }}
        >
          The same geometry kernel behind FreeCAD and KiCad. brepjs wraps it in a
          TypeScript API designed for the browser.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <div
              key={f.title}
              className={`glass-card-lift rounded-xl p-6 ${f.large ? 'sm:col-span-2' : ''} ${inView ? 'animate-reveal-up' : ''}`}
              style={{
                opacity: inView ? undefined : 0,
                animationDelay: `${100 + i * 50}ms`,
              }}
            >
              <div className="icon-well mb-4">
                <FeatureIcon name={f.icon} />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-white">{f.title}</h3>
              <p className="text-sm leading-relaxed text-gray-400">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
