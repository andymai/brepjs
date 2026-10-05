import { err, isValidSolid, ok, type Result, type ValidSolid } from 'brepjs';
import { specError, type BimError } from '../errors/bimError.js';
import type { CurtainWallComponent } from '../elementFns/curtainWallFns.js';
import type { AnyBimElement, BimCategory, BimElement } from '../types/bimTypes.js';
import { validateProductBody } from '../types/productBody.js';

export type ElementFields = {
  [C in BimCategory]: Pick<BimElement<C>, 'category' | 'spec' | 'geometry'>;
}[BimCategory];

/** Transitional enumeration of current record storage. Step 2 converges these forms. */
export function retainedSolids(element: ElementFields): readonly ValidSolid[] {
  switch (element.category) {
    case 'WALL':
    case 'RAILING':
      return element.geometry.solids;
    case 'CURTAIN_WALL':
      return [...element.geometry.panels, ...element.geometry.mullions].map(({ solid }) => solid);
    default:
      return element.geometry === null ? [] : [element.geometry];
  }
}

function protectComponent(component: CurtainWallComponent): CurtainWallComponent {
  const origin: CurtainWallComponent['origin'] = [...component.origin];
  const size: CurtainWallComponent['size'] = [...component.size];
  return Object.freeze({
    solid: component.solid,
    origin: Object.freeze(origin),
    size: Object.freeze(size),
  });
}

/** Snapshot ownership-bearing descriptors only; never freeze or clone native handles. */
export function protectElement(element: AnyBimElement): Result<AnyBimElement, BimError> {
  if (element.category === 'WALL' || element.category === 'RAILING') {
    const body = validateProductBody(element.geometry);
    return body.ok ? ok(Object.freeze({ ...element, geometry: body.value })) : body;
  }
  // These adders accept opaque caller-owned handles. isValidSolid alone assumes
  // a Solid already; use the complete native-solid boundary before transfer.
  if (element.category === 'PROXY' || element.category === 'EARTHWORKS_FILL') {
    const body = validateProductBody({ kind: 'AUTHORITATIVE', solids: [element.geometry] });
    return body.ok ? ok(Object.freeze(element)) : body;
  }
  let itemIndex = 0;
  for (const solid of retainedSolids(element)) {
    try {
      if (!solid || solid.disposed || !isValidSolid(solid)) {
        return err({
          ...specError('BODY_INVALID_ITEM', 'Expected a live valid solid handle'),
          metadata: { itemIndex },
        });
      }
    } catch (cause) {
      return err({
        ...specError('BODY_VALIDATION_FAILED', 'Stored geometry validation threw', cause),
        metadata: { itemIndex },
      });
    }
    itemIndex++;
  }
  if (element.category === 'CURTAIN_WALL') {
    return ok(
      Object.freeze({
        ...element,
        geometry: Object.freeze({
          panels: Object.freeze(element.geometry.panels.map(protectComponent)),
          mullions: Object.freeze(element.geometry.mullions.map(protectComponent)),
        }),
      })
    );
  }
  return ok(Object.freeze(element));
}
