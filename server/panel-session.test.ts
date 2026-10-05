import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownPreviewSession, PREVIEW_RENEWAL_MS } from '../client/session';
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test('panel renewal releases the superseded session; unmount releases current and cancels renewal', async () => {
  const released: string[] = [], shown: string[] = [];
  let renewal: (() => void) | undefined;
  let canceled = false, count = 0;
  const dispose = ownPreviewSession({
    open: async () => ({ url: `session-${++count}`, hostname: 'local' }),
    close: async url => { released.push(url); },
    onReady: session => shown.push(session.url),
    onError: error => { throw error; },
    schedule: (callback, delay) => { assert.equal(delay, PREVIEW_RENEWAL_MS); assert.ok(delay < 8 * 60 * 60 * 1000); renewal = callback; return () => { canceled = true; }; },
  });
  await flush();
  assert.deepEqual(shown, ['session-1']);
  renewal!(); await flush();
  assert.deepEqual(shown, ['session-1', 'session-2']);
  assert.deepEqual(released, ['session-1']);
  dispose(); await flush();
  assert.equal(canceled, true);
  assert.deepEqual(released, ['session-1', 'session-2']);
});

test('closing a panel before RPC completion releases its late session without displaying it', async () => {
  let complete!: (value: {url: string; hostname: string}) => void;
  const released: string[] = [];
  const dispose = ownPreviewSession({
    open: () => new Promise(resolve => { complete = resolve; }),
    close: async url => { released.push(url); },
    onReady: () => assert.fail('Unmounted panel must not update'),
    onError: () => assert.fail('Unmounted panel must not update'),
  });
  dispose(); complete({url:'late-session', hostname:'local'}); await flush();
  assert.deepEqual(released,['late-session']);
});

test('failed renewal reports a recoverable error and still releases the old session on retry teardown', async () => {
  let count = 0, renew!: () => void;
  const released: string[] = [], errors: string[] = [];
  const dispose = ownPreviewSession({
    open: async () => { if (++count > 1) throw new Error('Host offline'); return {url:'old-session',hostname:'local'}; },
    close: async url => { released.push(url); },
    onReady: () => {}, onError: error => errors.push(error.message),
    schedule: callback => { renew = callback; return () => {}; },
  });
  await flush(); renew(); await flush();
  assert.deepEqual(errors,['Host offline']);
  dispose(); await flush(); assert.deepEqual(released,['old-session']);
});

test('unmount during renewal releases both the displayed session and late replacement', async () => {
  let renew!: () => void, complete!: (value: {url:string;hostname:string}) => void;
  let opens = 0;
  const released:string[]=[], shown:string[]=[];
  const dispose=ownPreviewSession({
    open: () => ++opens===1 ? Promise.resolve({url:'displayed',hostname:'local'}) : new Promise(resolve=>{complete=resolve;}),
    close: async url=>{released.push(url);}, onReady: value=>{shown.push(value.url);},
    onError: error=>{throw error;}, schedule: callback=>{renew=callback;return ()=>{};},
  });
  await flush();renew();dispose();complete({url:'late-replacement',hostname:'local'});await flush();
  assert.deepEqual(shown,['displayed']);
  assert.deepEqual(released,['displayed','late-replacement']);
});

test('resume after a suspended timer renews by wall clock once, ignoring duplicate wake events', async () => {
  let clock = 0, count = 0, resume!: () => void, unsubscribed = false;
  const pending: Array<(value: {url:string;hostname:string}) => void> = [];
  const released: string[] = [], shown: string[] = [];
  const dispose = ownPreviewSession({
    open: () => new Promise(resolve => { count++; pending.push(resolve); }),
    close: async url => { released.push(url); },
    onReady: value => { shown.push(value.url); }, onError: error => { throw error; },
    schedule: () => () => {}, // The suspended timer never fires.
    now: () => clock,
    onResume: callback => { resume = callback; return () => { unsubscribed = true; }; },
  });
  pending.shift()!({url:'first',hostname:'local'}); await flush();
  clock = PREVIEW_RENEWAL_MS - 1; resume(); await flush();
  assert.equal(count, 1, 'resume before the deadline keeps the session');
  clock = 9 * 60 * 60 * 1000; // Machine slept past the host's eight-hour expiry.
  resume(); resume(); resume(); await flush();
  assert.equal(count, 2, 'concurrent wake events share one acquisition');
  pending.shift()!({url:'second',hostname:'local'}); await flush();
  assert.deepEqual(shown, ['first','second']);
  assert.deepEqual(released, ['first']);
  resume(); await flush(); assert.equal(count, 2, 'deadline restarts from the renewed session');
  dispose(); await flush();
  assert.equal(unsubscribed, true);
  assert.deepEqual(released, ['first','second']);
});

test('timer and resume racing on renewal open only one replacement', async () => {
  let clock = 0, count = 0, timer!: () => void, resume!: () => void;
  const dispose = ownPreviewSession({
    open: async () => ({url:`s-${++count}`,hostname:'local'}), close: async () => {},
    onReady: () => {}, onError: error => { throw error; },
    schedule: callback => { timer = callback; return () => {}; }, now: () => clock,
    onResume: callback => { resume = callback; return () => {}; },
  });
  await flush(); clock = PREVIEW_RENEWAL_MS; timer(); resume(); await flush();
  assert.equal(count, 2); dispose();
});

test('failed renewal waits for Retry instead of looping on wake events', async () => {
  let clock = 0, count = 0, resume!: () => void;
  const errors: string[] = [];
  const dispose = ownPreviewSession({
    open: async () => { if (++count > 1) throw new Error('Host offline'); return {url:'old',hostname:'local'}; },
    close: async () => {}, onReady: () => {}, onError: error => errors.push(error.message),
    schedule: () => () => {}, now: () => clock,
    onResume: callback => { resume = callback; return () => {}; },
  });
  await flush(); clock = 9 * 60 * 60 * 1000; resume(); await flush(); resume(); resume(); await flush();
  assert.equal(count, 2); assert.deepEqual(errors, ['Host offline']); dispose();
});

test('default resume subscription listens to visibility, focus, and pageshow and unsubscribes on unmount', async () => {
  const listeners = new Map<string, () => void>();
  const target = { addEventListener: (t: string, fn: () => void) => listeners.set(t, fn), removeEventListener: (t: string) => listeners.delete(t) };
  const g = globalThis as Record<string, unknown>;
  const saved = { add: g.addEventListener, remove: g.removeEventListener, document: g.document };
  g.addEventListener = target.addEventListener; g.removeEventListener = target.removeEventListener;
  const docListeners = new Map<string, () => void>();
  g.document = { visibilityState: 'visible', addEventListener: (t: string, fn: () => void) => docListeners.set(t, fn), removeEventListener: (t: string) => docListeners.delete(t) };
  try {
    let clock = 0, count = 0;
    const dispose = ownPreviewSession({ open: async () => ({url:`s-${++count}`,hostname:'local'}), close: async () => {}, onReady: () => {}, onError: error => { throw error; }, schedule: () => () => {}, now: () => clock });
    await flush();
    assert.deepEqual([...listeners.keys()].sort(), ['focus','pageshow']);
    assert.ok(docListeners.has('visibilitychange'));
    clock = PREVIEW_RENEWAL_MS; docListeners.get('visibilitychange')!(); await flush();
    assert.equal(count, 2);
    dispose();
    assert.equal(listeners.size + docListeners.size, 0);
  } finally {
    g.addEventListener = saved.add; g.removeEventListener = saved.remove; g.document = saved.document;
  }
});
