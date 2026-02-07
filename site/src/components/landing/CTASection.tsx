import { Link } from 'react-router-dom';
import { useInView } from '../../hooks/useInView';

export default function CTASection() {
  const [ref, inView] = useInView();

  return (
    <section ref={ref} className="relative overflow-hidden py-20 sm:py-28">
      <div className="relative z-10 mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2
          className={`mb-4 text-4xl font-bold text-white sm:text-5xl ${inView ? 'animate-reveal-up' : ''}`}
          style={{ opacity: inView ? undefined : 0 }}
        >
          Model your first part
        </h2>
        <p
          className={`mx-auto mb-10 max-w-xl text-lg text-gray-400 ${inView ? 'animate-reveal-up' : ''}`}
          style={{ opacity: inView ? undefined : 0, animationDelay: '25ms' }}
        >
          Exact B-rep geometry in the browser, no plugins, no downloads. Pick your starting point.
        </p>
        <div
          className={`flex flex-wrap items-center justify-center gap-4 ${inView ? 'animate-reveal-up' : ''}`}
          style={{ opacity: inView ? undefined : 0, animationDelay: '50ms' }}
        >
          <Link
            to="/playground"
            className="btn-conic inline-block px-8 py-3 text-base font-semibold text-gray-950 hover:scale-[1.02] transition-transform"
          >
            Open Playground
          </Link>
          <a
            href="https://github.com/andymai/brepjs"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View brepjs on GitHub (opens in new tab)"
            className="inline-block rounded-lg border border-border-subtle px-8 py-3 text-base font-semibold text-gray-300 transition-colors hover:border-gray-500 hover:text-white hover:scale-[1.02]"
          >
            View on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
