/* ============================================================
 *  admin.js — trang /admin: đăng nhập, xem / đánh dấu / xoá thư
 * ============================================================ */
(() => {
  "use strict";

  const API = "/api/admin";
  const SPRITE = "assets/icons/sprite.svg";
  const iconSvg = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><use href="${SPRITE}#tabler-${name}"></use></svg>`;
  const $ = (sel, root = document) => root.querySelector(sel);
  const TOKEN_KEY = "admin-token";

  let token = (() => { try { return sessionStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } })();
  let letters = [];
  let filter = "all";

  /* ---------- toast ---------- */
  let toastTimer;
  function toast(message, type = "") {
    const el = $("#toast");
    el.textContent = message;
    el.className = `toast show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3000);
  }

  /* ---------- gọi API ---------- */
  async function api(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(API + path, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== "/login") {
      setToken("");
      showLogin();
      throw new Error(data.error || "Phiên đăng nhập đã hết hạn, hãy đăng nhập lại");
    }
    if (!res.ok) {
      if ([404, 405, 501].includes(res.status) && !data.error) {
        throw new Error("Trang đang mở không qua server.js (VD Live Server) nên không đăng nhập được. Hãy chạy `node server.js` rồi mở http://localhost:3000/admin");
      }
      throw new Error(data.error || `Lỗi ${res.status}`);
    }
    return data;
  }
  function setToken(t) {
    token = t;
    try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* bỏ qua */ }
  }

  /* ---------- chuyển màn hình ---------- */
  function showLogin() {
    $("#inboxView").hidden = true;
    $("#loginView").hidden = false;
    setTimeout(() => $("#password").focus(), 50);
  }
  function showInbox() {
    $("#loginView").hidden = true;
    $("#inboxView").hidden = false;
  }

  /* ---------- hiển thị thư ---------- */
  const fmtDate = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
  };

  function render() {
    const list = $("#letters");
    list.innerHTML = "";
    const unread = letters.filter((l) => !l.read).length;
    $("#countAll").textContent = letters.length;
    $("#countUnread").textContent = unread;
    $("#stats").textContent = letters.length
      ? `${letters.length} thư, ${unread} chưa đọc`
      : "Chưa có thư nào";

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
    const card = document.createElement("article");
    card.className = `letter-card${letter.read ? "" : " unread"}`;

    const head = document.createElement("div");
    head.className = "letter-head";

    const sender = document.createElement("div");
    sender.className = `sender${letter.anonymous ? " anon" : ""}`;
    const initial = document.createElement("span");
    initial.className = "initial";
    const displayName = letter.anonymous ? "Ẩn danh" : letter.name || "Không tên";
    initial.innerHTML = letter.anonymous ? iconSvg("spy") : "";
    if (!letter.anonymous) initial.textContent = Array.from(displayName.trim())[0]?.toUpperCase() || "?";
    const who = document.createElement("span");
    const whoName = document.createElement("span");
    whoName.className = "who";
    whoName.textContent = displayName;
    const time = document.createElement("span");
    time.className = "time";
    time.textContent = fmtDate(letter.createdAt);
    who.append(whoName, time);
    sender.append(initial, who);

    head.appendChild(sender);
    if (!letter.read) {
      const pill = document.createElement("span");
      pill.className = "pill";
      pill.textContent = "Mới";
      head.appendChild(pill);
    }

    const message = document.createElement("p");
    message.className = "message";
    message.textContent = letter.message; // textContent → không bao giờ chạy HTML/script trong thư

    const actions = document.createElement("div");
    actions.className = "letter-actions";
    const readBtn = document.createElement("button");
    readBtn.className = "btn btn-ghost btn-sm";
    readBtn.type = "button";
    readBtn.innerHTML = letter.read
      ? `${iconSvg("mail")} Đánh dấu chưa đọc`
      : `${iconSvg("mail-opened")} Đã đọc`;
    readBtn.addEventListener("click", () => markRead(letter, !letter.read, readBtn));
    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-danger btn-sm";
    delBtn.type = "button";
    delBtn.innerHTML = `${iconSvg("trash")} Xoá`;
    delBtn.addEventListener("click", () => remove(letter, delBtn));
    actions.append(readBtn, delBtn);

    card.append(head, message, actions);
    return card;
  }

  /* ---------- hành động ---------- */
  async function loadLetters(silent = false) {
    try {
      const data = await api("/letters");
      letters = data.letters || [];
      render();
      showInbox();
      if (!silent) toast("Đã cập nhật hộp thư");
    } catch (err) {
      if (token) toast(err.message, "error");
    }
  }

  async function markRead(letter, read, btn) {
    btn.disabled = true;
    try {
      await api(`/letters/${encodeURIComponent(letter.id)}`, { method: "PATCH", body: JSON.stringify({ read }) });
      letter.read = read;
      render();
    } catch (err) {
      toast(err.message, "error");
      btn.disabled = false;
    }
  }

  async function remove(letter, btn) {
    const who = letter.anonymous ? "người ẩn danh" : letter.name;
    if (!confirm(`Xoá thư của ${who}? Không thể hoàn tác.`)) return;
    btn.disabled = true;
    try {
      await api(`/letters/${encodeURIComponent(letter.id)}`, { method: "DELETE" });
      letters = letters.filter((l) => l.id !== letter.id);
      render();
      toast("Đã xoá thư");
    } catch (err) {
      toast(err.message, "error");
      btn.disabled = false;
    }
  }

  /* ---------- khởi động ---------- */
  function init() {
    window.SiteTheme.bindToggle($("#themeToggle"));
    $("#loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const pw = $("#password").value;
      const errEl = $("#loginError");
      const btn = $("#loginBtn");
      errEl.textContent = "";
      if (!pw) { errEl.textContent = "Bạn chưa nhập mật khẩu"; return; }
      btn.disabled = true;
      try {
        const data = await api("/login", { method: "POST", body: JSON.stringify({ password: pw }) });
        setToken(data.token);
        $("#password").value = "";
        await loadLetters(true);
        toast("Đăng nhập thành công 👋", "success");
      } catch (err) {
        errEl.textContent = err.message;
      } finally {
        btn.disabled = false;
      }
    });

    $("#refreshBtn").addEventListener("click", () => loadLetters());
    $("#logoutBtn").addEventListener("click", async () => {
      try { await api("/logout", { method: "POST" }); } catch { /* token đã hết hạn cũng được */ }
      setToken("");
      letters = [];
      showLogin();
      toast("Đã đăng xuất");
    });

    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        filter = tab.dataset.filter;
        render();
      });
    });

    if (token) loadLetters(true).catch(showLogin);
    else showLogin();
  }

  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
