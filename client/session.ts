// Sessions expire eight hours (wall clock) after the host opens them. Renew while
// mounted before that deadline, and own each URL independently of iframe/theme
// changes or query caches. Browser timers can stall while a machine sleeps, so the
// renewal deadline is measured against the wall clock and rechecked on resume.
export const PREVIEW_RENEWAL_MS = 7 * 60 * 60 * 1000;
interface PreviewSession { url: string; hostname: string }
type Schedule = (callback: () => void, delay: number) => () => void;
type Subscribe = (callback: () => void) => () => void;

const defaultSchedule: Schedule = (callback, delay) => {
  const timer = setTimeout(callback, delay);
  return () => clearTimeout(timer);
};

// Wake-up signals that a page may see after sleep, tab restore, or bfcache restore.
const subscribeResume: Subscribe = callback => {
  const g = globalThis as { addEventListener?: (type: string, fn: () => void) => void; removeEventListener?: (type: string, fn: () => void) => void; document?: { visibilityState?: string; addEventListener?: (type: string, fn: () => void) => void; removeEventListener?: (type: string, fn: () => void) => void } };
  const onVisible = () => { if (g.document?.visibilityState !== 'hidden') callback(); };
  g.document?.addEventListener?.('visibilitychange', onVisible);
  g.addEventListener?.('focus', callback);
  g.addEventListener?.('pageshow', callback);
  return () => {
    g.document?.removeEventListener?.('visibilitychange', onVisible);
    g.removeEventListener?.('focus', callback);
    g.removeEventListener?.('pageshow', callback);
  };
};

export function ownPreviewSession({ open, close, onReady, onError, schedule = defaultSchedule, now = Date.now, onResume = subscribeResume }: {
  open: () => Promise<PreviewSession>;
  close: (url: string) => Promise<unknown>;
  onReady: (session: PreviewSession) => void;
  onError: (error: Error) => void;
  schedule?: Schedule;
  now?: () => number;
  onResume?: Subscribe;
}): () => void {
  let active = true;
  let current: PreviewSession | undefined;
  let acquiredAt = 0;
  let acquiring = false;
  let failed = false;
  let cancelTimer: (() => void) | undefined;
  const release = (session: PreviewSession) => {
    void close(session.url).catch(() => {});
  };
  async function acquire() {
    if (!active || acquiring) return;
    acquiring = true;
    cancelTimer?.(); cancelTimer = undefined;
    try {
      const session = await open();
      if (!active) { release(session); return; }
      const previous = current;
      current = session;
      acquiredAt = now();
      failed = false;
      onReady(session);
      if (previous) release(previous);
      cancelTimer = schedule(() => { void acquire(); }, PREVIEW_RENEWAL_MS);
    } catch (error) {
      // Leave recovery to the visible Retry; resume events must not loop on a failure.
      failed = true;
      if (active) onError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      acquiring = false;
    }
  }
  const unsubscribe = onResume(() => {
    if (active && current && !failed && now() - acquiredAt >= PREVIEW_RENEWAL_MS) void acquire();
  });
  void acquire();
  return () => {
    active = false;
    unsubscribe();
    cancelTimer?.(); cancelTimer = undefined;
    if (current) { release(current); current = undefined; }
  };
}
