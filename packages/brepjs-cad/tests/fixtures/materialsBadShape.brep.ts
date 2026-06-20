import { box } from 'brepjs';

export default () => box(10, 10, 10);

// Wrong shape (an array, not a function or material object) — the CLI must
// ignore it and warn rather than throw.
export const materials = [1, 2, 3];
