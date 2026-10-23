// Bridges to native iPhone features when the site runs inside the Capacitor app.
// On the website every helper falls back to the browser behavior, so it is safe to
// load everywhere.
(() => {
  "use strict";

  const PUBLIC_URL = "https://quadrinary.github.io/campgroundless/";
  const capacitor = window.Capacitor;
  const isNative = Boolean(capacitor?.isNativePlatform?.());

  function plugin(name) {
    if (!isNative) {
      return null;
    }
    try {
      return capacitor.Plugins?.[name] ?? capacitor.registerPlugin?.(name) ?? null;
    } catch {
      return null;
    }
  }

  // Links copied or shared from the app must open the public website, not the
  // app's private capacitor:// address.
  function publicUrl(href = window.location.href) {
    const url = new URL(href, window.location.href);
    if (!isNative) {
      return url.href;
    }
    const page = url.pathname.split("/").pop() || "";
    const target = new URL(page === "index.html" ? "" : page, PUBLIC_URL);
    target.search = url.search;
    target.hash = url.hash;
    return target.href;
  }

  async function openExternal(href) {
    const browser = plugin("Browser");
    if (browser) {
      try {
        await browser.open({ url: href, presentationStyle: "popover" });
        return;
      } catch (error) {
        console.warn("In-app browser unavailable.", error);
      }
    }
    window.open(href, "_blank", "noopener,noreferrer");
  }

  const impactStyles = { light: "LIGHT", medium: "MEDIUM", heavy: "HEAVY" };
  const notificationTypes = { success: "SUCCESS", warning: "WARNING", error: "ERROR" };
  function haptic(kind = "light") {
    const haptics = plugin("Haptics");
    if (!haptics) {
      return;
    }
    const call = notificationTypes[kind]
      ? haptics.notification({ type: notificationTypes[kind] })
      : kind === "selection"
        ? haptics.selectionChanged?.()
        : haptics.impact({ style: impactStyles[kind] ?? "LIGHT" });
    Promise.resolve(call).catch(() => {});
  }

  // Returns "shared", "dismissed" or "unavailable" so callers can fall back to copying.
  async function share({ title, text, url }) {
    const sharePlugin = plugin("Share");
    try {
      if (sharePlugin) {
        await sharePlugin.share({ title, text, url, dialogTitle: title });
        return "shared";
      }
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title, text, url });
        return "shared";
      }
    } catch (error) {
      const message = String(error?.message || error);
      if (error?.name === "AbortError" || /cancel/i.test(message)) {
        return "dismissed";
      }
      console.warn("Share sheet unavailable.", error);
    }
    return "unavailable";
  }

  // Saves a text file. The app hands it to the share sheet (Save to Files, AirDrop…);
  // the website downloads it. Returns "saved", "shared" or "dismissed".
  async function saveFile({ name, text, mimeType = "application/json", title = name }) {
    const fileSystem = plugin("Filesystem");
    const sharePlugin = plugin("Share");
    if (fileSystem && sharePlugin) {
      const { uri } = await fileSystem.writeFile({ path: name, data: text, directory: "CACHE", encoding: "utf8" });
      try {
        await sharePlugin.share({ title, files: [uri], dialogTitle: title });
        return "shared";
      } catch (error) {
        if (error?.name === "AbortError" || /cancel/i.test(String(error?.message || error))) return "dismissed";
        throw error;
      }
    }
    const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return "saved";
  }

  function syncStatusBar() {
    const statusBar = plugin("StatusBar");
    if (!statusBar) {
      return;
    }
    const dark = document.documentElement.dataset.theme === "dark";
    // "DARK" means light text, for dark backgrounds.
    Promise.resolve(statusBar.setStyle({ style: dark ? "DARK" : "LIGHT" })).catch(() => {});
  }

  // Routes Leaflet's navigator.geolocation calls through the native location
  // service so iOS shows one app-level permission prompt. Installed even when the
  // web view has no navigator.geolocation of its own (it is withheld from the
  // app's capacitor:// pages on some iOS versions).
  function installGeolocation() {
    const geolocation = plugin("Geolocation");
    if (!geolocation) {
      return;
    }
    const toError = (error) => {
      const message = String(error?.message || error || "Location unavailable");
      return {
        code: /denied|permission/i.test(message) ? 1 : /timeout/i.test(message) ? 3 : 2,
        message,
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };
    };
    const watches = new Map();
    let nextWatch = 1;
    const shim = {
      getCurrentPosition(success, failure, options = {}) {
        geolocation
          .getCurrentPosition({
            enableHighAccuracy: Boolean(options.enableHighAccuracy),
            timeout: options.timeout ?? 20000,
            maximumAge: options.maximumAge ?? 0,
          })
          .then((position) => success(position))
          .catch((error) => failure?.(toError(error)));
      },
      watchPosition(success, failure, options = {}) {
        const id = nextWatch++;
        Promise.resolve(
          geolocation.watchPosition(
            { enableHighAccuracy: Boolean(options.enableHighAccuracy), timeout: options.timeout ?? 20000 },
            (position, error) => (error ? failure?.(toError(error)) : position && success(position)),
          ),
        ).then((callbackId) => {
          if (watches.has(id)) {
            watches.set(id, callbackId);
          } else {
            geolocation.clearWatch({ id: callbackId }).catch?.(() => {});
          }
        });
        watches.set(id, null);
        return id;
      },
      clearWatch(id) {
        const callbackId = watches.get(id);
        watches.delete(id);
        if (callbackId) {
          Promise.resolve(geolocation.clearWatch({ id: callbackId })).catch(() => {});
        }
      },
    };
    try {
      Object.defineProperty(navigator, "geolocation", { configurable: true, value: shim });
    } catch {
      if (navigator.geolocation) {
        Object.assign(navigator.geolocation, shim);
      }
    }
  }

  if (isNative) {
    document.documentElement.classList.add("is-native");
    installGeolocation();
    document.addEventListener(
      "click",
      (event) => {
        const link = event.target.closest?.("a[href]");
        if (!link || event.defaultPrevented) {
          return;
        }
        const url = new URL(link.getAttribute("href"), window.location.href);
        if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") {
          event.preventDefault();
          if (url.protocol === "mailto:") {
            window.location.href = url.href;
          } else {
            void openExternal(url.href);
          }
        }
      },
      true,
    );
    syncStatusBar();
    new MutationObserver(syncStatusBar).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    document.addEventListener("DOMContentLoaded", () => {
      Promise.resolve(plugin("SplashScreen")?.hide?.()).catch(() => {});
      // Privacy copy is written for the website; the app keeps data on the device.
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (/\b(this|your) browser\b/i.test(node.nodeValue)) {
          node.nodeValue = node.nodeValue
            .replace(/\bthis browser\b/g, "this device")
            .replace(/\byour browser\b/g, "this app")
            .replace(/\bThis browser\b/g, "This device");
        }
      }
    });
  }

  window.CampgroundlessNative = Object.freeze({
    isNative,
    publicUrl,
    plugin,
    openExternal,
    haptic,
    share,
    saveFile,
  });
})();
