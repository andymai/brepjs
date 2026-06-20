import { box } from 'brepjs';

// `expected` is read structurally at runtime, so this wrong bounds shape (the one models
// reach for) type-checks but would otherwise be silently ignored — the CLI must flag it.
export const expected = { volume: 1000, bounds: { min: [0, 0, 0], max: [10, 10, 10] } };
export default () => box(10, 10, 10);
