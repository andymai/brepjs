import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Example } from '../../lib/examples.js';
import type { SerializedMesh } from './LiveViewer3D';
import LiveViewer3D from './LiveViewer3D';

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
  const cardRef = useRef<HTMLAnchorElement>(null);

  // Activate viewer when card is in view
  useEffect(() => {
    if (inView && !viewerActive) {
      setViewerActive(true);
    }
  }, [inView, viewerActive]);

  const categoryColor = CATEGORY_COLORS[example.category];

  return (
    <Link
      ref={cardRef}
      to={`/playground#example/${example.id}`}
      className={`group relative block overflow-hidden rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-md transition-all duration-300 hover:border-teal-light/30 hover:shadow-2xl hover:shadow-teal-light/10 hover:scale-[1.02] ${
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
      <div>
        <h3 className="mb-2 text-lg font-semibold text-white transition-colors group-hover:text-teal-light">
          {example.title}
        </h3>
        <p className="mb-3 text-sm text-gray-400">{example.description}</p>

        {/* Click to view hint */}
        <div className="flex items-center gap-2 text-xs text-teal-light opacity-0 transition-opacity group-hover:opacity-100">
          <span>Click to view code & edit</span>
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </Link>
  );
}
