/**
 * server.js — backend nhỏ cho website profile
 * ------------------------------------------------------------
 *  KHÔNG cần cài thư viện gì (chỉ dùng Node.js có sẵn, bản 18 trở lên).
 *  Chạy:  node server.js        (cấu hình trong file .env — xem .env.example)
 *
 *  - Phục vụ các file tĩnh trong thư mục public/  (hỗ trợ tua nhạc / Range)
 *  - GET  /site-content.js               : nội dung admin đã lưu, dạng script  window.SITE_CONTENT = {...}
 *  - GET  /api/content                   : nội dung admin đã lưu, dạng JSON
 *  - GET  /media/<id>.<ext>              : ảnh / nhạc admin đã tải lên (hỗ trợ tua / Range)
 *  - POST /api/letters                   : người xem gửi thư cho admin (có tên hoặc ẩn danh)
 *  - GET/POST /api/visit                 : đếm lượt ghé thăm
 *  - POST /api/admin/login               : admin đăng nhập bằng mật khẩu → nhận token
 *  - GET  /api/admin/me                  : kiểm tra token còn hạn không
 *  - GET  /api/admin/letters             : admin xem danh sách thư (cần token)
 *  - PATCH/DELETE /api/admin/letters/:id : đánh dấu đã đọc / xoá thư (cần token)
 *  - PUT  /api/admin/content             : lưu hồ sơ / danh sách nhạc / trang sách / linh vật (cần token)
 *  - POST /api/admin/upload?kind=image|audio : tải ảnh / nhạc lên — gửi thẳng byte của file (cần token)
 *  - GET  /api/admin/media               : thư viện file đã tải lên (cần token)
 *  - DELETE /api/admin/media/:id         : xoá file đã tải lên, ?force=1 để xoá cả khi đang dùng (cần token)
 *
 *  Dữ liệu lưu trong thư mục DATA_DIR (mặc định data/): letters.json, stats.json, content.json, media.json,
 *  file tải lên nằm trong DATA_DIR/uploads/ — không cần database.
 *  Nếu đặt UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN thì lưu tất cả (kể cả file tải lên) trên Upstash Redis.
 *  Thư KHÔNG bao giờ được trả về cho người xem thường, chỉ admin có token mới đọc được.
 */
"use strict";

const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { Readable } = require("stream");

/* ---------- Đọc file .env (không cần thư viện ngoài) ---------- */
function loadEnv(file) {
  try {
    for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* không có file .env cũng không sao */
  }
}
loadEnv(path.join(__dirname, ".env"));

/* ---------- Cấu hình ---------- */
const positive = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const SESSION_HOURS = Number(process.env.SESSION_HOURS) || 12;
const MAX_MESSAGE_LENGTH = Number(process.env.MAX_MESSAGE_LENGTH) || 1000;
const MAX_NAME_LENGTH = 50;
const MAX_BODY_BYTES = 20 * 1024; // thư gửi admin
const MAX_CONTENT_BYTES = 512 * 1024; // nội dung trang (hồ sơ, nhạc, trang sách…)
const TRUST_PROXY = String(process.env.TRUST_PROXY ?? "false").toLowerCase() === "true";
const DATA_DIR = path.resolve(__dirname, process.env.DATA_DIR || "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const PUBLIC_DIR = path.join(__dirname, "public");
// Giới hạn dung lượng file tải lên (MB)
const MAX_IMAGE_MB = positive(process.env.MAX_IMAGE_MB, 10);
const MAX_AUDIO_MB = positive(process.env.MAX_AUDIO_MB, 30);
const UPLOAD_LIMITS = {
  image: Math.floor(MAX_IMAGE_MB * 1024 * 1024),
  audio: Math.floor(MAX_AUDIO_MB * 1024 * 1024),
};
const UNUSED_UPLOAD_MS = 24 * 3600 * 1000; // file tải lên mà không dùng tới quá 24 giờ thì tự xoá
// Lưu trữ ngoài (tuỳ chọn): Upstash Redis — dùng khi host có ổ đĩa tạm (Render / Railway gói miễn phí)
const UPSTASH_URL = (process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/+$/, "");
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const KEY_PREFIX = process.env.STORAGE_PREFIX || "profile";

let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
if (!ADMIN_PASSWORD) {
  ADMIN_PASSWORD = "admin123";
  console.warn("  Chưa đặt ADMIN_PASSWORD trong file .env → đang dùng mật khẩu mặc định 'admin123'.");
  console.warn("   Hãy copy .env.example thành .env và đổi mật khẩu TRƯỚC KHI đưa web lên mạng!");
}

// Đường dẫn gọn để in ra màn hình: "data/uploads" nếu nằm trong thư mục dự án, còn lại để nguyên
function shortPath(p) {
  const rel = path.relative(__dirname, p);
  const shown = rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel : p;
  return shown.split(path.sep).join("/");
}

/* ---------- Loại file được phép tải lên (quyết định bằng cách dò byte đầu file) ---------- */
const MEDIA_TYPES = {
  jpg: { kind: "image", type: "image/jpeg" },
  png: { kind: "image", type: "image/png" },
  gif: { kind: "image", type: "image/gif" },
  webp: { kind: "image", type: "image/webp" },
  avif: { kind: "image", type: "image/avif" },
  mp3: { kind: "audio", type: "audio/mpeg" },
  aac: { kind: "audio", type: "audio/aac" },
  m4a: { kind: "audio", type: "audio/mp4" },
  ogg: { kind: "audio", type: "audio/ogg" },
  wav: { kind: "audio", type: "audio/wav" },
  flac: { kind: "audio", type: "audio/flac" },
  webm: { kind: "audio", type: "audio/webm" },
};
const SNIFF_BYTES = 16;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const M4A_BRANDS = new Set(["M4A ", "M4B ", "mp42", "isom", "iso2", "mp41", "dash"]);

// Trả về phần mở rộng (jpg, png, mp3…) hoặc null nếu không nhận ra — KHÔNG tin Content-Type của trình duyệt
function sniffMedia(buf) {
  const at = (offset, text) =>
    buf.length >= offset + text.length && buf.toString("latin1", offset, offset + text.length) === text;
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) return "png";
  if (at(0, "GIF87a") || at(0, "GIF89a")) return "gif";
  if (at(0, "RIFF") && at(8, "WEBP")) return "webp";
  if (at(0, "RIFF") && at(8, "WAVE")) return "wav";
  if (at(4, "ftyp") && buf.length >= 12) {
    const brand = buf.toString("latin1", 8, 12);
    if (brand === "avif" || brand === "avis") return "avif";
    if (M4A_BRANDS.has(brand)) return "m4a";
    return null;
  }
  if (at(0, "OggS")) return "ogg";
  if (at(0, "fLaC")) return "flac";
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "webm";
  if (at(0, "ID3")) return "mp3";
  if (buf.length >= 2 && buf[0] === 0xff) {
    if ((buf[1] & 0xf6) === 0xf0) return "aac"; // ADTS
    if ((buf[1] & 0xe0) === 0xe0) return "mp3"; // khung MPEG audio (FF Ex / FF Fx)
  }
  return null;
}

