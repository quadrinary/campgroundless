(() => {
  "use strict";

  const storageKey = "campgroundless.settings.v1";
  const modes = ["auto", "light", "dark"];
  const themeColors = { light: "#f5f4ef", dark: "#1d1e1a" };
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const root = document.documentElement;

  function savedMode() {
    try {
      const theme = JSON.parse(localStorage.getItem(storageKey) || "{}").theme;
      return modes.includes(theme) ? theme : "auto";
    } catch {
      return "auto";
    }
  }

  function apply(mode = savedMode()) {
    const resolved = mode === "dark" || (mode === "auto" && media.matches) ? "dark" : "light";
    root.dataset.theme = resolved;
    root.dataset.themeMode = mode;
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.setAttribute("content", themeColors[resolved]);
    });
    return resolved;
  }

  apply();
  if (window.navigator.standalone || window.matchMedia("(display-mode: standalone)").matches) {
    root.classList.add("is-standalone");
  }
  document.addEventListener("DOMContentLoaded", () => apply(root.dataset.themeMode));
  media.addEventListener("change", () => apply(root.dataset.themeMode));
  window.addEventListener("storage", (event) => {
    if (event.key === storageKey) {
      apply();
    }
  });

  window.CampgroundlessTheme = Object.freeze({ modes, apply });
})();
