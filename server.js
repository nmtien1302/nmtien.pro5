/**
 * server.js — backend nhỏ cho website profile
 * ------------------------------------------------------------
 *  KHÔNG cần cài thư viện gì (chỉ dùng Node.js có sẵn, bản 18 trở lên).
 *  Chạy:  node server.js
 *
 *  - Phục vụ các file tĩnh trong thư mục public/  (hỗ trợ tua nhạc / Range)
 *  - POST /api/letters                   : người xem gửi thư cho admin (có tên hoặc ẩn danh)
 *  - POST /api/admin/login               : admin đăng nhập bằng mật khẩu → nhận token
 *  - GET  /api/admin/letters             : admin xem danh sách thư (cần token)
 *  - PATCH/DELETE /api/admin/letters/:id : đánh dấu đã đọc / xoá thư (cần token)
 *  - GET/POST /api/visit                 : đếm lượt ghé thăm
 *
 *  Dữ liệu lưu trong data/letters.json và data/stats.json — không cần database.
 *  Thư KHÔNG bao giờ được trả về cho người xem thường, chỉ admin có token mới đọc được.
 */
"use strict";

const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

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
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const SESSION_HOURS = Number(process.env.SESSION_HOURS) || 12;
const MAX_MESSAGE_LENGTH = Number(process.env.MAX_MESSAGE_LENGTH) || 1000;
const MAX_NAME_LENGTH = 50;
const MAX_BODY_BYTES = 20 * 1024;
const TRUST_PROXY = String(process.env.TRUST_PROXY ?? "true").toLowerCase() !== "false";
const DATA_DIR = path.join(__dirname, "data");
const LETTERS_FILE = path.join(DATA_DIR, "letters.json");
const STATS_FILE = path.join(DATA_DIR, "stats.json");
const PUBLIC_DIR = path.join(__dirname, "public");

let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
if (!ADMIN_PASSWORD) {
  ADMIN_PASSWORD = "admin123";
  console.warn("⚠️  Chưa đặt ADMIN_PASSWORD trong file .env → đang dùng mật khẩu mặc định 'admin123'.");
  console.warn("   Hãy copy .env.example thành .env và đổi mật khẩu TRƯỚC KHI đưa web lên mạng!");
}

