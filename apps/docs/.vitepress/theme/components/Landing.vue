<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import CodeCadHero from './CodeCadHero.vue';
import { highlightCode, highlightLine } from './codeHighlight';

// "Native to your stack" — the real Three.js mesh-adapter integration.
const stackSnippetHtml = highlightCode(
  `import { box, mesh, toBufferGeometryData } from 'brepjs/quick';
import * as THREE from 'three';

const data = toBufferGeometryData(mesh(box(30, 20, 10)));

const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
geo.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
geo.setIndex(new THREE.BufferAttribute(data.index, 1));`
);

// "Round-trips" — formats with their import/export support.
const FORMATS = [
  { name: 'STEP', io: 'in · out' },
  { name: 'IGES', io: 'in · out' },
  { name: 'STL', io: 'in · out' },
  { name: 'OBJ', io: 'in · out' },
  { name: '3MF', io: 'in · out' },
  { name: 'glTF / GLB', io: 'in · out' },
  { name: 'DXF', io: 'in · out' },
  { name: 'BREP', io: 'in · out' },
  { name: 'SVG', io: 'in · 2D' },
];

// Type-safety card: real code highlighted by the tokenizer, with the genuine
// tsc error (captured under --strict) as annotation lines.
const typeCardHtml = [
  highlightLine('const w = unwrap(wire([line(a, b), line(b, c), line(c, a)]));'),
  '',
  highlightLine('const f = filledFace(w);'),
  '<span class="er">                     ~</span>',
  `<span class="cm">// TS2345: Argument of type 'Wire' is not assignable</span>`,
  `<span class="cm">//   to parameter of type 'ClosedWire'. Property</span>`,
  `<span class="cm">//   '[__closed]' is missing in type 'Wire'.</span>`,
  '',
  `<span class="cm">// prove it closed first — now it compiles</span>`,
  highlightLine('const ok = filledFace(unwrap(closedWire(w)));') + ' <span class="ok">// ✓</span>',
].join('\n');

// Reveal-on-scroll, gated behind prefers-reduced-motion.
const root = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

onMounted(() => {
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const els = root.value?.querySelectorAll<HTMLElement>('[data-reveal]') ?? [];
  if (reduce || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-in'));
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          observer?.unobserve(e.target);
        }
      });
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.12 }
  );
  els.forEach((el) => observer?.observe(el));
});

onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div class="landing" ref="root">
    <a class="skip" href="#main">Skip to content</a>

    <!-- ───────────────────────── NAV ───────────────────────── -->
    <header class="lnav">
      <div class="lnav-in">
        <a class="brand" href="/" aria-label="brepjs home">
          <img src="/logo.svg" alt="" width="28" height="28" />
          <span>brepjs</span>
        </a>
        <nav class="lnav-links" aria-label="Primary">
          <a href="/introduction/why-brepjs">Guide</a>
          <a href="/agent/overview">Authoring with AI</a>
          <a href="https://andymai.github.io/brepjs/" target="_blank" rel="noopener">API</a>
          <a href="/playground" target="_blank" rel="noopener">Playground</a>
        </nav>
        <div class="lnav-right">
          <a
            class="ic"
            href="https://github.com/andymai/brepjs"
            target="_blank"
            rel="noopener"
            aria-label="GitHub"
            >GitHub</a
          >
          <a
            class="ic"
            href="https://www.npmjs.com/package/brepjs"
            target="_blank"
            rel="noopener"
            aria-label="npm"
            >npm</a
          >
          <a class="pill" href="/playground" target="_blank" rel="noopener">Open the Playground</a>
        </div>
      </div>
    </header>

    <main id="main">
      <!-- ───────────────────────── HERO ───────────────────────── -->
      <section class="hero">
        <div class="wrap hero-top">
          <h1>
            Exact CAD geometry,<br class="h1-break" /><span class="grad"
              >written in TypeScript.</span
            >
          </h1>
          <p class="subhead">
            A real B-Rep kernel in your browser via WASM. A type system that makes invalid geometry
            uncompilable. And a verification loop so AI agents author parts that are provably
            correct — not just plausible.
          </p>
          <div class="cta-row center">
            <a class="btn-primary" href="/playground" target="_blank" rel="noopener"
              >Open the Playground</a
            >
            <a class="btn-ghost" href="/getting-started/install">Get Started</a>
            <a class="text-link" href="/agent/overview">Authoring with AI →</a>
          </div>
        </div>

        <div class="wrap hero-demo">
          <ClientOnly>
            <CodeCadHero />
          </ClientOnly>
          <ul class="specstrip" aria-label="At a glance">
            <li><b>v18</b> · Apache-2.0</li>
            <li><b>OpenCascade</b> kernel</li>
            <li>STEP-accurate</li>
            <li>runs in the browser</li>
          </ul>
        </div>
      </section>

      <!-- ──────────────────── EXACT, NOT TRIANGLES ──────────────────── -->
      <section class="band" data-reveal>
        <div class="wrap narrow">
          <p class="eyebrow">B-Rep vs mesh</p>
          <h2>Exact boundaries, not triangle soup.</h2>
          <p class="lead">
            Shapes are real mathematical boundaries — faces, edges, and vertices — so booleans are
            precise, measurements are real numbers, and STEP exports drop cleanly into SolidWorks,
            Fusion, and FreeCAD. No tessellation error baked into your model.
          </p>
          <div class="compare">
            <figure class="compare-cell">
              <img
                class="mini"
                src="/images/landing/exact.png"
                alt="A turned part as an exact B-Rep solid — smooth curved face, clean edges"
                loading="lazy"
              />
              <figcaption><b>brepjs</b> — exact B-Rep, one smooth face</figcaption>
            </figure>
            <figure class="compare-cell">
              <img
                class="mini"
                src="/images/landing/faceted.png"
                alt="The same part as a coarse triangle mesh — a faceted polygon approximation"
                loading="lazy"
              />
              <figcaption>mesh CAD — faceted triangle approximation</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <!-- ──────────────────── IF IT COMPILES, IT'S VALID ──────────────────── -->
      <section class="band alt" data-reveal>
        <div class="wrap split">
          <div>
            <p class="eyebrow">Type safety</p>
            <h2>If it compiles, the geometry is valid.</h2>
            <p class="lead">
              Branded types, <code>Result&lt;T, E&gt;</code>, and phantom types encode topological
              invariants in the type system. A <code>ClosedWire</code>, an
              <code>OrientedFace</code>, a <code>ValidSolid</code> mean exactly what they say.
              Malformed geometry doesn't fail at runtime — it fails to compile.
            </p>
          </div>
          <div
            class="code-card"
            role="img"
            aria-label="TypeScript rejecting a plain Wire where a ClosedWire is required, with the real tsc error"
          >
            <div class="code-bar">
              <span class="dot3"><i></i><i></i><i></i></span> face.ts — tsc --strict
            </div>
            <pre class="code"><code v-html="typeCardHtml"></code></pre>
          </div>
        </div>
      </section>

      <!-- ──────────────────── CAD AN AGENT CAN PROVE (prominent) ──────────────────── -->
      <section class="band feature ai" data-reveal>
        <div class="wrap">
          <div class="sec-head">
            <p class="eyebrow">The verify loop</p>
            <h2>CAD an agent can prove.</h2>
            <p class="lead">
              The hard part of AI plus CAD isn't drawing a shape — it's knowing it's correct. brepjs
              answers twice: the type system rejects invalid geometry before it runs, and
              <code>brepjs-cad</code> runs the part on a real kernel and returns a deterministic
              report — validity, measured dimensions, multi-view snapshots, a STEP export. Ships as
              a Claude Code skill and a CLI.
            </p>
          </div>

          <div class="ai-grid">
            <div class="panel">
              <div class="code-bar">
                <span class="dot3"><i></i><i></i><i></i></span> agent · verify loop
              </div>
              <pre
                class="term"
              ><code><span class="p">$</span> <span class="c">/plugin install</span> brepjs@brepjs   <span class="cm"># the skill</span>
<span class="p">$</span> <span class="c">npm i -D</span> brepjs-cad             <span class="cm"># the runtime</span>