/* ---------- Bộ nhớ đệm file (Upstash): giữ các file hay xem trong RAM, tối đa ~64 MB ---------- */
class LruCache {
  constructor(maxBytes) {
    this.max = maxBytes;
    this.bytes = 0;
    this.map = new Map();
  }
  get(key) {
    const buf = this.map.get(key);
    if (buf) { // đưa lên cuối = mới dùng
      this.map.delete(key);
      this.map.set(key, buf);
    }
    return buf;
  }
  set(key, buf) {
    this.delete(key);
    if (buf.length > this.max) return;
    this.map.set(key, buf);
    this.bytes += buf.length;
    for (const [k, v] of this.map) {
      if (this.bytes <= this.max) break;
      this.map.delete(k);
      this.bytes -= v.length;
    }
  }
  delete(key) {
    const buf = this.map.get(key);
    if (!buf) return;
    this.map.delete(key);
    this.bytes -= buf.length;
  }
}

/* ---------- Lưu trữ ----------
 *  Mặc định: file JSON trong thư mục DATA_DIR (chạy trên máy / VPS), file tải lên trong DATA_DIR/uploads/.
 *  Nếu đặt UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN: lưu trên Upstash Redis (miễn phí),
 *  dùng cho các host có ổ đĩa tạm như Render / Railway — dữ liệu không mất khi server khởi động lại.
 *  Cả hai cùng giao diện:
 *    read(key, fallback) / write(key, data)   key: "letters", "stats", "content", "media"
 *    blobWriter(id, ext) → { write(buf), finish() → thông tin thêm cho media.json, abort() }
 *    getBlob(media, { data }) → { size, stream(start, end) } | null      deleteBlob(media)
 */
