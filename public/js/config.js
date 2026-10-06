/* ============================================================
 *  ⭐ FILE CẤU HÌNH — HẦU HẾT MỌI THỨ BẠN MUỐN ĐỔI ĐỀU Ở ĐÂY ⭐
 * ------------------------------------------------------------
 *  Sửa xong chỉ cần lưu file và tải lại trang (F5).
 * ============================================================ */
window.SITE_CONFIG = {

  /* ---------- 1. MÀU SẮC: 2 CHẾ ĐỘ ----------
   *  Phong cách "cuốn sách da". Mỗi chế độ có bảng màu riêng, đổi là đổi cả trang (kể cả trang admin):
   *    leather  : nền trang web (da bìa sách)      glow    : ánh đèn / ánh nến hắt lên nền
   *    paper    : trang giấy                       paper2  : ô player, ô nhập, viền phụ
   *    ink      : chữ                              muted   : chữ phụ
   *    accent   : nút chính, nút play, thanh nhạc  accent2 : ruy băng đánh dấu trang, nút gửi thư
   *    gold     : khung kẻ, hoa văn, số La Mã
   *  Chế độ sáng = bảng màu Coffee / Maroon / Clay Dust / Creme / Leather Couch / Deep Peach / Guave / River Pine.
   *  Chế độ tối  = bảng màu B72D29 / 57645B / 2A0D12 / 2A2E2F / 170F12.
   */
  theme: {
    light: {
      leather: "#371e13", glow: "#734f31", paper: "#e1d3a9", paper2: "#c0aa8a",
      ink: "#371e13", muted: "#534b31", accent: "#a85530", accent2: "#5e2a25", gold: "#8f7c3a",
    },
    dark: {
      leather: "#170f12", glow: "#2a0d12", paper: "#2a2e2f", paper2: "#2a0d12",
      ink: "#e8dfd0", muted: "#a7ada6", accent: "#b72d29", accent2: "#57645b", gold: "#a08447",
    },
    default: "light",   // "light" | "dark" | "auto" (theo cài đặt sáng/tối trên máy người xem)
    toggle: true,       // hiện nút chuyển sáng/tối ở góc trên phải (người xem được nhớ lựa chọn)
  },

  /* ---------- 2. THÔNG TIN CÁ NHÂN ---------- */
  name: "Ngọa",                          // Tên hiển thị
  username: "@whisky2ball",                      // Hiện ở chân trang
  pageTitle: "Ngọa ✦ profile",            // Tiêu đề tab trình duyệt
  ribbon: "       ",                      // Chữ trên ruy băng đánh dấu trang ("" để ẩn ruy băng)
  bio: "Xin chào, mình là Tiến. Cảm ơn bạn đã ghé thăm.",
  bioTypingEffect: true,                   // Hiệu ứng gõ chữ cho bio (false = hiện luôn)
  avatar: "assets/avatar.png",             // 👉 Thay bằng ảnh của bạn: để file vào public/assets/ rồi đổi tên ở đây, VD "assets/avatar.jpg"
  verified: true,                          // Tick xác minh cạnh tên

  /* ---------- 3. MẠNG XÃ HỘI ----------
   *  icon: tên icon trong bộ Tabler Icons (nét viền). Có sẵn trong assets/icons/sprite.svg:
   *    brand-facebook, brand-instagram, brand-linkedin, brand-github, brand-tiktok, brand-telegram,
   *    brand-x, brand-twitter, brand-threads, brand-youtube, brand-discord, brand-spotify, brand-twitch,
   *    brand-pinterest, brand-snapchat, brand-whatsapp, brand-messenger, brand-reddit, brand-behance,
   *    brand-dribbble, brand-figma, brand-notion, brand-line, brand-wechat, mail, phone, link, world, at, home
   *  Muốn icon khác (VD Zalo): mở https://tabler.io/icons → copy SVG → dán thành <symbol> mới trong sprite.svg (xem README).
   *  Xoá / thêm dòng tuỳ ý. Để url rỗng "" thì icon sẽ không hiện. */
  socials: [
    { name: "Facebook",  icon: "brand-facebook",  url: "https://www.facebook.com/traumreiii" },
    { name: "Instagram", icon: "brand-instagram", url: "https://www.instagram.com/whisky2ball/" },
    { name: "LinkedIn",  icon: "brand-linkedin",  url: "https://linkedin.com/" },
    { name: "GitHub",    icon: "brand-github",    url: "https://github.com/nmtien1302" },
    { name: "TikTok",    icon: "brand-tiktok",    url: "" },
    { name: "Telegram",  icon: "brand-telegram",  url: "" },
    { name: "Email",     icon: "mail",            url: "nmtienlop10a4@gmail.com" },
  ],

  /* ---------- 4. POPUP CHÀO MỪNG (hiện khi mới vào trang) ---------- */
  welcome: {
    // GIF mèo gõ laptop (link Tenor). Muốn dùng file riêng: tải gif về public/assets/ rồi đổi thành "assets/welcome.gif"
    gif: "https://media1.tenor.com/m/8wBCqZH60U8AAAAC/computer-cat.gif",
    title: "Chào mừng bạn ghé thăm",
    // Lời chào theo giờ trong ngày (tự động chọn theo giờ máy người xem)
    greetings: {
      morning:   "Chào buổi sáng",
      noon:      "Chào buổi trưa",
      afternoon: "Chào buổi chiều",
      evening:   "Chào buổi tối",
      night:     "Đêm đã khuya, nhớ nghỉ ngơi",
    },
    // Mỗi lần vào sẽ chọn ngẫu nhiên 1 câu
    wishes: [
      "Chúc bạn một ngày tốt lành và nhiều niềm vui.",
      "Mong hôm nay của bạn nhẹ nhàng và may mắn.",
      "Chúc bạn luôn vui vẻ, khoẻ mạnh và bình an.",
      "Mong những điều tốt đẹp sẽ tìm đến bạn hôm nay.",
      "Nhớ uống đủ nước và cười thật nhiều nhé.",
    ],
    button: "OK",
    hint: "Bấm OK để mở trang và bật nhạc",
    showEveryVisit: true,                  // false = mỗi phiên trình duyệt chỉ hiện 1 lần
  },

  /* ---------- 5. DANH SÁCH NHẠC ----------
   *  Người xem đổi bài ngay trên profile (nút "Đổi nhạc" / prev / next).
   *  Mỗi bài BẮT BUỘC có title (tên bài) + artist (tác giả) để hiển thị "Tên bài - Tác giả".
   *  src: đường dẫn file mp3 trong public/assets/music/ hoặc link trực tiếp.
   *  cover: ảnh bìa (không có thì dùng avatar).
   *
   *  👉 3 bài dưới đây chỉ là nhạc demo (SoundHelix) để player chạy được ngay.
   *     Hãy thay bằng nhạc của bạn: copy file vào public/assets/music/ rồi sửa lại, ví dụ:
   *     { title: "Tên bài hát", artist: "Tên ca sĩ / tác giả", src: "assets/music/ten-file.mp3", cover: "assets/covers/ten-anh.jpg" },
   */
  songs: [
    { title: "I Thought I Saw Your Face Today ", artist: " She & Him", src: "assets/music/I Thought I Saw Your Face Today.mp3", cover: "" },
    { title: "HAKO ", artist: " Sunny", src: "assets/music/HAKO - Sunny .mp3", cover: "" },
    { title: "Ngồi Nhìn Em Khóc", artist: "Sáo", src: "assets/music/Ngồi Nhìn Em Khóc.mp3", cover: "" },
  ],
  player: {
    autoplay: true,        // Tự phát sau khi bấm OK ở popup
    volume: 0.6,           // Âm lượng mặc định (0 → 1)
    rememberLastSong: true // Nhớ bài đang nghe lần trước (lưu trong trình duyệt người xem)
  },

  /* ---------- 6. THƯ GỬI ADMIN ---------- */
  letter: {
    enabled: true,
    buttonText: "Gửi thư cho tớ",
    title: "Thư gửi tớ",
    description: "Chỉ mình đọc được thư này. Bạn có thể để lại tên hoặc gửi ẩn danh.",
    maxLength: 1000,        // Nên trùng với MAX_MESSAGE_LENGTH trong file .env
    successText: "Đã gửi thư, cảm ơn bạn.",
  },

  /* ---------- 7. KHÁC ---------- */
  showViews: true,          // Hiện số lượt ghé thăm ở chân trang (cần chạy server)
  background: {
    image: "",              // Muốn thêm ảnh nền phía sau lớp da: "assets/background.jpg" (hiện mờ, vẫn giữ ánh đèn)
  },
};
