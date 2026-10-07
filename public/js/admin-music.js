/* ============================================================
 *  admin-music.js — mục "Âm nhạc" (#am-nhac): danh sách bài hát ở trang 2.
 *  Kéo-thả / ↑ ↓ đổi thứ tự, sửa tên bài + ca sĩ ngay trên dòng, ảnh bìa (cắt vuông 512 px),
 *  nghe thử, thêm từ máy (đọc thẻ ID3 để tự điền + lấy ảnh bìa nhúng) hoặc bằng đường link.
 * ============================================================ */
(() => {
  "use strict";

  const K = window.AdminKit;
  const { $, h, icon } = K;
  const ID = "am-nhac";
  const MAX_SONGS = 100;
  const MAX_TEXT = 120;
  const CONCURRENCY = 2;
  const AUDIO_EXT = /\.(mp3|m4a|m4b|mp4|aac|ogg|oga|opus|wav|flac|webm)$/i;

  let el = {};
  let rows = [];           // bài đang sửa
  let savedJson = "";
  let ready = false;
  let saving = false;      // đang gửi danh sách lên server → tạm không cho thêm bài
  const views = new Map(); // key → phần tử của dòng
  const queue = [];
  let active = 0;
  let coverTarget = null;

  /* ---------- dữ liệu ---------- */
  function effectiveSongs(content) {
    const list = content && Array.isArray(content.songs) ? content.songs : K.state.config.songs;
    return (Array.isArray(list) ? list : []).filter((s) => s && typeof s === "object").map((s) => ({
      id: typeof s.id === "string" ? s.id : "",
      title: K.str(s.title), artist: K.str(s.artist), src: K.str(s.src), cover: K.str(s.cover),
    }));
  }
  const newRow = (song) => ({ key: K.uid("s"), state: "ok", progress: 0, error: "", file: null, job: null, coverBusy: false, ...song });
  const payloadOf = (r) => ({ ...(r.id ? { id: r.id } : {}), title: K.str(r.title), artist: K.str(r.artist), src: r.src, cover: r.cover || "" });
  const snapshot = () => JSON.stringify(rows.filter((r) => r.state === "ok").map(payloadOf));
  const pending = () => rows.filter((r) => r.state === "uploading" || r.state === "queued").length;
  const isDirty = () => ready && (snapshot() !== savedJson || rows.some((r) => r.state !== "ok"));
  const busy = () => pending() + rows.filter((r) => r.coverBusy).length;

  function sourceLabel(src) {
    if (!src) return "";
    if (src.startsWith("media/")) return "Tệp đã tải lên";
    if (src.startsWith("assets/")) {
      let name = src.split("/").pop();
      try { name = decodeURIComponent(name); } catch { /* giữ nguyên */ }
      return `Tệp có sẵn · ${name}`;
    }
    try { return `Đường link · ${new URL(src).hostname}`; } catch { return "Đường link"; }
  }

  /* ---------- dựng 1 dòng ---------- */
  function buildRow(row) {
    const li = h("li", { class: "song-row", "data-key": row.key });
    const grip = h("button", { class: "drag-handle", type: "button", title: "Kéo để đổi chỗ (hoặc phím ↑ ↓)" }, icon("grip"));
    const num = h("span", { class: "song-num", "aria-hidden": "true" });
    const coverImg = h("img", { alt: "", draggable: false });
    const coverBtn = h("button", { class: "song-cover", type: "button", title: "Đổi ảnh bìa" }, coverImg, icon("music", "song-cover-ph"));
    const coverX = h("button", { class: "song-cover-x", type: "button", "aria-label": "Bỏ ảnh bìa", title: "Bỏ ảnh bìa" }, icon("x"));
    const coverWrap = h("div", { class: "song-cover-wrap" }, coverBtn, coverX);
    const title = h("input", { class: "inline-input song-title", type: "text", maxLength: MAX_TEXT, placeholder: "Tên bài", autocomplete: "off", value: row.title });
    const artist = h("input", { class: "inline-input song-artist", type: "text", maxLength: MAX_TEXT, placeholder: "Ca sĩ / tác giả", autocomplete: "off", value: row.artist });
    const meta = h("div", { class: "song-meta" });
    const play = h("button", { class: "icon-btn small song-play", type: "button" });
    K.preview.bindButton(play, "Nghe thử");
    const up = h("button", { class: "icon-btn small", type: "button", "aria-label": "Lên trên", title: "Lên trên" }, icon("arrow-up"));
    const down = h("button", { class: "icon-btn small", type: "button", "aria-label": "Xuống dưới", title: "Xuống dưới" }, icon("arrow-down"));
    const del = h("button", { class: "icon-btn small danger", type: "button", "aria-label": "Xoá bài", title: "Xoá bài" }, icon("trash"));
    li.append(grip, num, coverWrap, h("div", { class: "song-main" }, title, artist, meta), h("div", { class: "song-actions" }, play, up, down, del));

    title.addEventListener("input", () => { row.title = title.value; label(); K.refreshDirty(); });
    artist.addEventListener("input", () => { row.artist = artist.value; label(); K.refreshDirty(); });
    play.addEventListener("click", () => K.preview.toggle(row.src, play));
    up.addEventListener("click", () => move(row, -1, up));
    down.addEventListener("click", () => move(row, 1, down));
    del.addEventListener("click", () => removeRow(row));
    coverBtn.addEventListener("click", () => pickCover(row));
    coverX.addEventListener("click", () => { row.cover = ""; update(row); K.refreshDirty(); });
    coverImg.addEventListener("error", () => { coverImg.hidden = true; coverBtn.classList.add("is-empty"); });

    function label() {
      const name = K.str(row.title) || "bài chưa có tên";
      grip.setAttribute("aria-label", `Kéo để đổi chỗ: ${name}`);
      title.setAttribute("aria-label", `Tên bài (${rows.indexOf(row) + 1})`);
      artist.setAttribute("aria-label", `Ca sĩ của ${name}`);
      coverBtn.setAttribute("aria-label", `Đổi ảnh bìa: ${name}`);
    }

    function update() {
      const i = rows.indexOf(row);
      num.textContent = String(i + 1).padStart(2, "0");
      up.disabled = i <= 0;
      down.disabled = i >= rows.length - 1;
      const ok = row.state === "ok";
      li.classList.toggle("is-uploading", row.state === "uploading" || row.state === "queued");
      li.classList.toggle("is-error", row.state === "error");
      play.disabled = !ok || !row.src;
      const coverSrc = row.localCover || row.cover;
      coverImg.hidden = !coverSrc;
      coverBtn.classList.toggle("is-empty", !coverSrc);
      if (coverSrc && coverImg.getAttribute("src") !== coverSrc) coverImg.src = coverSrc;
      coverX.hidden = !row.cover || row.coverBusy;
      coverBtn.disabled = row.coverBusy;
      coverBtn.classList.toggle("is-busy", row.coverBusy);
      if (title.value !== row.title && document.activeElement !== title) title.value = row.title;
      if (artist.value !== row.artist && document.activeElement !== artist) artist.value = row.artist;
      label();

      // dòng trạng thái: nguồn nhạc / tiến độ tải lên / lỗi
      meta.replaceChildren();
      if (row.state === "uploading" || row.state === "queued") {
        const bar = K.progressBar(`Đang tải lên ${K.str(row.title)}`);
        bar.set(row.progress);
        bar.onCancel(() => cancelRow(row));
        meta.append(bar.el, h("span", { class: "song-src", text: row.state === "queued" ? "Đang chờ…" : K.fmtBytes(row.file ? row.file.size : 0) }));
        row.setProgress = bar.set;
      } else if (row.state === "error") {
        meta.append(
          h("span", { class: "song-error", role: "alert" }, icon("alert"), row.error),
          h("button", { class: "link-btn", type: "button", onclick: () => enqueue(row) }, "Thử lại"),
          h("button", { class: "link-btn", type: "button", onclick: () => dropRow(row) }, "Bỏ"),
        );
      } else {
        meta.append(h("span", { class: "song-src", text: sourceLabel(row.src) }));
        if (row.coverBusy) meta.append(h("span", { class: "song-src", text: " · đang tải ảnh bìa…" }));
      }
    }

    views.set(row.key, { li, update, grip, title });
    update();
    return li;
  }
  const update = (row) => { const v = views.get(row.key); if (v) v.update(); };

  function render() {
    const keep = new Set(rows.map((r) => r.key));
    for (const [key, v] of views) if (!keep.has(key)) { v.li.remove(); views.delete(key); }
    rows.forEach((row) => {
      const v = views.get(row.key);
      const li = v ? v.li : buildRow(row);
      el.list.appendChild(li); // appendChild với phần tử đã có = dời về đúng thứ tự
      if (v) v.update();
    });
    el.empty.hidden = rows.length > 0;
    const n = rows.filter((r) => r.state === "ok").length;
    el.stats.textContent = rows.length
      ? `${n} bài${pending() ? ` · đang tải lên ${pending()}` : ""} · tối đa ${MAX_SONGS} bài. Thứ tự ở đây là thứ tự phát.`
      : "Danh sách nhạc ở trang 2 đang trống.";
    el.addFile.disabled = rows.length >= MAX_SONGS;
    el.addLink.disabled = rows.length >= MAX_SONGS;
  }

  function focusIn(row, sel) {
    const v = views.get(row.key);
    if (!v) return;
    const target = sel === "grip" ? v.grip : sel || v.grip;
    try { target.focus({ preventScroll: false }); } catch { /* bỏ qua */ }
  }

  function move(row, delta, btn) {
    const from = rows.indexOf(row);
    const to = from + delta;
    if (to < 0 || to >= rows.length) return;
    K.moveItem(rows, from, to);
    render();
    K.refreshDirty();
    const v = views.get(row.key);
    // nút vừa bấm bị vô hiệu ở đầu/cuối danh sách → chuyển focus sang tay nắm
    if (btn && !btn.disabled) btn.focus();
    else if (v) v.grip.focus();
  }

  async function removeRow(row) {
    if (row.state === "uploading" || row.state === "queued") { cancelRow(row); return; }
    const name = K.str(row.title) || "bài chưa có tên";
    const ok = await K.dialog.confirm({
      title: "Xoá bài hát?",
      message: `Bỏ “${name}” khỏi danh sách. Thay đổi chỉ áp dụng khi bạn bấm “Lưu danh sách”.`,
      ok: "Xoá bài", danger: true,
    });
    if (ok) dropRow(row);
  }
  function dropRow(row) {
    const i = rows.indexOf(row);
    if (i < 0) return;
    if (K.preview.isPlaying(row.src)) K.preview.stop();
    if (row.localCover) URL.revokeObjectURL(row.localCover);
    rows.splice(i, 1);
    render();
    K.refreshDirty();
    const next = rows[i] || rows[i - 1];
    if (next) focusIn(next); else el.addFile.focus();
  }

  /* ---------- tải nhạc lên: hàng đợi 2 file một lúc ---------- */
  function enqueue(row) {
    row.state = "queued";
    row.error = "";
    row.progress = 0;
    queue.push(row);
    update(row);
    render();
    K.refreshDirty();
    pump();
  }
  function pump() {
    while (active < CONCURRENCY && queue.length) {
      const row = queue.shift();
      if (rows.includes(row) && row.state === "queued") run(row);
    }
  }
  async function run(row) {
    active++;
    row.state = "uploading";
    update(row);
    row.job = K.upload(row.file, {
      kind: "audio",
      name: row.file.name,
      onProgress: (f) => { row.progress = f; if (row.setProgress) row.setProgress(f); },
    });
    try {
      const media = await row.job.promise;
      row.src = media.url;
      row.state = "ok";
      row.file = null;
      if (row.picture && !row.cover) uploadEmbeddedCover(row);
    } catch (err) {
      if (err.name === "AbortError") {
        if (rows.includes(row)) dropRow(row);
      } else {
        row.state = "error";
        row.error = err.message;
      }
    } finally {
      active--;
      row.job = null;
      if (rows.includes(row)) update(row);
      render();
      K.refreshDirty();
      pump();
    }
  }
  function cancelRow(row) {
    if (row.job) { row.job.abort(); return; } // run() sẽ bỏ dòng khi nhận AbortError
    const qi = queue.indexOf(row);
    if (qi >= 0) queue.splice(qi, 1);
    dropRow(row);
  }

  // Ảnh bìa nhúng trong file nhạc → thu nhỏ còn ≤ 512 px rồi tải lên làm ảnh bìa
  async function uploadEmbeddedCover(row) {
    const pic = row.picture;
    row.picture = null;
    row.coverBusy = true;
    update(row);
    K.refreshDirty();
    try {
      const prepared = await K.images.prepare(new Blob([pic.data], { type: pic.mime }), 512);
      const ext = K.images.extOf(prepared.blob.type);
      const media = await K.upload(prepared.blob, { kind: "image", name: `bia-${K.str(row.title) || "bai-hat"}.${ext}` }).promise;
      if (rows.includes(row) && !row.cover) row.cover = media.url;
    } catch (err) {
      if (err.name !== "AbortError" && err.status !== 401) K.toast(`Không tải được ảnh bìa nhúng: ${err.message}`, "error");
    } finally {
      row.coverBusy = false;
      if (row.localCover) { URL.revokeObjectURL(row.localCover); row.localCover = ""; }
      if (rows.includes(row)) update(row);
      K.refreshDirty();
    }
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (saving) { K.toast("Đang lưu danh sách, đợi chút rồi thêm bài nhé"); return; }
    let added = 0;
    let firstNew = null;
    for (const file of files) {
      if (rows.length >= MAX_SONGS) { K.toast(`Danh sách tối đa ${MAX_SONGS} bài`, "error"); break; }
      if (!/^audio\//.test(file.type) && !AUDIO_EXT.test(file.name)) {
        K.toast(`“${file.name}” không phải file nhạc`, "error");
        continue;
      }
      let tags = null;
      try { tags = await window.AdminID3.readFile(file); } catch { tags = null; }
      const fromName = window.AdminID3.fromFileName(file.name);
      const row = newRow({
        id: "",
        title: ((tags && tags.title) || fromName.title || "").slice(0, MAX_TEXT),
        artist: ((tags && tags.artist) || fromName.artist || "").slice(0, MAX_TEXT),
        src: "",
        cover: "",
      });
      row.file = file;
      if (tags && tags.picture) {
        row.picture = tags.picture;
        try { row.localCover = URL.createObjectURL(new Blob([tags.picture.data], { type: tags.picture.mime })); } catch { /* bỏ qua */ }
      }
      rows.push(row);
      if (!firstNew) firstNew = row;
      added++;
      if (file.size > K.limits.audio) {
        row.state = "error";
        row.error = K.tooBigMessage("audio", file.size);
        render();
        continue;
      }
      enqueue(row);
    }
    render();
    K.refreshDirty();
    if (added) {
      K.toast(added === 1 ? "Đang tải bài hát lên…" : `Đang tải ${added} bài hát lên…`);
      const v = firstNew && views.get(firstNew.key);
      if (v) v.li.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
  }

  /* ---------- ảnh bìa từng bài: chọn ảnh → cắt vuông 512 px → tải lên ---------- */
  async function pickCover(row) {
    if (row.coverBusy) return;
    coverTarget = row;
    const [file] = await K.pickFiles(el.coverFile);
    if (!file || coverTarget !== row) return;
    try {
      const type = await K.images.sniffFile(file);
      if (!type) { K.toast("File này không phải ảnh", "error"); return; }
      let blob = null;
      let name = file.name || "bia";
      if (type === "image/gif" && (await K.images.isAnimatedGif(file))) {
        const pick = await K.dialog.choose({
          title: "Ảnh GIF động",
          message: "Giữ nguyên file gốc thì ảnh bìa vẫn chuyển động nhưng không cắt được. Cắt thì thành ảnh tĩnh.",
          choices: [
            { label: "Huỷ", value: null, kind: "ghost" },
            { label: "Cắt thành ảnh tĩnh", value: "crop", kind: "ghost" },
            { label: "Giữ ảnh động", value: "keep", kind: "primary" },
          ],
        });
        if (!pick) return;
        if (pick === "keep") blob = file;
      }
      if (!blob) {
        blob = await window.AdminCrop.open({ file, shape: "square", size: 512, title: "Cắt ảnh bìa bài hát" });
        if (!blob) return;
        name = `bia-${K.baseName(name) || "bai-hat"}.${K.images.extOf(blob.type)}`;
      }
      row.coverBusy = true;
      update(row);
      K.refreshDirty();
      const media = await K.upload(blob, { kind: "image", name }).promise;
      if (rows.includes(row)) row.cover = media.url;
      K.toast("Đã đổi ảnh bìa — nhớ bấm “Lưu danh sách”", "success");
    } catch (err) {
      if (err.name !== "AbortError" && err.status !== 401) K.toast(err.message, "error");
    } finally {
      row.coverBusy = false;
      if (rows.includes(row)) update(row);
      K.refreshDirty();
    }
  }

  /* ---------- thêm bằng đường link ---------- */
  function toggleLinkForm(show) {
    const open = show === undefined ? el.linkForm.hidden : show;
    el.linkForm.hidden = !open;
    el.addLink.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) { el.slError.textContent = ""; el.slUrl.focus(); }
  }
  function addLink(e) {
    e.preventDefault();
    if (saving) { K.toast("Đang lưu danh sách, đợi chút rồi thêm bài nhé"); return; }
    const url = el.slUrl.value.trim();
    el.slError.textContent = "";
    if (!/^https?:\/\//i.test(url) || !window.BookPages || !window.BookPages.safeUrl(url, "audio")) {
      el.slError.textContent = "Đường link phải bắt đầu bằng http:// hoặc https:// và không chứa khoảng trắng";
      el.slUrl.focus();
      return;
    }
    let title = el.slTitle.value.trim();
    let artist = el.slArtist.value.trim();
    if (!title) {
      // không nhập tên → đoán từ tên file trong link ("Tên bài - Ca sĩ.mp3")
      try {
        const guess = window.AdminID3.fromFileName(decodeURIComponent(new URL(url).pathname.split("/").pop() || ""));
        title = guess.title;
        if (!artist) artist = guess.artist;
      } catch { title = ""; }
    }
    if (!title) {
      el.slError.textContent = "Hãy nhập tên bài";
      el.slTitle.focus();
      return;
    }
    if (rows.length >= MAX_SONGS) { el.slError.textContent = `Danh sách tối đa ${MAX_SONGS} bài`; return; }
    const row = newRow({ id: "", title: title.slice(0, MAX_TEXT), artist: artist.slice(0, MAX_TEXT), src: url, cover: "" });
    rows.push(row);
    render();
    K.refreshDirty();
    el.slUrl.value = "";
    el.slTitle.value = "";
    el.slArtist.value = "";
    K.toast("Đã thêm bài — nhớ bấm “Lưu danh sách”", "success");
    el.slUrl.focus();
  }

  /* ---------- lưu ---------- */
  async function save() {
    if (pending() || rows.some((r) => r.coverBusy)) { K.toast("Đợi tải lên xong rồi lưu nhé"); return; }
    const broken = rows.find((r) => r.state === "error");
    if (broken) {
      K.toast("Còn bài tải lên bị lỗi — bấm “Thử lại” hoặc “Bỏ”", "error");
      focusIn(broken);
      return;
    }
    const noTitle = rows.find((r) => !K.str(r.title));
    if (noTitle) {
      K.toast("Bài nào cũng cần có tên", "error");
      focusIn(noTitle, views.get(noTitle.key).title);
      return;
    }
    const songs = rows.map(payloadOf);
    el.list.setAttribute("aria-busy", "true");
    el.list.inert = true;
    saving = true;
    try {
      const content = await K.saveContent({ songs });
      load(content, { force: true });
      K.toast("Đã lưu danh sách nhạc ✓", "success");
    } catch (err) {
      if (err.status !== 401) K.toast(err.message, "error");
    } finally {
      saving = false;
      el.list.removeAttribute("aria-busy");
      el.list.inert = false;
    }
  }

  async function resetDefault() {
    const ok = await K.dialog.confirm({
      title: "Khôi phục danh sách mặc định?",
      message: "Danh sách nhạc sẽ quay về các bài trong file config.js. Các file nhạc / ảnh bìa đã tải lên mà không còn dùng sẽ bị xoá khỏi kho tệp.",
      ok: "Khôi phục", danger: true,
    });
    if (!ok) return;
    try {
      const content = await K.saveContent({ songs: null });
      load(content, { force: true });
      K.toast("Đã khôi phục danh sách mặc định", "success");
    } catch (err) {
      if (err.status !== 401) K.toast(err.message, "error");
    }
  }

  /* ---------- nạp ---------- */
  function load(content, { force } = {}) {
    if (!force && ready && isDirty()) return;
    for (const r of rows) {
      if (r.job) r.job.abort();
      if (r.localCover) URL.revokeObjectURL(r.localCover);
    }
    queue.length = 0;
    rows = effectiveSongs(content).map(newRow);
    savedJson = snapshot();
    ready = true;
    for (const v of views.values()) v.li.remove();
    views.clear();
    render();
    K.refreshDirty();
  }
  function discard() {
    K.preview.stop();
    load(K.state.content, { force: true });
  }

  function init() {
    el = {
      list: $("#songList"), empty: $("#songEmpty"), stats: $("#songStats"),
      addFile: $("#songAddFile"), files: $("#songFiles"), addLink: $("#songAddLinkToggle"),
      linkForm: $("#songLinkForm"), slUrl: $("#slUrl"), slTitle: $("#slTitle"), slArtist: $("#slArtist"), slError: $("#slError"),
      coverFile: $("#coverFile"),
    };
    el.addFile.addEventListener("click", async () => addFiles(await K.pickFiles(el.files)));
    el.addLink.addEventListener("click", () => toggleLinkForm());
    $("#slCancel").addEventListener("click", () => { toggleLinkForm(false); el.addLink.focus(); });
    el.linkForm.addEventListener("submit", addLink);
    $("#songsReset").addEventListener("click", resetDefault);
    K.dropzone($("#tab-am-nhac"), (files) => addFiles(Array.from(files).filter((f) => /^audio\//.test(f.type) || AUDIO_EXT.test(f.name))));

    K.sortable(el.list, {
      item: ".song-row",
      handle: ".drag-handle",
      onMove(from, to) {
        const row = rows[from];
        K.moveItem(rows, from, to);
        render();
        K.refreshDirty();
        const v = views.get(row.key);
        if (v && document.activeElement !== v.grip) v.grip.focus({ preventScroll: true });
      },
    });

    K.bindSavebar(ID, { save, discard, isDirty, busy });
  }

  K.registerTab(ID, {
    title: "Âm nhạc",
    init,
    load,
    save,
    isDirty,
    busy,
    onHide: () => K.preview.stop(),
    draft: () => JSON.stringify(rows.map(payloadOf)),
  });
})();
