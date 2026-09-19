document.addEventListener("DOMContentLoaded", () => {
  const tabs = Array.from(document.querySelectorAll("[data-tab-target]"));
  const panels = Array.from(document.querySelectorAll(".tab-panel"));
  const searchInput = document.querySelector("#asset-search");
  const assetCards = Array.from(document.querySelectorAll("[data-asset-card]"));
  const resultCount = document.querySelector("[data-result-count]");
  const emptyState = document.querySelector("#asset-empty-state");

  function showPanel(selectedTab) {
    const targetId = selectedTab.dataset.tabTarget;

    // Keep visible content and accessibility state synchronized for mouse and keyboard users.
    tabs.forEach(tab => {
      const isSelected = tab === selectedTab;
      tab.setAttribute("aria-selected", String(isSelected));
      tab.tabIndex = isSelected ? 0 : -1;
    });

    panels.forEach(panel => {
      panel.hidden = panel.id !== targetId;
    });

    // Preserve the selected view in the URL without adding a browser history entry.
    const nextHash = targetId === "photos-panel" ? "photos" : "assets";
    window.history.replaceState(null, "", `#${nextHash}`);
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => showPanel(tab));

    tab.addEventListener("keydown", event => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = (index + direction + tabs.length) % tabs.length;
      tabs[nextIndex].focus();
      showPanel(tabs[nextIndex]);
    });
  });

  function filterAssets() {
    const query = (searchInput?.value || "").trim().toLocaleLowerCase();
    let visibleCount = 0;

    assetCards.forEach(card => {
      // Include translated visible copy as well as multilingual keywords in search matching.
      const searchableText = `${card.dataset.search || ""} ${card.textContent || ""}`.toLocaleLowerCase();
      const matches = searchableText.includes(query);
      card.hidden = !matches;
      if (matches) visibleCount += 1;
    });

    if (resultCount) resultCount.textContent = String(visibleCount);
    if (emptyState) emptyState.hidden = visibleCount !== 0;
  }

  searchInput?.addEventListener("input", filterAssets);

  // Allow direct links to either view while keeping free assets as the default.
  const initialTab = window.location.hash === "#photos"
    ? tabs.find(tab => tab.dataset.tabTarget === "photos-panel")
    : tabs.find(tab => tab.dataset.tabTarget === "assets-panel");

  if (initialTab) showPanel(initialTab);
  filterAssets();
});
