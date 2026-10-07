/* ============================================================
 *  admin.js — trang /admin: đăng nhập, hộp thư (xem / đánh dấu / xoá thư),
 *  chuyển mục bằng #hash (#thu, #ho-so, #am-nhac, #trang-sach, #kho),
 *  cảnh báo khi còn thay đổi chưa lưu. Các mục khác nằm ở js/admin-*.js.
 * ============================================================ */
(() => {
  "use strict";

  const K = window.AdminKit;
  const { $, $$, h, icon } = K;
  const TABS = ["thu", "ho-so", "am-nhac", "trang-sach", "kho"];
  const TAB_TITLES = { thu: "Hộp thư", "ho-so": "Hồ sơ", "am-nhac": "Âm nhạc", "trang-sach": "Trang sách", kho: "Kho tệp" };

  let letters = [];
  let filter = "all";
  let booted = false;       // các mục đã dựng giao diện chưa
  let reloadAll = false;    // sau khi đăng xuất: lần đăng nhập sau nạp lại mọi mục
  let expiryTimer = 0;

  /* ============================================================
   *  HỘP THƯ (giữ nguyên tính năng cũ)
   * ============================================================ */
  function renderLetters() {
    const list = $("#letters");
    list.replaceChildren();
    const unread = letters.filter((l) => !l.read).length;
    $("#countAll").textContent = letters.length;
    $("#countUnread").textContent = unread;
    $("#stats").textContent = letters.length ? `${letters.length} thư, ${unread} chưa đọc` : "Chưa có thư nào";
    const badge = $("#navUnread");
    badge.hidden = !unread;
    badge.textContent = unread > 99 ? "99+" : String(unread);
    badge.setAttribute("aria-label", `${unread} thư chưa đọc`);

    const visible = letters.filter((l) => {
      if (filter === "unread") return !l.read;
      if (filter === "anonymous") return l.anonymous;
      if (filter === "named") return !l.anonymous;
      return true;
    });
    $("#empty").hidden = visible.length > 0;
    $("#empty").textContent = letters.length ? "Không có thư nào trong mục này" : "Chưa có thư nào 📭";
    for (const letter of visible) list.appendChild(renderCard(letter));
  }

  function renderCard(letter) {
    const displayName = letter.anonymous ? "Ẩn danh" : letter.name || "Không tên";
    const initial = h("span", { class: "initial" });
    if (letter.anonymous) initial.appendChild(icon("spy"));
    else initial.textContent = Array.from(displayName.trim())[0]?.toUpperCase() || "?";
    const sender = h("div", { class: `sender${letter.anonymous ? " anon" : ""}` },
      initial,
      h("span", {}, h("span", { class: "who", text: displayName }), h("span", { class: "time", text: K.fmtDate(letter.createdAt) })));
    const head = h("div", { class: "letter-head" }, sender, letter.read ? null : h("span", { class: "pill", text: "Mới" }));
    const message = h("p", { class: "message", text: letter.message }); // textContent → không bao giờ chạy HTML/script trong thư

    const readBtn = h("button", { class: "btn btn-ghost btn-sm", type: "button" },
      icon(letter.read ? "mail" : "mail-opened"), letter.read ? "Đánh dấu chưa đọc" : "Đã đọc");
    readBtn.addEventListener("click", () => markRead(letter, !letter.read, readBtn));
    const delBtn = h("button", { class: "btn btn-danger btn-sm", type: "button" }, icon("trash"), "Xoá");
    delBtn.addEventListener("click", () => removeLetter(letter, delBtn));

    return h("article", { class: `letter-card${letter.read ? "" : " unread"}` }, head, message, h("div", { class: "letter-actions" }, readBtn, delBtn));
  }

  async function loadLetters(silent = false) {
    try {
      const data = await K.api("/api/admin/letters");
      letters = data.letters || [];
      renderLetters();
      if (!silent) K.toast("Đã cập nhật hộp thư");
    } catch (err) {
      if (err.status !== 401) K.toast(err.message, "error");
    }
  }

  async function markRead(letter, read, btn) {
    btn.disabled = true;
    try {
      await K.api(`/api/admin/letters/${encodeURIComponent(letter.id)}`, { method: "PATCH", json: { read } });
      letter.read = read;
      renderLetters();
    } catch (err) {
      if (err.status !== 401) K.toast(err.message, "error");
      btn.disabled = false;
    }
  }

  async function removeLetter(letter, btn) {
    const who = letter.anonymous ? "người ẩn danh" : letter.name;
    const ok = await K.dialog.confirm({ title: "Xoá thư?", message: `Xoá thư của ${who}? Không thể hoàn tác.`, ok: "Xoá thư", danger: true });
    if (!ok) return;
    btn.disabled = true;
    try {
      await K.api(`/api/admin/letters/${encodeURIComponent(letter.id)}`, { method: "DELETE" });
      letters = letters.filter((l) => l.id !== letter.id);
      renderLetters();
      K.toast("Đã xoá thư");
    } catch (err) {
      if (err.status !== 401) K.toast(err.message, "error");
      btn.disabled = false;
    }
  }

  /* ============================================================
   *  MÀN HÌNH: đăng nhập ↔ bàn làm việc
   * ============================================================ */
  function showLogin(notice) {
    $("#dashView").hidden = true;
    $("#loginView").hidden = false;
    document.body.classList.remove("is-dash");
    const n = $("#loginNotice");
    n.hidden = !notice;
    n.textContent = notice || "";
    clearTimeout(expiryTimer);
    setTimeout(() => $("#password").focus(), 50);
  }
  function showDash() {
    $("#loginView").hidden = true;
    $("#dashView").hidden = false;
    document.body.classList.add("is-dash");
  }

  function showSession(me) {
    const info = $("#sessionInfo");
    const remembered = (() => { try { return !!localStorage.getItem("admin-token"); } catch { return false; } })();
    const exp = me && me.expiresAt ? new Date(me.expiresAt) : null;
    if (!exp || isNaN(exp)) { info.textContent = remembered ? "Đã đăng nhập · ghi nhớ trên máy này" : "Đã đăng nhập"; return; }
    const time = exp.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    const sameDay = exp.toDateString() === new Date().toDateString();
    const when = sameDay ? time : `${time} ngày ${exp.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}`;
    info.textContent = `Phiên đăng nhập đến ${when}${remembered ? " · ghi nhớ trên máy này" : ""}`;
    clearTimeout(expiryTimer);
    const warnIn = exp.getTime() - Date.now() - 5 * 60 * 1000;
    if (warnIn > 0 && warnIn < 2 ** 31 - 1) {
      expiryTimer = setTimeout(() => K.toast("Phiên đăng nhập sắp hết hạn (còn 5 phút) — nhớ lưu thay đổi nhé", "error"), warnIn);
    }
  }

  /* ============================================================
   *  CHUYỂN MỤC theo #hash
   * ============================================================ */
  const tabFromHash = () => {
    const id = decodeURIComponent(location.hash.replace(/^#/, ""));
    return TABS.includes(id) ? id : "thu";
  };
  function route(force) {
    const id = tabFromHash();
    if (!force && id === K.activeTab) return;
    const prev = K.tabs.get(K.activeTab);
    if (prev && prev.onHide && K.activeTab !== id) prev.onHide();
    K.setActiveTab(id);
    for (const a of $$(".dash-tab")) {
      const on = a.dataset.tab === id;
      a.classList.toggle("active", on);
      a.setAttribute("aria-selected", String(on));
      a.tabIndex = on ? 0 : -1;
    }
    for (const t of TABS) $(`#tab-${t}`).hidden = t !== id;
    document.title = `${TAB_TITLES[id]} · Trang quản trị`;
    const tab = K.tabs.get(id);
    if (tab && tab.onShow) tab.onShow();
    const active = $(`.dash-tab[data-tab="${id}"]`);
    if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function updateDirtyMarks() {
    for (const a of $$(".dash-tab")) {
      const t = K.tabs.get(a.dataset.tab);
      const dirty = !!(t && ((t.isDirty && t.isDirty()) || (t.busy && t.busy())));
      a.classList.toggle("is-dirty", dirty);
      let sr = $(".dirty-sr", a);
      if (!sr) { sr = h("span", { class: "sr-only dirty-sr", text: " (có thay đổi chưa lưu)" }); a.appendChild(sr); }
      sr.hidden = !dirty;
    }
  }

  /* ============================================================
   *  VÀO BÀN LÀM VIỆC
   * ============================================================ */
  async function enterDashboard(me) {
    K.setLimits(me);
    showDash();
    showSession(me);
    if (!booted) {
      booted = true;
      for (const [id, t] of K.tabs) {
        try { if (t.init) t.init(); } catch (err) { console.error(`Mục ${id} lỗi khi khởi tạo`, err); }
      }
    }
    route(true);
    loadLetters(true);
    await loadContentIntoTabs();
  }

  async function loadContentIntoTabs() {
    const errBoxes = $$("[data-load-error]");
    try {
      const content = await K.loadContent();
      for (const box of errBoxes) box.hidden = true;
      for (const [id, t] of K.tabs) {
        if (!t.load) continue;
        try { t.load(content, { force: reloadAll }); } catch (err) { console.error(`Mục ${id} lỗi khi nạp dữ liệu`, err); }
      }
      reloadAll = false;
      for (const t of TABS) $(`#tab-${t}`).classList.remove("is-unloaded");
    } catch (err) {
      if (err.status === 401) return;
      for (const box of errBoxes) {
        box.hidden = false;
        box.replaceChildren(icon("alert"), h("span", { text: ` Không tải được nội dung đã lưu: ${err.message} ` }),
          h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: loadContentIntoTabs }, icon("refresh"), "Thử lại"));
        box.closest(".tab-panel").classList.add("is-unloaded");
      }
    }
  }

  async function boot() {
    if (!K.auth.token) { showLogin(); return; }
    try {
      const me = await K.api("/api/admin/me");
      await enterDashboard(me);
    } catch (err) {
      if (err.status !== 401) showLogin(err.message);
    }
  }

  /* ============================================================
   *  KHỞI ĐỘNG
   * ============================================================ */
  function init() {
    window.SiteTheme.bindToggle($("#themeToggle"));

    // phiên hết hạn ở bất cứ đâu → về màn hình đăng nhập (thay đổi chưa lưu vẫn được giữ trong trang)
    K.on("unauthorized", (message) => {
      const dirty = K.anyDirty();
      showLogin(dirty ? `${message}. Thay đổi chưa lưu vẫn còn — đăng nhập lại rồi bấm Lưu.` : message);
    });
    K.on("dirty", updateDirtyMarks);

    $("#loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const pw = $("#password").value;
      const errEl = $("#loginError");
      const btn = $("#loginBtn");
      errEl.textContent = "";
      if (!pw) { errEl.textContent = "Bạn chưa nhập mật khẩu"; return; }
      btn.disabled = true;
      try {
        const data = await K.api("/api/admin/login", { method: "POST", json: { password: pw } });
        K.auth.set(data.token, $("#remember").checked);
        $("#password").value = "";
        $("#loginNotice").hidden = true;
        const me = await K.api("/api/admin/me").catch(() => null);
        await enterDashboard(me);
        K.toast("Đăng nhập thành công 👋", "success");
      } catch (err) {
        errEl.textContent = err.message;
      } finally {
        btn.disabled = false;
      }
    });

    $("#refreshBtn").addEventListener("click", () => loadLetters());
    $("#logoutBtn").addEventListener("click", async () => {
      if (K.anyDirty()) {
        const ok = await K.dialog.confirm({
          title: "Còn thay đổi chưa lưu",
          message: "Một số mục còn chỉnh sửa chưa lưu (hoặc đang tải tệp lên). Đăng xuất bây giờ sẽ bỏ các thay đổi đó.",
          ok: "Vẫn đăng xuất", cancel: "Ở lại", danger: true,
        });
        if (!ok) return;
      }
      try { await K.api("/api/admin/logout", { method: "POST" }); } catch { /* token đã hết hạn cũng được */ }
      K.auth.clear();
      K.preview.stop();
      letters = [];
      renderLetters();
      reloadAll = true;
      showLogin();
      K.toast("Đã đăng xuất");
    });

    for (const tab of $$("#letterFilters .tab")) {
      tab.addEventListener("click", () => {
        for (const t of $$("#letterFilters .tab")) {
          t.classList.toggle("active", t === tab);
          t.setAttribute("aria-pressed", String(t === tab));
        }
        filter = tab.dataset.filter;
        renderLetters();
      });
    }

    // thanh mục: ← → / Home / End giữa các mục (chuẩn tablist)
    $("#dashTabs").addEventListener("keydown", (e) => {
      const tabs = $$(".dash-tab");
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      let j = -1;
      if (e.key === "ArrowRight") j = (i + 1) % tabs.length;
      else if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = tabs.length - 1;
      else if (e.key === " ") { e.preventDefault(); tabs[i].click(); return; }
      if (j < 0) return;
      e.preventDefault();
      tabs[j].focus();
      location.hash = tabs[j].dataset.tab;
    });
    window.addEventListener("hashchange", () => { if (!$("#dashView").hidden) route(); });

    // Ctrl + S = lưu mục đang mở
    document.addEventListener("keydown", (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== "s") return;
      if ($("#dashView").hidden) return;
      e.preventDefault();
      const btn = $(`[data-savebar="${K.activeTab}"] [data-act="save"]`);
      if (btn && !btn.disabled) btn.click();
      else if (btn) K.toast("Không có thay đổi nào để lưu");
    });

    // rời trang khi còn thay đổi chưa lưu → trình duyệt hỏi lại
    window.addEventListener("beforeunload", (e) => {
      if (!K.anyDirty()) return;
      e.preventDefault();
      e.returnValue = "";
    });

    boot();
  }

  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
