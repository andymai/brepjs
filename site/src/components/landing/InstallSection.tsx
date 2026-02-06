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
    <section className="border-t border-border-subtle py-12 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
        <h2 className="mb-8 text-3xl font-bold text-white">Get started</h2>

        <div className="mx-auto max-w-lg">
          <button
            onClick={handleCopy}
            className="flex w-full items-center justify-between rounded-xl border border-border-subtle bg-surface p-4 text-left font-mono text-sm text-gray-300 transition-colors hover:border-indigo-primary/50"
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

        <pre className="scrollbar-thin mt-6 max-w-full overflow-x-auto rounded-xl border border-border-subtle bg-surface p-4 text-left text-sm leading-relaxed text-gray-300">
          <code>{`import opencascade from 'brepjs-opencascade';
import { setOC, makeBox, castShape } from 'brepjs';

const oc = await opencascade();
setOC(oc);

const box = castShape(makeBox([0, 0, 0], [10, 10, 10]).wrapped);`}</code>
        </pre>

      </div>
    </section>
  );
}
