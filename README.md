# 🌷 Website Profile Cá Nhân — "Cuốn sách profile"

Trang profile kiểu "link in bio" trình bày như **một cuốn sách da mở ra**, với:

- 🐱 **Popup chào mừng** khi mới vào: GIF mèo gõ laptop + lời chào theo giờ + lời chúc ngẫu nhiên → bấm **OK** là vào trang và nhạc tự phát.
- 📖 **Lật trang như sách thật**: kéo mép / góc giấy, trang **cong theo ngón tay / con trỏ**, có bóng đổ và tiếng giấy sột soạt rất nhỏ. Máy tính mở **2 trang một lúc**, điện thoại **1 trang** và vuốt ngang để lật (xem [mục 6](#6-lật-trang)).
- 👤 **Trang 1 — profile**: avatar, tên + tick xác minh, bio (hiệu ứng gõ chữ), icon mạng xã hội, ruy băng đánh dấu trang.
- 🎵 **Trang 2 — nhạc + thư**: music player có **danh sách nhạc đổi được**, hiển thị **"Tên bài hát - Tác giả"**, prev/next, tua, âm lượng, nhớ bài đang nghe; nút **gửi thư cho admin**.
- ✍️ **Trang 3 trở đi — trang tự soạn**: tiêu đề, đoạn văn (chữ đậm / nghiêng / gạch chân / liên kết / danh sách), ảnh (căn lề, khung polaroid, nghiêng, chữ chạy quanh ảnh), bộ ảnh, trích dẫn, đường kẻ hoa văn… Bấm ảnh để **xem phóng to**.
- 🎧 **Thanh "đang phát" nhỏ** ở chân trang khi đã lật qua trang nhạc: phát / dừng, tên bài chạy chữ, bấm vào là lật về trang nhạc.
- 🐾 **Linh vật pixel** ngồi trên mép sách: chạm để chơi, kéo thả / ném đi được, nhún theo nhạc, giật mình khi lật trang (xem [mục 7](#7-linh-vật)).
- 🛠 **Trang admin `/admin`**: đọc thư, sửa **hồ sơ** (tải avatar từ máy tính / điện thoại, cắt ảnh tròn), **danh sách nhạc** (tải mp3 lên, tự đọc tên bài / ca sĩ / ảnh bìa), **soạn trang sách** có xem trước trực tiếp, **kho tệp** đã tải lên (xem [mục 5](#5-trang-admin)). Admin đang đăng nhập thì trang chính hiện nút **"✎ Chỉnh sửa"** để vào sửa nhanh.
- 💌 **Gửi thư cho admin**: để lại tên **hoặc** gửi **ẩn danh**. Thư được lưu trên server, **chỉ admin đăng nhập ở `/admin` mới đọc được**.
- 📜 **Phong cách "cuốn sách da"**: nền da nâu có ánh đèn và vân da, bìa sách viền vàng, trang giấy cũ với khung kẻ vàng đôi + hoa văn góc, danh sách nhạc đánh số La Mã, font serif cổ điển (Playfair Display + Lora, có tiếng Việt).
- 🌗 **2 chế độ màu**: sáng = bảng màu Coffee / Creme / Clay Dust / Deep Peach / Maroon / Guave; tối = bảng màu rượu vang đen / than / đỏ máu / xanh xám. Nút chuyển ở góc trên phải, nhớ lựa chọn của người xem.
- ✨ **Icon nét viền Tabler Icons** đóng gói sẵn (không tải từ CDN) + hiệu ứng **biến hình** bằng [morphicons](https://github.com/guillermolg00/morphicons): play ↔ pause, trăng ↔ mặt trời, mũi tên, loa, nút gửi thư → ✓.
- ♿ Tôn trọng cài đặt **giảm chuyển động** của máy (không cong giấy, chỉ mờ chéo; không chạy chữ), dùng được bằng bàn phím.
- 👁 Đếm lượt ghé thăm.

Không cần cài thư viện nào: server là Node.js thuần, giao diện là HTML / CSS / JavaScript thuần (không build).

---

## 1. Chạy thử trên máy

Chỉ cần cài [Node.js](https://nodejs.org) (bản 18 trở lên). **Không cần `npm install`**.

```bash
cd my-profile-website
copy .env.example .env   # Windows  (Mac/Linux: cp .env.example .env) → mở .env sửa mật khẩu admin
npm start                # hoặc: node server.js
```

Mở trình duyệt:

- Trang profile: <http://localhost:3000>
- Trang admin: <http://localhost:3000/admin> (mật khẩu đặt trong file `.env`, mặc định `admin123` nếu chưa đặt)

> Nếu chỉ mở trực tiếp file `public/index.html` (không chạy server) thì giao diện, lật trang, nhạc, trang tự soạn trong `config.js` và linh vật vẫn chạy. **Cần server** cho: gửi thư, đếm lượt xem, trang admin và mọi thứ sửa / tải lên ở admin.

---

## 2. Cấu trúc thư mục

```
my-profile-website/
├── server.js              # Backend (Node thuần): file tĩnh + API thư / lượt xem / admin / nội dung / tải file lên
├── package.json
├── .env.example           # Mẫu cấu hình (mật khẩu admin, cổng, giới hạn file…) → copy thành .env
├── render.yaml            # Cấu hình deploy một chạm lên Render (mục 9)
├── data/                  # Tự tạo khi chạy (đổi chỗ bằng DATA_DIR):
│   ├── letters.json       #   thư gửi admin
│   ├── stats.json         #   lượt ghé thăm
│   ├── content.json       #   hồ sơ / nhạc / trang sách / linh vật đã lưu ở /admin
│   ├── media.json         #   danh sách ảnh / nhạc đã tải lên
│   └── uploads/           #   file ảnh / nhạc tải lên ở /admin
└── public/                # Toàn bộ giao diện
    ├── index.html         # Trang profile (cuốn sách)
    ├── admin.html         # Trang admin
    ├── css/
    │   ├── style.css      # ⭐ Màu sắc (phần :root ở đầu file), bố cục chung
    │   ├── book.css       # Cuốn sách lật trang
    │   ├── pages.css      # Trang tự soạn (khối nội dung, xem ảnh phóng to)
    │   ├── mascot.css     # Linh vật
    │   └── admin.css
    ├── js/
    │   ├── config.js      # ⭐⭐ Tên, bio, avatar, mạng xã hội, nhạc, lời chúc, trang sách, linh vật — SỬA Ở ĐÂY
    │   ├── main.js        # Logic trang profile: gộp nội dung admin, dựng trang sách, player… (thường không cần đụng)
    │   ├── book.js        # Bộ máy lật trang
    │   ├── pages.js       # Dựng trang tự soạn (dùng chung cho trang chính và phần xem trước ở admin)
    │   ├── mascot.js      # Linh vật
    │   ├── theme.js       # Sáng / tối + icon biến hình
    │   ├── admin.js, admin-*.js   # Trang admin (mỗi mục 1 file)
    │   └── vendor/        # morphicons (đóng gói sẵn)
    └── assets/
        ├── avatar.png     # Avatar → thay bằng ảnh của bạn (hoặc tải lên ở /admin)
        ├── favicon.svg
        ├── icons/sprite.svg   # Bộ icon Tabler
        ├── music/         # Bỏ file .mp3 vào đây (hoặc tải lên ở /admin)
        └── covers/        # Ảnh bìa bài hát (không bắt buộc)
```

---

## 3. Tuỳ chỉnh

Có **2 cách**, dùng cách nào cũng được:

1. **Sửa ngay trên web ở `/admin`** (dễ nhất, không cần đụng code): hồ sơ, avatar, danh sách nhạc, trang sách, linh vật. Xem [mục 5](#5-trang-admin).
2. **Sửa file `public/js/config.js`** rồi tải lại trang (F5): mọi thứ ở trên + màu sắc, mạng xã hội, popup chào mừng, thư, ảnh nền…

> **Cái nào được ưu tiên?** Những gì đã lưu ở `/admin` thắng `config.js`:
> - **Hồ sơ**: từng ô một (tên, username, bio, avatar, ruy băng, tick). Ô nào chưa từng sửa ở admin thì vẫn lấy từ `config.js`. Lưu ô trống ở admin cũng tính (VD bio trống = ẩn bio).
> - **Danh sách nhạc / trang sách**: đã lưu ở admin thì **thay hẳn** danh sách trong `config.js`.
> - **Linh vật**: từng cài đặt một (bật/tắt, tên, màu, câu nói).
>
> Muốn quay về giá trị trong `config.js`: bấm **"Khôi phục mặc định"** ở mục tương ứng trong `/admin`.

### Tên, bio, avatar, ruy băng, tick
```js
name: "Nhung",
username: "@nhung",
pageTitle: "Nhung ✦ profile",  // tiêu đề tab (nếu có chứa tên, đổi tên ở admin thì tiêu đề đổi theo)
ribbon: "xin chào",            // chữ trên ruy băng đánh dấu trang, "" để ẩn
bio: "Xin chào, mình là Nhung...",
avatar: "assets/avatar.jpg",   // copy ảnh vào public/assets/ rồi đổi tên file ở đây (hoặc tải lên ở /admin)
verified: true,
```

### Mạng xã hội
Thêm/xoá dòng trong `socials`. Icon là tên icon Tabler (xem mục *Icon* bên dưới). Để `url: ""` thì icon đó không hiện.

### Đổi nhạc 🎵
Cách nhanh: `/admin` → **Âm nhạc** → kéo thả file mp3 vào (xem mục 5). Hoặc sửa tay:
1. Copy file `.mp3` vào `public/assets/music/`.
2. Sửa mảng `songs` trong `config.js`:
```js
songs: [
  { title: "Giữ Lấy Làm Gì", artist: "Tên ca sĩ", src: "assets/music/giu-lay-lam-gi.mp3", cover: "assets/covers/giu-lay-lam-gi.jpg" },
  { title: "Bài 2", artist: "Tác giả 2", src: "assets/music/bai-2.mp3", cover: "" },
],
```
- `title` + `artist` **bắt buộc** — trang hiển thị "Tên bài - Tác giả" trong player, danh sách nhạc và thanh "đang phát".
- `cover` bỏ trống thì dùng avatar làm đĩa nhạc.
- `src` cũng có thể là link mp3 trực tiếp trên mạng.

> ⚠️ Ghi tên tác giả là để ghi nhận, **không** thay thế cho việc xin phép bản quyền. Nên dùng nhạc của chính bạn hoặc nhạc miễn phí bản quyền (Pixabay Music, Free Music Archive, YouTube Audio Library…) và đọc kỹ giấy phép.

### Trang sách tự soạn (trang 3 trở đi)
Cách nhanh: `/admin` → **Trang sách**. Hoặc sửa mảng `pages` trong `config.js` — trong file đã có **2 trang mẫu** ("Đôi dòng về mình", "Những điều mình thích") và chú thích đầy đủ các loại khối:

| Khối | Dùng để | Tuỳ chọn chính |
|---|---|---|
| `heading` | Tiêu đề | `text`, `level` 1–3, `align` |
| `text` | Đoạn văn | `text`, `align` (trái / giữa / phải / căn đều), `size`, `italic`, `dropcap` (chữ cái đầu thật to) |
| `image` | Một tấm ảnh | `src`, `alt`, `caption`, `align`, `width` 20–100 %, `wrap` (chữ chạy quanh), `frame` (không / khung / bo góc / tròn / polaroid), `tilt` −8…8° |
| `gallery` | Bộ ảnh (≤ 12) | `images`, `columns` 2–4, `frame` |
| `quote` | Trích dẫn | `text`, `cite`, `align` |
| `divider` | Đường kẻ | `style`: hoa văn ✦ ✦ ✦ / nét kẻ / hàng chấm |
| `spacer` | Khoảng trống | `size` |

Trong đoạn văn, trích dẫn, chú thích ảnh: `**đậm**`, `*nghiêng*`, `__gạch chân__`, `[chữ](https://link)`; dòng trống = sang đoạn mới; các dòng bắt đầu bằng `- ` thành danh sách chấm. Tối đa 20 trang, mỗi trang 60 khối. Trang dài thì cuộn bên trong trang giấy. Số trang lẻ thì sách tự thêm **tờ lót cuối** (giấy vân cẩm thạch "✦ Hết ✦") cho trọn trang đôi trên máy tính. Muốn bỏ hết: `pages: []`.

### Lật trang & linh vật
```js
book: { sound: true, hint: true },   // tiếng giấy khi lật; góc trang tự hé lên 1 lần lúc mới vào
mascot: {
  enabled: true,                     // false = ẩn linh vật
  name: "Bé Cam",
  color: "#d97757",
  messages: ["Kéo mép sách để lật trang nè ✦", "Đừng quên gửi thư cho chủ nhà nha 💌", "..."],  // {name} = tên linh vật
},
```

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

### Icon
Dùng bộ **Tabler Icons** (MIT) nằm sẵn trong `public/assets/icons/sprite.svg` — không cần mạng. Mạng xã hội khai báo bằng tên icon, VD `icon: "brand-tiktok"`. Sprite có sẵn ~60 icon (danh sách trong `config.js`). Thêm icon mới (VD Zalo, Shopee…):
1. Mở <https://tabler.io/icons>, chọn icon kiểu *outline*, bấm copy SVG.
2. Mở `sprite.svg`, thêm `<symbol id="tabler-ten-icon" viewBox="0 0 24 24"> …các thẻ &lt;path&gt; trong SVG vừa copy… </symbol>` (bỏ thẻ `<path stroke="none" d="M0 0h24v24H0z" fill="none"/>`).
3. Dùng `icon: "ten-icon"` trong `config.js`.

Hiệu ứng biến hình icon do thư viện `public/js/vendor/morphicons.js` đảm nhiệm (đã đóng gói, MIT). Nếu xoá file này thì icon vẫn hiện, chỉ không còn chuyển động mượt.

### 2 chế độ hiển thị
Tự động theo độ rộng màn hình:
- **≥ 900px** (máy tính, laptop): sách mở **2 trang** — trang 1 bên trái, trang 2 bên phải (danh sách nhạc mở sẵn), lật tiếp thì sang trang 3–4…
- **< 900px** (điện thoại, tablet dọc): **1 trang** mỗi lần, vuốt ngang để lật; danh sách nhạc thu gọn, bấm "Đổi nhạc" để mở.

Muốn đổi mốc 900px: tìm `min-width: 900px` trong `public/css/style.css` và `"(min-width: 900px)"` trong `public/js/main.js` (2 chỗ: player và `Book.create`).

### Ảnh nền
Mặc định nền là da nâu có ánh đèn + vân da. Muốn thêm ảnh: `background.image: "assets/background.jpg"` trong `config.js` (ảnh hiện mờ phía sau, vẫn giữ ánh đèn và vân da).

---

## 4. Thư gửi admin hoạt động thế nào?

| Bước | Chi tiết |
|---|---|
| Người xem | Lật tới trang nhạc → bấm **Gửi thư cho admin** → nhập tên **hoặc** bật **Gửi ẩn danh** → viết thư → Gửi. |
| Server | Lưu vào `data/letters.json`: tên (hoặc `null` nếu ẩn danh), nội dung, thời gian. Không lưu IP. Giới hạn 5 thư / 10 phút mỗi IP để chống spam. |
| Admin | Vào `/admin` → nhập mật khẩu (`ADMIN_PASSWORD` trong `.env`) → mục **Hộp thư**: xem thư, lọc *Chưa đọc / Có tên / Ẩn danh*, đánh dấu đã đọc, xoá. |
| Bảo mật | Thư **không bao giờ** được trả về cho người xem thường. Mật khẩu so sánh an toàn, chặn đoán mật khẩu (10 lần / 15 phút), phiên đăng nhập tự hết hạn sau 12 giờ (`SESSION_HOURS`). Nội dung thư hiển thị dạng text thuần nên không chạy được mã độc. |

Muốn **đổi mật khẩu admin**: sửa `ADMIN_PASSWORD` trong `.env` (hoặc trong tab Environment của Render) rồi chạy lại server.

---

## 5. Trang admin

Mở `/admin` → nhập mật khẩu. Tick **"Ghi nhớ đăng nhập trên máy này"** để lần sau không phải nhập lại (đến khi hết phiên); không tick thì đóng tab là phải đăng nhập lại. Phiên đăng nhập mất khi server khởi động lại.

Trang admin dùng tốt trên **cả máy tính lẫn điện thoại**. Các mục (thanh tab trên cùng, mỗi mục có địa chỉ riêng):

| Mục | Địa chỉ | Làm được gì |
|---|---|---|
| 💌 **Hộp thư** | `/admin#thu` | Đọc, lọc, đánh dấu đã đọc, xoá thư. |
| 👤 **Hồ sơ** | `/admin#ho-so` | **Avatar**: chọn ảnh từ máy tính / điện thoại, **kéo thả** vào khung hoặc **dán** (Ctrl + V). Trình **cắt ảnh tròn**: kéo để dời, thanh / con lăn chuột / chụm 2 ngón để phóng to, phím mũi tên. Ảnh GIF động thì chọn *giữ ảnh động* hoặc cắt thành ảnh tĩnh. Có thanh tiến độ + nút huỷ khi tải lên. Sửa tên, username, bio, ruy băng, tick xác minh. Phần **Linh vật**: bật/tắt, tên, màu, câu nói (mỗi dòng 1 câu, `{name}` = tên linh vật). |
| 🎵 **Âm nhạc** | `/admin#am-nhac` | **Tải mp3 lên** (chọn nhiều file / kéo thả): tự đọc **tên bài, ca sĩ và ảnh bìa** nằm sẵn trong file (thẻ ID3); file không có thẻ thì lấy theo tên file dạng `Tên bài - Ca sĩ.mp3`. Tải 2 file một lúc, mỗi file có tiến độ / huỷ / thử lại. Sửa tên bài & ca sĩ ngay trên dòng, **kéo thả để đổi thứ tự** (hoặc nút ↑ ↓), nghe thử ▶, đổi ảnh bìa (cắt vuông), xoá. Hoặc **thêm bằng đường link** (mp3 trên mạng, file trong `assets/music/`). |
| 📖 **Trang sách** | `/admin#trang-sach` | Thêm / xoá / đổi thứ tự trang (Trang 3, 4…). Mỗi trang gồm các **khối** (tiêu đề, đoạn văn, ảnh, bộ ảnh, trích dẫn, đường kẻ, khoảng trống) — thêm bằng nút **"+ Thêm khối"**, kéo để sắp xếp, nhân đôi, thu gọn. Thanh định dạng **B / I / U / liên kết** (Ctrl + B / I / U / K), bật **danh sách**; ảnh: tải lên, **căn trái / giữa / phải**, cỡ, **khung** (viền vàng, bo góc, tròn, polaroid), **nghiêng**, **chữ chạy quanh ảnh**. **Xem trước trực tiếp** đúng như trên trang thật (máy tính thấy cả trang đôi; điện thoại chuyển qua lại *Soạn / Xem trước*). |
| 🗂 **Kho tệp** | `/admin#kho` | Tất cả ảnh / nhạc đã tải lên: dung lượng, ngày, nhãn **"Đang dùng"**. Lọc *Tất cả / Ảnh / Nhạc / Chưa dùng*, chép link, mở, nghe thử, xoá (file đang dùng thì hỏi lại lần nữa). |

- Mỗi mục có **thanh lưu** ở dưới: *Lưu thay đổi* / *Huỷ thay đổi*; phím tắt **Ctrl + S** để lưu. Mục chưa lưu có dấu chấm trên tab, rời trang khi chưa lưu sẽ được hỏi lại. Phiên hết hạn giữa chừng thì đăng nhập lại — phần đang sửa vẫn còn.
- **"Khôi phục mặc định"** ở từng mục = xoá phần đã lưu ở admin, trang quay về giá trị trong `config.js`.
- Ảnh được làm nhẹ ngay trên trình duyệt trước khi tải lên: avatar cắt thành 640×640, ảnh trang sách thu nhỏ còn tối đa 1600px, ảnh bìa bài hát 512px, lưu dạng WebP (GIF động giữ nguyên). Định dạng nhận: ảnh **JPG, PNG, GIF, WebP, AVIF**; nhạc **MP3, M4A, AAC, OGG, WAV, FLAC, WebM**. Server kiểm tra **nội dung thật** của file (không tin đuôi file), tối đa 10 MB / ảnh và 30 MB / bài (đổi bằng `MAX_IMAGE_MB`, `MAX_AUDIO_MB`). Ảnh HEIC của iPhone: iPhone tự đổi sang JPG khi chọn từ Thư viện; trên máy tính thì đổi sang JPG trước.
- File đã tải lên nhưng **không dùng tới** (bị thay ra, hoặc tải lên mà không bấm lưu) sẽ tự bị xoá: ngay khi lưu (file vừa bị bỏ ra) hoặc sau 24 giờ.

### Nút "✎ Chỉnh sửa" trên trang chính
Khi trình duyệt này đang đăng nhập `/admin` (phiên còn hạn), trang profile hiện nút nhỏ **"✎ Chỉnh sửa"** trên mép trên mỗi trang sách: trang 1 → mục *Hồ sơ*, trang 2 → *Âm nhạc*, trang tự soạn → *Trang sách*. Người xem bình thường không thấy nút này. Đăng xuất ở admin là nút biến mất.

---

## 6. Lật trang

| Thiết bị | Cách lật |
|---|---|
| Máy tính (chuột) | **Kéo mép hoặc góc ngoài** của trang giấy (con trỏ đổi thành bàn tay ở vùng cầm được) — giấy cong theo chuột, thả quá gáy sách thì lật, thả sớm thì giấy trở về; vẩy nhanh cũng lật. **Bấm vào mép** = lật tự động. Rê chuột vào góc dưới thì giấy hé lên (nhãn *"Lật trang"*). |
| Bàn phím | **← →** (hoặc **PageUp / PageDown**) — không ảnh hưởng khi đang gõ chữ hay đang mở hộp thoại. |
| Điện thoại / máy tính bảng | **Vuốt ngang ở bất kỳ đâu trên trang** (vuốt dọc vẫn cuộn nội dung trang dài như bình thường); chạm vào mép trang cũng lật. |
| Ai cũng dùng được | Thanh dưới sách: **‹ Trang trước · 1–2 / 6 · Trang sau ›**. |

- Lần đầu mở trang, góc trang **tự hé lên một chút** để người xem biết là lật được (`book.hint`).
- Địa chỉ trang có dạng `…/#trang-3` → gửi link này cho người khác là mở đúng trang 3.
- Thanh **"đang phát"** ở chân trang chỉ hiện khi trang nhạc đang bị lật qua; bấm tên bài là lật về trang nhạc.
- Máy bật "giảm chuyển động" (Windows: *Hiệu ứng hoạt ảnh* tắt; iPhone: *Giảm chuyển động*) → không cong giấy, chỉ mờ chéo 0,15 giây.
- Tắt tiếng giấy: `book.sound: false`; tắt gợi ý hé góc: `book.hint: false` trong `config.js`.

---

## 7. Linh vật

Bạn nhỏ pixel (mặc định tên **Bé Cam**, màu cam) rơi xuống ngồi trên **mép trên cuốn sách** sau khi bấm OK ở popup chào mừng.

- **Chạm / bấm**: vẫy tay, nhảy, nhảy múa, thả tim, hắt xì, lộn ngược… (không lặp lại 2 lần liền). **Chạm 2 lần nhanh**: tuyệt chiêu. Đang được focus bằng bàn phím thì **Enter / Space** cũng được.
- **Kéo thả**: nhấc lên (lủng lẳng, mặt ngạc nhiên), thả nhẹ thì rơi xuống, **ném mạnh** thì bay và nảy vào mép màn hình; thả gần mép sách thì đậu lại trên sách, không thì xuống đáy màn hình.
- **Tự sống**: thở, chớp mắt, nhìn theo con trỏ, đi dạo, ngồi; **nhún theo nhạc** khi nhạc đang phát; **giật mình + nói một câu** khi lật trang; lâu không ai chơi (1 phút) thì **ngủ** — chạm để đánh thức. Nhớ chỗ ngồi cho lần ghé sau.
- Thỉnh thoảng nói một câu trong `mascot.messages` (`{name}` được thay bằng tên).
- Cài đặt: `config.js` → `mascot` hoặc `/admin` → *Hồ sơ* → *Linh vật* (bật/tắt, tên, màu, câu nói). Máy bật "giảm chuyển động" thì linh vật đứng yên, vẫn nói chuyện.

---

## 8. Lưu trữ file tải lên & biến môi trường

### Ảnh / nhạc tải lên nằm ở đâu?
| Chạy ở | Nơi lưu | Ghi chú |
|---|---|---|
| Máy của bạn / VPS | `data/uploads/` (danh sách trong `data/media.json`, nội dung trang trong `data/content.json`) | Sao lưu = copy cả thư mục `data/`. Đổi chỗ bằng `DATA_DIR`. |
| Render / Railway **gói miễn phí** | ⚠️ **Phải cấu hình Upstash** | Ổ đĩa của gói miễn phí là **ổ tạm**: mỗi lần server khởi động lại (deploy, hoặc ngủ sau 15 phút không ai vào rồi thức dậy) thì **mọi file trong `data/` bị xoá** — ảnh / nhạc tải lên **biến mất**, trang hiện ảnh lỗi. |

**Với Upstash** (đặt `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, xem mục 9): thư, lượt xem, nội dung trang **và cả file tải lên** đều nằm trên Upstash. Mỗi file được cắt thành các mảnh 1 MB (lưu dạng base64, nặng hơn file gốc khoảng 1/3) dưới khoá `profile:blob:<id>:<số thứ tự>`; server giữ sẵn các file hay dùng trong bộ nhớ (tối đa ~64 MB) nên người xem không phải chờ tải lại từ Upstash mỗi lần.

Giới hạn gói **miễn phí** của Upstash (tham khảo, có thể thay đổi — xem <https://upstash.com/pricing>): khoảng **256 MB dữ liệu** và khoảng **500.000 lệnh / tháng**. Tức là chứa được khoảng 190 MB file gốc — đủ cho avatar + ảnh trang sách + vài chục bài nhạc mp3 cỡ 3–5 MB. Lời khuyên:
- **Nhạc nặng**: để sẵn trong `public/assets/music/` (đưa lên GitHub cùng code) và khai báo trong `songs` của `config.js` — không tốn dung lượng Upstash. Các bài này vẫn hiện trong `/admin` → *Âm nhạc* (nhãn "Tệp có sẵn") để sắp xếp chung với bài tải lên. Nếu đã lưu danh sách ở admin rồi mới thêm bài vào `config.js`, dùng *"Thêm bằng đường link"* với link đầy đủ `https://<tên-app>.onrender.com/assets/music/ten-file.mp3`.
- Hoặc **dán link ngoài**: ảnh / mp3 đã có sẵn trên mạng (link `https://…` trực tiếp tới file) dùng được ở mọi ô ảnh / nhạc trong admin.
- Vào **Kho tệp** xoá file không dùng; xem tổng dung lượng đã dùng ở đầu mục.

### Biến môi trường (file `.env` hoặc tab Environment của Render)
| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `ADMIN_PASSWORD` | `admin123` (có cảnh báo) | Mật khẩu `/admin` — **bắt buộc đặt** trước khi đưa lên mạng. |
| `PORT` | `3000` | Cổng chạy server (bận thì tự thử cổng kế tiếp). |
| `HOST` | `0.0.0.0` | Địa chỉ lắng nghe; `127.0.0.1` = chỉ máy mình. |
| `SESSION_HOURS` | `12` | Phiên đăng nhập admin kéo dài bao lâu (giờ). |
| `MAX_MESSAGE_LENGTH` | `1000` | Độ dài tối đa 1 lá thư (nên trùng `letter.maxLength` trong `config.js`). |
| `TRUST_PROXY` | `false` | Chạy sau Nginx / Render thì đặt `true` để chống spam đúng IP (lấy IP cuối trong `X-Forwarded-For`). Chạy trực tiếp thì để `false`. |
| `DATA_DIR` | `./data` | Thư mục chứa `letters.json`, `stats.json`, `content.json`, `media.json` và `uploads/`. Có thể là đường dẫn tuyệt đối (VD ổ đĩa gắn thêm `/var/data`). |
| `MAX_IMAGE_MB` | `10` | Dung lượng tối đa mỗi ảnh tải lên (MB). |
| `MAX_AUDIO_MB` | `30` | Dung lượng tối đa mỗi file nhạc tải lên (MB). |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | trống | Đặt đủ 2 biến → lưu mọi thứ trên Upstash thay vì ổ đĩa. |
| `STORAGE_PREFIX` | `profile` | Tiền tố khoá trên Upstash (chỉ đổi khi nhiều website dùng chung 1 database). |

Mẫu đầy đủ có chú thích: `.env.example`.

---

## 9. Đưa web lên mạng (miễn phí)

Web có backend Node.js (để nhận thư, lưu nội dung admin, nhận file tải lên) nên **không** chạy được trên GitHub Pages / Netlify tĩnh. Cách miễn phí đơn giản nhất: **GitHub** (chứa code) + **Render** (chạy server) + **Upstash** (giữ thư, nội dung admin và ảnh / nhạc tải lên không bị mất). Cả ba đều không cần thẻ tín dụng. Mất khoảng 20–30 phút lần đầu.

> Vì sao cần Upstash? Gói miễn phí của Render có **ổ đĩa tạm**: mỗi lần server khởi động lại (deploy, hoặc sau 15 phút không ai truy cập) thì thư mục `data/` bị xoá sạch — thư, nội dung đã sửa ở admin và **ảnh / nhạc đã tải lên** đều mất. Upstash là kho lưu trữ miễn phí bên ngoài, mọi thứ sẽ nằm ở đó thay vì trên ổ đĩa của Render (xem giới hạn dung lượng ở mục 8). Nếu bạn chạy trên VPS riêng thì không cần.

### Bước 1 — Chuẩn bị trước khi đưa lên
- Thay nội dung của bạn trong `public/js/config.js`, bỏ avatar / nhạc vào `public/assets/` (hoặc để sau, tải lên ở `/admin`).
- `.env` **không** được đưa lên GitHub (đã nằm trong `.gitignore`), thư mục `data/uploads/` và các file `data/*.json` cũng vậy.
- Nhạc: file mp3 không quá ~20 MB mỗi bài để đẩy lên GitHub nhanh (giới hạn 100 MB/file).

### Bước 2 — Đưa code lên GitHub
1. Tạo tài khoản tại <https://github.com> → **New repository** → đặt tên (VD `my-profile-website`), chọn **Private** nếu không muốn ai xem code (Render vẫn deploy được repo private) → **Create**.
2. Cách dễ nhất không cần lệnh: cài **GitHub Desktop** (<https://desktop.github.com>) → **File → Add local repository** → chọn thư mục `my-profile-website` → **Publish repository**.
   - Hoặc trên web: vào repo vừa tạo → **Add file → Upload files** → kéo thả *toàn bộ nội dung* trong thư mục `my-profile-website` (các thư mục `public`, `data`, file `server.js`, `package.json`, `render.yaml`, `.env.example`…; **không** kéo file `.env`) → **Commit changes**.

### Bước 3 — Tạo kho lưu trữ trên Upstash
1. Đăng ký tại <https://upstash.com> (đăng nhập bằng GitHub/Google được).
2. **Create Database** → loại **Redis** → đặt tên, chọn region gần Việt Nam (VD *Singapore* / *ap-southeast-1*) → **Create**.
3. Mở database vừa tạo, kéo xuống mục **REST API**: copy hai giá trị **UPSTASH_REDIS_REST_URL** và **UPSTASH_REDIS_REST_TOKEN** (giữ bí mật token).

### Bước 4 — Deploy lên Render
1. Đăng ký tại <https://render.com> (đăng nhập bằng GitHub) → **New → Blueprint** → chọn repo của bạn. Render đọc file `render.yaml` có sẵn trong dự án.
2. Render hỏi 3 biến: nhập **ADMIN_PASSWORD** (mật khẩu trang admin), **UPSTASH_REDIS_REST_URL** và **UPSTASH_REDIS_REST_TOKEN** (lấy ở bước 3) → **Apply**.
3. Đợi 1–2 phút. Khi trạng thái **Live**, bấm vào link dạng `https://my-profile-website.onrender.com` — đó là website của bạn. Trang admin: thêm `/admin` vào sau.
4. Kiểm tra: mở `https://<tên-app>.onrender.com/api/health` phải thấy `"storage":"upstash"`. Nếu thấy `"file"` nghĩa là chưa điền đúng 2 biến Upstash (vào **Environment** của service để sửa, Render sẽ tự deploy lại) — lúc này **đừng tải file lên**, chúng sẽ mất khi server khởi động lại.
5. Muốn đổi giới hạn file tải lên: thêm biến `MAX_IMAGE_MB` / `MAX_AUDIO_MB` ở tab **Environment**.

Nếu không muốn dùng Blueprint: **New → Web Service** → chọn repo → Runtime *Node*, Build command `npm install`, Start command `node server.js`, plan *Free* → thêm các biến môi trường ở tab **Environment** như trên.

### Sau khi lên mạng
- **Sửa nội dung**: vào `https://<tên-app>.onrender.com/admin` — sửa xong bấm Lưu là trang cập nhật ngay, không cần deploy.
- **Cập nhật code / config.js**: sửa file trên máy → đẩy lên GitHub (GitHub Desktop: *Commit* → *Push*) → Render tự deploy lại sau ~1 phút.
- **Tên miền riêng** (VD `ten-ban.com`): mua tên miền ở bất kỳ nhà cung cấp nào → Render → service → **Settings → Custom Domains → Add** → làm theo hướng dẫn trỏ DNS (CNAME). HTTPS tự động, miễn phí.
- **Web "ngủ" khi vắng khách**: gói Free tắt server sau 15 phút không có người xem, người tiếp theo phải đợi khoảng 30–60 giây lần đầu. Muốn web luôn sẵn sàng: dùng dịch vụ ping miễn phí như <https://cron-job.org> gọi `https://<tên-app>.onrender.com/api/health` mỗi 10 phút, hoặc nâng lên gói trả phí của Render.
- **Sao lưu**: thư xem ở `/admin`; dữ liệu nằm trong **Data Browser** của Upstash (khoá `profile:letters`, `profile:content`, `profile:media`, `profile:blob:…`).

### Lựa chọn khác
- **Railway** (<https://railway.com>): tương tự Render, có dùng thử rồi trả phí nhỏ (~5 USD/tháng), không ngủ. Vẫn nên dùng Upstash hoặc gắn **Volume** rồi đặt `DATA_DIR` trỏ vào thư mục của volume.
- **VPS** (Vultr, DigitalOcean, Hetzner, hoặc nhà cung cấp Việt Nam ~100k/tháng): toàn quyền, không ngủ, mọi thứ lưu ngay trên máy chủ (không cần Upstash, không giới hạn dung lượng ngoài ổ đĩa):
  ```bash
  npm install -g pm2
  pm2 start server.js --name profile
  pm2 save && pm2 startup
  ```
  rồi trỏ tên miền qua Nginx (reverse proxy về cổng 3000, nhớ đặt `client_max_body_size 32m;` để tải được file nhạc lớn) và bật HTTPS bằng Certbot.
- **Chỉ cần trang tĩnh** (bỏ thư, admin): đặt `letter.enabled: false` và `showViews: false` trong `config.js`, rồi upload nguyên thư mục `public/` lên GitHub Pages / Netlify / Vercel. Sách lật trang, trang tự soạn trong `config.js`, nhạc và linh vật vẫn chạy.

---

## 10. Câu hỏi thường gặp

**Đăng nhập admin báo "Lỗi 405" / gửi thư không được?** Trang đang được mở bằng một server tĩnh khác (Live Server của VS Code ở cổng 5500, `http-server`, GitHub Pages…) chứ không phải `server.js`. Hãy chạy `node server.js` trong thư mục dự án và mở đúng `http://localhost:3000` (admin: `http://localhost:3000/admin`).

**Chạy báo `listen EACCES ... :3000` (Windows)?** Cổng 3000 bị Windows giữ (hay gặp khi máy có Hyper-V/WSL). Server sẽ tự chuyển sang cổng kế tiếp và in ra địa chỉ mới — mở đúng địa chỉ đó. Muốn cố định cổng: đặt `PORT=8080` trong `.env`, hoặc chạy `$env:PORT=8080; node server.js` trong PowerShell.

**Ảnh / nhạc tải lên ở admin tự nhiên mất, trang hiện "Không tải được ảnh"?** Web đang chạy trên host có ổ đĩa tạm (Render / Railway gói miễn phí) mà chưa cấu hình Upstash — xem mục 8 và 9. Cấu hình xong thì tải lại file và chọn lại ở admin.

**Sửa `config.js` mà trang không đổi?** Phần đó đã được lưu ở `/admin` (admin được ưu tiên). Vào mục tương ứng ở `/admin` → **Khôi phục mặc định**.

**Không thấy nút "✎ Chỉnh sửa"?** Nút chỉ hiện trên trình duyệt đang đăng nhập `/admin` và phiên còn hạn (server khởi động lại là phiên mất — đăng nhập lại).

**Nhạc không tự phát?** Trình duyệt chỉ cho phát nhạc sau khi người dùng có thao tác — đó là lý do có nút OK ở popup. Nếu tắt popup (`showEveryVisit: false`), người xem phải bấm ▶ thủ công.

**Lật trang không được / trang xếp dọc?** File `js/book.js` không tải được (kiểm tra lại đã upload đủ thư mục `public/js/`). Khi đó các trang tự xếp dọc như một trang web thường, vẫn đọc được hết.

**GIF không hiện?** Link Tenor có thể bị chặn ở vài mạng. Tải GIF về `public/assets/welcome.gif` rồi đổi `welcome.gif: "assets/welcome.gif"`. Nếu ảnh lỗi, trang tự hiện 🐱 thay thế.

**Muốn đổi đường dẫn trang admin?** Đổi tên `public/admin.html`, dòng `if (decoded === "/admin")` trong `server.js`, và các link `admin#…` của nút "✎ Chỉnh sửa" trong `public/js/main.js`.

**Thư / nội dung lưu ở đâu?** Chạy trên máy / VPS: thư mục `data/` (`letters.json`, `content.json`, `media.json`, `uploads/` — mở bằng trình soạn thảo bất kỳ để sao lưu). Chạy trên Render với Upstash: trong database Upstash, các khoá `profile:…`.
