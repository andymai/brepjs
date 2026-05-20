import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

// Update on major bumps — this docs site is deployed independently from the
// brepjs package, so reading the version from package.json at build time would
// require shipping the parent package.json into the deploy artifact.
const major = 'v18';
const year = new Date().getFullYear();
const siteUrl = 'https://brepjs.dev';
const defaultOgImage = `${siteUrl}/og.png`;
const defaultDescription =
  'CAD modeling for JavaScript. Exact B-Rep geometry, type-safe, browser-native.';

export default withMermaid(
  defineConfig({
    title: 'brepjs',
    description: defaultDescription,
    lang: 'en-US',
    base: process.env.DOCS_BASE ?? '/',
    cleanUrls: true,
    lastUpdated: true,
    // /playground is staged into the VitePress dist after this build runs
    // (see vercel.json buildCommand), so the link checker can't see it.
    ignoreDeadLinks: [/^\/playground(\/|$)/],
    head: [
      ['link', { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
      ['link', { rel: 'icon', href: '/favicon.ico', type: 'image/x-icon' }],
      ['link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }],
      ['link', { rel: 'manifest', href: '/site.webmanifest' }],
      ['meta', { name: 'theme-color', content: '#4ACECC' }],
      ['meta', { property: 'og:type', content: 'website' }],
      ['meta', { property: 'og:site_name', content: 'brepjs' }],
      ['meta', { property: 'og:image', content: defaultOgImage }],
      ['meta', { property: 'og:image:width', content: '1200' }],
      ['meta', { property: 'og:image:height', content: '630' }],
      ['meta', { property: 'og:image:alt', content: 'brepjs — CAD modeling for JavaScript' }],
      ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
      ['meta', { name: 'twitter:image', content: defaultOgImage }],
    ],
    transformPageData(pageData) {
      // Per-page meta. `frontmatter.description` wins over the global default
      // so each page can give Slack/X/Google a tailored preview.
      const description =
        (pageData.frontmatter.description as string | undefined) ??
        pageData.description ??
        defaultDescription;
      const title = pageData.frontmatter.title ?? pageData.title ?? 'brepjs';
      const fullTitle = title === 'brepjs' ? 'brepjs' : `${title} | brepjs`;
      const path = pageData.relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '');
      const url = `${siteUrl}/${path}`;

      // VitePress emits `<meta name="description">` natively from
      // `frontmatter.description`, so we don't push one here — that would
      // duplicate the tag and let scrapers pick the wrong copy.
      pageData.frontmatter.head ??= [];
      pageData.frontmatter.head.push(
        ['link', { rel: 'canonical', href: url }],
        ['meta', { property: 'og:url', content: url }],
        ['meta', { property: 'og:title', content: fullTitle }],
        ['meta', { property: 'og:description', content: description }],
        ['meta', { name: 'twitter:title', content: fullTitle }],
        ['meta', { name: 'twitter:description', content: description }]
      );
    },
    themeConfig: {
      logo: { src: '/logo.svg', alt: 'brepjs' },
      siteTitle: 'brepjs',
      nav: [
        { text: 'Guide', link: '/introduction/why-brepjs' },
        { text: 'API Reference', link: 'https://andymai.github.io/brepjs/' },
        { text: 'Playground', link: '/playground', target: '_blank', rel: 'noopener noreferrer' },
        {
          text: major,
          items: [
            { text: 'Changelog', link: 'https://github.com/andymai/brepjs/blob/main/CHANGELOG.md' },
            { text: 'npm', link: 'https://www.npmjs.com/package/brepjs' },
          ],
        },
      ],
      sidebar: [
        {
          text: 'Introduction',
          items: [
            { text: 'Why brepjs', link: '/introduction/why-brepjs' },
            { text: 'Status, Stability & Versioning', link: '/introduction/stability' },
            { text: 'What brepjs is NOT', link: '/introduction/non-goals' },
          ],
        },
        {
          text: 'Getting Started',
          items: [
            { text: 'Install & Initialize', link: '/getting-started/install' },
            { text: 'Your First Solid', link: '/getting-started/first-solid' },
            { text: 'Cheat Sheet', link: '/getting-started/cheat-sheet' },
          ],
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'B-Rep vs Mesh', link: '/concepts/brep-vs-mesh' },
            { text: 'The Topology Hierarchy', link: '/concepts/topology' },
            { text: 'Types That Prove Geometry Is Valid', link: '/concepts/types' },
            { text: 'Result<T,E> and Errors', link: '/concepts/result' },
            { text: 'Kernels & withKernel', link: '/concepts/kernels' },
            { text: 'Tolerance & Validity', link: '/concepts/tolerance' },
            { text: 'CSG as an IR', link: '/concepts/csg-ir' },
          ],
        },
        {
          text: 'Common Tasks',
          items: [
            { text: 'Primitives & Transforms', link: '/tasks/primitives' },
            { text: 'Boolean Operations', link: '/tasks/booleans' },
            { text: 'Fillets & Chamfers', link: '/tasks/fillets' },
            { text: '2D Sketching', link: '/tasks/sketching' },
            { text: 'Lofts, Sweeps, Revolves', link: '/tasks/lofts-sweeps' },
            { text: 'Finders & Queries', link: '/tasks/finders' },
            { text: 'Measurement', link: '/tasks/measurement' },
            { text: 'Import & Export', link: '/tasks/import-export' },
            { text: 'Parametric CSG', link: '/tasks/parametric-csg' },
          ],
        },
        {
          text: 'Advanced',
          items: [
            { text: 'Memory Management', link: '/advanced/memory' },
            { text: 'Performance', link: '/advanced/performance' },
            { text: 'Web Workers', link: '/advanced/workers' },
            { text: 'Healing & Sewing', link: '/advanced/healing' },
            { text: 'CSG Caching & Optimization', link: '/advanced/csg-caching' },
          ],
        },
        {
          text: 'Integration',
          items: [
            { text: 'Three.js', link: '/integration/threejs' },
            { text: 'React Three Fiber', link: '/integration/r3f' },
            { text: 'Vite, Next.js, Astro', link: '/integration/frameworks' },
            { text: 'Compatibility Matrix', link: '/integration/compatibility' },
          ],
        },
        {
          text: 'Migration',
          items: [
            { text: 'Coming from Replicad', link: '/migration/replicad' },
            { text: 'Coming from OpenSCAD', link: '/migration/openscad' },
            { text: 'Coming from Three.js', link: '/migration/threejs' },
            { text: 'From a Hand-Rolled Cache', link: '/migration/manual-csg-cache' },
          ],
        },
        {
          text: 'Extending brepjs',
          items: [
            { text: 'Architecture & Layers', link: '/extending/architecture' },
            { text: 'Writing a Custom Kernel', link: '/extending/custom-kernel' },
            { text: 'Kernel Conformance Suite', link: '/extending/conformance' },
            { text: 'Writing Custom Operations', link: '/extending/custom-ops' },
            { text: 'Pattern Checker Rules', link: '/extending/pattern-checker' },
          ],
        },
        {
          text: 'Reference',
          items: [
            { text: 'Glossary', link: '/reference/glossary' },
            { text: 'Function Lookup', link: '/reference/function-lookup' },
            { text: 'Error Codes', link: '/reference/errors' },
            { text: 'Design Decisions', link: '/reference/decisions' },
            { text: 'API Reference (TypeDoc)', link: 'https://andymai.github.io/brepjs/' },
          ],
        },
      ],
      socialLinks: [
        { icon: 'github', link: 'https://github.com/andymai/brepjs' },
        { icon: 'npm', link: 'https://www.npmjs.com/package/brepjs' },
      ],
      editLink: {
        pattern: 'https://github.com/andymai/brepjs/edit/main/apps/docs/:path',
        text: 'Edit this page on GitHub',
      },
      footer: {
        message: 'Released under the Apache 2.0 License.',
        copyright: `Copyright © 2024–${year} Andy Aragon`,
      },
      search: {
        provider: 'local',
        options: {
          detailedView: true,
        },
      },
      outline: { level: [2, 3] },
    },
    markdown: {
      lineNumbers: false,
      theme: { light: 'github-light', dark: 'github-dark' },
    },
    mermaid: {
      theme: 'default',
    },
    sitemap: {
      hostname: 'https://brepjs.dev',
    },
  })
);
