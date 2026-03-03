Run all verification checks for the current changes.

## Steps

1. Run `npm run validate` (typecheck → lint → boundaries → format → affected tests)
2. If any fail, show the error and suggest the fix

## After verification passes

- If `src/**/*Fns.ts` files changed, run `npm run docs:generate-lookup` to update the function index
- For full coverage: `npm run test:coverage`
