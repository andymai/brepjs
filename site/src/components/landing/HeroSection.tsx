import { Link } from 'react-router-dom';
import CodeDisplay from './CodeDisplay';
import HeroViewer from './HeroViewer';
import MagneticButton from '../shared/MagneticButton';
import { useGitHubStars } from '../../hooks/useGitHubStars';

const blobs = [
  { color: '#4ACECC', size: 700, left: '-10%', top: '-20%', duration: '20s', delay: '-7s' },
  { color: '#03B0AD', size: 600, right: '-5%', top: '10%', duration: '25s', delay: '-12s' },
  { color: '#7ADBDD', size: 550, left: '30%', bottom: '-10%', duration: '30s', delay: '-18s' },
  { color: '#0C8698', size: 450, right: '20%', bottom: '20%', duration: '22s', delay: '-5s' },
  { color: '#07606F', size: 500, left: '60%', top: '-10%', duration: '28s', delay: '-15s' },
] as const;

function formatCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n);
}

export default function HeroSection() {
  const stars = useGitHubStars('andymai/brepjs');

  return (
    <section className="relative overflow-hidden">
      {/* Mesh gradient background — bold & vivid */}
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
              animationDuration: b.duration,
              animationDelay: b.delay,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-20">
        <div className="mb-12 text-center">
          <h1
            className="animate-hero-fade-up mb-4 text-5xl font-bold tracking-tight text-white lg:text-6xl"
            style={{ opacity: 0 }}
          >
            Parametric CAD
            <br />
            <span className="text-gradient-teal text-glow-teal">in TypeScript</span>
          </h1>
          <p
            className="animate-hero-fade-up mx-auto max-w-2xl text-lg text-gray-400"
            style={{ opacity: 0, animationDelay: '75ms' }}
          >
            Booleans, fillets, sweeps, and NURBS — powered by OpenCascade, compiled to
            WebAssembly, typed end-to-end.
          </p>
          <div
            className="animate-hero-fade-up mt-8 flex flex-wrap items-center justify-center gap-4"
            style={{ opacity: 0, animationDelay: '150ms' }}
          >
            <MagneticButton>
              <Link
                to="/playground"
                className="btn-conic inline-block px-6 py-2.5 text-sm font-semibold text-gray-950"
              >
                Try the Playground
              </Link>
            </MagneticButton>
            <MagneticButton>
              <a
                href="https://github.com/andymai/brepjs"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-border-subtle px-6 py-2.5 text-sm font-semibold text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
              >
                View on GitHub
                {stars !== null && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-teal-light"
                    aria-label={`${formatCount(stars)} stars on GitHub`}
                  >
                    <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25z" />
                    </svg>
                    {formatCount(stars)}
                  </span>
                )}
              </a>
            </MagneticButton>
          </div>
        </div>

        <div
          className="animate-hero-fade-up grid gap-6 lg:grid-cols-2"
          style={{ opacity: 0, animationDelay: '225ms' }}
        >
          <div className="order-2 min-w-0 lg:order-1">
            <CodeDisplay />
          </div>
          <div className="order-1 min-w-0 h-[300px] sm:h-[560px] lg:order-2 lg:h-auto">
            <HeroViewer />
          </div>
        </div>
      </div>
    </section>
  );
}
