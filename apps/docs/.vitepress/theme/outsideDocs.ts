// The site serves more than these docs from one origin: the playground is a separate app under /playground.
// The docs router takes each same-origin link without a `target` attribute as a docs page, so a link to the
// playground loads the docs 404 page. The guard below sends such a link to the browser.

const OUTSIDE = ['/playground'];

/** True when a same-origin path belongs to an app that is not these docs. */
export function leavesDocs(href: string): boolean {
  const { pathname } = new URL(href, 'https://brepjs.dev');
  return OUTSIDE.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

interface RouterLike {
  onBeforeRouteChange?: (to: string) => unknown;
}

const pathOf = (href: string): string => new URL(href, 'https://brepjs.dev').pathname;

/**
 * Makes the docs router hand each link that leaves the docs to the browser.
 *
 * `here` gives the current location. When the docs app itself loads on a path outside the docs (the server
 * found no file there and sent the docs 404 page), the first route is that same path. The guard lets it
 * through, or the page would load again without end.
 */
export function guardRouter(
  router: RouterLike,
  leave: (href: string) => void,
  here: () => string
): void {
  const previous = router.onBeforeRouteChange;
  router.onBeforeRouteChange = (to) => {
    if (leavesDocs(to) && pathOf(to) !== pathOf(here())) {
      leave(to);
      return false;
    }
    return previous?.(to);
  };
}
