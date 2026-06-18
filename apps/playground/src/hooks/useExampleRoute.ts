import { useCallback, useEffect, useRef, useState } from 'react';

// Deep-linkable example gallery without a router: the gallery's open/focused
// state is reflected in window.location under the app's base path. BASE_URL
// always ends in '/', so EXAMPLES_PATH is e.g. '/playground/examples'.
const BASE = import.meta.env.BASE_URL;
const EXAMPLES_PATH = `${BASE}examples`;

interface RouteState {
  open: boolean;
  focusedId: string | null;
}

function parse(pathname: string): RouteState {
  if (pathname === EXAMPLES_PATH || pathname === `${EXAMPLES_PATH}/`) {
    return { open: true, focusedId: null };
  }
  if (pathname.startsWith(`${EXAMPLES_PATH}/`)) {
    const id = pathname.slice(`${EXAMPLES_PATH}/`.length).replace(/\/$/, '');
    // A specific example URL is a permalink to that example, not the gallery:
    // land directly on the running example (PlaygroundPage loads it on mount).
    return { open: false, focusedId: id || null };
  }
  return { open: false, focusedId: null };
}

export interface ExampleRoute extends RouteState {
  openGallery: () => void;
  closeGallery: () => void;
  focusExample: (id: string) => void;
  selectExample: (id: string) => void;
}

export function useExampleRoute(): ExampleRoute {
  const [state, setState] = useState<RouteState>(() => parse(window.location.pathname));
  // The editor URL to restore on close. If we deep-landed on the gallery there
  // is no editor entry to return to, so fall back to the base path.
  const editorUrl = useRef(
    state.open ? BASE : `${window.location.pathname}${window.location.search}`
  );

  useEffect(() => {
    const onPop = () => {
      setState(parse(window.location.pathname));
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  const openGallery = useCallback(() => {
    editorUrl.current = `${window.location.pathname}${window.location.search}`;
    // pushState so the browser Back button closes the gallery.
    history.pushState(null, '', `${EXAMPLES_PATH}${window.location.search}`);
    setState({ open: true, focusedId: null });
  }, []);

  const closeGallery = useCallback(() => {
    history.replaceState(null, '', editorUrl.current);
    setState({ open: false, focusedId: null });
  }, []);

  const focusExample = useCallback((id: string) => {
    history.replaceState(null, '', `${EXAMPLES_PATH}/${id}${window.location.search}`);
    setState((s) => (s.focusedId === id ? s : { open: true, focusedId: id }));
  }, []);

  // Selecting an example loads it and closes the gallery, leaving the friendly
  // /examples/<id> permalink in the address bar so the loaded part is shareable.
  const selectExample = useCallback((id: string) => {
    history.replaceState(null, '', `${EXAMPLES_PATH}/${id}${window.location.search}`);
    setState({ open: false, focusedId: id });
  }, []);

  return { ...state, openGallery, closeGallery, focusExample, selectExample };
}
