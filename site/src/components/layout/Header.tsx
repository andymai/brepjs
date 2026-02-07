import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Logo from '../shared/Logo';

export default function Header() {
  const location = useLocation();
  const isPlayground = location.pathname === '/playground';
  const isLanding = location.pathname === '/';
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!isLanding) return;
    const onScroll = () => {
      setScrolled(window.scrollY > 80);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, [isLanding]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const baseClasses = isLanding
    ? 'header-glass flex h-14 items-center justify-between px-6'
    : 'flex h-14 items-center justify-between border-b border-border-subtle bg-surface px-6';

  return (
    <header
      className={`relative ${baseClasses}`}
      {...(isLanding ? { 'data-scrolled': scrolled ? 'true' : 'false' } : {})}
    >
      <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
        <Logo className="h-7 w-7" />
        <span className="text-white">brepjs</span>
      </Link>

      {/* Desktop nav */}
      <nav className="hidden items-center gap-4 sm:flex" aria-label="Main">
        <a
          href="https://andymai.github.io/brepjs/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-gray-400 transition-colors hover:text-white"
        >
          Docs
        </a>
        <a
          href="https://github.com/andymai/brepjs"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-gray-400 transition-colors hover:text-white"
        >
          GitHub
        </a>
        {!isPlayground && (
          <Link
            to="/playground"
            className="rounded-lg bg-teal-primary px-4 py-1.5 text-sm font-medium text-gray-950 transition-colors hover:bg-teal-dark"
          >
            Playground
          </Link>
        )}
      </nav>

      {/* Mobile hamburger */}
      <button
        onClick={() => {
          setMobileOpen((v) => !v);
        }}
        className="flex items-center justify-center rounded p-1.5 text-gray-400 transition-colors hover:text-white sm:hidden"
        aria-expanded={mobileOpen}
        aria-label="Toggle navigation menu"
      >
        <svg
          className="h-5 w-5"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          {mobileOpen ? <path d="M4 4l12 12M16 4L4 16" /> : <path d="M3 5h14M3 10h14M3 15h14" />}
        </svg>
      </button>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="absolute left-0 right-0 top-14 z-50 border-b border-border-subtle bg-surface p-4 sm:hidden">
          <nav className="flex flex-col gap-3" aria-label="Main">
            <a
              href="https://andymai.github.io/brepjs/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-400 transition-colors hover:text-white"
            >
              Docs
            </a>
            <a
              href="https://github.com/andymai/brepjs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-400 transition-colors hover:text-white"
            >
              GitHub
            </a>
            {!isPlayground && (
              <Link
                to="/playground"
                className="inline-block rounded-lg bg-teal-primary px-4 py-1.5 text-center text-sm font-medium text-gray-950 transition-colors hover:bg-teal-dark"
              >
                Playground
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
