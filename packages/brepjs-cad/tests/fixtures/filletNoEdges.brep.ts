import { box, fillet } from 'brepjs';

// 3-arg fillet with an explicit empty edge list → FILLET_NO_EDGES (Result.Err).
export default () => fillet(box(10, 10, 10), [], 1);