<span class="p">&gt;</span> <span class="c">/brepjs:cad</span> a 1×1 gridfinity bin
<span class="p">›</span> brainstorm → design → implement → verify
<span class="ok">✓ valid Solid</span> · vol 14 043.4 mm³ · 91 faces
<span class="ok">✓ assertions 3/3</span> · wrote bin.step</code></pre>
            </div>

            <div class="panel">
              <div class="code-bar">
                <span class="dot3"><i></i><i></i><i></i></span> report.json · deterministic
              </div>
              <div class="report">
                <p class="verdict"><span class="badge">ok: true</span> shape verified</p>
                <dl>
                  <div>
                    <dt>shapeType</dt>
                    <dd class="teal">"Solid"</dd>
                  </div>
                  <div>
                    <dt>checks.isValidSolid</dt>
                    <dd class="pass">passed ✓</dd>
                  </div>
                  <div>
                    <dt>measurements.volume</dt>
                    <dd>14043.4</dd>
                  </div>
                  <div>
                    <dt>measurements.area</dt>
                    <dd>11659.6</dd>
                  </div>
                  <div>
                    <dt>measurements.bounds</dt>
                    <dd>41.7 × 41.7 × 30.5</dd>
                  </div>
                  <div>
                    <dt>topology</dt>
                    <dd>91 f · 192 e · 104 v</dd>
                  </div>
                  <div>
                    <dt>topology.manifold</dt>
                    <dd class="pass">true</dd>
                  </div>
                  <div>
                    <dt>assertions.volume</dt>
                    <dd class="pass">14043.4 = 14043.4 ✓</dd>
                  </div>
                </dl>
                <div class="views">
                  <figure class="view">
                    <img
                      src="/images/landing/snap-iso.png"
                      alt="bin — isometric view"
                      loading="lazy"
                    />
                    <span>iso</span>
                  </figure>
                  <figure class="view">
                    <img
                      src="/images/landing/snap-front.png"
                      alt="bin — front view"
                      loading="lazy"
                    />
                    <span>front</span>
                  </figure>
                  <figure class="view">
                    <img src="/images/landing/snap-top.png" alt="bin — top view" loading="lazy" />
                    <span>top</span>
                  </figure>
                  <figure class="view">
                    <img
                      src="/images/landing/snap-right.png"
                      alt="bin — right view"
                      loading="lazy"
                    />
                    <span>right</span>
                  </figure>
                </div>
              </div>
            </div>
          </div>
          <p class="caption">Point your agent at a spec; get back a part you can manufacture.</p>
        </div>
      </section>

      <!-- ──────────────────── TWO KERNELS ──────────────────── -->
      <section class="band" data-reveal>
        <div class="wrap narrow">
          <p class="eyebrow">Engine-agnostic</p>
          <h2>Two kernels. One API. One line to switch.</h2>
          <p class="lead">
            occt-wasm — OpenCascade compiled to WebAssembly, about 4.7 MB brotli, Web Worker–ready —
            ships today as the default. brepkit, a Rust kernel built for speed (≈1 MB brotli), is a
            drop-in replacement under active development. Your code doesn't change.
          </p>
          <div class="kernels">
            <div class="kcard shipping">
              <span class="ktag">ships today</span>
              <h3>occt-wasm</h3>
              <p>OpenCascade · WebAssembly · ~4.7 MB brotli · Web Worker–ready</p>
            </div>
            <div class="kswitch" aria-hidden="true">
              <code>withKernel(id, …)</code>
            </div>
            <div class="kcard wip">
              <span class="ktag">in development</span>
              <h3>brepkit</h3>
              <p>Rust kernel · built for speed · ≈1 MB brotli · drop-in</p>
            </div>
          </div>
        </div>
      </section>

      <!-- ──────────────────── NATIVE TO YOUR STACK ──────────────────── -->
      <section class="band alt" data-reveal>
        <div class="wrap split">
          <div>
            <p class="eyebrow">Ecosystem</p>
            <h2>Native to the stack you already use.</h2>
            <p class="lead">
              ESM, top-level await init, a Three.js mesh adapter, structured errors, web-worker
              friendly. Drops into Vite, Next.js, and React Three Fiber. brepjs produces the
              geometry; you render it however you like.
            </p>
            <ul class="chips" aria-label="Ecosystem">
              <li>ESM</li>
              <li>top-level await</li>
              <li>Web Workers</li>
              <li>Vite</li>
              <li>Next.js</li>
              <li>R3F</li>
            </ul>
          </div>
          <div
            class="code-card"
            role="img"
            aria-label="Meshing a brepjs solid into a Three.js BufferGeometry"
          >
            <div class="code-bar">
              <span class="dot3"><i></i><i></i><i></i></span> scene.ts
            </div>
            <pre class="code"><code v-html="stackSnippetHtml"></code></pre>
          </div>
        </div>
      </section>

      <!-- ──────────────────── FORMATS ──────────────────── -->
      <section class="band" data-reveal>
        <div class="wrap split">
          <div>
            <p class="eyebrow">File formats</p>
            <h2>Round-trips with the tools you already own.</h2>
            <p class="lead">
              Import and export STEP, STL, IGES, glTF, DXF, 3MF, and OBJ, plus 2D DXF/SVG profiles
              and OCCT BREP. Move exact solids between brepjs, SolidWorks, Fusion, and FreeCAD over
              STEP without losing precision.
            </p>
          </div>
          <div class="fmt-card">
            <div class="fmt-flow" aria-hidden="true">
              <span class="fmt-node">brepjs</span>
              <span class="fmt-link">⇄ STEP ⇄</span>
              <span class="fmt-node">SolidWorks · Fusion · FreeCAD</span>
            </div>
            <ul class="fmt-grid" aria-label="Supported formats">
              <li v-for="f in FORMATS" :key="f.name">
                <b>{{ f.name }}</b
                ><span>{{ f.io }}</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <!-- ──────────────────── SCOPE ──────────────────── -->
      <section class="band" data-reveal>
        <div class="wrap narrow">
          <p class="eyebrow">Scope &amp; fit</p>
          <h2>Built for exact, manufacturable geometry.</h2>
          <p class="lead">
            Boundary representation is the language of mechanical CAD — exact solids to micron
            precision, and the native form of STEP, CNC, and inspection. That's brepjs's strength:
            precise booleans, fillets, chamfers, and shells; real volumes, areas, and clearances;
            watertight solids that move cleanly between SolidWorks, Fusion, and FreeCAD. From a
            single bracket to a full assembly — enclosures, fixtures, gridfinity bins, machined and
            molded parts. It's a programmatic library, not a GUI, and exact B-Rep isn't the tool for
            organic sculpting or dense lattices; knowing that is part of why it's dependable.
          </p>
        </div>
      </section>

      <!-- ──────────────────── PROVENANCE + CLOSING CTA ──────────────────── -->
      <section class="band provenance" data-reveal>
        <div class="wrap center">
          <p class="prov-line">
            Born from a tool people actually use — brepjs grew out of the
            <a href="https://gridfinitylayouttool.com" target="_blank" rel="noopener"
              >Gridfinity Layout Tool</a
            >.
          </p>
          <ul class="specrow" aria-label="Project facts">
            <li>v18</li>
            <li>Apache-2.0</li>
            <li>OpenCascade kernel</li>
            <li>STEP-accurate</li>
            <li>runs in the browser</li>
          </ul>
          <div class="closer">
            <h2>Write your first solid.</h2>
            <div class="cta-row center">
              <a class="btn-primary" href="/playground" target="_blank" rel="noopener"
                >Open the Playground</a
              >
              <a class="btn-ghost" href="/introduction/why-brepjs">Read the docs</a>
            </div>
            <p class="quiet">
              Authoring with AI?
              <a class="quiet-link" href="/agent/overview"
                >Set up the <code>brepjs-cad</code> skill →</a
              >
            </p>
          </div>
        </div>
      </section>
    </main>

    <!-- ───────────────────────── FOOTER ───────────────────────── -->
    <footer class="lfoot">
      <div class="wrap foot-grid">
        <div class="foot-brand">
          <a class="brand" href="/"
            ><img src="/logo.svg" alt="" width="26" height="26" /><span>brepjs</span></a
          >
          <p class="foot-egg">
            Exact, code-first CAD for TypeScript — real B-Rep solids, proven valid at compile time,
            and STEP that drops into the tools you already own.
          </p>
        </div>
        <nav class="foot-col" aria-label="Documentation">
          <h3>Docs</h3>
          <a href="/introduction/why-brepjs">Guide</a>
          <a href="/getting-started/install">Get Started</a>
          <a href="/agent/overview">Authoring with AI</a>
          <a href="https://andymai.github.io/brepjs/" target="_blank" rel="noopener"
            >API Reference</a
          >
        </nav>
        <nav class="foot-col" aria-label="Project">
          <h3>Project</h3>
          <a href="/playground" target="_blank" rel="noopener">Playground</a>
          <a href="https://github.com/andymai/brepjs" target="_blank" rel="noopener">GitHub</a>
          <a href="https://www.npmjs.com/package/brepjs" target="_blank" rel="noopener">npm</a>
          <a
            href="https://github.com/andymai/brepjs/blob/main/CHANGELOG.md"
            target="_blank"
            rel="noopener"
            >Changelog</a
          >
        </nav>
      </div>
      <div class="wrap foot-base">
        <span>Released under the Apache 2.0 License. © 2024–2026 Andy Aragon</span>
        <span class="mono">Exact CAD geometry, written in TypeScript.</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* Signifier @font-face declarations live in theme/custom.css — the docs pages
   now use them for headings too, so they belong in the global stylesheet. */

