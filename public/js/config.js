/* ============================================================
 *  ⭐ FILE CẤU HÌNH — HẦU HẾT MỌI THỨ BẠN MUỐN ĐỔI ĐỀU Ở ĐÂY ⭐
 * ------------------------------------------------------------
 *  Sửa xong chỉ cần lưu file và tải lại trang (F5).
 * ============================================================ */
window.SITE_CONFIG = {
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
  name: "Ngọa",                        
  username: "@tien",                    
  pageTitle: "Tien ✦ profile",            
  ribbon: "           ",                     
  bio: "Xin chào, mình là Tiến. Cảm ơn bạn đã ghé thăm.",
  bioTypingEffect: true,                  
  avatar: "assets/avatar.svg",             
  verified: true,                          

  socials: [
    { name: "Facebook",  icon: "brand-facebook",  url: "https://www.facebook.com/traumreiii" },
    { name: "Instagram", icon: "brand-instagram", url: "https://www.instagram.com/whisky2ball/" },
    { name: "LinkedIn",  icon: "brand-linkedin",  url: "https://linkedin.com/" },
    { name: "GitHub",    icon: "brand-github",    url: "https://github.com/" },
    { name: "TikTok",    icon: "brand-tiktok",    url: "" },
    { name: "Telegram",  icon: "brand-telegram",  url: "" },
    { name: "Email",     icon: "mail",            url: "mailto:nmtienlop10a4@gmail.com" },
  ],

  welcome: {
    gif: "https://media1.tenor.com/m/8wBCqZH60U8AAAAC/computer-cat.gif",
    title: "Chào mừng bạn ghé thăm",
    greetings: {
      morning:   "Chào buổi sáng",
      noon:      "Chào buổi trưa",
      afternoon: "Chào buổi chiều",
      evening:   "Chào buổi tối",
      night:     "Đêm đã khuya, nhớ nghỉ ngơi",
    },
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
songs: [
  { title: "Duvet", artist: "Bôa", src: "assets/music/Duvet (Acoustic).mp3", cover: "" },
  { title: "mot nguoi vi em (midnight)",      artist: "WEAN", src: "assets/music/mot nguoi vi em (midnight).mp3",         cover: "" },
  { title: "ai dau can anh...",      artist: "Vxllish", src: "assets/music/ai dau can anh...-.mp3",         cover: "" },
],
  player: {
    autoplay: true,       
    volume: 0.6,          
    rememberLastSong: true 
  },

  /* ---------- 6. THƯ GỬI ADMIN ---------- */
  letter: {
    enabled: true,
    buttonText: "Gửi thư cho tớ",
    title: "Thư gửi tớ",
    description: "Chỉ mình đọc được thư này. Bạn có thể để lại tên hoặc gửi ẩn danh.",
    maxLength: 1000,      
    successText: "Đã gửi thư, cảm ơn bạn.",
  },

  /* ---------- 7. KHÁC ---------- */
  showViews: true,         
  background: {
    image: "",            
  },
};
