'use strict';
const $ = id => document.getElementById(id);
const fmt = value => new Intl.NumberFormat().format(value);
const iso = date => date.toISOString().slice(0, 10);
const svgNS = 'http://www.w3.org/2000/svg';
let token = '', dataset = null, locationMode = 'country', platformMode = 'device', loading = false;
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function svg(tag, attrs, text) {
  const node = document.createElementNS(svgNS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  if (text !== undefined) node.textContent = text;
  return node;
}
function setRange(days) {
  const now = new Date();
  $('end').value = iso(now);
  $('start').value = iso(new Date(now.getTime() - (days - 1) * 86400000));
  document.querySelectorAll('[data-days]').forEach(button => {
    const selected = Number(button.dataset.days) === days;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', selected);
  });
}
function aggregate(dimension) {
  const values = new Map();
  for (const row of dataset?.rows || []) {
    if (row.dimension !== dimension) continue;
    const existing = values.get(row.label) || { label: row.label, views: 0, visitors: 0 };
    existing.views += row.views; existing.visitors += row.visitors;
    values.set(row.label, existing);
  }
  return [...values.values()];
}
function readable(label, dimension) {
  if (label === 'Unknown') return label;
  try {
    if (dimension === 'country') return new Intl.DisplayNames(['en'], { type: 'region' }).of(label) || label;
    if (dimension === 'language') return new Intl.DisplayNames(['en'], { type: 'language' }).of(label) || label;
  } catch { /* Unknown codes should remain readable rather than preventing the entire dashboard rendering. */ }
  return label;
}
function list(id, dimension, metric = 'visitors') {
  const container = $(id); container.replaceChildren();
  const rows = aggregate(dimension).filter(row => row[metric] > 0).sort((a, b) => b[metric] - a[metric]);
  const sum = rows.reduce((value, row) => value + row[metric], 0);
  if (!sum) { container.append(el('div', 'No measured activity in this period.', 'empty')); return; }
  for (const row of rows.slice(0, 15)) {
    const item = el('div', undefined, 'list-row');
    const fill = el('span', undefined, 'row-fill'); fill.style.width = `${row[metric] / rows[0][metric] * 100}%`;
    const label = el('span', readable(row.label, dimension), 'row-label'); label.title = label.textContent;
    item.append(fill, label, el('span', fmt(row[metric]), 'row-count'), el('span', `${Math.round(row[metric] / sum * 100)}%`, 'row-percent'));
    container.append(item);
  }
  if (rows.length > 15) container.append(el('p', `Showing the top 15 of ${rows.length}. Export CSV for all rows.`, 'panel-footnote'));
}
function chart() {
  const rows = new Map((dataset.rows || []).filter(row => row.dimension === 'total').map(row => [row.day, row]));
  const days = [];
  for (let time = Date.parse(dataset.start); time <= Date.parse(dataset.end); time += 86400000) {
    const day = iso(new Date(time)); days.push(rows.get(day) || { day, views: 0, visitors: 0 });
  }
  const W = 1000, H = 225, L = 48, R = 20, T = 18, B = 30;
  const max = Math.max(4, ...days.map(row => row.views), ...days.map(row => row.visitors));
  const y = value => H - B - value / max * (H - T - B);
  const x = index => days.length === 1 ? (W + L - R) / 2 : L + index / (days.length - 1) * (W - L - R);
  const graph = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  for (let i = 0; i <= 4; i++) {
    const value = max / 4 * i;
    graph.append(svg('line', { x1: L, x2: W - R, y1: y(value), y2: y(value), stroke: '#303a4c', 'stroke-dasharray': '3 5' }), svg('text', { x: L - 10, y: y(value) + 4, 'text-anchor': 'end' }, String(Math.round(value))));
  }
  for (const [metric, color] of [['views', '#69aaff'], ['visitors', '#97e24b']]) {
    const points = days.map((row, i) => `${x(i)},${y(row[metric])}`).join(' ');
    graph.append(svg('polyline', { points, fill: 'none', stroke: color, 'stroke-width': 2.5, 'vector-effect': 'non-scaling-stroke' }));
    days.forEach((row, i) => {
      const dot = svg('circle', { cx: x(i), cy: y(row[metric]), r: days.length < 32 ? 3.3 : 2, fill: color });
      dot.append(svg('title', {}, `${row.day}: ${fmt(row[metric])} ${metric}`)); graph.append(dot);
    });
  }
  const indices = [...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])];
  indices.forEach(i => graph.append(svg('text', { x: x(i), y: H - 4, 'text-anchor': i === 0 && days.length > 1 ? 'start' : i === days.length - 1 && days.length > 1 ? 'end' : 'middle' }, new Date(`${days[i].day}T12:00:00Z`).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }))));
  $('chart').replaceChildren(graph);
  $('chart').setAttribute('aria-label', `Daily traffic from ${dataset.start} to ${dataset.end}. Exact numbers are in the table below.`);
  const table = el('table'); const head = el('tr'); ['Date (UTC)', 'Daily unique visitors', 'Page views'].forEach(label => head.append(el('th', label))); table.append(head);
  days.forEach(row => { const tr = el('tr'); [row.day, fmt(row.visitors), fmt(row.views)].forEach(value => tr.append(el('td', value))); table.append(tr); });
  $('daily-table').replaceChildren(table);
}
function render() {
  const total = aggregate('total')[0] || { views: 0, visitors: 0 };
  $('visitors').textContent = fmt(total.visitors); $('views').textContent = fmt(total.views);
  $('visitor-label').textContent = dataset.start === dataset.end ? 'Daily unique visitors' : 'Daily unique visitors · sum';
  const events = aggregate('event');
  for (const [id, prefix] of [['downloads', 'download:'], ['outbound', 'outbound:']]) $(id).textContent = fmt(events.filter(row => row.label.startsWith(prefix)).reduce((sum, row) => sum + row.views, 0));
  $('active').textContent = fmt(dataset.active || 0);
  chart(); list('page-list', 'page', 'views'); list('location-list', locationMode); list('platform-list', platformMode); list('referrer-list', 'referrer'); list('language-list', 'language'); list('event-list', 'event', 'views');
  $('updated').textContent = `Updated ${new Date().toLocaleTimeString()} · ${dataset.start} to ${dataset.end} · UTC reporting days`;
}
async function load() {
  if (loading) return;
  if (!$('start').value || !$('end').value || $('end').value < $('start').value || Date.parse($('end').value) - Date.parse($('start').value) > 365 * 86400000 || $('end').value > iso(new Date())) {
    $('status').textContent = 'Choose valid dates covering up to 366 days, ending no later than today.'; $('status').classList.add('error'); return;
  }
  loading = true; $('export').disabled = true; $('refresh').disabled = true;
  $('status').classList.remove('error'); $('status').textContent = 'Loading your statistics…';
  try {
    // Always load measured data so the dashboard cannot display fictional traffic as real visits.
    const response = await fetch(`/api/stats?start=${$('start').value}&end=${$('end').value}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', credentials: 'omit' });
    const data = await response.json();
    if (response.status === 401) { logout(); $('login-error').textContent = 'Your session expired. Please sign in again.'; return; }
    if (!response.ok) throw new Error(data.error || 'Unable to load statistics');
    dataset = data;
    render(); $('status').textContent = dataset.rows.length ? 'Measured traffic · Daily unique estimates · UTC' : 'No visits recorded yet. Statistics will appear after the website tracker is published and visitors arrive.';
    $('export').disabled = false;
  } catch (error) {
    $('status').textContent = `${error.message}. ${dataset ? 'The dashboard still shows the last successful date range below.' : 'Try refreshing.'}`; $('status').classList.add('error');
  } finally { loading = false; $('refresh').disabled = false; }
}
function showDashboard() {
  $('login-panel').hidden = true; $('dashboard').hidden = false; $('logout').hidden = false; setRange(7); load();
}
function logout() {
  token = ''; dataset = null;
  $('dashboard').hidden = true; $('logout').hidden = true; $('login-panel').hidden = false; $('password').value = '';
}
$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); $('login-button').disabled = true; $('login-error').textContent = '';
  try {
    const response = await fetch('/api/login', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('password').value }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to sign in');
    // Keep owner credentials and the short-lived session in memory, never in cookies or browser storage.
    token = data.token; $('password').value = ''; showDashboard();
  } catch (error) { $('login-error').textContent = error.message; }
  finally { $('login-button').disabled = false; }
});
$('logout').addEventListener('click', logout);
$('range-form').addEventListener('submit', event => { event.preventDefault(); document.querySelectorAll('[data-days]').forEach(button => { button.classList.remove('selected'); button.setAttribute('aria-pressed', 'false'); }); load(); });
$('refresh').addEventListener('click', load);
document.querySelectorAll('[data-days]').forEach(button => button.addEventListener('click', () => { setRange(Number(button.dataset.days)); load(); }));
for (const [attribute, setMode, listId, getMode] of [
  ['location', value => locationMode = value, 'location-list', () => locationMode],
  ['platform', value => platformMode = value, 'platform-list', () => platformMode]
]) document.querySelectorAll(`[data-${attribute}]`).forEach(button => button.addEventListener('click', () => {
  setMode(button.dataset[attribute]);
  document.querySelectorAll(`[data-${attribute}]`).forEach(item => { const selected = item === button; item.classList.toggle('selected', selected); item.setAttribute('aria-pressed', selected); });
  list(listId, getMode());
}));
$('export').addEventListener('click', () => {
  if (!dataset) return;
  // Neutralize spreadsheet formulas even when a referrer or location begins with a formula character.
  const cell = value => '"' + String(value).replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""') + '"';
  const rows = [['Date (UTC)', 'Breakdown', 'Label', 'Page views / clicks', 'Daily unique visitors'], ...dataset.rows.map(row => [row.day, row.dimension, row.label, row.views, row.visitors])];
  const url = URL.createObjectURL(new Blob(['\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = el('a'); link.href = url; link.download = `sasha-analytics-${dataset.start}-${dataset.end}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('start').max = $('end').max = iso(new Date());
setInterval(() => { if (token && !document.hidden && !$('dashboard').hidden) load(); }, 60000);
