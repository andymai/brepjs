# Gallery of Possibilities - Design Document

**Date:** 2026-02-07
**Status:** Approved
**Replaces:** Current ExamplesPreview component on landing page

## Overview

Replace the current boring click-to-view example cards with a rich interactive gallery featuring live 3D previews, auto-rotating shapes, and inline syntax-highlighted code. The gallery showcases 12-15 impressive examples that demonstrate brepjs capabilities through jaw-dropping designs.

## Goals

- **Immediate Impact**: Show what brepjs can do without requiring clicks
- **Educational**: Display code alongside rendered results
- **Performance**: Lazy-load viewers, precompile shapes, maintain smooth scrolling
- **Quality**: Replace basic examples (boxes, cylinders) with impressive demonstrations

## Architecture

### Component Hierarchy

```
ExamplesGallery (site/src/components/landing/ExamplesGallery.tsx)
├── GalleryCard (one per example)
│   ├── LiveViewer3D (lazy-loaded Three.js viewer with auto-rotate)
│   ├── CodeSnippet (syntax-highlighted code with copy button)
│   └── ExampleMeta (title, description, category badge)
```

### Performance Strategy

**Lazy Loading**

- Use `IntersectionObserver` via existing `useInView` hook
- Initialize Three.js renderers only when cards enter viewport
- Auto-rotation starts on mount, pauses when card leaves viewport
- Limit to 6 simultaneous active viewers

**Shape Precompilation**

- Pre-compile all WASM shapes on page load in shared worker
- Cache serialized meshes in `Map<exampleId, SerializedMesh>`
- When card intersects: check cache → deserialize → render immediately
- Avoids 15× redundant WASM compilation

**Additional Optimizations**

- Lazy load `shiki` bundle on first card intersection
- Use `content-visibility: auto` CSS for below-fold cards
- Debounce intersection callbacks (50ms)
- Share Three.js materials and lighting configuration

## Example Content

### New Example Set (12-15 pieces)

**Organic/Artistic Forms (3-4)**

1. **Parametric Vase** - Flowing curves using revolved bezier profile
2. **Abstract Sculpture** - Twisted extruded shape with boolean unions
3. **Spiral Shell** - Nautilus-style logarithmic spiral using sweep
4. **Wavy Bowl** - Revolved sine wave profile

**Architectural Elements (3-4)**

1. **Ionic Column** - Classical column with capital, flutes, and base
2. **Gothic Arch** - Pointed arch with ornamental cutouts
3. **Decorative Baluster** - Turned staircase baluster
4. **Corbel Bracket** - Architectural support bracket

**Practical Objects (3-4)**

1. **Threaded Bolt & Nut** - Parametric threading using helical sweep
2. **Storage Container with Lid** - Snap-fit lid mechanism
3. **Tool Handle** - Ergonomic grip with knurling pattern
4. **Carabiner Clip** - Functional hardware with spring gate

**Tabletop Gaming Miniatures (3-4)**

1. **Dice Tower** - Miniature tower with ramps and collection tray
2. **Terrain Hex Tile** - Modular hexagonal terrain piece
3. **Miniature Base with Steps** - Decorative display base
4. **Dungeon Wall Section** - Modular wall piece with torch sconces

Each example: 25-50 lines of code (impressive but readable).

## Technical Implementation

### LiveViewer3D Component

**Features**

- Square 1:1 aspect ratio canvas
- Auto-rotation at ~0.5 RPM (continuous Y-axis)
- Three-point lighting (key, fill, rim)
- Automatic camera positioning to fit shape bounds
- Click handler: navigate to `/playground#example/${id}`

**Lifecycle**

1. Card enters viewport → initialize renderer
2. Check precompiled cache → deserialize mesh
3. Start auto-rotation animation loop
4. Card leaves viewport → pause animation, keep mesh cached
5. Cleanup: unmount when > 6 active viewers

### CodeSnippet Component

**Features**

- Syntax highlighting via `shiki` (github-dark theme)
- TypeScript language mode
- Copy-to-clipboard button (top-right corner)
- Copy feedback: checkmark animation for 2s
- Max height ~250px, scrollable if taller
- JetBrains Mono or Fira Code font

**Implementation**

