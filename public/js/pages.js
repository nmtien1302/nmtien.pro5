/* ============================================================
 *  pages.js — dựng "trang sách tự soạn" từ các khối nội dung
 *  (tiêu đề, đoạn văn, ảnh, bộ ảnh, trích dẫn, đường kẻ, khoảng trống).
 *  Dùng chung cho trang chính (main.js) và phần xem trước trong admin.
 *  Nạp file này KHÔNG tự chạy gì: chỉ tạo window.BookPages.
 *  Chạy được cả trong Node (module.exports) để kiểm thử các hàm thuần.
 * ============================================================ */
(function (factory) {
  "use strict";
  const g = typeof window !== "undefined" ? window : globalThis;
  const api = factory(g);
  if (typeof module === "object" && module && module.exports) module.exports = api;
  else g.BookPages = api;
})(function (g) {
  "use strict";

  /* ============================================================
   *  1. GIỚI HẠN + GIÁ TRỊ HỢP LỆ (khớp với chuẩn hoá ở server.js)
   * ============================================================ */
  const LIMITS = Object.freeze({
    pages: 20, blocks: 60, galleryImages: 12, id: 64, url: 2048,
    heading: 200, text: 5000, alt: 200, caption: 300, quote: 1000, cite: 120,
    widthMin: 20, widthMax: 100, tiltMin: -8, tiltMax: 8,
  });
  const ENUMS = Object.freeze({
    level: Object.freeze([1, 2, 3]),
    align: Object.freeze(["left", "center", "right"]),
    textAlign: Object.freeze(["left", "center", "right", "justify"]),
    size: Object.freeze(["sm", "md", "lg"]),
    imageFrame: Object.freeze(["none", "frame", "round", "circle", "polaroid"]),
    galleryFrame: Object.freeze(["none", "frame", "round", "polaroid"]),
    columns: Object.freeze([2, 3, 4]),
    dividerStyle: Object.freeze(["ornament", "line", "dots"]),
  });

  /* Danh sách loại khối (theo thứ tự trong menu "Thêm khối" của admin).
   * icon: tên trong assets/icons/sprite.svg; glyph: ký tự thay thế nếu cần. */
  const BLOCK_TYPES = Object.freeze([
    { type: "heading", label: "Tiêu đề", icon: "star", glyph: "H", hint: "Tên chương, tên mục — 3 cỡ chữ, căn trái / giữa / phải" },
    { type: "text", label: "Đoạn văn", icon: "playlist", glyph: "¶", hint: "Viết chữ: **đậm**, *nghiêng*, __gạch chân__, [liên kết](https://…); dòng bắt đầu bằng “- ” thành danh sách" },
    { type: "image", label: "Ảnh", icon: "sun", glyph: "▣", hint: "Một tấm ảnh: căn lề, cỡ, khung viền, chữ chạy quanh ảnh" },
    { type: "gallery", label: "Bộ ảnh", icon: "eye", glyph: "▦", hint: "Nhiều ảnh xếp lưới 2–4 cột, bấm vào để xem lớn" },
    { type: "quote", label: "Trích dẫn", icon: "heart", glyph: "❝", hint: "Một câu nói hay kèm tên người nói" },
    { type: "divider", label: "Đường kẻ", icon: "sparkles", glyph: "✦", hint: "Hoa văn ✦ ✦ ✦, nét kẻ đôi hoặc hàng chấm để ngăn đoạn" },
    { type: "spacer", label: "Khoảng trống", icon: "chevron-down", glyph: "↕", hint: "Chừa một khoảng trống nhỏ / vừa / lớn" },
  ].map((t) => Object.freeze(t)));

  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

  /* ---------- id ngắn 8 ký tự hex (như server: randomUUID().slice(0, 8)) ---------- */
  function newId() {
    const c = g.crypto;
    try {
      if (c && typeof c.randomUUID === "function") return c.randomUUID().slice(0, 8);
    } catch { /* randomUUID chỉ có trên https / localhost — dùng cách khác */ }
    const bytes = new Uint8Array(4);
    if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  /* ============================================================
   *  2. ĐƯỜNG DẪN AN TOÀN (cùng luật Url với server)
   * ============================================================ */
  const RE_MEDIA = /^media\/[a-f0-9]{24}\.(jpg|png|gif|webp|avif|mp3|m4a|ogg|oga|wav|flac|aac|webm)$/;
  const RE_ASSET = /^assets\/[^<>"'\\\u0000-\u001f]+$/;
  const RE_HTTP = /^https?:\/\/[^\s<>"']+$/i;
  const RE_MAILTO = /^mailto:[^\s<>"']+$/i;

  // Có đoạn ".." (kể cả dạng mã hoá %2e%2e mà trình duyệt vẫn hiểu là "..") → từ chối
  const hasDotDot = (u) => u.split("/").some((seg) => seg.replace(/%2e/gi, ".") === "..");

  /** safeUrl(url, kind): trả lại url (đã cắt khoảng trắng hai đầu) nếu hợp lệ, ngược lại "".
   *  kind "link"  → chỉ http / https / mailto (liên kết trong chữ)
   *  kind khác    → luật Url của nội dung: media/…, assets/…, http(s)://… */
  function safeUrl(url, kind) {
    if (typeof url !== "string") return "";
    const u = url.trim();
    if (!u || u.length > LIMITS.url) return "";
    if (kind === "link") return RE_HTTP.test(u) || RE_MAILTO.test(u) ? u : "";
    if (RE_MEDIA.test(u)) return u;
    if (RE_ASSET.test(u)) return hasDotDot(u) ? "" : u;
    return RE_HTTP.test(u) ? u : "";
  }

  /* ============================================================
   *  3. CHUẨN HOÁ DỮ LIỆU (bản sao phía trình duyệt của luật trên server)
   * ============================================================ */
  // Cắt chuỗi theo giới hạn, không để sót nửa ký tự emoji (cặp surrogate) ở cuối
  function cut(s, max) {
    if (s.length <= max) return s;
    const out = s.slice(0, max);
    return /[\uD800-\uDBFF]$/.test(out) ? out.slice(0, -1) : out;
  }
  const str = (v, max) => (typeof v === "string" ? cut(v.trim(), max) : "");
  const num = (v) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
  function oneOf(v, list, def) {
    const val = typeof list[0] === "number" ? num(v) : v;
    return list.includes(val) ? val : def;
  }
  function intIn(v, min, max, def) {
    const n = num(v);
    if (!Number.isFinite(n)) return def;
    return Math.min(max, Math.max(min, Math.round(n))) || 0; // "|| 0" bỏ -0
  }
  function takeId(v, used) {
    let id = typeof v === "string" ? cut(v.trim(), LIMITS.id) : "";
    while (!id || used.has(id)) id = newId();
    used.add(id);
    return id;
  }

  const NORMALIZERS = {
    heading: (b) => ({
      text: str(b.text, LIMITS.heading),
      level: oneOf(b.level, ENUMS.level, 2),
      align: oneOf(b.align, ENUMS.align, "center"),
    }),
    text: (b) => ({
      text: str(b.text, LIMITS.text),
      align: oneOf(b.align, ENUMS.textAlign, "left"),
      size: oneOf(b.size, ENUMS.size, "md"),
      italic: b.italic === true,
      dropcap: b.dropcap === true,
    }),
    image: (b) => ({
      src: safeUrl(b.src, "image"),
      alt: str(b.alt, LIMITS.alt),
      caption: str(b.caption, LIMITS.caption),
      align: oneOf(b.align, ENUMS.align, "left"),
      width: intIn(b.width, LIMITS.widthMin, LIMITS.widthMax, 100),
      wrap: b.wrap === true,
      frame: oneOf(b.frame, ENUMS.imageFrame, "none"),
      tilt: intIn(b.tilt, LIMITS.tiltMin, LIMITS.tiltMax, 0),
    }),
    gallery: (b) => ({
      images: (Array.isArray(b.images) ? b.images : [])
        .filter(isObj)
        .slice(0, LIMITS.galleryImages)
        .map((im) => ({ src: safeUrl(im.src, "image"), alt: str(im.alt, LIMITS.alt), caption: str(im.caption, LIMITS.caption) })),
      columns: oneOf(b.columns, ENUMS.columns, 2),
      frame: oneOf(b.frame, ENUMS.galleryFrame, "none"),
    }),
    quote: (b) => ({
      text: str(b.text, LIMITS.quote),
      cite: str(b.cite, LIMITS.cite),
      align: oneOf(b.align, ENUMS.align, "left"),
    }),
    divider: (b) => ({ style: oneOf(b.style, ENUMS.dividerStyle, "ornament") }),
    spacer: (b) => ({ size: oneOf(b.size, ENUMS.size, "md") }),
  };

  const isBlockType = (t) => typeof t === "string" && hasOwn(NORMALIZERS, t);

  /** Chuẩn hoá 1 khối → khối mới hợp lệ, hoặc null nếu không nhận ra loại khối */
  function normalizeBlock(b, used) {
    if (!isObj(b) || !isBlockType(b.type)) return null;
    return { id: takeId(b.id, used || new Set()), type: b.type, ...NORMALIZERS[b.type](b) };
  }

  function normalizeBlocks(list, used) {
    const out = [];
    if (!Array.isArray(list)) return out;
    const ids = used || new Set();
    for (const b of list) {
      if (out.length >= LIMITS.blocks) break;
      const nb = normalizeBlock(b, ids);
      if (nb) out.push(nb);
    }
    return out;
  }

  /** Chuẩn hoá 1 trang: { id, blocks ≤ 60 } — bỏ khoá lạ, bỏ khối lạ, sửa giá trị sai về mặc định */
  function normalizePage(p) {
    const src = isObj(p) ? p : {};
    return { id: takeId(src.id, new Set()), blocks: normalizeBlocks(src.blocks) };
  }

  /** Chuẩn hoá cả danh sách trang (≤ 20 trang, id trang không trùng nhau) */
  function normalizePages(list) {
    if (!Array.isArray(list)) return [];
    const used = new Set();
    return list.filter(isObj).slice(0, LIMITS.pages).map((p) => {
      const page = normalizePage(p);
      page.id = takeId(page.id, used);
      return page;
    });
  }

  /* ---------- khối mới / trang mới cho admin ---------- */
  const DEFAULTS = {
    heading: () => ({ text: "", level: 2, align: "center" }),
    text: () => ({ text: "", align: "justify", size: "md", italic: false, dropcap: false }),
    image: () => ({ src: "", alt: "", caption: "", align: "center", width: 80, wrap: false, frame: "frame", tilt: 0 }),
    gallery: () => ({ images: [], columns: 3, frame: "polaroid" }),
    quote: () => ({ text: "", cite: "", align: "center" }),
    divider: () => ({ style: "ornament" }),
    spacer: () => ({ size: "md" }),
  };
  function blockDefaults(type) {
    if (!isBlockType(type)) return null;
    return { id: newId(), type, ...DEFAULTS[type]() };
  }
  const newPage = () => ({ id: newId(), blocks: [] });

  /* ============================================================
   *  4. ĐỊNH DẠNG CHỮ TRONG DÒNG
   *  **đậm**  *nghiêng*  __gạch chân__  [chữ](https://…)  xuống dòng
   *  Luôn thoát HTML TRƯỚC, sau đó mới nhận diện ký hiệu → không bao giờ lọt thẻ lạ.
   * ============================================================ */
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const UNESC = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" };
  const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
  const unescapeHtml = (s) => s.replace(/&(amp|lt|gt|quot|#39);/g, (_, k) => UNESC[k]);

  const RE_WS = /\s/u;
  const RE_PUNCT = /[\p{P}\p{S}]/u;
  const isWs = (ch) => ch === "" || RE_WS.test(ch);
  const isPunct = (ch) => ch !== "" && RE_PUNCT.test(ch);
  // Ký tự (cả emoji) ngay trước vị trí i / tại vị trí i
  function charBefore(s, i) {
    if (i <= 0) return "";
    const lo = s.charCodeAt(i - 1);
    if (lo >= 0xdc00 && lo <= 0xdfff && i >= 2) {
      const hi = s.charCodeAt(i - 2);
      if (hi >= 0xd800 && hi <= 0xdbff) return s.slice(i - 2, i);
    }
    return s[i - 1];
  }
  const charAt = (s, i) => (i < s.length ? String.fromCodePoint(s.codePointAt(i)) : "");

  // Cụm * hoặc _ có mở / đóng được không (theo luật "flanking" của CommonMark, rút gọn)
  function flanking(before, after, ch) {
    const left = !isWs(after) && (!isPunct(after) || isWs(before) || isPunct(before));
    const right = !isWs(before) && (!isPunct(before) || isWs(after) || isPunct(after));
    if (ch === "_") {
      return { open: left && (!right || isPunct(before)), close: right && (!left || isPunct(after)) };
    }
    return { open: left, close: right };
  }

  // [chữ](url) bắt đầu tại s[i] === "[" — s đã được thoát HTML
  function matchLink(s, i) {
    let j = i + 1;
    while (j < s.length && s[j] !== "]" && s[j] !== "[" && s[j] !== "\n") j++;
    if (s[j] !== "]" || s[j + 1] !== "(") return null;
    let k = j + 2;
    let depth = 0;
    for (; k < s.length; k++) {
      const c = s[k];
      if (c === "(") depth++;
      else if (c === ")") { if (depth === 0) break; depth--; }
      else if (RE_WS.test(c)) return null;
    }
    if (s[k] !== ")") return null;
    const href = safeUrl(unescapeHtml(s.slice(j + 2, k)), "link");
    if (!href) return null;
    const label = s.slice(i + 1, j);
    const inner = label.trim() ? formatRun(label, false) : escapeHtml(href);
    const external = /^https?:/i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : "";
    return { end: k + 1, html: `<a class="bp-link" href="${escapeHtml(href)}"${external}>${inner}</a>` };
  }

  // Tách chuỗi (đã thoát) thành các mảnh: chữ, HTML liên kết, dấu * / __
  function tokenize(s, allowLinks) {
    const toks = [];
    let i = 0;
    let textStart = 0;
    const flush = (end) => { if (end > textStart) toks.push(s.slice(textStart, end)); };
    while (i < s.length) {
      const c = s[i];
      if (c === "[" && allowLinks) {
        const link = matchLink(s, i);
        if (link) {
          flush(i);
          toks.push(link.html);
          i = textStart = link.end;
          continue;
        }
      } else if (c === "*" || c === "_") {
        let j = i;
        while (j < s.length && s[j] === c) j++;
        const n = j - i;
        if ((c === "*" && n <= 3) || (c === "_" && n === 2)) {
          const f = flanking(charBefore(s, i), charAt(s, j), c);
          if (f.open || f.close) {
            flush(i);
            toks.push({ ch: c, n, open: f.open, close: f.close });
            i = textStart = j;
            continue;
          }
        }
        i = j; // cụm dấu không dùng được → giữ nguyên là chữ
        continue;
      }
      i++;
    }
    flush(s.length);
    return toks;
  }

  const literal = (x) => (typeof x === "string" ? x : x.ch.repeat(x.n));

  // Ghép cặp dấu mở / đóng bằng ngăn xếp → thẻ luôn lồng nhau đúng thứ tự
  function formatRun(s, allowLinks) {
    const out = [];
    const openers = []; // vị trí (trong out) của các dấu có thể mở
    for (const tok of tokenize(s, allowLinks)) {
      if (typeof tok === "string") { out.push(tok); continue; }
      const d = { ...tok };
      if (d.close) {
        while (d.n > 0) {
          let si = openers.length - 1;
          while (si >= 0 && out[openers[si]].ch !== d.ch) si--;
          if (si < 0) break;
          const oi = openers[si];
          const o = out[oi];
          const use = d.n >= 2 && o.n >= 2 ? 2 : 1;
          const tag = d.ch === "_" ? "u" : use === 2 ? "strong" : "em";
          const inner = out.splice(oi + 1).map(literal).join("");
          openers.length = si + 1; // dấu mở nằm giữa không có cặp → thành chữ thường
          o.n -= use;
          d.n -= use;
          if (o.n === 0) { out.pop(); openers.pop(); }
          out.push(`<${tag}>${inner}</${tag}>`);
        }
        if (d.n === 0) continue;
      }
      if (d.open) openers.push(out.length);
      out.push(d);
    }
    return out.map(literal).join("");
  }

  /** inline(text) → chuỗi HTML AN TOÀN (đã thoát), giữ xuống dòng bằng <br> */
  function inline(text) {
    if (text === null || text === undefined) return "";
    let s = String(text);
    try { s = s.normalize("NFC"); } catch { /* chuỗi lỗi mã hoá: giữ nguyên */ }
    s = s.replace(/\r\n?/g, "\n");
    return formatRun(escapeHtml(s), true).replace(/\n/g, "<br>");
  }

  /* Đoạn văn: dòng trống = sang đoạn mới; các dòng liền nhau bắt đầu bằng "- " = danh sách */
  function splitText(text) {
    const parts = [];
    let cur = null;
    for (const line of String(text || "").replace(/\r\n?/g, "\n").split("\n")) {
      const bullet = /^[ \t]*- (.*)$/.exec(line);
      if (bullet) {
        if (!cur || cur.type !== "ul") parts.push((cur = { type: "ul", items: [] }));
        if (bullet[1].trim()) cur.items.push(bullet[1]);
      } else if (!line.trim()) {
        cur = null;
      } else {
        if (!cur || cur.type !== "p") parts.push((cur = { type: "p", lines: [] }));
        cur.lines.push(line);
      }
    }
    return parts.filter((p) => (p.type === "ul" ? p.items.length : p.lines.length));
  }

  /* ---------- chữ cái lớn đầu đoạn (drop cap) ---------- */
  let segmenter;
  function graphemes(s, max) {
    if (segmenter === undefined) {
      try {
        segmenter = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter("vi", { granularity: "grapheme" }) : null;
      } catch { segmenter = null; }
    }
    const out = [];
    if (segmenter) {
      for (const { segment } of segmenter.segment(s)) {
        out.push(segment);
        if (out.length >= max) break;
      }
      return out;
    }
    // dự phòng: 1 ký tự gốc + các dấu kết hợp đi sau (chữ Việt dạng tổ hợp)
    const re = /\P{M}\p{M}*/gu;
    let m;
    while (out.length < max && (m = re.exec(s))) out.push(m[0]);
    return out;
  }
  // Lấy cụm chữ đầu: tối đa 2 dấu câu mở đầu (“ « …) + 1 chữ / số. Mở đầu bằng emoji → không làm drop cap.
  function leadingCap(s) {
    let cap = "";
    let punct = 0;
    for (const gr of graphemes(s.slice(0, 48), 4)) {
      if (/^\p{P}/u.test(gr) && punct < 2) { cap += gr; punct++; continue; }
      return /^[\p{L}\p{N}]/u.test(gr) ? cap + gr : "";
    }
    return "";
  }

  /* ============================================================
   *  5. DỰNG KHỐI (DOM thuần, không phụ thuộc main.js)
   * ============================================================ */
  function make(doc, tag, cls, text) {
    const el = doc.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined && text !== null) el.textContent = text;
    return el;
  }
  function hiddenGlyph(doc, cls, text) {
    const el = make(doc, "span", cls, text);
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  function applyDropcap(p, doc) {
    const walker = doc.createTreeWalker(p, 4 /* NodeFilter.SHOW_TEXT */);
    let node = walker.nextNode();
    while (node && !node.data.trim()) node = walker.nextNode();
    if (!node) return;
    const lead = node.data.length - node.data.replace(/^\s+/, "").length;
    const cap = leadingCap(node.data.slice(lead));
    if (!cap) return;
    const capNode = lead ? node.splitText(lead) : node;
    capNode.splitText(cap.length);
    const span = make(doc, "span", "bp-dropcap", cap);
    capNode.replaceWith(span);
    p.classList.add("has-dropcap");
    // chữ có dấu phía trên (Ấ, Ở, Ễ…) cao hơn → chừa thêm khoảng phía trên để dấu không chạm khối trước
    if (/[\u0300-\u0322\u0324-\u036f]/.test(cap.normalize("NFD"))) p.classList.add("cap-marks");
  }

  function missingBox(doc, text) {
    const box = make(doc, "span", "bp-img-missing");
    box.setAttribute("role", "img");
    box.setAttribute("aria-label", text);
    box.append(hiddenGlyph(doc, "bp-img-missing-orn", "✦"), make(doc, "span", "bp-img-missing-text", text));
    return box;
  }

  // Ảnh lỗi (link chết, file bị xoá) → khung giấy báo nhẹ nhàng thay cho icon ảnh vỡ
  function markBroken(fig, img, doc) {
    if (fig.classList.contains("bp-broken")) return;
    fig.classList.add("bp-broken");
    for (const a of ["tabindex", "role", "aria-haspopup", "aria-label", "data-bp-zoom"]) img.removeAttribute(a);
    const box = fig.querySelector(".bp-img-box");
    if (box) box.appendChild(missingBox(doc, "Không tải được ảnh"));
  }

  function buildFigure(doc, item, frame, o) {
    const fig = make(doc, "figure", `bp-img frame-${frame}`);
    const box = make(doc, "span", "bp-img-box");
    if (item.src) {
      const img = doc.createElement("img");
      // trang thật: tải lười (đặt trước src mới có tác dụng); xem trước trong admin: tải ngay cho khỏi nháy khi gõ
      img.loading = o.preview ? "eager" : "lazy";
      img.decoding = o.preview ? "auto" : "async";
      img.draggable = false;
      img.alt = item.alt || "";
      img.addEventListener("error", () => markBroken(fig, img, doc), { once: true });
      img.src = item.src;
      box.appendChild(img);
    } else {
      fig.classList.add("bp-noimg");
      box.appendChild(missingBox(doc, "Chưa chọn ảnh"));
    }
    fig.appendChild(box);
    if (item.caption) {
      const cap = make(doc, "figcaption", "bp-caption");
      cap.innerHTML = inline(item.caption); // inline() đã thoát HTML
      fig.appendChild(cap);
      fig.classList.add("has-caption");
    }
    return fig;
  }

  const RENDERERS = {
    heading(b, doc, o) {
      if (!b.text && !o.preview) return null;
      const el = make(doc, `h${b.level + 1}`, `bp-heading bp-h${b.level} align-${b.align}`); // h2–h4: trang chỉ có 1 h1 (tên)
      el.appendChild(make(doc, "span", "bp-heading-text", b.text || "Tiêu đề trống"));
      if (!b.text) el.classList.add("bp-placeholder");
      if (b.level === 1) {
        const orn = make(doc, "span", "bp-heading-orn");
        orn.setAttribute("aria-hidden", "true");
        orn.appendChild(make(doc, "i", "", "✦"));
        el.appendChild(orn);
      }
      return el;
    },

    text(b, doc, o) {
      const parts = splitText(b.text);
      const el = make(doc, "div", `bp-text size-${b.size} align-${b.align}${b.italic ? " italic" : ""}${b.dropcap ? " dropcap" : ""}`);
      if (!parts.length) {
        if (!o.preview) return null;
        el.classList.add("bp-placeholder");
        el.appendChild(make(doc, "p", "", "Đoạn văn trống — gõ nội dung ở khung soạn thảo."));
        return el;
      }
      for (const part of parts) {
        if (part.type === "ul") {
          const ul = make(doc, "ul", "bp-list");
          for (const item of part.items) {
            const li = make(doc, "li");
            li.innerHTML = inline(item);
            ul.appendChild(li);
          }
          el.appendChild(ul);
        } else {
          const p = make(doc, "p");
          p.innerHTML = inline(part.lines.join("\n"));
          el.appendChild(p);
        }
      }
      if (b.dropcap && el.firstElementChild && el.firstElementChild.tagName === "P") applyDropcap(el.firstElementChild, doc);
      return el;
    },

    image(b, doc, o) {
      if (!b.src && !o.preview) return null;
      const fig = buildFigure(doc, b, b.frame, o);
      fig.classList.add(`align-${b.align}`);
      if (b.wrap && b.align !== "center") fig.classList.add("wrap");
      if (b.width > 45) fig.classList.add("wide"); // điện thoại: ảnh rộng thì thôi cho chữ chạy quanh (cột chữ còn lại quá hẹp)
      fig.style.width = `${b.width}%`;
      if (b.tilt) {
        fig.classList.add("tilted");
        fig.style.setProperty("--bp-tilt", `${b.tilt}deg`);
      }
      return fig;
    },

    gallery(b, doc, o) {
      const items = o.preview ? b.images : b.images.filter((im) => im.src);
      const el = make(doc, "div", `bp-gallery cols-${b.columns} frame-${b.frame}`);
      if (!items.length) {
        if (!o.preview) return null;
        el.classList.add("bp-placeholder-box");
        el.appendChild(missingBox(doc, "Bộ ảnh chưa có ảnh nào"));
        return el;
      }
      el.setAttribute("role", "group");
      el.setAttribute("aria-label", `Bộ ảnh, ${items.length} ảnh`);
      for (const im of items) {
        const fig = buildFigure(doc, im, b.frame, o);
        fig.classList.add("bp-gallery-item");
        el.appendChild(fig);
      }
      return el;
    },

    quote(b, doc, o) {
      if (!b.text && !o.preview) return null;
      const el = make(doc, "blockquote", `bp-quote align-${b.align}`);
      const text = make(doc, "p", "bp-quote-text");
      if (b.text) text.innerHTML = inline(b.text);
      else {
        el.classList.add("bp-placeholder");
        text.textContent = "Câu trích dẫn trống";
      }
      el.append(hiddenGlyph(doc, "bp-quote-mark", "“"), text);
      const cite = b.cite.replace(/^[\s\-–—]+/, "");
      if (cite) el.appendChild(make(doc, "footer", "bp-quote-cite", `— ${cite}`));
      return el;
    },

    divider(b, doc) {
      const el = make(doc, "div", `bp-divider style-${b.style}`);
      el.setAttribute("role", "separator");
      if (b.style === "ornament") el.appendChild(hiddenGlyph(doc, "bp-divider-orn", "✦ ✦ ✦"));
      return el;
    },

    spacer(b, doc) {
      const el = make(doc, "div", `bp-spacer size-${b.size}`);
      el.setAttribute("aria-hidden", "true");
      return el;
    },
  };

  /** renderBlocks(blocks, container, { preview }) → thay toàn bộ nội dung container bằng các khối.
   *  preview: true (xem trước trong admin) → khối chưa có nội dung / ảnh vẫn hiện khung mờ để dễ thấy,
   *  ảnh tải ngay (không tải lười) để không nháy khi dựng lại liên tục.
   *  Trả về số khối đã dựng. */
  function renderBlocks(blocks, container, opts) {
    if (!container || typeof container.replaceChildren !== "function") {
      throw new TypeError("BookPages.renderBlocks: cần một phần tử DOM để chứa các khối");
    }
    const o = opts || {};
    const doc = container.ownerDocument || g.document;
    const frag = doc.createDocumentFragment();
    let count = 0;
    for (const b of normalizeBlocks(blocks)) {
      let el = null;
      try {
        el = RENDERERS[b.type](b, doc, o);
      } catch (err) {
        if (g.console) g.console.warn("BookPages: không dựng được khối", b.type, err);
      }
      if (!el) continue;
      el.classList.add("bp-block");
      el.dataset.blockId = b.id;
      el.dataset.blockType = b.type;
      frag.appendChild(el);
      count++;
    }
    container.classList.add("bp-blocks");
    container.replaceChildren(frag);
    return count;
  }

  /* ============================================================
   *  6. MẶT TRANG (cùng cấu trúc với 2 trang cố định trong index.html)
   * ============================================================ */
  function frameEl(doc) {
    const frame = make(doc, "div", "frame");
    frame.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 4; i++) frame.appendChild(make(doc, "i", "", "✦"));
    return frame;
  }
  function addClasses(el, extra) {
    const list = Array.isArray(extra) ? extra : typeof extra === "string" ? extra.split(/\s+/) : [];
    for (const c of list) if (typeof c === "string" && c && !/\s/.test(c)) el.classList.add(c);
  }
  const pageNo = (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : 0;
  };
  function folio(doc, n) {
    const f = make(doc, "div", "bp-folio");
    f.append(hiddenGlyph(doc, "bp-folio-dash", "—"), make(doc, "span", "bp-folio-num", String(n)), hiddenGlyph(doc, "bp-folio-dash", "—"));
    return f;
  }
  function faceShell(doc, opts, cls) {
    const face = make(doc, "article", `sheet face face-custom ${cls}`.trim());
    addClasses(face, opts.extraClass);
    const body = make(doc, "div", "face-body");
    const inner = make(doc, "div", "face-inner");
    body.appendChild(inner);
    face.append(frameEl(doc), body);
    return { face, inner };
  }

  /** createFace(page, { pageNumber, extraClass, preview }) → <article class="sheet face face-custom"> */
  function createFace(page, opts) {
    const o = opts || {};
    const doc = o.document || g.document;
    const p = normalizePage(page);
    const { face, inner } = faceShell(doc, o, "");
    face.dataset.face = "custom";
    face.dataset.pageId = p.id;
    const n = pageNo(o.pageNumber);
    if (n) {
      face.dataset.pageNumber = String(n);
      face.setAttribute("aria-label", `Trang ${n}`);
    }
    const blocks = make(doc, "div", "bp-blocks");
    if (renderBlocks(p.blocks, blocks, o)) {
      inner.appendChild(blocks);
      if (n) inner.appendChild(folio(doc, n));
    } else {
      // trang trống: chỉ một hoa văn mờ ở giữa
      face.classList.add("bp-blank");
      const empty = make(doc, "div", "bp-empty");
      empty.appendChild(hiddenGlyph(doc, "bp-empty-orn", "✦"));
      if (o.preview) empty.appendChild(make(doc, "span", "bp-empty-hint", "Trang trống — hãy thêm khối nội dung"));
      inner.appendChild(empty);
    }
    return face;
  }

  /** createEndFace({ pageNumber, extraClass }) → trang lót cuối sách (giấy vân cẩm thạch + "✦ Hết ✦") */
  function createEndFace(opts) {
    const o = opts || {};
    const doc = o.document || g.document;
    const { face, inner } = faceShell(doc, o, "bp-end");
    face.dataset.face = "end";
    const n = pageNo(o.pageNumber);
    if (n) face.dataset.pageNumber = String(n);
    face.setAttribute("aria-label", "Trang lót cuối sách");
    const paper = make(doc, "div", "bp-endpaper");
    const plate = make(doc, "div", "bp-endpaper-plate");
    plate.append(hiddenGlyph(doc, "bp-endpaper-orn", "✦"), make(doc, "span", "bp-endpaper-word", "Hết"), hiddenGlyph(doc, "bp-endpaper-orn", "✦"));
    paper.appendChild(plate);
    inner.appendChild(paper);
    return face;
  }

  /* ============================================================
   *  7. XEM ẢNH TOÀN MÀN HÌNH (lightbox)
   * ============================================================ */
  const ZOOM_SEL = ".bp-img:not(.bp-broken) > .bp-img-box > img";
  const viewers = new WeakMap(); // document → trình xem (mỗi trang 1 cái, dựng khi mở lần đầu)
  const enabledRoots = new WeakMap(); // root → handle (gọi enableLightbox 2 lần không bị gắn trùng)
  const handledClicks = new WeakSet();

  const ICON_PATHS = {
    close: '<path d="M18 6l-12 12"/><path d="M6 6l12 12"/>',
    prev: '<path d="M15 6l-6 6l6 6"/>',
    next: '<path d="M9 6l6 6l-6 6"/>',
  };
  const iconMarkup = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
  const VIEWER_MARKUP =
    '<div class="bp-lightbox-stage">' +
    '<figure class="bp-lightbox-figure"><img class="bp-lightbox-img" alt="" draggable="false">' +
    '<figcaption class="bp-lightbox-cap"></figcaption></figure></div>' +
    `<button type="button" class="bp-lightbox-btn bp-lightbox-close" aria-label="Đóng" title="Đóng (Esc)">${iconMarkup("close")}</button>` +
    `<button type="button" class="bp-lightbox-btn bp-lightbox-prev" aria-label="Ảnh trước" title="Ảnh trước (←)">${iconMarkup("prev")}</button>` +
    `<button type="button" class="bp-lightbox-btn bp-lightbox-next" aria-label="Ảnh sau" title="Ảnh sau (→)">${iconMarkup("next")}</button>` +
    '<div class="bp-lightbox-count" aria-live="polite"></div>';

  function createViewer(doc) {
    const win = doc.defaultView || g;
    let el = null;
    let ui = null;
    let items = [];
    let index = 0;
    let isOpen = false;
    let returnFocus = null;
    let hideTimer = 0;
    let saved = null;
    let inerted = [];
    let drag = null;
    let suppressUntil = 0; // vừa vuốt xong thì bỏ qua cú "click" đi kèm

    function build() {
      el = make(doc, "div", "bp-lightbox modal-overlay"); // modal-overlay: dùng chung vẻ ngoài + book.js biết đang có hộp thoại
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-modal", "true");
      el.setAttribute("aria-label", "Xem ảnh");
      el.tabIndex = -1;
      el.hidden = true;
      el.innerHTML = VIEWER_MARKUP; // chuỗi cố định, không chứa dữ liệu người dùng
      const q = (s) => el.querySelector(s);
      ui = {
        stage: q(".bp-lightbox-stage"), figure: q(".bp-lightbox-figure"), img: q(".bp-lightbox-img"),
        cap: q(".bp-lightbox-cap"), count: q(".bp-lightbox-count"),
        close: q(".bp-lightbox-close"), prev: q(".bp-lightbox-prev"), next: q(".bp-lightbox-next"),
      };
      ui.img.addEventListener("load", () => ui.figure.classList.add("is-ready"));
      ui.img.addEventListener("error", () => ui.figure.classList.add("is-ready", "is-broken"));
      ui.close.addEventListener("click", (e) => { e.stopPropagation(); close(); });
      ui.prev.addEventListener("click", (e) => { e.stopPropagation(); step(-1); });
      ui.next.addEventListener("click", (e) => { e.stopPropagation(); step(1); });
      // bấm ra ngoài / bấm vào ảnh → đóng (trừ nút, liên kết, chú thích)
      el.addEventListener("click", (e) => {
        if (Date.now() < suppressUntil) return;
        const t = e.target;
        if (t.closest && t.closest(".bp-lightbox-btn, a, .bp-lightbox-cap")) return;
        close();
      });
      // vuốt ngang = đổi ảnh, vuốt xuống = đóng
      ui.stage.addEventListener("pointerdown", onPointerDown);
      ui.stage.addEventListener("pointermove", onPointerMove);
      ui.stage.addEventListener("pointerup", onPointerUp);
      ui.stage.addEventListener("pointercancel", resetDrag);
    }

    function onPointerDown(e) {
      if (e.button !== 0 || (e.target.closest && e.target.closest("a, button"))) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0, axis: "" };
      try { ui.stage.setPointerCapture(e.pointerId); } catch { /* bỏ qua */ }
    }
    function onPointerMove(e) {
      if (!drag || e.pointerId !== drag.id) return;
      drag.dx = e.clientX - drag.x;
      drag.dy = e.clientY - drag.y;
      if (!drag.axis && Math.hypot(drag.dx, drag.dy) > 10) drag.axis = Math.abs(drag.dx) > Math.abs(drag.dy) ? "x" : "y";
      if (drag.axis === "x" && items.length > 1) {
        ui.figure.style.transition = "none";
        ui.figure.style.transform = `translateX(${drag.dx}px) rotate(${drag.dx / 60}deg)`;
      } else if (drag.axis === "y" && drag.dy > 0) {
        ui.figure.style.transition = "none";
        ui.figure.style.transform = `translateY(${drag.dy}px) scale(${Math.max(0.85, 1 - drag.dy / 1200)})`;
        ui.figure.style.opacity = String(Math.max(0.35, 1 - drag.dy / 420));
      }
    }
    function onPointerUp(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const { dx, dy, axis } = drag;
      resetDrag();
      if (!axis) return;
      suppressUntil = Date.now() + 400; // vừa vuốt xong thì không coi là bấm
      if (axis === "x" && items.length > 1 && Math.abs(dx) > 60) step(dx < 0 ? 1 : -1);
      else if (axis === "y" && dy > 90) close();
    }
    function resetDrag() {
      drag = null;
      if (!ui) return;
      ui.figure.style.transition = "";
      ui.figure.style.transform = "";
      ui.figure.style.opacity = "";
    }

    function lockPage() {
      const html = doc.documentElement;
      const body = doc.body;
      const scrollbar = win.innerWidth - html.clientWidth;
      saved = { overflow: html.style.overflow, padding: body.style.paddingRight };
      html.style.overflow = "hidden";
      if (scrollbar > 0) {
        const pad = parseFloat(win.getComputedStyle(body).paddingRight) || 0;
        body.style.paddingRight = `${pad + scrollbar}px`;
      }
      // phần còn lại của trang thành "trơ" để phím Tab / trình đọc màn hình chỉ ở trong hộp xem ảnh
      inerted = [];
      for (const child of Array.from(body.children)) {
        if (child === el || child.inert || /^(SCRIPT|STYLE|LINK|TEMPLATE|AUDIO)$/.test(child.tagName)) continue;
        child.inert = true;
        inerted.push(child);
      }
    }
    function unlockPage() {
      if (saved) {
        doc.documentElement.style.overflow = saved.overflow;
        doc.body.style.paddingRight = saved.padding;
        saved = null;
      }
      for (const child of inerted) child.inert = false;
      inerted = [];
    }

    function show(i, dir) {
      const n = items.length;
      index = ((i % n) + n) % n;
      const it = items[index];
      ui.figure.classList.remove("is-ready", "is-broken", "enter-next", "enter-prev");
      if (dir) {
        void ui.figure.offsetWidth; // chạy lại hiệu ứng trượt
        ui.figure.classList.add(dir > 0 ? "enter-next" : "enter-prev");
      }
      const same = ui.img.getAttribute("src") === it.src;
      ui.img.alt = it.alt;
      if (!same) ui.img.src = it.src;
      if (ui.img.complete && ui.img.naturalWidth) ui.figure.classList.add("is-ready");
      ui.cap.replaceChildren();
      if (it.cap) for (const node of Array.from(it.cap.childNodes)) ui.cap.appendChild(node.cloneNode(true));
      ui.cap.hidden = !it.cap;
      const many = n > 1;
      ui.prev.hidden = ui.next.hidden = ui.count.hidden = !many;
      ui.count.textContent = many ? `${index + 1} / ${n}` : "";
      el.setAttribute("aria-label", it.alt ? `Xem ảnh: ${it.alt}` : many ? `Xem ảnh ${index + 1} / ${n}` : "Xem ảnh");
      if (many) for (const k of [index + 1, index - 1]) { const pre = new win.Image(); pre.decoding = "async"; pre.src = items[(k + n) % n].src; }
    }
    function step(d) { if (isOpen && items.length > 1) show(index + d, d); }

    function onKey(e) {
      if (!isOpen) return;
      const k = e.key;
      const stop = () => { e.preventDefault(); e.stopPropagation(); };
      if (k === "Escape" || k === "Esc") { stop(); close(); }
      else if (k === "ArrowLeft" || k === "PageUp") { stop(); step(-1); }
      else if (k === "ArrowRight" || k === "PageDown") { stop(); step(1); }
      else if (k === "Home" && items.length > 1) { stop(); show(0, -1); }
      else if (k === "End" && items.length > 1) { stop(); show(items.length - 1, 1); }
      else if (k === "ArrowUp" || k === "ArrowDown" || k === " ") {
        if (!(e.target.closest && e.target.closest("button, a"))) stop(); // không cuộn trang phía sau
      } else if (k === "Tab") {
        const focusables = Array.from(el.querySelectorAll("a[href], button")).filter((x) => !x.hidden && !x.closest("[hidden]"));
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = doc.activeElement;
        if (e.shiftKey && (active === first || !el.contains(active) || active === el)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (active === last || !el.contains(active))) { e.preventDefault(); first.focus(); }
      }
    }

    function open(list, start, trigger) {
      if (!list || !list.length) return;
      if (!el) build();
      if (!el.isConnected) doc.body.appendChild(el);
      items = list;
      clearTimeout(hideTimer);
      if (!isOpen) {
        isOpen = true;
        returnFocus = trigger || doc.activeElement;
        lockPage();
        el.hidden = false;
        void el.offsetWidth; // để hiệu ứng mờ dần chạy
        el.classList.add("show");
        doc.addEventListener("keydown", onKey, true);
      }
      show(start || 0, 0);
      try { ui.close.focus({ preventScroll: true }); } catch { ui.close.focus(); }
    }

    function close() {
      if (!isOpen) return;
      isOpen = false;
      resetDrag();
      el.classList.remove("show");
      doc.removeEventListener("keydown", onKey, true);
      unlockPage();
      hideTimer = setTimeout(() => {
        if (isOpen) return;
        el.hidden = true;
        ui.img.removeAttribute("src");
        ui.cap.replaceChildren();
      }, 320);
      const back = returnFocus;
      returnFocus = null;
      if (back && back.isConnected && typeof back.focus === "function") {
        try { back.focus({ preventScroll: true }); } catch { /* bỏ qua */ }
      }
    }

    return { open, close, get isOpen() { return isOpen; }, get element() { return el; } };
  }

  function viewerFor(doc) {
    let v = viewers.get(doc);
    if (!v) { v = createViewer(doc); viewers.set(doc, v); }
    return v;
  }

  function zoomTarget(target, root) {
    const img = target && target.closest ? target.closest(".bp-img img") : null;
    if (!img || !root.contains(img) || img.closest(".bp-broken") || !img.getAttribute("src")) return null;
    return img;
  }

  function openFromImage(img, doc) {
    const gallery = img.closest(".bp-gallery");
    const imgs = gallery ? Array.from(gallery.querySelectorAll(ZOOM_SEL)).filter((x) => x.getAttribute("src")) : [img];
    const list = imgs.map((x) => ({
      src: x.currentSrc || x.src,
      alt: x.alt || "",
      cap: x.closest(".bp-img").querySelector(":scope > .bp-caption"),
    }));
    viewerFor(doc).open(list, Math.max(0, imgs.indexOf(img)), img);
  }

  // Đánh dấu ảnh có thể phóng to: bấm được bằng bàn phím (Tab + Enter) và có nhãn cho trình đọc màn hình
  function prepareImages(root) {
    if (!root.querySelectorAll) return;
    for (const img of root.querySelectorAll(`${ZOOM_SEL}:not([data-bp-zoom])`)) {
      img.setAttribute("data-bp-zoom", "");
      img.setAttribute("tabindex", "0");
      img.setAttribute("role", "button");
      img.setAttribute("aria-haspopup", "dialog");
      img.setAttribute("aria-label", img.alt ? `Phóng to ảnh: ${img.alt}` : "Phóng to ảnh");
    }
  }

  /** enableLightbox(root) → bấm ảnh (.bp-img img) trong root để xem toàn màn hình.
   *  Gọi lại nhiều lần với cùng root vẫn an toàn (trả về cùng một handle). */
  function enableLightbox(root) {
    if (!root || typeof root.addEventListener !== "function") return null;
    const existing = enabledRoots.get(root);
    if (existing) { existing.refresh(); return existing; }
    const doc = root.nodeType === 9 ? root : root.ownerDocument || g.document;
    let down = null;

    const onDown = (e) => {
      const img = zoomTarget(e.target, root);
      down = img ? { img, x: e.clientX, y: e.clientY } : null;
    };
    const onClick = (e) => {
      const start = down;
      down = null;
      if (handledClicks.has(e) || e.defaultPrevented || e.button !== 0) return;
      let img = zoomTarget(e.target, root);
      // book.js có thể giữ con trỏ (pointer capture) → sự kiện click rơi vào mặt trang, dùng ảnh lúc nhấn xuống
      if (!img && start && start.img.isConnected && root.contains(start.img)) img = start.img;
      if (!img) return;
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) return; // là kéo (lật trang), không phải bấm
      handledClicks.add(e);
      e.preventDefault();
      openFromImage(img, doc);
    };
    const onKey = (e) => {
      if ((e.key !== "Enter" && e.key !== " ") || e.defaultPrevented) return;
      const img = e.target && e.target.matches && e.target.matches("img[data-bp-zoom]") ? zoomTarget(e.target, root) : null;
      if (!img) return;
      e.preventDefault();
      e.stopPropagation();
      openFromImage(img, doc);
    };

    root.addEventListener("pointerdown", onDown, true);
    root.addEventListener("click", onClick);
    root.addEventListener("keydown", onKey);
    prepareImages(root);
    const observer = typeof g.MutationObserver === "function" ? new g.MutationObserver(() => prepareImages(root)) : null;
    if (observer) observer.observe(root, { childList: true, subtree: true });

    const handle = {
      refresh() { prepareImages(root); },
      open(img) { const t = zoomTarget(img, root); if (t) openFromImage(t, doc); },
      close() { viewerFor(doc).close(); },
      destroy() {
        root.removeEventListener("pointerdown", onDown, true);
        root.removeEventListener("click", onClick);
        root.removeEventListener("keydown", onKey);
        if (observer) observer.disconnect();
        if (root.querySelectorAll) {
          for (const img of root.querySelectorAll("img[data-bp-zoom]")) {
            for (const a of ["tabindex", "role", "aria-haspopup", "aria-label", "data-bp-zoom"]) img.removeAttribute(a);
          }
        }
        enabledRoots.delete(root);
      },
    };
    enabledRoots.set(root, handle);
    return handle;
  }

  return Object.freeze({
    BLOCK_TYPES,
    LIMITS,
    ENUMS,
    blockDefaults,
    newPage,
    normalizePage,
    normalizePages,
    normalizeBlock: (b) => normalizeBlock(b, new Set()),
    inline,
    escapeHtml,
    safeUrl,
    renderBlocks,
    createFace,
    createEndFace,
    enableLightbox,
  });
});
