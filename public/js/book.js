/* ============================================================
 *  book.js — động cơ lật trang cho "cuốn sách profile" (window.Book)
 *  Cầm mép / góc giấy kéo sang để lật (nếp cong mềm chạy theo con trỏ),
 *  bấm mép giấy, nút "Trang trước / Trang sau" hoặc phím ← → để lật tự động.
 *  Không thư viện ngoài, không file âm thanh (tiếng giấy tự tổng hợp).
 *
 *  const book = Book.create({ root, stage, nav, breakpoint, startFace, sound, hint });
 *  book.next(); book.prev(); book.goTo(i, { animate }); book.refresh(); book.hint(); book.destroy();
 *  book.state → { mode, index, count, visible }
 *  Sự kiện (trên root, nổi bọt): "bookflipstart", "bookflip" (+ "bookflipcancel", "bookmodechange").
 *
 *  Phần hình học là hàm thuần (Book.geometry) — chạy được trong Node để test.
 * ============================================================ */
(() => {
  "use strict";

  /* ============================================================
   *  1. HÌNH HỌC NẾP GẤP (hàm thuần, không đụng DOM)
   *  Khung toạ độ của trang đang lật: gốc ở ĐỈNH GÁY, x tăng dần ra mép ngoài,
   *  trang = [0,W]×[0,H]. Lật lùi ở chế độ 2 trang là ảnh gương qua gáy.
   * ============================================================ */
  const EPS = 1e-6;
  const pt = (x, y) => ({ x, y });
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  // > 0: phía còn nằm phẳng (gần P hơn C0) ; < 0: phía bị gấp (gần C0)
  const side = (p, M, n) => (p.x - M.x) * n.x + (p.y - M.y) * n.y;

  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  function rectPoly(x0, y0, x1, y1) {
    return [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)];
  }

  /** Diện tích đa giác (công thức shoelace, luôn ≥ 0) */
  function polyArea(poly) {
    let s = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      s += a.x * b.y - b.x * a.y;
    }
    return Math.abs(s) / 2;
  }

  /** Sutherland–Hodgman với 1 nửa mặt phẳng: giữ phần có sign·((X−M)·n) ≥ 0 */
  function clipHalfPlane(poly, M, n, sign = 1) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const fa = sign * side(a, M, n), fb = sign * side(b, M, n);
      if (fa >= 0) out.push(pt(a.x, a.y));
      if ((fa > 0 && fb < 0) || (fa < 0 && fb > 0)) {
        const t = fa / (fa - fb);
        out.push(pt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t));
      }
    }
    return out;
  }

  function projectDisc(P, c, r) {
    const dx = P.x - c.x, dy = P.y - c.y, d = Math.hypot(dx, dy);
    if (d <= r || d < EPS) return pt(P.x, P.y);
    return pt(c.x + (dx * r) / d, c.y + (dy * r) / d);
  }

  /**
   * Giữ góc giấy P sao cho trang không "rách" khỏi gáy: P phải nằm trong 2 đĩa tâm
   * S_top=(0,0) bán kính |C0−S_top| và S_bot=(0,H) bán kính |C0−S_bot|.
   * Tính điểm gần nhất CHÍNH XÁC trong giao 2 đĩa: chiếu lên từng đĩa, hoặc 1 trong 2 giao điểm
   * của 2 đường tròn — chính là C0 và ảnh gương (−C0.x, C0.y) (vì 2 tâm cùng nằm trên gáy x = 0).
   */
  function clampP(P, C0, H) {
    const S1 = pt(0, 0), S2 = pt(0, H);
    const r1 = dist(C0, S1), r2 = dist(C0, S2);
    const tol = 1e-9 * (1 + r1 + r2);
    const inside = (Q) => dist(Q, S1) <= r1 + tol && dist(Q, S2) <= r2 + tol;
    if (inside(P)) return pt(P.x, P.y);
    let best = null, bestD = Infinity;
    const consider = (Q) => {
      if (!inside(Q)) return;
      const d = dist(P, Q);
      if (d < bestD) { best = Q; bestD = d; }
    };
    consider(projectDisc(P, S1, r1));
    consider(projectDisc(P, S2, r2));
    consider(pt(C0.x, C0.y));
    consider(pt(-C0.x, C0.y));
    return best || pt(C0.x, C0.y);
  }

  /**
   * Nếp gấp khi góc C0 được kéo tới P: đường gấp là trung trực của C0P.
   * front  = phần trang còn phẳng (khung có thể nới thêm `pad` px để giữ bóng đổ / ruy băng)
   * folded = phần bị gấp F (trong khung trang, không nới)
   */
  function foldPolygons(W, H, C0, P, pad = 0) {
    const dx = P.x - C0.x, dy = P.y - C0.y, len = Math.hypot(dx, dy);
    const page = rectPoly(0, 0, W, H);
    const padded = pad ? rectPoly(-pad, -pad, W + pad, H + pad) : page;
    if (len < EPS) return { front: padded, folded: [], M: pt(C0.x, C0.y), n: null, len: 0 };
    const n = pt(dx / len, dy / len);
    const M = pt((C0.x + P.x) / 2, (C0.y + P.y) / 2);
    return { front: clipHalfPlane(padded, M, n, 1), folded: clipHalfPlane(page, M, n, -1), M, n, len };
  }

  /**
   * Vùng bóng mép lá giấy (toạ độ hộp mặt sau [0,W]×[0,H]): đa giác lá giấy `flap` được nới ra `m` px
   * CHỈ ở các cạnh nằm trên mép trang thật (cạnh nếp gấp giữ nguyên, góc trang nới thành ô vuông).
   * Nhờ vậy bóng dừng đúng ở chỗ lá giấy dừng, không kéo dài theo cả trang đã phản chiếu.
   */
  function castPolygon(flap, W, H, m) {
    const tol = 0.5;
    const poly = [];
    for (const p of flap) {
      const q = poly[poly.length - 1];
      if (!q || Math.abs(q.x - p.x) > 1e-6 || Math.abs(q.y - p.y) > 1e-6) poly.push(p);
    }
    while (poly.length > 1 && Math.abs(poly[0].x - poly[poly.length - 1].x) < 1e-6 && Math.abs(poly[0].y - poly[poly.length - 1].y) < 1e-6) poly.pop();
    if (poly.length < 3) return [];
    const normalOf = (a, b) => {
      if (Math.abs(a.x) < tol && Math.abs(b.x) < tol) return pt(-1, 0);
      if (Math.abs(a.x - W) < tol && Math.abs(b.x - W) < tol) return pt(1, 0);
      if (Math.abs(a.y) < tol && Math.abs(b.y) < tol) return pt(0, -1);
      if (Math.abs(a.y - H) < tol && Math.abs(b.y - H) < tol) return pt(0, 1);
      return null; // cạnh nếp gấp
    };
    const k = poly.length;
    const out = [];
    for (let i = 0; i < k; i++) {
      const P = poly[i];
      const nIn = normalOf(poly[(i - 1 + k) % k], P);
      const nOut = normalOf(P, poly[(i + 1) % k]);
      const off = (nv, s = 1) => pt(P.x + nv.x * m * s, P.y + nv.y * m * s);
      if (nIn && nOut) {
        if (nIn.x === nOut.x && nIn.y === nOut.y) out.push(off(nIn));
        else out.push(off(nIn), pt(P.x + (nIn.x + nOut.x) * m, P.y + (nIn.y + nOut.y) * m), off(nOut));
      } else if (nIn) out.push(off(nIn), pt(P.x, P.y));
      else if (nOut) out.push(pt(P.x, P.y), off(nOut));
      else out.push(pt(P.x, P.y));
    }
    return out;
  }

  function reflectPoint(X, M, n) {
    const k = 2 * side(X, M, n);
    return pt(X.x - k * n.x, X.y - k * n.y);
  }

  /* ----- ma trận affine kiểu CSS: x' = a·x + c·y + e ; y' = b·x + d·y + f ----- */
  const IDENTITY = Object.freeze({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

  /** A∘B (áp B trước rồi tới A) */
  function compose(A, B) {
    return {
      a: A.a * B.a + A.c * B.b,
      b: A.b * B.a + A.d * B.b,
      c: A.a * B.c + A.c * B.d,
      d: A.b * B.c + A.d * B.d,
      e: A.a * B.e + A.c * B.f + A.e,
      f: A.b * B.e + A.d * B.f + A.f,
    };
  }
  function apply(A, p) {
    return pt(A.a * p.x + A.c * p.y + A.e, A.b * p.x + A.d * p.y + A.f);
  }
  function invert(A) {
    const det = A.a * A.d - A.b * A.c;
    if (Math.abs(det) < 1e-12) return { ...IDENTITY };
    const a = A.d / det, b = -A.b / det, c = -A.c / det, d = A.a / det;
    return { a, b, c, d, e: -(a * A.e + c * A.f), f: -(b * A.e + d * A.f) };
  }
  /** Phép đối xứng qua đường gấp: X − 2((X−M)·n)n */
  function reflectAffine(M, n) {
    const k = 2 * (M.x * n.x + M.y * n.y);
    return { a: 1 - 2 * n.x * n.x, b: -2 * n.x * n.y, c: -2 * n.x * n.y, d: 1 - 2 * n.y * n.y, e: k * n.x, f: k * n.y };
  }
  /** m: toạ độ hộp mặt sau U=(u,v) → khung trang. mirror: (W−u, v) ; không: (u, v). Tự nghịch đảo. */
  function backMap(W, mirror) {
    return mirror ? { a: -1, b: 0, c: 0, d: 1, e: W, f: 0 } : { ...IDENTITY };
  }
  /** Mặt sau của lá giấy: X = Refl(m(U)) — là phép quay 2θ + tịnh tiến */
  function backAffine(W, M, n, mirror) {
    return compose(reflectAffine(M, n), backMap(W, mirror));
  }
  /** Khung trang → toạ độ sân khấu (.book-stage): X = sx + σ·x */
  function localToStage(sigma, sx) {
    return { a: sigma, b: 0, c: 0, d: 1, e: sx, f: 0 };
  }

  /* ----- chuỗi CSS (làm tròn, không bao giờ ra dạng số mũ "1e-7") ----- */
  function round(v, k) {
    const r = Math.round(v * k) / k;
    return r === 0 ? 0 : r; // bỏ "-0"
  }
  function cssMatrix(A) {
    return `matrix(${round(A.a, 1e6)}, ${round(A.b, 1e6)}, ${round(A.c, 1e6)}, ${round(A.d, 1e6)}, ${round(A.e, 100)}, ${round(A.f, 100)})`;
  }
  const EMPTY_POLY = "polygon(0px 0px, 0px 0px, 0px 0px)";
  /** clip-path dạng path(evenodd, …): vùng = đa giác đầu trừ đi các đa giác sau (đục lỗ) */
  function cssPathEvenOdd(polys) {
    const d = polys
      .filter((p) => p && p.length >= 3)
      .map((p) => `M${p.map((q) => `${round(q.x, 100)} ${round(q.y, 100)}`).join(" L")} Z`)
      .join(" ");
    return d ? `path(evenodd, "${d}")` : EMPTY_POLY;
  }
  /**
   * Phần cần khoét khỏi mặt trước (khung trang cục bộ): phần gấp F cộng dải phía trên mép trang
   * (ruy băng thò ra) nằm cùng phía nếp gấp. Bóng ngoài mép trang của mặt trước được giữ nguyên.
   */
  function frontCut(W, H, M, n, pad) {
    return n ? clipHalfPlane(rectPoly(0, -pad, W, H), M, n, -1) : [];
  }
  function cssPolygon(poly) {
    if (!poly || poly.length < 3) return EMPTY_POLY;
    return `polygon(${poly.map((p) => `${round(p.x, 100)}px ${round(p.y, 100)}px`).join(", ")})`;
  }

  /* ----- cầm, kéo, lật tự động ----- */
  /** Góc được cầm: 30% trên → góc trên, 30% dưới → góc dưới, còn lại → gấp thẳng theo mép */
  function pickY0(gy, H) {
    if (gy <= 0.3 * H) return 0;
    if (gy >= 0.7 * H) return H;
    return clamp(gy, 0, H);
  }
  /** Đường đi khi lật tự động: nội suy thẳng + góc giấy nhấc lên (lift·H) ở giữa chừng */
  function arcPoint(from, to, H, e, lift, liftDir) {
    return pt(
      from.x + (to.x - from.x) * e,
      from.y + (to.y - from.y) * e + liftDir * lift * H * Math.sin(Math.PI * e)
    );
  }
  /**
   * Vị trí góc giấy khi kéo: P = Pbase + (con trỏ − điểm cầm); "unfold" (lật lùi 1 trang): P.x = Pbase.x + 2·Δx.
   * kx (≥ 1) phóng đại Δx — dùng khi vuốt bằng tay ở chế độ 1 trang (xem swipeGain).
   */
  function dragToP(kind, Pbase, grab, ptr, kx = 1) {
    const dx = (ptr.x - grab.x) * kx, dy = ptr.y - grab.y;
    return kind === "unfold" ? pt(Pbase.x + 2 * dx, Pbase.y + dy) : pt(Pbase.x + dx, Pbase.y + dy);
  }
  /**
   * Hệ số vuốt cho cảm ứng ở chế độ 1 trang: trang chiếm gần hết màn hình nên ngón tay không thể kéo góc
   * giấy qua gáy. Chọn kx để ngón tay chạm tới mép gáy (turn) / mép ngoài (unfold) là trang vừa lật xong.
   * Cầm đúng mép: turn → đường gấp chạy ngay dưới ngón tay (kx = 2); unfold → đúng công thức gốc (kx = 1).
   */
  function swipeGain(kind, W, grabX) {
    if (kind === "unfold") return clamp(W / Math.max(W - grabX, 1), 1, 2);
    return clamp((2 * W) / Math.max(grabX, 1), 1, 4);
  }
  /** 0 = chưa lật, 1 = đã lật hẳn (góc giấy tới (−W, y0)) */
  function progressOf(C0, P) {
    return C0.x > 0 ? clamp((C0.x - P.x) / (2 * C0.x), 0, 1) : 0;
  }

  /* ----- trang / mặt giấy ----- */
  function normIndex(mode, i, count) {
    if (!(count > 0)) return 0;
    const k = clamp(Math.floor(Number(i)) || 0, 0, count - 1);
    return mode === "spread" ? k - (k % 2) : k;
  }
  function visibleOf(mode, index, count) {
    if (!(count > 0)) return [];
    if (mode === "spread") return [index, index + 1].filter((i) => i < count);
    return [index];
  }
  /**
   * Vai trò các mặt khi lật từ `from` tới `to` (chỉ số mặt đầu tiên đang thấy).
   * front = mặt đang bị lật đi (hoặc mở ra), back = mặt sau lá giấy (-1 = tờ giấy trắng),
   * under = mặt lộ ra bên dưới, stat = mặt đứng yên. kind "unfold" = lật lùi ở chế độ 1 trang.
   */
  function flipRoles(mode, from, to, count) {
    if (mode === "spread") {
      if (to > from) {
        return { dir: 1, kind: "turn", sigma: 1, front: from + 1, back: to, under: to + 1 < count ? to + 1 : -1,
          stat: from, backMirror: true, backSlot: "left" };
      }
      return { dir: -1, kind: "turn", sigma: -1, front: from, back: to + 1, under: to,
        stat: from + 1 < count ? from + 1 : -1, backMirror: false, backSlot: "right" };
    }
    if (to > from) return { dir: 1, kind: "turn", sigma: 1, front: from, back: -1, under: to, stat: -1, backMirror: true, backSlot: "blank" };
    return { dir: -1, kind: "unfold", sigma: 1, front: to, back: -1, under: from, stat: -1, backMirror: true, backSlot: "blank" };
  }

  const Geo = {
    EPS, IDENTITY, rectPoly, polyArea, clipHalfPlane, projectDisc, clampP, foldPolygons, castPolygon, reflectPoint,
    compose, apply, invert, reflectAffine, backMap, backAffine, localToStage, cssMatrix, cssPolygon, cssPathEvenOdd, frontCut,
    pickY0, arcPoint, dragToP, swipeGain, progressOf, normIndex, visibleOf, flipRoles,
    easeInOutCubic, easeOutCubic, smoothstep,
  };

  // Node (test): chỉ xuất phần hình học
  if (typeof module === "object" && module && module.exports) module.exports = Geo;
  if (typeof window === "undefined" || typeof document === "undefined") return;

  /* ============================================================
   *  2. ĐỘNG CƠ LẬT TRANG (DOM)
   * ============================================================ */
  // Không bao giờ bắt đầu lật từ các điều khiển này
  const NO_GRAB = "input, textarea, select, option, [contenteditable]:not([contenteditable='false']), .progress, .volume-slider, audio, video, iframe";
  // Chạm nhẹ vào đây thì để phần tử tự xử lý (không coi là bấm mép giấy)
  const INTERACTIVE = "a[href], button, label, summary, [role='button'], [role='link'], [tabindex]:not([tabindex='-1']), .bp-img img";
  const FORM_FIELD = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";
  const BLOCKING_UI = ".modal-overlay.show, dialog[open]";
  const PAD = 40;        // nới khung cắt mặt trước để giữ bóng đổ + ruy băng thò ra
  const CAST_PAD = 30;   // bề rộng vùng bóng mép lá giấy (≥ độ nhoè box-shadow của .book-fx-cast)
  const LIFT = 0.13;     // góc giấy nhấc lên ~13% chiều cao khi lật tự động
  const AUTO_MS = 650;
  const QUEUE_MS = 430;  // các lần lật xếp hàng chạy nhanh hơn
  const FLICK = 0.35;    // px/ms — vẩy nhanh thì lật luôn
  const HASH_RE = /^#trang-(\d{1,4})$/i;
  const dirName = (d) => (d > 0 ? "next" : "prev");

  function stub() {
    const noop = () => {};
    return {
      next: noop, prev: noop, goTo: noop, refresh: noop, hint: noop, destroy: noop,
      get state() { return { mode: "single", index: 0, count: 0, visible: [] }; },
    };
  }

  function create(options = {}) {
    const opts = Object.assign(
      { breakpoint: "(min-width: 900px)", startFace: 0, sound: true, hint: true, hash: true, keyboard: true },
      options || {}
    );
    const root = opts.root || null;
    const stage = opts.stage || (root ? root.querySelector(".book-stage") : null);
    if (!root || !stage) {
      console.error("Book.create: thiếu root hoặc stage");
      return stub();
    }
    const nav = opts.nav || null;
    const doc = root.ownerDocument || document;
    const win = doc.defaultView || window;
    const mqMode = win.matchMedia(opts.breakpoint || "(min-width: 900px)");
    const mqReduce = win.matchMedia("(prefers-reduced-motion: reduce)");
    const mqFine = win.matchMedia("(hover: hover) and (pointer: fine)");
    const reduced = () => mqReduce.matches;
    const now = () => performance.now();
    // trình duyệt hỗ trợ clip-path: path(evenodd, …) → đục lỗ mặt trước, bóng ngoài mép không bị chập đôi
    const pathClip = !!(win.CSS && win.CSS.supports && win.CSS.supports("clip-path", 'path(evenodd, "M0 0 L1 0 L1 1 Z")'));

    let faces = [];
    let count = 0;
    let mode = mqMode.matches ? "spread" : "single";
    let index = 0;
    let session = null;   // phiên lật / hé góc đang chạy
    let gesture = null;   // thao tác con trỏ đang theo dõi
    let queue = [];       // trang đích chờ lật (bấm liên tục)
    let fade = null;      // mờ dần khi giảm chuyển động
    let hintDone = false;
    let suppressClickUntil = 0;
    let destroyed = false;
    let refreshQueued = false;
    let wantFace = null;  // trang mở đầu (hash / startFace) chưa tồn tại lúc tạo sách — chờ main.js thêm trang
    const cleanups = [];

    const on = (target, type, fn, o) => {
      target.addEventListener(type, fn, o);
      cleanups.push(() => target.removeEventListener(type, fn, o));
    };
    const onMQ = (mq, fn) => {
      if (mq.addEventListener) { mq.addEventListener("change", fn); cleanups.push(() => mq.removeEventListener("change", fn)); }
      else if (mq.addListener) { mq.addListener(fn); cleanups.push(() => mq.removeListener(fn)); }
    };
    const make = (tag, cls, attrs) => {
      const n = doc.createElement(tag);
      if (cls) n.className = cls;
      if (attrs) for (const k of Object.keys(attrs)) n.setAttribute(k, attrs[k]);
      return n;
    };
    const dispatch = (type, detail) => {
      try { root.dispatchEvent(new CustomEvent(type, { bubbles: true, detail })); } catch { /* bỏ qua */ }
    };

    /* ---------- lớp phủ đổ bóng + tờ giấy trắng (mặt sau ở chế độ 1 trang) ---------- */
    const fx = {
      under: make("div", "book-fx book-fx-under", { "aria-hidden": "true" }),
      cast: make("div", "book-fx book-fx-cast", { "aria-hidden": "true" }),
      blank: make("div", "book-blank", { "aria-hidden": "true" }),
      flap: make("div", "book-fx book-fx-flap", { "aria-hidden": "true" }),
      underStrip: make("div", "book-fx-strip"),
      flapStrip: make("div", "book-fx-strip"),
    };
    fx.under.appendChild(fx.underStrip);
    fx.flap.appendChild(fx.flapStrip);

    /* ---------- góc gập "Lật trang" ---------- */
    function makeCorner(which) {
      const c = make("div", `book-corner is-${which}`, { "aria-hidden": "true" });
      const label = make("span", "book-corner-label");
      label.textContent = which === "next" ? "Lật trang" : "Lật lại";
      c.append(make("i", "book-corner-fold"), label);
      return c;
    }
    const corners = { prev: makeCorner("prev"), next: makeCorner("next") };
    const ownNodes = [fx.under, fx.cast, fx.blank, fx.flap, corners.prev, corners.next];
    stage.append(...ownNodes);

    /* ---------- thanh điều hướng + vùng đọc cho trình đọc màn hình ---------- */
    let navEls = null;
    const live = make("span", "book-sr", { "aria-live": "polite", "aria-atomic": "true" });
    if (nav) {
      nav.textContent = "";
      const prevBtn = make("button", "book-nav-btn is-prev", { type: "button", "aria-label": "Trang trước", "aria-keyshortcuts": "ArrowLeft PageUp" });
      prevBtn.innerHTML = '<span class="arw" aria-hidden="true">‹</span><span class="lbl">Trang trước</span>';
      const nextBtn = make("button", "book-nav-btn is-next", { type: "button", "aria-label": "Trang sau", "aria-keyshortcuts": "ArrowRight PageDown" });
      nextBtn.innerHTML = '<span class="lbl">Trang sau</span><span class="arw" aria-hidden="true">›</span>';
      const ind = make("span", "book-nav-ind");
      const indSr = make("span", "book-sr");
      indSr.textContent = "Trang ";
      const indNum = make("span", "book-nav-num");
      ind.append(indSr, indNum);
      nav.append(prevBtn, ind, nextBtn, live);
      navEls = { prev: prevBtn, next: nextBtn, num: indNum };
      on(prevBtn, "click", () => { unlockAudio(); step(-1); });
      on(nextBtn, "click", () => { unlockAudio(); step(1); });
    } else {
      root.appendChild(live);
    }

    const addedTabIndex = !stage.hasAttribute("tabindex");
    if (addedTabIndex) stage.setAttribute("tabindex", "-1");

    /* ============================================================
     *  TRẠNG THÁI NGHỈ (không lật)
     * ============================================================ */
    function readFaces() {
      faces = Array.from(stage.querySelectorAll(".face")).filter((f) => f.parentElement === stage);
      count = faces.length;
    }
    const stepSize = () => (mode === "spread" ? 2 : 1);
    function targetFor(dir, base = index) {
      const t = base + dir * stepSize();
      return t >= 0 && t < count ? t : -1;
    }
    const canStep = (dir) => targetFor(dir) >= 0;

    function setSlot(f, slot) {
      for (const c of ["slot-left", "slot-right", "slot-single"]) if (c !== slot && f.classList.contains(c)) f.classList.remove(c);
      if (!f.classList.contains(slot)) f.classList.add(slot);
    }
    function clearFlipStyle(n) {
      const st = n.style;
      st.clipPath = "";
      st.transform = "";
      st.willChange = "";
      st.opacity = "";
    }

    function applyRest() {
      const vis = visibleOf(mode, index, count);
      faces.forEach((f, i) => {
        const shown = vis.includes(i);
        setSlot(f, mode === "spread" ? (i % 2 ? "slot-right" : "slot-left") : "slot-single");
        f.classList.remove("is-front", "is-back", "is-under", "is-fade");
        f.classList.toggle("is-active", shown);
        clearFlipStyle(f);
        f.toggleAttribute("inert", !shown);
        if (shown) f.removeAttribute("aria-hidden");
        else f.setAttribute("aria-hidden", "true");
      });
      root.dataset.mode = mode;
      updateNav();
    }

    function rangeText() {
      const v = visibleOf(mode, index, count);
      if (!v.length) return "0";
      return v.length > 1 ? `${v[0] + 1}–${v[v.length - 1] + 1}` : `${v[0] + 1}`;
    }

    function updateNav() {
      const prevOk = canStep(-1), nextOk = canStep(1);
      root.classList.toggle("has-prev", prevOk);
      root.classList.toggle("has-next", nextOk);
      if (!navEls) return;
      const focused = doc.activeElement;
      navEls.prev.disabled = !prevOk;
      navEls.next.disabled = !nextOk;
      navEls.num.textContent = `${rangeText()} / ${count}`;
      nav.hidden = !(prevOk || nextOk);
      // nút đang được focus vừa bị khoá → chuyển focus sang nút kia để bàn phím không "rơi"
      if (focused === navEls.prev && !prevOk && nextOk) navEls.next.focus({ preventScroll: true });
      if (focused === navEls.next && !nextOk && prevOk) navEls.prev.focus({ preventScroll: true });
    }

    function announce() {
      const v = visibleOf(mode, index, count);
      if (!v.length) return;
      const text = `Trang ${rangeText()}`;
      live.textContent = "";
      setTimeout(() => { if (!destroyed) live.textContent = text; }, 40);
    }

    function readHash() {
      const m = HASH_RE.exec(win.location.hash || "");
      return m ? parseInt(m[1], 10) - 1 : null;
    }
    function writeHash() {
      if (!opts.hash) return;
      const cur = win.location.hash || "";
      const want = index > 0 ? `#trang-${index + 1}` : "";
      if (cur === want || (!want && !HASH_RE.test(cur))) return;
      try {
        win.history.replaceState(win.history.state, "", want || win.location.pathname + win.location.search);
      } catch { /* file:// hoặc trình duyệt chặn — bỏ qua */ }
    }

    // focus đang nằm trong mặt vừa bị ẩn → đưa về sân khấu để phím ← → vẫn chạy
    function rescueFocus() {
      const ae = doc.activeElement;
      if (!ae || ae === doc.body || !stage.contains(ae)) return;
      const face = ae.closest(".face");
      if (face && face.hasAttribute("inert")) {
        try { stage.focus({ preventScroll: true }); } catch { /* bỏ qua */ }
      }
    }

    function afterChange(from, to, dir) {
      wantFace = null;
      dispatch("bookflip", { from, to, direction: dirName(dir), mode });
      announce();
      writeHash();
      rescueFocus();
    }

    /* ============================================================
     *  ÂM THANH: tiếng sột soạt của giấy (nhiễu lọc, WebAudio, rất nhỏ)
     * ============================================================ */
    let actx = null;
    let noiseBuf = null;
    const soundOn = () => opts.sound !== false && !reduced();
    function unlockAudio() {
      if (!soundOn()) return;
      try {
        if (!actx) {
          const AC = win.AudioContext || win.webkitAudioContext;
          if (!AC) return;
          actx = new AC();
        }
        if (actx.state === "suspended") actx.resume().catch(() => {});
      } catch { actx = null; }
    }
    // lời gọi từ main.js trong lúc người xem vừa thao tác → cũng mở khoá được âm thanh
    function unlockIfGesture() {
      const ua = win.navigator && win.navigator.userActivation;
      if (ua && ua.isActive) unlockAudio();
    }
    function swish(strength = 1) {
      if (!soundOn() || !actx || actx.state !== "running") return;
      try {
        const sr = actx.sampleRate;
        if (!noiseBuf) {
          const len = Math.floor(sr * 0.6);
          noiseBuf = actx.createBuffer(1, len, sr);
          const data = noiseBuf.getChannelData(0);
          let b = 0;
          for (let i = 0; i < len; i++) {
            const w = Math.random() * 2 - 1;
            b = 0.86 * b + 0.14 * w; // hơi "nâu" cho mềm như giấy
            data[i] = b * 0.75 + w * 0.25;
          }
        }
        const t = actx.currentTime;
        const dur = 0.34 + Math.random() * 0.1;
        const src = actx.createBufferSource();
        src.buffer = noiseBuf;
        src.playbackRate.value = 0.9 + Math.random() * 0.2;
        const hp = actx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 380;
        const bp = actx.createBiquadFilter();
        bp.type = "bandpass";
        bp.Q.value = 0.85;
        bp.frequency.setValueAtTime(3000, t);
        bp.frequency.exponentialRampToValueAtTime(850, t + dur);
        const g = actx.createGain();
        const peak = 0.05 * clamp(strength, 0.2, 1.2);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + 0.05);
        g.gain.exponentialRampToValueAtTime(peak * 0.35, t + dur * 0.55);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(hp);
        hp.connect(bp);
        bp.connect(g);
        g.connect(actx.destination);
        src.start(t, Math.random() * 0.15);
        src.stop(t + dur + 0.05);
      } catch { /* bỏ qua */ }
    }

    /* ============================================================
     *  PHIÊN LẬT: dựng, vẽ từng khung hình, kết thúc
     * ============================================================ */
    const busy = () => !!fade || !!(session && (session.source === "auto" || session.source === "drag"));
    const isPeel = (s) => !!s && (s.source === "peel" || s.source === "hint");

    function openSession(to, y0Spec, source) {
      const from = index;
      if (to < 0 || to >= count || to === from) return null;
      const roles = flipRoles(mode, from, to, count);
      const front = faces[roles.front];
      if (!front) return null;
      const rect = stage.getBoundingClientRect(); // đọc kích thước 1 lần lúc bắt đầu
      const W = mode === "spread" ? rect.width / 2 : rect.width;
      const H = rect.height;
      if (!(W > 40 && H > 40)) return null;
      const y0 = y0Spec === "top" ? 0 : y0Spec === "bottom" ? H : clamp(Number(y0Spec) || 0, 0, H);
      const sx = mode === "spread" ? W : 0;
      const C0 = pt(W, y0);
      const Pfin = pt(-W, y0);
      const s = {
        from, to, dir: roles.dir, kind: roles.kind, roles, mode, rect, W, H, sx, y0, C0, Pfin,
        sigma: roles.sigma,
        L: localToStage(roles.sigma, sx),
        Prest: roles.kind === "unfold" ? Pfin : C0,
        Pgoal: roles.kind === "unfold" ? C0 : Pfin,
        corner: y0 === 0 ? "top" : y0 === H ? "bottom" : null,
        liftDir: y0 > H / 2 ? -1 : 1,
        front,
        back: roles.back >= 0 ? faces[roles.back] : fx.blank,
        under: roles.under >= 0 ? faces[roles.under] || null : null,
        backOrigin: pt(roles.backSlot === "right" ? W : 0, 0),
        frontOrigin: pt(roles.sigma > 0 ? sx : sx - W, 0),
        source, started: false, leaving: false,
        P: null, raf: 0, dragRaf: 0, anim: null, samples: [], grab: null, Pbase: null, kx: 1,
      };
      s.P = pt(s.Prest.x, s.Prest.y);
      mount(s);
      session = s;
      render(s);
      return s;
    }

    function mount(s) {
      s.front.classList.add("is-front");
      if (s.under) s.under.classList.add("is-under");
      s.back.classList.add(s.back === fx.blank ? "is-on" : "is-back");
      fx.cast.classList.add("is-on");
      fx.flap.classList.add("is-on");
      if (s.under) fx.under.classList.add("is-on");
      fx.under.style.transform = `translate(${round(s.frontOrigin.x, 100)}px, 0px)`;
      for (const n of [s.front, s.back, fx.under, fx.cast, fx.flap]) n.style.willChange = "transform, clip-path";
      if (s.source === "peel" || s.source === "hint") root.classList.add("is-peeling", s.dir > 0 ? "peel-next" : "peel-prev");
    }

    function unmount(s) {
      cancelAnimationFrame(s.raf);
      cancelAnimationFrame(s.dragRaf);
      s.raf = 0;
      s.dragRaf = 0;
      s.anim = null;
      for (const n of [s.front, s.back, s.under]) {
        if (!n) continue;
        n.classList.remove("is-front", "is-back", "is-under", "is-on");
        clearFlipStyle(n);
      }
      for (const n of [fx.under, fx.cast, fx.flap, fx.blank]) {
        n.classList.remove("is-on");
        clearFlipStyle(n);
      }
      fx.underStrip.style.transform = "";
      fx.flapStrip.style.transform = "";
      root.classList.remove("is-flipping", "is-dragging", "is-peeling", "peel-next", "peel-prev");
    }

    // dải gradient (rộng 100px theo CSS) đặt ở đường gấp, quay theo hướng `dir`, kéo dãn tới `width`
    function stripTransform(M, dir, width) {
      const ang = Math.atan2(dir.y, dir.x);
      return `translate(${round(M.x, 100)}px, ${round(M.y, 100)}px) rotate(${round(ang, 1e5)}rad) translate(0px, -50%) scaleX(${round(Math.max(width, 1) / 100, 1e4)})`;
    }

    function render(s) {
      const { W, H, C0, P } = s;
      const g = foldPolygons(W, H, C0, P, PAD);
      const toFront = s.sigma > 0 ? (p) => p : (p) => pt(W - p.x, p.y);
      if (pathClip) {
        // giữ nguyên bóng ngoài mép của mặt trước, chỉ khoét phần đã gấp (mặt dưới tạm tắt bóng ngoài — book.css)
        const outer = rectPoly(-PAD, -PAD, W + PAD, H + PAD);
        s.front.style.clipPath = cssPathEvenOdd([outer.map(toFront), frontCut(W, H, g.M, g.n, PAD).map(toFront)]);
      } else {
        s.front.style.clipPath = cssPolygon(g.front.map(toFront));
      }
      if (!g.n || g.folded.length < 3) {
        s.back.style.clipPath = EMPTY_POLY;
        fx.flap.style.clipPath = EMPTY_POLY;
        fx.cast.style.clipPath = EMPTY_POLY;
        fx.under.style.clipPath = EMPTY_POLY;
        return;
      }
      const prog = progressOf(C0, P);
      const mInv = backMap(W, s.roles.backMirror); // m tự nghịch đảo
      const A = compose(s.L, backAffine(W, g.M, g.n, s.roles.backMirror)); // hộp mặt sau → sân khấu
      const flapPoly = g.folded.map((p) => apply(mInv, p)); // lá giấy trong toạ độ hộp mặt sau
      const backClip = cssPolygon(flapPoly);
      const matrix = cssMatrix(A);

      // mặt sau của lá giấy
      s.back.style.transform = cssMatrix({ ...A, e: A.e - s.backOrigin.x, f: A.f - s.backOrigin.y });
      s.back.style.clipPath = backClip;

      // nếp cong trên mặt sau: tối ở nếp gấp, ánh giấy sáng dần ra mép ngoài
      let flapW = 0;
      for (const p of g.folded) flapW = Math.max(flapW, -side(p, g.M, g.n));
      const dInBack = s.roles.backMirror ? pt(g.n.x, -g.n.y) : pt(-g.n.x, -g.n.y);
      fx.flap.style.transform = matrix;
      fx.flap.style.clipPath = backClip;
      // lá giấy nhỏ (mới hé góc) chỉ thấy phần nếp + dải sáng, không bị ánh trắng phủ cả mẩu giấy
      fx.flapStrip.style.transform = stripTransform(apply(mInv, g.M), dInBack, Math.max(flapW, 90));

      // bóng mềm của mép lá giấy hắt lên trang bên dưới
      fx.cast.style.transform = matrix;
      fx.cast.style.clipPath = cssPolygon(castPolygon(flapPoly, W, H, CAST_PAD));

      // bóng trên trang vừa lộ ra, đậm sát nếp gấp
      fx.under.style.clipPath = cssPolygon(g.folded.map(toFront));
      fx.underStrip.style.transform = stripTransform(toFront(g.M), pt(-s.sigma * g.n.x, -g.n.y), clamp(g.len * 0.22, 8, W * 0.35));

      // độ đậm: hiện đủ ngay khi góc giấy nhấc lên vài chục px, tắt dần khi giấy sắp nằm phẳng
      const fin = (px) => Math.min(1, g.len / px);
      const fout = (k) => Math.min(1, (1 - prog) * k);
      fx.under.style.opacity = String(round(fin(50) * fout(5), 1000));
      fx.cast.style.opacity = String(round(fin(60) * fout(4), 1000));
      fx.flap.style.opacity = String(round(fin(30) * fout(3.5), 1000));
      // chế độ 1 trang: tờ giấy trắng mờ đi khi bay hẳn ra ngoài
      if (s.back === fx.blank) fx.blank.style.opacity = String(round(1 - smoothstep(0.8, 1, prog), 1000));
    }

    function setP(s, P) {
      s.P = clampP(P, s.C0, s.H);
      render(s);
    }

    function tween(s, to, ms, ease, lift, done) {
      cancelAnimationFrame(s.raf);
      const from = pt(s.P.x, s.P.y);
      const t0 = now();
      const token = {};
      s.anim = token;
      const frame = (ts) => {
        if (s.anim !== token || session !== s) return;
        const t = ms > 0 ? clamp(((ts || now()) - t0) / ms, 0, 1) : 1;
        setP(s, arcPoint(from, to, s.H, ease(t), lift, s.liftDir));
        if (t < 1) { s.raf = requestAnimationFrame(frame); return; }
        s.anim = null;
        s.raf = 0;
        if (done) done();
      };
      s.raf = requestAnimationFrame(frame);
    }

    function begin(s, source) {
      s.source = source;
      root.classList.remove("is-peeling", "peel-next", "peel-prev");
      root.classList.add("is-flipping");
      if (!s.started) {
        s.started = true;
        dispatch("bookflipstart", { from: s.from, to: s.to, direction: dirName(s.dir) });
      }
    }

    /** Dọn phiên + cập nhật trạng thái (KHÔNG chạy hàng đợi) */
    function endSession(s, completed) {
      if (!s || session !== s) return;
      session = null;
      unmount(s);
      const from = index;
      if (completed) index = s.to;
      applyRest();
      if (completed) afterChange(from, index, s.dir);
      else if (s.started) dispatch("bookflipcancel", { from, to: s.to, direction: dirName(s.dir) });
    }
    function finish(s, completed) {
      endSession(s, completed);
      runQueue();
    }

    /** Lật tự động tới mặt `to` (dùng chung cho nút, phím, bấm mép, goTo, hàng đợi) */
    function autoFlip(to, o = {}) {
      if (destroyed || to < 0 || to >= count || to === index) return;
      if (reduced()) { crossfade(to); return; }
      let s = session;
      if (s && !isPeel(s)) return;
      if (s && s.to !== to) { endSession(s, false); s = null; }
      if (!s) s = openSession(to, o.corner || "bottom", "auto");
      if (!s) { jump(to); runQueue(); return; }
      begin(s, "auto");
      swish(o.soft ? 0.7 : 1);
      const frac = clamp(dist(s.P, s.Pgoal) / (2 * s.W), 0.35, 1);
      tween(s, s.Pgoal, (o.ms || AUTO_MS) * frac, easeInOutCubic, LIFT * frac, () => finish(s, true));
    }

    /** Đổi trang ngay lập tức (không hiệu ứng) */
    function jump(to) {
      const from = index;
      if (to === from || to < 0 || to >= count) return;
      dispatch("bookflipstart", { from, to, direction: dirName(to - from) });
      index = to;
      applyRest();
      afterChange(from, to, to - from);
    }

    /** Giảm chuyển động: không cong giấy, chỉ mờ chéo 150ms */
    function crossfade(to) {
      const from = index;
      if (to === from || to < 0 || to >= count) return;
      dispatch("bookflipstart", { from, to, direction: dirName(to - from) });
      const incoming = visibleOf(mode, to, count).map((i) => faces[i]).filter(Boolean);
      incoming.forEach((f) => { f.classList.add("is-fade"); f.style.opacity = "0"; });
      const t0 = now();
      const token = { to, raf: 0, incoming };
      fade = token;
      const frame = (ts) => {
        if (fade !== token) return;
        const t = clamp(((ts || now()) - t0) / 150, 0, 1);
        incoming.forEach((f) => { f.style.opacity = String(round(t, 1000)); });
        if (t < 1) { token.raf = requestAnimationFrame(frame); return; }
        fade = null;
        index = to;
        applyRest();
        afterChange(from, to, to - from);
        runQueue();
      };
      token.raf = requestAnimationFrame(frame);
    }
    function stopFade() {
      if (!fade) return;
      cancelAnimationFrame(fade.raf);
      fade.incoming.forEach((f) => { f.classList.remove("is-fade"); f.style.opacity = ""; });
      fade = null;
    }

    function runQueue() {
      while (queue.length && queue[0] === index) queue.shift();
      if (!queue.length || destroyed || busy()) return;
      autoFlip(queue.shift(), { ms: QUEUE_MS, soft: true });
    }

    /** Huỷ mọi thứ ngay (đổi khổ màn hình, refresh, destroy) — trang giữ nguyên */
    function abortAll() {
      if (gesture) {
        releaseCapture(gesture.id);
        gesture = null;
      }
      if (session) endSession(session, false);
      stopFade();
      queue = [];
      root.classList.remove("is-flipping", "is-dragging", "is-peeling", "peel-next", "peel-prev");
      stage.classList.remove("is-grab");
    }

    /* ============================================================
     *  ĐIỀU KHIỂN: nút, phím, goTo
     * ============================================================ */
    function step(dir) {
      if (destroyed || !count) return;
      syncMode();
      unlockIfGesture();
      if (busy()) {
        if (session && session.source === "drag") return; // đang cầm trang bằng tay
        const base = queue.length ? queue[queue.length - 1] : fade ? fade.to : session.to;
        const t = targetFor(dir, base);
        if (t >= 0 && queue.length < 2) queue.push(t);
        return;
      }
      const t = targetFor(dir);
      if (t >= 0) autoFlip(t);
    }

    function goTo(faceIndex, o = {}) {
      if (destroyed || !count) return;
      syncMode();
      const to = normIndex(mode, faceIndex, count);
      unlockIfGesture();
      if (busy()) {
        if (session && session.source === "drag") return;
        queue = [to];
        return;
      }
      if (to === index) return;
      if (o && o.animate === false) {
        if (session) endSession(session, false);
        jump(to);
        return;
      }
      autoFlip(to);
    }

    function onKey(e) {
      if (destroyed || !opts.keyboard || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const k = e.key;
      const dir = k === "ArrowRight" || k === "PageDown" ? 1 : k === "ArrowLeft" || k === "PageUp" ? -1 : 0;
      if (!dir) return;
      const t = e.target;
      if (t && t.nodeType === 1 && (t.isContentEditable || t.closest(FORM_FIELD))) return;
      if (doc.querySelector(BLOCKING_UI)) return;
      if (!root.isConnected || !root.getClientRects().length) return;
      e.preventDefault();
      unlockAudio();
      step(dir);
    }

    /* ============================================================
     *  CON TRỎ: cầm mép giấy, vuốt, hé góc khi rê chuột
     * ============================================================ */
    function releaseCapture(id) {
      try { if (stage.hasPointerCapture && stage.hasPointerCapture(id)) stage.releasePointerCapture(id); } catch { /* bỏ qua */ }
    }

    /** Vùng cầm: dải mép ngoài + ô vuông lớn hơn ở 2 góc ngoài */
    function zoneAt(x, y, rect, coarse) {
      const Wst = rect.width, H = rect.height;
      const W = mode === "spread" ? Wst / 2 : Wst;
      if (!(W > 40 && H > 40) || y < 0 || y > H || x < 0 || x > Wst) return null;
      const strip = Math.min(coarse ? 36 : 48, W * 0.2);
      const cornerSz = Math.min(coarse ? 64 : 96, W * 0.3, H * 0.25);
      const yCorner = y <= cornerSz ? "top" : y >= H - cornerSz ? "bottom" : null;
      const test = (d) => {
        if (d <= strip) return { corner: yCorner && d <= cornerSz ? yCorner : null };
        if (yCorner && d <= cornerSz) return { corner: yCorner };
        return null;
      };
      let hit = test(Wst - x), dir = 1;
      if (!hit) { hit = test(x); dir = -1; }
      if (!hit || !canStep(dir)) return null;
      return { dir, corner: hit.corner, gy: y, H };
    }

    // con trỏ đang bấm vào chính thanh cuộn của một khung cuộn (không phải nội dung)
    function onScrollbar(e) {
      const t = e.target;
      if (!t || t.nodeType !== 1 || typeof t.clientWidth !== "number" || t.scrollHeight <= t.clientHeight) return false;
      if (t.offsetWidth - t.clientWidth <= t.clientLeft) return false; // thanh cuộn nổi (điện thoại)
      const r = t.getBoundingClientRect();
      return e.clientX >= r.left + t.clientLeft + t.clientWidth;
    }

    const cornerFromZone = (z) => z.corner || (z.gy < z.H * 0.3 ? "top" : "bottom");

    function localPoint(s, clientX, clientY) {
      return pt(s.sigma * (clientX - s.rect.left - s.sx), clientY - s.rect.top);
    }

    function onPointerDown(e) {
      if (destroyed || !count) return;
      if (!gesture && !busy()) syncMode();
      if (gesture) {
        if (gesture.session && e.pointerId !== gesture.id) {
          cancelGesture(); // ngón thứ hai (chụm phóng to) → thả trang về chỗ cũ
          return;
        }
        if (!gesture.session) gesture = null; // thao tác cũ bị lỡ pointerup
        else return;
      }
      if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
      if (busy() || !e.target || !e.target.closest || e.target.closest(NO_GRAB)) return;
      const coarse = e.pointerType !== "mouse";
      const rect = stage.getBoundingClientRect();
      const zone = zoneAt(e.clientX - rect.left, e.clientY - rect.top, rect, coarse);
      if (zone && onScrollbar(e)) return;
      if (!zone && !coarse) return; // chuột: chỉ cầm được ở mép / góc
      const interactive = !!e.target.closest(INTERACTIVE);
      gesture = {
        id: e.pointerId, type: e.pointerType, coarse, zone, interactive,
        x0: e.clientX, y0: e.clientY, t0: now(), rect, session: null, swipe: 0, last: e,
      };
      if (!coarse && zone && !interactive) {
        // chuột ở mép giấy: cầm trang ngay (bấm nhả = lật tự động)
        e.preventDefault();
        startDrag(e, zone.dir, zone);
      }
    }

    function startDrag(e, dir, zone) {
      const g = gesture;
      if (!g) return;
      const to = targetFor(dir);
      if (to < 0) { gesture = null; return; }
      unlockAudio();
      try { stage.setPointerCapture(g.id); } catch { /* bỏ qua */ }
      if (reduced()) { g.swipe = dir; return; } // không cong giấy: nhả tay thì đổi trang
      const gyStage = g.y0 - g.rect.top;
      const H = g.rect.height;
      const y0Spec = zone && zone.corner ? zone.corner : pickY0(gyStage, H) === 0 ? "top" : pickY0(gyStage, H) === H ? "bottom" : gyStage;
      let s = session;
      if (s && !isPeel(s)) { gesture = null; return; }
      const sameCorner = s && s.to === to && s.corner !== null && s.corner === (zone && zone.corner);
      if (s && !sameCorner) { endSession(s, false); s = null; }
      if (!s) s = openSession(to, y0Spec, "drag");
      if (!s) { gesture = null; releaseCapture(g.id); return; }
      cancelAnimationFrame(s.raf);
      s.anim = null;
      s.leaving = false;
      begin(s, "drag");
      root.classList.add("is-dragging");
      s.grab = localPoint(s, g.x0, g.y0);
      s.Pbase = pt(s.P.x, s.P.y);
      // cảm ứng ở chế độ 2 trang: ngón tay vuốt tới gáy sách là đủ để lật (không bắt kéo hết cả một trang)
      s.kx = !g.coarse ? 1 : mode === "single" ? swipeGain(s.kind, s.W, s.grab.x) : clamp(s.W / Math.max(s.grab.x, 1), 1, 4);
      s.samples = [];
      g.session = s;
      dragMove(s, e);
    }

    function dragMove(s, e) {
      const raw = dragToP(s.kind, s.Pbase, s.grab, localPoint(s, e.clientX, e.clientY), s.kx);
      const t = now();
      s.samples.push({ t, x: raw.x });
      while (s.samples.length > 2 && t - s.samples[0].t > 120) s.samples.shift();
      s.pending = raw;
      if (!s.dragRaf) {
        s.dragRaf = requestAnimationFrame(() => {
          s.dragRaf = 0;
          if (session === s && s.source === "drag" && s.pending) setP(s, s.pending);
        });
      }
    }

    function velocity(s) {
      const a = s.samples[0], b = s.samples[s.samples.length - 1];
      if (!a || !b || b.t - a.t < 16 || now() - b.t > 100) return 0;
      return (b.x - a.x) / (b.t - a.t);
    }

    function onPointerMove(e) {
      const g = gesture;
      if (g && e.pointerId === g.id) {
        g.last = e;
        if (g.session) {
          if (session === g.session && g.session.source === "drag") dragMove(g.session, e);
          return;
        }
        if (g.swipe) return;
        const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
        if (g.coarse) {
          // khoá hướng: chỉ lật khi vuốt ngang rõ ràng
          if (Math.abs(dx) > 10 && Math.abs(dx) > 1.4 * Math.abs(dy)) {
            const dir = dx < 0 ? 1 : -1;
            if (!canStep(dir)) { gesture = null; return; }
            startDrag(e, dir, g.zone && g.zone.dir === dir ? g.zone : null);
          } else if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
            gesture = null; // cuộn dọc trong trang
          }
        } else if (g.zone && Math.hypot(dx, dy) > 5) {
          startDrag(e, g.zone.dir, g.zone); // kéo từ nút / link nằm ở mép giấy
        }
        return;
      }
      if (!g && e.pointerType === "mouse" && !e.buttons && stage.contains(e.target)) hover(e);
    }

    function onPointerUp(e) {
      const g = gesture;
      if (!g || e.pointerId !== g.id) return;
      if (g.session) { release(e, false); return; }
      gesture = null;
      releaseCapture(g.id);
      const moved = Math.hypot(e.clientX - g.x0, e.clientY - g.y0);
      if (g.swipe) {
        if (moved > 8) suppressClickUntil = now() + 400;
        step(g.swipe);
        return;
      }
      // chạm nhẹ vào mép giấy = lật tự động
      if (g.zone && !g.interactive && moved < 10 && now() - g.t0 < 600) {
        unlockAudio();
        if (busy()) { step(g.zone.dir); return; }
        autoFlip(targetFor(g.zone.dir), { corner: cornerFromZone(g.zone) });
      }
    }

    function onPointerCancel(e) {
      const g = gesture;
      if (!g || e.pointerId !== g.id) return;
      if (g.session) release(e, true);
      else { gesture = null; releaseCapture(g.id); }
    }

    function cancelGesture() {
      const g = gesture;
      if (!g) return;
      if (g.session) release(g.last || { clientX: g.x0, clientY: g.y0 }, true);
      else { gesture = null; releaseCapture(g.id); }
    }

    /** Nhả tay: lật nốt hoặc thả về */
    function release(e, cancelled) {
      const g = gesture;
      gesture = null;
      if (!g) return;
      releaseCapture(g.id);
      root.classList.remove("is-dragging");
      const s = g.session;
      if (!s || session !== s || s.source !== "drag") return;
      cancelAnimationFrame(s.dragRaf);
      s.dragRaf = 0;
      if (!cancelled && e && typeof e.clientX === "number") {
        setP(s, dragToP(s.kind, s.Pbase, s.grab, localPoint(s, e.clientX, e.clientY), s.kx));
      }
      const moved = e && typeof e.clientX === "number" ? Math.hypot(e.clientX - g.x0, e.clientY - g.y0) : 0;
      const tap = !cancelled && !g.coarse && moved < 6 && now() - g.t0 < 500;
      if (moved > 6) suppressClickUntil = now() + 400;
      let complete;
      if (cancelled) complete = false;
      else if (tap) complete = true;
      else {
        const v = velocity(s);
        const toward = s.kind === "turn" ? -v : v; // px/ms về phía lật xong
        const past = s.kind === "turn" ? s.P.x < 0 : s.P.x > 0;
        complete = toward > FLICK ? true : toward < -FLICK ? false : past;
      }
      const target = complete ? s.Pgoal : s.Prest;
      const frac = clamp(dist(s.P, target) / (2 * s.W), 0, 1);
      s.source = "auto";
      if (complete) swish(tap ? 1 : 0.8);
      if (tap) tween(s, target, AUTO_MS * clamp(frac, 0.35, 1), easeInOutCubic, LIFT * clamp(frac, 0.35, 1), () => finish(s, true));
      else tween(s, target, clamp(frac * 700, 160, 520), easeOutCubic, complete ? 0.03 : 0, () => finish(s, complete));
    }

    /* ---------- rê chuột vào góc: giấy hé lên một chút ---------- */
    function peelTarget(s) {
      const sy = s.y0 === 0 ? 1 : -1;
      return s.kind === "unfold" ? pt(s.Pfin.x + 100, s.y0 + sy * 50) : pt(s.C0.x - 60, s.y0 + sy * 60);
    }
    function unpeel(s) {
      if (!s || session !== s || s.leaving) return;
      s.leaving = true;
      tween(s, s.Prest, 240, easeOutCubic, 0, () => { if (session === s && s.leaving) endSession(s, false); });
    }
    function hover(e) {
      if (busy() || destroyed) return;
      if (!session) syncMode();
      const rect = stage.getBoundingClientRect();
      const zone = zoneAt(e.clientX - rect.left, e.clientY - rect.top, rect, false);
      stage.classList.toggle("is-grab", !!zone);
      if (reduced() || !mqFine.matches) return;
      const s = session;
      if (s && s.source === "hint") return; // để gợi ý chạy xong
      const want = zone && zone.corner ? zone : null;
      if (want) {
        const to = targetFor(want.dir);
        if (s && s.source === "peel" && s.to === to && s.corner === want.corner) {
          if (s.leaving) { s.leaving = false; tween(s, peelTarget(s), 260, easeOutCubic, 0, null); }
          return;
        }
        if (s) endSession(s, false);
        const ns = openSession(to, want.corner, "peel");
        if (ns) tween(ns, peelTarget(ns), 280, easeOutCubic, 0, null);
      } else if (s && s.source === "peel") {
        unpeel(s);
      }
    }
    function onPointerLeave(e) {
      if (e.pointerType !== "mouse") return;
      stage.classList.remove("is-grab");
      if (!gesture && session && session.source === "peel") unpeel(session);
    }

    /** Gợi ý một lần: góc trang hé lên rồi hạ xuống */
    function hint() {
      if (!opts.hint || hintDone || destroyed || reduced() || busy() || gesture) return;
      syncMode();
      const to = targetFor(1);
      if (to < 0) return;
      if (session) endSession(session, false);
      const s = openSession(to, "bottom", "hint");
      if (!s) return;
      hintDone = true;
      const peak = pt(s.C0.x - clamp(s.W * 0.2, 60, 110), s.H - clamp(s.H * 0.1, 50, 85));
      tween(s, peak, 700, easeOutCubic, 0, () => {
        setTimeout(() => {
          if (session !== s || s.source !== "hint") return;
          tween(s, s.Prest, 560, easeInOutCubic, 0, () => { if (session === s && s.source === "hint") endSession(s, false); });
        }, 420);
      });
    }

    /* ============================================================
     *  ĐỔI KHỔ MÀN HÌNH, LÀM MỚI, HUỶ
     * ============================================================ */
    // sự kiện "change" của media query chỉ phát khi trang đang vẽ (tab ẩn có thể bỏ lỡ) → đối chiếu lại khi cần
    function syncMode() {
      if ((mqMode.matches ? "spread" : "single") !== mode) onModeChange();
    }
    function onModeChange() {
      const next = mqMode.matches ? "spread" : "single";
      if (next === mode) return;
      abortAll();
      const first = index; // giữ vị trí: trang đôi s ↔ trang đơn 2s
      mode = next;
      index = normIndex(mode, first, count);
      applyRest();
      dispatch("bookmodechange", { mode, index });
    }

    let lastSize = "";
    const ro = typeof win.ResizeObserver === "function"
      ? new win.ResizeObserver((entries) => {
        const r = entries[entries.length - 1].contentRect;
        const size = `${Math.round(r.width)}x${Math.round(r.height)}`;
        if (lastSize && size !== lastSize && (session || gesture || fade)) abortAll(); // đang lật mà đổi cỡ → huỷ sạch
        lastSize = size;
      })
      : null;

    function sameFaces() {
      const now2 = Array.from(stage.querySelectorAll(".face")).filter((f) => f.parentElement === stage);
      return now2.length === faces.length && now2.every((f, i) => f === faces[i]);
    }
    function refresh() {
      if (destroyed) return;
      abortAll();
      readFaces();
      if (wantFace !== null && wantFace < count) {
        index = wantFace;
        wantFace = null;
      }
      index = normIndex(mode, index, count);
      applyRest();
    }
    // main.js dựng lại các trang mà quên gọi refresh() → tự làm mới
    const mo = typeof win.MutationObserver === "function"
      ? new win.MutationObserver((list) => {
        const touched = list.some((m) => [...m.addedNodes, ...m.removedNodes].some((n) => n.nodeType === 1 && n.classList.contains("face")));
        if (!touched || refreshQueued) return;
        refreshQueued = true;
        Promise.resolve().then(() => {
          refreshQueued = false;
          if (!destroyed && !sameFaces()) refresh();
        });
      })
      : null;

    function destroy() {
      if (destroyed) return;
      abortAll();
      destroyed = true;
      cleanups.splice(0).forEach((fn) => fn());
      if (ro) ro.disconnect();
      if (mo) mo.disconnect();
      ownNodes.forEach((n) => n.remove());
      live.remove();
      if (nav) { nav.textContent = ""; nav.hidden = false; }
      faces.forEach((f) => {
        f.classList.remove("slot-left", "slot-right", "slot-single", "is-active", "is-front", "is-back", "is-under", "is-fade");
        clearFlipStyle(f);
        f.removeAttribute("inert");
        f.removeAttribute("aria-hidden");
      });
      root.classList.remove("is-ready", "book-pathclip", "has-prev", "has-next", "is-flipping", "is-dragging", "is-peeling", "peel-next", "peel-prev");
      delete root.dataset.mode;
      stage.classList.remove("is-grab");
      if (addedTabIndex) stage.removeAttribute("tabindex");
      if (actx && actx.close) actx.close().catch(() => {});
      actx = null;
    }

    /* ============================================================
     *  KHỞI ĐỘNG
     * ============================================================ */
    readFaces();
    const fromHash = opts.hash ? readHash() : null;
    const desired = Math.max(0, Math.floor(Number(fromHash !== null ? fromHash : opts.startFace)) || 0);
    index = normIndex(mode, desired, count);
    if (desired >= count && desired > 0) wantFace = desired;
    root.classList.add("is-ready");
    root.classList.toggle("book-pathclip", pathClip);
    applyRest();

    on(stage, "pointerdown", onPointerDown);
    on(stage, "pointerleave", onPointerLeave);
    // chỉ khi CHÍNH stage mất quyền giữ con trỏ (sự kiện từ phần tử con cũng nổi bọt lên đây)
    on(stage, "lostpointercapture", (e) => {
      if (e.target === stage && gesture && gesture.session && e.pointerId === gesture.id) release(e, true);
    });
    on(win, "pointermove", onPointerMove, { passive: true });
    on(win, "pointerup", onPointerUp);
    on(win, "pointercancel", onPointerCancel);
    on(stage, "mousedown", (e) => { if (gesture && gesture.session) e.preventDefault(); });
    on(stage, "selectstart", (e) => { if (gesture && (gesture.session || (gesture.zone && !gesture.coarse))) e.preventDefault(); });
    on(stage, "dragstart", (e) => { if (gesture) e.preventDefault(); });
    on(stage, "click", (e) => {
      if (now() < suppressClickUntil) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    on(win, "keydown", onKey);
    on(win, "hashchange", () => {
      if (!opts.hash) return;
      const h = readHash();
      if (h !== null) goTo(h);
    });
    on(win, "resize", () => { if (!ro && (session || gesture || fade)) abortAll(); });
    onMQ(mqMode, onModeChange);
    onMQ(mqReduce, () => { if (reduced() && session && isPeel(session)) endSession(session, false); });
    if (ro) ro.observe(stage);
    if (mo) mo.observe(stage, { childList: true });

    return {
      next: () => step(1),
      prev: () => step(-1),
      goTo,
      refresh,
      hint,
      destroy,
      get state() {
        return { mode, index, count, visible: visibleOf(mode, index, count) };
      },
    };
  }

  window.Book = { create, geometry: Geo };
})();
