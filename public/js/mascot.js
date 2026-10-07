/* ============================================================
 *  mascot.js — linh vật pixel sống trên trang (kiểu thú cưng màn hình Shimeji)
 *  Dáng "Clawd": thân chữ nhật màu cam, 2 mắt dọc, 2 tay nhỏ, 4 chân ngắn.
 *  - Kéo / ném bằng chuột hoặc ngón tay → bay có trọng lực, nảy vào mép màn hình,
 *    đáp xuống mép trên cuốn sách hoặc đáy màn hình.
 *  - Chạm: vẫy tay, nhảy xoay, nhảy múa, thả tim, ngủ, ngó nghiêng, hắt xì, lộn ngược.
 *    Chạm 2 lần: tuyệt chiêu. Đang focus thì Enter / Space cũng được.
 *  - Tự sống: thở, chớp mắt, nhìn theo con trỏ, đi dạo, ngồi, ngủ khi lâu không ai chơi,
 *    nhún theo nhạc, giật mình khi lật trang sách.
 *  Dùng:  const m = Mascot.create({ name, color, messages, audio, book });
 *         m.say("Xin chào", 3000); m.act("wave"); m.destroy(); m.el
 * ============================================================ */
window.Mascot = (() => {
  "use strict";

  /* ============================================================
   *  1. TOÁN THUẦN (không đụng DOM — test được bằng Node qua Mascot._math)
   * ============================================================ */
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => (arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : "");

  /** "#abc" / "#aabbcc" → "#aabbcc" (chữ thường); sai → null */
  function normColor(c) {
    if (typeof c !== "string") return null;
    const s = c.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(s)) return s;
    if (/^#[0-9a-f]{3}$/.test(s)) return "#" + s.slice(1).split("").map((h) => h + h).join("");
    return null;
  }

  /** Pha màu: amt < 0 → tối hơn (pha đen), amt > 0 → sáng hơn (pha trắng) */
  function shade(hex, amt) {
    const c = normColor(hex) || "#d97757";
    const n = parseInt(c.slice(1), 16);
    const target = amt < 0 ? 0 : 255;
    const p = Math.abs(clamp(Number(amt) || 0, -1, 1));
    const ch = (v) => Math.round(v + (target - v) * p);
    const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  /** Chọn ngẫu nhiên 1 phần tử khác `last` (nếu được) */
  function pickDifferent(list, last, rnd = Math.random) {
    const pool = list.filter((v) => v !== last);
    const src = pool.length ? pool : list;
    return src[Math.floor(rnd() * src.length) % src.length];
  }

  /** Vận tốc thả tay (px/s) từ các mẫu {t(ms), x, y} gần nhất; đứng yên lâu trước khi thả → 0 */
  function velocity(samples, now, win = 100, stale = 80) {
    const n = samples ? samples.length : 0;
    if (n < 2) return { vx: 0, vy: 0 };
    const last = samples[n - 1];
    if (now - last.t > stale) return { vx: 0, vy: 0 };
    let first = last;
    for (let i = n - 2; i >= 0; i--) {
      if (last.t - samples[i].t > win) break;
      first = samples[i];
    }
    const dt = (last.t - first.t) / 1000;
    if (dt < 0.012) return { vx: 0, vy: 0 };
    return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
  }

  const inSpan = (x, p) => x >= p.x1 && x <= p.x2;

  /** Bục đứng gần chân nhất trong khoảng ±tol (thả nhẹ sát mép sách → đặt luôn lên đó) */
  function platformNear(x, y, platforms, tol) {
    let best = null;
    for (const p of platforms) {
      if (!inSpan(x, p) || Math.abs(y - p.y) > tol) continue;
      if (!best || Math.abs(y - p.y) < Math.abs(y - best.y)) best = p;
    }
    return best;
  }

  /** Bục gần nhất phía dưới chân (p.y ≥ y − tol) */
  function platformBelow(x, y, platforms, tol = 0) {
    let best = null;
    for (const p of platforms) {
      if (inSpan(x, p) && p.y >= y - tol && (!best || p.y < best.y)) best = p;
    }
    return best;
  }

  /**
   * 1 bước bay: s = {x, y (chân), vx, vy}; env = {gravity, maxFall, drag, wallDamp, ceilDamp,
   * halfW, h, vw, vh (đáy màn hình), platforms: [{id, y, x1, x2}]}.
   * Chỉ đáp xuống bục khi đang rơi và chân vừa đi qua mép bục (trong bề ngang của bục).
   */
  function stepFlight(s, dt, env) {
    let { x, y, vx, vy } = s;
    const out = { landed: null, impact: 0, wall: 0, ceil: false };
    const vy0 = vy;
    vy = Math.min(vy + env.gravity * dt, env.maxFall);
    vx *= Math.max(0, 1 - (env.drag || 0) * dt);
    let nx = x + vx * dt;
    let ny = y + ((vy0 + vy) / 2) * dt; // trung bình 2 đầu → đúng quỹ đạo parabol
    const minX = env.halfW, maxX = Math.max(env.halfW, env.vw - env.halfW);
    if (nx < minX) { nx = minX; if (vx < 0) { vx = -vx * env.wallDamp; out.wall = -1; } }
    else if (nx > maxX) { nx = maxX; if (vx > 0) { vx = -vx * env.wallDamp; out.wall = 1; } }
    if (ny - env.h < 0 && vy < 0) { ny = env.h; vy = -vy * env.ceilDamp; out.ceil = true; }
    if (vy >= 0) {
      let best = null;
      for (const p of env.platforms || []) {
        if (y <= p.y + 0.5 && ny >= p.y && inSpan(nx, p) && (!best || p.y < best.y)) best = p;
      }
      if (!best && ny >= env.vh) best = { id: "floor", y: env.vh, x1: -Infinity, x2: Infinity };
      if (best) { ny = best.y; out.landed = best; out.impact = vy; }
    }
    out.x = nx; out.y = ny; out.vx = vx; out.vy = vy;
    return out;
  }

  /** Vận tốc ban đầu để nhảy từ (x0,y0) tới (x1,y1), đang rơi xuống khi tới nơi */
  function launchTo(x0, y0, x1, y1, g) {
    const dy = y1 - y0;
    const tMin = Math.sqrt((2 * Math.max(0, -dy)) / g);
    const T = Math.max(0.42, tMin * 1.3, Math.abs(x1 - x0) / 900);
    return { vx: (x1 - x0) / T, vy: (dy - 0.5 * g * T * T) / T, t: T };
  }

  /**
   * Hộp linh vật {cx, halfW, top, bottom} có đè lên `rect` (nới thêm margin) không?
   * Không đè → null. Đè → tâm x mới (ưu tiên né sang trái) nằm trong [minX, maxX], hết chỗ → null.
   */
  function avoidBox(box, rect, margin, minX, maxX) {
    const hit = box.cx + box.halfW > rect.left - margin && box.cx - box.halfW < rect.right + margin &&
      box.bottom > rect.top - margin && box.top < rect.bottom + margin;
    if (!hit) return null;
    const left = rect.left - margin - box.halfW - 1;
    if (left >= minX) return Math.min(left, maxX);
    const right = rect.right + margin + box.halfW + 1;
    if (right <= maxX) return Math.max(right, minX);
    return null;
  }

  /**
   * Vị trí bóng thoại: o = {left, top, w, h (hộp linh vật trên màn hình), bw, bh (cỡ bóng), vw, vh}.
   * → { x: lệch trái so với linh vật, below: hết chỗ phía trên thì đặt xuống dưới, tail: vị trí đuôi }
   */
  function bubbleLayout(o) {
    const m = o.margin ?? 8, gap = o.gap ?? 16;
    const maxLeft = Math.max(m, o.vw - m - o.bw);
    const bx = clamp(o.left + o.w / 2 - o.bw / 2, m, maxLeft);
    const above = o.top - gap - o.bh >= m;
    const belowFits = o.top + o.h + gap + o.bh <= o.vh - m;
    return {
      x: bx - o.left,
      below: !above && belowFits,
      tail: clamp(o.left + o.w / 2 - bx, 12, Math.max(12, o.bw - 12)),
    };
  }

  const MATH = { clamp, normColor, shade, pickDifferent, velocity, inSpan, platformNear, platformBelow, stepFlight, launchTo, avoidBox, bubbleLayout };

  /* ============================================================
   *  2. HẰNG SỐ, CÂU THOẠI, HÌNH PIXEL
   * ============================================================ */
  const PHYS = {
    gravity: 2600,     // px/s²
    maxFall: 2600,     // px/s
    drag: 0.35,        // lực cản không khí theo phương ngang
    wallDamp: 0.55,    // nảy vào tường còn lại bao nhiêu
    ceilDamp: 0.4,
    flingSpeed: 650,   // thả nhanh hơn mức này → ném bay
    maxThrow: 3200,
    bounceAt: 1100,    // rơi mạnh hơn mức này → nảy lên 1 lần
    dizzyAt: 1700,     // bị ném rơi mạnh → chóng mặt
  };
  const SLEEP_MS = 60000;      // không ai đụng tới trong 60 s → ngủ
  const DOUBLE_TAP_MS = 280;
  const STORE_KEY = "mascot-state";
  const TAP_ACTS = ["wave", "jump", "dance", "hearts", "sleep", "look", "sneeze", "backflip"];
  const ALIASES = { heart: "hearts", love: "hearts", flip: "backflip", spin: "jump", superjump: "special", super: "special", surprised: "sneeze" };

  const DEFAULT_MESSAGES = [
    "Chúc bạn một ngày thật vui!",
    "Bạn đã uống đủ nước chưa?",
    "Lật thử trang sách xem nhé!",
    "Cảm ơn bạn đã ghé chơi!",
    "Mở nhạc lên nghe cùng tớ đi!",
  ];
  const LINES = {
    greet: ["Chào bạn! Tớ là {name} nè.", "Xin chào! {name} đây, chơi với tớ nhé!"],
    back: ["Bạn quay lại rồi! Vui ghê.", "Lại gặp nhau rồi nè!", "Nhớ bạn quá trời!"],
    wave: ["Chào bạn nha!", "Hế lô! Tớ là {name}.", "Vẫy vẫy nè!"],
    jump: ["Hây da!", "Nhảy cao chưa nè?", "Hấp!"],
    dance: ["Lắc lư nào~", "Quẩy lên nào!", "Nhún nhảy chút cho vui!"],
    hearts: ["Thương bạn nhiều!", "Tặng bạn trái tim nè!", "Bạn dễ thương ghê!"],
    sleep: ["Buồn ngủ quá… Zzz", "Cho tớ chợp mắt xíu nha…", "Ngủ một lát đã…"],
    doze: ["Zzz…", "Bạn đi đâu rồi… tớ ngủ đây…"],
    wake: ["Ơ… tớ dậy rồi đây!", "Ai gọi tớ đó?", "Ngủ ngon ghê… chơi tiếp nào!"],
    look: ["Ủa, gì vậy ta?", "Có ai ở đó không?", "Để tớ ngó thử xem…"],
    sneeze: ["Hắt xì!", "Ắt… xì!", "Ơ! Bụi sách đó mà…"],
    backflip: ["Xem tớ lộn nè!", "Lộn ngược một vòng!", "Tèn ten!"],
    special: ["Tuyệt chiêu bí mật!", "Siêu nhảy lộn vòng!", "Tớ giỏi chưa nè!"],
    hop: ["Ơ!", "Hả?"],
    flip: ["Lật trang rồi!", "Trang mới nè!", "Đọc tiếp nào!", "Ồ, trang này hay nè!"],
    music: ["Nhạc hay ghê!", "Nghe nhạc cùng tớ nha~", "Bài này tớ thích nè!"],
    grab: ["Á, nhấc tớ lên rồi!", "Ơ kìa, bay nè!", "Nhẹ tay thôi nha!"],
    fling: ["Wiiii!", "Á á á!", "Bay cao quá!"],
    dizzy: ["Chóng mặt quá…", "Ui da… sao cứ quay quay…"],
    land: ["Hạ cánh an toàn!", "Phù, tới nơi rồi."],
    climb: ["Lên sách chơi nào!", "Hây, nhảy lên đây!"],
    fall: ["Ơ, rơi mất rồi!", "Á, trượt chân!"],
  };

  /* Thời lượng (ms) + biểu cảm + hiệu ứng của từng động tác — khớp với keyframes trong mascot.css */
  const ACTS = {
    wave: { dur: 1500, face: "happy" },
    jump: { dur: 860, face: "happy", sayAt: 640, fx: [[700, "dust"]] },
    dance: { dur: 2000, face: "happy", fx: [[150, "note"], [900, "note"], [1500, "note"]] },
    hearts: { dur: 1750, face: "happy", fx: [[0, "heart"], [170, "heart"], [340, "heart"], [510, "heart"], [700, "heart"]] },
    look: { dur: 2200, look: [[0, -2, 0], [650, 2, 0], [1300, 0, -1], [1850, 0, 0]] },
    sneeze: { dur: 1150, face: "closed", sayAt: 430, faces: [[430, "big"]], fx: [[440, "bang"]] },
    backflip: { dur: 960, face: "happy", sayAt: 800, fx: [[820, "dust"]] },
    special: { dur: 1500, face: "happy", sayAt: 1250, fx: [[520, "sparkTop"], [1220, "dust"], [1240, "sparkLow"]] },
    hop: { dur: 470, face: "big", sayAt: 260 },
  };

  /* Lưới mịn 30 × 20 ô (1 ô = 2 px trên máy tính, 1.5 px trên điện thoại).
     Thân x4–25 y0–15, tay hai bên y8–11, mắt 2×4, 4 chân 2×4. */
  const EYES = {
    open: '<rect class="m-ink" x="8" y="4" width="2" height="4"/><rect class="m-ink" x="20" y="4" width="2" height="4"/>',
    closed: '<rect class="m-ink" x="7" y="6" width="4" height="1"/><rect class="m-ink" x="19" y="6" width="4" height="1"/>',
    happy: '<rect class="m-ink" x="8" y="4" width="2" height="1"/><rect class="m-ink" x="7" y="5" width="1" height="2"/><rect class="m-ink" x="10" y="5" width="1" height="2"/>' +
      '<rect class="m-ink" x="20" y="4" width="2" height="1"/><rect class="m-ink" x="19" y="5" width="1" height="2"/><rect class="m-ink" x="22" y="5" width="1" height="2"/>',
    big: '<rect class="m-ink" x="7" y="3" width="4" height="5"/><rect class="m-hl" x="8" y="4" width="1" height="1"/>' +
      '<rect class="m-ink" x="19" y="3" width="4" height="5"/><rect class="m-hl" x="20" y="4" width="1" height="1"/>',
    dizzy: [[7, 4], [10, 4], [8, 5], [9, 5], [8, 6], [9, 6], [7, 7], [10, 7]]
      .map(([px, py]) => `<rect class="m-ink" x="${px}" y="${py}" width="1" height="1"/><rect class="m-ink" x="${px + 12}" y="${py}" width="1" height="1"/>`).join(""),
  };
  const SPRITE =
    '<svg class="m-sprite" viewBox="0 0 30 20" aria-hidden="true" focusable="false" shape-rendering="crispEdges">' +
      '<g class="m-legs">' +
        '<rect class="m-px m-leg m-leg-1" x="6" y="16" width="2" height="4"/>' +
        '<rect class="m-px m-leg m-leg-2" x="10" y="16" width="2" height="4"/>' +
        '<rect class="m-px m-leg m-leg-3" x="18" y="16" width="2" height="4"/>' +
        '<rect class="m-px m-leg m-leg-4" x="22" y="16" width="2" height="4"/>' +
      '</g>' +
      '<g class="m-sit"><g class="m-upper">' +
        '<g class="m-arm m-arm-l"><rect class="m-px" x="0" y="8" width="4" height="4"/><rect class="m-sh" x="0" y="11" width="4" height="1"/></g>' +
        '<g class="m-arm m-arm-r"><rect class="m-px" x="26" y="8" width="4" height="4"/><rect class="m-sh" x="26" y="11" width="4" height="1"/></g>' +
        '<g class="m-arm m-arm-lu"><rect class="m-px" x="1" y="1" width="3" height="3"/><rect class="m-px" x="1" y="-3" width="2" height="4"/></g>' +
        '<g class="m-arm m-arm-ru"><rect class="m-px" x="26" y="1" width="3" height="3"/><rect class="m-px" x="27" y="-3" width="2" height="4"/></g>' +
        '<g class="m-torso"><rect class="m-px" x="4" y="0" width="22" height="16"/><rect class="m-sh" x="4" y="14" width="22" height="2"/></g>' +
        '<g class="m-eyes">' +
          Object.entries(EYES).map(([k, v]) => `<g class="m-eye-${k}">${v}</g>`).join("") +
        '</g>' +
      '</g></g>' +
    '</svg>';

  /* Hiệu ứng pixel nhỏ (chuỗi tĩnh, không chứa dữ liệu người dùng) */
  const px = (cells) => cells.map(([a, b, w, h]) => `<rect x="${a}" y="${b}" width="${w}" height="${h}"/>`).join("");
  const FX_SVG = {
    heart: `<svg viewBox="0 0 7 6" shape-rendering="crispEdges">${px([[1, 0, 2, 1], [4, 0, 2, 1], [0, 1, 7, 2], [1, 3, 5, 1], [2, 4, 3, 1], [3, 5, 1, 1]])}</svg>`,
    note1: `<svg viewBox="0 0 5 7" shape-rendering="crispEdges">${px([[3, 0, 1, 6], [4, 1, 1, 2], [1, 5, 3, 2]])}</svg>`,
    note2: `<svg viewBox="0 0 7 7" shape-rendering="crispEdges">${px([[2, 0, 5, 1], [2, 1, 1, 5], [6, 1, 1, 5], [0, 5, 3, 2], [4, 5, 3, 2]])}</svg>`,
    spark: `<svg viewBox="0 0 5 5" shape-rendering="crispEdges">${px([[2, 0, 1, 5], [0, 2, 5, 1]])}</svg>`,
    bang: `<svg viewBox="0 0 2 8" shape-rendering="crispEdges">${px([[0, 0, 2, 5], [0, 6, 2, 2]])}</svg>`,
  };

  /* ============================================================
   *  3. TẠO LINH VẬT
   * ============================================================ */
  const cleanText = (v, max) => (typeof v === "string" ? Array.from(v.replace(/\s+/g, " ").trim()).slice(0, max).join("") : "");

  function noopApi() {
    return { say() {}, act() { return false; }, destroy() {}, el: null };
  }

  function create(options) {
    const opts = options || {};
    if (opts.enabled === false || typeof document === "undefined") return noopApi();

    /* ---------- tuỳ chọn ---------- */
    const name = cleanText(opts.name, 30) || "Bé Cam";
    const color = normColor(opts.color) || "#d97757";
    const messages = (Array.isArray(opts.messages) ? opts.messages : [])
      .map((m) => cleanText(m, 120)).filter(Boolean).slice(0, 30);
    const audio = typeof HTMLMediaElement !== "undefined" && opts.audio instanceof HTMLMediaElement ? opts.audio : null;
    const book = opts.book && opts.book.nodeType === 1 ? opts.book : null;
    const storeKey = typeof opts.storageKey === "string" && opts.storageKey ? opts.storageKey : STORE_KEY;
    const sleepAfter = Number(opts.sleepAfter) >= 5000 ? Number(opts.sleepAfter) : SLEEP_MS;
    const mqReduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const forcedReduce = typeof opts.reducedMotion === "boolean" ? opts.reducedMotion : null;
    let reduced = forcedReduce !== null ? forcedReduce : !!(mqReduce && mqReduce.matches);

    const fmt = (s) => String(s || "").split("{name}").join(name);
    const lineFor = (kind) => fmt(pick(LINES[kind]));
    const actLine = (kind) => {
      if (kind !== "sleep" && kind !== "hop" && Math.random() < 0.45) return fmt(pick(messages.length ? messages : DEFAULT_MESSAGES));
      return lineFor(kind);
    };

    /* ---------- dựng DOM ---------- */
    const root = document.createElement("div");
    root.className = "mascot";
    root.dataset.state = "hidden";
    root.dataset.face = "open";
    root.style.setProperty("--m-base", color);
    root.style.setProperty("--m-shade", shade(color, -0.22));
    root.style.setProperty("--m-eye", shade(color, -0.84));
    root.style.setProperty("--m-light", shade(color, 0.82));
    root.innerHTML =
      '<button class="mascot-pet" type="button">' +
        '<span class="m-shadow" aria-hidden="true"></span>' +
        '<span class="m-tilt"><span class="m-squash"><span class="m-dir"><span class="m-bop"><span class="m-act">' +
          SPRITE +
        '</span></span></span></span></span>' +
      '</button>' +
      '<div class="mascot-bubble" role="status" aria-live="polite" aria-atomic="true"><span class="mascot-bubble-text"></span></div>' +
      '<div class="mascot-fx" aria-hidden="true"></div>';
    const btn = root.querySelector(".mascot-pet");
    const tiltEl = root.querySelector(".m-tilt");
    const fx = root.querySelector(".mascot-fx");
    const bubble = root.querySelector(".mascot-bubble");
    const bubbleText = root.querySelector(".mascot-bubble-text");
    btn.setAttribute("aria-label", `Linh vật ${name} — chạm để chơi`);
    root.classList.toggle("is-reduced", reduced);

    /* ---------- trạng thái ---------- */
    let W = 60, H = 40, vw = 0, vh = 0;
    let state = "hidden";        // hidden | rest | walk | held | fly
    let platform = null;         // "book" | "floor" | null (đang bay / bị cầm)
    let anchored = false;        // đang đậu trên sách → position:absolute theo trang (cuộn mượt, không giật)
    let x = 0, y = 0, rel = 0, lastBookW = 0;   // x = tâm ngang, y = mép chân (toạ độ màn hình)
    let vx = 0, vy = 0, bounces = 0, flung = false, flightDrag = PHYS.drag;
    let tilt = 0, tiltVel = 0, heldVx = 0;
    let dir = 1, asleep = false, sitting = false;
    let action = null, actFace = null, tmpFace = null, lastAction = "";
    let walk = null, eyesLocked = false;
    let raf = 0, lastT = 0, syncRaf = 0;
    let press = null, lastPointerUp = -1e9, tapTimer = 0, lastTapAt = -1e9;
    let pointer = null, lookTs = 0;
    let musicOn = false, lastMusicSay = -1e9, lastFlipSay = -1e9;
    let lastActivity = Date.now();
    let bubbleOn = false, bubbleSize = null;
    let entered = false, greetPending = false, pendingSay = null, destroyed = false;
    const timers = {};
    const T = (key, fn, ms) => { clearTimeout(timers[key]); timers[key] = setTimeout(fn, ms); };
    const clearT = (key) => { clearTimeout(timers[key]); timers[key] = 0; };

    /* ---------- kích thước + bục đứng ---------- */
    function measure() {
      W = btn.offsetWidth || W;
      H = btn.offsetHeight || H;
      vw = document.documentElement.clientWidth || window.innerWidth;
      vh = window.innerHeight || document.documentElement.clientHeight;
    }

    function bookRect() {
      if (!book || !book.isConnected) return null;
      if (book.classList.contains("card") && !book.classList.contains("visible")) return null;
      const r = book.getBoundingClientRect();
      if (r.width < W * 1.2 || r.height < 4) return null;
      return r;
    }
    const bookSpan = (r) => [r.left + W * 0.4, Math.max(r.left + W * 0.4, r.right - W * 0.4)];
    const floorSpan = () => [W / 2 + 4, Math.max(W / 2 + 4, vw - W / 2 - 4)];
    const floorP = () => ({ id: "floor", y: vh, x1: -Infinity, x2: Infinity });
    function spanFor(pl) {
      if (pl === "book") { const r = bookRect(); if (r) return bookSpan(r); }
      return floorSpan();
    }
    // mép trên cuốn sách chỉ là bục khi đủ chỗ cho linh vật đứng và còn trong màn hình
    function platformsNow() {
      const r = bookRect();
      return r && r.top >= H * 0.6 && r.top <= vh - 2 ? [{ id: "book", y: r.top, x1: r.left + 2, x2: r.right - 2 }] : [];
    }
    function toggleRect() {
      const el = document.getElementById("themeToggle") || document.querySelector(".theme-toggle");
      if (!el || !el.isConnected) return null;
      const r = el.getBoundingClientRect();
      return r.width ? r : null;
    }

    /* ---------- vị trí trên màn hình ---------- */
    function setAnchored(on) {
      if (on === anchored) return;
      anchored = on;
      root.classList.toggle("is-anchored", on);
    }
    function refreshXY() {
      if (!anchored) return;
      const r = bookRect();
      if (r) { x = r.left + rel; y = r.top; }
    }
    function setX(nx) {
      if (anchored) { const r = bookRect(); if (r) rel = nx - r.left; }
      x = nx;
    }
    function place() {
      let left, top;
      if (anchored) {
        refreshXY();
        left = x - W / 2 + window.scrollX;
        top = y - H + window.scrollY;
      } else {
        left = x - W / 2;
        top = y - H;
      }
      const d = window.devicePixelRatio || 1;
      root.style.transform = `translate3d(${Math.round(left * d) / d}px, ${Math.round(top * d) / d}px, 0)`;
    }

    /* ---------- trạng thái + biểu cảm ---------- */
    function setState(s) {
      state = s;
      root.dataset.state = s;
      root.dataset.platform = platform || "";
      refreshFace();
      refreshBop();
    }
    function refreshFace() {
      let f = "open";
      if (asleep) f = "closed";
      if (state === "held" || state === "fly") f = "big";
      if (actFace) f = actFace;
      if (tmpFace) f = tmpFace;
      root.dataset.face = f;
    }
    function tempFace(f, ms) {
      tmpFace = f;
      refreshFace();
      T("face", () => { tmpFace = null; refreshFace(); }, ms);
    }
    function setDir(d) {
      dir = d < 0 ? -1 : 1;
      root.classList.toggle("dir-left", dir < 0);
    }
    // mắt lệch theo hệ toạ độ của hình (khi quay trái, hình đã lật)
    function setEyes(ex, ey) {
      root.style.setProperty("--ex", String(ex));
      root.style.setProperty("--ey", String(ey));
    }
    function lookAtPointer() {
      if (!pointer || eyesLocked || state === "hidden" || state === "walk" || asleep) return;
      refreshXY();
      const dx = pointer.x - x;
      const dy = pointer.y - (y - H * 0.65);
      const ex = Math.abs(dx) < W * 0.35 ? 0 : dx > 0 ? 2 : -2;
      const ey = dy < -H * 0.9 ? -1 : dy > H * 0.6 ? 1 : 0;
      setEyes(ex * dir, ey);
    }
    function setSitting(on) {
      sitting = on;
      root.classList.toggle("is-sitting", on);
      if (on) T("sit", () => setSitting(false), rand(5000, 12000));
      else clearT("sit");
    }
    function squash() {
      if (reduced) return;
      root.classList.remove("is-landing");
      void root.offsetWidth; // khởi động lại animation
      root.classList.add("is-landing");
      T("squash", () => root.classList.remove("is-landing"), 460);
    }

    /* ---------- hiệu ứng pixel ---------- */
    function particle(html, cls, px0, py0, vars, life) {
      if (reduced || document.hidden || fx.childElementCount > 40) return;
      const el = document.createElement("span");
      el.className = "m-fx " + cls;
      el.innerHTML = html; // chỉ chuỗi tĩnh trong FX_SVG / chữ "Z"
      el.style.left = px0 + "px";
      el.style.top = py0 + "px";
      for (const k in vars) el.style.setProperty("--" + k, vars[k]);
      fx.appendChild(el);
      setTimeout(() => el.remove(), life);
    }
    function dust(n = 3) {
      for (let i = 0; i < n; i++) {
        for (const s of [-1, 1]) {
          particle("", "m-fx-dust", W / 2 + s * rand(W * 0.12, W * 0.34), H - 2,
            { dx: `${s * rand(8, 20)}px`, dy: `${-rand(2, 9)}px`, dur: `${Math.round(rand(380, 540))}ms`, delay: `${i * 40}ms` }, 800);
        }
      }
    }
    function heart() {
      particle(FX_SVG.heart, "m-fx-heart", W / 2 + rand(-W * 0.3, W * 0.3), H * 0.1,
        { dx: `${rand(-18, 18)}px`, dy: `${-(H * 1.3 + rand(0, H * 0.7))}px`, rot: `${rand(-18, 18)}deg`, dur: `${Math.round(rand(1100, 1500))}ms` }, 1700);
    }
    function note() {
      particle(Math.random() < 0.5 ? FX_SVG.note1 : FX_SVG.note2, "m-fx-note" + (Math.random() < 0.5 ? " alt" : ""),
        W / 2 + rand(-W * 0.25, W * 0.35), 0,
        { dx: `${rand(-16, 16)}px`, dy: `${-(H * 1.1 + rand(0, 14))}px`, dur: `${Math.round(rand(1400, 1900))}ms` }, 2100);
    }
    function sparkles(cx, cy, n) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand(-0.25, 0.25);
        const R = rand(W * 0.45, W * 0.8);
        particle(FX_SVG.spark, "m-fx-spark" + (i % 2 ? " alt" : ""), cx, cy,
          { dx: `${Math.cos(a) * R}px`, dy: `${Math.sin(a) * R}px`, dur: `${Math.round(rand(600, 850))}ms` }, 1000);
      }
    }
    function zed() {
      const big = Math.random() < 0.5;
      particle(big ? "Z" : "z", "m-fx-z" + (big ? "" : " small"), W * 0.72, H * 0.05,
        { dx: `${rand(10, 22)}px`, dy: `${-(H * 0.9 + rand(0, 10))}px`, dur: "2000ms" }, 2200);
    }
    function effect(kind) {
      if (kind === "dust") dust(3);
      else if (kind === "note") note();
      else if (kind === "heart") heart();
      else if (kind === "bang") particle(FX_SVG.bang, "m-fx-bang", W * 0.84, -H * 0.15, { dur: "900ms" }, 1000);
      else if (kind === "sparkTop") sparkles(W / 2, -H * 1.6, 8);
      else if (kind === "sparkLow") sparkles(W / 2, H * 0.5, 6);
    }

    /* ---------- bóng thoại ---------- */
    function layoutBubble() {
      if (!bubbleOn) return;
      refreshXY();
      if (!bubbleSize) bubbleSize = { w: bubble.offsetWidth, h: bubble.offsetHeight };
      const L = bubbleLayout({ left: x - W / 2, top: y - H, w: W, h: H, bw: bubbleSize.w, bh: bubbleSize.h, vw, vh });
      bubble.style.left = L.x + "px";
      bubble.style.setProperty("--tail", L.tail + "px");
      bubble.classList.toggle("below", L.below);
    }
    function say(text, ms) {
      if (destroyed) return;
      const t = cleanText(text == null ? "" : String(text), 160);
      if (!t) { hideBubble(); return; }
      if (!entered) { pendingSay = [t, ms]; return; }
      clearT("bubbleClear");
      bubbleText.textContent = t; // luôn textContent — an toàn với chuỗi người dùng
      bubbleOn = true;
      bubbleSize = null;
      bubble.classList.add("show");
      layoutBubble();
      const dur = Number(ms) > 0 ? clamp(Number(ms), 600, 20000) : clamp(1600 + Array.from(t).length * 60, 2200, 6500);
      T("bubble", hideBubble, dur);
    }
    function hideBubble() {
      clearT("bubble");
      if (!bubbleOn) return;
      bubbleOn = false;
      bubble.classList.remove("show");
      T("bubbleClear", () => { if (!bubbleOn) bubbleText.textContent = ""; }, 260);
    }

    /* ---------- vòng rAF: chỉ chạy khi đang cầm / bay / đi ---------- */
    function ensureLoop() {
      if (!raf && !destroyed && !document.hidden) raf = requestAnimationFrame(tick);
    }
    function cancelLoop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      lastT = 0;
    }
    function tick(t) {
      raf = 0;
      if (destroyed) return;
      const dt = lastT ? clamp((t - lastT) / 1000, 0.001, 1 / 30) : 1 / 60;
      lastT = t;
      let more = false;
      if (state === "held") more = updateHeld(dt);
      else if (state === "fly") more = updateFly(dt);
      else if (state === "walk") more = updateWalk(dt);
      if (bubbleOn) layoutBubble();
      if (more && !raf && !document.hidden) raf = requestAnimationFrame(tick);
      else if (!raf) lastT = 0;
    }

    /* ---------- đi bộ ---------- */
    function walkTo(tx, speed, cb) {
      if (state !== "rest" && state !== "walk") return;
      refreshXY();
      const [a, b] = spanFor(platform);
      tx = clamp(tx, a, b);
      if (Math.abs(tx - x) < 2) { if (cb) cb(); return; }
      if (reduced) { // không có hoạt ảnh: dời tức thì
        setX(tx);
        place();
        layoutBubble();
        save();
        if (cb) cb();
        return;
      }
      if (sitting) setSitting(false);
      walk = { tx, speed, cb: cb || null };
      setDir(tx < x ? -1 : 1);
      setState("walk");
      setEyes(2, 0);
      ensureLoop();
    }
    function stopWalk() {
      if (state !== "walk") return;
      walk = null;
      setState("rest");
      setEyes(0, 0);
      save();
    }
    function updateWalk(dt) {
      if (!walk) { setState("rest"); return false; }
      refreshXY();
      const [a, b] = spanFor(platform);
      const tx = clamp(walk.tx, a, b);
      const d = tx - x;
      const step = walk.speed * dt;
      if (Math.abs(d) <= step) {
        setX(tx);
        place();
        const cb = walk.cb;
        walk = null;
        setState("rest");
        setEyes(0, 0);
        save();
        if (cb) cb(); else afterSettle();
        return false;
      }
      setX(x + Math.sign(d) * step);
      place();
      return true;
    }
    function randomWalk() {
      refreshXY();
      const [a, b] = spanFor(platform);
      if (b - a < 24) return false;
      let d = rand(30, Math.max(40, Math.min(170, (b - a) * 0.6))) * (Math.random() < 0.5 ? -1 : 1);
      if (x + d < a || x + d > b) d = -d;
      let tx = clamp(x + d, a, b);
      const t = toggleRect();
      if (t) {
        const nx = avoidBox({ cx: tx, halfW: W / 2, top: y - H, bottom: y }, t, 8, a, b);
        if (nx !== null) tx = nx;
      }
      if (Math.abs(tx - x) < 12) return false;
      walkTo(tx, W * 0.65);
      return true;
    }
    // không bao giờ đứng che nút sáng / tối ở góc trên phải
    function ensureClearOfToggle() {
      if (state !== "rest" || press) return;
      const t = toggleRect();
      if (!t) return;
      refreshXY();
      const [a, b] = spanFor(platform);
      const nx = avoidBox({ cx: x, halfW: W / 2, top: y - H, bottom: y }, t, 8, a, b);
      if (nx !== null && Math.abs(nx - x) >= 1) walkTo(nx, W * 2.2);
    }

    /* ---------- bay / rơi / đáp ---------- */
    function startFlight(nvx, nvy, o = {}) {
      refreshXY();
      walk = null;
      endAction(true);
      if (sitting) setSitting(false);
      setAnchored(false);
      platform = null;
      vx = nvx;
      vy = nvy;
      bounces = 0;
      flung = !!o.flung;
      flightDrag = o.auto ? 0 : PHYS.drag;
      tiltEl.style.transformOrigin = "";
      setState("fly");
      place();
      if (reduced || document.hidden) { resolveFlight(); return; }
      ensureLoop();
    }
    // đặt ngay xuống bục bên dưới (giảm chuyển động / tab bị ẩn)
    function resolveFlight() {
      const p = platformBelow(x, y, [...platformsNow(), floorP()], 2) || floorP();
      land(p, 0, true);
    }
    function updateFly(dt) {
      const r = stepFlight({ x, y, vx, vy }, dt, {
        gravity: PHYS.gravity, maxFall: PHYS.maxFall, drag: flightDrag, wallDamp: PHYS.wallDamp, ceilDamp: PHYS.ceilDamp,
        halfW: W / 2, h: H, vw, vh, platforms: platformsNow(),
      });
      x = r.x; y = r.y; vx = r.vx; vy = r.vy;
      const target = clamp(vx * 0.012, -22, 22);
      tilt += (target - tilt) * Math.min(1, dt * 10);
      tiltEl.style.transform = `rotate(${tilt.toFixed(2)}deg)`;
      if (r.landed) {
        if (r.impact > PHYS.bounceAt && bounces < 1) { // nảy lên 1 lần
          bounces++;
          vy = -r.impact * 0.3;
          y = r.landed.y - 0.5;
          squash();
          dust(2);
          place();
          return true;
        }
        land(r.landed, r.impact);
        return false;
      }
      place();
      return true;
    }
    function land(p, impact = 0, quiet = false) {
      vx = vy = 0;
      tilt = tiltVel = 0;
      tiltEl.style.transform = "";
      tiltEl.style.transformOrigin = "";
      const r = p && p.id === "book" ? bookRect() : null;
      if (r) {
        platform = "book";
        const [a, b] = bookSpan(r);
        x = clamp(x, a, b);
        y = r.top;
        rel = x - r.left;
        lastBookW = r.width;
        setAnchored(true);
      } else {
        platform = "floor";
        const [a, b] = floorSpan();
        x = clamp(x, a, b);
        y = vh;
        setAnchored(false);
      }
      setState("rest");
      place();
      if (!quiet && !reduced && impact > 200) { squash(); dust(impact > 900 ? 4 : 3); }
      let line = "";
      if (greetPending) {
        greetPending = false;
        line = lineFor("greet");
      } else if (!quiet && flung) {
        if (impact > PHYS.dizzyAt) { tempFace("dizzy", 1400); if (Math.random() < 0.7) line = lineFor("dizzy"); }
        else if (Math.random() < 0.3) line = lineFor("land");
      }
      flung = false;
      if (line) say(line);
      save();
      afterSettle();
    }
    function afterSettle() {
      if (state !== "rest") return;
      ensureClearOfToggle();
      scheduleIdle();
      refreshBop();
      layoutBubble();
      lookAtPointer();
    }
    // sách trôi khỏi màn hình (cuộn trang) → rơi xuống đáy
    function detachFall() {
      refreshXY();
      if (Math.random() < 0.35) say(lineFor("fall"));
      startFlight(0, 0);
    }
    // thỉnh thoảng nhảy từ đáy màn hình lên mép sách
    function tryClimb() {
      const r = bookRect();
      if (!r || platform !== "floor" || r.top < H + 40 || r.top > vh - H * 2) return false;
      const [a, b] = bookSpan(r);
      let tx = clamp(clamp(x, a + 10, b - 10) + rand(-40, 40), a, b);
      const t = toggleRect();
      if (t) {
        const nx = avoidBox({ cx: tx, halfW: W / 2, top: r.top - H, bottom: r.top }, t, 8, a, b);
        if (nx !== null) tx = nx;
      }
      const v = launchTo(x, y, tx, r.top, PHYS.gravity);
      if (Math.abs(v.vx) > 1600) return false;
      if (Math.random() < 0.5) say(lineFor("climb"));
      startFlight(v.vx, v.vy, { auto: true });
      return true;
    }

    /* ---------- cầm / kéo / ném ---------- */
    function startHold() {
      if (!press || press.dragging) return;
      press.dragging = true;
      clearTimeout(press.holdTimer);
      clearTimeout(tapTimer);
      tapTimer = 0;
      walk = null;
      endAction(true);
      if (sitting) setSitting(false);
      if (asleep) setAsleep(false);
      refreshXY();
      setAnchored(false);
      platform = null;
      press.gx = clamp(press.x0 - (x - W / 2), 0, W);
      press.gy = clamp(press.y0 - (y - H), 0, H);
      tiltEl.style.transformOrigin = `${press.gx.toFixed(1)}px ${press.gy.toFixed(1)}px`;
      tilt = tiltVel = heldVx = 0;
      setState("held");
      place();
      if (Math.random() < 0.4) say(lineFor("grab"));
      ensureLoop();
    }
    // vị trí linh vật khi điểm cầm (gx, gy) nằm dưới ngón tay / con trỏ
    function heldTarget(pr) {
      return {
        x: clamp(pr.last.x - pr.gx + W / 2, W / 2, Math.max(W / 2, vw - W / 2)),
        y: clamp(pr.last.y - pr.gy + H, H, Math.max(H, vh)),
      };
    }
    function updateHeld(dt) {
      if (!press) return false;
      const p = heldTarget(press);
      heldVx += ((p.x - x) / dt - heldVx) * Math.min(1, dt * 12);
      x = p.x;
      y = p.y;
      place();
      // lắc lư như con lắc: kéo sang phải thì thân đung đưa về sau
      const k = press.gy < H * 0.5 ? 1 : -1;
      const target = clamp(heldVx * 0.03 * k, -38, 38);
      tiltVel += ((target - tilt) * 170 - tiltVel * 11) * dt;
      tilt = clamp(tilt + tiltVel * dt, -50, 50);
      tiltEl.style.transform = `rotate(${tilt.toFixed(2)}deg)`;
      return true;
    }
    function release(p, now, cancelled) {
      const tp = heldTarget(p);
      x = tp.x;
      y = tp.y;
      tiltEl.style.transformOrigin = "";
      if (reduced) { resolveFlight(); return; }
      const v = cancelled ? { vx: 0, vy: 0 } : velocity(p.samples, now);
      const speed = Math.hypot(v.vx, v.vy);
      if (speed > PHYS.flingSpeed) {
        const s = Math.min(1, PHYS.maxThrow / speed);
        if (Math.random() < 0.35) say(lineFor("fling"));
        startFlight(v.vx * s, v.vy * s, { flung: true });
        return;
      }
      // thả nhẹ sát mép sách / đáy → đặt luôn
      const near = platformNear(x, y, [...platformsNow(), floorP()], Math.max(8, H * 0.35));
      if (near) { land(near, 300); return; }
      startFlight(v.vx * 0.25, Math.max(0, v.vy * 0.25));
    }
    function endPress() {
      if (!press) return;
      clearTimeout(press.holdTimer);
      try { if (btn.hasPointerCapture(press.id)) btn.releasePointerCapture(press.id); } catch { /* bỏ qua */ }
      press = null;
      root.classList.remove("is-pressed");
    }
    const evTime = (e) => (e && e.timeStamp > 0 ? e.timeStamp : performance.now());

    function onDown(e) {
      if (press || state === "hidden" || destroyed) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.stopPropagation(); // không để cử chỉ lật trang của cuốn sách bắt nhầm
      e.preventDefault();  // không bôi đen chữ khi kéo
      markActivity();
      try { btn.setPointerCapture(e.pointerId); } catch { /* bỏ qua */ }
      const t = evTime(e);
      press = {
        id: e.pointerId, type: e.pointerType, x0: e.clientX, y0: e.clientY, t0: performance.now(),
        dragging: false, gx: 0, gy: 0, holdTimer: 0,
        last: { x: e.clientX, y: e.clientY }, samples: [{ t, x: e.clientX, y: e.clientY }],
      };
      root.classList.add("is-pressed");
      if (state === "fly") { startHold(); return; } // bắt giữa không trung
      if (state === "walk") stopWalk();             // đang đi thì đứng lại khi bị chạm
      press.holdTimer = setTimeout(() => { if (press && !press.dragging) startHold(); }, 420);
    }
    function onMove(e) {
      if (!press || e.pointerId !== press.id) return;
      press.last = { x: e.clientX, y: e.clientY };
      press.samples.push({ t: evTime(e), x: e.clientX, y: e.clientY });
      if (press.samples.length > 14) press.samples.shift();
      if (!press.dragging) {
        if (Math.hypot(e.clientX - press.x0, e.clientY - press.y0) > (press.type === "mouse" ? 5 : 9)) startHold();
      } else ensureLoop();
    }
    function onUp(e) {
      if (!press || e.pointerId !== press.id) return;
      const p = press;
      endPress();
      lastPointerUp = performance.now();
      if (p.dragging) release(p, evTime(e), false);
      else if (performance.now() - p.t0 < 600) onTap();
    }
    function onCancel(e) {
      if (!press || (e.pointerId !== undefined && e.pointerId !== press.id)) return;
      const p = press;
      endPress();
      lastPointerUp = performance.now();
      if (p.dragging) release(p, performance.now(), true);
    }
    // Enter / Space / trình đọc màn hình kích hoạt nút (click không đến từ cú chạm vừa xử lý)
    function onClick(e) {
      e.preventDefault();
      if (press || performance.now() - lastPointerUp < 700) return;
      markActivity();
      if (asleep) wake();
      else doAct(pickDifferent(TAP_ACTS, lastAction));
    }

    /* ---------- chạm / động tác ---------- */
    function onTap() {
      markActivity();
      if (asleep) { clearTimeout(tapTimer); tapTimer = 0; wake(); return; }
      const now = performance.now();
      if (tapTimer && now - lastTapAt < DOUBLE_TAP_MS + 40) {
        clearTimeout(tapTimer);
        tapTimer = 0;
        doAct("special");
        return;
      }
      lastTapAt = now;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => {
        tapTimer = 0;
        doAct(pickDifferent(TAP_ACTS, lastAction));
      }, DOUBLE_TAP_MS);
    }

    function doAct(rawName, o = {}) {
      if (destroyed || !entered) return false;
      const name = ALIASES[rawName] || rawName;
      if (name === "wake") { if (asleep) wake(); return true; }
      if (name !== "sleep" && !ACTS[name]) return false;
      if (state !== "rest" && state !== "walk") return false;
      if (state === "walk") stopWalk();
      endAction(true);
      if (sitting) setSitting(false);
      if (!o.keepLast) lastAction = name;
      const line = o.line !== undefined ? o.line : actLine(name);
      if (name === "sleep") {
        setAsleep(true);
        if (line) say(line);
        return true;
      }
      if (asleep) setAsleep(false);
      const def = ACTS[name];
      const cur = { name, timers: [] };
      action = cur;
      const at = (ms, fn) => cur.timers.push(setTimeout(fn, ms));
      root.removeAttribute("data-act");
      void root.offsetWidth; // khởi động lại animation nếu lặp lại cùng động tác
      root.dataset.act = name;
      actFace = def.face || null;
      refreshFace();
      refreshBop();
      if (reduced) { // chỉ đổi dáng + bóng thoại
        if (line) say(line);
        if (def.look) { eyesLocked = true; setEyes(-2, 0); }
        at(1300, () => endAction());
        return true;
      }
      // động tác bật cao: cất bóng thoại cũ để không che, nói khi tiếp đất
      if (def.sayAt) hideBubble();
      if (line) { if (def.sayAt) at(def.sayAt, () => say(line)); else say(line); }
      (def.faces || []).forEach(([ms, f]) => at(ms, () => { actFace = f; refreshFace(); }));
      (def.fx || []).forEach(([ms, k]) => at(ms, () => effect(k)));
      if (def.look) { eyesLocked = true; def.look.forEach(([ms, ex, ey]) => at(ms, () => setEyes(ex, ey))); }
      at(def.dur, () => endAction());
      return true;
    }
    function endAction(silent) {
      if (!action) return;
      action.timers.forEach(clearTimeout);
      action = null;
      actFace = null;
      root.removeAttribute("data-act");
      if (eyesLocked) { eyesLocked = false; setEyes(0, 0); }
      refreshFace();
      refreshBop();
      if (!silent && state === "rest") { scheduleIdle(); lookAtPointer(); }
    }

    /* ---------- ngủ ---------- */
    function setAsleep(on) {
      if (asleep === on) return;
      asleep = on;
      root.classList.toggle("is-asleep", on);
      if (on) {
        if (state === "walk") stopWalk();
        clearT("idle");
        clearT("blink");
        setEyes(0, 0);
        scheduleZ(0);
      } else {
        clearT("zzz");
        lastActivity = Date.now();
        scheduleBlink();
        scheduleIdle();
        scheduleSleepCheck();
      }
      refreshFace();
      refreshBop();
    }
    function wake(line) {
      if (!asleep) return;
      setAsleep(false);
      if (!doAct("hop", { line: line !== undefined ? line : lineFor("wake"), keepLast: true })) tempFace("big", 450);
    }
    function scheduleZ(delay) {
      T("zzz", () => {
        if (!asleep || destroyed) return;
        if (!document.hidden) zed();
        scheduleZ(1500);
      }, delay);
    }
    function scheduleSleepCheck(delay = sleepAfter) {
      T("sleep", () => {
        if (destroyed || document.hidden) return;
        const idle = Date.now() - lastActivity;
        if (idle >= sleepAfter && state === "rest" && !action && !asleep && !press) {
          setAsleep(true);
          if (Math.random() < 0.6) say(lineFor("doze"));
          return;
        }
        if (!asleep) scheduleSleepCheck(Math.max(1000, sleepAfter - idle));
      }, delay);
    }
    function markActivity() { lastActivity = Date.now(); }

    /* ---------- tự sống: chớp mắt, đi dạo, ngồi ---------- */
    function scheduleBlink() {
      T("blink", () => {
        if (destroyed || document.hidden) return;
        if (root.dataset.face === "open" && !asleep) {
          root.classList.add("is-blink");
          setTimeout(() => root.classList.remove("is-blink"), 130);
          if (Math.random() < 0.2) {
            setTimeout(() => root.classList.add("is-blink"), 260);
            setTimeout(() => root.classList.remove("is-blink"), 390);
          }
        }
        scheduleBlink();
      }, rand(3000, 6000));
    }
    function scheduleIdle() {
      if (asleep) return;
      T("idle", autonomous, rand(8000, 20000));
    }
    function autonomous() {
      if (destroyed || document.hidden) return;
      if (state !== "rest" || action || asleep || press) { scheduleIdle(); return; }
      const r = Math.random();
      if (sitting) {
        if (r < 0.6) { setSitting(false); if (!reduced && Math.random() < 0.5 && randomWalk()) return; }
        scheduleIdle();
        return;
      }
      if (!reduced && platform === "floor" && r < 0.14 && tryClimb()) return;
      if (!reduced && r < 0.68 && randomWalk()) return;
      if (r < 0.88) setSitting(true);
      else doAct("look", { line: "", keepLast: true });
      scheduleIdle();
    }

    /* ---------- nhạc ---------- */
    function refreshBop() {
      const on = musicOn && !asleep && (state === "rest" || state === "walk") && !action && !reduced && !document.hidden;
      root.classList.toggle("is-bopping", on);
      if (on && !timers.notes) scheduleNotes();
      if (!on) clearT("notes");
    }
    function scheduleNotes() {
      T("notes", () => {
        timers.notes = 0;
        if (root.classList.contains("is-bopping")) { note(); scheduleNotes(); }
      }, rand(2500, 5000));
    }
    function onAudio() {
      const on = !!audio && !audio.paused && !audio.ended;
      if (on === musicOn) return;
      musicOn = on;
      refreshBop();
      const now = Date.now();
      if (on && entered && !asleep && state === "rest" && !action && now - lastMusicSay > 30000 && Math.random() < 0.6) {
        lastMusicSay = now;
        say(lineFor("music"));
      }
    }

    /* ---------- cuốn sách lật trang ---------- */
    function onBookFlip() {
      if (!entered || state === "held" || state === "fly" || state === "hidden") return;
      const now = Date.now();
      const talk = now - lastFlipSay > 1500;
      if (talk) lastFlipSay = now;
      if (asleep) { wake(talk ? lineFor("flip") : ""); return; }
      if (!action || action.name === "hop") doAct("hop", { line: talk ? lineFor("flip") : "", keepLast: true });
      requestSync();
    }

    /* ---------- cuộn / đổi cỡ / ẩn tab ---------- */
    function requestSync() {
      if (!syncRaf && !destroyed) syncRaf = requestAnimationFrame(() => { syncRaf = 0; sync(); });
    }
    function sync() {
      if (destroyed) return;
      const oldVw = vw;
      measure();
      bubbleSize = null;
      if (state === "hidden" || state === "held") return;
      if (state === "fly") { x = clamp(x, W / 2, Math.max(W / 2, vw - W / 2)); y = Math.min(y, vh); return; }
      if (platform === "book") {
        const r = bookRect();
        if (!r || r.top < 0 || r.top > vh) { detachFall(); return; }
        if (lastBookW && Math.abs(r.width - lastBookW) > 0.5) rel = (rel * r.width) / lastBookW;
        lastBookW = r.width;
        const [a, b] = bookSpan(r);
        rel = clamp(r.left + rel, a, b) - r.left;
        place();
      } else if (platform === "floor") {
        if (oldVw && vw !== oldVw) x = (x * vw) / oldVw;
        const [a, b] = floorSpan();
        x = clamp(x, a, b);
        y = vh;
        place();
      }
      layoutBubble();
      T("settle", () => { if (state === "rest") ensureClearOfToggle(); }, 250);
    }
    function onScroll() {
      markActivity();
      if (anchored && (state === "rest" || state === "walk")) {
        const r = bookRect();
        if (!r || r.top < 0 || r.top > vh) { detachFall(); return; }
      }
      if (bubbleOn) layoutBubble();
      T("settle", () => { if (state === "rest") ensureClearOfToggle(); }, 220);
    }
    // phòng khi sách dịch chuyển mà không có sự kiện nào (transform, ảnh tải xong…)
    function scheduleCheck() {
      T("check", () => {
        if (destroyed || document.hidden) return;
        if (anchored && state === "rest") {
          const r = bookRect();
          if (!r || r.top < 0 || r.top > vh) detachFall();
          else place();
        }
        scheduleCheck();
      }, 1500);
    }
    function onDocPointerMove(e) {
      lastActivity = Date.now();
      pointer = { x: e.clientX, y: e.clientY };
      const now = performance.now();
      if (now - lookTs > 80) { lookTs = now; lookAtPointer(); }
    }
    function onVisibility() {
      if (destroyed) return;
      if (document.hidden) {
        root.classList.add("is-paused");
        cancelLoop();
        if (press) { const p = press; endPress(); if (p.dragging) { const tp = heldTarget(p); x = tp.x; y = tp.y; resolveFlight(); } }
        if (state === "fly") resolveFlight();
        if (state === "walk") stopWalk();
        ["idle", "blink", "notes", "zzz", "sleep", "check"].forEach(clearT);
      } else {
        root.classList.remove("is-paused");
        markActivity();
        if (!entered) return;
        scheduleBlink();
        scheduleIdle();
        scheduleSleepCheck();
        scheduleCheck();
        if (asleep) scheduleZ(300);
        refreshBop();
        sync();
      }
    }
    function onReduceChange(e) {
      if (forcedReduce !== null) return;
      reduced = !!e.matches;
      root.classList.toggle("is-reduced", reduced);
      if (reduced) {
        if (state === "walk") stopWalk();
        if (state === "fly") resolveFlight();
        if (action) endAction();
      }
      refreshBop();
    }

    /* ---------- lưu vị trí cho lần ghé sau ---------- */
    function load() {
      try {
        const v = JSON.parse(localStorage.getItem(storeKey) || "null");
        if (v && (v.platform === "book" || v.platform === "floor") && Number.isFinite(v.f)) return { platform: v.platform, f: clamp(v.f, 0, 1) };
      } catch { /* bỏ qua */ }
      return null;
    }
    function save() {
      if (platform !== "book" && platform !== "floor") return;
      const r = platform === "book" ? bookRect() : null;
      const f = r ? rel / r.width : x / Math.max(1, vw);
      const data = JSON.stringify({ v: 1, platform: r ? "book" : "floor", f: Math.round(clamp(f, 0, 1) * 1000) / 1000 });
      T("save", () => { try { localStorage.setItem(storeKey, data); } catch { /* bỏ qua */ } }, 400);
    }

    /* ---------- xuất hiện ---------- */
    function waitReady() {
      const start = Date.now();
      let waited = false;
      const check = () => {
        if (destroyed) return;
        const modal = document.querySelector(".modal-overlay.show");
        const bookOk = !book || !book.classList.contains("card") || book.classList.contains("visible");
        if (!document.hidden && !modal && (bookOk || Date.now() - start > 6000)) {
          T("poll", enter, waited ? 750 : 350); // chờ cuốn sách trượt vào xong
          return;
        }
        waited = true;
        T("poll", check, 250);
      };
      check();
    }
    function enter() {
      if (destroyed || entered) return;
      entered = true;
      measure();
      root.classList.add("is-ready");
      const saved = load();
      const r = bookRect();
      const bookOk = r && r.top >= H * 0.6 && r.top <= vh - 2 ? r : null;
      scheduleBlink();
      scheduleSleepCheck();
      scheduleCheck();
      if (saved) {
        if (saved.platform === "book" && bookOk) {
          const [a, b] = bookSpan(bookOk);
          x = clamp(bookOk.left + saved.f * bookOk.width, a, b);
          land({ id: "book" }, 0, true);
        } else {
          const [a, b] = floorSpan();
          x = clamp(saved.platform === "floor" ? saved.f * vw : vw * 0.8, a, b);
          land(floorP(), 0, true);
        }
        if (!reduced) {
          root.classList.add("is-appearing");
          T("appear", () => root.classList.remove("is-appearing"), 600);
        }
        if (!pendingSay && Math.random() < 0.45) T("greet", () => say(lineFor("back")), 600);
      } else {
        // lần đầu: rơi từ trên xuống mép trên cuốn sách, gần bên phải
        greetPending = true;
        let tx, ty;
        if (bookOk) {
          const [a, b] = bookSpan(bookOk);
          tx = clamp(bookOk.right - Math.max(W * 1.3, bookOk.width * 0.16), a, b);
          ty = bookOk.top;
          const t = toggleRect();
          if (t) {
            const nx = avoidBox({ cx: tx, halfW: W / 2, top: ty - H, bottom: ty }, t, 8, a, b);
            if (nx !== null) tx = nx;
          }
        } else {
          const [a, b] = floorSpan();
          tx = clamp(vw * 0.78, a, b);
          ty = vh;
        }
        x = tx;
        if (reduced) {
          y = ty;
          land(bookOk ? { id: "book" } : floorP(), 0, true);
        } else {
          y = -4; // chân ngay trên mép màn hình → rơi vào
          startFlight(0, 0);
        }
      }
      if (pendingSay) {
        const [t, ms] = pendingSay;
        pendingSay = null;
        greetPending = false;
        say(t, ms);
      }
    }

    /* ---------- dọn dẹp ---------- */
    let ro = null;
    const listeners = [];
    const on = (target, type, fn, opt) => {
      if (!target) return;
      target.addEventListener(type, fn, opt);
      listeners.push([target, type, fn, opt]);
    };
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelLoop();
      if (syncRaf) cancelAnimationFrame(syncRaf);
      endPress();
      clearTimeout(tapTimer);
      if (action) action.timers.forEach(clearTimeout);
      Object.keys(timers).forEach((k) => clearTimeout(timers[k]));
      listeners.forEach(([t, type, fn, opt]) => t.removeEventListener(type, fn, opt));
      if (mqReduce) {
        if (mqReduce.removeEventListener) mqReduce.removeEventListener("change", onReduceChange);
        else if (mqReduce.removeListener) mqReduce.removeListener(onReduceChange);
      }
      if (ro) ro.disconnect();
      root.remove();
    }

    /* ---------- gắn sự kiện ---------- */
    on(btn, "pointerdown", onDown);
    on(btn, "pointermove", onMove);
    on(btn, "pointerup", onUp);
    on(btn, "pointercancel", onCancel);
    on(btn, "lostpointercapture", onCancel);
    on(btn, "click", onClick);
    on(btn, "contextmenu", (e) => e.preventDefault());
    on(btn, "dragstart", (e) => e.preventDefault());
    on(document, "pointermove", onDocPointerMove, { passive: true });
    ["pointerdown", "keydown", "wheel", "touchstart"].forEach((t) => on(window, t, markActivity, { passive: true }));
    on(window, "scroll", onScroll, { passive: true });
    on(window, "resize", requestSync);
    on(document, "visibilitychange", onVisibility);
    if (book) {
      on(book, "bookflip", onBookFlip);
      on(book, "transitionend", (e) => { if (e.target === book) requestSync(); });
    }
    if (audio) {
      ["play", "playing", "pause", "ended", "emptied"].forEach((t) => on(audio, t, onAudio));
      musicOn = !audio.paused && !audio.ended;
    }
    if (mqReduce && forcedReduce === null) {
      if (mqReduce.addEventListener) mqReduce.addEventListener("change", onReduceChange);
      else if (mqReduce.addListener) mqReduce.addListener(onReduceChange);
    }
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(requestSync);
      if (book) ro.observe(book);
      if (document.body) ro.observe(document.body);
    }

    const mount = () => {
      if (destroyed) return;
      (document.body || document.documentElement).appendChild(root);
      measure();
      waitReady();
    };
    if (document.body) mount();
    else document.addEventListener("DOMContentLoaded", mount, { once: true });

    return {
      say,
      act: (n) => doAct(String(n || "")),
      destroy,
      el: root,
    };
  }

  return { create, _math: MATH };
})();
