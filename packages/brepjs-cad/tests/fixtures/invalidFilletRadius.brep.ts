import { box, fillet } from 'brepjs';

// Negative radius → INVALID_FILLET_RADIUS (Result.Err).
export default () => fillet(box(10, 10, 10), -5);
