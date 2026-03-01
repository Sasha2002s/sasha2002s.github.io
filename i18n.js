// i18n.js
// Requires i18next + i18next-http-backend + i18next-browser-languagedetector loaded before this file.

function getLocalesLoadPath() {
  // Build the locales path from i18n.js URL so translations work both on root domains
  // and when this site is deployed under a subpath (for example GitHub project pages).
  const i18nScript = Array.from(document.scripts).find(script =>
    /(?:^|\/)i18n\.js(?:$|\?)/.test(script.src || "")
  );

  if (i18nScript && i18nScript.src) {
    // Keep "{{lng}}" literal so i18next can interpolate it; URL() would percent-encode braces.
    const base = new URL(".", i18nScript.src).toString();
    return base.replace(/\/+$/, "/") + "locales/{{lng}}/common.json";
  }

  return "./locales/{{lng}}/common.json";
}

function normalizePathname(pathname) {
  return pathname
    .replace(/index\.html$/i, "")
    .replace(/\/+$/, "") || "/";
}

function initActiveNav() {
  const navLinks = document.querySelectorAll(".nav a[href]");
  if (!navLinks.length) return;

  const currentPath = normalizePathname(window.location.pathname);

  navLinks.forEach(link => {
    link.classList.remove("active");
    link.removeAttribute("aria-current");

    const href = link.getAttribute("href");
    if (!href) return;

    let targetPath = "";
    try {
      targetPath = normalizePathname(new URL(href, window.location.href).pathname);
    } catch (_error) {
      return;
    }

    if (targetPath === currentPath) {
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
    }
  });
}

async function initI18n() {
  if (!window.i18next || !window.i18nextHttpBackend || !window.i18nextBrowserLanguageDetector) {
    return;
  }

  await i18next
    .use(i18nextHttpBackend)
    .use(i18nextBrowserLanguageDetector)
    .init({
      fallbackLng: "en",
      supportedLngs: ["en", "de", "ru", "uk"],
      debug: false,

      backend: {
        loadPath: getLocalesLoadPath()
      },

      detection: {
        order: ["localStorage", "navigator"],
        caches: ["localStorage"]
      },

      interpolation: {
        escapeValue: false
      }
    });

  applyTranslations();
  document.documentElement.lang = i18next.language;
  initActiveNav();

  document.querySelectorAll("[data-set-lang]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const lng = btn.getAttribute("data-set-lang");
      if (!lng) return;

      await i18next.changeLanguage(lng);
      localStorage.setItem("i18nextLng", lng);
      document.documentElement.lang = lng;
      applyTranslations();
    });
  });
}

function applyTranslations() {
  // Translate plain text content for elements with data-i18n keys.
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    // Meta tags should be translated via attributes, not text nodes.
    if (el.tagName === "META") return;
    el.textContent = i18next.t(key);
  });

  // Supports both explicit "attr:key" pairs and backward-compatible "attr" only forms.
  // If only "attr" is provided, we reuse the element's data-i18n key.
  document.querySelectorAll("[data-i18n-attr]").forEach(el => {
    const raw = el.getAttribute("data-i18n-attr") || "";
    const defaultKey = el.getAttribute("data-i18n");

    raw
      .split(";")
      .map(part => part.trim())
      .filter(Boolean)
      .forEach(pair => {
        const [attrPart, keyPart] = pair.split(":").map(part => part.trim());
        const key = keyPart || defaultKey;
        if (attrPart && key) {
          el.setAttribute(attrPart, i18next.t(key));
        }
      });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // Keep active navigation highlighting available even if i18n libs fail to load.
  initActiveNav();
  initI18n();
});
