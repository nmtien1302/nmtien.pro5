# Thư mục nhạc

Bỏ các file `.mp3` (hoặc `.m4a`, `.ogg`) của bạn vào đây, rồi khai báo trong `public/js/config.js`, phần `songs`:

```js
songs: [
  { title: "Tên bài hát", artist: "Tên ca sĩ / tác giả", src: "assets/music/ten-file.mp3", cover: "assets/covers/ten-anh.jpg" },
],
```

- `title` + `artist` là **bắt buộc** — trang sẽ hiển thị "Tên bài hát - Tác giả" để ghi nhận tác giả.
- `cover` không bắt buộc; bỏ trống thì dùng avatar làm ảnh bìa.
- Tên file nên viết không dấu, không khoảng trắng (VD: `giu-lay-lam-gi.mp3`).

> Lưu ý bản quyền: ghi tên tác giả **không** đồng nghĩa với việc được phép sử dụng.
> Nên dùng nhạc của chính bạn hoặc nhạc miễn phí bản quyền (Pixabay Music, Free Music Archive, YouTube Audio Library...) và đọc kỹ giấy phép từng bài.
