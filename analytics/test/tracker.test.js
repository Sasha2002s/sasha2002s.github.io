import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../analytics.js', import.meta.url), 'utf8');
function browser(origin = 'https://sasha2002s.github.io', privacy = {}) {
  const events = {}, requests = [];
  const document = {
    currentScript: { dataset: { endpoint: 'https://analytics.example/collect' } },
    referrer: 'https://www.google.com/search?q=private',
    visibilityState: 'visible',
    addEventListener(name, callback) { events[name] = callback; }
  };
  const navigator = { language: 'de-DE', doNotTrack: null, globalPrivacyControl: false, ...privacy };
  // A tracker accessing persistent storage should fail this test immediately.
  Object.defineProperties(navigator, { localStorage: { get() { throw new Error('browser storage accessed'); } }, cookieEnabled: { get() { throw new Error('cookie accessed'); } } });
  const window = { addEventListener(name, callback) { events[name] = callback; } };
  runInNewContext(source, { location: { origin, pathname: '/Education/' }, document, navigator, window, URL, fetch(url, options) { requests.push({ url, options, body: JSON.parse(options.body) }); return Promise.resolve(new Response(null)); } });
  return { requests, events };
}
test('published visit sends a minimal page event once and strips private referral paths', () => {
  const { requests, events } = browser();
  assert.equal(requests.length, 1);
  assert.deepEqual({ ...requests[0].body }, { type: 'pageview', path: '/Education/', referrer: 'https://www.google.com', language: 'de' });
  assert.equal(requests[0].options.credentials, 'omit');
  events.visibilitychange(); assert.equal(requests.length, 1);
  events.pageshow({ persisted: true }); assert.equal(requests.length, 2);
});
test('external and download clicks are categorized without sending link queries', () => {
  const { requests, events } = browser();
  const click = (href, attrs = []) => events.click({ isTrusted: true, target: { closest: () => ({ href, hasAttribute: name => attrs.includes(name) }) } });
  click('https://github.com/Sasha2002s?private=1'); click('https://sasha2002s.github.io/output/pdf/cv.pdf?private=1');
  assert.equal(requests.length, 3);
  assert.equal(requests[1].body.target, 'https://github.com');
  assert.equal(requests[2].body.target, 'https://sasha2002s.github.io/output/pdf/cv.pdf');
  events.click({ isTrusted: false, target: { closest: () => ({ href: 'https://evil.example/', hasAttribute: () => false }) } });
  assert.equal(requests.length, 3);
});
test('local previews and visitor privacy signals send no events', () => {
  for (const [origin, privacy] of [['http://localhost:8000', {}], ['https://sasha2002s.github.io', { doNotTrack: '1' }], ['https://sasha2002s.github.io', { globalPrivacyControl: true }]]) assert.equal(browser(origin, privacy).requests.length, 0);
});
