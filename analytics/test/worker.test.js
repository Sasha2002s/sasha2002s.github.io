import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker, { canonicalPath, platform, referrerHost, dateRange } from '../src/worker.js';

// Execute the production SQL against SQLite so tests verify deduplication and transaction ordering.
function environment() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_analytics.sql', import.meta.url), 'utf8'));
  function prepare(sql) {
    let values = [];
    return { bind(...args) { values = args; return this; }, async run() { return sqlite.prepare(sql).run(...values); }, async first() { return sqlite.prepare(sql).get(...values); }, async all() { return { results: sqlite.prepare(sql).all(...values) }; } };
  }
  return {
    sqlite, SITE_ORIGIN: 'https://sasha2002s.github.io', AUTH_SECRET: 'test-signing-secret-with-enough-entropy', ADMIN_PASSWORD: 'test-owner-password',
    DB: { prepare, async batch(statements) { sqlite.exec('BEGIN'); try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } },
    COLLECT_LIMIT: { limit: async () => ({ success: true }) }, LOGIN_LIMIT: { limit: async () => ({ success: true }) },
    ASSETS: { fetch: async () => new Response('<html>Dashboard shell</html>') }
  };
}
const day = () => new Date().toISOString().slice(0, 10);
function visit(env, overrides = {}, headers = {}, cf = { country: 'DE', city: 'Berlin' }) {
  const request = new Request('https://stats.example/collect', { method: 'POST', headers: { Origin: env.SITE_ORIGIN, 'CF-Connecting-IP': '192.0.2.1', 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/130.0 Safari/537.36', ...headers }, body: JSON.stringify({ type: 'pageview', path: '/', language: 'en', ...overrides }) });
  Object.defineProperty(request, 'cf', { value: cf });
  return worker.fetch(request, env);
}
const metric = (env, dimension, label) => env.sqlite.prepare('SELECT views,visitors FROM metrics WHERE day=? AND dimension=? AND label=?').get(day(), dimension, label);
async function login(env, password = env.ADMIN_PASSWORD) {
  return worker.fetch(new Request('https://stats.example/api/login', { method: 'POST', headers: { Origin: 'https://stats.example', 'CF-Connecting-IP': '192.0.2.2' }, body: JSON.stringify({ password }) }), env);
}
test('normalizes only the known portfolio pages and strips private query strings', () => {
  assert.equal(canonicalPath('/Experience/index.html?token=private#name'), '/Experience/');
  assert.equal(canonicalPath('/'), '/'); assert.equal(canonicalPath('//evil.example/'), null); assert.equal(canonicalPath('/private-profile/'), null);
});
test('classifies common mobile, tablet and desktop platforms', () => {
  assert.deepEqual(platform('Mozilla iPhone Mobile CriOS/120 Safari/605'), { os: 'iOS / iPadOS', browser: 'Chrome', device: 'Mobile' });
  assert.equal(platform('Mozilla Android Tablet Firefox/130').device, 'Tablet');
  assert.equal(platform('Mozilla Windows Chrome/130 Edg/130').browser, 'Edge');
});
test('referrers retain only hostnames', () => {
  assert.equal(referrerHost('https://www.google.com/search?q=private', 'https://sasha2002s.github.io'), 'google.com');
  assert.equal(referrerHost('https://sasha2002s.github.io/private?secret=x', 'https://sasha2002s.github.io'), 'Direct / internal');
  assert.equal(referrerHost('javascript:alert(1)', 'https://sasha2002s.github.io'), 'Direct / internal');
});
test('repeat views count once daily, with separate per-page unique estimates', async () => {
  const env = environment();
  assert.equal((await visit(env)).status, 204); await visit(env); await visit(env, { path: '/Education/' });
  assert.deepEqual({ ...metric(env, 'total', 'all') }, { views: 3, visitors: 1 });
  assert.deepEqual({ ...metric(env, 'page', '/') }, { views: 2, visitors: 1 });
  assert.deepEqual({ ...metric(env, 'page', '/Education/') }, { views: 1, visitors: 1 });
  assert.deepEqual({ ...metric(env, 'city', 'Berlin, DE') }, { views: 3, visitors: 1 });
  await visit(env, {}, { 'CF-Connecting-IP': '192.0.2.9' }); assert.equal(metric(env, 'total', 'all').visitors, 2);
});
test('raw addresses, user agents, URLs and arbitrary event fields are not stored', async () => {
  const env = environment();
  await visit(env, { path: '/?email=secret@example.com', referrer: 'https://google.com/?q=secret', title: 'PRIVATE', latitude: 20 });
  const tables = ['metrics', 'visitors', 'page_visitors', 'daily_salts'];
  const stored = JSON.stringify(tables.map(table => env.sqlite.prepare(`SELECT * FROM ${table}`).all()));
  for (const privateValue of ['192.0.2.1', 'Mozilla', 'secret@example.com', '?q=', 'PRIVATE', 'latitude']) assert.equal(stored.includes(privateValue), false);
  assert.equal(metric(env, 'referrer', 'google.com').visitors, 1);
});
test('unknown locations remain unknown', async () => {
  const env = environment(); await visit(env, {}, {}, {});
  assert.equal(metric(env, 'country', 'Unknown').visitors, 1); assert.equal(metric(env, 'city', 'Unknown').visitors, 1);
});
test('click events do not inflate page views or visitors', async () => {
  const env = environment(); await visit(env);
  await visit(env, { type: 'download', target: 'https://sasha2002s.github.io/cv.pdf?private=1' });
  await visit(env, { type: 'outbound', target: 'https://github.com/Sasha2002s?secret=1' });
  assert.deepEqual({ ...metric(env, 'total', 'all') }, { views: 1, visitors: 1 });
  assert.equal(metric(env, 'event', 'download: PDF / CV').views, 1); assert.equal(metric(env, 'event', 'outbound: github.com').views, 1);
});
test('rejects foreign origins, invalid paths, invalid event types and unsafe targets', async () => {
  const env = environment();
  for (const [data, headers] of [[{}, { Origin: 'https://evil.example' }], [{ path: '/private/' }, {}], [{ type: 'arbitrary' }, {}], [{ type: 'outbound', target: 'javascript:alert(1)' }, {}]]) assert.ok((await visit(env, data, headers)).status >= 400);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM metrics').get().n, 0);
});
test('honors privacy headers, recognized bots and rate limits', async () => {
  const env = environment();
  for (const headers of [{ DNT: '1' }, { 'Sec-GPC': '1' }, { 'User-Agent': 'Googlebot/1.0' }]) assert.equal((await visit(env, {}, headers)).status, 204);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM metrics').get().n, 0);
  env.COLLECT_LIMIT.limit = async () => ({ success: false }); assert.equal((await visit(env)).status, 429);
});
test('rejects oversized or malformed bodies', async () => {
  const env = environment(); assert.equal((await visit(env, { extra: 'x'.repeat(3000) })).status, 400);
  const request = new Request('https://stats.example/collect', { method: 'POST', headers: { Origin: env.SITE_ORIGIN, 'CF-Connecting-IP': '192.0.2.1' }, body: '{' });
  assert.equal((await worker.fetch(request, env)).status, 400);
});
test('CORS preflight only permits the production website', async () => {
  const env = environment();
  const response = await worker.fetch(new Request('https://stats.example/collect', { method: 'OPTIONS', headers: { Origin: env.SITE_ORIGIN } }), env);
  assert.equal(response.status, 204); assert.equal(response.headers.get('Access-Control-Allow-Origin'), env.SITE_ORIGIN);
});
test('private statistics require a valid signed owner session', async () => {
  const env = environment(); await visit(env);
  assert.equal((await worker.fetch(new Request('https://stats.example/api/stats'), env)).status, 401);
  assert.equal((await login(env, 'wrong')).status, 401);
  const response = await login(env); assert.equal(response.status, 200); const { token } = await response.json();
  const result = await worker.fetch(new Request('https://stats.example/api/stats', { headers: { Authorization: `Bearer ${token}` } }), env);
  assert.equal(result.status, 200); const data = await result.json(); assert.equal(data.active, 1);
  assert.ok(data.rows.every(row => !('id' in row))); assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.equal((await worker.fetch(new Request('https://stats.example/api/stats', { headers: { Authorization: `Bearer ${token}x` } }), env)).status, 401);
  env.AUTH_SECRET = 'rotated'; assert.equal((await worker.fetch(new Request('https://stats.example/api/stats', { headers: { Authorization: `Bearer ${token}` } }), env)).status, 401);
});
test('dashboard authentication has rate limiting and no cross-origin login', async () => {
  const env = environment(); env.LOGIN_LIMIT.limit = async () => ({ success: false }); assert.equal((await login(env)).status, 429);
  const request = new Request('https://stats.example/api/login', { method: 'POST', headers: { Origin: 'https://evil.example' }, body: '{}' });
  assert.equal((await worker.fetch(request, env)).status, 403);
});
test('date ranges reject impossible, reversed, future and excessive dates', () => {
  for (const params of ['start=2026-02-30', 'start=2026-10-10&end=2026-10-01', 'start=2000-01-01', 'end=2999-01-01', 'start=oops']) assert.equal(dateRange(new URL(`https://stats.example/?${params}`)), null);
  assert.ok(dateRange(new URL('https://stats.example/')));
});
test('scheduled cleanup deletes retired identifiers and salts, preserving recent aggregates', async () => {
  const env = environment(); await visit(env);
  env.sqlite.exec("INSERT INTO visitors VALUES ('2000-01-01','old',1); INSERT INTO page_visitors VALUES ('2000-01-01','/','old'); INSERT INTO daily_salts VALUES ('2000-01-01','old'); INSERT INTO metrics VALUES ('2000-01-01','total','all',10,2)");
  await worker.scheduled({}, env);
  for (const table of ['visitors', 'page_visitors', 'daily_salts', 'metrics']) assert.equal(env.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE day='2000-01-01'`).get().n, 0);
  assert.equal(metric(env, 'total', 'all').visitors, 1);
});
test('dashboard responses prevent framing, indexing and caching', async () => {
  const env = environment(); const response = await worker.fetch(new Request('https://stats.example/'), env);
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY'); assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/); assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow'); assert.equal(response.headers.get('Set-Cookie'), null);
});