/* ============================================================
   DESIGN TOKENS — scoped to .landing so the docs theme is untouched
   ============================================================ */
.landing {
  --teal-50: #d0f2f2;
  --teal-100: #a8e8e8;
  --teal-200: #7adbdd;
  --teal-300: #4acecc;
  --teal-400: #03b0ad;
  --teal-500: #0c8698;
  --teal-600: #07606f;

  --bg-0: #080b0e;
  --bg-1: #0d1116;
  --bg-2: #131922;
  --bg-3: #1a212b;

  --ink-0: #f1f6f7;
  --ink-1: #aab6bd;
  --ink-2: #828d96;

  --line: #1c2530;
  --line-2: #283340;
  --pass: #46d09a;

  --grad-name: linear-gradient(118deg, #07606f 2%, #03b0ad 40%, #4acecc 76%, #7adbdd 100%);
  --grad-cta: linear-gradient(120deg, #03b0ad, #4acecc);

  --r-pill: 999px;
  --r-card: 16px;
  --r-ctl: 10px;
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
  --maxw: 1180px;

  --f-display: 'Signifier', Georgia, 'Times New Roman', serif;
  --f-body: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
  --f-mono: 'DM Mono', ui-monospace, 'SF Mono', Menlo, monospace;

  position: relative;
  min-height: 100vh;
  background: var(--bg-0);
  color: var(--ink-0);
  font-family: var(--f-body);
  font-size: 17px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  background-image:
    radial-gradient(120% 86% at 80% 4%, rgba(3, 176, 173, 0.15), transparent 58%),
    radial-gradient(80% 64% at 8% 100%, rgba(7, 96, 111, 0.16), transparent 54%),
    linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
  background-size:
    100% 100%,
    100% 100%,
    34px 34px,
    34px 34px;
  background-attachment: fixed, fixed, scroll, scroll;
}

.landing :where(a) {
  color: inherit;
  text-decoration: none;
}
.landing :where(h1, h2, h3, h4) {
  font-family: var(--f-display);
  font-weight: 500;
  letter-spacing: -0.005em;
  /* even the lines and keep a lone word off the last line */
  text-wrap: balance;
}
.wrap {
  max-width: var(--maxw);
  margin: 0 auto;
  padding: 0 28px;
}
.wrap.narrow {
  max-width: 920px;
}
.wrap.center {
  text-align: center;
}

.skip {
  position: absolute;
  left: -9999px;
  top: 0;
  z-index: 100;
  background: var(--teal-300);
  color: #04231f;
  padding: 10px 16px;
  border-radius: 0 0 8px 0;
  font-weight: 600;
}
.skip:focus {
  left: 0;
}

.eyebrow {
  font-family: var(--f-body);
  font-weight: 500;
  font-size: 0.95rem;
  letter-spacing: 0;
  color: var(--ink-1);
  display: inline-flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 16px;
}
.eyebrow::before {
  content: '';
  width: 26px;
  height: 1px;
  background: var(--teal-300);
  flex: none;
}
code {
  font-family: var(--f-mono);
  font-size: 0.86em;
  background: var(--bg-2);
  border: 1px solid var(--line);
  padding: 1px 6px;
  border-radius: 5px;
  color: var(--teal-200);
}
/* Block code (in <pre>) is not the inline-chip treatment: reset it so the
   syntax-colour spans render on a transparent background. */
pre code {
  font-size: inherit;
  background: none;
  border: 0;
  padding: 0;
  border-radius: 0;
  color: inherit;
}

/* ───────────── NAV ───────────── */
.lnav {
  position: sticky;
  top: 0;
  z-index: 30;
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
  background: rgba(8, 11, 14, 0.7);
  border-bottom: 1px solid var(--line);
}
.lnav-in {
  max-width: var(--maxw);
  margin: 0 auto;
  padding: 12px 28px;
  display: flex;
  align-items: center;
  gap: 28px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--f-display);
  font-weight: 500;
  font-size: 19px;
}
.lnav-links {
  display: flex;
  gap: 22px;
  font-size: 14.5px;
  color: var(--ink-1);
}
.lnav-links a:hover {
  color: var(--ink-0);
}
.lnav-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 18px;
}
.lnav-right .ic {
  color: var(--ink-2);
  font-size: 14.5px;
}
.lnav-right .ic:hover {
  color: var(--ink-0);
}
.pill {
  font-weight: 600;
  font-size: 14px;
  padding: 9px 16px;
  border-radius: var(--r-pill);
  background: var(--grad-cta);
  color: #04231f;
  transition:
    transform 0.12s var(--ease),
    box-shadow 0.12s var(--ease);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.25) inset,
    0 8px 22px -10px rgba(3, 176, 173, 0.8);
}
.pill:hover {
  transform: translateY(-1px);
}

