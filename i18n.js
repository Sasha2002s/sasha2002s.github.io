// i18n.js
// Requires i18next + i18next-http-backend + i18next-browser-languagedetector loaded before this file.

async function initI18n() {
  await i18next
    .use(i18nextHttpBackend)
    .use(i18nextBrowserLanguageDetector)
    .init({
      fallbackLng: "en",
      supportedLngs: ["en", "de", "ru", "uk"],
      debug: false,

      backend: {
        // Where translation files live
        loadPath: "/locales/{{lng}}/common.json"
      },

      detection: {
        order: ["localStorage", "navigator"],
        caches: ["localStorage"]
      },

      interpolation: {
        escapeValue: false
      }
    });

  // Apply translations on page
  applyTranslations();

  // Keep <html lang="..."> correct
  document.documentElement.lang = i18next.language;

  // Hook language buttons if present
  document.querySelectorAll("[data-set-lang]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const lng = btn.getAttribute("data-set-lang");
      await i18next.changeLanguage(lng);
      localStorage.setItem("i18nextLng", lng);
      document.documentElement.lang = lng;
      applyTranslations();
    });
  });
}

function applyTranslations() {
  // Translate elements: <span data-i18n="nav.home"></span>
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    el.textContent = i18next.t(key);
  });

  // Translate attributes: <a data-i18n-attr="href:links.cv;title:cta.download"></a>
  document.querySelectorAll("[data-i18n-attr]").forEach(el => {
    const raw = el.getAttribute("data-i18n-attr");
    raw.split(";").map(s => s.trim()).filter(Boolean).forEach(pair => {
      const [attr, key] = pair.split(":").map(s => s.trim());
      if (attr && key) el.setAttribute(attr, i18next.t(key));
    });
  });
}

document.addEventListener("DOMContentLoaded", initI18n);