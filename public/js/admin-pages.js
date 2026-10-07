/* ============================================================
 *  admin-pages.js — mục "Trang sách" (#trang-sach): soạn các trang tự soạn sau 2 trang cố định.
 *  Thanh chọn trang (thêm / xoá / dời), danh sách khối (kéo-thả, ↑ ↓, nhân bản, xoá),
 *  ô soạn cho từng loại khối và XEM TRƯỚC TRỰC TIẾP bằng chính BookPages.createFace của trang chính.
 * ============================================================ */
(() => {
  "use strict";

  const K = window.AdminKit;
  const BP = window.BookPages;
  const { $, h, icon } = K;
  const ID = "trang-sach";
  const FIRST_NO = 3;              // trang tự soạn đầu tiên là trang 3
  const PAGE_W = 480;              // kích thước 1 trang khi xem trước (px, rồi thu nhỏ cho vừa cột)
  const PAGE_H = 660;
  const COVER = 14;                // viền bìa da quanh trang xem trước
  const LIM = BP ? BP.LIMITS : { pages: 20, blocks: 60, galleryImages: 12, heading: 200, text: 5000, alt: 200, caption: 300, quote: 1000, cite: 120, url: 2048 };
  const TYPE_ICON = { heading: "blk-heading", text: "blk-text", image: "photo", gallery: "blk-gallery", quote: "blk-quote", divider: "blk-divider", spacer: "blk-spacer" };
  const SIZE_LABEL = { sm: "Nhỏ", md: "Vừa", lg: "Lớn" };
  const FRAME_LABEL = { none: "Không khung", frame: "Khung vàng", round: "Bo góc", circle: "Tròn", polaroid: "Polaroid" };
  const DIVIDER_LABEL = { ornament: "Hoa văn", line: "Nét kẻ đôi", dots: "Hàng chấm" };
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let el = {};
  let pages = [];                  // các trang đang sửa
  let savedJson = "";
  let ready = false;
  let sel = 0;                     // trang đang chọn
  let activeId = "";               // khối đang sửa (tô sáng trong bản xem trước)
  let uploads = 0;                 // số ảnh đang tải lên
  let mode = "edit";               // màn hẹp: "edit" | "preview"
  let spreadPref = "2";            // xem trước 2 trang hay 1 trang
  const open = new Set();          // id các khối đang mở ô soạn
  const cards = new WeakMap();     // khối → thẻ soạn (giữ nguyên trạng thái khi dời chỗ)
  const scrollMemo = new Map();    // id trang → vị trí cuộn trong bản xem trước
  const mqWide = window.matchMedia("(min-width: 1100px)");
  const mqPhone = window.matchMedia("(max-width: 599px)");

  const typeMeta = (type) => (BP ? BP.BLOCK_TYPES.find((t) => t.type === type) : null) || { type, label: type, icon: "star", hint: "" };
  const page = () => pages[sel] || null;
  const normalizedJson = () => JSON.stringify(BP.normalizePages(pages));
  const isDirty = () => ready && !!BP && normalizedJson() !== savedJson;
  const newBlockId = () => BP.blockDefaults("spacer").id;

  /* ============================================================
   *  Ô nhập dùng chung trong thẻ khối
   * ============================================================ */
  function row(labelText, control, opts = {}) {
    const id = control.id || (control.id = K.uid("f"));
    const lbl = h("label", { class: "lbl", for: id, text: labelText });
    return h("div", { class: `form-row ${opts.cls || ""}`.trim() }, lbl, control, opts.after || null);
  }

  function textInput(block, key, { label, max, placeholder, ctx, onChange }) {
    const input = h("input", { class: "field sm", type: "text", maxLength: max, placeholder: placeholder || "", autocomplete: "off", value: block[key] || "" });
    input.addEventListener("input", () => { block[key] = input.value; if (onChange) onChange(); ctx.changed(); });
    return row(label, input);
  }

  function textArea(block, key, { label, max, rows, placeholder, ctx, toolbar }) {
    const ta = h("textarea", { class: "field sm", maxLength: max, rows: rows || 4, placeholder: placeholder || "", value: block[key] || "" });
    const count = h("div", { class: "counter", "aria-live": "polite" });
    ta.setAttribute("aria-describedby", count.id = K.uid("c"));
    ta.addEventListener("input", () => { block[key] = ta.value; ctx.changed(); });
    K.counter(ta, count, max);
    const r = row(label, ta, { after: count });
    if (toolbar) {
      const bar = formatToolbar(ta, toolbar);
      r.insertBefore(bar, ta);
      ta.addEventListener("keydown", (e) => onEditorKey(e, ta, toolbar));
    }
    return r;
  }

  /** Nút bấm chọn 1 trong nhiều (aria-pressed) */
  function segmented({ label, options, get, set, iconOnly, cls }) {
    const lblId = K.uid("l");
    const group = h("div", { class: `seg ${cls || ""}`.trim(), role: "group", "aria-labelledby": lblId });
    const btns = options.map((o) => {
      const b = h("button", { class: "seg-btn", type: "button", title: o.title || o.label, "aria-pressed": "false" },
        o.icon ? icon(o.icon) : null,
        o.art || null,
        h("span", { class: iconOnly ? "sr-only" : "seg-text", text: o.label }));
      b.addEventListener("click", () => { set(o.value); refresh(); });
      group.appendChild(b);
      return b;
    });
    function refresh() { btns.forEach((b, i) => b.setAttribute("aria-pressed", String(options[i].value === get()))); }
    refresh();
    const el_ = h("div", { class: "form-row" }, h("span", { class: "lbl", id: lblId, text: label }), group);
    return { el: el_, refresh, btns };
  }

  function rangeInput({ label, min, max, step = 1, get, set, format }) {
    const input = h("input", { class: "range", type: "range", min: String(min), max: String(max), step: String(step), value: String(get()) });
    const out = h("output", { class: "range-out" });
    const paint = () => {
      const v = Number(input.value);
      out.textContent = format(v);
      input.style.setProperty("--p", `${((v - min) / (max - min)) * 100}%`);
      input.setAttribute("aria-valuetext", format(v));
    };
    input.addEventListener("input", () => { set(Number(input.value)); paint(); });
    paint();
    const r = row(label, input, { cls: "range-row", after: out });
    return { el: r, input, refresh() { input.value = String(get()); paint(); } };
  }

  function switchInput({ label, get, set, hint }) {
    const id = K.uid("sw");
    const input = h("input", { type: "checkbox", id });
    input.checked = !!get();
    input.addEventListener("change", () => set(input.checked));
    const el_ = h("label", { class: "switch-row form-row", for: id },
      h("span", { class: "switch-label" }, label, hint ? h("small", { class: "switch-hint", text: hint }) : null),
      h("span", { class: "switch" }, input, h("span", { class: "slider" })));
    return { el: el_, input };
  }

  /* ============================================================
   *  Thanh định dạng chữ: B / I / U / liên kết / danh sách
   * ============================================================ */
  function insertText(ta, text, start, end) {
    ta.focus();
    ta.setSelectionRange(start, end);
    let ok = false;
    try { ok = document.execCommand("insertText", false, text); } catch { ok = false; } // giữ được Ctrl+Z
    if (!ok || ta.value.slice(start, start + text.length) !== text) {
      ta.setRangeText(text, start, end, "end");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  function runLength(v, i, dir, ch) {
    let n = 0;
    while (i >= 0 && i < v.length && v[i] === ch) { n++; i += dir; }
    return n;
  }
  /** Bọc / gỡ ký hiệu quanh vùng chọn: **đậm**, *nghiêng*, __gạch chân__ */
  function wrapInline(ta, mk, placeholder) {
    const v = ta.value;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const ch = mk[0];
    const n = mk.length;
    const wrapped = (run) => (mk === "*" ? run % 2 === 1 : run >= 2);
    if (wrapped(runLength(v, s - 1, -1, ch)) && wrapped(runLength(v, e, 1, ch))) {
      const inner = v.slice(s, e);
      insertText(ta, inner, s - n, e + n);
      ta.setSelectionRange(s - n, s - n + inner.length);
      return;
    }
    const selected = v.slice(s, e);
    const lead = /^\s*/.exec(selected)[0];
    const rest = selected.slice(lead.length);
    const trail = /\s*$/.exec(rest)[0];
    let core = rest.slice(0, rest.length - trail.length);
    if (!core) core = placeholder;
    insertText(ta, lead + mk + core + mk + trail, s, e);
    const cs = s + lead.length + n;
    ta.setSelectionRange(cs, cs + core.length);
  }
  /** Dòng đang chọn → danh sách "- " (bấm lần nữa để bỏ) */
  function toggleList(ta) {
    const v = ta.value;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const ls = v.lastIndexOf("\n", s - 1) + 1;
    let le = v.indexOf("\n", e > s && v[e - 1] === "\n" ? e - 1 : e);
    if (le < 0) le = v.length;
    const lines = v.slice(ls, le).split("\n");
    const filled = lines.filter((l) => l.trim());
    let out;
    if (!filled.length) out = "- ";
    else {
      const all = filled.every((l) => /^\s*- /.test(l));
      out = lines.map((l) => (!l.trim() ? l : all ? l.replace(/^(\s*)- /, "$1") : /^\s*- /.test(l) ? l : `- ${l.trimStart()}`)).join("\n");
    }
    insertText(ta, out, ls, le);
    if (filled.length) ta.setSelectionRange(ls, ls + out.length);
    else ta.setSelectionRange(ls + out.length, ls + out.length);
  }
  async function insertLink(ta) {
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const selected = ta.value.slice(s, e).trim();
    const looksUrl = /^(https?:\/\/|mailto:|www\.)/i.test(selected);
    const labelIn = h("input", { class: "field", type: "text", maxLength: 200, value: looksUrl ? "" : selected, placeholder: "VD: trang GitHub của mình", autocomplete: "off" });
    const urlIn = h("input", { class: "field", type: "url", inputmode: "url", value: looksUrl ? selected : "https://", autocomplete: "off" });
    const err = h("p", { class: "error", role: "alert" });
    const body = h("div", { class: "link-dialog" }, row("Chữ hiển thị", labelIn), row("Đường link (https://… hoặc email)", urlIn), err);
    let result = null;
    const check = () => {
      let url = urlIn.value.trim();
      if (url && !/^[a-z][a-z0-9+.-]*:/i.test(url)) url = /^[^\s/]+@[^\s/]+\.[^\s/]+$/.test(url) ? `mailto:${url}` : `https://${url}`;
      url = url.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
      if (!BP.safeUrl(url, "link") || /^https?:\/\/$/i.test(url)) {
        err.textContent = "Link chưa đúng — cần dạng https://… , http://… hoặc địa chỉ email";
        urlIn.focus();
        return false;
      }
      const label = labelIn.value.replace(/[[\]\n]/g, " ").replace(/\s+/g, " ").trim();
      result = { url, label: label || url.replace(/^mailto:/i, "") };
      return true;
    };
    const ok = await K.dialog.open({
      title: "Chèn liên kết",
      body,
      dismiss: false,
      initial: looksUrl || !selected ? "input[type=url]" : "input[type=text]",
      onOpen({ box }) {
        for (const input of [labelIn, urlIn]) {
          input.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter") { ev.preventDefault(); $(".btn-primary", box).click(); }
          });
        }
      },
      buttons: [
        { label: "Huỷ", value: false, kind: "ghost" },
        { label: "Chèn liên kết", value: true, kind: "primary", validate: check },
      ],
    });
    if (!ok || !result) { ta.focus(); return; }
    insertText(ta, `[${result.label}](${result.url})`, s, e);
  }

  function formatToolbar(ta, opts) {
    const bar = h("div", { class: "fmt-bar", role: "toolbar", "aria-label": "Định dạng chữ" });
    const add = (name, label, keys, fn) => {
      const b = h("button", { class: "fmt-btn", type: "button", title: keys ? `${label} (${keys})` : label, "aria-label": label }, icon(name));
      b.addEventListener("mousedown", (e) => e.preventDefault()); // giữ nguyên vùng chọn trong ô chữ
      b.addEventListener("click", fn);
      bar.appendChild(b);
    };
    add("bold", "Chữ đậm", "Ctrl+B", () => wrapInline(ta, "**", "chữ đậm"));
    add("italic", "Chữ nghiêng", "Ctrl+I", () => wrapInline(ta, "*", "chữ nghiêng"));
    add("underline", "Gạch chân", "Ctrl+U", () => wrapInline(ta, "__", "gạch chân"));
    add("link", "Chèn liên kết", "Ctrl+K", () => insertLink(ta));
    if (opts.list) {
      const b = h("button", { class: "fmt-btn fmt-wide", type: "button", title: "Biến các dòng đang chọn thành danh sách", "aria-label": "Danh sách gạch đầu dòng" }, icon("list"), h("span", { text: "danh sách" }));
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", () => toggleList(ta));
      bar.appendChild(b);
    }
    bar.appendChild(h("span", { class: "fmt-hint", text: "**đậm** · *nghiêng* · __gạch__" }));
    return bar;
  }
  function onEditorKey(e, ta, opts) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey) {
      const k = e.key.toLowerCase();
      const map = { b: () => wrapInline(ta, "**", "chữ đậm"), i: () => wrapInline(ta, "*", "chữ nghiêng"), u: () => wrapInline(ta, "__", "gạch chân"), k: () => insertLink(ta) };
      if (map[k]) { e.preventDefault(); map[k](); }
      return;
    }
    // Enter trong dòng "- …" → tự thêm gạch đầu dòng; dòng "- " trống → thoát danh sách
    if (opts.list && e.key === "Enter" && !e.shiftKey && !e.isComposing && ta.selectionStart === ta.selectionEnd) {
      const v = ta.value;
      const pos = ta.selectionStart;
      const ls = v.lastIndexOf("\n", pos - 1) + 1;
      const line = v.slice(ls, pos);
      const m = /^(\s*)- (.*)$/.exec(line);
      if (!m) return;
      e.preventDefault();
      if (!m[2].trim() && v.slice(pos).split("\n")[0].trim() === "") insertText(ta, "", ls, pos);
      else insertText(ta, `\n${m[1]}- `, pos, pos);
    }
  }

  /* ============================================================
   *  Ảnh: tải lên (thu nhỏ ≤ 1600 px, WebP/JPEG; GIF giữ nguyên) + tiến độ
   * ============================================================ */
  async function uploadImage(file, mount, onDone) {
    const bar = K.progressBar("Đang tải ảnh lên");
    let job = null;
    let cancelled = false;
    bar.onCancel(() => { cancelled = true; if (job) job.abort(); });
    mount.appendChild(bar.el);
    uploads++;
    K.refreshDirty();
    try {
      const prep = await K.images.prepare(file, 1600);
      if (cancelled) return;
      if (prep.blob.size > K.limits.image) throw K.httpError(K.tooBigMessage("image", prep.blob.size), 413);
      job = K.upload(prep.blob, { kind: "image", name: prep.name, onProgress: bar.set });
      const media = await job.promise;
      if (!cancelled) onDone(media.url);
    } catch (err) {
      if (err.name !== "AbortError" && err.status !== 401) K.toast(err.message, "error");
    } finally {
      bar.el.remove();
      uploads--;
      K.refreshDirty();
    }
  }
  const isImageFile = (f) => f && (/^image\//.test(f.type) || /\.(jpe?g|png|gif|webp|avif|heic)$/i.test(f.name));

  function urlField({ label, get, set, placeholder }) {
    const input = h("input", { class: "field sm", type: "url", inputmode: "url", placeholder, autocomplete: "off", value: get() });
    const err = h("p", { class: "field-error", role: "alert" });
    input.addEventListener("input", () => {
      const v = input.value.trim();
      if (!v) { err.textContent = ""; set(""); return; }
      if (BP.safeUrl(v, "image")) { err.textContent = ""; set(v); }
      else err.textContent = "Link chưa hợp lệ: cần https://…, media/… hoặc assets/…";
    });
    return { el: row(label, input, { after: err }), input, refresh() { if (document.activeElement !== input) input.value = get(); err.textContent = ""; } };
  }

  /** Ô khung ảnh có hình minh hoạ nhỏ */
  const frameArt = (f) => h("span", { class: `sw sw-${f}`, "aria-hidden": "true" }, h("span", { class: "sw-img" }));
  const dividerArt = (s) => h("span", { class: `dv-art dv-${s}`, "aria-hidden": "true" }, s === "ornament" ? "✦ ✦ ✦" : "");

  /* ============================================================
   *  Ô soạn cho từng loại khối
   * ============================================================ */
  const EDITORS = {
    heading(b, ctx) {
      return [
        textInput(b, "text", { label: "Chữ tiêu đề", max: LIM.heading, placeholder: "VD: Đôi điều về mình", ctx }),
        h("div", { class: "form-grid-2" },
          segmented({ label: "Cỡ chữ", options: [{ value: 1, label: "Lớn" }, { value: 2, label: "Vừa" }, { value: 3, label: "Nhỏ" }], get: () => b.level, set: (v) => { b.level = v; ctx.changed(); } }).el,
          segmented({ label: "Căn lề", iconOnly: true, options: [
            { value: "left", label: "Căn trái", icon: "align-left" },
            { value: "center", label: "Căn giữa", icon: "align-center" },
            { value: "right", label: "Căn phải", icon: "align-right" },
          ], get: () => b.align, set: (v) => { b.align = v; ctx.changed(); } }).el),
      ];
    },

    text(b, ctx) {
      return [
        textArea(b, "text", { label: "Nội dung", max: LIM.text, rows: 6, placeholder: "Viết gì đó… dòng trống = sang đoạn mới, dòng bắt đầu bằng “- ” = danh sách", ctx, toolbar: { list: true } }),
        h("div", { class: "form-grid-2" },
          segmented({ label: "Căn lề", iconOnly: true, options: [
            { value: "left", label: "Căn trái", icon: "align-left" },
            { value: "center", label: "Căn giữa", icon: "align-center" },
            { value: "right", label: "Căn phải", icon: "align-right" },
            { value: "justify", label: "Căn đều hai bên", icon: "align-justified" },
          ], get: () => b.align, set: (v) => { b.align = v; ctx.changed(); } }).el,
          segmented({ label: "Cỡ chữ", options: ["sm", "md", "lg"].map((v) => ({ value: v, label: SIZE_LABEL[v] })), get: () => b.size, set: (v) => { b.size = v; ctx.changed(); } }).el),
        h("div", { class: "form-grid-2" },
          switchInput({ label: "Chữ nghiêng cả đoạn", get: () => b.italic, set: (v) => { b.italic = v; ctx.changed(); } }).el,
          switchInput({ label: "Chữ cái lớn đầu đoạn", get: () => b.dropcap, set: (v) => { b.dropcap = v; ctx.changed(); } }).el),
      ];
    },

    image(b, ctx) {
      const thumbImg = h("img", { alt: "" });
      const thumbEmpty = h("span", { class: "img-empty" }, icon("photo"), h("span", { text: "Chưa có ảnh — bấm để chọn, hoặc kéo thả / dán ảnh vào đây" }));
      const thumb = h("button", { class: "img-thumb", type: "button", "aria-label": "Chọn ảnh từ máy" }, thumbImg, thumbEmpty);
      const progress = h("div", { class: "upload-slot" });
      const pickBtn = h("button", { class: "btn btn-primary btn-sm", type: "button" }, icon("upload"), "Tải ảnh lên");
      const clearBtn = h("button", { class: "btn btn-ghost btn-sm", type: "button" }, icon("x"), "Gỡ ảnh");
      const url = urlField({ label: "…hoặc dán đường link ảnh", placeholder: "https://… hoặc media/…", get: () => b.src, set: (v) => { b.src = v; showThumb(); ctx.changed(); } });

      function showThumb() {
        thumbImg.hidden = !b.src;
        thumbEmpty.hidden = !!b.src;
        thumb.classList.toggle("is-broken", false);
        if (b.src && thumbImg.getAttribute("src") !== b.src) thumbImg.src = b.src;
        clearBtn.hidden = !b.src;
      }
      thumbImg.addEventListener("error", () => { thumb.classList.add("is-broken"); });
      const take = (file) => {
        if (!isImageFile(file)) { K.toast("Hãy chọn một file ảnh", "error"); return; }
        uploadImage(file, progress, (src) => { b.src = src; url.refresh(); showThumb(); ctx.changed(); });
      };
      const choose = async () => { const [f] = await K.pickFiles(el.imageFile); if (f) take(f); };
      thumb.addEventListener("click", choose);
      pickBtn.addEventListener("click", choose);
      clearBtn.addEventListener("click", () => { b.src = ""; url.refresh(); showThumb(); ctx.changed(); });
      K.dropzone(thumb, (files) => take(files[0]));
      ctx.onPasteImage = take;
      showThumb();

      // căn lề → bật/tắt "chữ chạy quanh"
      let wrapSw;
      const alignSeg = segmented({ label: "Căn lề", iconOnly: true, options: [
        { value: "left", label: "Ảnh bên trái", icon: "image-left" },
        { value: "center", label: "Ảnh ở giữa", icon: "image-center" },
        { value: "right", label: "Ảnh bên phải", icon: "image-right" },
      ], get: () => b.align, set: (v) => { b.align = v; syncWrap(); ctx.changed(); } });
      wrapSw = switchInput({ label: "Chữ chạy quanh ảnh", hint: "Chỉ dùng khi ảnh căn trái / phải", get: () => b.wrap, set: (v) => { b.wrap = v; ctx.changed(); } });
      function syncWrap() {
        const can = b.align === "left" || b.align === "right";
        wrapSw.input.disabled = !can;
        wrapSw.el.classList.toggle("is-disabled", !can);
      }
      syncWrap();

      const width = rangeInput({ label: "Độ rộng", min: 20, max: 100, get: () => b.width, set: (v) => { b.width = v; ctx.changed(); }, format: (v) => `${v}%` });
      const tilt = rangeInput({ label: "Độ nghiêng", min: -8, max: 8, get: () => b.tilt, set: (v) => { b.tilt = v; ctx.changed(); }, format: (v) => (v ? `${v > 0 ? "+" : ""}${v}°` : "0°") });
      const showTilt = () => { tilt.el.hidden = !(b.frame === "polaroid" || b.tilt); };
      let lastTilt = b.tilt || 3;
      const frames = segmented({ label: "Khung ảnh", cls: "seg-swatch", options: BP.ENUMS.imageFrame.map((f) => ({ value: f, label: FRAME_LABEL[f], art: frameArt(f) })),
        get: () => b.frame,
        set: (v) => {
          if (v !== "polaroid" && b.frame === "polaroid") { lastTilt = b.tilt || lastTilt; b.tilt = 0; }
          if (v === "polaroid" && !b.tilt) b.tilt = lastTilt;
          b.frame = v;
          tilt.refresh();
          showTilt();
          ctx.changed();
        } });
      showTilt();

      return [
        h("div", { class: "img-pick" }, thumb, h("div", { class: "img-pick-side" }, h("div", { class: "btn-row" }, pickBtn, clearBtn), progress, url.el)),
        h("div", { class: "form-grid-2" },
          textInput(b, "alt", { label: "Mô tả ảnh (cho người khiếm thị)", max: LIM.alt, placeholder: "VD: Mình đứng trên đồi chè", ctx }),
          textInput(b, "caption", { label: "Chú thích dưới ảnh", max: LIM.caption, placeholder: "Có thể dùng **đậm**, *nghiêng*", ctx })),
        h("div", { class: "form-grid-2" }, alignSeg.el, width.el),
        wrapSw.el,
        frames.el,
        tilt.el,
      ];
    },

    gallery(b, ctx) {
      const grid = h("div", { class: "gal-grid", role: "list", "aria-label": "Ảnh trong bộ ảnh" });
      const editor = h("div", { class: "gal-edit" });
      const info = h("p", { class: "hint" });
      const pickBtn = h("button", { class: "btn btn-primary btn-sm", type: "button" }, icon("upload"), "Tải ảnh lên");
      const linkIn = h("input", { class: "field sm", type: "url", inputmode: "url", placeholder: "…hoặc dán link ảnh rồi bấm Thêm", autocomplete: "off" });
      const linkBtn = h("button", { class: "btn btn-ghost btn-sm", type: "button" }, icon("plus"), "Thêm");
      const linkErr = h("p", { class: "field-error", role: "alert" });
      const pending = []; // ảnh đang tải lên: { key, bar }
      let current = -1;   // ảnh đang sửa mô tả

      const room = () => LIM.galleryImages - b.images.length - pending.length;
      function renderGrid() {
        grid.replaceChildren();
        b.images.forEach((im, i) => {
          const img = h("img", { alt: "", loading: "lazy" });
          if (im.src) img.src = im.src;
          img.addEventListener("error", () => tile.classList.add("is-broken"));
          const tile = h("div", { class: `gal-tile${i === current ? " is-current" : ""}`, role: "listitem" },
            h("button", { class: "gal-img", type: "button", "aria-label": `Ảnh ${i + 1}: sửa mô tả, chú thích`, "aria-pressed": String(i === current), onclick: () => { current = current === i ? -1 : i; renderGrid(); } },
              im.src ? img : h("span", { class: "gal-missing", text: "Link hỏng" })),
            h("div", { class: "gal-tools" },
              h("button", { class: "icon-btn tiny", type: "button", "aria-label": `Dời ảnh ${i + 1} sang trái`, disabled: i === 0, onclick: () => moveImg(i, -1) }, icon("chevron-left")),
              h("button", { class: "icon-btn tiny", type: "button", "aria-label": `Dời ảnh ${i + 1} sang phải`, disabled: i === b.images.length - 1, onclick: () => moveImg(i, 1) }, icon("chevron-right")),
              h("button", { class: "icon-btn tiny danger", type: "button", "aria-label": `Bỏ ảnh ${i + 1}`, onclick: () => removeImg(i) }, icon("x"))));
          grid.appendChild(tile);
        });
        for (const p of pending) grid.appendChild(h("div", { class: "gal-tile is-pending", role: "listitem" }, h("span", { class: "gal-wait", text: "Đang tải…" }), p.bar.el));
        if (!b.images.length && !pending.length) grid.appendChild(h("p", { class: "gal-none", text: "Chưa có ảnh nào. Tải ảnh lên (chọn được nhiều ảnh cùng lúc) hoặc kéo thả vào đây." }));
        info.textContent = `${b.images.length}/${LIM.galleryImages} ảnh${pending.length ? ` · đang tải ${pending.length}` : ""}`;
        pickBtn.disabled = room() <= 0;
        linkBtn.disabled = room() <= 0;
        renderEditor();
      }
      function renderEditor() {
        editor.replaceChildren();
        const im = b.images[current];
        if (!im) { editor.hidden = true; return; }
        editor.hidden = false;
        editor.append(
          h("p", { class: "gal-edit-title", text: `Ảnh ${current + 1}` }),
          h("div", { class: "form-grid-2" },
            textInput(im, "alt", { label: "Mô tả ảnh", max: LIM.alt, ctx }),
            textInput(im, "caption", { label: "Chú thích", max: LIM.caption, ctx })));
      }
      function moveImg(i, d) {
        K.moveItem(b.images, i, i + d);
        if (current === i) current = i + d;
        else if (current === i + d) current = i;
        renderGrid();
        ctx.changed();
        const btns = grid.querySelectorAll(".gal-tile")[i + d];
        const target = btns && btns.querySelector(d < 0 ? ".gal-tools button:first-child" : ".gal-tools button:nth-child(2)");
        if (target && !target.disabled) target.focus(); else if (btns) btns.querySelector(".gal-img").focus();
      }
      function removeImg(i) {
        b.images.splice(i, 1);
        if (current === i) current = -1;
        else if (current > i) current--;
        renderGrid();
        ctx.changed();
        const tiles = grid.querySelectorAll(".gal-img");
        (tiles[i] || tiles[i - 1] || pickBtn).focus();
      }
      async function addFiles(files) {
        const list = Array.from(files).filter(isImageFile);
        if (!list.length) { K.toast("Hãy chọn file ảnh", "error"); return; }
        const take = list.slice(0, Math.max(0, room()));
        if (take.length < list.length) K.toast(`Bộ ảnh tối đa ${LIM.galleryImages} ảnh — chỉ thêm ${take.length} ảnh`, "error");
        // tải lần lượt từng ảnh, giữ đúng thứ tự đã chọn
        const jobs = take.map((file) => ({ file, key: K.uid("g"), mount: h("div") }));
        for (const j of jobs) { j.bar = { el: j.mount }; pending.push(j); }
        renderGrid();
        for (const j of jobs) {
          await uploadImage(j.file, j.mount, (src) => {
            if (b.images.length < LIM.galleryImages) b.images.push({ src, alt: "", caption: "" });
          });
          pending.splice(pending.indexOf(j), 1);
          renderGrid();
          ctx.changed();
        }
      }
      pickBtn.addEventListener("click", async () => { const files = await K.pickFiles(el.galleryFiles); if (files.length) addFiles(files); });
      const addLink = () => {
        const v = linkIn.value.trim();
        if (!v) return;
        if (!BP.safeUrl(v, "image")) { linkErr.textContent = "Link chưa hợp lệ: cần https://…, media/… hoặc assets/…"; linkIn.focus(); return; }
        if (room() <= 0) return;
        b.images.push({ src: v, alt: "", caption: "" });
        linkIn.value = "";
        linkErr.textContent = "";
        renderGrid();
        ctx.changed();
      };
      linkBtn.addEventListener("click", addLink);
      linkIn.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } });
      K.dropzone(grid, (files) => addFiles(files));
      ctx.onPasteImage = (file) => addFiles([file]);
      renderGrid();

      return [
        grid,
        info,
        editor,
        h("div", { class: "gal-add" }, pickBtn, h("div", { class: "gal-link" }, linkIn, linkBtn), linkErr),
        h("div", { class: "form-grid-2" },
          segmented({ label: "Số cột", options: [2, 3, 4].map((n) => ({ value: n, label: `${n} cột` })), get: () => b.columns, set: (v) => { b.columns = v; ctx.changed(); } }).el,
          segmented({ label: "Khung ảnh", cls: "seg-swatch", options: BP.ENUMS.galleryFrame.map((f) => ({ value: f, label: FRAME_LABEL[f], art: frameArt(f) })), get: () => b.frame, set: (v) => { b.frame = v; ctx.changed(); } }).el),
      ];
    },

    quote(b, ctx) {
      return [
        textArea(b, "text", { label: "Câu trích dẫn", max: LIM.quote, rows: 3, ctx, toolbar: { list: false } }),
        h("div", { class: "form-grid-2" },
          textInput(b, "cite", { label: "Người nói / nguồn", max: LIM.cite, placeholder: "VD: Xuân Diệu", ctx }),
          segmented({ label: "Căn lề", iconOnly: true, options: [
            { value: "left", label: "Căn trái", icon: "align-left" },
            { value: "center", label: "Căn giữa", icon: "align-center" },
            { value: "right", label: "Căn phải", icon: "align-right" },
          ], get: () => b.align, set: (v) => { b.align = v; ctx.changed(); } }).el),
      ];
    },

    divider(b, ctx) {
      return [segmented({ label: "Kiểu đường kẻ", cls: "seg-swatch", options: BP.ENUMS.dividerStyle.map((s) => ({ value: s, label: DIVIDER_LABEL[s], art: dividerArt(s) })), get: () => b.style, set: (v) => { b.style = v; ctx.changed(); } }).el];
    },

    spacer(b, ctx) {
      return [segmented({ label: "Độ cao khoảng trống", options: ["sm", "md", "lg"].map((v) => ({ value: v, label: SIZE_LABEL[v] })), get: () => b.size, set: (v) => { b.size = v; ctx.changed(); } }).el];
    },
  };

  /* ---------- tóm tắt 1 dòng trên đầu thẻ ---------- */
  function fileName(src) {
    const last = String(src).split(/[/?#]/).filter(Boolean).pop() || "";
    try { return decodeURIComponent(last); } catch { return last; }
  }
  const plain = (s) => String(s || "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_]{1,3}/g, "").replace(/\s+/g, " ").trim();
  function summary(b) {
    const cut = (s) => (s.length > 70 ? `${s.slice(0, 68)}…` : s);
    switch (b.type) {
      case "heading": return cut(plain(b.text)) || "(chưa có chữ)";
      case "text": return cut(plain(b.text)) || "(đoạn văn trống)";
      case "quote": return cut(plain(b.text)) ? `“${cut(plain(b.text))}”` : "(chưa có câu trích)";
      case "image": return cut(plain(b.alt) || plain(b.caption)) || (b.src ? cut(fileName(b.src)) : "(chưa có ảnh)");
      case "gallery": return `${b.images.length} ảnh · ${b.columns} cột`;
      case "divider": return DIVIDER_LABEL[b.style] || "";
      case "spacer": return `Khoảng trống ${(SIZE_LABEL[b.size] || "").toLowerCase()}`;
      default: return "";
    }
  }
  const hasContent = (b) => (b.type === "gallery" ? b.images.length > 0 : b.type === "image" ? !!b.src : ["heading", "text", "quote"].includes(b.type) ? !!K.str(b.text) : false);

  /* ============================================================
   *  Thẻ khối
   * ============================================================ */
  function cardFor(block) {
    let card = cards.get(block);
    if (!card) { card = buildCard(block); cards.set(block, card); }
    return card;
  }

  function buildCard(block) {
    const meta = typeMeta(block.type);
    const bodyId = K.uid("blk");
    const li = h("li", { class: "blk", "data-type": block.type });
    const grip = h("button", { class: "drag-handle blk-grip", type: "button", title: "Kéo để đổi chỗ (hoặc phím ↑ ↓)" }, icon("grip"));
    const sum = h("span", { class: "blk-sum" });
    const toggle = h("button", { class: "blk-toggle", type: "button", "aria-expanded": "false", "aria-controls": bodyId },
      icon("chevron-right", "blk-caret"),
      h("span", { class: "blk-icon", "aria-hidden": "true" }, icon(TYPE_ICON[block.type] || meta.icon)),
      h("span", { class: "blk-text" }, h("span", { class: "blk-label", text: meta.label }), sum));
    const up = h("button", { class: "icon-btn small", type: "button", title: "Lên trên" }, icon("arrow-up"));
    const down = h("button", { class: "icon-btn small", type: "button", title: "Xuống dưới" }, icon("arrow-down"));
    const dup = h("button", { class: "icon-btn small", type: "button", title: "Nhân bản khối" }, icon("copy"));
    const del = h("button", { class: "icon-btn small danger", type: "button", title: "Xoá khối" }, icon("trash"));
    const body = h("div", { class: "blk-body", id: bodyId, hidden: true });
    li.append(h("div", { class: "blk-head" }, grip, toggle, h("div", { class: "blk-actions" }, up, down, dup, del)), body);

    const ctx = {
      onPasteImage: null,
      changed() {
        sum.textContent = summary(block);
        markChanged();
      },
    };
    let built = false;
    function setOpen(v) {
      if (v && !built) {
        built = true;
        try { body.append(...[].concat(EDITORS[block.type](block, ctx))); }
        catch (err) { body.append(h("p", { class: "error", text: `Không mở được ô soạn: ${err.message}` })); }
        if (meta.hint) body.prepend(h("p", { class: "hint blk-hint", text: meta.hint }));
      }
      body.hidden = !v;
      toggle.setAttribute("aria-expanded", String(v));
      li.classList.toggle("is-open", v);
      if (v) open.add(block.id); else open.delete(block.id);
    }
    toggle.addEventListener("click", () => setOpen(body.hidden));
    up.addEventListener("click", () => moveBlock(block, -1, up));
    down.addEventListener("click", () => moveBlock(block, 1, down));
    dup.addEventListener("click", () => duplicateBlock(block));
    del.addEventListener("click", () => deleteBlock(block));
    li.addEventListener("focusin", () => setActive(block.id, true));
    li.addEventListener("pointerdown", () => setActive(block.id, true));

    const card = {
      li, block, ctx, setOpen,
      focusFirst() {
        const t = body.querySelector("input:not([type=range]):not([type=checkbox]), textarea") || toggle;
        try { t.focus({ preventScroll: true }); } catch { t.focus(); }
        li.scrollIntoView({ block: "nearest", behavior: reduceMotion() ? "auto" : "smooth" });
      },
      position(i, n) {
        li.dataset.id = block.id;
        const label = `Khối ${i + 1}: ${meta.label}`;
        grip.setAttribute("aria-label", `Kéo để đổi chỗ — ${label}`);
        toggle.setAttribute("aria-label", `${label} — ${summary(block)}. Bấm để ${body.hidden ? "mở" : "đóng"} ô soạn`);
        up.setAttribute("aria-label", `Đưa ${label} lên trên`);
        down.setAttribute("aria-label", `Đưa ${label} xuống dưới`);
        dup.setAttribute("aria-label", `Nhân bản ${label}`);
        del.setAttribute("aria-label", `Xoá ${label}`);
        up.disabled = i === 0;
        down.disabled = i === n - 1;
        dup.disabled = n >= LIM.blocks;
        sum.textContent = summary(block);
      },
      grip, toggle,
    };
    setOpen(open.has(block.id));
    return card;
  }

  /* ============================================================
   *  Thao tác trang / khối
   * ============================================================ */
  function markChanged() {
    schedulePreview();
    K.refreshDirty();
  }

  function setActive(id, scroll) {
    if (activeId === id) return;
    activeId = id;
    for (const c of el.list.children) c.classList.toggle("is-active", c.dataset.id === id);
    highlightPreview(scroll);
  }

  function moveBlock(block, delta, btn) {
    const list = page().blocks;
    const from = list.indexOf(block);
    const to = from + delta;
    if (to < 0 || to >= list.length) return;
    K.moveItem(list, from, to);
    renderBlocks();
    markChanged();
    if (btn && !btn.disabled) btn.focus(); else cardFor(block).grip.focus();
  }

  function duplicateBlock(block) {
    const list = page().blocks;
    if (list.length >= LIM.blocks) { K.toast(`Mỗi trang tối đa ${LIM.blocks} khối`, "error"); return; }
    const copy = K.clone(block);
    copy.id = newBlockId();
    list.splice(list.indexOf(block) + 1, 0, copy);
    open.add(copy.id);
    renderBlocks();
    markChanged();
    setActive(copy.id, true);
    cardFor(copy).focusFirst();
    K.toast("Đã nhân bản khối");
  }

  async function deleteBlock(block) {
    if (hasContent(block)) {
      const ok = await K.dialog.confirm({
        title: "Xoá khối này?",
        message: `Khối “${typeMeta(block.type).label}” (${summary(block)}) sẽ bị bỏ khỏi trang. Thay đổi chỉ áp dụng khi bạn bấm “Lưu các trang”.`,
        ok: "Xoá khối", danger: true,
      });
      if (!ok) return;
    }
    const list = page().blocks;
    const i = list.indexOf(block);
    if (i < 0) return;
    list.splice(i, 1);
    open.delete(block.id);
    renderBlocks();
    markChanged();
    const next = list[i] || list[i - 1];
    if (next) cardFor(next).toggle.focus(); else el.addBtn.focus();
  }

  function addBlock(type) {
    const p = page();
    if (!p) return;
    if (p.blocks.length >= LIM.blocks) { K.toast(`Mỗi trang tối đa ${LIM.blocks} khối`, "error"); return; }
    const b = BP.blockDefaults(type);
    if (!b) return;
    p.blocks.push(b);
    open.add(b.id);
    renderBlocks();
    markChanged();
    setActive(b.id, true);
    cardFor(b).focusFirst();
  }

  function selectPage(i, focusChip) {
    if (i < 0 || i >= pages.length) return;
    sel = i;
    activeId = "";
    renderAll();
    if (focusChip) {
      const chip = el.nav.querySelectorAll(".pg-chip")[i];
      if (chip) chip.focus();
    }
  }
  function addPage() {
    if (pages.length >= LIM.pages) { K.toast(`Tối đa ${LIM.pages} trang tự soạn`, "error"); return; }
    pages.push(BP.newPage());
    sel = pages.length - 1;
    renderAll();
    markChanged();
    el.addBtn.focus();
    K.toast(`Đã thêm trang ${sel + FIRST_NO}`);
  }
  async function deletePage() {
    const p = page();
    if (!p) return;
    if (p.blocks.length) {
      const ok = await K.dialog.confirm({
        title: `Xoá trang ${sel + FIRST_NO}?`,
        message: `Trang này có ${p.blocks.length} khối nội dung. Các trang sau sẽ được đánh số lại. Thay đổi chỉ áp dụng khi bạn bấm “Lưu các trang”.`,
        ok: "Xoá trang", danger: true,
      });
      if (!ok) return;
    }
    pages.splice(sel, 1);
    scrollMemo.delete(p.id);
    sel = Math.max(0, Math.min(sel, pages.length - 1));
    renderAll();
    markChanged();
    const chip = el.nav.querySelectorAll(".pg-chip")[sel];
    (chip || el.nav.querySelector(".pg-add")).focus();
  }
  function movePage(delta) {
    const to = sel + delta;
    if (to < 0 || to >= pages.length) return;
    K.moveItem(pages, sel, to);
    sel = to;
    renderAll();
    markChanged();
    // nút vừa bấm bị vô hiệu (trang đã ở đầu / cuối) → focus sang nút còn lại, không để rơi về <body>
    const same = el.tools.querySelector(delta < 0 ? "[data-move='-1']" : "[data-move='1']");
    const other = el.tools.querySelector(delta < 0 ? "[data-move='1']" : "[data-move='-1']");
    const target = [same, other].find((b) => b && !b.disabled) || el.nav.querySelectorAll(".pg-chip")[sel];
    if (target) target.focus();
  }

  /* ============================================================
   *  Vẽ giao diện
   * ============================================================ */
  function renderNav() {
    el.nav.replaceChildren();
    pages.forEach((p, i) => {
      const chip = h("button", { class: "pg-chip", type: "button", "aria-pressed": String(i === sel), "aria-label": `Trang ${i + FIRST_NO}, ${p.blocks.length} khối` },
        h("span", { text: `Trang ${i + FIRST_NO}` }),
        h("span", { class: "pg-chip-count", "aria-hidden": "true", text: String(p.blocks.length) }));
      chip.addEventListener("click", () => selectPage(i, true));
      el.nav.appendChild(chip);
    });
    const add = h("button", { class: "pg-chip pg-add", type: "button", disabled: pages.length >= LIM.pages, title: pages.length >= LIM.pages ? `Tối đa ${LIM.pages} trang` : "Thêm trang mới" }, icon("plus"), "Trang mới");
    add.addEventListener("click", addPage);
    el.nav.appendChild(add);
  }

  function renderTools() {
    el.tools.replaceChildren();
    const p = page();
    if (!p) return;
    const left = h("button", { class: "btn btn-ghost btn-sm", type: "button", "data-move": "-1", disabled: sel === 0, "aria-label": "Dời trang sang trái (lên trước)" }, icon("chevron-left"), h("span", { class: "hide-xs", text: "Dời trái" }));
    const right = h("button", { class: "btn btn-ghost btn-sm", type: "button", "data-move": "1", disabled: sel === pages.length - 1, "aria-label": "Dời trang sang phải (ra sau)" }, h("span", { class: "hide-xs", text: "Dời phải" }), icon("chevron-right"));
    const del = h("button", { class: "btn btn-ghost btn-sm btn-danger", type: "button", "aria-label": `Xoá trang ${sel + FIRST_NO}` }, icon("trash"), h("span", { class: "hide-xs", text: "Xoá trang" }));
    left.addEventListener("click", () => movePage(-1));
    right.addEventListener("click", () => movePage(1));
    del.addEventListener("click", deletePage);
    el.tools.append(
      h("div", { class: "pg-tools-title" }, h("strong", { text: `Trang ${sel + FIRST_NO}` }), h("span", { class: "muted", text: ` · ${p.blocks.length}/${LIM.blocks} khối` })),
      h("div", { class: "pg-tools-actions" }, left, right, del));
  }

  function renderBlocks() {
    const p = page();
    const blocks = p ? p.blocks : [];
    const want = blocks.map(cardFor);
    const wantLi = new Set(want.map((c) => c.li));
    for (const li of Array.from(el.list.children)) if (!wantLi.has(li)) li.remove();
    want.forEach((c, i) => {
      if (el.list.children[i] !== c.li) el.list.insertBefore(c.li, el.list.children[i] || null);
      c.position(i, want.length);
      c.li.classList.toggle("is-active", c.block.id === activeId);
    });
    el.empty.hidden = !!(p && blocks.length) ;
    el.empty.replaceChildren();
    if (!p) {
      el.empty.append(
        h("p", { class: "pg-empty-title", text: "Chưa có trang tự soạn nào" }),
        h("p", { class: "muted", text: "Sách hiện có 2 trang cố định (hồ sơ + nhạc). Thêm trang để kể thêm về bạn: chữ, ảnh, bộ ảnh, trích dẫn…" }),
        h("button", { class: "btn btn-primary btn-sm", type: "button", onclick: addPage }, icon("plus"), "Tạo trang đầu tiên"));
    } else if (!blocks.length) {
      el.empty.append(h("p", { class: "pg-empty-title", text: `Trang ${sel + FIRST_NO} đang trống` }), h("p", { class: "muted", text: "Bấm “+ Thêm khối” để thêm tiêu đề, đoạn văn, ảnh…" }));
    }
    el.addWrap.hidden = !p;
    el.addBtn.disabled = !p || blocks.length >= LIM.blocks;
    renderTools();
    renderNavCounts();
  }
  function renderNavCounts() {
    const chips = el.nav.querySelectorAll(".pg-chip:not(.pg-add)");
    pages.forEach((p, i) => {
      const chip = chips[i];
      if (!chip) return;
      chip.querySelector(".pg-chip-count").textContent = String(p.blocks.length);
      chip.setAttribute("aria-label", `Trang ${i + FIRST_NO}, ${p.blocks.length} khối`);
    });
  }

  function renderAll() {
    renderNav();
    renderBlocks();
    renderPreview();
  }

  /* ============================================================
   *  Menu "+ Thêm khối"
   * ============================================================ */
  function buildAddMenu() {
    el.menu.replaceChildren();
    for (const t of BP.BLOCK_TYPES) {
      const item = h("button", { class: "add-item", type: "button", role: "menuitem", tabindex: "-1" },
        h("span", { class: "blk-icon", "aria-hidden": "true" }, icon(TYPE_ICON[t.type] || t.icon)),
        h("span", { class: "add-text" }, h("strong", { text: t.label }), h("small", { text: t.hint })));
      item.addEventListener("click", () => { closeMenu(); addBlock(t.type); });
      el.menu.appendChild(item);
    }
  }
  function openMenu() {
    el.menu.hidden = false;
    el.addBtn.setAttribute("aria-expanded", "true");
    const first = el.menu.querySelector(".add-item");
    if (first) first.focus();
    setTimeout(() => document.addEventListener("pointerdown", outside, true), 0);
  }
  function closeMenu(focusBtn) {
    if (el.menu.hidden) return;
    el.menu.hidden = true;
    el.addBtn.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", outside, true);
    if (focusBtn) el.addBtn.focus();
  }
  function outside(e) { if (!el.addWrap.contains(e.target)) closeMenu(false); }

  /* ============================================================
   *  XEM TRƯỚC — dựng đúng như trang chính bằng BookPages.createFace
   * ============================================================ */
  const schedulePreview = K.debounce(() => renderPreview(), 120);
  function previewVisible() { return mqWide.matches || mode === "preview"; }
  function canSpread() { return (el.viewport.clientWidth || 0) >= 560; }
  function isSpread() { return spreadPref === "2" && canSpread(); }

  function renderPreview() {
    if (!BP || !el.book) return;
    schedulePreview.cancel();
    el.spreadToggle.hidden = !canSpread();
    if (!previewVisible()) return;
    // nhớ vị trí cuộn để không bị nhảy khi dựng lại
    for (const f of el.book.querySelectorAll(".face")) {
      const body = f.querySelector(".face-body");
      if (body && f.dataset.pageId) scrollMemo.set(f.dataset.pageId, body.scrollTop);
    }
    const p = page();
    el.book.replaceChildren();
    if (!p) {
      el.book.className = "pv-book is-empty";
      el.book.appendChild(h("p", { class: "pv-empty", text: "Chưa có trang nào để xem trước" }));
      el.title.textContent = "Xem trước";
      updateScale();
      return;
    }
    const spread = isSpread();
    el.book.className = `pv-book ${spread ? "is-spread" : "is-single"}`;
    const faceIndex = sel + 2; // mặt 0 = hồ sơ, mặt 1 = nhạc
    const slots = spread
      ? (() => { const left = faceIndex % 2 === 0 ? sel : sel - 1; return [{ i: left, slot: "left" }, { i: left + 1, slot: "right" }]; })()
      : [{ i: sel, slot: "single" }];
    for (const s of slots) {
      const pg = pages[s.i];
      const no = s.i + FIRST_NO;
      const face = pg ? BP.createFace(pg, { pageNumber: no, preview: true }) : BP.createEndFace({ pageNumber: no });
      face.classList.add("pv-face", `pv-${s.slot}`);
      if (s.i === sel) face.classList.add("pv-current");
      else if (pg) {
        face.classList.add("pv-other");
        face.title = `Bấm để sửa trang ${no}`;
        face.addEventListener("click", () => selectPage(s.i));
      }
      el.book.appendChild(face);
      const body = face.querySelector(".face-body");
      if (pg && body && scrollMemo.has(pg.id)) body.scrollTop = scrollMemo.get(pg.id);
    }
    el.title.textContent = spread
      ? `Xem trước · trang ${slots[0].i + FIRST_NO}–${slots[1].i + FIRST_NO}${pages[slots[1].i] ? "" : " (trang lót cuối)"}`
      : `Xem trước · trang ${sel + FIRST_NO}`;
    updateScale();
    highlightPreview(false);
  }

  function updateScale() {
    const avail = el.viewport.clientWidth;
    if (!avail) return;
    if (el.book.classList.contains("is-empty")) {
      for (const s of [el.book.style, el.scaler.style]) { s.width = ""; s.height = ""; s.transform = ""; }
      return;
    }
    const spread = el.book.classList.contains("is-spread");
    if (!spread && mqPhone.matches) {
      // điện thoại: đúng cỡ trang thật trên điện thoại (không thu nhỏ)
      const hgt = Math.round(K.clamp(window.innerHeight - 170, 480, 760));
      el.book.style.width = `${avail}px`;
      el.book.style.height = `${hgt}px`;
      el.book.style.transform = "none";
      el.scaler.style.width = `${avail}px`;
      el.scaler.style.height = `${hgt}px`;
      return;
    }
    const natW = (spread ? PAGE_W * 2 : PAGE_W) + COVER * 2;
    const natH = PAGE_H + COVER * 2;
    const s = Math.min(1, avail / natW);
    el.book.style.width = `${natW}px`;
    el.book.style.height = `${natH}px`;
    el.book.style.transform = `scale(${s})`;
    el.scaler.style.width = `${Math.floor(natW * s)}px`;
    el.scaler.style.height = `${Math.floor(natH * s)}px`;
  }

  function highlightPreview(scroll) {
    if (!el.book) return;
    for (const x of el.book.querySelectorAll(".pv-hl")) x.classList.remove("pv-hl");
    if (!activeId) return;
    const face = el.book.querySelector(".pv-current");
    if (!face) return;
    const target = Array.from(face.querySelectorAll(".bp-block")).find((x) => x.dataset.blockId === activeId);
    if (!target) return;
    target.classList.add("pv-hl");
    if (scroll) {
      const body = face.querySelector(".face-body");
      if (!body) return;
      const top = target.offsetTop;
      const bottom = top + target.offsetHeight;
      if (top < body.scrollTop + 12 || bottom > body.scrollTop + body.clientHeight - 12) {
        body.scrollTo({ top: Math.max(0, top - 24), behavior: reduceMotion() ? "auto" : "smooth" });
      }
    }
  }

  function setMode(m) {
    mode = m;
    el.layout.dataset.mode = m;
    for (const b of el.mode.querySelectorAll("[data-mode]")) b.setAttribute("aria-pressed", String(b.dataset.mode === m));
    if (m === "preview") renderPreview();
  }

  /* ============================================================
   *  Lưu / nạp
   * ============================================================ */
  async function save() {
    if (!BP) return;
    if (uploads) { K.toast("Đợi ảnh tải lên xong rồi lưu nhé"); return; }
    const normalized = BP.normalizePages(pages);
    const sentJson = JSON.stringify(normalized);
    try {
      const content = await K.saveContent({ pages: normalized });
      if (uploads || normalizedJson() !== sentJson) {
        // có sửa / tải ảnh trong lúc đang lưu → giữ nguyên chỗ đang soạn, phần mới sửa vẫn tính là chưa lưu
        const src = content && Array.isArray(content.pages) ? content.pages : normalized;
        savedJson = JSON.stringify(BP.normalizePages(K.clone(src)));
        K.refreshDirty();
      } else {
        load(content, { force: true });
      }
      K.toast("Đã lưu các trang sách ✓", "success");
    } catch (err) {
      if (err.status !== 401) K.toast(err.message, "error");
    }
  }

  async function resetDefault() {
    const ok = await K.dialog.confirm({
      title: "Khôi phục trang mặc định?",
      message: "Các trang tự soạn sẽ quay về như trong file config.js. Ảnh đã tải lên mà không còn dùng sẽ bị xoá khỏi kho tệp.",
      ok: "Khôi phục", danger: true,
    });
    if (!ok) return;
    try {
      const content = await K.saveContent({ pages: null });
      load(content, { force: true });
      K.toast("Đã khôi phục trang mặc định", "success");
    } catch (err) {
      if (err.status !== 401) K.toast(err.message, "error");
    }
  }

  function load(content, { force } = {}) {
    if (!BP) return;
    if (!force && ready && isDirty()) return;
    const src = content && Array.isArray(content.pages) ? content.pages : K.state.config.pages;
    const keepId = page() ? page().id : "";
    pages = BP.normalizePages(K.clone(Array.isArray(src) ? src : []));
    savedJson = normalizedJson();
    ready = true;
    const again = pages.findIndex((p) => p.id === keepId);
    sel = again >= 0 ? again : Math.min(sel, Math.max(0, pages.length - 1));
    el.list.replaceChildren();
    renderAll();
    K.refreshDirty();
  }
  function discard() { load(K.state.content, { force: true }); }

  function init() {
    el = {
      nav: $("#pgNav"), tools: $("#pgTools"), list: $("#blockList"), empty: $("#pgEmpty"),
      addWrap: $("#addBlock"), addBtn: $("#addBlockBtn"), menu: $("#addBlockMenu"),
      layout: $("#pgLayout"), mode: $("#pgMode"), preview: $("#pgPreview"), viewport: $("#pvViewport"),
      scaler: $("#pvScaler"), book: $("#pvBook"), title: $("#pvTitle"), spreadToggle: $("#pvSpreadToggle"),
      imageFile: $("#blockImageFile"), galleryFiles: $("#galleryFiles"),
    };
    if (!BP) {
      const box = $("#tab-trang-sach [data-load-error]");
      box.hidden = false;
      box.textContent = "Không nạp được js/pages.js nên chưa soạn trang được. Hãy tải lại trang.";
      el.layout.hidden = true;
      return;
    }
    buildAddMenu();
    el.addBtn.addEventListener("click", () => (el.menu.hidden ? openMenu() : closeMenu(true)));
    el.menu.addEventListener("keydown", (e) => {
      const items = Array.from(el.menu.querySelectorAll(".add-item"));
      const i = items.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (e.key === "Home") { e.preventDefault(); items[0].focus(); }
      else if (e.key === "End") { e.preventDefault(); items[items.length - 1].focus(); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
      else if (e.key === "Tab") closeMenu(false);
    });

    K.sortable(el.list, {
      item: ".blk",
      handle: ".blk-grip",
      onMove(from, to) {
        const list = page().blocks;
        const block = list[from];
        K.moveItem(list, from, to);
        renderBlocks();
        markChanged();
        const c = cardFor(block);
        if (document.activeElement !== c.grip) c.grip.focus({ preventScroll: true });
      },
    });

    for (const b of el.mode.querySelectorAll("[data-mode]")) b.addEventListener("click", () => setMode(b.dataset.mode));
    for (const b of el.spreadToggle.querySelectorAll("[data-spread]")) {
      b.addEventListener("click", () => {
        spreadPref = b.dataset.spread;
        for (const x of el.spreadToggle.querySelectorAll("[data-spread]")) x.setAttribute("aria-pressed", String(x === b));
        renderPreview();
      });
    }
    // bấm vào 1 khối trong bản xem trước → mở ô soạn của khối đó
    el.book.addEventListener("click", (e) => {
      const blockEl = e.target.closest(".pv-current .bp-block");
      if (!blockEl) return;
      e.preventDefault();
      const p = page();
      const block = p && p.blocks.find((b) => b.id === blockEl.dataset.blockId);
      if (!block) return;
      const c = cardFor(block);
      c.setOpen(true);
      setActive(block.id, false);
      if (!mqWide.matches) setMode("edit");
      c.focusFirst();
    });
    let lastSpread = null;
    const onResize = () => {
      const now = canSpread();
      if (now !== lastSpread) { lastSpread = now; renderPreview(); } else updateScale();
    };
    if (typeof ResizeObserver === "function") new ResizeObserver(onResize).observe(el.viewport);
    window.addEventListener("resize", onResize);
    mqWide.addEventListener("change", () => renderPreview());

    // dán ảnh vào khối ảnh / bộ ảnh đang chọn
    document.addEventListener("paste", (e) => {
      if (K.activeTab !== ID || document.querySelector(".admin-dialog")) return;
      const file = K.images.fromTransfer(e.clipboardData);
      if (!file) return;
      const li = document.activeElement && document.activeElement.closest ? document.activeElement.closest(".blk") : null;
      const p = page();
      const block = li && p && p.blocks.find((b) => b.id === li.dataset.id);
      const card = block && cards.get(block);
      if (!card || !card.ctx.onPasteImage) return;
      e.preventDefault();
      card.ctx.onPasteImage(file);
    });

    $("#pagesReset").addEventListener("click", resetDefault);
    setMode("edit");
    K.bindSavebar(ID, { save, discard, isDirty, busy: () => uploads });
  }

  K.registerTab(ID, {
    title: "Trang sách",
    init,
    load,
    save,
    isDirty,
    busy: () => uploads,
    onShow: () => renderPreview(),
    draft: () => JSON.stringify(pages),
  });
})();
