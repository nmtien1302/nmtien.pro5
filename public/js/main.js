/* ============================================================
 *  main.js — toàn bộ logic của trang profile
 *  (Thông tin cá nhân, nhạc, lời chúc... chỉnh ở js/config.js,
 *   bình thường bạn KHÔNG cần sửa file này.)
 * ============================================================ */
(() => {
  "use strict";

  const cfg = window.SITE_CONFIG || {};
  const $ = (sel, root = document) => root.querySelector(sel);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- tiện ích ---------- */
  const pick = (arr) => (Array.isArray(arr) && arr.length ? arr[Math.floor(Math.random() * arr.length)] : "");
  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
  const toRoman = (n) => {
    const map = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
    let out = "";
    for (const [v, r] of map) while (n >= v) { out += r; n -= v; }
    return out || "I";
  };
  const fmtTime = (s) => {
    if (!isFinite(s) || s < 0) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? "0" : ""}${sec}`;
  };
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* bỏ qua */ } },
  };

  /* ---------- toast ---------- */
  let toastTimer;
  function toast(message, type = "") {
    const el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.className = `toast show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
  }

  /* ============================================================
   *  1. ẢNH NỀN (màu sắc + sáng/tối do js/theme.js lo)
   * ============================================================ */
  const SPRITE = "assets/icons/sprite.svg";
  const iconSvg = (name, cls = "") =>
    `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="${SPRITE}#tabler-${name}"></use></svg>`;

  function initBackground() {
    const bg = cfg.background || {};
    if (bg.image) {
      document.body.classList.add("has-bg");
      document.documentElement.style.setProperty("--bg-image", `url("${bg.image}")`);
    }
  }

  /* ============================================================
   *  2. THÔNG TIN PROFILE
   * ============================================================ */
  function typeText(el, text, speed = 32) {
    const chars = Array.from(text);
    let i = 0;
    el.textContent = "";
    el.classList.add("typing");
    (function step() {
      if (i < chars.length) {
        el.textContent += chars[i++];
        setTimeout(step, speed);
      } else {
        setTimeout(() => el.classList.remove("typing"), 1600);
      }
    })();
  }

  function renderProfile() {
    document.title = cfg.pageTitle || cfg.name || "Profile";
    const avatar = $("#avatar");
    avatar.src = cfg.avatar || "assets/avatar.png";
    avatar.alt = cfg.name || "Avatar";
    avatar.onerror = () => { avatar.onerror = null; avatar.src = "assets/avatar.png"; };

    $("#name").textContent = cfg.name || "";
    $("#verified").hidden = !cfg.verified;
    $("#footerText").textContent = cfg.username || "";

    const ribbon = $("#ribbon");
    const ribbonText = cfg.ribbon ?? cfg.sticker;
    if (ribbonText) ribbon.textContent = ribbonText;
    else ribbon.remove();

    const bio = $("#bio");
    if (!cfg.bio) bio.remove();
    else if (!cfg.bioTypingEffect || reduceMotion) bio.textContent = cfg.bio;

    const socials = $("#socials");
    (cfg.socials || []).forEach((s) => {
      if (!s || !s.url) return;
      const a = document.createElement("a");
      a.href = s.url;
      a.title = s.name || "";
      a.setAttribute("aria-label", s.name || "Liên kết");
      if (!s.url.startsWith("mailto:") && !s.url.startsWith("tel:")) {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }
      a.innerHTML = iconSvg(s.icon || "link");
      socials.appendChild(a);
    });
  }

  function showCard() {
    const card = $("#profileCard");
    card.classList.add("visible");
    const bio = $("#bio");
    if (bio && cfg.bio && cfg.bioTypingEffect && !reduceMotion && !bio.textContent) {
      setTimeout(() => typeText(bio, cfg.bio), 350);
    }
  }

  /* ============================================================
   *  3. POPUP CHÀO MỪNG
   * ============================================================ */
  function timeGreeting(g = {}) {
    const h = new Date().getHours();
    if (h >= 5 && h < 11) return g.morning || "Chào buổi sáng";
    if (h >= 11 && h < 14) return g.noon || "Chào buổi trưa";
    if (h >= 14 && h < 18) return g.afternoon || "Chào buổi chiều";
    if (h >= 18 && h < 23) return g.evening || "Chào buổi tối";
    return g.night || "Khuya rồi, nhớ nghỉ ngơi sớm nhé";
  }

  function initWelcome(onDone) {
    const w = cfg.welcome || {};
    const overlay = $("#welcome");
    if (!overlay) { onDone(false); return; }

    const seen = (() => { try { return sessionStorage.getItem("welcomed") === "1"; } catch { return false; } })();
    if (w.showEveryVisit === false && seen) {
      overlay.remove();
      onDone(false);
      return;
    }

    const gif = $("#welcomeGif");
    if (w.gif) {
      gif.src = w.gif;
      gif.onerror = () => {
        const fb = document.createElement("div");
        fb.className = "welcome-fallback";
        fb.textContent = "🐱";
        gif.replaceWith(fb);
      };
    } else {
      $(".welcome-gif-wrap").remove();
    }
    $("#welcomeTitle").textContent = w.title || "Chào mừng bạn!";
    $("#welcomeGreeting").textContent = timeGreeting(w.greetings);
    $("#welcomeWish").textContent = pick(w.wishes) || "Chúc bạn một ngày tốt lành!";
    const ok = $("#welcomeOk");
    ok.textContent = w.button || "OK";
    $("#welcomeHint").textContent = w.hint || "";

    const close = () => {
      try { sessionStorage.setItem("welcomed", "1"); } catch { /* bỏ qua */ }
      overlay.classList.remove("show");
      setTimeout(() => overlay.remove(), 350);
      onDone(true);
    };
    ok.addEventListener("click", close);
    // Đưa focus vào hộp thoại (không focus thẳng nút để khỏi hiện viền focus khi mới vào)
    const box = overlay.querySelector(".modal-box");
    box.tabIndex = -1;
    box.focus({ preventScroll: true });
    overlay.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target === box) close(); });
  }

  /* ============================================================
   *  4. MUSIC PLAYER + DANH SÁCH NHẠC
   * ============================================================ */
  const player = (() => {
    const audio = $("#audio");
    const el = {
      player: $("#player"), cover: $("#cover"), title: $("#trackTitle"), artist: $("#trackArtist"),
      play: $("#playBtn"), prev: $("#prevBtn"), next: $("#nextBtn"),
      progress: $("#progress"), current: $("#currentTime"), duration: $("#duration"),
      playlistBtn: $("#playlistBtn"), playlist: $("#playlist"), items: $("#playlistItems"),
      volumeBtn: $("#volumeBtn"), volume: $("#volume"), volumeWrap: $(".volume"),
    };
    const T = window.SiteTheme;
    const playIcon = T.makeMorphIcon($("#playIcon"), "player-play");
    const caretIcon = T.makeMorphIcon($("#caretIcon"), "chevron-down");
    const volumeIcon = T.makeMorphIcon($("#volumeIcon"), "volume");
    const opts = cfg.player || {};
    const songs = (cfg.songs || []).filter((s) => s && s.src);
    let index = 0;
    let seeking = false;
    let errorStreak = 0;
    let wantsPlay = false;

    const setProgressVar = (input, pct) => input.style.setProperty("--p", `${pct}%`);

    function setPlayingUI(playing) {
      el.player.classList.toggle("playing", playing);
      playIcon.set(playing ? "player-pause" : "player-play");
      el.play.setAttribute("aria-label", playing ? "Dừng" : "Phát");
      el.items.querySelectorAll("li").forEach((li, i) => li.classList.toggle("playing", playing && i === index));
    }

    function updateActive() {
      el.items.querySelectorAll("li").forEach((li, i) => li.classList.toggle("active", i === index));
    }

    function updateMediaSession(song) {
      if (!("mediaSession" in navigator)) return;
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: song.title || "", artist: song.artist || "",
          artwork: [{ src: new URL(song.cover || cfg.avatar || "", location.href).href }],
        });
        navigator.mediaSession.setActionHandler("play", play);
        navigator.mediaSession.setActionHandler("pause", pause);
        navigator.mediaSession.setActionHandler("previoustrack", prev);
        navigator.mediaSession.setActionHandler("nexttrack", next);
      } catch { /* trình duyệt không hỗ trợ */ }
    }

    function load(i, autoplay = false) {
      if (!songs.length) return;
      index = ((i % songs.length) + songs.length) % songs.length;
      const song = songs[index];
      wantsPlay = autoplay;
      audio.src = song.src;
      audio.load();
      el.cover.src = song.cover || cfg.avatar || "assets/avatar.png";
      el.title.textContent = song.title || "Không rõ tên bài";
      el.artist.textContent = song.artist || "Không rõ tác giả";
      el.title.title = `${el.title.textContent} - ${el.artist.textContent}`;
      el.progress.value = 0;
      setProgressVar(el.progress, 0);
      el.current.textContent = "0:00";
      el.duration.textContent = "0:00";
      if (opts.rememberLastSong !== false) store.set("song-index", index);
      updateActive();
      updateMediaSession(song);
      if (autoplay) play();
    }

    function play() {
      if (!songs.length) { toast("Chưa có bài hát nào trong danh sách", "error"); return; }
      wantsPlay = true;
      const p = audio.play();
      if (p && p.catch) p.catch(() => { /* trình duyệt chặn autoplay — người xem bấm play là được */ });
    }
    function pause() { wantsPlay = false; audio.pause(); }
    function toggle() { audio.paused ? play() : pause(); }
    function next() { load(index + 1, true); }
    function prev() {
      if (audio.currentTime > 3 && !isNaN(audio.duration)) { audio.currentTime = 0; return; }
      load(index - 1, true);
    }

    function renderPlaylist() {
      el.items.innerHTML = "";
      if (!songs.length) {
        const li = document.createElement("li");
        li.className = "empty";
        li.textContent = "Chưa có bài hát nào — thêm vào js/config.js nhé";
        el.items.appendChild(li);
        return;
      }
      songs.forEach((s, i) => {
        const li = document.createElement("li");
        li.setAttribute("role", "button");
        li.tabIndex = 0;
        const num = document.createElement("span");
        num.className = "num";
        num.textContent = toRoman(i + 1) + ".";
        const song = document.createElement("span");
        song.className = "song";
        const b = document.createElement("b");
        b.textContent = s.title || "Không rõ tên bài";
        const artist = document.createElement("span");
        artist.className = "artist";
        artist.textContent = ` - ${s.artist || "Không rõ tác giả"}`;
        song.append(b, artist);
        song.title = `${b.textContent}${artist.textContent}`;
        const eq = document.createElement("span");
        eq.className = "eq";
        eq.innerHTML = "<span></span><span></span><span></span>";
        li.append(num, song, eq);
        const choose = () => (i === index ? toggle() : load(i, true));
        li.addEventListener("click", choose);
        li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(); } });
        el.items.appendChild(li);
      });
    }

    function applyVolume(v, save = true) {
      v = clamp(Number(v), 0, 1);
      audio.volume = v;
      audio.muted = v === 0;
      el.volume.value = v;
      setProgressVar(el.volume, v * 100);
      volumeIcon.set(v === 0 ? "volume-off" : "volume");
      if (save) store.set("volume", v);
    }

    function init() {
      // sự kiện audio
      audio.addEventListener("play", () => { errorStreak = 0; setPlayingUI(true); });
      audio.addEventListener("pause", () => setPlayingUI(false));
      audio.addEventListener("loadedmetadata", () => { el.duration.textContent = fmtTime(audio.duration); });
      audio.addEventListener("timeupdate", () => {
        if (seeking || !audio.duration) return;
        const pct = (audio.currentTime / audio.duration) * 100;
        el.progress.value = pct;
        setProgressVar(el.progress, pct);
        el.current.textContent = fmtTime(audio.currentTime);
      });
      audio.addEventListener("ended", () => { songs.length > 1 ? next() : (audio.currentTime = 0, play()); });
      audio.addEventListener("error", () => {
        errorStreak++;
        const s = songs[index] || {};
        toast(`Không phát được "${s.title || "bài hát"}" — kiểm tra lại đường dẫn nhạc`, "error");
        setPlayingUI(false);
        if (wantsPlay && songs.length > 1 && errorStreak < songs.length) setTimeout(next, 1500);
      });

      // nút điều khiển
      el.play.addEventListener("click", toggle);
      el.prev.addEventListener("click", prev);
      el.next.addEventListener("click", next);

      // tua nhạc
      el.progress.addEventListener("input", () => {
        seeking = true;
        setProgressVar(el.progress, el.progress.value);
        if (audio.duration) el.current.textContent = fmtTime((el.progress.value / 100) * audio.duration);
      });
      el.progress.addEventListener("change", () => {
        if (audio.duration) audio.currentTime = (el.progress.value / 100) * audio.duration;
        seeking = false;
      });

      // âm lượng
      let lastVolume = store.get("volume", opts.volume ?? 0.6) || 0.6;
      applyVolume(store.get("volume", opts.volume ?? 0.6), false);
      el.volume.addEventListener("input", () => { applyVolume(el.volume.value); if (Number(el.volume.value) > 0) lastVolume = Number(el.volume.value); });
      el.volumeBtn.addEventListener("click", () => {
        el.volumeWrap.classList.toggle("open");
        applyVolume(audio.volume > 0 ? 0 : (lastVolume || 0.6));
      });

      // danh sách nhạc
      renderPlaylist();
      const setPlaylistOpen = (open) => {
        el.playlist.classList.toggle("open", open);
        el.playlistBtn.setAttribute("aria-expanded", String(open));
        caretIcon.set(open ? "chevron-up" : "chevron-down");
      };
      el.playlistBtn.addEventListener("click", () => setPlaylistOpen(!el.playlist.classList.contains("open")));
      // Chế độ máy tính (màn rộng): mở sẵn danh sách nhạc vì có nhiều chỗ; điện thoại thì thu gọn
      const desktop = window.matchMedia("(min-width: 900px)");
      setPlaylistOpen(desktop.matches && songs.length > 0);
      desktop.addEventListener("change", (e) => setPlaylistOpen(e.matches && songs.length > 0));

      // phím tắt: Space = phát/dừng (khi không gõ chữ)
      document.addEventListener("keydown", (e) => {
        const tag = (e.target.tagName || "").toLowerCase();
        if (e.code === "Space" && !["input", "textarea", "button", "select", "a"].includes(tag) && !e.target.isContentEditable) {
          e.preventDefault();
          toggle();
        }
      });

      const remembered = opts.rememberLastSong !== false ? store.get("song-index", 0) : 0;
      load(clamp(Number(remembered) || 0, 0, Math.max(songs.length - 1, 0)));
    }

    return { init, play, pause, toggle, next, prev, load, get songs() { return songs; } };
  })();

  /* ============================================================
   *  5. THƯ GỬI ADMIN
   * ============================================================ */
  function initLetter() {
    const L = cfg.letter || {};
    const btn = $("#letterBtn");
    const modal = $("#letterModal");
    if (L.enabled === false) { btn.remove(); modal.remove(); return; }

    const form = $("#letterForm");
    const anon = $("#anonymous");
    const nameInput = $("#senderName");
    const msg = $("#letterMessage");
    const count = $("#charCount");
    const counter = $(".counter");
    const send = $("#letterSend");
    const sendText = $("#letterSendText");
    const sendIcon = window.SiteTheme.makeMorphIcon($("#sendIcon"), "send");
    const maxLen = Number(L.maxLength) || 1000;

    $("#letterBtnText").textContent = L.buttonText || "Gửi thư cho admin...";
    $("#letterTitle").textContent = L.title || "Gửi thư cho admin...";
    $("#letterDesc").textContent = L.description || "";
    $("#charMax").textContent = maxLen;
    msg.maxLength = maxLen;

    let lastFocus = null;
    const open = () => {
      lastFocus = document.activeElement;
      modal.classList.add("show");
      setTimeout(() => (anon.checked ? msg : nameInput).focus(), 320);
    };
    const close = () => {
      modal.classList.remove("show");
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    };

    btn.addEventListener("click", open);
    $("#letterClose").addEventListener("click", close);
    $("#letterCancel").addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal.classList.contains("show")) close(); });

    anon.addEventListener("change", () => {
      nameInput.disabled = anon.checked;
      nameInput.placeholder = anon.checked ? "Ẩn danh" : "Tên của bạn";
      if (anon.checked) nameInput.value = "";
    });
    msg.addEventListener("input", () => {
      count.textContent = Array.from(msg.value).length;
      counter.classList.toggle("over", msg.value.length >= maxLen);
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const message = msg.value.trim();
      const name = nameInput.value.trim();
      if (!message) { toast("Bạn chưa viết gì cả", "error"); msg.focus(); return; }
      if (!anon.checked && !name) { toast("Hãy nhập tên hoặc bật chế độ ẩn danh", "error"); nameInput.focus(); return; }

      send.disabled = true;
      sendText.textContent = "Đang gửi…";
      try {
        const res = await fetch("api/letters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: anon.checked ? "" : name, anonymous: anon.checked, message }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if ([404, 405, 501].includes(res.status) && !data.error) throw new Error("Trang đang mở không qua server.js nên chưa gửi được thư — hãy chạy `node server.js` (xem README)");
          throw new Error(data.error || `Gửi thất bại (${res.status})`);
        }
        toast(L.successText || "Đã gửi thư", "success");
        sendIcon.set("check");
        setTimeout(() => sendIcon.set("send"), 1800);
        form.reset();
        nameInput.disabled = false;
        nameInput.placeholder = "Tên của bạn";
        count.textContent = "0";
        close();
      } catch (err) {
        const offline = err instanceof TypeError; // fetch không tới được server
        toast(offline ? "Không kết nối được server — cần chạy `npm start` (xem README)" : err.message, "error");
      } finally {
        send.disabled = false;
        sendText.textContent = "Gửi thư";
      }
    });
  }

  /* ============================================================
   *  6. LƯỢT GHÉ THĂM
   * ============================================================ */
  async function initViews() {
    const el = $("#views");
    if (cfg.showViews === false) return;
    try {
      let counted = false;
      try { counted = sessionStorage.getItem("counted") === "1"; } catch { /* bỏ qua */ }
      const res = await fetch("api/visit", { method: counted ? "GET" : "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      try { sessionStorage.setItem("counted", "1"); } catch { /* bỏ qua */ }
      el.innerHTML = `${iconSvg("eye")} ${Number(data.views || 0).toLocaleString("vi-VN")} lượt ghé`;
      el.hidden = false;
    } catch {
      el.hidden = true; // mở trực tiếp file html, không có server → ẩn
    }
  }

  /* ============================================================
   *  KHỞI ĐỘNG
   * ============================================================ */
  function init() {
    initBackground();
    window.SiteTheme.bindToggle($("#themeToggle"));
    renderProfile();
    player.init();
    initLetter();
    initViews();
    initWelcome((clickedOk) => {
      showCard();
      // Người xem vừa bấm OK (có thao tác) nên trình duyệt cho phép phát nhạc
      if (clickedOk && (cfg.player || {}).autoplay !== false) player.play();
    });
  }

  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
