# Self-hosted brand fonts (NOT committed)

**Signifier** (Klim Type Foundry — licensed, web licence order #26060867) is the
landing-page display face: `signifier-regular.woff2` (400), `signifier-italic.woff2`
(400 italic), `signifier-medium.woff2` (500).

These woff2 files are **gitignored** — Klim's licence forbids exposing them for
direct download, and this is a public Apache-2.0 repo. They are provisioned into
this folder at **build time** from a private source (Vercel) and served from
`/fonts/` on the deployed site only.

**Local dev:** drop the licensed woff2 here to preview the real face; without them
the landing uses the `Georgia, serif` fallback. Wiring lives in `Landing.vue`
(`@font-face` + `--f-display`) and `config.ts` (`<link rel=preload>`).
