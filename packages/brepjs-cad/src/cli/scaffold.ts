import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ScaffoldFile {
  path: string;
  created: boolean;
}

export interface ScaffoldResult {
  dir: string;
  files: ScaffoldFile[];
}

function partTemplate(name: string): string {
  return `import { box, cut, unwrap } from 'brepjs';

const width = 40;
const depth = 20;
const height = 10;
const holeSize = 6;

// ${name}: a parameterized starter part — edit the consts above, then re-verify.
export default () => {
  const body = box(width, depth, height, { centered: true });
  const hole = box(holeSize, holeSize, height + 2, { centered: true });
  return unwrap(cut(body, hole));
};
`;
}

function tsconfigTemplate(): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
      },
      include: ['*.brep.ts'],
    },
    null,
    2,
  )}\n`;
}

function readmeTemplate(name: string): string {
  return `# ${name}

A parametric brepjs CAD part. Units are millimetres.

## Verify

\`\`\`sh
npx -y brepjs-verify ${name}.brep.ts --json report.json
\`\`\`

## Iterate

\`\`\`sh
npx -y brepjs-verify watch ${name}.brep.ts
\`\`\`

## Export artifacts

\`\`\`sh
npx -y brepjs-verify export ${name}.brep.ts --all --out out/
\`\`\`
`;
}

export function scaffoldPart(name: string, dir: string): ScaffoldResult {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const targets: Array<{ path: string; content: string }> = [
    { path: join(dir, `${name}.brep.ts`), content: partTemplate(name) },
    { path: join(dir, 'tsconfig.json'), content: tsconfigTemplate() },
    { path: join(dir, 'README.md'), content: readmeTemplate(name) },
  ];
  const files: ScaffoldFile[] = [];
  for (const t of targets) {
    if (existsSync(t.path)) {
      files.push({ path: t.path, created: false });
      continue;
    }
    writeFileSync(t.path, t.content);
    files.push({ path: t.path, created: true });
  }
  return { dir, files };
}
