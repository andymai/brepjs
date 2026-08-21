{
  "name": "brepjs-app",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/main.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "brepjs": "^18.0.0",
    "brepjs-families": ">=0.8.0 <1.0.0",
    "occt-wasm": "^4.0.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.2.0 || ^6.0.0"
  }
}