/* ───────────── HERO ───────────── */
.hero {
  padding: 76px 0 64px;
}
.hero-top {
  max-width: 800px;
  margin: 0 auto;
  text-align: center;
}
.hero-demo {
  margin-top: 44px;
}
h1 {
  font-size: clamp(2.6rem, 7.4vw, 3.9rem);
  line-height: 1.06;
  letter-spacing: -0.005em;
  margin: 16px 0 0;
  text-wrap: balance;
}
h1 .grad {
  background: var(--grad-name);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  font-style: italic;
  font-weight: 400;
}
.subhead {
  font-size: 1.2rem;
  line-height: 1.5;
  color: var(--ink-1);
  max-width: 54ch;
  margin: 22px auto 0;
  text-wrap: balance;
}
.cta-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 30px 0 0;
  flex-wrap: wrap;
}
.cta-row.center {
  justify-content: center;
}
.btn-primary {
  font-weight: 600;
  font-size: 15px;
  padding: 12px 22px;
  border-radius: var(--r-pill);
  background: var(--grad-cta);
  color: #04231f;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.25) inset,
    0 10px 28px -12px rgba(3, 176, 173, 0.9);
  transition: transform 0.12s var(--ease);
}
.btn-primary:hover {
  transform: translateY(-1px);
}
.btn-ghost {
  font-weight: 600;
  font-size: 15px;
  padding: 11px 20px;
  border-radius: var(--r-ctl);
  border: 1px solid var(--line-2);
  transition:
    border-color 0.12s,
    background 0.12s;
}
.btn-ghost:hover {
  border-color: var(--teal-400);
  background: rgba(3, 176, 173, 0.08);
}
.text-link {
  font-size: 15px;
  color: var(--teal-200);
  font-weight: 500;
}
.text-link:hover {
  color: var(--teal-100);
}
.specstrip {
  list-style: none;
  margin: 22px auto 0;
  padding: 0;
  display: flex;
  justify-content: center;
  gap: 10px 22px;
  flex-wrap: wrap;
  font-family: var(--f-body);
  font-size: 13.5px;
  color: var(--ink-2);
}
.specstrip b {
  color: var(--ink-1);
  font-weight: 500;
}

