import { Link } from 'react-router-dom';
import CodeDisplay from './CodeDisplay';
import HeroViewer from './HeroViewer';

export default function HeroSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-20">
      <div className="mb-12 text-center">
        <h1 className="mb-4 text-5xl font-bold tracking-tight text-white lg:text-6xl">
          Parametric CAD
          <br />
          <span className="text-indigo-primary">in TypeScript</span>
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-gray-400">
          brepjs is a TypeScript CAD kernel built on OpenCascade. Boolean
          operations, fillets, chamfers, sweeps — exact B-rep geometry that
          exports to STL, STEP, glTF, and DXF.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            to="/playground"
            className="rounded-lg bg-indigo-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-dark"
          >
            Try the Playground
          </Link>
          <a
            href="https://github.com/andymai/brepjs"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-border-subtle px-6 py-2.5 text-sm font-semibold text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
          >
            View on GitHub
          </a>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="order-2 min-w-0 lg:order-1">
          <CodeDisplay />
        </div>
        <div className="order-1 min-w-0 h-[400px] sm:h-[560px] lg:order-2 lg:h-auto">
          <HeroViewer />
        </div>
      </div>
    </section>
  );
}
