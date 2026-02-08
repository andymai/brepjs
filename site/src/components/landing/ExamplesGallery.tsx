import { useEffect, useState, useRef } from 'react';
import { galleryExamples } from '../../lib/examples.js';
import { useInView } from '../../hooks/useInView';
import { useShapePrecompilation } from '../../hooks/useShapePrecompilation';
import GalleryCard from './GalleryCard';

/**
 * Track which cards are currently in viewport for lazy loading.
 */
function useCardVisibility() {
  const [visibleCards, setVisibleCards] = useState<Set<string>>(new Set());
  const observers = useRef<Map<string, IntersectionObserver>>(new Map());

  const registerCard = (id: string, element: HTMLElement) => {
    if (observers.current.has(id)) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisibleCards((prev) => {
          const next = new Set(prev);
          if (entry.isIntersecting) {
            next.add(id);
          } else {
            next.delete(id);
          }
          return next;
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(element);
    observers.current.set(id, observer);
  };

  useEffect(() => {
    return () => {
      observers.current.forEach((obs) => obs.disconnect());
      observers.current.clear();
    };
  }, []);

  return { visibleCards, registerCard };
}

export default function ExamplesGallery() {
  const [sectionRef, sectionInView] = useInView();
  const { meshes: precompiledMeshes, loading: shapesLoading } =
    useShapePrecompilation(galleryExamples);
  const { visibleCards, registerCard } = useCardVisibility();
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Register cards for visibility tracking when they mount
  useEffect(() => {
    cardRefs.current.forEach((element, id) => {
      registerCard(id, element);
    });
  }, [registerCard]);

  return (
    <section ref={sectionRef} className="py-12 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* Section header */}
        <h2
          className={`mb-4 text-center text-4xl font-bold text-white ${sectionInView ? 'animate-reveal-up' : ''}`}
          style={{ opacity: sectionInView ? undefined : 0, animationDelay: '25ms' }}
        >
          Gallery of Possibilities
        </h2>
        <p
          className={`mb-12 text-center text-lg text-gray-400 ${sectionInView ? 'animate-reveal-up' : ''}`}
          style={{ opacity: sectionInView ? undefined : 0, animationDelay: '50ms' }}
        >
          Jaw-dropping designs. Real code. Click any example to explore in the playground.
        </p>

        {/* Gallery grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {galleryExamples.map((example, index) => (
            <div
              key={example.id}
              ref={(el) => {
                if (el) cardRefs.current.set(example.id, el);
              }}
            >
              <GalleryCard
                example={example}
                precompiledMesh={precompiledMeshes.get(example.id) ?? null}
                index={index}
                inView={sectionInView && visibleCards.has(example.id)}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
