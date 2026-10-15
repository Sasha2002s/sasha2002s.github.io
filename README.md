# Sasha Portfolio

This repository contains my personal portfolio website hosted via GitHub Pages.

Live site:
https://sasha2002s.github.io

## Private portfolio analytics

The portfolio pages load `analytics.js` only on the published GitHub Pages origin. The script reports page views, file link clicks and outbound link clicks to a separate Cloudflare Worker. No cookies or browser storage are used. The [analytics notice](analytics-notice.html) explains the data shown to visitors.

The private dashboard is at https://sasha-portfolio-analytics.sasha2002s.workers.dev. The password is stored locally at `/Users/oleksandrstepanov/.codex/private/portfolio-analytics/dashboard-password.txt` and is not in this repository. The dashboard shows recorded visits only after you sign in. The backend and database are already deployed; visit tracking starts when the portfolio changes are published.

The dashboard reports estimated daily unique visitors, page views, approximate country and city, device type, operating system, browser, browser language, referring site, download clicks and outbound clicks. The same person may count again on another day or device. The live activity number covers the last five minutes. Location is an IP-based estimate, not GPS.

The Worker lives in `analytics/`. To maintain it, use Node.js and run `npm ci`, `npm test`, and `npm run build` there before `npm run deploy`. `wrangler.jsonc` holds the D1 binding; `migrations/` holds the schema. The Cloudflare account must already be authenticated in Wrangler. `ADMIN_PASSWORD` and `AUTH_SECRET` are Worker secrets; never add them to Git. Local copies are kept in `/Users/oleksandrstepanov/.codex/private/portfolio-analytics/`. The Worker runs daily cleanup shortly after UTC midnight, removing temporary identifiers and salts from the active database, and removes aggregates after 400 days. Cloudflare's account-wide free usage limits apply.