/* ---------- Lưu trữ JSON đơn giản ---------- */
fs.mkdirSync(DATA_DIR, { recursive: true });

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fsp.readFile(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}
async function writeJson(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fsp.rename(tmp, file); // ghi file tạm rồi đổi tên → không bao giờ bị file hỏng dở
}
// Các thao tác ghi chạy tuần tự để không ghi đè lẫn nhau
let queue = Promise.resolve();
function withLock(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
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

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, "Dữ liệu gửi lên quá lớn"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
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

function clientIp(req) {
  if (TRUST_PROXY) {
    const fwd = req.headers["x-forwarded-for"];
    if (fwd) return String(fwd).split(",")[0].trim();
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
    if (entry.count > max) {
      throw new HttpError(429, message, { "Retry-After": String(Math.ceil((entry.reset - now) / 1000)) });
    }
  };
}
const limitLetters = rateLimit({ windowMs: 10 * 60 * 1000, max: 5, message: "Bạn gửi hơi nhanh, đợi một chút rồi gửi tiếp nhé 💌" });
const limitLogin = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: "Sai mật khẩu quá nhiều lần, thử lại sau 15 phút" });
const limitVisit = rateLimit({ windowMs: 60 * 1000, max: 20, message: "Thử lại sau nhé" });

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
  "GET /api/health": async () => [200, { ok: true }],

  /* ----- Lượt ghé thăm ----- */
  "GET /api/visit": async () => {
    const stats = await readJson(STATS_FILE, { views: 0 });
    return [200, { views: stats.views || 0 }];
  },
  "POST /api/visit": async (req) => {
    limitVisit(req);
    const views = await withLock(async () => {
      const stats = await readJson(STATS_FILE, { views: 0 });
      stats.views = (stats.views || 0) + 1;
      await writeJson(STATS_FILE, stats);
      return stats.views;
    });
    return [200, { views }];
  },

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
      const letters = await readJson(LETTERS_FILE, []);
      letters.push(letter);
      await writeJson(LETTERS_FILE, letters);
    });
    return [201, { ok: true }];
  },

  /* ----- Admin ----- */
  "POST /api/admin/login": async (req) => {
    limitLogin(req);
    const body = await readJsonBody(req);
    const password = typeof body.password === "string" ? body.password : "";
    if (!password || !safeEqual(password, ADMIN_PASSWORD)) throw new HttpError(401, "Sai mật khẩu");
    return [200, { token: createSession(), expiresIn: SESSION_HOURS * 3600 }];
  },
  "POST /api/admin/logout": async (req) => {
    sessions.delete(requireAdmin(req));
    return [200, { ok: true }];
  },
  "GET /api/admin/letters": async (req) => {
    requireAdmin(req);
    const letters = await readJson(LETTERS_FILE, []);
    letters.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return [200, { letters, total: letters.length, unread: letters.filter((l) => !l.read).length }];
  },
  "PATCH /api/admin/letters/:id": async (req, params) => {
    requireAdmin(req);
    const body = await readJsonBody(req);
    const read = body.read !== false;
    const letter = await withLock(async () => {
      const letters = await readJson(LETTERS_FILE, []);
      const found = letters.find((l) => l.id === params.id);
      if (!found) return null;
      found.read = read;
      await writeJson(LETTERS_FILE, letters);
      return found;
    });
    if (!letter) throw new HttpError(404, "Không tìm thấy thư");
    return [200, { ok: true, letter }];
  },
  "DELETE /api/admin/letters/:id": async (req, params) => {
    requireAdmin(req);
    const removed = await withLock(async () => {
      const letters = await readJson(LETTERS_FILE, []);
      const i = letters.findIndex((l) => l.id === params.id);
      if (i === -1) return false;
      letters.splice(i, 1);
      await writeJson(LETTERS_FILE, letters);
      return true;
    });
    if (!removed) throw new HttpError(404, "Không tìm thấy thư");
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

async function handleApi(req, res, pathname) {
  for (const route of routes) {
    if (route.method !== req.method) continue;
    const m = pathname.match(route.regex);
    if (!m) continue;
    const params = {};
    route.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
    const [status, data] = await route.handler(req, params);
    return sendJson(res, status, data);
  }
  sendJson(res, 404, { error: "Không tìm thấy API" });
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
  const range = req.headers.range;
  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  if (range && stat.size > 0) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m && (m[1] !== "" || m[2] !== "")) {
      if (m[1] === "") { // bytes=-N → N byte cuối
        start = Math.max(stat.size - Number(m[2]), 0);
      } else {
        start = Number(m[1]);
        if (m[2] !== "") end = Math.min(Number(m[2]), stat.size - 1);
      }
      if (start > end || start >= stat.size) {
        res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
        return res.end();
      }
      status = 206;
      headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
    }
  }
  headers["Content-Length"] = end - start + 1;
  res.writeHead(status, headers);
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

  let pathname;
  try {
    pathname = new URL(req.url, "http://localhost").pathname;
  } catch {
    return sendText(res, 400, "URL không hợp lệ");
  }

  try {
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      await handleApi(req, res, pathname);
    } else if (req.method === "GET" || req.method === "HEAD") {
      await serveStatic(req, res, pathname);
    } else {
      sendText(res, 405, "Phương thức không được hỗ trợ");
    }
  } catch (err) {
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message }, err.headers);
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: "Lỗi máy chủ" });
    else res.destroy();
  }
});

/* Mở cổng. Nếu cổng bị chặn (Windows hay giữ cổng 3000: EACCES) hoặc đang bận (EADDRINUSE)
 * thì tự thử cổng kế tiếp, tối đa 10 lần, và báo rõ đang chạy ở cổng nào. */
function listen(port, triesLeft) {
  const onListening = () => {
    server.removeListener("error", onError);
    if (port !== PORT) console.log(`ℹ️  Cổng ${PORT} không dùng được nên đang chạy ở cổng ${port}. Muốn cố định, đặt PORT=${port} trong file .env.`);
    console.log(`✅ Website đang chạy:  http://localhost:${port}`);
    console.log(`🔐 Hộp thư admin:      http://localhost:${port}/admin`);
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
    console.error(`❌ Không mở được cổng ${port} (${err.code}). Hãy đặt PORT khác trong file .env, ví dụ PORT=8080`);
    process.exit(1);
  };
  server.once("listening", onListening);
  server.once("error", onError);
  server.listen(port, HOST);
}
listen(PORT, 10);
