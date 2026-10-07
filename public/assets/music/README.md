# Thư mục nhạc

Có 2 cách thêm nhạc cho trang profile:

## Cách 1 — Tải lên ở trang admin (dễ nhất)

Vào `/admin` → mục **Âm nhạc** → bấm **Thêm bài hát từ máy** (hoặc kéo thả file vào), chọn được nhiều file một lúc, từ máy tính hoặc điện thoại:

- Nhận **MP3, M4A, AAC, OGG, WAV, FLAC, WebM**, tối đa 30 MB / bài (đổi bằng `MAX_AUDIO_MB` trong `.env`).
- Tự đọc **tên bài, ca sĩ và ảnh bìa** nằm sẵn trong file mp3 (thẻ ID3). File không có thẻ thì lấy theo tên file dạng `Tên bài - Ca sĩ.mp3` — sửa lại ngay trên dòng nếu cần.
- Kéo thả để đổi thứ tự, bấm ▶ để nghe thử, rồi bấm **Lưu danh sách**.
- File tải lên **không** nằm trong thư mục này mà trong `data/uploads/` (hoặc trên Upstash khi chạy trên Render — xem README chính, mục 8).

> ⚠️ Chạy trên Render / Railway gói miễn phí mà **chưa cấu hình Upstash** thì file tải lên sẽ mất mỗi khi server khởi động lại. Nhạc nặng nên dùng cách 2 bên dưới để khỏi tốn dung lượng Upstash.

## Cách 2 — Bỏ file vào thư mục này

Bỏ các file `.mp3` (hoặc `.m4a`, `.ogg`) của bạn vào đây (chúng được đưa lên GitHub cùng code), rồi khai báo trong `public/js/config.js`, phần `songs`:

```js
songs: [
  { title: "Tên bài hát", artist: "Tên ca sĩ / tác giả", src: "assets/music/ten-file.mp3", cover: "assets/covers/ten-anh.jpg" },
],
```

Các bài này cũng hiện trong `/admin` → **Âm nhạc** (nhãn "Tệp có sẵn") để sắp xếp chung với bài tải lên.
Nếu đã lưu danh sách ở `/admin` rồi mới thêm file vào đây: ở admin bấm **Thêm bằng đường link** và dán link đầy đủ
`https://<tên-miền-của-bạn>/assets/music/ten-file.mp3` (hoặc bấm **Khôi phục mặc định** để quay về danh sách trong `config.js`).

Lưu ý:
- `title` + `artist` là **bắt buộc** — trang sẽ hiển thị "Tên bài hát - Tác giả" để ghi nhận tác giả.
- `cover` không bắt buộc; bỏ trống thì dùng avatar làm ảnh bìa.
- Tên file nên viết không dấu, không khoảng trắng (VD: `giu-lay-lam-gi.mp3`) — có dấu / khoảng trắng vẫn chạy, nhưng dễ gõ nhầm.
- Danh sách nhạc đã lưu ở `/admin` được ưu tiên hơn `config.js` (bấm **Khôi phục mặc định** ở admin để quay lại danh sách trong `config.js`).

> Lưu ý bản quyền: ghi tên tác giả **không** đồng nghĩa với việc được phép sử dụng.
> Nên dùng nhạc của chính bạn hoặc nhạc miễn phí bản quyền (Pixabay Music, Free Music Archive, YouTube Audio Library...) và đọc kỹ giấy phép từng bài.
