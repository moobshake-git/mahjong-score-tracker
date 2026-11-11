import { useEffect, useRef } from 'react';

/**
 * Calls `fn` every `ms` milliseconds while the tab is visible.
 * Simple way to keep everyone's screen up to date.
 * TODO: replace with WebSockets / Server-Sent Events for instant updates.
 */
export default function usePolling(fn, ms) {
  const saved = useRef(fn);
  useEffect(() => {
    saved.current = fn;
  });
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') saved.current();
    }, ms);
    return () => clearInterval(id);
  }, [ms]);
}