/* ───────────── SECTION SHELL ───────────── */
.band {
  padding: 92px 0;
  border-top: 1px solid var(--line);
}
.band.alt {
  background: linear-gradient(180deg, rgba(13, 17, 22, 0.6), rgba(8, 11, 14, 0));
}
h2 {
  font-size: clamp(1.9rem, 3.4vw, 2.8rem);
  line-height: 1.08;
  margin: 0;
}
.lead {
  color: var(--ink-1);
  font-size: 1.14rem;
  margin: 18px 0 0;
  max-width: 64ch;
  /* pull stranded last-line runts back up (no orphans) */
  text-wrap: pretty;
}
.sec-head.center,
.center .lead {
  margin-left: auto;
  margin-right: auto;
}
.sec-head.center {
  max-width: 70ch;
  text-align: center;
}
.split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 48px;
  align-items: center;
}

/* reveal animation */
[data-reveal] {
  opacity: 0;
  transform: translateY(18px);
  transition:
    opacity 0.6s var(--ease),
    transform 0.6s var(--ease);
}
[data-reveal].is-in {
  opacity: 1;
  transform: none;
}
@media (prefers-reduced-motion: reduce) {
  [data-reveal] {
    opacity: 1;
    transform: none;
    transition: none;
  }
}

/* compare cells (exact vs faceted) */
.compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  margin-top: 36px;
}
.compare-cell {
  margin: 0;
  border: 1px solid var(--line);
  border-radius: var(--r-card);
  padding: 22px;
  background: var(--bg-1);
}
.mini {
  display: block;
  width: 100%;
  height: 200px;
  object-fit: contain;
  border-radius: 10px;
  background:
    radial-gradient(circle at 50% 42%, rgba(3, 176, 173, 0.12), transparent 68%), var(--bg-2);
}
.compare-cell figcaption {
  margin-top: 14px;
  font-family: var(--f-mono);
  font-size: 12.5px;
  color: var(--ink-2);
}
.compare-cell b {
  color: var(--teal-200);
  font-weight: 500;
}

