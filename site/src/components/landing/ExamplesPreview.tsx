import { Link } from 'react-router-dom';
import { examples, featuredExampleIds } from '../../lib/examples';

const featured = examples.filter((e) => featuredExampleIds.includes(e.id));

export default function ExamplesPreview() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-7xl px-6">
        <h2 className="mb-4 text-center text-3xl font-bold text-white">Examples</h2>
        <p className="mb-12 text-center text-gray-400">
          Click any example to open it in the playground
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((ex) => (
            <Link
              key={ex.id}
              to={`/playground#example/${ex.id}`}
              className="group rounded-xl border border-border-subtle bg-surface p-5 transition-colors hover:border-indigo-primary/50"
            >
              <span className="mb-2 inline-block rounded-md bg-surface-overlay px-2 py-0.5 text-xs text-indigo-light">
                {ex.category}
              </span>
              <h3 className="mb-1 text-base font-semibold text-white group-hover:text-indigo-light">
                {ex.title}
              </h3>
              <p className="text-sm text-gray-500">{ex.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
