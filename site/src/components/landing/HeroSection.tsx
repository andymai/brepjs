import { Link } from 'react-router-dom';
import CodeDisplay from './CodeDisplay';
import HeroViewer from './HeroViewer';

export default function HeroSection() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-20">
      <div className="mb-12 text-center">
        <h1 className="mb-4 text-5xl font-bold tracking-tight text-white lg:text-6xl">
          Design for 3D printing
          <br />
          <span className="text-indigo-primary">with TypeScript</span>
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-gray-400">
          Precise CAD modeling in the browser. Write code, see live 3D results,
          export STL files ready for your printer.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
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
        <CodeDisplay />
        <div className="h-[400px] lg:h-auto">
          <HeroViewer />
        </div>
      </div>
    </section>
  );
}
