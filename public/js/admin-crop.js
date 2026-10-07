/* ============================================================
 *  admin-crop.js — khung cắt ảnh (tròn cho ảnh đại diện, vuông cho ảnh bìa bài hát)
 *  Kéo để dời ảnh (chuột / ngón tay), phóng to bằng thanh trượt, lăn chuột hoặc chụm 2 ngón,
 *  phím mũi tên để dời, + / − để phóng, 0 để đặt lại. Xuất ảnh vuông size×size dạng WebP (không được thì JPEG).
 *    AdminCrop.open({ file, shape: "circle" | "square", size: 640, title }) → Promise<Blob | null>
 * ============================================================ */
window.AdminCrop = (() => {
  "use strict";

  const K = window.AdminKit;
  const { h, icon } = K;
  const ZOOM_MAX = 8;   // phóng tối đa 8 lần so với vừa khung
  const CROP_RATIO = 0.82; // khung cắt chiếm 82% sân khấu, phần ngoài hiện mờ để thấy bối cảnh

  async function open({ file, shape = "circle", size = 640, title = "Cắt ảnh" } = {}) {
    const img = await K.images.decode(file); // lỗi (HEIC…) → nơi gọi báo toast
    const iw = img.width;
    const ih = img.height;

    const canvas = h("canvas", {
      class: "crop-canvas",
      tabindex: "0",
      role: "img",
      "aria-label": "Ảnh đang cắt. Kéo để dời ảnh, phím mũi tên để dời, phím + và − để phóng to thu nhỏ",
    });
    const mask = h("div", { class: `crop-mask ${shape === "circle" ? "is-circle" : "is-square"}`, "aria-hidden": "true" });
    const stage = h("div", { class: "crop-stage" }, canvas, mask);
    const zoom = h("input", { class: "crop-zoom", type: "range", min: "0", max: "1000", step: "1", value: "0", "aria-label": "Mức phóng to" });
    const zoomOut = h("button", { class: "icon-btn small", type: "button", "aria-label": "Thu nhỏ", title: "Thu nhỏ" }, icon("zoom-out"));
    const zoomIn = h("button", { class: "icon-btn small", type: "button", "aria-label": "Phóng to", title: "Phóng to" }, icon("zoom-in"));
    const reset = h("button", { class: "btn btn-ghost btn-sm", type: "button" }, icon("restore"), "Đặt lại");
    const tools = h("div", { class: "crop-tools" }, zoomOut, zoom, zoomIn, reset);
    const body = h("div", { class: "crop-body" },
      stage,
      tools,
      h("p", { class: "hint crop-hint", text: `Kéo để chỉnh vị trí · lăn chuột hoặc chụm hai ngón để phóng to · ảnh xuất ra ${size} × ${size} px` }),
    );

    /* ---------- trạng thái: tâm ảnh (cx, cy) trên sân khấu + tỉ lệ s (px màn hình / px ảnh) ---------- */
    let V = 320;         // cạnh sân khấu (px CSS)
    let C = V * CROP_RATIO;
    let x0 = (V - C) / 2;
    let minS = 1;
    let s = 1;
    let cx = V / 2;
    let cy = V / 2;
    let raf = 0;

    const zFromS = (sc) => Math.log(sc / minS) / Math.log(ZOOM_MAX);
    function clampAll() {
      s = K.clamp(s, minS, minS * ZOOM_MAX);
      const hw = (iw * s) / 2;
      const hh = (ih * s) / 2;
      cx = K.clamp(cx, x0 + C - hw, x0 + hw);
      cy = K.clamp(cy, x0 + C - hh, x0 + hh);
    }
    function draw() {
      raf = 0;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const px = Math.round(V * dpr);
      if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
      const ctx = canvas.getContext("2d");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, px, px);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(img.source, cx - (iw * s) / 2, cy - (ih * s) / 2, iw * s, ih * s);
      zoom.value = String(Math.round(zFromS(s) * 1000));
      zoom.setAttribute("aria-valuetext", `${Math.round((s / minS) * 100)}%`);
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };

    function layout(keepRelative) {
      const old = { V, s, cx, cy, minS };
      V = Math.max(160, Math.round(stage.clientWidth || 320));
      C = V * CROP_RATIO;
      x0 = (V - C) / 2;
      minS = C / Math.min(iw, ih);
      canvas.style.width = `${V}px`;
      canvas.style.height = `${V}px`;
      if (keepRelative && old.V) {
        const k = V / old.V;
        s = (old.s / old.minS) * minS;
        cx = old.cx * k;
        cy = old.cy * k;
      } else {
        s = minS;
        cx = V / 2;
        cy = V / 2;
      }
      clampAll();
      schedule();
    }
    // phóng quanh 1 điểm (px, py) trên sân khấu: điểm ảnh dưới con trỏ đứng yên
    function zoomAt(next, px, py) {
      const ns = K.clamp(next, minS, minS * ZOOM_MAX);
      cx = px - ((px - cx) * ns) / s;
      cy = py - ((py - cy) * ns) / s;
      s = ns;
      clampAll();
      schedule();
    }
    const local = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * V, y: ((e.clientY - r.top) / r.height) * V };
    };

    /* ---------- kéo / chụm bằng Pointer Events ---------- */
    const pointers = new Map();
    let pinch = null;
    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      canvas.focus({ preventScroll: true });
      try { canvas.setPointerCapture(e.pointerId); } catch { /* bỏ qua */ }
      pointers.set(e.pointerId, local(e));
      stage.classList.add("is-grabbing");
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      }
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size >= 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        cx += mx - pinch.mx;
        cy += my - pinch.my;
        pinch.mx = mx;
        pinch.my = my;
        zoomAt(pinch.s * (d / pinch.d), mx, my);
      } else if (pointers.size === 1) {
        cx += p.x - prev.x;
        cy += p.y - prev.y;
        clampAll();
        schedule();
      }
    });
    const release = (e) => {
      if (!pointers.delete(e.pointerId)) return;
      if (pointers.size < 2) pinch = null;
      if (!pointers.size) stage.classList.remove("is-grabbing");
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("lostpointercapture", release);
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? V : 1;
      const p = local(e);
      zoomAt(s * Math.exp(-e.deltaY * unit * 0.0015), p.x, p.y);
    }, { passive: false });
    canvas.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 40 : 10;
      const keys = {
        ArrowLeft: () => { cx -= step; }, ArrowRight: () => { cx += step; },
        ArrowUp: () => { cy -= step; }, ArrowDown: () => { cy += step; },
        "+": () => zoomAt(s * 1.12, V / 2, V / 2), "=": () => zoomAt(s * 1.12, V / 2, V / 2),
        "-": () => zoomAt(s / 1.12, V / 2, V / 2), "0": () => layout(false),
      };
      const fn = keys[e.key];
      if (!fn) return;
      e.preventDefault();
      fn();
      clampAll();
      schedule();
    });
    zoom.addEventListener("input", () => zoomAt(minS * Math.pow(ZOOM_MAX, Number(zoom.value) / 1000), V / 2, V / 2));
    zoomIn.addEventListener("click", () => zoomAt(s * 1.2, V / 2, V / 2));
    zoomOut.addEventListener("click", () => zoomAt(s / 1.2, V / 2, V / 2));
    reset.addEventListener("click", () => layout(false));

    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => layout(true)) : null;

    const choice = await K.dialog.open({
      title,
      body,
      className: "crop-box",
      dismiss: false,
      initial: ".crop-canvas",
      onOpen() {
        layout(false);
        if (ro) ro.observe(stage);
      },
      buttons: [
        { label: "Huỷ", value: false, kind: "ghost" },
        { label: "Cắt & dùng ảnh", value: true, kind: "primary", icon: "check" },
      ],
    });
    if (ro) ro.disconnect();
    if (raf) cancelAnimationFrame(raf);
    try {
      if (!choice) return null;
      // vùng cắt tính theo pixel ảnh gốc
      const sx = (x0 - (cx - (iw * s) / 2)) / s;
      const sy = (x0 - (cy - (ih * s) / 2)) / s;
      const side = C / s;
      const out = K.images.drawScaled(img.source, sx, sy, side, side, size, size);
      return await K.images.encode(out, 0.9);
    } finally {
      img.close();
    }
  }

  return Object.freeze({ open });
})();
