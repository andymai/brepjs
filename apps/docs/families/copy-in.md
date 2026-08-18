---
title: 'Copy-In Distribution'
description: 'Scaffold with npm create brepjs, copy families into your project with brepjs add, track drift with brepjs diff, and self-host a registry: the shadcn model for CAD components.'
---

# Copy-In Distribution

Component libraries age badly when the components live in `node_modules`: every project needs the variant the library didn't ship, and every workaround is a fork you now maintain against upstream. Families takes the position shadcn proved for UI: **the components are source files in your project**. The package ships the vocabulary (`family`, `el`, `resolve`, `evaluateModel`); the walls, doors, and rooms are code you own, copied in once and edited freely.

## Scaffold

```sh
npm create brepjs@latest my-building
cd my-building
npm install
npm start
```

The scaffold is a working model, not an empty shell: `src/main.ts` builds a wall with a doorway and prints per-element mesh statistics through `evaluateModel`. From there:

```sh
npx brepjs add room storey slab
```

## `brepjs add`

`add` resolves the requested families **plus their family dependencies** against a registry manifest (dependencies are written first; cycles are detected and refused) and copies their source into `src/families/`, reporting any npm dependencies your project is missing:

```
wrote /work/my-building/src/families/wall.ts
wrote /work/my-building/src/families/door.ts
wrote /work/my-building/src/families/room.ts
missing npm deps — run: npm install zod
```

The behavior around your existing files is strict:

- **Unmodified copies are skipped** as `up to date`; `add` is idempotent.
- **Modified files are never clobbered** without `--force`. The check runs for the whole closure _before anything is written_: a conflict on the last file aborts with zero files touched, never a partial install.
- Writes go through a sibling temp file and an atomic rename, so even an interrupted `--force` leaves every file either old or new, never truncated.
- `--install` runs the missing `npm install` for you, with lifecycle scripts suppressed. The default only prints the command.

Every copied file's first line is a machine-managed version marker:

```typescript
// brepjs-family: wall@1
```

Leave it in place; it is the anchor `diff` uses.

## `brepjs diff`

```sh
npx brepjs diff wall
```

`diff` compares your copy against the registry: stale version markers are called out (`local wall@1, registry wall@2`), content drift renders as a git diff, and the exit code is 1 on any difference, which makes it usable as a CI guard for teams that want to know when their copies diverge from upstream.

## Self-hosting a registry

The registry is data: a `manifest.json` plus source files, no server logic.

```json
{
  "schemaVersion": 1,
  "name": "acme standards registry",
  "families": [
    {
      "name": "wall",
      "version": 3,
      "description": "Wall per Acme spec 4.2",
      "files": ["families/wall.ts"],
      "npmDeps": ["brepjs-families", "zod"],
      "familyDeps": []
    }
  ]
}
```

Host it on any static server, or point at a directory:

```sh
npx brepjs add wall --registry https://standards.acme.example/families
npx brepjs add wall --registry ../company-registry
```

This is the intended path for firm standards: your wall types, your pset defaults, your classification codes, distributed as reviewable source with the same tooling.

## The trust boundary, stated plainly

Adding families from a registry means **choosing to run that registry's code in your project**, the same trust decision as installing a dependency. The CLI enforces what can be enforced mechanically and leaves the rest visible:

- Remote registries must be `https`; plaintext `http` is refused.
- Manifest file entries are confined to `families/`; entries that try to escape the target directory are refused, and writes never follow symlinks.
- Declared npm dependencies must be syntactically valid package names (nothing can smuggle flags into `npm install`), and `--install` suppresses their install scripts.
- `diff` refuses to read through symlinked files or directories, so a hostile checkout cannot use it to leak file contents into CI logs.

None of that makes an untrusted registry safe to _use_; it makes the trust decision yours instead of an accident. Point `--registry` only at sources whose code you would merge.

## Next steps

- **[Why a Family Layer](/families/overview)**: the boundary table for what belongs in copied source versus the package.
- **[Props & Validation](/families/props-and-validation)**: the starter families ship with schemas; yours should too.
