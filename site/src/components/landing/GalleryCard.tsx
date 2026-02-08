import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Example } from '../../lib/examples.js';
import type { SerializedMesh } from './LiveViewer3D';
import LiveViewer3D from './LiveViewer3D';
import CodeSnippet from './CodeSnippet';

interface GalleryCardProps {
  example: Example;
  precompiledMesh: SerializedMesh | null;
  index: number;
  inView: boolean;
}

const CATEGORY_COLORS = {
  organic: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  architectural: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  practical: 'bg-green-500/20 text-green-300 border-green-500/30',
  gaming: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
} as const;

export default function GalleryCard({
  example,
  precompiledMesh,
  index,
  inView,
}: GalleryCardProps) {
  const [viewerActive, setViewerActive] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Activate viewer when card is in view
  useEffect(() => {
    if (inView && !viewerActive) {
      setViewerActive(true);
    }
  }, [inView, viewerActive]);

  const categoryColor = CATEGORY_COLORS[example.category];

  return (
    <div
      ref={cardRef}
      className={`group relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-md transition-all duration-300 hover:border-teal-light/30 hover:shadow-2xl hover:shadow-teal-light/10 ${
        inView ? 'animate-reveal-up' : ''
      }`}
      style={{
        opacity: inView ? undefined : 0,
        animationDelay: `${100 + index * 75}ms`,
      }}
    >
      {/* Category badge */}
      <div className="absolute left-4 top-4 z-10">
        <span
          className={`inline-block rounded-full border px-3 py-1 text-xs font-medium ${categoryColor}`}
        >
          {example.category}
        </span>
      </div>

      {/* 3D Viewer */}
      <div className="mb-4">
        {viewerActive ? (
          <LiveViewer3D
            exampleId={example.id}
            mesh={precompiledMesh}
            loading={!precompiledMesh}
            cameraPosition={example.cameraPosition}
            cameraTarget={example.cameraTarget}
            autoRotateSpeed={example.autoRotateSpeed}
          />
        ) : (
          <div className="flex aspect-square items-center justify-center rounded-lg bg-black/20">
            <div className="text-gray-600">Loading...</div>
          </div>
        )}
      </div>

      {/* Example metadata */}
      <div className="mb-3">
        <Link
          to={`/playground#example/${example.id}`}
          className="group/title mb-1 block text-lg font-semibold text-white transition-colors hover:text-teal-light"
        >
          {example.title}
        </Link>
        <p className="text-sm text-gray-400">{example.description}</p>
      </div>

      {/* Code snippet */}
      <CodeSnippet code={example.code} />
    </div>
  );
}
