const encoder = new TextEncoder();
const PATHS = new Set(['/', '/Experience/', '/Education/', '/Blender-projects/', '/EchoMind/', '/SashaStudy/']);
const DIMENSIONS = ['total', 'page', 'country', 'city', 'device', 'browser', 'os', 'referrer', 'language', 'event'];
const SECURITY = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()'
};
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { ...SECURITY, 'Content-Type': 'application/json', ...headers }
});
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const unb64 = value => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
const clean = (value, size = 100) => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, '').slice(0, size) : '';
export function canonicalPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null;
  const path = value.split(/[?#]/)[0].replace(/index\.html$/, '').replace(/\/*$/, '/');
  return PATHS.has(path) ? path : null;
}
export function platform(ua) {
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS / iPadOS' : /Windows/i.test(ua) ? 'Windows' : /Macintosh|Mac OS X/i.test(ua) ? 'macOS' : /CrOS/i.test(ua) ? 'ChromeOS' : /Linux/i.test(ua) ? 'Linux' : 'Other';
  const browser = /Edg(?:e|A|iOS)?\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\/|FxiOS\//.test(ua) ? 'Firefox' : /Chrome\/|CriOS\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Other';
  const device = /iPad|Tablet/i.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? 'Tablet' : /Mobi|iPhone|iPod/i.test(ua) ? 'Mobile' : 'Desktop';
  return { os, browser, device };
}
export function referrerHost(value, origin) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin === origin) return 'Direct / internal';
    return clean(url.hostname.toLowerCase().replace(/^www\./, ''));
  } catch { return 'Direct / internal'; }
}
async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(await crypto.subtle.sign('HMAC', key, encoder.encode(text)));
}
async function equal(a, b) {
  const [x, y] = await Promise.all([a, b].map(v => crypto.subtle.digest('SHA-256', encoder.encode(v))));
  return new Uint8Array(x).reduce((diff, value, i) => diff | value ^ new Uint8Array(y)[i], 0) === 0;
}
async function authorized(request, env) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !env.AUTH_SECRET) return false;
  try {
    if (!await equal(signature, await hmac(env.AUTH_SECRET, payload))) return false;
    const data = JSON.parse(new TextDecoder().decode(unb64(payload)));
    return data.exp > Date.now() && data.exp < Date.now() + 9 * 3600000 && data.role === 'owner';
  } catch { return false; }
}
async function body(request) {
  // Bound the actual stream as well as Content-Length so chunked requests cannot bypass the cap.
  if (Number(request.headers.get('Content-Length') || 0) > 2048) throw new Error('body');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('body');
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 2048) { await reader.cancel(); throw new Error('body'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function collect(request, env) {
  const origin = request.headers.get('Origin');
  if (origin !== env.SITE_ORIGIN) return json({ error: 'Origin denied' }, 403);
  const cors = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...SECURITY, ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  const ua = request.headers.get('User-Agent') || '';
  if (request.headers.get('Sec-GPC') === '1' || request.headers.get('DNT') === '1' || /bot|crawler|spider|headless|preview|slurp/i.test(ua) || request.cf?.botManagement?.verifiedBot) return new Response(null, { status: 204, headers: cors });
  if (!env.AUTH_SECRET) return json({ error: 'Not configured' }, 503, cors);
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip) return json({ error: 'Visitor address unavailable' }, 400, cors);
  const rateKey = await hmac(env.AUTH_SECRET, `${new Date().toISOString().slice(0, 10)}:${ip}`);
  if (!(await env.COLLECT_LIMIT.limit({ key: rateKey })).success) return json({ error: 'Rate limited' }, 429, cors);
  const data = await body(request);
  const path = canonicalPath(data.path);
  if (!path || !['pageview', 'download', 'outbound'].includes(data.type)) return json({ error: 'Invalid event' }, 400, cors);
  const day = new Date().toISOString().slice(0, 10);
  // Each day receives a random salt. Deleting it makes old identifiers unreproducible.
  await env.DB.prepare('INSERT OR IGNORE INTO daily_salts(day,salt) VALUES (?,?)').bind(day, b64(crypto.getRandomValues(new Uint8Array(32)))).run();
  const { salt } = await env.DB.prepare('SELECT salt FROM daily_salts WHERE day=?').bind(day).first();
  const id = await hmac(salt, `${env.SITE_ORIGIN}\n${ip}\n${ua.slice(0, 512)}`);
  if (data.type !== 'pageview') {
    // Restrict events to known download categories or hostnames, never arbitrary URLs or query strings.
    let target;
    try {
      const url = new URL(data.target, env.SITE_ORIGIN);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('target');
      target = data.type === 'download' ? (/\.pdf$/i.test(url.pathname) ? 'PDF / CV' : 'Asset download') : clean(url.hostname, 100);
      if (data.type === 'outbound' && url.origin === env.SITE_ORIGIN) throw new Error('target');
    } catch { return json({ error: 'Invalid target' }, 400, cors); }
    await env.DB.prepare("INSERT INTO metrics(day,dimension,label,views,visitors) VALUES (?,'event',?,1,0) ON CONFLICT(day,dimension,label) DO UPDATE SET views=views+1")
      .bind(day, `${data.type}: ${target}`).run();
    return new Response(null, { status: 204, headers: cors });
  }
  const cf = request.cf || {};
  const { device, browser, os } = platform(ua);
  const country = /^[A-Z]{2}$/.test(cf.country || '') && cf.country !== 'XX' ? cf.country : 'Unknown';
  const dimensions = {
    total: 'all', country, city: cf.city ? `${clean(cf.city, 80)}, ${country}` : 'Unknown',
    device, browser, os, referrer: referrerHost(data.referrer, env.SITE_ORIGIN),
    language: /^[a-z]{2,3}$/i.test(data.language || '') ? data.language.toLowerCase() : 'Unknown'
  };
  // D1 batches are transactional: concurrent page loads cannot both become the first daily visitor.
  const batch = Object.entries(dimensions).map(([dimension, label]) => env.DB.prepare(
    'INSERT INTO metrics(day,dimension,label,views,visitors) VALUES (?,?,?,1,CASE WHEN EXISTS(SELECT 1 FROM visitors WHERE day=? AND id=?) THEN 0 ELSE 1 END) ON CONFLICT(day,dimension,label) DO UPDATE SET views=views+1,visitors=visitors+excluded.visitors'
  ).bind(day, dimension, label, day, id));
  batch.push(env.DB.prepare("INSERT INTO metrics(day,dimension,label,views,visitors) VALUES (?,'page',?,1,CASE WHEN EXISTS(SELECT 1 FROM page_visitors WHERE day=? AND path=? AND id=?) THEN 0 ELSE 1 END) ON CONFLICT(day,dimension,label) DO UPDATE SET views=views+1,visitors=visitors+excluded.visitors").bind(day, path, day, path, id));
  batch.push(env.DB.prepare('INSERT OR IGNORE INTO page_visitors(day,path,id) VALUES (?,?,?)').bind(day, path, id));
  batch.push(env.DB.prepare('INSERT INTO visitors(day,id,last_seen) VALUES (?,?,?) ON CONFLICT(day,id) DO UPDATE SET last_seen=excluded.last_seen').bind(day, id, Date.now()));
  await env.DB.batch(batch);
  return new Response(null, { status: 204, headers: cors });
}
async function login(request, env) {
  if (!env.ADMIN_PASSWORD || !env.AUTH_SECRET) return json({ error: 'Dashboard setup is incomplete' }, 503);
  if (request.headers.get('Origin') !== new URL(request.url).origin) return json({ error: 'Origin denied' }, 403);
  const key = await hmac(env.AUTH_SECRET, request.headers.get('CF-Connecting-IP') || 'local');
  if (!(await env.LOGIN_LIMIT.limit({ key })).success) return json({ error: 'Too many attempts. Try again in a minute.' }, 429);
  const data = await body(request);
  if (typeof data.password !== 'string' || !await equal(data.password, env.ADMIN_PASSWORD)) return json({ error: 'Incorrect password' }, 401);
  const exp = Date.now() + 8 * 3600000;
  const payload = b64(encoder.encode(JSON.stringify({ role: 'owner', exp })));
  return json({ token: `${payload}.${await hmac(env.AUTH_SECRET, payload)}`, expires: exp });
}
export function dateRange(url) {
  const today = new Date().toISOString().slice(0, 10);
  const end = url.searchParams.get('end') || today;
  const start = url.searchParams.get('start') || new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const valid = x => /^\d{4}-\d{2}-\d{2}$/.test(x) && !isNaN(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x;
  if (!valid(start) || !valid(end) || end < start || end > today || Date.parse(end) - Date.parse(start) > 365 * 86400000) return null;
  return { start, end };
}
async function stats(request, env) {
  if (!await authorized(request, env)) return json({ error: 'Please sign in again' }, 401);
  const range = dateRange(new URL(request.url));
  if (!range) return json({ error: 'Choose a valid date range up to 366 days, ending no later than today' }, 400);
  const { results } = await env.DB.prepare('SELECT day,dimension,label,views,visitors FROM metrics WHERE day BETWEEN ? AND ? ORDER BY day').bind(range.start, range.end).all();
  const active = await env.DB.prepare('SELECT COUNT(*) AS count FROM visitors WHERE last_seen > ?').bind(Date.now() - 300000).first();
  return json({ ...range, timezone: 'UTC', active: active.count, rows: results, dimensions: DIMENSIONS });
}
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    try {
      if (path === '/collect') return await collect(request, env);
      if (path === '/api/login' && request.method === 'POST') return await login(request, env);
      if (path === '/api/stats' && request.method === 'GET') return await stats(request, env);
      if (path.startsWith('/api/')) return json({ error: 'Not found' }, 404);
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(SECURITY)) headers.set(key, value);
      headers.set('X-Robots-Tag', 'noindex, nofollow');
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      // Do not log request headers, bodies or database errors: they can contain visitor data.
      return json({ error: error.message === 'body' || error instanceof SyntaxError ? 'Invalid request' : 'Service temporarily unavailable' }, error.message === 'body' || error instanceof SyntaxError ? 400 : 503);
    }
  },
  async scheduled(_event, env) {
    const day = new Date().toISOString().slice(0, 10);
    // UTC rollover retires yesterday's IDs while preserving only aggregate statistics.
    await env.DB.batch([
      env.DB.prepare('DELETE FROM visitors WHERE day < ?').bind(day),
      env.DB.prepare('DELETE FROM page_visitors WHERE day < ?').bind(day),
      env.DB.prepare('DELETE FROM daily_salts WHERE day < ?').bind(day),
      env.DB.prepare('DELETE FROM metrics WHERE day < ?').bind(new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10))
    ]);
  }
};
