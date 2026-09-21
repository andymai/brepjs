import { box, translate, type DisposalScope } from 'brepjs';

/** Origin-based analytical fixture. The caller's scope owns all returned items. */
export function createOverlapFixture(scope: DisposalScope) {
  const a = scope.register(box(1, 1, 1));
  using source = box(1, 1, 1);
  const b = scope.register(translate(source, [0.5, 0, 0]));
  const p = scope.register(box(2, 1, 1));
  return { a, b, p };
}
