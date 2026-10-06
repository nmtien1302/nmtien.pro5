/* ============================================================
 *  theme.js — chế độ sáng / tối + icon biến hình (dùng chung cho index và admin)
 *  Nạp ngay trong <head> (sau config.js) để trang không bị "nháy" màu khi mở.
 * ============================================================ */
window.SiteTheme = (() => {
  "use strict";

  const cfg = (window.SITE_CONFIG || {}).theme || {};
  const KEY = "theme-mode";
  const root = document.documentElement;
  const VARS = {
    leather: "--leather", glow: "--glow", paper: "--paper", paper2: "--paper-2", ink: "--ink", muted: "--muted",
    accent: "--accent", accent2: "--accent-2", gold: "--gold", onAccent: "--on-accent", onAccent2: "--on-accent-2",
  };
  const isColor = (c) => typeof c === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.trim());

  const stored = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

  function resolve() {
    const s = stored();
    if (s === "light" || s === "dark") return s;
    if (cfg.default === "light" || cfg.default === "dark") return cfg.default;
    return systemDark() ? "dark" : "light";
  }

  function apply(mode) {
    root.dataset.theme = mode;
    const set = cfg[mode] || {};
    for (const [key, cssVar] of Object.entries(VARS)) {
      if (isColor(set[key])) root.style.setProperty(cssVar, set[key].trim());
      else root.style.removeProperty(cssVar);
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = isColor(set.leather) ? set.leather.trim() : mode === "dark" ? "#170f12" : "#371e13";
    document.dispatchEvent(new CustomEvent("themechange", { detail: mode }));
  }

  function toggle() {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem(KEY, next); } catch { /* bỏ qua */ }
    apply(next);
    return next;
  }

  /* ---------- icon biến hình (morphicons, thư viện nằm sẵn trong js/vendor/) ---------- */
  const scriptUrl = (document.currentScript && document.currentScript.src) || location.href;
  const morphLib = import(new URL("vendor/morphicons.js", scriptUrl).href).catch(() => null);
  const nodeOf = (name) => (window.ICON_PATHS || {})[name] || null;
  const dOf = (name) => { const n = nodeOf(name); return n ? n.map((p) => p[1].d).join(" ") : ""; };

  /** Biến 1 thẻ <path> thành icon có thể đổi hình: mi.set("player-pause") → biến hình mượt */
  function makeMorphIcon(pathEl, name) {
    let current = name;
    let morph = null;
    pathEl.setAttribute("d", dOf(name));
    morphLib.then((lib) => {
      if (!lib || !nodeOf(current)) return;
      try { morph = lib.createMorph(pathEl, nodeOf(current), { reducedMotion: "user" }); } catch { morph = null; }
    });
    return {
      get name() { return current; },
      set(next) {
        if (next === current) return;
        current = next;
        if (morph && nodeOf(next)) morph.morphTo(nodeOf(next), "snappy");
        else pathEl.setAttribute("d", dOf(next));
      },
    };
  }

  /** Gắn nút chuyển sáng / tối (icon trăng ↔ mặt trời) */
  function bindToggle(btn) {
    if (!btn) return;
    if (cfg.toggle === false) { btn.remove(); return; }
    const icon = makeMorphIcon(btn.querySelector("path"), root.dataset.theme === "dark" ? "sun" : "moon");
    const label = () => {
      const dark = root.dataset.theme === "dark";
      btn.setAttribute("aria-label", dark ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối");
      btn.title = dark ? "Chế độ sáng" : "Chế độ tối";
    };
    label();
    btn.addEventListener("click", toggle);
    document.addEventListener("themechange", (e) => { icon.set(e.detail === "dark" ? "sun" : "moon"); label(); });
  }

  // Theo cài đặt máy nếu người xem chưa tự chọn
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (!stored()) apply(resolve()); });
  apply(resolve());

  return { apply, toggle, current: () => root.dataset.theme, makeMorphIcon, bindToggle, dOf };
})();
