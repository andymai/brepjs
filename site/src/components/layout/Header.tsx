import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Logo from '../shared/Logo';

export default function Header() {
  const location = useLocation();
  const isPlayground = location.pathname === '/playground';
  const isLanding = location.pathname === '/';
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!isLanding) return;
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isLanding]);

  const baseClasses = isLanding
    ? 'header-glass flex h-14 items-center justify-between px-6'
    : 'flex h-14 items-center justify-between border-b border-border-subtle bg-surface px-6';

  return (
    <header
      className={baseClasses}
      {...(isLanding ? { 'data-scrolled': scrolled ? 'true' : 'false' } : {})}
    >
      <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
        <Logo className="h-7 w-7" />
        <span className="text-white">brepjs</span>
      </Link>

      <nav className="flex items-center gap-4">
        {!isPlayground && (
          <Link
            to="/playground"
            className="rounded-lg bg-teal-primary px-4 py-1.5 text-sm font-medium text-gray-950 transition-colors hover:bg-teal-dark"
          >
            Open Playground
          </Link>
        )}
        <a
          href="https://github.com/andymai/brepjs"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-gray-400 transition-colors hover:text-white"
        >
          GitHub
        </a>
      </nav>
    </header>
  );
}
