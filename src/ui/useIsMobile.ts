import { useSyncExternalStore } from 'react';

/** Phone layout breakpoint. Keep in sync with the `@media (max-width: 760px)` block in styles.css. */
export const MOBILE_MAX_WIDTH = 760;
/** Which panel fills the screen in the phone layout. */
export type Pane = 'claims' | 'map' | 'actions';

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
