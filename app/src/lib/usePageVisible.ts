import { useSyncExternalStore } from 'react';

function subscribe(listener: () => void): () => void {
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
}

/** Whether the page is the one being looked at: false in a background tab, a minimised window or a locked phone. */
export function usePageVisible(): boolean {
  return useSyncExternalStore(subscribe, () => document.visibilityState === 'visible');
}
