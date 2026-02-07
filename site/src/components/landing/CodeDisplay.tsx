import { HERO_CODE } from '../../lib/constants';
import { highlightLine, lineHasBrepjsFn } from '../../lib/syntaxHighlight';

export default function CodeDisplay() {
  const lines = HERO_CODE.split('\n');

  return (
    <div className="code-frame">
      <div className="overflow-hidden glass-card !border-0">
        <div className="flex items-center gap-1.5 border-b border-white/5 px-4 py-2.5">
          <div className="h-3 w-3 rounded-full bg-red-500/40" />
          <div className="h-3 w-3 rounded-full bg-yellow-500/40" />
          <div className="h-3 w-3 rounded-full bg-green-500/40" />
          <span className="ml-3 text-xs text-gray-500">staircase.ts</span>
        </div>
        <pre className="scrollbar-thin max-h-[560px] overflow-auto p-4 text-sm leading-relaxed">
          <code>
            {lines.map((line, i) => (
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
  );
}
