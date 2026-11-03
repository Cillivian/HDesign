import { useEffect, useState } from 'react';

/**
 * Responsive breakpoints for the editor shell.
 *
 * - `mobile`  < 768 px : phone portrait/landscape — bottom navigation, sheets,
 *   reduced toolbars, touch gestures.
 * - `compact` 768–1179 px : tablet / small laptop — side panels become overlay
 *   drawers, the desktop chrome is still used.
 * - `desktop` ≥ 1180 px : three-column workbench.
 *
 * The values mirror the Tailwind default breakpoints (`md` / `xl`-ish) so CSS
 * variants and JS logic never disagree.
 */
export type ViewportMode = 'mobile' | 'compact' | 'desktop';

export const MOBILE_MAX_WIDTH = 767;
export const COMPACT_MAX_WIDTH = 1179;

const MOBILE_QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`;
const COMPACT_QUERY = `(max-width: ${COMPACT_MAX_WIDTH}px)`;

function readMode(): ViewportMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'desktop';
  if (window.matchMedia(MOBILE_QUERY).matches) return 'mobile';
  if (window.matchMedia(COMPACT_QUERY).matches) return 'compact';
  return 'desktop';
}

/** Reactive viewport mode; re-renders on resize, breakpoint change or rotate. */
export function useViewportMode(): ViewportMode {
  const [mode, setMode] = useState<ViewportMode>(readMode);

  useEffect(() => {
    const update = () => setMode(readMode());
    const mobile = window.matchMedia(MOBILE_QUERY);
    const compact = window.matchMedia(COMPACT_QUERY);
    mobile.addEventListener('change', update);
    compact.addEventListener('change', update);
    window.addEventListener('orientationchange', update);
    window.addEventListener('resize', update);
    update();
    return () => {
      mobile.removeEventListener('change', update);
      compact.removeEventListener('change', update);
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return mode;
}

/** True on phone-sized viewports (the shell switches to bottom navigation). */
export function useIsMobile(): boolean {
  return useViewportMode() === 'mobile';
}

/** Non-reactive check for event handlers / imperative code paths. */
export function isMobileViewport(): boolean {
  return readMode() === 'mobile';
}
