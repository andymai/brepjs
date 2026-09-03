{
  "name": "brepjs-app",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "start": "tsx scripts/report.ts",
    "preview": "brep preview src/main.tsx",
    "export:ifc": "tsx scripts/exportIfc.ts",
    "export:3dm": "brep export src/main.tsx --3dm --out dist",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "brepjs": "^19.0.0",
    "brepjs-bim": ">=0.21.0 <1.0.0",
    "brepjs-families": ">=0.10.0 <1.0.0",
    "occt-wasm": "^4.0.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "brepjs-cad": ">=0.176.0 <1.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.2.0 || ^6.0.0",
    "vitest": "^4.0.0"
  }
}
