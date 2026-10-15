(() => {
  'use strict';
  // Only the public portfolio is measured, so development previews do not inflate the totals.
  if (location.origin !== 'https://sasha2002s.github.io' || navigator.globalPrivacyControl || navigator.doNotTrack === '1') return;
  const script = document.currentScript;
  const endpoint = script?.dataset.endpoint;
  if (!endpoint || !endpoint.startsWith('https://')) return;
  const referrer = (() => { try { return new URL(document.referrer).origin; } catch { return ''; } })();
  function send(type, target) {
    // Never transmit query strings, fragments, page text, GPS, or persistent identifiers.
    const payload = JSON.stringify({ type, path: location.pathname, referrer, language: (navigator.language || '').split('-')[0], ...(target ? { target } : {}) });
    fetch(endpoint, { method: 'POST', body: payload, headers: { 'Content-Type': 'text/plain' }, credentials: 'omit', keepalive: true, referrerPolicy: 'no-referrer' }).catch(() => {});
  }
  let counted = false;
  function pageview() {
    if (counted || document.visibilityState !== 'visible') return;
    counted = true;
    send('pageview');
  }
  pageview();
  document.addEventListener('visibilitychange', pageview);
  // BFCache restores are real page visits, while prerendered background tabs wait for visibility.
  window.addEventListener('pageshow', event => { if (event.persisted) { counted = false; pageview(); } });
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link || !event.isTrusted) return;
    let url;
    try { url = new URL(link.href); } catch { return; }
    if (!['https:', 'http:'].includes(url.protocol)) return;
    if (link.hasAttribute('download') || /\.(pdf|zip|blend)$/i.test(url.pathname)) send('download', url.origin + url.pathname);
    else if (url.origin !== location.origin) send('outbound', url.origin);
  });
})();
