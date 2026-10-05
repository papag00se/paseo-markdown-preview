// Sessions expire after eight hours on the host. Renew while mounted before that
// deadline, and own each URL independently of iframe/theme changes or query caches.
export const PREVIEW_RENEWAL_MS = 7 * 60 * 60 * 1000;
interface PreviewSession { url: string; hostname: string }
export function ownPreviewSession({ open, close, onReady, onError, schedule = (callback, delay) => {
  const timer = setTimeout(callback, delay);
  return () => clearTimeout(timer);
} }: {
  open: () => Promise<PreviewSession>;
  close: (url: string) => Promise<unknown>;
  onReady: (session: PreviewSession) => void;
  onError: (error: Error) => void;
  schedule?: (callback: () => void, delay: number) => () => void;
}): () => void {
  let active = true;
  let current: PreviewSession | undefined;
  let cancelTimer: (() => void) | undefined;
  const release = (session: PreviewSession) => {
    void close(session.url).catch(() => {});
  };
  async function acquire() {
    try {
      const session = await open();
      if (!active) { release(session); return; }
      const previous = current;
      current = session;
      onReady(session);
      if (previous) release(previous);
      cancelTimer = schedule(() => { void acquire(); }, PREVIEW_RENEWAL_MS);
    } catch (error) {
      if (active) onError(error instanceof Error ? error : new Error(String(error)));
    }
  }
  void acquire();
  return () => {
    active = false;
    cancelTimer?.();
    if (current) { release(current); current = undefined; }
  };
}