```typescript
import { codeToHtml } from 'shiki';

// Highlight code on mount
const html = await codeToHtml(code, {
  lang: 'typescript',
  theme: 'github-dark',
});
```

### Enhanced Example Interface

```typescript
export interface GalleryExample {
  id: string;
  title: string;
  description: string;
  category: 'organic' | 'architectural' | 'practical' | 'gaming';
  code: string;
  cameraPosition?: [number, number, number];
  cameraTarget?: [number, number, number];
  autoRotateSpeed?: number;
  featured?: boolean;
}
```

### Worker Integration

Extend `site/src/workers/brepjs.worker.ts`:

```typescript
// New message type
{ type: 'precompile-all', examples: GalleryExample[] }

// Worker compiles shapes in background on page load
// Sends back: { type: 'precompiled', id: string, mesh: SerializedMesh }
```

## Visual Design

### Card Styling

- Glass-morphism: `backdrop-blur-md bg-white/5`
- Border: `border border-white/10 hover:border-teal-light/30`
- Shadow: `shadow-lg hover:shadow-2xl` with teal glow
- Rounded: `rounded-xl` (12px)
- Padding: `p-6`
- Transition: `transition-all duration-300`

### Layout

- Responsive grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`
- Square viewer: `aspect-square bg-black/20 rounded-lg`
- Code section: `mt-4 bg-gray-900/50 rounded-lg p-4`
- Max width: `max-w-7xl mx-auto`

### Category Badges

Color-coded chips positioned top-left of cards:

- **Organic**: `bg-purple-500/20 text-purple-300`
- **Architectural**: `bg-blue-500/20 text-blue-300`
- **Practical**: `bg-green-500/20 text-green-300`
- **Gaming**: `bg-orange-500/20 text-orange-300`

### Section Header

- Title: "Gallery of Possibilities" (`text-4xl font-bold`)
- Subtext: "Jaw-dropping designs. Real code. Click any example to explore in the playground." (`text-lg text-gray-400`)

### Animations

- Cards fade up with staggered 75ms delay increments
- Auto-rotation: smooth continuous Y-axis rotation
- Copy button: checkmark scale animation on success
- Hover: lift effect with increased shadow

## Integration Points

1. **Replace ExamplesPreview** in `LandingPage.tsx`
2. **Update examples.ts** with new `galleryExamples` array
3. **Remove** old basic examples (simple-box, filleted-box, etc.)
4. **Keep** spiral staircase as impressive example
5. **Add analytics**: `gallery_example_view`, `gallery_example_click`, `gallery_code_copy`

## File Structure

```
site/src/
├── components/landing/
│   ├── ExamplesGallery.tsx          # Main gallery component
│   ├── GalleryCard.tsx              # Individual example card
│   ├── LiveViewer3D.tsx             # 3D preview with auto-rotate
│   └── CodeSnippet.tsx              # Syntax highlighted code
├── hooks/
│   └── useShapePrecompilation.ts    # Worker communication hook
└── lib/
    └── examples.ts                  # Updated with gallery examples
```

## State Management

```typescript
// In ExamplesGallery component
const [precompiled, setPrecompiled] = useState<Map<string, SerializedMesh>>(new Map());
const [visibleCards, setVisibleCards] = useState<Set<string>>(new Set());
const [loadedViewers, setLoadedViewers] = useState<Set<string>>(new Set());

// Cleanup: unmount viewers when > 6 active
useEffect(() => {
  if (loadedViewers.size > 6) {
    const oldest = Array.from(loadedViewers)[0];
    // Cleanup logic
  }
}, [visibleCards]);
```

## Success Criteria

- [ ] All 12-15 examples render correctly with auto-rotation
- [ ] Lazy loading works: only visible cards initialize viewers
- [ ] Code highlighting displays with working copy button
- [ ] Page load remains fast (< 3s to interactive)
- [ ] Smooth scrolling with no jank
- [ ] Click-through to playground works for all examples
- [ ] Mobile responsive (1 column, working 3D viewers)

## Future Enhancements

- Search/filter examples by category
- User-submitted example gallery
- Parametric controls (sliders to adjust example parameters)
- Share example link (copy URL with example ID)
- Download STL directly from gallery card
