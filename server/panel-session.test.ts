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