/* code cards / terminals */
.code-card,
.panel {
  border: 1px solid var(--line);
  border-radius: var(--r-card);
  background: linear-gradient(180deg, var(--bg-1), var(--bg-0));
  overflow: hidden;
}
.code-bar {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 16px;
  border-bottom: 1px solid var(--line);
  font-family: var(--f-mono);
  font-size: 12px;
  color: var(--ink-2);
}
.dot3 {
  display: flex;
  gap: 6px;
}
.dot3 i {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--line-2);
}
pre.code,
pre.term {
  margin: 0;
  padding: 18px 20px;
  font-family: var(--f-mono);
  font-size: 13px;
  line-height: 1.75;
  color: var(--ink-1);
}
/* wrap long lines instead of clipping/scrolling on narrow screens */
pre.code {
  white-space: pre-wrap;
  overflow-wrap: break-word;
  overflow-x: hidden;
}
pre.term {
  overflow-x: auto;
}
.code :deep(.k),
.term .kk {
  color: #c9defb;
}
.code :deep(.fn) {
  color: var(--teal-200);
}
.code :deep(.s) {
  color: #ffd9a8;
}
.code :deep(.n) {
  color: #f2a6c2;
}
.code :deep(.cm) {
  color: var(--ink-2);
}
.code :deep(.ty) {
  color: #6ee7c8;
}
.code :deep(.pr) {
  color: #9cdcfe;
}
.code :deep(.va) {
  color: #c8d3da;
}
.code :deep(.op) {
  color: #7c8794;
}
.code :deep(.er) {
  color: #ff8c8c;
}
.code :deep(.ok),
.term .ok {
  color: var(--pass);
}
.term .p {
  color: var(--ink-2);
}
.term .c {
  color: var(--teal-200);
}
.term .cm {
  color: var(--ink-2);
}

/* AI section */
.band.feature {
  background:
    radial-gradient(80% 60% at 50% 0%, rgba(3, 176, 173, 0.1), transparent 60%),
    linear-gradient(180deg, rgba(13, 17, 22, 0.5), rgba(8, 11, 14, 0));
}
.ai-grid {
  margin-top: 42px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 22px;
  align-items: stretch;
}
.report {
  padding: 18px 20px;
  font-family: var(--f-mono);
  font-size: 12.5px;
}
.verdict {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 0 14px;
  color: var(--pass);
}
.badge {
  border: 1px solid var(--pass);
  border-radius: var(--r-pill);
  padding: 2px 10px;
  font-size: 11px;
}
.report dl {
  margin: 0;
}
.report dl > div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 4px 0;
  border-bottom: 1px dashed var(--line);
}
.report dt {
  color: var(--ink-2);
}
.report dd {
  margin: 0;
  color: var(--ink-0);
}
.report dd.pass {
  color: var(--pass);
}
.report dd.teal {
  color: var(--teal-200);
}
.views {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-top: 14px;
}
.view {
  position: relative;
  margin: 0;
  aspect-ratio: 1;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg-2);
  overflow: hidden;
}
.view img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.view span {
  position: absolute;
  left: 6px;
  bottom: 4px;
  font-size: 9px;
  color: var(--ink-2);
  letter-spacing: 0.05em;
}
.caption {
  margin-top: 26px;
  font-size: 15px;
  color: var(--ink-2);
}

/* kernels */
.kernels {
  margin-top: 36px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 18px;
  align-items: center;
}
.kcard {
  border: 1px solid var(--line);
  border-radius: var(--r-card);
  padding: 24px;
  background: var(--bg-1);
}
.kcard.shipping {
  border-color: rgba(3, 176, 173, 0.4);
  box-shadow: 0 0 0 1px rgba(3, 176, 173, 0.12) inset;
}
.ktag {
  font-family: var(--f-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--teal-200);
}
.kcard.wip .ktag {
  color: var(--ink-2);
}
.kcard h3 {
  font-size: 1.4rem;
  margin: 8px 0 6px;
}
.kcard p {
  margin: 0;
  color: var(--ink-1);
  font-size: 0.96rem;
}
.kswitch code {
  white-space: nowrap;
}

/* ecosystem chips */
.chips {
  list-style: none;
  padding: 0;
  margin: 26px 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
}
.chips li {
  font-family: var(--f-mono);
  font-size: 12.5px;
  padding: 6px 13px;
  border-radius: var(--r-pill);
  border: 1px solid var(--line-2);
  color: var(--ink-1);
  background: var(--bg-1);
}

