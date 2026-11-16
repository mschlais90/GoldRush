import { useSyncExternalStore } from 'react';

/** Phone layout breakpoint. Keep in sync with the `@media (max-width: 760px)` block in styles.css. */
export const MOBILE_MAX_WIDTH = 760;
const QUERY =`(max-width: ${MOBILE_MAX_WIDTH}px)`;

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

/** True when the viewport is phone-sized. Desktop layouts never see this flip. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}

/** Non-hook check for plain functions (e.g. tutorial text). */
export function isPhone(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(QUERY).matches;
}
