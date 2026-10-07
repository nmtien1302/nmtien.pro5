/* ============================================================
 *  admin-id3.js — đọc thẻ ID3v2 (2.2 / 2.3 / 2.4) của file nhạc ngay trong trình duyệt
 *  để tự điền tên bài (TIT2), ca sĩ (TPE1) và lấy ảnh bìa nhúng sẵn (APIC).
 *  Không phụ thuộc gì; chạy được cả trong Node (module.exports) để kiểm thử.
 *    AdminID3.parse(bytes)            → { version, title, artist, album, picture, frames } | null
 *    AdminID3.readFile(file)          → Promise<cùng kết quả> (chỉ đọc phần đầu file chứa thẻ)
 *    AdminID3.fromFileName(name)      → { title, artist }  — quy ước "Tên bài - Ca sĩ.mp3"
 * ============================================================ */
(function (factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module && module.exports) module.exports = api;
  else (typeof window !== "undefined" ? window : globalThis).AdminID3 = api;
})(function () {
  "use strict";

  const MAX_TAG_BYTES = 32 * 1024 * 1024; // thẻ lớn hơn thế này coi như hỏng

  /* ---------- đọc số ---------- */
  const synchsafe = (b, i) => ((b[i] & 0x7f) << 21) | ((b[i + 1] & 0x7f) << 14) | ((b[i + 2] & 0x7f) << 7) | (b[i + 3] & 0x7f);
  const u32 = (b, i) => b[i] * 0x1000000 + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);
  const u24 = (b, i) => (b[i] << 16) | (b[i + 1] << 8) | b[i + 2];
  const ascii = (b, i, n) => {
    let s = "";
    for (let k = 0; k < n && i + k < b.length; k++) s += String.fromCharCode(b[i + k]);
    return s;
  };

  function toBytes(input) {
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    return null;
  }

  /** Số byte cần đọc từ đầu file để có trọn thẻ ID3v2 (0 nếu file không có thẻ) */
  function tagLength(head) {
    const b = toBytes(head);
    if (!b || b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return 0;
    if (b[3] < 2 || b[3] > 4 || b[3] === 0xff || b[4] === 0xff) return 0;
    if ((b[6] | b[7] | b[8] | b[9]) & 0x80) return 0; // kích thước phải là synchsafe
    const size = synchsafe(b, 6);
    const footer = b[3] === 4 && b[5] & 0x10 ? 10 : 0;
    return 10 + size + footer;
  }

  // Bỏ "unsynchronisation": mỗi cặp FF 00 → FF
  function deUnsync(b) {
    let n = 0;
    for (let i = 0; i < b.length; i++) if (b[i] === 0x00 && i > 0 && b[i - 1] === 0xff) n++;
    if (!n) return b;
    const out = new Uint8Array(b.length - n);
    let j = 0;
    for (let i = 0; i < b.length; i++) {
      if (b[i] === 0x00 && i > 0 && b[i - 1] === 0xff) continue;
      out[j++] = b[i];
    }
    return out;
  }

  /* ---------- giải mã chữ theo 4 kiểu mã hoá của ID3 ---------- */
  function latin1(b, start, end) {
    let s = "";
    for (let i = start; i < end; i++) s += String.fromCharCode(b[i]);
    return s;
  }
  function utf16(b, start, end, littleEndian) {
    let le = littleEndian;
    let i = start;
    if (end - i >= 2) {
      if (b[i] === 0xff && b[i + 1] === 0xfe) { le = true; i += 2; }
      else if (b[i] === 0xfe && b[i + 1] === 0xff) { le = false; i += 2; }
    }
    const units = [];
    for (; i + 1 < end; i += 2) units.push(le ? b[i] | (b[i + 1] << 8) : (b[i] << 8) | b[i + 1]);
    let s = "";
    for (let k = 0; k < units.length; k += 4096) s += String.fromCharCode.apply(null, units.slice(k, k + 4096));
    return s;
  }
  let utf8Decoder = null;
  function utf8(b, start, end) {
    if (!utf8Decoder && typeof TextDecoder === "function") utf8Decoder = new TextDecoder("utf-8");
    if (utf8Decoder) return utf8Decoder.decode(b.subarray(start, end));
    try { return decodeURIComponent(escape(latin1(b, start, end))); } catch { return latin1(b, start, end); }
  }
  function decodeText(b, start, end, enc) {
    if (end <= start) return "";
    if (enc === 1) return utf16(b, start, end, true); // có BOM (thiếu BOM thì đoán little-endian như Windows)
    if (enc === 2) return utf16(b, start, end, false); // UTF-16BE không BOM
    if (enc === 3) return utf8(b, start, end);
    return latin1(b, start, end);
  }
  // Vị trí kết thúc chuỗi (byte 0, hoặc 00 00 thẳng hàng với UTF-16) tính từ start
  function findTerminator(b, start, end, enc) {
    if (enc === 1 || enc === 2) {
      for (let i = start; i + 1 < end; i += 2) if (b[i] === 0 && b[i + 1] === 0) return i;
      return end;
    }
    for (let i = start; i < end; i++) if (b[i] === 0) return i;
    return end;
  }

  // Khung chữ (TIT2, TPE1…): byte mã hoá + chuỗi; ID3v2.4 cho phép nhiều giá trị ngăn bằng ký tự 0
  function textFrame(data) {
    if (!data.length) return [];
    const enc = data[0];
    if (enc > 3) return [];
    const parts = [];
    let p = 1;
    while (p < data.length) {
      const t = findTerminator(data, p, data.length, enc);
      parts.push(decodeText(data, p, t, enc));
      p = t + (enc === 1 || enc === 2 ? 2 : 1);
    }
    return parts.map((s) => s.replace(/﻿/g, "").replace(/[\u0000-\u001f]/g, " ").trim()).filter(Boolean);
  }

  /* ---------- ảnh bìa ---------- */
  function sniffPicture(b) {
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
    if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
    if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
    if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "image/webp";
    if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d) return "image/bmp";
    return "";
  }
  function normalizeMime(m) {
    const s = String(m || "").trim().toLowerCase();
    if (!s) return "";
    if (s === "jpg" || s === "jpeg" || s === "image/jpg" || s === "image/pjpeg") return "image/jpeg";
    if (s === "png") return "image/png";
    if (s === "gif") return "image/gif";
    return s.includes("/") ? s : `image/${s}`;
  }
  // APIC (2.3 / 2.4): mã hoá, MIME (latin1, kết thúc 0), loại ảnh, mô tả, dữ liệu ảnh
  // PIC  (2.2):       mã hoá, định dạng 3 ký tự, loại ảnh, mô tả, dữ liệu ảnh
  function pictureFrame(data, v22) {
    if (data.length < 4) return null;
    const enc = data[0];
    if (enc > 3) return null;
    let p = 1;
    let mime;
    if (v22) {
      mime = ascii(data, 1, 3);
      p = 4;
    } else {
      const t = findTerminator(data, 1, data.length, 0);
      mime = latin1(data, 1, t);
      p = t + 1;
    }
    if (mime === "-->") return null; // chỉ là đường link, không có ảnh
    const type = data[p++];
    const t = findTerminator(data, p, data.length, enc);
    const description = decodeText(data, p, t, enc).replace(/﻿/g, "").trim();
    p = t + (enc === 1 || enc === 2 ? 2 : 1);
    if (p >= data.length) return null;
    const bytes = data.slice(p);
    const sniffed = sniffPicture(bytes);
    const declared = normalizeMime(mime);
    if (!sniffed && !/^image\//.test(declared)) return null;
    return { mime: sniffed || declared, type: type === undefined ? 0 : type, description, data: bytes };
  }

  /* ============================================================
   *  parse(bytes) — bytes là phần đầu file (ít nhất trọn thẻ)
   * ============================================================ */
  function parse(input) {
    const all = toBytes(input);
    const total = all ? tagLength(all) : 0;
    if (!total) return null;
    const major = all[3];
    const flags = all[5];
    const end = Math.min(all.length, total - (major === 4 && flags & 0x10 ? 10 : 0));
    const result = {
      version: `2.${major}.${all[4]}`,
      title: "",
      artist: "",
      album: "",
      picture: null,
      frames: [],
      truncated: all.length < total,
    };
    if (major === 2 && flags & 0x40) return result; // 2.2 nén cả thẻ: không hỗ trợ

    // 2.2 / 2.3: unsync áp cho cả thẻ; 2.4: áp cho từng khung
    let b = all.subarray(10, end);
    if (major < 4 && flags & 0x80) b = deUnsync(b);

    let pos = 0;
    if (major >= 3 && flags & 0x40 && b.length >= 4) {
      // tiêu đề mở rộng: 2.3 = kích thước (không tính 4 byte đầu), 2.4 = synchsafe (tính cả chính nó)
      pos = major === 3 ? 4 + u32(b, 0) : synchsafe(b, 0);
      if (pos > b.length) return result;
    }

    const idLen = major === 2 ? 3 : 4;
    const headLen = major === 2 ? 6 : 10;
    const isId = (p) => {
      if (p + idLen > b.length) return false;
      for (let k = 0; k < idLen; k++) {
        const c = b[p + k];
        if (!((c >= 0x41 && c <= 0x5a) || (c >= 0x30 && c <= 0x39))) return false;
      }
      return true;
    };
    const okNext = (p) => p === b.length || p + headLen > b.length || b[p] === 0 || isId(p);
    const pictures = [];
    let titleParts = null;
    let artistParts = null;
    let albumParts = null;

    while (pos + headLen <= b.length && isId(pos)) {
      const id = ascii(b, pos, idLen);
      let size;
      let fmt = 0; // cờ định dạng của khung
      if (major === 2) {
        size = u24(b, pos + 3);
      } else if (major === 3) {
        size = u32(b, pos + 4);
        fmt = b[pos + 9];
      } else {
        // 2.4 chuẩn dùng synchsafe; vài phần mềm cũ (iTunes) ghi số thường → thử cả hai
        const plain = u32(b, pos + 4);
        const safe = synchsafe(b, pos + 4);
        const highBit = (b[pos + 4] | b[pos + 5] | b[pos + 6] | b[pos + 7]) & 0x80;
        size = highBit ? plain : safe;
        if (!highBit && safe !== plain && !okNext(pos + 10 + safe) && okNext(pos + 10 + plain)) size = plain;
        fmt = b[pos + 9];
      }
      const start = pos + headLen;
      const stop = start + size;
      if (stop > b.length) {
        result.truncated = true;
        break;
      }
      if (size <= 0) { // khung rỗng (sai chuẩn nhưng có gặp): bỏ qua, đọc tiếp
        pos = start;
        continue;
      }
      result.frames.push(id);
      let data = b.subarray(start, stop);
      let usable = true;
      if (major === 3) {
        if (fmt & 0x80 || fmt & 0x40) usable = false; // nén / mã hoá: bỏ qua
        else if (fmt & 0x20) data = data.subarray(1); // nhóm
      } else if (major === 4) {
        if (fmt & 0x08 || fmt & 0x04) usable = false; // nén / mã hoá: bỏ qua
        else {
          let skip = 0;
          if (fmt & 0x40) skip += 1; // nhóm
          if (fmt & 0x01) skip += 4; // độ dài dữ liệu gốc
          data = data.subarray(skip);
          if (fmt & 0x02 || flags & 0x80) data = deUnsync(data);
        }
      }
      if (usable) {
        if (id === "TIT2" || id === "TT2") titleParts = titleParts || textFrame(data);
        else if (id === "TPE1" || id === "TP1") artistParts = artistParts || textFrame(data);
        else if (id === "TALB" || id === "TAL") albumParts = albumParts || textFrame(data);
        else if (id === "APIC" || id === "PIC") {
          const pic = pictureFrame(data, id === "PIC");
          if (pic) pictures.push(pic);
        }
      }
      pos = stop;
    }

    result.title = titleParts && titleParts.length ? titleParts[0] : "";
    result.artist = artistParts && artistParts.length ? artistParts.join(", ") : "";
    result.album = albumParts && albumParts.length ? albumParts[0] : "";
    // ưu tiên ảnh "bìa trước" (loại 3), không có thì lấy ảnh đầu tiên
    result.picture = pictures.find((p) => p.type === 3) || pictures[0] || null;
    return result;
  }

  /** Đọc thẻ từ File/Blob — chỉ tải phần đầu file chứa thẻ */
  async function readFile(file) {
    if (!file || typeof file.slice !== "function") return null;
    const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    const total = tagLength(head);
    if (!total || total > MAX_TAG_BYTES) return null;
    const bytes = new Uint8Array(await file.slice(0, Math.min(total, file.size)).arrayBuffer());
    return parse(bytes);
  }

  /** "Tên bài - Ca sĩ.mp3" → { title, artist }; không đúng dạng → cả tên là tên bài */
  function fromFileName(name) {
    let base = String(name || "").split(/[\\/]/).pop() || "";
    base = base.replace(/\.[A-Za-z0-9]{1,5}$/, "");
    try { base = base.normalize("NFC"); } catch { /* bỏ qua */ }
    if (!/\s/.test(base) && /_/.test(base)) base = base.replace(/_+/g, " ");
    base = base.replace(/\s+/g, " ").trim();
    const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(base);
    if (m) return { title: m[1].trim(), artist: m[2].trim() };
    return { title: base, artist: "" };
  }

  return Object.freeze({ parse, readFile, tagLength, fromFileName });
});
