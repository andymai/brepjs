import { useEffect, useState } from 'react';
import { codeToHtml } from 'shiki';

interface CodeSnippetProps {
  code: string;
  className?: string;
}

export default function CodeSnippet({ code, className = '' }: CodeSnippetProps) {
  const [html, setHtml] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;

    codeToHtml(code, {
      lang: 'typescript',
      theme: 'github-dark',
    }).then((result) => {
      if (mounted) {
        setHtml(result);
      }
    });

    return () => {
      mounted = false;
    };
  }, [code]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  if (!html) {
    return (
      <div className={`relative rounded-lg bg-gray-900/50 p-4 ${className}`}>
        <div className="animate-pulse">
          <div className="mb-2 h-4 w-3/4 rounded bg-gray-800" />
          <div className="mb-2 h-4 w-full rounded bg-gray-800" />
          <div className="h-4 w-2/3 rounded bg-gray-800" />
        </div>
      </div>
    );
  }

  return (
    <div className={`group relative rounded-lg bg-gray-900/50 ${className}`}>
      {/* Copy button */}
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 z-10 rounded bg-gray-800/80 p-2 opacity-0 transition-all hover:bg-gray-700 group-hover:opacity-100"
        aria-label="Copy code"
      >
        {copied ? (
          <svg
            className="h-4 w-4 text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg
            className="h-4 w-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        )}
      </button>

      {/* Code block with custom scrollbar */}
      <div
        className="code-snippet max-h-[250px] overflow-auto p-4 text-sm [&::-webkit-scrollbar-thumb:hover]:bg-teal-light/50 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-teal-light/30 [&::-webkit-scrollbar-track]:rounded [&::-webkit-scrollbar-track]:bg-black/20 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2"
        style={{
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
