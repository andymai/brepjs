import { Link, useLocation } from 'react-router-dom';

export default function Header() {
  const location = useLocation();
  const isPlayground = location.pathname === '/playground';

  return (
    <header className="flex h-14 items-center justify-between border-b border-border-subtle bg-surface px-6">
      <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-indigo-primary text-sm font-bold text-white">
          b
        </span>
        <span className="text-white">brepjs</span>
      </Link>

      <nav className="flex items-center gap-4">
        {!isPlayground && (
          <Link
            to="/playground"
            className="rounded-lg bg-indigo-primary px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-dark"
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