/* interop / formats card */
.fmt-card {
  border: 1px solid var(--line);
  border-radius: var(--r-card);
  background: linear-gradient(180deg, var(--bg-1), var(--bg-0));
  overflow: hidden;
}
.fmt-flow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px;
  border-bottom: 1px solid var(--line);
  font-family: var(--f-mono);
  font-size: 12px;
}
.fmt-node {
  color: var(--ink-1);
}
.fmt-link {
  color: var(--teal-200);
}
.fmt-grid {
  list-style: none;
  margin: 0;
  padding: 10px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.fmt-grid li {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg-2);
}
.fmt-grid b {
  font-weight: 600;
  font-size: 13px;
  color: var(--teal-100);
}
.fmt-grid span {
  font-family: var(--f-mono);
  font-size: 10.5px;
  color: var(--ink-2);
  letter-spacing: 0.03em;
}

/* provenance + closer */
.provenance {
  background: radial-gradient(80% 70% at 50% 120%, rgba(3, 176, 173, 0.12), transparent 60%);
}
.prov-line a {
  color: var(--teal-200);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.prov-line a:hover {
  color: var(--teal-100);
}
.prov-line {
  color: var(--ink-1);
  font-size: 1.05rem;
  margin: 0;
}
.specrow {
  list-style: none;
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px 22px;
  margin: 20px 0 0;
  padding: 0;
  font-family: var(--f-mono);
  font-size: 12.5px;
  color: var(--ink-2);
}
.specrow li {
  position: relative;
}
.specrow li + li::before {
  content: '·';
  position: absolute;
  left: -13px;
  color: var(--line-2);
}
.closer {
  margin-top: 56px;
}
.closer h2 {
  font-size: clamp(2rem, 4vw, 3rem);
}
.closer .cta-row {
  margin-top: 26px;
}
.quiet {
  margin-top: 22px;
  color: var(--ink-2);
  font-size: 14.5px;
}
.quiet-link {
  color: var(--teal-200);
  font-weight: 500;
  border-bottom: 1px solid color-mix(in srgb, var(--teal-200) 35%, transparent);
  transition:
    color 0.15s ease,
    border-color 0.15s ease;
}
.quiet-link:hover {
  color: var(--teal-100);
  border-bottom-color: var(--teal-100);
}
.quiet-link code {
  color: inherit;
}

/* footer */
.lfoot {
  border-top: 1px solid var(--line);
  padding: 56px 0 40px;
  background: var(--bg-1);
}
.foot-grid {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 40px;
}
.foot-egg {
  margin: 16px 0 0;
  color: var(--ink-2);
  font-size: 13.5px;
  line-height: 1.6;
  max-width: 46ch;
  text-wrap: pretty;
}
.foot-col h3 {
  font-family: var(--f-mono);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-2);
  margin: 0 0 14px;
}
.foot-col a {
  display: block;
  color: var(--ink-1);
  font-size: 14.5px;
  padding: 5px 0;
}
.foot-col a:hover {
  color: var(--teal-200);
}
.foot-base {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-top: 44px;
  padding-top: 24px;
  border-top: 1px solid var(--line);
  font-size: 13px;
  color: var(--ink-2);
}
.foot-base .mono {
  font-family: var(--f-mono);
}

/* focus visibility */
.landing :where(a, button):focus-visible {
  outline: 2px solid var(--teal-300);
  outline-offset: 3px;
  border-radius: 4px;
}

/* ───────────── RESPONSIVE ───────────── */
@media (max-width: 860px) {
  .lnav-links {
    display: none;
  }
  .lnav-right .ic {
    display: none;
  }
  .split,
  .ai-grid {
    grid-template-columns: 1fr;
    gap: 34px;
  }
  .kernels {
    grid-template-columns: 1fr;
  }
  .kswitch {
    text-align: center;
  }
  .compare {
    grid-template-columns: 1fr;
  }
  .foot-grid {
    grid-template-columns: 1fr 1fr;
  }
  .foot-brand {
    grid-column: 1 / -1;
  }
  .foot-base {
    flex-direction: column;
  }
  .band {
    padding: 64px 0;
  }
  .hero {
    padding: 56px 0 40px;
  }
}
@media (max-width: 600px) {
  /* Drop the deliberate two-clause break on phones: the headline scales down
     and balances on its own, so the hard <br> would only force ragged lines. */
  h1 .h1-break {
    display: none;
  }
  /* Pull the (now eyebrow-less) headline up under the nav and let it dominate;
     trim the subhead so it supports rather than competes with the bigger H1. */
  .hero {
    padding: 40px 0;
  }
  .subhead {
    font-size: 1.08rem;
    margin-top: 18px;
  }
}
@media (max-width: 460px) {
  .foot-grid {
    grid-template-columns: 1fr;
  }
}
</style>
