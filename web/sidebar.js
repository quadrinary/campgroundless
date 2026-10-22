(() => {
  const app = document.getElementById("app");
  const rail = document.getElementById("rail");
  const toggle = document.getElementById("rail-toggle");
  const panel = document.getElementById("view-panel");
  const title = document.getElementById("view-title");
  const closeButton = document.getElementById("view-close");
  const items = Array.from(document.querySelectorAll(".rail-item[data-view]"));
  const views = Array.from(document.querySelectorAll(".view"));
  const menuButton = document.getElementById("search-menu-button");
  let current = null;

  function refreshMap() {
    window.dispatchEvent(new Event("resize"));
  }

  function setExpanded(expanded) {
    app.classList.toggle("rail-expanded", expanded);
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute("aria-label", expanded ? "Collapse sidebar" : "Expand sidebar");
    if (menuButton) {
      menuButton.setAttribute("aria-expanded", String(expanded));
      menuButton.setAttribute("aria-label", expanded ? "Close menu" : "Open menu");
    }
  }

  function hide() {
    current = null;
    panel.hidden = true;
    app.classList.remove("panel-open");
    items.forEach((item) => {
      item.classList.remove("is-active");
      item.setAttribute("aria-expanded", "false");
    });
    refreshMap();
  }

  function show(name) {
    const view = document.getElementById(`view-${name}`);
    if (!view) return;
    current = name;
    if (window.matchMedia("(max-width: 800px)").matches) setExpanded(false);
    views.forEach((v) => {
      v.hidden = v !== view;
    });
    title.textContent = view.dataset.title;
    panel.hidden = false;
    app.classList.add("panel-open");
    items.forEach((item) => {
      const active = item.dataset.view === name;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-expanded", String(active));
    });
    refreshMap();
    window.dispatchEvent(new CustomEvent("campgroundless:viewshow", { detail: { name } }));
  }

  toggle.addEventListener("click", () => setExpanded(!app.classList.contains("rail-expanded")));
  if (menuButton) {
    menuButton.addEventListener("click", () => setExpanded(!app.classList.contains("rail-expanded")));
  }
  document.addEventListener("pointerdown", (event) => {
    if (
      app.classList.contains("rail-expanded") &&
      window.matchMedia("(max-width: 800px)").matches &&
      !rail.contains(event.target) &&
      !(menuButton && menuButton.contains(event.target))
    ) {
      setExpanded(false);
    }
  });
  items.forEach((item) =>
    item.addEventListener("click", () => {
      if (current === item.dataset.view) hide();
      else {
        show(item.dataset.view);
        title.focus();
      }
    })
  );
  closeButton.addEventListener("click", hide);
  document.querySelectorAll("[data-open-view]").forEach((el) =>
    el.addEventListener("click", () => show(el.dataset.openView))
  );
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && current && panel.contains(document.activeElement)) hide();
  });

  const mapEl = document.getElementById("map");
  if (mapEl && "ResizeObserver" in window) {
    new ResizeObserver(refreshMap).observe(mapEl);
  }

  window.CampgroundlessSidebar = { show, hide };
})();
