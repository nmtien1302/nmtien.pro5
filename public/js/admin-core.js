/* ============================================================
 *  admin-core.js — đồ nghề dùng chung cho trang /admin
 *  Gọi API, tải file lên (có tiến độ), hộp thoại, xử lý ảnh (xoay theo EXIF, thu nhỏ, WebP),
 *  kéo-thả sắp xếp bằng Pointer Events, nghe thử nhạc, theo dõi "chưa lưu".
 *  Tạo window.AdminKit — các file admin-*.js khác dùng lại.
 * ============================================================ */
window.AdminKit = (() => {
  "use strict";

  const SPRITE = "assets/icons/sprite.svg";
  const TOKEN_KEY = "admin-token";
  const MAX_CONTENT_BYTES = 512 * 1024;
  const bus = new EventTarget();

  /* ============================================================
   *  1. DOM nhỏ gọn
   * ============================================================ */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /** h("button", { class, text, onclick, "aria-label": … }, ...con) → phần tử. Chuỗi con luôn là text (an toàn). */
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (value === undefined || value === null || value === false) continue;
        if (key === "class") el.className = value;
        else if (key === "text") el.textContent = value;
        else if (key === "dataset") Object.assign(el.dataset, value);
        else if (key === "style" && typeof value === "object") Object.assign(el.style, value);
        else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
        else if (key in el && typeof value !== "string") el[key] = value; // hidden, disabled, checked, value số…
        else if (key === "value") el.value = value;
        else el.setAttribute(key, value === true ? "" : String(value));
      }
    }
    append(el, children);
    return el;
  }
  function append(el, children) {
    for (const c of children) {
      if (c === null || c === undefined || c === false) continue;
      if (Array.isArray(c)) append(el, c);
      else el.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  /* ---------- icon: bộ sprite có sẵn + vài nét vẽ Tabler (MIT) không có trong sprite ---------- */
  const LOCAL_ICONS = {
    plus: '<path d="M12 5l0 14"/><path d="M5 12l14 0"/>',
    "arrow-up": '<path d="M12 5l0 14"/><path d="M18 11l-6 -6"/><path d="M6 11l6 -6"/>',
    "arrow-down": '<path d="M12 5l0 14"/><path d="M18 13l-6 6"/><path d="M6 13l6 6"/>',
    "chevron-left": '<path d="M15 6l-6 6l6 6"/>',
    "chevron-right": '<path d="M9 6l6 6l-6 6"/>',
    grip: '<path d="M9 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M9 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M9 19m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M15 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M15 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M15 19m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/>',
    copy: '<path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z"/><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1"/>',
    upload: '<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"/><path d="M7 9l5 -5l5 5"/><path d="M12 4l0 12"/>',
    photo: '<path d="M15 8h.01"/><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z"/><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5"/><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3"/>',
    "align-left": '<path d="M4 6l16 0"/><path d="M4 12l10 0"/><path d="M4 18l14 0"/>',
    "align-center": '<path d="M4 6l16 0"/><path d="M8 12l8 0"/><path d="M6 18l12 0"/>',
    "align-right": '<path d="M4 6l16 0"/><path d="M10 12l10 0"/><path d="M6 18l14 0"/>',
    "align-justified": '<path d="M4 6l16 0"/><path d="M4 12l16 0"/><path d="M4 18l12 0"/>',
    bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7h-6z"/><path d="M13 12h1a3.5 3.5 0 0 1 0 7h-7v-7"/>',
    italic: '<path d="M11 5l6 0"/><path d="M7 19l6 0"/><path d="M14 5l-4 14"/>',
    underline: '<path d="M7 5v5a5 5 0 0 0 10 0v-5"/><path d="M5 19h14"/>',
    list: '<path d="M9 6l11 0"/><path d="M9 12l11 0"/><path d="M9 18l11 0"/><path d="M5 6l0 .01"/><path d="M5 12l0 .01"/><path d="M5 18l0 .01"/>',
    "image-left": '<path d="M4 6h6v6h-6z"/><path d="M14 7h6"/><path d="M14 11h6"/><path d="M4 16h16"/>',
    "image-center": '<path d="M9 5h6v6h-6z"/><path d="M4 15h16"/><path d="M4 19h16"/>',
    "image-right": '<path d="M14 6h6v6h-6z"/><path d="M4 7h6"/><path d="M4 11h6"/><path d="M4 16h16"/>',
    "zoom-in": '<path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/><path d="M7 10l6 0"/><path d="M10 7l0 6"/><path d="M21 21l-6 -6"/>',
    "zoom-out": '<path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/><path d="M7 10l6 0"/><path d="M21 21l-6 -6"/>',
    restore: '<path d="M9 14l-4 -4l4 -4"/><path d="M5 10h11a4 4 0 1 1 0 8h-1"/>',
    pencil: '<path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4"/><path d="M13.5 6.5l4 4"/>',
    alert: '<path d="M12 9v4"/><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z"/><path d="M12 16h.01"/>',
    file: '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z"/>',
    "player-stop": '<path d="M5 7a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z"/>',
    // các loại khối của trang sách
    "blk-heading": '<path d="M7 12h10"/><path d="M7 5v14"/><path d="M17 5v14"/><path d="M15 19h4"/><path d="M15 5h4"/><path d="M5 19h4"/><path d="M5 5h4"/>',
    "blk-text": '<path d="M13 4v16"/><path d="M17 4v16"/><path d="M19 4h-9.5a4.5 4.5 0 0 0 0 9h3.5"/>',
    "blk-gallery": '<path d="M4 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"/><path d="M14 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"/><path d="M4 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"/><path d="M14 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"/>',
    "blk-quote": '<path d="M10 11h-4a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1h3a1 1 0 0 1 1 1v6c0 2.667 -1.333 4.333 -4 5"/><path d="M19 11h-4a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1h3a1 1 0 0 1 1 1v6c0 2.667 -1.333 4.333 -4 5"/>',
    "blk-divider": '<path d="M3 12l0 .01"/><path d="M7 12l10 0"/><path d="M21 12l0 .01"/>',
    "blk-spacer": '<path d="M8 7l4 -4l4 4"/><path d="M8 17l4 4l4 -4"/><path d="M12 3l0 18"/>',
  };
  const SPRITE_ICONS = new Set(("player-play player-pause player-skip-back player-skip-forward volume volume-2 volume-off headphones " +
    "chevron-down chevron-up x check send mail mail-opened moon sun spy lock login logout refresh arrow-left trash eye music " +
    "playlist home heart sparkles star link world at phone paw cat").split(" "));

  /** icon("trash") → <svg class="icon"> (nét vẽ cố định, không chứa dữ liệu người dùng) */
  function icon(name, cls = "") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", `icon ${cls}`.trim());
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    if (Object.prototype.hasOwnProperty.call(LOCAL_ICONS, name)) svg.innerHTML = LOCAL_ICONS[name];
    else if (SPRITE_ICONS.has(name)) {
      const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", `${SPRITE}#tabler-${name}`);
      svg.appendChild(use);
    }
    return svg;
  }

  /* ============================================================
   *  2. Tiện ích
   * ============================================================ */
  let uidN = 0;
  const uid = (prefix = "u") => `${prefix}${Date.now().toString(36)}${(++uidN).toString(36)}`;
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const hasOwn = (o, k) => o !== null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const str = (v) => (typeof v === "string" ? v.trim() : "");

  function debounce(fn, ms) {
    let t = 0;
    const d = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
    d.flush = (...args) => { clearTimeout(t); fn(...args); };
    d.cancel = () => clearTimeout(t);
    return d;
  }

  const nf1 = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
  function fmtBytes(n) {
    const b = Number(n) || 0;
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${nf1.format(b / 1024)} KB`;
    if (b < 1024 * 1024 * 1024) return `${nf1.format(b / 1024 / 1024)} MB`;
    return `${nf1.format(b / 1024 / 1024 / 1024)} GB`;
  }
  function fmtDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
  }
  const byteLength = (s) => new TextEncoder().encode(s).length;

  // Phần tên file không có đuôi
  const baseName = (name) => String(name || "").replace(/\.[^./\\]{1,6}$/, "").trim();

  /* ---------- toast (dùng lại #toast của style.css) ---------- */
  let toastTimer = 0;
  function toast(message, type = "") {
    const el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.className = `toast show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), type === "error" ? 5200 : 3200);
  }

  /* ---------- sự kiện nội bộ ---------- */
  const on = (name, fn) => bus.addEventListener(name, (e) => fn(e.detail));
  const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

  /* ============================================================
   *  3. Token đăng nhập — "Ghi nhớ" → localStorage, không thì sessionStorage
   * ============================================================ */
  function readStore(storage) { try { return storage.getItem(TOKEN_KEY) || ""; } catch { return ""; } }
  function writeStore(storage, value) {
    try { value ? storage.setItem(TOKEN_KEY, value) : storage.removeItem(TOKEN_KEY); } catch { /* bỏ qua */ }
  }
  const auth = {
    token: readStore(window.localStorage) || readStore(window.sessionStorage),
    set(token, remember) {
      this.token = token || "";
      writeStore(window.localStorage, "");
      writeStore(window.sessionStorage, "");
      if (token) writeStore(remember ? window.localStorage : window.sessionStorage, token);
    },
    clear() { this.set(""); },
  };

  function httpError(message, status) {
    const err = new Error(message);
    err.status = status;
    return err;
  }

  /* Phiên hết hạn ở bất cứ đâu → về màn hình đăng nhập (admin.js lắng nghe "unauthorized") */
  let unauthorizedSent = false;
  function unauthorized(message) {
    auth.clear();
    if (unauthorizedSent) return;
    unauthorizedSent = true;
    setTimeout(() => { unauthorizedSent = false; }, 500);
    emit("unauthorized", message || "Phiên đăng nhập đã hết hạn, hãy đăng nhập lại");
  }

  /** api("/api/admin/media", { method, json }) → dữ liệu JSON; lỗi → Error có .status */
  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    let body = options.body;
    if (options.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.json);
    } else if (body !== undefined && typeof body === "string") {
      headers["Content-Type"] = "application/json";
    }
    if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
    let res;
    try {
      res = await fetch(path, { method: options.method || "GET", headers, body, cache: "no-store" });
    } catch {
      throw httpError("Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.", 0);
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !path.endsWith("/login")) {
      unauthorized(data.error);
      throw httpError(data.error || "Phiên đăng nhập đã hết hạn, hãy đăng nhập lại", 401);
    }
    if (!res.ok) {
      if ([404, 405, 501].includes(res.status) && !data.error) {
        throw httpError("Trang đang mở không qua server.js (VD Live Server) nên không dùng được. Hãy chạy `node server.js` rồi mở http://localhost:3000/admin", res.status);
      }
      throw httpError(data.error || `Lỗi ${res.status}`, res.status);
    }
    return data;
  }

  /* ---------- giới hạn tải lên (byte) — cập nhật từ GET /api/admin/me ---------- */
  const limits = { image: 10 * 1024 * 1024, audio: 30 * 1024 * 1024 };
  const tooBigMessage = (kind, size) =>
    `${kind === "audio" ? "File nhạc" : "Ảnh"} quá lớn (${fmtBytes(size)}) — tối đa ${fmtBytes(limits[kind])}`;

  /** Cập nhật giới hạn từ dữ liệu GET /api/admin/me (byte) */
  function setLimits(me) {
    const l = me && me.limits;
    if (!l) return;
    if (Number(l.image) > 0) limits.image = Number(l.image);
    if (Number(l.audio) > 0) limits.audio = Number(l.audio);
  }

  /* Dò loại file theo byte đầu — CÙNG bảng với server (server.js sniffMedia) để báo lỗi ngay,
   * khỏi gửi cả file rồi mới bị từ chối (server đóng kết nối sớm, trình duyệt chỉ thấy "lỗi mạng"). */
  const M4A_BRANDS = new Set(["M4A ", "M4B ", "mp42", "isom", "iso2", "mp41", "dash"]);
  const UNSUPPORTED = "Định dạng file không được hỗ trợ. Ảnh: JPG, PNG, GIF, WebP, AVIF. Nhạc: MP3, M4A, AAC, OGG, WAV, FLAC, WebM.";
  function sniffMedia(b) {
    const at = (off, t) => b.length >= off + t.length && Array.from(t).every((c, i) => b[off + i] === c.charCodeAt(0));
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image";
    if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x)) return "image";
    if (at(0, "GIF87a") || at(0, "GIF89a")) return "image";
    if (at(0, "RIFF") && at(8, "WEBP")) return "image";
    if (at(0, "RIFF") && at(8, "WAVE")) return "audio";
    if (at(4, "ftyp") && b.length >= 12) {
      const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
      if (brand === "avif" || brand === "avis") return "image";
      return M4A_BRANDS.has(brand) ? "audio" : "";
    }
    if (at(0, "OggS") || at(0, "fLaC") || at(0, "ID3")) return "audio";
    if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "audio";
    if (b.length >= 2 && b[0] === 0xff && ((b[1] & 0xf6) === 0xf0 || (b[1] & 0xe0) === 0xe0)) return "audio";
    return "";
  }

  /** upload(blob, { kind, name, onProgress }) → { promise: Promise<Media>, abort() }
   *  Gửi thẳng byte của file (không multipart), theo dõi tiến độ bằng XMLHttpRequest. */
  function upload(blob, { kind, name, onProgress } = {}) {
    let xhr = null;
    let cancelled = false;
    const abortError = () => { const err = httpError("Đã huỷ tải lên", 0); err.name = "AbortError"; return err; };
    const promise = new Promise((resolve, reject) => {
      (async () => {
        if (kind !== "image" && kind !== "audio") throw httpError("Loại file không hợp lệ", 400);
        if (!blob || !blob.size) throw httpError("File rỗng, không có gì để tải lên", 400);
        if (blob.size > limits[kind]) throw httpError(tooBigMessage(kind, blob.size), 413);
        const found = sniffMedia(new Uint8Array(await blob.slice(0, 16).arrayBuffer()));
        if (!found) throw httpError(UNSUPPORTED, 415);
        if (found !== kind) throw httpError(kind === "image" ? "File này không phải ảnh" : "File này không phải file nhạc", 415);
        if (cancelled) throw abortError();
        xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/admin/upload?kind=${kind}`);
        if (auth.token) xhr.setRequestHeader("Authorization", `Bearer ${auth.token}`);
        xhr.setRequestHeader("X-File-Name", encodeURIComponent(String(name || blob.name || "").slice(0, 200)));
        xhr.setRequestHeader("Content-Type", blob.type || "application/octet-stream");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) onProgress(Math.min(1, e.loaded / e.total));
        };
        xhr.onload = () => {
          let data = {};
          try { data = JSON.parse(xhr.responseText || "{}"); } catch { /* không phải JSON */ }
          if (xhr.status === 201 || xhr.status === 200) {
            if (data.media && data.media.url) return resolve(data.media);
            return reject(httpError("Máy chủ trả về dữ liệu lạ", xhr.status));
          }
          if (xhr.status === 401) {
            unauthorized(data.error);
            return reject(httpError(data.error || "Phiên đăng nhập đã hết hạn", 401));
          }
          reject(httpError(data.error || `Tải lên thất bại (lỗi ${xhr.status})`, xhr.status));
        };
        // Server từ chối giữa chừng (quá lớn, hết phiên…) thì đóng kết nối sớm → trình duyệt chỉ báo "lỗi mạng".
        // Hỏi lại /me để biết lý do thật: hết phiên → về đăng nhập; giới hạn nhỏ hơn → báo file quá lớn.
        xhr.onerror = async () => {
          try {
            setLimits(await api("/api/admin/me"));
          } catch (err) {
            if (err.status === 401) return reject(httpError(err.message, 401));
          }
          if (blob.size > limits[kind]) return reject(httpError(tooBigMessage(kind, blob.size), 413));
          reject(httpError("Mất kết nối khi tải lên, hãy thử lại", 0));
        };
        xhr.onabort = () => reject(abortError());
        if (onProgress) onProgress(0);
        xhr.send(blob);
      })().catch(reject);
    });
    return {
      promise,
      abort() {
        if (cancelled) return;
        cancelled = true;
        if (xhr) xhr.abort();
      },
    };
  }

  /* ============================================================
   *  4. Nội dung trang (content) — đọc 1 lần, lưu theo từng mục
   * ============================================================ */
  const state = {
    config: window.SITE_CONFIG || {},
    content: null,
    loaded: false,
  };

  async function loadContent() {
    const data = await api("/api/content");
    state.content = data.content || null;
    state.loaded = true;
    emit("content", state.content);
    return state.content;
  }

  /** saveContent({ songs }) → content đã chuẩn hoá (cả tài liệu). Mỗi mục được thay nguyên khối; null = xoá. */
  async function saveContent(changes) {
    const body = JSON.stringify(changes);
    if (byteLength(body) > MAX_CONTENT_BYTES) {
      throw httpError(`Nội dung quá lớn (${fmtBytes(byteLength(body))}, tối đa 512 KB) — hãy bớt chữ hoặc chia bớt trang`, 413);
    }
    const data = await api("/api/admin/content", { method: "PUT", body });
    state.content = data.content || null;
    emit("saved", { content: state.content, sections: Object.keys(changes) });
    return state.content;
  }

  /* ============================================================
   *  5. Các mục (tab) — đăng ký để theo dõi "chưa lưu"
   * ============================================================ */
  const tabs = new Map();
  let activeTab = "";
  function registerTab(id, def) { tabs.set(id, def); }
  function anyDirty() {
    for (const t of tabs.values()) if ((t.isDirty && t.isDirty()) || (t.busy && t.busy())) return true;
    return false;
  }
  const refreshDirty = debounce(() => emit("dirty"), 60);

  /** Gắn thanh lưu (savebar) của 1 mục: trạng thái + nút Lưu / Huỷ thay đổi */
  function bindSavebar(id, { save, discard, isDirty, busy }) {
    const bar = $(`[data-savebar="${id}"]`);
    if (!bar) return () => {};
    const status = $(".savebar-status", bar);
    const saveBtn = $('[data-act="save"]', bar);
    const discardBtn = $('[data-act="discard"]', bar);
    let saving = false;
    const update = () => {
      const dirty = isDirty();
      const working = busy ? busy() : 0;
      bar.classList.toggle("is-dirty", dirty);
      bar.classList.toggle("is-busy", saving || working > 0);
      status.textContent = saving ? "Đang lưu…" : working ? `Đang tải lên ${working} tệp…` : dirty ? "Có thay đổi chưa lưu" : "Mọi thay đổi đã được lưu";
      saveBtn.disabled = saving || !dirty || working > 0;
      discardBtn.disabled = saving || !dirty;
    };
    saveBtn.addEventListener("click", async () => {
      if (saving) return;
      saving = true;
      update();
      try { await save(); } finally { saving = false; update(); refreshDirty(); }
    });
    discardBtn.addEventListener("click", async () => {
      const ok = await dialog.confirm({
        title: "Huỷ thay đổi?",
        message: "Mọi chỉnh sửa chưa lưu ở mục này sẽ mất, nội dung quay về bản đã lưu gần nhất.",
        ok: "Huỷ thay đổi", cancel: "Giữ lại", danger: true,
      });
      if (ok) { discard(); refreshDirty(); }
    });
    on("dirty", update);
    update();
    return update;
  }

  /* ============================================================
   *  6. Hộp thoại (dùng .modal-overlay / .modal-box của style.css)
   * ============================================================ */
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  const dialog = {
    /** open({ title, body, buttons:[{label, value, kind}], className, initial, onOpen, dismiss }) → Promise<value> */
    open(opts) {
      return new Promise((resolve) => {
        const prevFocus = document.activeElement;
        const titleId = uid("dlg");
        const box = h("div", { class: `modal-box dialog-box ${opts.className || ""}`.trim(), tabindex: "-1" });
        const overlay = h("div", { class: "modal-overlay admin-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": titleId }, box);
        box.append(
          h("div", { class: "frame", "aria-hidden": "true" }, h("i", { text: "✦" }), h("i", { text: "✦" }), h("i", { text: "✦" }), h("i", { text: "✦" })),
          h("h2", { id: titleId, text: opts.title || "" }),
        );
        const bodyWrap = h("div", { class: "dialog-body" });
        if (typeof opts.body === "string") bodyWrap.appendChild(h("p", { text: opts.body }));
        else if (opts.body) bodyWrap.appendChild(opts.body);
        box.appendChild(bodyWrap);
        let done = false;
        const close = (value) => {
          if (done) return;
          done = true;
          document.removeEventListener("keydown", onKey, true);
          overlay.classList.remove("show");
          setTimeout(() => overlay.remove(), 260);
          if (prevFocus && prevFocus.isConnected && typeof prevFocus.focus === "function") {
            try { prevFocus.focus({ preventScroll: true }); } catch { /* bỏ qua */ }
          }
          resolve(value);
        };
        const actions = h("div", { class: "actions dialog-actions" });
        for (const b of opts.buttons || []) {
          const cls = b.kind === "primary" ? "btn btn-primary" : b.kind === "danger" ? "btn btn-danger-solid" : "btn btn-ghost";
          const btn = h("button", { class: cls, type: "button" }, b.icon ? icon(b.icon) : null, b.label);
          btn.addEventListener("click", () => {
            if (b.validate && !b.validate()) return;
            close(typeof b.value === "function" ? b.value() : b.value);
          });
          actions.appendChild(btn);
        }
        if ((opts.buttons || []).length) box.appendChild(actions);
        const dismiss = Object.prototype.hasOwnProperty.call(opts, "dismiss") ? opts.dismiss : null;
        function onKey(e) {
          if (overlay !== $$(".admin-dialog").pop()) return; // chỉ hộp thoại trên cùng nhận phím
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(dismiss); return; }
          if (e.key === "Tab") {
            const items = $$(FOCUSABLE, box).filter((x) => x.offsetParent !== null || x === document.activeElement);
            if (!items.length) { e.preventDefault(); return; }
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && (document.activeElement === last || !box.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
          }
        }
        overlay.addEventListener("pointerdown", (e) => { if (e.target === overlay) overlay.dataset.downOutside = "1"; });
        overlay.addEventListener("click", (e) => {
          if (e.target === overlay && overlay.dataset.downOutside === "1") close(dismiss);
          delete overlay.dataset.downOutside;
        });
        document.addEventListener("keydown", onKey, true);
        document.body.appendChild(overlay);
        // hiện ngay (không chờ hiệu ứng) để focus được liền
        overlay.style.transition = "opacity 0.25s ease, visibility 0s";
        void overlay.offsetWidth;
        overlay.classList.add("show");
        const api_ = { close, box, overlay };
        if (opts.onOpen) opts.onOpen(api_);
        const target = (opts.initial && $(opts.initial, box)) || $(".btn-primary, .btn-danger-solid", actions) || $(FOCUSABLE, box) || box;
        try { target.focus({ preventScroll: true }); } catch { target.focus(); }
      });
    },

    confirm({ title, message, ok = "Đồng ý", cancel = "Huỷ", danger = false }) {
      return dialog.open({
        title,
        body: message,
        dismiss: false,
        buttons: [
          { label: cancel, value: false, kind: "ghost" },
          { label: ok, value: true, kind: danger ? "danger" : "primary" },
        ],
      });
    },

    /** choose({ title, message, choices:[{label, value, kind}] }) → value | null */
    choose({ title, message, choices }) {
      return dialog.open({ title, body: message, dismiss: null, buttons: choices });
    },
  };

  /* ============================================================
   *  7. Ảnh: nhận diện, đọc (xoay theo EXIF), thu nhỏ, mã hoá WebP / JPEG
   * ============================================================ */
  async function headBytes(blob, n) {
    return new Uint8Array(await blob.slice(0, n).arrayBuffer());
  }
  function sniffImage(b) {
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
    if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
    if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
    if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
    if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
      const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
      if (brand === "avif" || brand === "avis") return "image/avif";
      if (/^(heic|heix|hevc|mif1|msf1)$/.test(brand)) return "image/heic";
    }
    if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d) return "image/bmp";
    return "";
  }
  async function sniffFile(blob) { return sniffImage(await headBytes(blob, 16)); }

  /** GIF có từ 2 khung hình trở lên → ảnh động */
  async function isAnimatedGif(blob) {
    const b = new Uint8Array(await blob.arrayBuffer());
    if (sniffImage(b) !== "image/gif" || b.length < 13) return false;
    let p = 13;
    if (b[10] & 0x80) p += 3 * (1 << ((b[10] & 7) + 1)); // bảng màu chung
    let frames = 0;
    const skipSubBlocks = () => {
      while (p < b.length) {
        const n = b[p++];
        if (n === 0) return;
        p += n;
      }
    };
    while (p < b.length) {
      const tag = b[p++];
      if (tag === 0x3b) break; // kết thúc
      if (tag === 0x21) { p++; skipSubBlocks(); continue; } // phần mở rộng
      if (tag === 0x2c) { // một khung hình
        if (++frames > 1) return true;
        const packed = b[p + 8];
        p += 9;
        if (packed & 0x80) p += 3 * (1 << ((packed & 7) + 1));
        p++; // LZW min code size
        skipSubBlocks();
        continue;
      }
      break; // dữ liệu hỏng
    }
    return false;
  }

  /** Đọc ảnh, xoay đúng chiều theo EXIF → { source, width, height, close() } */
  async function decodeImage(blob) {
    if (typeof createImageBitmap === "function") {
      try {
        const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
        return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close && bmp.close() };
      } catch { /* trình duyệt cũ hoặc không đọc được → thử bằng <img> */ }
    }
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.decoding = "async";
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      if (!img.naturalWidth) throw new Error("empty");
      return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
    } catch {
      URL.revokeObjectURL(url);
      throw httpError("Trình duyệt không đọc được ảnh này (có thể là HEIC/TIFF). Hãy chọn ảnh JPG, PNG, WebP hoặc GIF.", 415);
    }
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => {
      try { canvas.toBlob((b) => resolve(b), type, quality); } catch { resolve(null); }
    });
  }

  let webpSupported = null; // null = chưa biết
  /** Canvas → Blob WebP (hoặc JPEG nếu trình duyệt không mã hoá được WebP). JPEG thì lót nền trắng chỗ trong suốt. */
  async function encodeCanvas(canvas, quality = 0.88) {
    if (webpSupported !== false) {
      const b = await canvasToBlob(canvas, "image/webp", quality);
      if (b && b.type === "image/webp") { webpSupported = true; return b; }
      webpSupported = false;
    }
    const flat = document.createElement("canvas");
    flat.width = canvas.width;
    flat.height = canvas.height;
    const ctx = flat.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, flat.width, flat.height);
    ctx.drawImage(canvas, 0, 0);
    const b = await canvasToBlob(flat, "image/jpeg", quality);
    if (!b) throw httpError("Trình duyệt không xuất được ảnh", 500);
    return b;
  }
  const extOf = (type) => ({ "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif" }[type] || "img");

  /** Vẽ (sx,sy,sw,sh) của ảnh vào canvas tw×th, thu nhỏ từng nấc ½ cho mịn */
  function drawScaled(source, sx, sy, sw, sh, tw, th) {
    let src = source;
    let cx = sx, cy = sy, cw = sw, ch = sh;
    while (cw / 2 >= tw && ch / 2 >= th && cw > 2 && ch > 2) {
      const step = document.createElement("canvas");
      step.width = Math.max(1, Math.round(cw / 2));
      step.height = Math.max(1, Math.round(ch / 2));
      const sctx = step.getContext("2d");
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = "high";
      sctx.drawImage(src, cx, cy, cw, ch, 0, 0, step.width, step.height);
      src = step; cx = 0; cy = 0; cw = step.width; ch = step.height;
    }
    const out = document.createElement("canvas");
    out.width = tw;
    out.height = th;
    const ctx = out.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, cx, cy, cw, ch, 0, 0, tw, th);
    return out;
  }

  /** Ảnh cho trang sách: cạnh dài ≤ max px, xuất WebP/JPEG (xoá luôn EXIF/GPS). GIF giữ nguyên file gốc. */
  async function prepareImage(file, max = 1600) {
    const type = await sniffFile(file);
    if (!type) throw httpError("File này không phải ảnh", 415);
    if (type === "image/gif") return { blob: file, name: file.name || "anh.gif" };
    const img = await decodeImage(file);
    try {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const tw = Math.max(1, Math.round(img.width * k));
      const th = Math.max(1, Math.round(img.height * k));
      const canvas = drawScaled(img.source, 0, 0, img.width, img.height, tw, th);
      const blob = await encodeCanvas(canvas, 0.86);
      return { blob, name: `${baseName(file.name) || "anh"}.${extOf(blob.type)}`, width: tw, height: th };
    } finally {
      img.close();
    }
  }

  /** Lấy file ảnh đầu tiên trong clipboard / kéo-thả */
  function imageFromTransfer(dt) {
    if (!dt) return null;
    const files = Array.from(dt.files || []);
    const f = files.find((x) => /^image\//.test(x.type)) || null;
    if (f) return f;
    for (const item of Array.from(dt.items || [])) {
      if (item.kind === "file" && /^image\//.test(item.type)) {
        const file = item.getAsFile();
        if (file) return file;
      }
    }
    return null;
  }

  /* ============================================================
   *  8. Kéo-thả sắp xếp (Pointer Events: chuột + cảm ứng) + phím ↑ ↓ trên tay nắm
   * ============================================================ */
  function sortable(list, { item, handle, onMove }) {
    const items = () => Array.from(list.children).filter((c) => c.matches(item));
    let drag = null;

    function autoScroll() {
      if (!drag) return;
      const edge = 64;
      const y = drag.y;
      let dy = 0;
      if (y < edge) dy = -Math.ceil((edge - y) / 5);
      else if (y > window.innerHeight - edge) dy = Math.ceil((y - (window.innerHeight - edge)) / 5);
      if (dy) {
        window.scrollBy(0, dy);
        reorder();
      }
      drag.raf = requestAnimationFrame(autoScroll);
    }

    function place() {
      const el = drag.el;
      el.style.transform = "";
      const natural = el.getBoundingClientRect().top;
      el.style.transform = `translateY(${drag.y - drag.grab - natural}px)`;
    }

    function reorder() {
      const el = drag.el;
      const top = drag.y - drag.grab;
      const bottom = top + drag.height;
      let moved = true;
      let guard = 0;
      while (moved && guard++ < 200) {
        moved = false;
        const list_ = items();
        const i = list_.indexOf(el);
        const next = list_[i + 1];
        const prev = list_[i - 1];
        if (next) {
          const r = next.getBoundingClientRect();
          if (bottom > r.top + r.height / 2) { list.insertBefore(next, el); moved = true; continue; }
        }
        if (prev) {
          const r = prev.getBoundingClientRect();
          // dời phần tử BÊN CẠNH chứ không dời phần tử đang kéo (dời nó ra khỏi DOM sẽ mất pointer capture)
          if (top < r.top + r.height / 2) { list.insertBefore(prev, el.nextSibling); moved = true; }
        }
      }
      place();
    }

    function end(commit) {
      if (!drag) return;
      const d = drag;
      drag = null;
      cancelAnimationFrame(d.raf);
      d.handle.removeEventListener("pointermove", onPointerMove);
      d.handle.removeEventListener("pointerup", onPointerUp);
      d.handle.removeEventListener("pointercancel", onPointerCancel);
      d.handle.removeEventListener("lostpointercapture", onPointerCancel);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      d.el.style.transition = reduce ? "" : "transform 0.16s ease";
      d.el.style.transform = "";
      setTimeout(() => {
        d.el.style.transition = "";
        d.el.classList.remove("is-dragging");
        list.classList.remove("is-sorting");
      }, reduce ? 0 : 170);
      const to = items().indexOf(d.el);
      if (!commit && to !== d.from) {
        // huỷ: trả phần tử về chỗ cũ
        const list_ = items().filter((x) => x !== d.el);
        list.insertBefore(d.el, list_[d.from] || null);
        return;
      }
      if (to !== d.from) onMove(d.from, to, d.el);
    }

    function onPointerMove(e) {
      if (!drag || e.pointerId !== drag.id) return;
      e.preventDefault();
      drag.y = e.clientY;
      reorder();
    }
    function onPointerUp(e) { if (drag && e.pointerId === drag.id) end(true); }
    function onPointerCancel(e) { if (drag && e.pointerId === drag.id) end(true); }

    list.addEventListener("pointerdown", (e) => {
      if (drag || (e.pointerType === "mouse" && e.button !== 0)) return;
      const hd = e.target.closest(handle);
      if (!hd || !list.contains(hd)) return;
      const el = hd.closest(item);
      if (!el || el.parentElement !== list || hd.disabled) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      drag = { id: e.pointerId, el, handle: hd, from: items().indexOf(el), grab: e.clientY - rect.top, y: e.clientY, height: rect.height, raf: 0 };
      try { hd.setPointerCapture(e.pointerId); } catch { /* bỏ qua */ }
      el.classList.add("is-dragging");
      list.classList.add("is-sorting");
      hd.addEventListener("pointermove", onPointerMove);
      hd.addEventListener("pointerup", onPointerUp);
      hd.addEventListener("pointercancel", onPointerCancel);
      hd.addEventListener("lostpointercapture", onPointerCancel);
      drag.raf = requestAnimationFrame(autoScroll);
    });

    list.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      const hd = e.target.closest(handle);
      if (!hd || !list.contains(hd)) return;
      const el = hd.closest(item);
      const list_ = items();
      const from = list_.indexOf(el);
      const to = from + (e.key === "ArrowUp" ? -1 : 1);
      e.preventDefault();
      if (from < 0 || to < 0 || to >= list_.length) return;
      onMove(from, to, el);
    });
  }

  /** Dời phần tử trong mảng (tại chỗ) */
  function moveItem(arr, from, to) {
    if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
    const [x] = arr.splice(from, 1);
    arr.splice(to, 0, x);
    return arr;
  }

  /* ============================================================
   *  9. Nghe thử nhạc — một <audio> dùng chung cho cả trang admin
   * ============================================================ */
  const preview = (() => {
    const audio = new Audio();
    audio.preload = "none";
    let btn = null;
    let current = "";
    const setBtn = (b, playing) => {
      if (!b) return;
      b.classList.toggle("is-playing", playing);
      b.replaceChildren(icon(playing ? "player-pause" : "player-play"));
      b.setAttribute("aria-label", playing ? "Dừng nghe thử" : b.dataset.label || "Nghe thử");
      b.setAttribute("aria-pressed", playing ? "true" : "false");
    };
    const reset = () => { setBtn(btn, false); btn = null; current = ""; };
    audio.addEventListener("ended", reset);
    audio.addEventListener("error", () => {
      if (!current) return;
      toast("Không phát được bài này (link hỏng hoặc định dạng lạ)", "error");
      reset();
    });
    return {
      toggle(src, button) {
        if (!src) return;
        if (current === src && !audio.paused) { audio.pause(); reset(); return; }
        if (btn && btn !== button) setBtn(btn, false);
        btn = button;
        current = src;
        if (audio.getAttribute("src") !== src) audio.src = src;
        audio.currentTime = 0;
        setBtn(btn, true);
        audio.play().catch((err) => {
          if (err && err.name === "AbortError") return;
          toast("Không phát được bài này", "error");
          reset();
        });
      },
      stop() { if (!audio.paused) audio.pause(); reset(); },
      isPlaying: (src) => current === src && !audio.paused,
      bindButton(button, label) { button.dataset.label = label; setBtn(button, false); },
    };
  })();

  /* ============================================================
   *  10. Ô nhập chung: thanh tiến độ tải lên, đếm ký tự
   * ============================================================ */
  /** progressBar() → { el, set(fraction), onCancel(fn) } */
  function progressBar(label = "Đang tải lên") {
    const fill = h("span");
    const pct = h("span", { class: "pct", text: "0%" });
    const cancel = h("button", { class: "icon-btn small", type: "button", "aria-label": "Huỷ tải lên", title: "Huỷ tải lên" }, icon("x"));
    const bar = h("div", { class: "bar", role: "progressbar", "aria-label": label, "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" }, fill);
    const el = h("div", { class: "upload-progress" }, bar, pct, cancel);
    return {
      el,
      set(f) {
        const v = Math.round(clamp(f, 0, 1) * 100);
        fill.style.width = `${v}%`;
        pct.textContent = `${v}%`;
        bar.setAttribute("aria-valuenow", String(v));
      },
      onCancel(fn) { cancel.addEventListener("click", fn); },
    };
  }

  function counter(input, out, max, unit = "") {
    const update = () => {
      const n = input.value.length;
      out.textContent = `${n}/${max}${unit}`;
      out.classList.toggle("over", n > max);
    };
    input.addEventListener("input", update);
    update();
    return update;
  }

  /* ---------- chặn trình duyệt mở file khi thả ra ngoài vùng nhận ---------- */
  for (const type of ["dragover", "drop"]) {
    window.addEventListener(type, (e) => {
      const dt = e.dataTransfer;
      const t = e.target;
      if (t && t.closest && t.closest("[data-dropzone]")) return;
      if (dt && Array.from(dt.types || []).includes("Files")) {
        e.preventDefault();
        if (type === "dragover") dt.dropEffect = "none";
      }
    });
  }

  /** Vùng nhận kéo-thả file: dropzone(el, onFiles(FileList)) */
  function dropzone(el, onFiles) {
    el.setAttribute("data-dropzone", "");
    let depth = 0;
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");
    el.addEventListener("dragenter", (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; el.classList.add("is-dragover"); });
    el.addEventListener("dragover", (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
    el.addEventListener("dragleave", () => { depth = Math.max(0, depth - 1); if (!depth) el.classList.remove("is-dragover"); });
    el.addEventListener("drop", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      el.classList.remove("is-dragover");
      if (e.dataTransfer.files && e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
    });
  }

  /** Mở hộp chọn file (dùng 1 <input type=file> có sẵn) → Promise<File[]> */
  function pickFiles(input) {
    if (input._pickFinish) input._pickFinish([]); // lần chọn trước bị bỏ dở (trình duyệt không báo "cancel")
    return new Promise((resolve) => {
      let settled = false;
      const finish = (files) => {
        if (settled) return;
        settled = true;
        input.removeEventListener("change", onChange);
        input.removeEventListener("cancel", onCancel);
        input._pickFinish = null;
        resolve(files);
      };
      input._pickFinish = finish;
      const onChange = () => { const files = Array.from(input.files || []); input.value = ""; finish(files); };
      const onCancel = () => finish([]);
      input.addEventListener("change", onChange);
      input.addEventListener("cancel", onCancel);
      input.value = "";
      input.click();
    });
  }

  return Object.freeze({
    $, $$, h, icon, uid, clone, hasOwn, clamp, str, debounce, fmtBytes, fmtDate, baseName, byteLength,
    toast, on, emit, auth, api, upload, limits, setLimits, sniffMedia, tooBigMessage, httpError, unauthorized,
    state, loadContent, saveContent,
    tabs, registerTab, anyDirty, refreshDirty, bindSavebar,
    get activeTab() { return activeTab; },
    setActiveTab(id) { activeTab = id; },
    dialog,
    images: { sniff: sniffImage, sniffFile, isAnimatedGif, decode: decodeImage, encode: encodeCanvas, drawScaled, prepare: prepareImage, fromTransfer: imageFromTransfer, extOf },
    sortable, moveItem, preview, progressBar, counter, dropzone, pickFiles,
  });
})();
