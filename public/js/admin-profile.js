/* ============================================================
 *  admin-profile.js — mục "Hồ sơ" (#ho-so): ảnh đại diện (cắt tròn, tải lên có tiến độ),
 *  tên, username, bio, ruy băng, tick xác minh + cài đặt linh vật.
 *  Chỉ lưu những ô KHÁC giá trị mặc định trong config.js (ô giống mặc định thì để config.js quyết định).
 * ============================================================ */
(() => {
  "use strict";

  const K = window.AdminKit;
  const { $, icon } = K;
  const ID = "ho-so";
  const MASCOT_FALLBACK = { enabled: true, name: "Bé Cam", color: "#d97757", messages: [] }; // = mặc định của mascot.js
  const MSG_MAX_LINES = 30;
  const MSG_MAX_LEN = 120;
  const isHex = (c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c.trim());

  let el = {};
  let form = null;         // giá trị đang sửa
  let saved = null;        // giá trị đã lưu (để so "chưa lưu")
  let uploading = null;    // { abort } khi đang tải ảnh đại diện
  let ready = false;

  /* ---------- giá trị mặc định (config.js) + giá trị hiệu lực (config ⊕ content) ---------- */
  function baseProfile() {
    const c = K.state.config;
    return {
      name: K.str(c.name), username: K.str(c.username), bio: K.str(c.bio),
      avatar: K.str(c.avatar), ribbon: K.str(c.ribbon), verified: c.verified === true,
    };
  }
  function baseMascot() {
    const m = { ...MASCOT_FALLBACK, ...(K.state.config.mascot || {}) };
    return {
      enabled: m.enabled !== false,
      name: K.str(m.name) || MASCOT_FALLBACK.name,
      color: isHex(m.color) ? m.color.trim().toLowerCase() : MASCOT_FALLBACK.color,
      messages: (Array.isArray(m.messages) ? m.messages : []).map(K.str).filter(Boolean),
    };
  }
  function effective(content) {
    const bp = baseProfile();
    const cp = (content && content.profile) || {};
    const profile = {};
    for (const key of Object.keys(bp)) profile[key] = K.hasOwn(cp, key) ? cp[key] : bp[key];
    profile.verified = profile.verified === true;
    const mascot = { ...baseMascot(), ...((content && content.mascot) || {}) };
    mascot.messages = (mascot.messages || []).slice();
    return { profile, mascot };
  }

  /* ---------- đọc form → giá trị ---------- */
  const messagesOf = (text) => text.replace(/\r\n?/g, "\n").split("\n").map((s) => s.trim()).filter(Boolean);
  function readForm() {
    form.profile.name = el.name.value;
    form.profile.username = el.username.value;
    form.profile.bio = el.bio.value;
    form.profile.ribbon = el.ribbon.value;
    form.profile.verified = el.verified.checked;
    form.mascot.enabled = el.msEnabled.checked;
    form.mascot.name = el.msName.value;
    form.mascot.color = el.msColor.value.toLowerCase();
    form.mascot.messages = messagesOf(el.msMessages.value);
  }
  // Dạng so sánh: đã cắt khoảng trắng như server
  function snapshot(v) {
    const p = v.profile;
    const m = v.mascot;
    return {
      profile: JSON.stringify({ name: K.str(p.name), username: K.str(p.username), bio: K.str(p.bio), avatar: K.str(p.avatar), ribbon: K.str(p.ribbon), verified: !!p.verified }),
      mascot: JSON.stringify({ enabled: !!m.enabled, name: K.str(m.name), color: String(m.color || "").toLowerCase(), messages: m.messages.map(K.str).filter(Boolean) }),
    };
  }
  function dirtySections() {
    if (!form || !saved) return [];
    const now = snapshot(form);
    return ["profile", "mascot"].filter((k) => now[k] !== saved[k]);
  }

  /* ---------- hiển thị ---------- */
  function fillForm() {
    const p = form.profile;
    const m = form.mascot;
    el.name.value = p.name;
    el.username.value = p.username;
    el.bio.value = p.bio;
    el.ribbon.value = p.ribbon;
    el.verified.checked = p.verified;
    el.msEnabled.checked = m.enabled;
    el.msName.value = m.name;
    el.msColor.value = isHex(m.color) ? m.color : MASCOT_FALLBACK.color;
    el.msMessages.value = m.messages.join("\n");
    showAvatar();
    updateCounters();
    updateMascot();
  }
  function showAvatar() {
    const src = K.str(form.profile.avatar);
    el.avatarImg.hidden = !src;
    el.avatarEmpty.hidden = !!src;
    if (src && el.avatarImg.getAttribute("src") !== src) el.avatarImg.src = src;
    el.avatarDefault.hidden = src === baseProfile().avatar;
  }
  let countBio;
  let countRibbon;
  function updateCounters() {
    if (countBio) countBio();
    if (countRibbon) countRibbon();
    const lines = messagesOf(el.msMessages.value);
    const tooLong = lines.map((s, i) => ({ i, n: s.length })).filter((x) => x.n > MSG_MAX_LEN);
    let info = `${lines.length}/${MSG_MAX_LINES} câu`;
    if (!lines.length) info += " — đang dùng các câu có sẵn";
    if (tooLong.length) info += ` · câu ${tooLong.map((x) => x.i + 1).join(", ")} dài quá ${MSG_MAX_LEN} ký tự`;
    el.msInfo.textContent = info;
    el.msInfo.classList.toggle("over", lines.length > MSG_MAX_LINES || tooLong.length > 0);
  }
  function updateMascot() {
    el.msColorCode.textContent = el.msColor.value.toLowerCase();
    el.msDot.style.setProperty("--dot", el.msColor.value);
    el.msFields.classList.toggle("is-off", !el.msEnabled.checked);
  }

  function changed() {
    readForm();
    updateCounters();
    updateMascot();
    K.refreshDirty();
  }

  /* ---------- ảnh đại diện: chọn / kéo thả / dán → (GIF động?) → cắt tròn → tải lên ---------- */
  async function takeAvatar(file) {
    if (!file || !ready) return;
    if (uploading) { K.toast("Đang tải ảnh khác lên, đợi chút nhé"); return; }
    try {
      const type = await K.images.sniffFile(file);
      if (!type) { K.toast("File này không phải ảnh", "error"); return; }
      let blob = null;
      let name = file.name || "avatar";
      if (type === "image/gif" && (await K.images.isAnimatedGif(file))) {
        const pick = await K.dialog.choose({
          title: "Ảnh GIF động",
          message: "Ảnh này có chuyển động. Giữ nguyên file gốc thì ảnh vẫn động nhưng không cắt được (trang sẽ tự cắt tròn ở giữa). Cắt thì ảnh thành ảnh tĩnh.",
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
        blob = await window.AdminCrop.open({ file, shape: "circle", size: 640, title: "Cắt ảnh đại diện" });
        if (!blob) return;
        name = `${K.baseName(name) || "avatar"}.${K.images.extOf(blob.type)}`;
      }
      if (blob.size > K.limits.image) { K.toast(K.tooBigMessage("image", blob.size), "error"); return; }
      await uploadAvatar(blob, name);
    } catch (err) {
      K.toast(err.message || "Không xử lý được ảnh", "error");
    }
  }

  async function uploadAvatar(blob, name) {
    const bar = el.progress;
    const fill = $(".bar span", bar);
    const pct = $(".pct", bar);
    const setP = (f) => { const v = Math.round(f * 100); fill.style.width = `${v}%`; pct.textContent = `${v}%`; };
    const job = K.upload(blob, { kind: "image", name, onProgress: setP });
    uploading = job;
    bar.hidden = false;
    el.drop.classList.add("is-busy");
    el.pick.disabled = true;
    K.refreshDirty();
    try {
      const media = await job.promise;
      form.profile.avatar = media.url;
      showAvatar();
      K.toast("Đã tải ảnh lên — bấm “Lưu thay đổi” để dùng ảnh mới", "success");
    } catch (err) {
      if (err.name !== "AbortError") K.toast(err.message, "error");
    } finally {
      uploading = null;
      bar.hidden = true;
      setP(0);
      el.drop.classList.remove("is-busy");
      el.pick.disabled = false;
      K.refreshDirty();
    }
  }

  /* ---------- lưu / khôi phục ---------- */
  function buildProfile() {
    const base = baseProfile();
    const out = {};
    const p = form.profile;
    for (const key of ["name", "username", "bio", "avatar", "ribbon"]) {
      const v = K.str(p[key]);
      if (v !== base[key]) out[key] = v;
    }
    if (!!p.verified !== base.verified) out.verified = !!p.verified;
    return out;
  }
  function buildMascot() {
    const base = baseMascot();
    const m = form.mascot;
    const out = {};
    if (!!m.enabled !== base.enabled) out.enabled = !!m.enabled;
    const name = K.str(m.name);
    if (name && name !== base.name) out.name = name;
    if (isHex(m.color) && m.color.toLowerCase() !== base.color) out.color = m.color.toLowerCase();
    const msgs = m.messages.map(K.str).filter(Boolean);
    if (msgs.length && JSON.stringify(msgs) !== JSON.stringify(base.messages)) out.messages = msgs;
    return out;
  }
  function validate() {
    const lines = form.mascot.messages;
    if (lines.length > MSG_MAX_LINES) return { msg: `Lời thoại tối đa ${MSG_MAX_LINES} câu (đang có ${lines.length})`, focus: el.msMessages };
    const i = lines.findIndex((s) => s.length > MSG_MAX_LEN);
    if (i >= 0) return { msg: `Câu thoại số ${i + 1} dài quá ${MSG_MAX_LEN} ký tự`, focus: el.msMessages };
    if (K.str(form.profile.bio).length > 500) return { msg: "Lời giới thiệu tối đa 500 ký tự", focus: el.bio };
    return null;
  }

  async function save() {
    readForm();
    if (uploading) { K.toast("Đợi ảnh tải lên xong rồi lưu nhé"); return; }
    const bad = validate();
    if (bad) { K.toast(bad.msg, "error"); bad.focus.focus(); return; }
    const sections = dirtySections();
    if (!sections.length) return;
    const changes = {};
    if (sections.includes("profile")) changes.profile = buildProfile();
    if (sections.includes("mascot")) changes.mascot = buildMascot();
    const sent = JSON.stringify(snapshot(form));
    try {
      const content = await K.saveContent(changes);
      const eff = effective(content);
      const snap = snapshot(eff);
      readForm();
      if (uploading || JSON.stringify(snapshot(form)) !== sent) {
        // có gõ thêm / đổi ảnh trong lúc đang lưu → giữ nguyên ô nhập, phần mới sửa vẫn tính là chưa lưu
        for (const k of sections) saved[k] = snap[k];
        K.refreshDirty();
      } else {
        // chỉ đồng bộ lại các mục vừa lưu (mục kia có thể đang sửa dở)
        for (const k of sections) form[k] = K.clone(eff[k]);
        for (const k of sections) saved[k] = snap[k];
        fillForm();
      }
      K.toast("Đã lưu hồ sơ ✓", "success");
    } catch (err) {
      if (err.status !== 401) K.toast(err.message, "error");
    }
  }

  async function resetSection(section) {
    const label = section === "profile" ? "thông tin cá nhân" : "linh vật";
    const extra = section === "profile" && K.str(form.profile.avatar).startsWith("media/")
      ? " Ảnh đại diện đã tải lên sẽ bị xoá khỏi kho tệp." : "";
    const ok = await K.dialog.confirm({
      title: "Khôi phục mặc định?",
      message: `Phần ${label} sẽ quay về giá trị trong file config.js.${extra}`,
      ok: "Khôi phục", danger: true,
    });
    if (!ok) return;
    try {
      const content = await K.saveContent({ [section]: null });
      const eff = effective(content);
      form[section] = K.clone(eff[section]);
      saved[section] = snapshot(eff)[section];
      fillForm();
      K.refreshDirty();
      K.toast("Đã khôi phục mặc định", "success");
    } catch (err) {
      if (err.status !== 401) K.toast(err.message, "error");
    }
  }

  /* ---------- nạp dữ liệu ---------- */
  function load(content, { force } = {}) {
    if (!force && form && dirtySections().length) return; // đang sửa dở thì giữ nguyên
    const eff = effective(content);
    form = K.clone(eff);
    saved = snapshot(eff);
    ready = true;
    fillForm();
    K.refreshDirty();
  }
  function discard() {
    if (uploading) uploading.abort();
    load(K.state.content, { force: true });
  }

  function init() {
    const panel = $("#tab-ho-so");
    el = {
      panel,
      name: $("#pfName"), username: $("#pfUsername"), bio: $("#pfBio"), bioCount: $("#pfBioCount"),
      ribbon: $("#pfRibbon"), ribbonCount: $("#pfRibbonCount"), verified: $("#pfVerified"),
      drop: $("#avatarDrop"), avatarImg: $("#avatarPreview"), avatarEmpty: $("#avatarEmpty"),
      pick: $("#avatarPick"), avatarDefault: $("#avatarDefault"), file: $("#avatarFile"), progress: $("#avatarProgress"),
      msEnabled: $("#msEnabled"), msName: $("#msName"), msColor: $("#msColor"), msColorCode: $("#msColorCode"),
      msDot: $("#msDot"), msMessages: $("#msMessages"), msInfo: $("#msMessagesInfo"), msFields: $("#mascotFields"),
    };
    countBio = K.counter(el.bio, el.bioCount, 500);
    countRibbon = K.counter(el.ribbon, el.ribbonCount, 24);
    for (const input of [el.name, el.username, el.bio, el.ribbon, el.msName, el.msMessages, el.msColor]) input.addEventListener("input", changed);
    for (const input of [el.verified, el.msEnabled, el.msColor]) input.addEventListener("change", changed);

    $("[data-cancel]", el.progress).appendChild(icon("x"));
    $("[data-cancel]", el.progress).addEventListener("click", () => uploading && uploading.abort());
    el.avatarImg.addEventListener("error", () => {
      el.avatarImg.hidden = true;
      el.avatarEmpty.hidden = false;
      el.avatarEmpty.textContent = "Không tải được ảnh";
    });
    el.avatarImg.addEventListener("load", () => { el.avatarEmpty.textContent = "Chưa có ảnh"; });

    const choose = async () => {
      const [file] = await K.pickFiles(el.file);
      if (file) takeAvatar(file);
    };
    el.pick.addEventListener("click", choose);
    el.drop.addEventListener("click", () => { if (!uploading) choose(); });
    el.drop.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!uploading) choose(); }
    });
    K.dropzone(el.drop, (files) => takeAvatar(Array.from(files).find((f) => /^image\//.test(f.type)) || files[0]));
    el.avatarDefault.addEventListener("click", () => {
      form.profile.avatar = baseProfile().avatar;
      showAvatar();
      K.refreshDirty();
    });
    // dán ảnh (Ctrl + V) khi đang ở mục Hồ sơ
    document.addEventListener("paste", (e) => {
      if (K.activeTab !== ID || document.querySelector(".admin-dialog")) return;
      const file = K.images.fromTransfer(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      takeAvatar(file);
    });

    $("#profileReset").addEventListener("click", () => resetSection("profile"));
    $("#mascotReset").addEventListener("click", () => resetSection("mascot"));

    K.bindSavebar(ID, {
      save, discard,
      isDirty: () => dirtySections().length > 0,
      busy: () => (uploading ? 1 : 0),
    });
  }

  K.registerTab(ID, {
    title: "Hồ sơ",
    init,
    load,
    save,
    isDirty: () => dirtySections().length > 0,
    busy: () => (uploading ? 1 : 0),
    draft: () => (form ? JSON.stringify(form) : ""),
  });
})();
