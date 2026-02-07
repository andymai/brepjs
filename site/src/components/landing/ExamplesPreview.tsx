import { Link } from 'react-router-dom';
import { examples, featuredExampleIds } from '../../lib/examples';
import { useInView } from '../../hooks/useInView';

const featured = examples.filter((e) => featuredExampleIds.includes(e.id));

export { featured as featuredExamples };

export default function ExamplesPreview() {
  const [ref, inView] = useInView();

  if (featured.length === 0) return null;

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
          className={`mb-4 text-center text-3xl font-bold text-white ${inView ? 'animate-reveal-up' : ''}`}
          style={{ opacity: inView ? undefined : 0, animationDelay: '25ms' }}
        >
          Examples
        </h2>
        <p
          className={`mb-12 text-center text-gray-400 ${inView ? 'animate-reveal-up' : ''}`}
          style={{ opacity: inView ? undefined : 0, animationDelay: '50ms' }}
        >
          Click any example to open it in the playground
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((ex, i) => (
            <Link
              key={ex.id}
              to={`/playground#example/${ex.id}`}
              className={`glass-card-lift group rounded-xl p-5 ${inView ? 'animate-reveal-up' : ''}`}
              style={{
                opacity: inView ? undefined : 0,
                animationDelay: `${100 + i * 50}ms`,
              }}
            >
              <span className="mb-2 inline-block rounded-md bg-surface-overlay px-2 py-0.5 text-xs text-teal-light">
                {ex.category}
              </span>
              <h3 className="mb-1 text-base font-semibold text-white group-hover:text-teal-light">
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
