import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useInView } from '../../hooks/useInView';
import { highlightLine, lineHasBrepjsFn } from '../../lib/syntaxHighlight';

const codeSnippet = `import opencascade from 'brepjs-opencascade';
import { initFromOC, box, fillet, unwrap } from 'brepjs';

const oc = await opencascade();
initFromOC(oc);

const b = box(10, 10, 10);
const filleted = unwrap(fillet(b, undefined, 1));`;

export default function InstallSection() {
  const [copied, setCopied] = useState(false);
  const cmd = 'npm install brepjs brepjs-opencascade';
  const [ref, inView] = useInView();

  const handleCopy = () => {
    void navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    });
  };

  const codeLines = codeSnippet.split('\n');

  return (
    <section id="get-started" ref={ref} className="py-12 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
        <h2
          className={`mb-8 text-3xl font-bold text-white ${inView ? 'animate-reveal-up' : ''}`}
          style={{ opacity: inView ? undefined : 0 }}
        >
          Up and running in 7 lines
        </h2>

        <div
          className={`mx-auto max-w-lg ${inView ? 'animate-reveal-up' : ''}`}
          style={{ opacity: inView ? undefined : 0, animationDelay: '25ms' }}
        >
          <button
            onClick={handleCopy}
            aria-label="Copy install command to clipboard"
            className="glass-card flex w-full items-center justify-between rounded-xl p-4 text-left font-mono text-sm text-gray-300 transition-colors hover:border-teal-primary/30"
          >
            <span className="min-w-0 truncate">
              <span className="text-gray-500">$ </span>
              {cmd}
            </span>
            <span className="ml-4 shrink-0 text-xs text-gray-500">
              {copied ? 'Copied!' : 'Click to copy'}
            </span>
          </button>
        </div>

        <p
          className={`mt-4 text-sm text-gray-400 ${inView ? 'animate-reveal-up' : ''}`}
          style={{ opacity: inView ? undefined : 0, animationDelay: '100ms' }}
        >
          brepjs wraps OpenCascade&apos;s WASM build. Initialize once, then use the full modeling
          API.
        </p>

        <div
          className={`mt-6 ${inView ? 'animate-reveal-up' : ''}`}
          style={{ opacity: inView ? undefined : 0, animationDelay: '150ms' }}
        >
          <div className="code-frame">
            <div className="glass-card !border-0 overflow-hidden">
              <div className="flex items-center gap-1.5 border-b border-white/5 px-4 py-2.5">
                <span className="text-xs text-gray-500">index.ts</span>
              </div>
              <pre className="scrollbar-thin overflow-x-auto p-4 text-left text-sm leading-relaxed">
                <code>
                  {codeLines.map((line, i) => (
                    <div
                      key={i}
                      className={`flex ${lineHasBrepjsFn(line) ? 'syntax-line-highlight' : ''}`}
                    >
                      <span className="mr-4 inline-block w-6 select-none text-right text-gray-600">
                        {i + 1}
                      </span>
                      <span className="text-gray-300">{highlightLine(line)}</span>
                    </div>
                  ))}
                </code>
              </pre>
            </div>
          </div>
        </div>

        <div
          className={`mt-6 flex flex-wrap items-center justify-center gap-4 text-sm ${inView ? 'animate-reveal-up' : ''}`}
          style={{ opacity: inView ? undefined : 0, animationDelay: '200ms' }}
        >
          <a
            href="https://andymai.github.io/brepjs/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal-light transition-colors hover:text-white"
          >
            API Reference &rarr;
          </a>
          <Link to="/playground" className="text-teal-light transition-colors hover:text-white">
            Open Playground &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}
