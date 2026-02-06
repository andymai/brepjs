import { useState } from 'react';

export default function InstallSection() {
  const [copied, setCopied] = useState(false);
  const cmd = 'npm install brepjs brepjs-opencascade';

  const handleCopy = () => {
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <section className="border-t border-border-subtle py-20">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="mb-4 text-3xl font-bold text-white">Get Started</h2>
        <p className="mb-8 text-gray-400">
          Install brepjs and its OpenCascade kernel, then start modeling.
        </p>

        <div className="mx-auto max-w-lg">
          <button
            onClick={handleCopy}
            className="flex w-full items-center justify-between rounded-xl border border-border-subtle bg-surface p-4 text-left font-mono text-sm text-gray-300 transition-colors hover:border-indigo-primary/50"
          >
            <span>
              <span className="text-gray-500">$ </span>
              {cmd}
            </span>
            <span className="ml-4 shrink-0 text-xs text-gray-500">
              {copied ? 'Copied!' : 'Click to copy'}
            </span>
          </button>
        </div>

        <pre className="mt-6 overflow-x-auto rounded-xl border border-border-subtle bg-surface p-4 text-left text-sm leading-relaxed text-gray-300">
          <code>{`import opencascade from 'brepjs-opencascade';
import { setOC, makeBox, castShape } from 'brepjs';

const oc = await opencascade();
setOC(oc);

const box = castShape(makeBox([0,0,0], [10,10,10]).wrapped);`}</code>
        </pre>

        <div className="mt-8 flex items-center justify-center gap-4">
          <a
            href="https://github.com/andymai/brepjs"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-border-subtle px-6 py-2.5 text-sm font-semibold text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
          >
            GitHub Repository
          </a>
        </div>
      </div>
    </section>
  );
}