const fileStore = {
  name: `file (${shortPath(DATA_DIR)}/*.json)`,
  uploads: shortPath(UPLOAD_DIR),
  path: (key) => path.join(DATA_DIR, `${key}.json`),
  async read(key, fallback) {
    try {
      return JSON.parse(await fsp.readFile(this.path(key), "utf8"));
    } catch (err) {
      if (err.code === "ENOENT") return fallback;
      throw err;
    }
  },
  async write(key, data) {
    const file = this.path(key);
    const tmp = `${file}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await fsp.rename(tmp, file); // ghi file tạm rồi đổi tên → không bao giờ bị file hỏng dở
  },

  /* --- file tải lên: DATA_DIR/uploads/<id>.<ext> --- */
  blobFile: (m) => path.join(UPLOAD_DIR, `${m.id}.${m.ext}`),
  // Ghi dần từng đoạn vào <id>.part (không giữ cả file trong RAM), xong mới đổi tên thành <id>.<ext>
  blobWriter(id, ext) {
    const part = path.join(UPLOAD_DIR, `${id}.part`);
    let opening = null;
    let aborted = false;
    const open = () =>
      opening || (opening = fsp.mkdir(UPLOAD_DIR, { recursive: true }).then(() => fsp.open(part, "wx")));
    return {
      async write(buf) {
        const handle = await open();
        if (aborted) throw new Error("Tải lên đã bị huỷ");
        let offset = 0;
        while (offset < buf.length) {
          const { bytesWritten } = await handle.write(buf, offset, buf.length - offset);
          offset += bytesWritten;
        }
      },
      async finish() {
        const handle = await open();
        await handle.close();
        await fsp.rename(part, path.join(UPLOAD_DIR, `${id}.${ext}`));
        return {};
      },
      async abort() {
        aborted = true;
        // đợi mở file xong (nếu đang mở) rồi mới đóng + xoá → không sót file .part
        const handle = opening && (await opening.catch(() => null));
        if (handle) await handle.close().catch(() => {});
        await fsp.unlink(part).catch(() => {});
      },
    };
  },
  async getBlob(m) {
    const file = this.blobFile(m);
    const st = await fsp.stat(file).catch(() => null);
    if (!st || !st.isFile()) return null;
    return { size: st.size, stream: (start, end) => fs.createReadStream(file, { start, end }) };
  },
  async deleteBlob(m) {
    await fsp.unlink(this.blobFile(m)).catch((err) => {
      if (err.code !== "ENOENT") throw err;
    });
  },
  // Xoá các file .part bị bỏ dở (server tắt giữa chừng) đã quá 1 giờ
  async cleanupUploads() {
    let names;
    try {
      names = await fsp.readdir(UPLOAD_DIR);
    } catch (err) {
      if (err.code === "ENOENT") return 0;
      throw err;
    }
    let removed = 0;
    for (const name of names) {
      if (!/^[a-f0-9]{24}\.part$/.test(name)) continue;
      const file = path.join(UPLOAD_DIR, name);
      const st = await fsp.stat(file).catch(() => null);
      if (!st || Date.now() - st.mtimeMs < 3600 * 1000) continue;
      await fsp.unlink(file).then(() => { removed += 1; }, () => {});
    }
    return removed;
  },
};

const BLOB_CHUNK_BYTES = 1024 * 1024; // mỗi khoá Redis giữ 1 MB dữ liệu gốc (base64)
const blobCache = new LruCache(64 * 1024 * 1024);
const blobLoading = new Map(); // id → Promise<Buffer|null> (tránh tải trùng khi nhiều người cùng xem)

const upstashStore = {
  name: "Upstash Redis",
  uploads: `Upstash Redis (khoá ${KEY_PREFIX}:blob:*)`,
  async command(...args) {
    const res = await fetch(UPSTASH_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(`Upstash: ${data.error || `HTTP ${res.status}`}`);
    return data.result;
  },
  async read(key, fallback) {
    const raw = await this.command("GET", `${KEY_PREFIX}:${key}`);
    if (raw === null || raw === undefined || raw === "") return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  async write(key, data) {
    await this.command("SET", `${KEY_PREFIX}:${key}`, JSON.stringify(data));
  },

  /* --- file tải lên: <prefix>:blob:<id>:<n>, mỗi khoá 1 MB (base64) --- */
  blobKey: (id, n) => `${KEY_PREFIX}:blob:${id}:${n}`,
  blobChunks: (m) => m.chunks || Math.max(1, Math.ceil((m.size || 0) / BLOB_CHUNK_BYTES)),
  // Redis không ghi dần được nên gom vào RAM (đã bị chặn bởi giới hạn dung lượng) rồi cắt thành từng khúc 1 MB
  blobWriter(id) {
    let parts = [];
    return {
      async write(buf) {
        parts.push(buf);
      },
      async finish() {
        const data = Buffer.concat(parts);
        parts = [];
        const chunks = Math.max(1, Math.ceil(data.length / BLOB_CHUNK_BYTES));
        try {
          for (let n = 0; n < chunks; n++) {
            const piece = data.subarray(n * BLOB_CHUNK_BYTES, (n + 1) * BLOB_CHUNK_BYTES);
            await upstashStore.command("SET", upstashStore.blobKey(id, n), piece.toString("base64"));
          }
        } catch (err) {
          await upstashStore.deleteBlob({ id, chunks }).catch(() => {});
          throw err;
        }
        blobCache.set(id, data);
        return { chunks };
      },
      async abort() {
        parts = [];
      },
    };
  },
  async loadBlob(m) {
    const cached = blobCache.get(m.id);
    if (cached) return cached;
    if (blobLoading.has(m.id)) return blobLoading.get(m.id);
    const job = (async () => {
      const count = this.blobChunks(m);
      const pieces = new Array(count);
      let next = 0;
      let missing = false;
      const worker = async () => {
        while (next < count && !missing) {
          const n = next++;
          const raw = await this.command("GET", this.blobKey(m.id, n));
          if (typeof raw !== "string") missing = true;
          else pieces[n] = Buffer.from(raw, "base64");
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, count) }, worker));
      if (missing) return null;
      const data = Buffer.concat(pieces);
      if (data.length !== m.size) {
        console.warn(`⚠️  File ${m.id} trên Upstash bị thiếu dữ liệu (${data.length}/${m.size} byte).`);
        return null;
      }
      blobCache.set(m.id, data);
      return data;
    })().finally(() => blobLoading.delete(m.id));
    blobLoading.set(m.id, job);
    return job;
  },
  async getBlob(m, { data = true } = {}) {
    if (!data) return { size: m.size, stream: null }; // HEAD / 304: không cần tải dữ liệu
    const buf = await this.loadBlob(m);
    if (!buf) return null;
    return { size: buf.length, stream: (start, end) => Readable.from([buf.subarray(start, end + 1)], { objectMode: false }) };
  },
  async deleteBlob(m) {
    blobCache.delete(m.id);
    const keys = Array.from({ length: this.blobChunks(m) }, (_, n) => this.blobKey(m.id, n));
    await this.command("DEL", ...keys);
  },
  async cleanupUploads() {
    return 0;
  },
};

const store = UPSTASH_URL && UPSTASH_TOKEN ? upstashStore : fileStore;
if (store === fileStore) fs.mkdirSync(DATA_DIR, { recursive: true });
const readJson = (key, fallback) => store.read(key, fallback);
const writeJson = (key, data) => store.write(key, data);
// Các thao tác ghi chạy tuần tự để không ghi đè lẫn nhau
let queue = Promise.resolve();
function withLock(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

/* ============================================================
 *  NỘI DUNG TRANG (content) — chuẩn hoá dữ liệu admin gửi lên
 *  Hàm thuần (không đọc/ghi gì): normalizeContent(doc), normalizeSection(key, value)
 * ============================================================ */
const SECTIONS = ["profile", "songs", "pages", "mascot"];
const SECTION_LABELS = { profile: "hồ sơ", songs: "danh sách nhạc", pages: "trang sách", mascot: "linh vật" };
const MAX_URL_LENGTH = 2048;
const MEDIA_URL_RE = /^media\/[a-f0-9]{24}\.(jpg|png|gif|webp|avif|mp3|m4a|ogg|oga|wav|flac|aac|webm)$/;
const ASSET_URL_RE = /^assets\/[^<>"'\\\u0000-\u001f]+$/;
const EXTERNAL_URL_RE = /^https?:\/\/[^\s<>"']+$/i;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ALIGN = ["left", "center", "right"];

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Chuỗi: bỏ ký tự điều khiển, cắt khoảng trắng 2 đầu, cắt bớt theo giới hạn (không cắt đôi emoji)
function cleanText(value, max) {
  if (typeof value !== "string") return "";
  let s = value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  if (s.length > max) {
    s = s.slice(0, max);
    if (/[\ud800-\udbff]$/.test(s)) s = s.slice(0, -1);
    s = s.trimEnd();
  }
  return s;
}
const pickEnum = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return NaN;
}
const pickNumber = (value, allowed, fallback) => {
  const n = toNumber(value);
  return allowed.includes(n) ? n : fallback;
};
function clampInt(value, min, max, fallback) {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
function toBool(value) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return undefined;
}
const flag = (value) => toBool(value) === true;

// Url hợp lệ: "" | media/<id>.<ext> (file đã tải lên) | assets/… (file có sẵn) | http(s)://…  — sai thì trả về ""
function normalizeUrl(value) {
  if (typeof value !== "string") return "";
  const url = value.trim();
  if (!url || url.length > MAX_URL_LENGTH) return "";
  if (MEDIA_URL_RE.test(url)) return url;
  if (ASSET_URL_RE.test(url)) {
    const climbs = url.split("/").some((seg) => seg.replace(/%2e/gi, ".") === "..");
    return climbs ? "" : url;
  }
  return EXTERNAL_URL_RE.test(url) ? url : "";
}

const newId = () => crypto.randomUUID().slice(0, 8);
// id giữ nguyên nếu hợp lệ và chưa trùng, ngược lại tạo id mới
function cleanId(value, used) {
  let id = typeof value === "number" && Number.isInteger(value) ? String(value) : value;
  id = typeof id === "string" && ID_RE.test(id.trim()) ? id.trim() : "";
  while (!id || used.has(id)) id = newId();
  used.add(id);
  return id;
}

function normalizeProfile(p) {
  if (!isPlainObject(p)) return undefined;
  const out = {};
  for (const [key, max] of [["name", 60], ["username", 60], ["bio", 500]]) {
    if (hasOwn(p, key) && typeof p[key] === "string") out[key] = cleanText(p[key], max);
  }
  if (hasOwn(p, "avatar") && typeof p.avatar === "string") out.avatar = normalizeUrl(p.avatar);
  if (hasOwn(p, "ribbon") && typeof p.ribbon === "string") out.ribbon = cleanText(p.ribbon, 24);
  if (hasOwn(p, "verified") && toBool(p.verified) !== undefined) out.verified = toBool(p.verified);
  return out;
}

function normalizeSong(s, usedIds) {
  if (!isPlainObject(s)) return null;
  const src = normalizeUrl(s.src);
  if (!src) return null; // bài không có file nhạc thì bỏ
  return {
    id: cleanId(s.id, usedIds),
    title: cleanText(s.title, 120),
    artist: cleanText(s.artist, 120),
    src,
    cover: normalizeUrl(s.cover),
  };
}

function normalizeGalleryImage(img) {
  if (!isPlainObject(img)) return null;
  return { src: normalizeUrl(img.src), alt: cleanText(img.alt, 200), caption: cleanText(img.caption, 300) };
}

const BLOCK_NORMALIZERS = {
  heading: (b) => ({
    text: cleanText(b.text, 200),
    level: pickNumber(b.level, [1, 2, 3], 2),
    align: pickEnum(b.align, ALIGN, "center"),
  }),
  text: (b) => ({
    text: cleanText(b.text, 5000),
    align: pickEnum(b.align, ["left", "center", "right", "justify"], "left"),
    size: pickEnum(b.size, ["sm", "md", "lg"], "md"),
    italic: flag(b.italic),
    dropcap: flag(b.dropcap),
  }),
  image: (b) => ({
    src: normalizeUrl(b.src),
    alt: cleanText(b.alt, 200),
    caption: cleanText(b.caption, 300),
    align: pickEnum(b.align, ALIGN, "left"),
    width: clampInt(b.width, 20, 100, 100),
    wrap: flag(b.wrap),
    frame: pickEnum(b.frame, ["none", "frame", "round", "circle", "polaroid"], "none"),
    tilt: clampInt(b.tilt, -8, 8, 0),
  }),
  gallery: (b) => ({
    images: (Array.isArray(b.images) ? b.images : []).map(normalizeGalleryImage).filter(Boolean).slice(0, 12),
    columns: pickNumber(b.columns, [2, 3, 4], 2),
    frame: pickEnum(b.frame, ["none", "frame", "round", "polaroid"], "none"),
  }),
  quote: (b) => ({
    text: cleanText(b.text, 1000),
    cite: cleanText(b.cite, 120),
    align: pickEnum(b.align, ALIGN, "left"),
  }),
  divider: (b) => ({ style: pickEnum(b.style, ["ornament", "line", "dots"], "ornament") }),
  spacer: (b) => ({ size: pickEnum(b.size, ["sm", "md", "lg"], "md") }),
};

function normalizeBlock(b, usedIds) {
  if (!isPlainObject(b) || typeof b.type !== "string" || !hasOwn(BLOCK_NORMALIZERS, b.type)) return null;
  const id = cleanId(b.id, usedIds);
  return { id, type: b.type, ...BLOCK_NORMALIZERS[b.type](b) };
}

function normalizePage(p, usedPageIds, usedBlockIds) {
  if (!isPlainObject(p)) return null;
  const id = cleanId(p.id, usedPageIds);
  const blocks = (Array.isArray(p.blocks) ? p.blocks : [])
    .map((b) => normalizeBlock(b, usedBlockIds))
    .filter(Boolean)
    .slice(0, 60);
  return { id, blocks };
}

function normalizeMascot(m) {
  if (!isPlainObject(m)) return undefined;
  const out = {};
  if (hasOwn(m, "enabled") && toBool(m.enabled) !== undefined) out.enabled = toBool(m.enabled);
  if (typeof m.name === "string" && cleanText(m.name, 30)) out.name = cleanText(m.name, 30);
  if (typeof m.color === "string" && /^#[0-9a-f]{6}$/i.test(m.color.trim())) out.color = m.color.trim().toLowerCase();
  if (Array.isArray(m.messages)) {
    out.messages = m.messages.map((s) => cleanText(s, 120)).filter(Boolean).slice(0, 30);
  }
  return out;
}

// Chuẩn hoá 1 mục. Trả về: giá trị đã chuẩn hoá | null (xoá mục) | undefined (sai kiểu → báo lỗi)
function normalizeSection(key, value) {
  if (value === null) return null;
  switch (key) {
    case "profile":
      return normalizeProfile(value);
    case "songs": {
      if (!Array.isArray(value)) return undefined;
      const ids = new Set();
      return value.map((s) => normalizeSong(s, ids)).filter(Boolean).slice(0, 100);
    }
    case "pages": {
      if (!Array.isArray(value)) return undefined;
      const pageIds = new Set();
      const blockIds = new Set();
      return value.map((p) => normalizePage(p, pageIds, blockIds)).filter(Boolean).slice(0, 20);
    }
    case "mascot":
      return normalizeMascot(value);
    default:
      return undefined;
  }
}

// Chuẩn hoá cả tài liệu (dùng khi đọc từ kho lưu trữ). Không phải object → null
function normalizeContent(raw) {
  if (!isPlainObject(raw)) return null;
  const updatedAt =
    typeof raw.updatedAt === "string" && !Number.isNaN(Date.parse(raw.updatedAt)) ? raw.updatedAt : new Date().toISOString();
  const out = { version: 1, updatedAt };
  for (const key of SECTIONS) {
    if (!hasOwn(raw, key)) continue;
    const value = normalizeSection(key, raw[key]);
    if (value !== null && value !== undefined) out[key] = value;
  }
  return out;
}

// JSON nhúng được an toàn vào <script> / file .js
function scriptSafeJson(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}

/* ---------- Bộ nhớ đệm nội dung + danh sách file tải lên (đọc 1 lần, ghi thì cập nhật) ----------
 *  Giá trị trả về dùng chung — KHÔNG sửa trực tiếp, luôn tạo object / mảng mới rồi lưu. */
let contentMemo = null;
let contentGen = 0; // tăng mỗi lần lưu → script /site-content.js cũ bị bỏ
let siteScript = null; // { body, etag }
function getContent() {
  if (!contentMemo) {
    const p = store.read("content", null).then(normalizeContent).catch((err) => {
      if (contentMemo === p) contentMemo = null;
      throw err;
    });
    contentMemo = p;
  }
  return contentMemo;
}
async function saveContent(doc) {
  await writeJson("content", doc);
  contentMemo = Promise.resolve(doc);
  contentGen += 1;
  siteScript = null;
}

const isMediaEntry = (m) =>
  isPlainObject(m) && /^[a-f0-9]{24}$/.test(m.id) && hasOwn(MEDIA_TYPES, m.ext) && Number.isFinite(m.size);
let mediaMemo = null;
function getMediaIndex() {
  if (!mediaMemo) {
    const p = store.read("media", []).then((list) => (Array.isArray(list) ? list.filter(isMediaEntry) : [])).catch((err) => {
      if (mediaMemo === p) mediaMemo = null;
      throw err;
    });
    mediaMemo = p;
  }
  return mediaMemo;
}
async function saveMediaIndex(list) {
  await writeJson("media", list);
  mediaMemo = Promise.resolve(list);
}

const mediaKey = (m) => `${m.id}.${m.ext}`;
const publicMedia = (m) => ({
  id: m.id,
  url: `media/${m.id}.${m.ext}`,
  kind: m.kind,
  type: m.type,
  ext: m.ext,
  size: m.size,
  name: m.name,
  createdAt: m.createdAt,
});
// Các file "media/<id>.<ext>" xuất hiện ở bất kỳ đâu trong nội dung
function mediaRefs(content) {
  const refs = new Set();
  if (!content) return refs;
  for (const m of JSON.stringify(content).matchAll(/media\/([a-f0-9]{24})\.([a-z0-9]+)/g)) refs.add(`${m[1]}.${m[2]}`);
  return refs;
}
// Dọn rác: file vừa bị gỡ khỏi nội dung, hoặc tải lên quá 24 giờ mà không được dùng
function planGarbage(media, oldContent, newContent, now = Date.now()) {
  const oldRefs = mediaRefs(oldContent);
  const newRefs = mediaRefs(newContent);
  return media.filter((m) => {
    const key = mediaKey(m);
    if (newRefs.has(key)) return false;
    if (oldRefs.has(key)) return true;
    return now - Date.parse(m.createdAt) > UNUSED_UPLOAD_MS;
  });
}
// Gọi bên trong withLock
async function collectGarbage(oldContent, newContent) {
  const media = await getMediaIndex();
  const drop = planGarbage(media, oldContent, newContent);
  if (!drop.length) return 0;
  const removed = new Set();
  for (const m of drop) {
    try {
      await store.deleteBlob(m);
      removed.add(m.id);
    } catch (err) {
      console.warn(`⚠️  Không xoá được file ${mediaKey(m)}: ${err.message}`);
    }
  }
  if (removed.size) await saveMediaIndex(media.filter((m) => !removed.has(m.id)));
  return removed.size;
}

/* ---------- Tiện ích HTTP ---------- */
class HttpError extends Error {
  constructor(status, message, headers) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

function sendJson(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

function sendText(res, status, text, headers = {}) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Content-Length": Buffer.byteLength(text), ...headers });
  res.end(text);
}

// Đọc body JSON, tối đa `limit` byte (thư: 20 KB, nội dung trang: 512 KB)
function readJsonBody(req, limit = MAX_BODY_BYTES, tooLargeMessage = "Dữ liệu gửi lên quá lớn") {
  return new Promise((resolve, reject) => {
    if (Number(req.headers["content-length"]) > limit) return reject(new HttpError(413, tooLargeMessage));
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on("data", (chunk) => {
      if (failed) return; // đã báo lỗi: phần còn lại bỏ qua
      size += chunk.length;
      if (size > limit) {
        failed = true;
        chunks.length = 0;
        reject(new HttpError(413, tooLargeMessage));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (failed) return;
      if (!chunks.length) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        resolve(parsed && typeof parsed === "object" ? parsed : {});
      } catch {
        reject(new HttpError(400, "Dữ liệu gửi lên không hợp lệ"));
      }
    });
    req.on("error", () => reject(new HttpError(400, "Lỗi đọc dữ liệu")));
  });
}

const formatMb = (mb) => `${Number(mb.toFixed(3))} MB`;
const tooBigError = (kind) =>
  new HttpError(413, kind === "image" ? `Ảnh quá lớn (tối đa ${formatMb(MAX_IMAGE_MB)})` : `File nhạc quá lớn (tối đa ${formatMb(MAX_AUDIO_MB)})`);

/* Nhận file tải lên (body là byte thô của file, không phải multipart):
 *  - dò loại file từ ~16 byte đầu, sai loại → 415 (chưa ghi gì)
 *  - vượt giới hạn → 413, dừng nhận và xoá phần đã ghi
 *  - người dùng huỷ / mất mạng giữa chừng → xoá phần đã ghi */
function receiveUpload(req, { kind, limit, id }) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let head = [];
    let headLength = 0;
    let ext = null;
    let sink = null;
    let done = false;
    let chain = Promise.resolve();

    const detach = () => {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("close", onClose);
    };
    const fail = (err) => {
      if (done) return;
      done = true;
      detach();
      req.resume(); // phần còn lại đọc rồi bỏ, không ghi
      const s = sink;
      sink = null;
      Promise.resolve(s && s.abort()).catch(() => {}).then(() => reject(err));
    };
    // Các bước chạy lần lượt (ghi xong khúc này mới nhận khúc tiếp)
    const run = (step) => {
      chain = chain.then(() => (done ? undefined : step())).catch(fail);
    };
    const start = async (buf) => {
      ext = sniffMedia(buf);
      if (!ext) {
        throw new HttpError(415, "Định dạng file không được hỗ trợ. Ảnh: JPG, PNG, GIF, WebP, AVIF. Nhạc: MP3, M4A, AAC, OGG, WAV, FLAC, WebM.");
      }
      if (MEDIA_TYPES[ext].kind !== kind) {
        throw new HttpError(415, kind === "image" ? "File này không phải ảnh" : "File này không phải file nhạc");
      }
      sink = store.blobWriter(id, ext);
      await sink.write(buf);
    };

    function onData(chunk) {
      req.pause();
      run(async () => {
        size += chunk.length;
        if (size > limit) throw tooBigError(kind);
        if (sink) {
          await sink.write(chunk);
        } else {
          head.push(chunk);
          headLength += chunk.length;
          if (headLength >= SNIFF_BYTES) {
            const buf = Buffer.concat(head);
            head = null;
            await start(buf);
          }
        }
        if (!done) req.resume();
      });
    }
    function onEnd() {
      run(async () => {
        if (!sink) {
          if (!headLength) throw new HttpError(400, "File rỗng");
          await start(Buffer.concat(head));
          head = null;
        }
        const extra = await sink.finish();
        done = true;
        detach();
        resolve({ ext, size, extra: extra || {} });
      });
    }
    function onClose() {
      if (!req.complete) fail(new HttpError(400, "Tải lên bị gián đoạn"));
    }

    req.on("error", () => {}); // lỗi kết nối được xử lý ở "close"
    req.on("data", onData);
    req.on("end", onEnd);
    req.on("close", onClose);
  });
}

// Tên file gốc (header X-File-Name, đã encodeURIComponent) — chỉ để hiển thị trong thư viện
function uploadName(header, fallback) {
  let name = typeof header === "string" ? header : "";
  try {
    name = decodeURIComponent(name);
  } catch {
    /* giữ nguyên */
  }
  return cleanText(name.split(/[\\/]/).pop() || "", 200) || fallback;
}

/* Range: "bytes=0-99", "bytes=100-", "bytes=-100".
 * Trả về null (gửi cả file), { start, end } (206) hoặc false (416 — ngoài phạm vi) */
function parseRange(header, size) {
  if (!header || size <= 0) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start;
  let end = size - 1;
  if (m[1] === "") { // bytes=-N → N byte cuối
    start = Math.max(size - Number(m[2]), 0);
  } else {
    start = Number(m[1]);
    if (m[2] !== "") end = Math.min(Number(m[2]), size - 1);
  }
  if (start > end || start >= size) return false;
  return { start, end };
}

function clientIp(req) {
  if (TRUST_PROXY) {
    // Lấy IP cuối cùng (do proxy tin cậy nối thêm), không lấy IP đầu vì người gửi tự đặt được
    const fwd = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (fwd.length) return fwd[fwd.length - 1];
  }
  return req.socket.remoteAddress || "unknown";
}

/* ---------- Giới hạn số lần gọi (chống spam) ---------- */
function rateLimit({ windowMs, max, message }) {
  const hits = new Map();
  return (req) => {
    const now = Date.now();
    const key = clientIp(req);
    let entry = hits.get(key);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
    // Vẫn quá nhiều thì bỏ bớt các mục cũ nhất để bộ nhớ không phình mãi
    if (hits.size > 10000) for (const k of hits.keys()) { if (hits.size <= 5000) break; if (k !== key) hits.delete(k); }
    if (entry.count > max) {
      throw new HttpError(429, message, { "Retry-After": String(Math.ceil((entry.reset - now) / 1000)) });
    }
  };
}
const limitLetters = rateLimit({ windowMs: 10 * 60 * 1000, max: 5, message: "Bạn gửi hơi nhanh, đợi một chút rồi gửi tiếp nhé" });
const limitLogin = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: "Sai mật khẩu quá nhiều lần, thử lại sau 15 phút" });
const limitVisit = rateLimit({ windowMs: 60 * 1000, max: 20, message: "Thử lại sau nhé" });
// Giới hạn chung số lần sai mật khẩu (mọi IP cộng lại) — chống dò mật khẩu bằng cách đổi IP liên tục
const LOGIN_FAIL_WINDOW = 15 * 60 * 1000;
const LOGIN_FAIL_MAX = 50;
const loginFails = { count: 0, reset: 0 };
function checkLoginFails() {
  const now = Date.now();
  if (loginFails.reset <= now) { loginFails.count = 0; loginFails.reset = now + LOGIN_FAIL_WINDOW; }
  if (loginFails.count >= LOGIN_FAIL_MAX) {
    throw new HttpError(429, "Sai mật khẩu quá nhiều lần, thử lại sau 15 phút", { "Retry-After": String(Math.ceil((loginFails.reset - now) / 1000)) });
  }
}

/* ---------- Phiên đăng nhập admin (token lưu trong RAM) ---------- */
const sessions = new Map(); // token → thời điểm hết hạn
function createSession() {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + SESSION_HOURS * 3600 * 1000);
  return token;
}
setInterval(() => {
  const now = Date.now();
  for (const [t, exp] of sessions) if (exp <= now) sessions.delete(t);
}, 60 * 60 * 1000).unref();

function requireAdmin(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const exp = token ? sessions.get(token) : undefined;
  if (!exp || exp <= Date.now()) {
    if (token) sessions.delete(token);
    throw new HttpError(401, "Chưa đăng nhập hoặc phiên đã hết hạn");
  }
  return token;
}
function safeEqual(a, b) {
  const ba = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(bb, bb);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

/* ============================================================
 *  API
 * ============================================================ */
const api = {
  "GET /api/health": async () => [200, { ok: true, storage: store === upstashStore ? "upstash" : "file" }],

  /* ----- Lượt ghé thăm ----- */
  "GET /api/visit": async () => {
    const stats = await readJson("stats", { views: 0 });
    return [200, { views: stats.views || 0 }];
  },
  "POST /api/visit": async (req) => {
    limitVisit(req);
    const views = await withLock(async () => {
      const stats = await readJson("stats", { views: 0 });
      stats.views = (stats.views || 0) + 1;
      await writeJson("stats", stats);
      return stats.views;
    });
    return [200, { views }];
  },

  /* ----- Nội dung trang (công khai) ----- */
  "GET /api/content": async () => [200, { content: await getContent() }],

  /* ----- Người xem gửi thư ----- */
  "POST /api/letters": async (req) => {
    limitLetters(req);
    const body = await readJsonBody(req);
    const anonymous = body.anonymous === true || body.anonymous === "true";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const name = anonymous ? null : typeof body.name === "string" ? body.name.trim().slice(0, MAX_NAME_LENGTH) : "";

    if (!message) throw new HttpError(400, "Thư chưa có nội dung");
    if (message.length > MAX_MESSAGE_LENGTH) throw new HttpError(400, `Thư tối đa ${MAX_MESSAGE_LENGTH} ký tự`);
    if (!anonymous && !name) throw new HttpError(400, "Hãy nhập tên hoặc bật chế độ ẩn danh");

    const letter = {
      id: crypto.randomUUID(),
      name, // null nếu ẩn danh
      anonymous,
      message,
      createdAt: new Date().toISOString(),
      read: false,
    };
    await withLock(async () => {
      const letters = await readJson("letters", []);
      letters.push(letter);
      await writeJson("letters", letters);
    });
    return [201, { ok: true }];
  },

  /* ----- Admin ----- */
  "POST /api/admin/login": async (req) => {
    limitLogin(req);
    checkLoginFails();
    const body = await readJsonBody(req);
    const password = typeof body.password === "string" ? body.password : "";
    if (!password || !safeEqual(password, ADMIN_PASSWORD)) {
      loginFails.count += 1;
      throw new HttpError(401, "Sai mật khẩu");
    }
    return [200, { token: createSession(), expiresIn: SESSION_HOURS * 3600 }];
  },
  "POST /api/admin/logout": async (req) => {
    sessions.delete(requireAdmin(req));
    return [200, { ok: true }];
  },
  "GET /api/admin/me": async (req) => {
    const exp = sessions.get(requireAdmin(req));
    return [200, {
      ok: true,
      expiresAt: new Date(exp).toISOString(),
      expiresIn: Math.max(0, Math.round((exp - Date.now()) / 1000)),
      limits: { image: UPLOAD_LIMITS.image, audio: UPLOAD_LIMITS.audio }, // byte
    }];
  },
  "GET /api/admin/letters": async (req) => {
    requireAdmin(req);
    const letters = await readJson("letters", []);
    letters.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return [200, { letters, total: letters.length, unread: letters.filter((l) => !l.read).length }];
  },
  "PATCH /api/admin/letters/:id": async (req, params) => {
    requireAdmin(req);
    const body = await readJsonBody(req);
    const read = body.read !== false;
    const letter = await withLock(async () => {
      const letters = await readJson("letters", []);
      const found = letters.find((l) => l.id === params.id);
      if (!found) return null;
      found.read = read;
      await writeJson("letters", letters);
      return found;
    });
    if (!letter) throw new HttpError(404, "Không tìm thấy thư");
    return [200, { ok: true, letter }];
  },
  "DELETE /api/admin/letters/:id": async (req, params) => {
    requireAdmin(req);
    const removed = await withLock(async () => {
      const letters = await readJson("letters", []);
      const i = letters.findIndex((l) => l.id === params.id);
      if (i === -1) return false;
      letters.splice(i, 1);
      await writeJson("letters", letters);
      return true;
    });
    if (!removed) throw new HttpError(404, "Không tìm thấy thư");
    return [200, { ok: true }];
  },

  /* ----- Admin: nội dung trang ----- */
  "PUT /api/admin/content": async (req) => {
    requireAdmin(req);
    const body = await readJsonBody(req, MAX_CONTENT_BYTES, "Nội dung quá lớn (tối đa 512 KB) — hãy bớt chữ hoặc chia bớt trang");
    if (Array.isArray(body)) throw new HttpError(400, "Dữ liệu gửi lên không hợp lệ");
    // Chuẩn hoá trước khi khoá (hàm thuần); null = xoá mục đó (trang quay về mặc định trong config.js)
    const changes = {};
    for (const key of SECTIONS) {
      if (!hasOwn(body, key)) continue;
      const value = normalizeSection(key, body[key]);
      if (value === undefined) throw new HttpError(400, `Dữ liệu "${SECTION_LABELS[key]}" không hợp lệ`);
      changes[key] = value;
    }
    const content = await withLock(async () => {
      const old = await getContent();
      const next = { version: 1, updatedAt: new Date().toISOString() };
      for (const key of SECTIONS) {
        const value = hasOwn(changes, key) ? changes[key] : old ? old[key] : undefined;
        if (value !== null && value !== undefined) next[key] = value;
      }
      await saveContent(next);
      try {
        await collectGarbage(old, next);
      } catch (err) {
        console.warn(`⚠️  Dọn file không dùng bị lỗi: ${err.message}`);
      }
      return next;
    });
    return [200, { ok: true, content }];
  },

  /* ----- Admin: ảnh / nhạc tải lên ----- */
  "POST /api/admin/upload": async (req, params, query) => {
    requireAdmin(req);
    const kind = query.get("kind");
    if (kind !== "image" && kind !== "audio") throw new HttpError(400, "Thiếu loại file: ?kind=image (ảnh) hoặc ?kind=audio (nhạc)");
    const limit = UPLOAD_LIMITS[kind];
    if (Number(req.headers["content-length"]) > limit) throw tooBigError(kind);
    const id = crypto.randomBytes(12).toString("hex");
    const { ext, size, extra } = await receiveUpload(req, { kind, limit, id });
    const media = {
      id,
      url: `media/${id}.${ext}`,
      kind,
      type: MEDIA_TYPES[ext].type,
      ext,
      size,
      name: uploadName(req.headers["x-file-name"], `${id.slice(0, 8)}.${ext}`),
      createdAt: new Date().toISOString(),
      ...extra, // Upstash: số khúc dữ liệu
    };
    try {
      await withLock(async () => saveMediaIndex([...(await getMediaIndex()), media]));
    } catch (err) {
      await store.deleteBlob(media).catch(() => {});
      throw err;
    }
    return [201, { media: publicMedia(media) }];
  },
  "GET /api/admin/media": async (req) => {
    requireAdmin(req);
    const [media, content] = await Promise.all([getMediaIndex(), getContent()]);
    const refs = mediaRefs(content);
    const list = media
      .map((m) => ({ ...publicMedia(m), inUse: refs.has(mediaKey(m)) }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return [200, { media: list, totalBytes: media.reduce((sum, m) => sum + m.size, 0) }];
  },
  "DELETE /api/admin/media/:id": async (req, params, query) => {
    requireAdmin(req);
    const force = ["1", "true"].includes(query.get("force"));
    const result = await withLock(async () => {
      const media = await getMediaIndex();
      const found = media.find((m) => m.id === params.id);
      if (!found) return 404;
      if (!force && mediaRefs(await getContent()).has(mediaKey(found))) return 409;
      await store.deleteBlob(found);
      await saveMediaIndex(media.filter((m) => m.id !== found.id));
      return 200;
    });
    if (result === 404) throw new HttpError(404, "Không tìm thấy file");
    if (result === 409) throw new HttpError(409, "File đang được dùng trên trang. Hãy gỡ khỏi trang trước, hoặc chọn xoá luôn.");
    return [200, { ok: true }];
  },
};

// Biên dịch bảng route thành regex một lần
const routes = Object.entries(api).map(([key, handler]) => {
  const [method, pattern] = key.split(" ");
  const names = [];
  const regex = new RegExp(
    "^" + pattern.replace(/\/:([a-zA-Z]+)/g, (_, name) => { names.push(name); return "/([^/]+)"; }) + "/?$"
  );
  return { method, regex, names, handler };
});

async function handleApi(req, res, pathname, query) {
  for (const route of routes) {
    if (route.method !== req.method) continue;
    const m = pathname.match(route.regex);
    if (!m) continue;
    const params = {};
    try {
      route.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
    } catch {
      throw new HttpError(400, "Đường dẫn không hợp lệ");
    }
    const [status, data] = await route.handler(req, params, query);
    return sendJson(res, status, data);
  }
  sendJson(res, 404, { error: "Không tìm thấy API" });
}

/* ============================================================
 *  /site-content.js — nội dung admin đã lưu, nạp trước main.js
 * ============================================================ */
async function serveSiteContent(req, res) {
  let script = siteScript;
  if (!script) {
    const gen = contentGen;
    try {
      const content = await getContent();
      const body = `window.SITE_CONTENT = ${content ? scriptSafeJson(content) : "null"};\n`;
      script = { body, etag: `"${crypto.createHash("sha1").update(body).digest("base64url").slice(0, 27)}"` };
      if (gen === contentGen) siteScript = script;
    } catch (err) {
      // Kho lưu trữ lỗi: trang vẫn chạy với cấu hình mặc định trong config.js
      console.error(err);
      const body = "window.SITE_CONTENT = null;\n";
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store" });
      return res.end(body);
    }
  }
  const headers = { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache", ETag: script.etag };
  if (req.headers["if-none-match"] === script.etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  headers["Content-Length"] = Buffer.byteLength(script.body);
  res.writeHead(200, headers);
  res.end(req.method === "HEAD" ? undefined : script.body);
}

/* ============================================================
 *  /media/<id>.<ext> — file admin đã tải lên
 * ============================================================ */
const MEDIA_PATH_RE = /^\/media\/([a-f0-9]{24})\.([a-z0-9]{2,4})$/;
async function serveMedia(req, res, pathname) {
  const match = MEDIA_PATH_RE.exec(pathname); // chỉ nhận đúng dạng id.ext → không thể đi ra ngoài thư mục
  const media = match && (await getMediaIndex()).find((m) => m.id === match[1] && m.ext === match[2]);
  if (!media) return sendText(res, 404, "404 — Không tìm thấy file");

  const etag = `"${media.id}"`;
  const headers = {
    "Content-Type": media.type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable", // id mới cho mỗi lần tải → không bao giờ đổi nội dung
    "Content-Security-Policy": "default-src 'none'; sandbox",
    ETag: etag,
  };
  if (!Number.isNaN(Date.parse(media.createdAt))) headers["Last-Modified"] = new Date(media.createdAt).toUTCString();
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, headers);
    return res.end();
  }

  const blob = await store.getBlob(media, { data: req.method !== "HEAD" });
  if (!blob) return sendText(res, 404, "404 — Không tìm thấy file");
  const range = parseRange(req.headers.range, blob.size);
  if (range === false) {
    res.writeHead(416, { ...headers, "Content-Range": `bytes */${blob.size}` });
    return res.end();
  }
  const start = range ? range.start : 0;
  const end = range ? range.end : blob.size - 1;
  if (range) headers["Content-Range"] = `bytes ${start}-${end}/${blob.size}`;
  headers["Content-Length"] = Math.max(0, end - start + 1);
  res.writeHead(range ? 206 : 200, headers);
  if (req.method === "HEAD" || blob.size === 0) return res.end();
  const stream = blob.stream(start, end);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}

/* ============================================================
 *  FILE TĨNH (public/)
 * ============================================================ */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

async function resolveStatic(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  if (decoded === "/admin") decoded = "/admin.html";
  const safe = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  let file = path.join(PUBLIC_DIR, safe);
  if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== PUBLIC_DIR) return null; // chặn ../ thoát khỏi public/

  const candidates = [file, file + ".html", path.join(file, "index.html")];
  for (const c of candidates) {
    try {
      const st = await fsp.stat(c);
      if (st.isFile()) return { file: c, stat: st };
    } catch {
      /* thử ứng viên tiếp theo */
    }
  }
  return null;
}

async function serveStatic(req, res, pathname) {
  const found = await resolveStatic(pathname);
  if (!found) return sendText(res, 404, "404 — Không tìm thấy trang");
  const { file, stat } = found;
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  const isHtml = ext === ".html";
  const headers = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Last-Modified": stat.mtime.toUTCString(),
    "Cache-Control": isHtml || ext === ".js" || ext === ".css" ? "no-cache" : "public, max-age=86400",
  };
  if (ext === ".md" || ext === ".txt") headers["Content-Disposition"] = "inline";

  // Hỗ trợ Range để trình duyệt tua được nhạc / video
  const range = parseRange(req.headers.range, stat.size);
  if (range === false) {
    res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
    return res.end();
  }
  const start = range ? range.start : 0;
  const end = range ? range.end : stat.size - 1;
  if (range) headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
  headers["Content-Length"] = end - start + 1;
  res.writeHead(range ? 206 : 200, headers);
  if (req.method === "HEAD") return res.end();
  const stream = fs.createReadStream(file, { start, end });
  stream.on("error", () => { if (!res.headersSent) sendText(res, 500, "Lỗi đọc file"); else res.destroy(); });
  stream.pipe(res);
}

/* ============================================================
 *  SERVER
 * ============================================================ */
const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  let url;
  try {
    url = new URL(req.url, "http://localhost");
  } catch {
    return sendText(res, 400, "URL không hợp lệ");
  }
  const pathname = url.pathname;

  try {
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      await handleApi(req, res, pathname, url.searchParams);
    } else if (req.method !== "GET" && req.method !== "HEAD") {
      sendText(res, 405, "Phương thức không được hỗ trợ");
    } else if (pathname === "/site-content.js") {
      await serveSiteContent(req, res); // phải đứng trước file tĩnh
    } else if (pathname.startsWith("/media/")) {
      await serveMedia(req, res, pathname);
    } else {
      await serveStatic(req, res, pathname);
    }
  } catch (err) {
    // Lỗi khi body chưa đọc hết (file quá lớn, sai loại…): trả lời rồi đóng kết nối, phần còn lại bỏ qua
    const headers = { ...(err.headers || {}) };
    if (!req.complete) {
      headers.Connection = "close";
      req.resume();
    }
    if (res.headersSent) return res.destroy();
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message }, headers);
    console.error(err);
    sendJson(res, 500, { error: "Lỗi máy chủ" }, headers);
  }
});
server.requestTimeout = 15 * 60 * 1000; // đủ thời gian tải file nhạc lớn qua mạng chậm

/* Mở cổng. Nếu cổng bị chặn (Windows hay giữ cổng 3000: EACCES) hoặc đang bận (EADDRINUSE)
 * thì tự thử cổng kế tiếp, tối đa 10 lần, và báo rõ đang chạy ở cổng nào. */
function listen(port, triesLeft) {
  const onListening = () => {
    server.removeListener("error", onError);
    if (port !== PORT) console.log(`ℹ  Cổng ${PORT} không dùng được nên đang chạy ở cổng ${port}. Muốn cố định, đặt PORT=${port} trong file .env.`);
    console.log(` Website đang chạy:  http://localhost:${port}`);
    console.log(` Hộp thư admin:      http://localhost:${port}/admin`);
    console.log(` Lưu thư bằng:       ${store.name}`);
    console.log(` Ảnh/nhạc tải lên:   ${store.uploads} (ảnh ≤ ${formatMb(MAX_IMAGE_MB)}, nhạc ≤ ${formatMb(MAX_AUDIO_MB)})`);
    console.log("   Nhấn Ctrl + C để dừng.");
  };
  const onError = (err) => {
    server.removeListener("listening", onListening);
    if ((err.code === "EACCES" || err.code === "EADDRINUSE") && triesLeft > 0) {
      const why = err.code === "EACCES" ? "bị hệ thống chặn" : "đang bận";
      console.warn(`⚠️  Cổng ${port} ${why}, thử cổng ${port + 1}...`);
      setTimeout(() => listen(port + 1, triesLeft - 1), 150);
      return;
    }
    console.error(` Không mở được cổng ${port} (${err.code}). Hãy đặt PORT khác trong file .env, ví dụ PORT=8080`);
    process.exit(1);
  };
  server.once("listening", onListening);
  server.once("error", onError);
  server.listen(port, HOST);
}

// Khi khởi động: xoá file tải lên quá 24 giờ mà không dùng tới + file .part bị bỏ dở
async function startupCleanup() {
  try {
    const removed = await withLock(async () => {
      const content = await getContent();
      return collectGarbage(content, content);
    });
    const parts = await store.cleanupUploads();
    if (removed || parts) console.log(` Đã dọn ${removed + parts} file tải lên không còn dùng.`);
  } catch (err) {
    console.warn(`⚠️  Dọn file tải lên bị lỗi: ${err.message}`);
  }
}

if (require.main === module) {
  listen(PORT, 10);
  startupCleanup();
}

// Cho phép kiểm thử các hàm thuần: require("./server.js") không mở cổng
module.exports = { normalizeContent, normalizeSection, normalizeUrl, sniffMedia, parseRange, scriptSafeJson, planGarbage, mediaRefs, MEDIA_TYPES };
