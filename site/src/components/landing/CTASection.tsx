import { Link } from 'react-router-dom';
import { useInView } from '../../hooks/useInView';
import MagneticButton from '../shared/MagneticButton';

const blobs = [
  { color: '#4ACECC', size: 600, left: '10%', top: '-30%', duration: '24s', delay: '-8s' },
  { color: '#03B0AD', size: 500, right: '5%', bottom: '-20%', duration: '28s', delay: '-14s' },
  { color: '#0C8698', size: 400, left: '50%', top: '10%', duration: '22s', delay: '-4s' },
] as const;

export default function CTASection() {
  const [ref, inView] = useInView();

  return (
    <section ref={ref} className="relative overflow-hidden py-20 sm:py-28">
      {/* Mesh gradient — vivid */}
      <div className="mesh-gradient">
        {blobs.map((b, i) => (
          <div
            key={i}
            className="mesh-gradient-blob"
            style={{
              width: b.size,
              height: b.size,
              background: b.color,
              left: 'left' in b ? b.left : undefined,
              right: 'right' in b ? b.right : undefined,
              top: 'top' in b ? b.top : undefined,
              bottom: 'bottom' in b ? b.bottom : undefined,
              opacity: 0.2,
              animationDuration: b.duration,
              animationDelay: b.delay,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 mx-auto max-w-3xl px-4 text-center sm:px-6">
        <div
          className={inView ? 'animate-reveal-up' : ''}
          style={{ opacity: inView ? undefined : 0 }}
        >
          <span className="section-accent-bar" />
        </div>
        <h2
          className={`mb-4 text-4xl font-bold text-white sm:text-5xl ${inView ? 'animate-reveal-up' : ''}`}
          style={{ opacity: inView ? undefined : 0, animationDelay: '25ms' }}
        >
          Ready to build?
        </h2>
        <p
          className={`mx-auto mb-10 max-w-xl text-lg text-gray-400 ${inView ? 'animate-reveal-up' : ''}`}
          style={{ opacity: inView ? undefined : 0, animationDelay: '50ms' }}
        >
          Start with the playground, browse the source, or install from npm.
        </p>
        <div
          className={`flex flex-wrap items-center justify-center gap-4 ${inView ? 'animate-reveal-up' : ''}`}
          style={{ opacity: inView ? undefined : 0, animationDelay: '100ms' }}
        >
          <MagneticButton>
            <Link
              to="/playground"
              className="btn-conic inline-block px-8 py-3 text-base font-semibold text-gray-950"
            >
              Open Playground
            </Link>
          </MagneticButton>
          <MagneticButton>
            <a
              href="https://github.com/andymai/brepjs"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-lg border border-border-subtle px-8 py-3 text-base font-semibold text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
            >
              GitHub
            </a>
          </MagneticButton>
          <MagneticButton>
            <a
              href="https://www.npmjs.com/package/brepjs"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-lg border border-border-subtle px-8 py-3 text-base font-semibold text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
            >
              npm
            </a>
          </MagneticButton>
        </div>
      </div>
    </section>
  );
}
