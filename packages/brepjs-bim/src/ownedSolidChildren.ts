import { createSolid, getKernel, type Solid } from 'brepjs';

interface ExtractedSolidOwner extends Disposable {
  readonly wrapped: Parameters<ReturnType<typeof getKernel>['dispose']>[0];
}

/** Register every eager iterator allocation before wrapping any child. */
export function ownSolidChildren(
  parent: Solid['wrapped'],
  own: (resource: ExtractedSolidOwner, itemIndex: number) => void
): readonly Solid[] {
  const kernel = getKernel();
  const children = kernel
    .iterShapes(parent, 'solid')
    .map((wrapped: ExtractedSolidOwner['wrapped']) => {
      let solid: Solid | undefined;
      let attempted = false;
      const resource: ExtractedSolidOwner = {
        wrapped,
        [Symbol.dispose]() {
          if (attempted) return;
          attempted = true;
          if (solid === undefined) kernel.dispose(wrapped);
          else solid[Symbol.dispose]();
        },
      };
      return {
        resource,
        wrap: () => {
          solid = createSolid(wrapped);
          return solid;
        },
      };
    });
  children.forEach(({ resource }, itemIndex) => own(resource, itemIndex));
  return children.map(({ wrap }) => wrap());
}
