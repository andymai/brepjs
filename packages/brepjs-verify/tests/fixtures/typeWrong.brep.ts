import { box } from 'brepjs';

// Intentional type error: box() expects numeric dimensions, not a string.
export default () => box('not-a-number', 10, 10);
