/* ============================================================
 *  admin-media.js — mục "Kho tệp" (#kho): ảnh / nhạc đã tải lên.
 *  Ảnh thu nhỏ, tên, dung lượng, ngày, nhãn "Đang dùng", sao chép đường dẫn, nghe thử, xoá
 *  (đang dùng → hỏi lại rồi mới "xoá luôn" với cảnh báo rõ ràng).
 * ============================================================ */
(() => {
  "use strict";

  const K = window.AdminKit;
  const { $, h, icon } = K;
  const ID = "kho";

  let el = {};
  let media = [];
  let totalBytes = 0;
  let filter = "all";
  let loading = false;
  let loadedOnce = false;

  // Tệp có mặt trong bản nháp chưa lưu của các mục khác?
  function inDraft(m) {
    for (const [id, t] of K.tabs) {
      if (id === ID || !t.draft || !(t.isDirty && t.isDirty())) continue;
      if (t.draft().includes(m.url)) return true;
    }
    return false;
  }

  function counts() {
    return {
      all: media.length,
      image: media.filter((m) => m.kind === "image").length,
      audio: media.filter((m) => m.kind === "audio").length,
      unused: media.filter((m) => !m.inUse).length,
    };
  }

  function render() {
    const c = counts();
    el.cAll.textContent = c.all;
    el.cImage.textContent = c.image;
    el.cAudio.textContent = c.audio;
    el.cUnused.textContent = c.unused;
    el.stats.textContent = media.length
      ? `${media.length} tệp · tổng ${K.fmtBytes(totalBytes)} · ${c.unused} tệp chưa dùng`
      : "Ảnh và nhạc bạn tải lên sẽ nằm ở đây.";
    const list = media.filter((m) => (filter === "all" ? true : filter === "unused" ? !m.inUse : m.kind === filter));
    el.grid.replaceChildren(...list.map(card));
    el.empty.hidden = list.length > 0;
    el.empty.textContent = media.length ? "Không có tệp nào trong mục này." : "Chưa có tệp nào được tải lên.";
  }

  function card(m) {
    const isImg = m.kind === "image";
    const thumb = isImg
      ? h("img", { src: m.url, alt: "", loading: "lazy", decoding: "async" })
      : h("span", { class: "media-audio", "aria-hidden": "true" }, icon("music"), h("span", { class: "media-ext", text: String(m.ext || "").toUpperCase() }));
    if (isImg) thumb.addEventListener("error", () => { thumb.replaceWith(h("span", { class: "media-audio", "aria-hidden": "true" }, icon("alert"))); });
    const draft = !m.inUse && inDraft(m);
    const badges = h("div", { class: "media-badges" },
      m.inUse ? h("span", { class: "pill", text: "Đang dùng" }) : null,
      draft ? h("span", { class: "pill pill-soft", text: "Trong bản nháp" }) : null);
    const copy = h("button", { class: "icon-btn small", type: "button", title: "Sao chép đường dẫn", "aria-label": `Sao chép đường dẫn của ${m.name}` }, icon("copy"));
    copy.addEventListener("click", () => copyUrl(m.url));
    const del = h("button", { class: "icon-btn small danger", type: "button", title: "Xoá tệp", "aria-label": `Xoá ${m.name}` }, icon("trash"));
    del.addEventListener("click", () => remove(m, del));
    const actions = h("div", { class: "media-actions" }, copy);
    if (!isImg) {
      const play = h("button", { class: "icon-btn small", type: "button" });
      K.preview.bindButton(play, `Nghe thử ${m.name}`);
      play.addEventListener("click", () => K.preview.toggle(m.url, play));
      actions.prepend(play);
    } else {
      const view = h("a", { class: "icon-btn small", href: m.url, target: "_blank", rel: "noopener", title: "Mở ảnh gốc", "aria-label": `Mở ảnh gốc ${m.name}` }, icon("eye"));
      actions.prepend(view);
    }
    actions.append(del);
    return h("article", { class: `media-card${m.inUse ? " in-use" : ""}`, "data-id": m.id },
      h("div", { class: "media-thumb" }, thumb, badges),
      h("div", { class: "media-info" },
        h("p", { class: "media-name", title: m.name, text: m.name }),
        h("p", { class: "media-meta", text: `${isImg ? "Ảnh" : "Nhạc"} · ${K.fmtBytes(m.size)} · ${K.fmtDate(m.createdAt)}` })),
      actions);
  }

  async function copyUrl(url) {
    try {
      await navigator.clipboard.writeText(url);
      K.toast("Đã sao chép đường dẫn — dán vào ô link ảnh / nhạc", "success");
    } catch {
      // không có quyền clipboard (http trong mạng LAN…) → chọn sẵn để tự Ctrl+C
      const input = h("input", { class: "field", type: "text", value: url, readonly: true });
      K.dialog.open({
        title: "Đường dẫn tệp",
        body: h("div", {}, h("p", { class: "muted", text: "Trình duyệt chặn sao chép tự động. Hãy chép đường dẫn dưới đây:" }), input),
        dismiss: null,
        onOpen() { input.focus(); input.select(); },
        buttons: [{ label: "Xong", value: null, kind: "primary" }],
      });
    }
  }

  async function remove(m, btn) {
    const draft = !m.inUse && inDraft(m);
    const ok = await K.dialog.confirm({
      title: "Xoá tệp?",
      message: `Xoá “${m.name}” (${K.fmtBytes(m.size)}) khỏi kho. Không thể hoàn tác.${draft ? " Tệp này đang nằm trong bản nháp chưa lưu của bạn — nếu xoá, chỗ đó sẽ bị trống." : ""}`,
      ok: "Xoá tệp", danger: true,
    });
    if (!ok) return;
    btn.disabled = true;
    try {
      await K.api(`/api/admin/media/${encodeURIComponent(m.id)}`, { method: "DELETE" });
      done(m);
    } catch (err) {
      if (err.status === 409) {
        const force = await K.dialog.confirm({
          title: "Tệp đang được dùng trên trang",
          message: `“${m.name}” đang hiện trên trang profile (ảnh đại diện, ảnh bìa, bài hát hoặc ảnh trong trang sách). Nếu vẫn xoá, chỗ đó sẽ thành ảnh hỏng / bài không phát được cho tới khi bạn sửa lại nội dung. Nên gỡ tệp khỏi trang trước rồi mới xoá.`,
          ok: "Vẫn xoá luôn", cancel: "Thôi, giữ lại", danger: true,
        });
        if (force) {
          try {
            await K.api(`/api/admin/media/${encodeURIComponent(m.id)}?force=1`, { method: "DELETE" });
            done(m);
          } catch (err2) {
            if (err2.status !== 401) K.toast(err2.message, "error");
          }
        }
      } else if (err.status === 404) {
        K.toast("Tệp này đã bị xoá trước đó", "error");
        load();
      } else if (err.status !== 401) {
        K.toast(err.message, "error");
      }
    } finally {
      if (btn.isConnected) btn.disabled = false;
    }
  }
  function done(m) {
    if (K.preview.isPlaying(m.url)) K.preview.stop();
    media = media.filter((x) => x.id !== m.id);
    totalBytes = Math.max(0, totalBytes - (m.size || 0));
    render();
    K.toast("Đã xoá tệp", "success");
  }

  async function load() {
    if (loading) return;
    loading = true;
    el.refresh.disabled = true;
    el.grid.setAttribute("aria-busy", "true");
    if (!loadedOnce) el.stats.textContent = "Đang tải danh sách tệp…";
    try {
      const data = await K.api("/api/admin/media");
      media = Array.isArray(data.media) ? data.media : [];
      totalBytes = Number(data.totalBytes) || 0;
      loadedOnce = true;
      render();
    } catch (err) {
      if (err.status !== 401) {
        el.stats.textContent = "Không tải được danh sách tệp.";
        K.toast(err.message, "error");
      }
    } finally {
      loading = false;
      el.refresh.disabled = false;
      el.grid.removeAttribute("aria-busy");
    }
  }

  function init() {
    el = {
      grid: $("#mediaGrid"), empty: $("#mediaEmpty"), stats: $("#mediaStats"), refresh: $("#mediaRefresh"),
      cAll: $("#mcAll"), cImage: $("#mcImage"), cAudio: $("#mcAudio"), cUnused: $("#mcUnused"),
    };
    el.refresh.addEventListener("click", load);
    for (const b of document.querySelectorAll("#mediaFilters .tab")) {
      b.addEventListener("click", () => {
        filter = b.dataset.filter;
        for (const x of document.querySelectorAll("#mediaFilters .tab")) {
          x.classList.toggle("active", x === b);
          x.setAttribute("aria-pressed", String(x === b));
        }
        render();
      });
    }
    // vừa lưu nội dung → nhãn "Đang dùng" có thể đã đổi (mở lại mục này cũng tự tải lại)
    K.on("saved", () => { if (K.activeTab === ID) load(); });
  }

  K.registerTab(ID, {
    title: "Kho tệp",
    init,
    load() { /* nạp khi mở mục */ },
    onShow: load,
    onHide: () => K.preview.stop(),
  });
})();
