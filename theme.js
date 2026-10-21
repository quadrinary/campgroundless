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
    // iOS reports the layout viewport minus the status bar although the page is drawn from y=0.
    const fitHeight = () => {
      const probe = document.createElement("div");
      probe.style.cssText = "position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top,0px)";
      document.body.append(probe);
      const inset = parseFloat(getComputedStyle(probe).paddingTop) || 0;
      probe.remove();
      const portraitHeight = Math.max(screen.width, screen.height);
      const missing = portraitHeight - innerHeight;
      if (innerHeight > innerWidth && inset > 0 && Math.abs(missing - inset) <= 2) {
        root.style.setProperty("--app-h", `${portraitHeight}px`);
      } else {
        root.style.removeProperty("--app-h");
      }
    };
    document.addEventListener("DOMContentLoaded", () => {
      fitHeight();
      window.dispatchEvent(new Event("resize"));
    });
    window.addEventListener("resize", fitHeight);
    window.addEventListener("orientationchange", fitHeight);
  }
  document.addEventListener("DOMContentLoaded", () => {
    if (!/[?&]diag=1/.test(location.search)) return;
    const box = document.createElement("pre");
    box.style.cssText = "position:fixed;left:0;right:0;bottom:90px;z-index:99999;margin:0;padding:8px;background:#fff;color:#000;font:11px/1.3 monospace;white-space:pre-wrap;filter:none";
    const lines = () => {
      const app = document.querySelector(".app")?.getBoundingClientRect();
      const meta = [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.content).join(",");
      const probe = document.createElement("div");
      probe.style.cssText = "position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top,0px)";
      document.body.append(probe);
      const inset = getComputedStyle(probe).paddingTop;
      probe.remove();
      box.textContent = [
        `nav.standalone=${window.navigator.standalone} class=${root.className}`,
        `theme=${root.dataset.theme}/${root.dataset.themeMode} osdark=${media.matches} cs=${getComputedStyle(root).colorScheme}`,
        `htmlBg=${getComputedStyle(root).backgroundColor} bodyBg=${getComputedStyle(document.body).backgroundColor}`,
        `meta=${meta} inset=${inset}`,
        `inner=${innerWidth}x${innerHeight} vv=${window.visualViewport?.width}x${window.visualViewport?.height} screen=${screen.width}x${screen.height}`,
        `app top=${app?.top} h=${app?.height} scrollY=${scrollY}`,
      ].join("\n");
    };
    document.body.append(box);
    lines();
    setTimeout(lines, 1500);
  });
  document.addEventListener("DOMContentLoaded", () => apply(root.dataset.themeMode));
  media.addEventListener("change", () => apply(root.dataset.themeMode));
  window.addEventListener("storage", (event) => {
    if (event.key === storageKey) {
      apply();
    }
  });

  window.CampgroundlessTheme = Object.freeze({ modes, apply });
})();
