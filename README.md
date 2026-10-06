# 🌷 Website Profile Cá Nhân

Trang profile kiểu "link in bio" với:

- 🐱 **Popup chào mừng** khi mới vào: GIF mèo gõ laptop + lời chào theo giờ + lời chúc ngẫu nhiên → bấm **OK** là vào trang và nhạc tự phát.
- 👤 **Thẻ profile**: avatar, tên + tick xanh, bio (hiệu ứng gõ chữ), icon mạng xã hội.
- 🎵 **Music player** có **danh sách nhạc đổi được** ngay trên profile, hiển thị **"Tên bài hát - Tác giả"**, nút prev/next, tua, chỉnh âm lượng, nhớ bài đang nghe.
- 💌 **Gửi thư cho admin**: để lại tên **hoặc** gửi **ẩn danh**. Thư được lưu trên server, **chỉ admin đăng nhập ở `/admin` mới đọc được**.
- 📖 **Phong cách "cuốn sách da"**: nền da nâu có ánh đèn và vân da, bìa sách viền vàng, profile nằm trên **trang giấy cũ** với khung kẻ vàng đôi + hoa văn góc, ruy băng đánh dấu trang, chân dung viền vàng, danh sách nhạc đánh số La Mã, font serif cổ điển (Playfair Display + Lora, có tiếng Việt).
- 🌗 **2 chế độ màu**: sáng = bảng màu Coffee / Creme / Clay Dust / Deep Peach / Maroon / Guave; tối = bảng màu rượu vang đen / than / đỏ máu / xanh xám. Nút chuyển ở góc trên phải, nhớ lựa chọn của người xem.
- ✨ **Icon nét viền Tabler Icons** đóng gói sẵn (không tải từ CDN) + hiệu ứng **biến hình** bằng [morphicons](https://github.com/guillermolg00/morphicons): play ↔ pause, trăng ↔ mặt trời, mũi tên, loa, nút gửi thư → ✓.
- 🖥️📱 **2 chế độ hiển thị**: máy tính / laptop → **hai trang sách mở** (trái: profile, phải: nhạc + thư, danh sách nhạc mở sẵn); điện thoại → hai trang xếp dọc trong bìa.
- 👁 Đếm lượt ghé thăm.

---

## 1. Chạy thử trên máy

Chỉ cần cài [Node.js](https://nodejs.org) (bản 18 trở lên). **Không cần `npm install`** — server viết bằng Node thuần, không dùng thư viện ngoài.

```bash
cd my-profile-website
copy .env.example .env   # Windows  (Mac/Linux: cp .env.example .env) → mở .env sửa mật khẩu admin
npm start                # hoặc: node server.js
```

Mở trình duyệt:

- Trang profile: <http://localhost:3000>
- Hộp thư admin: <http://localhost:3000/admin> (mật khẩu đặt trong file `.env`, mặc định `admin123` nếu chưa đặt)

> Nếu chỉ mở trực tiếp file `public/index.html` (không chạy server) thì giao diện + nhạc vẫn hoạt động, **chỉ chức năng gửi thư và đếm lượt xem là cần server**.

---

## 2. Cấu trúc thư mục

```
my-profile-website/
├── server.js              # Backend (Node thuần, không cần thư viện): file tĩnh + API thư + admin + lượt xem
├── package.json
├── .env.example           # Mẫu cấu hình → copy thành .env
├── data/                  # Tự tạo: letters.json (thư), stats.json (lượt xem)
└── public/                # Toàn bộ giao diện
    ├── index.html         # Trang profile
    ├── admin.html         # Trang admin đọc thư
    ├── css/style.css      # ⭐ Màu sắc (phần :root ở đầu file)
    ├── css/admin.css
    ├── js/config.js       # ⭐⭐ Tên, bio, avatar, mạng xã hội, nhạc, lời chúc — SỬA Ở ĐÂY
    ├── js/main.js         # Logic trang profile (thường không cần đụng)
    ├── js/admin.js        # Logic trang admin
    └── assets/
        ├── avatar.svg     # Avatar tạm → thay bằng ảnh của bạn
        ├── favicon.svg
        ├── music/         # Bỏ file .mp3 vào đây
        └── covers/        # Ảnh bìa bài hát (không bắt buộc)
```

---

## 3. Tuỳ chỉnh (99% chỉ cần sửa `public/js/config.js`)

### Tên, bio, avatar, ruy băng, tick
```js
name: "Nhung",
username: "@nhung",
ribbon: "xin chào",            // chữ trên ruy băng đánh dấu trang, "" để ẩn
bio: "Xin chào, mình là Nhung...",
avatar: "assets/avatar.jpg",   // copy ảnh vào public/assets/ rồi đổi tên file ở đây
verified: true,
```

### Mạng xã hội
Thêm/xoá dòng trong `socials`. Icon là tên icon Tabler (xem mục *Icon* bên dưới). Để `url: ""` thì icon đó không hiện.

### Đổi nhạc 🎵
1. Copy file `.mp3` vào `public/assets/music/`.
2. Sửa mảng `songs` trong `config.js`:
```js
songs: [
  { title: "Giữ Lấy Làm Gì", artist: "Tên ca sĩ", src: "assets/music/giu-lay-lam-gi.mp3", cover: "assets/covers/giu-lay-lam-gi.jpg" },
  { title: "Bài 2", artist: "Tác giả 2", src: "assets/music/bai-2.mp3", cover: "" },
],
```
- `title` + `artist` **bắt buộc** — trang hiển thị "Tên bài - Tác giả" trong player và danh sách nhạc.
- `cover` bỏ trống thì dùng avatar làm đĩa nhạc.
- `src` cũng có thể là link mp3 trực tiếp trên mạng.
- 3 bài demo có sẵn (SoundHelix) chỉ để player chạy ngay — hãy thay bằng nhạc của bạn.

> ⚠️ Ghi tên tác giả là để ghi nhận, **không** thay thế cho việc xin phép bản quyền. Nên dùng nhạc của chính bạn hoặc nhạc miễn phí bản quyền (Pixabay Music, Free Music Archive, YouTube Audio Library…) và đọc kỹ giấy phép.

### Popup chào mừng
Trong `welcome`: đổi `gif` (link hoặc `assets/welcome.gif`), `title`, `greetings` (theo giờ), `wishes` (chọn ngẫu nhiên), chữ trên nút `button`. `showEveryVisit: false` nếu chỉ muốn hiện 1 lần mỗi phiên.

### Màu sắc: 2 chế độ
Trong `config.js`, phần `theme`, mỗi chế độ có một bảng màu đặt tên theo vai trò:

| Khoá | Dùng cho | Sáng (mặc định) | Tối (mặc định) |
|---|---|---|---|
| `leather` | nền trang web (da bìa sách) | `#371e13` Coffee | `#170f12` |
| `glow` | ánh đèn / ánh nến hắt lên nền | `#734f31` Leather Couch | `#2a0d12` |
| `paper` | trang giấy | `#e1d3a9` Creme | `#2a2e2f` |
| `paper2` | ô player, ô nhập | `#c0aa8a` Clay Dust | `#2a0d12` |
| `ink` / `muted` | chữ / chữ phụ | `#371e13` / `#534b31` River Pine | `#e8dfd0` / `#a7ada6` |
| `accent` | nút chính, play, thanh nhạc | `#a85530` Deep Peach | `#b72d29` |
| `accent2` | ruy băng, nút gửi thư | `#5e2a25` Maroon | `#57645b` |
| `gold` | khung kẻ, hoa văn, số La Mã | `#8f7c3a` Guave | `#a08447` |

`default: "light" | "dark" | "auto"` chọn chế độ ban đầu, `toggle: false` để ẩn nút chuyển. Lựa chọn sáng/tối của mỗi người xem được lưu trong trình duyệt của họ.

Muốn chỉnh sâu hơn (vân giấy, vân da, độ đậm ánh đèn, font, bo góc) thì sửa phần `:root` và `:root[data-theme="dark"]` đầu file `public/css/style.css`.

### Ruy băng đánh dấu trang
`ribbon: "xin chào"` trong `config.js` — chữ in dọc trên ruy băng ở trang trái; để `""` nếu không muốn hiện.

### Icon
Dùng bộ **Tabler Icons** (MIT) nằm sẵn trong `public/assets/icons/sprite.svg` — không cần mạng. Mạng xã hội khai báo bằng tên icon, VD `icon: "brand-tiktok"`. Sprite có sẵn ~60 icon (danh sách trong `config.js`). Thêm icon mới (VD Zalo, Shopee…):
1. Mở <https://tabler.io/icons>, chọn icon kiểu *outline*, bấm copy SVG.
2. Mở `sprite.svg`, thêm `<symbol id="tabler-ten-icon" viewBox="0 0 24 24"> …các thẻ &lt;path&gt; trong SVG vừa copy… </symbol>` (bỏ thẻ `<path stroke="none" d="M0 0h24v24H0z" fill="none"/>`).
3. Dùng `icon: "ten-icon"` trong `config.js`.

Hiệu ứng biến hình icon do thư viện `public/js/vendor/morphicons.js` đảm nhiệm (đã đóng gói, MIT). Nếu xoá file này thì icon vẫn hiện, chỉ không còn chuyển động mượt.

### 2 chế độ hiển thị
Tự động theo độ rộng màn hình, không cần cài gì:
- **≥ 900px** (máy tính, laptop): card 2 cột — trái là avatar/tên/bio/mạng xã hội, phải là player + danh sách nhạc (mở sẵn) + nút gửi thư.
- **< 900px** (điện thoại, tablet dọc): 1 cột, danh sách nhạc thu gọn, bấm "Đổi nhạc" để mở.

Muốn đổi mốc 900px: tìm `@media (min-width: 900px)` trong `style.css` và `matchMedia("(min-width: 900px)")` trong `main.js`.

### Ảnh nền
Mặc định nền là da nâu có ánh đèn + vân da. Muốn thêm ảnh: `background.image: "assets/background.jpg"` trong `config.js` (ảnh hiện mờ phía sau, vẫn giữ ánh đèn và vân da).

---

## 4. Thư gửi admin hoạt động thế nào?

| Bước | Chi tiết |
|---|---|
| Người xem | Bấm **Gửi thư cho admin** → nhập tên **hoặc** bật **Gửi ẩn danh** → viết thư → Gửi. |
| Server | Lưu vào `data/letters.json`: tên (hoặc `null` nếu ẩn danh), nội dung, thời gian. Không lưu IP. Giới hạn 5 thư / 10 phút mỗi IP để chống spam. |
| Admin | Vào `/admin` → nhập mật khẩu (`ADMIN_PASSWORD` trong `.env`) → xem thư, lọc *Chưa đọc / Có tên / Ẩn danh*, đánh dấu đã đọc, xoá. |
| Bảo mật | Thư **không bao giờ** được trả về cho người xem thường. Mật khẩu so sánh an toàn, chặn đoán mật khẩu (10 lần / 15 phút), phiên đăng nhập tự hết hạn sau 12 giờ. Nội dung thư hiển thị dạng text thuần nên không chạy được mã độc. |

Muốn **đổi mật khẩu admin**: sửa `ADMIN_PASSWORD` trong `.env` rồi chạy lại server.

---

## 5. Đưa web lên mạng

Vì có backend (Node.js) nên **không** host được trên GitHub Pages / Netlify tĩnh. Các lựa chọn dễ nhất:

### Render / Railway (miễn phí, đơn giản)
1. Đẩy code lên GitHub (file `.env` và `data/` đã được bỏ qua trong `.gitignore`).
2. Tạo **Web Service** từ repo: Build command để trống (hoặc `npm install`, không có gì để cài), Start command `npm start`.
3. Thêm biến môi trường `ADMIN_PASSWORD` (nền tảng tự cấp `PORT`, server đọc được).
4. ⚠️ Ổ đĩa gói miễn phí thường **bị reset khi deploy lại** → thư trong `data/letters.json` có thể mất. Render có "Persistent Disk" (trả phí) gắn vào thư mục `data/`; hoặc nhớ tải thư về trước khi deploy lại.

### VPS (Ubuntu) + pm2
```bash
npm install -g pm2
pm2 start server.js --name profile
pm2 save && pm2 startup
```
Rồi trỏ domain qua Nginx (reverse proxy về cổng 3000) và bật HTTPS bằng Certbot.

### Chỉ cần trang tĩnh (không cần gửi thư)
Có thể upload nguyên thư mục `public/` lên bất kỳ host tĩnh nào (GitHub Pages, Netlify, Vercel…). Mọi thứ vẫn chạy, riêng nút gửi thư sẽ báo "không kết nối được server" và không hiện lượt xem (đặt `letter.enabled: false` và `showViews: false` trong `config.js` để ẩn luôn).

---

## 6. Câu hỏi thường gặp

**Đăng nhập admin báo "Lỗi 405" / gửi thư không được?** Trang đang được mở bằng một server tĩnh khác (Live Server của VS Code ở cổng 5500, `http-server`, GitHub Pages…) chứ không phải `server.js`. Hãy chạy `node server.js` trong thư mục dự án và mở đúng `http://localhost:3000` (admin: `http://localhost:3000/admin`).

**Chạy báo `listen EACCES ... :3000` (Windows)?** Cổng 3000 bị Windows giữ (hay gặp khi máy có Hyper-V/WSL). Server sẽ tự chuyển sang cổng kế tiếp và in ra địa chỉ mới — mở đúng địa chỉ đó. Muốn cố định cổng: đặt `PORT=8080` trong `.env`, hoặc chạy `$env:PORT=8080; node server.js` trong PowerShell.

**Nhạc không tự phát?** Trình duyệt chỉ cho phát nhạc sau khi người dùng có thao tác — đó là lý do có nút OK ở popup. Nếu tắt popup (`showEveryVisit: false`), người xem phải bấm ▶ thủ công.

**GIF không hiện?** Link Tenor có thể bị chặn ở vài mạng. Tải GIF về `public/assets/welcome.gif` rồi đổi `welcome.gif: "assets/welcome.gif"`. Nếu ảnh lỗi, trang tự hiện 🐱 thay thế.

**Muốn đổi đường dẫn trang admin?** Đổi tên `public/admin.html` và route `app.get("/admin", …)` trong `server.js`.

**Thư lưu ở đâu?** `data/letters.json` — có thể mở bằng bất kỳ trình soạn thảo nào để sao lưu.
