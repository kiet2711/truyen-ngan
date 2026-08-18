/**
 * Kho Trope & Tag Truyện Phim Ngắn / Zhihu Trung Quốc
 * Đầy đủ các trope thịnh hành: Vả mặt, Trọng sinh, Hào môn, Xuyên thư, Thật giả thiên kim...
 */

export const TROPE_CATEGORIES = [
  {
    category: "Phong Cách & Cốt Truyện Kịch Tính",
    tags: [
      { id: "zhihu_style", name: "Zhihu style", highlight: true },
      { id: "va_mat", name: "Vả mặt cực mạnh", highlight: true },
      { id: "plot_twist", name: "Plot twist bất ngờ", highlight: true },
      { id: "bao_thu", name: "Báo thù", highlight: true },
      { id: "an_dua", name: "Ăn dưa hóng drama" },
      { id: "he_thong", name: "Hệ thống" },
      { id: "sang_van", name: "Sảng văn mất não" },
      { id: "cau_huyet", name: "Cẩu huyết kịch tính" },
      { id: "vo_han_luu", name: "Vô hạn lưu" },
      { id: "hai_huoc", name: "Hài hước mặn mòi" }
    ]
  },
  {
    category: "Bối Cảnh & Thiết Lập Thế Giới",
    tags: [
      { id: "hao_mon", name: "Hào môn thế gia" },
      { id: "gioi_giai_tri", name: "Giới giải trí" },
      { id: "that_gia_thien_kim", name: "Thật giả thiên kim" },
      { id: "trong_sinh", name: "Trọng sinh" },
      { id: "xuyen_thu", name: "Xuyên thư" },
      { id: "huyen_hoc", name: "Huyền học đoán mệnh" },
      { id: "mat_the", name: "Mạt thế tích trữ" },
      { id: "do_thi_di_nang", name: "Đô thị dị năng" },
      { id: "than_hao", name: "Thần hào tiêu tiền" },
      { id: "dien_van", name: "Điền văn làm giàu" },
      { id: "hien_dai", name: "Hiện đại" },
      { id: "co_dai", name: "Cổ đại cung đình" },
      { id: "tien_hiep", name: "Tu chân tiên hiệp" },
      { id: "dan_quoc", name: "Dân quốc hào môn" }
    ]
  },
  {
    category: "Hình Tượng & Tuyến Nhân Vật",
    tags: [
      { id: "nu_cuong", name: "Nữ cường" },
      { id: "nam_cuong", name: "Nam cường" },
      { id: "ca_man", name: "Cá mặn (thích nằm yên)" },
      { id: "me_ke", name: "Mẹ kế độc ác" },
      { id: "cuoi_truoc_yeu_sau", name: "Cưới trước yêu sau" },
      { id: "tra_nam_tra_xanh", name: "Tra nam trà xanh" },
      { id: "nguy_quan_tu", name: "Bạch liên hoa ngụy tạo" },
      { id: "tong_tai_ba_dao", name: "Tổng tài bá đạo" },
      { id: "dai_lao_an_than", name: "Đại lão ẩn thân" }
    ]
  }
];

// Danh sách tất cả các tag phẳng
export const ALL_TROPES = TROPE_CATEGORIES.flatMap(c => c.tags);

/**
 * Lấy ngẫu nhiên 3 - 5 tag trope
 */
export function getRandomTropes(count = 4) {
  const shuffled = [...ALL_TROPES].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count).map(t => t.name);
}

/**
 * Mẫu ý tưởng mở đầu nhanh (Premise prompts gợi ý)
 */
export function getRandomSamplePremise() {
  const premises = [
    "Vào ngày đính hôn với Thái tử gia Bắc Kinh, tôi vô tình nghe thấy hắn cùng cô em gái nuôi bàn bạc cách chuyển toàn bộ tài sản của tôi sang tên cô ta.",
    "Tôi vốn là thiên kim thật của hào môn Cố thị, ngày trở về lại thấy cả nhà cưng chiều thiên kim giả, bắt tôi nhường phòng và cung phụng cô ta.",
    "Sau khi trọng sinh về ngày bị ép gả cho 'đại ma đầu' tàn tật của Lục gia, tôi không chạy trốn nữa mà lập tức ký giấy đăng ký kết hôn.",
    "Tôi là nữ phụ độc ác trong tiểu thuyết, theo kịch bản hôm nay tôi phải nhảy lầu để đe dọa nam chính, nhưng tôi quyết định cầm 500 tỷ rồi lui về hậu trường ăn dưa.",
    "Bị mẹ kế và em gái trà xanh hãm hại tống vào tù oan, 3 năm sau tôi trở lại với tư cách là người thừa kế duy nhất của tập đoàn đối thủ.",
    "Hệ thống yêu cầu tôi phải công lược tra nam, tôi nhìn số dư tài khoản của tra nam rồi quyết định công lược luôn người chú quyền lực nhất gia tộc của hắn.",
    "Trong giới giải trí ai cũng bảo tôi là bình hoa dựa vào kim chủ, cho đến ngày gia tộc giàu nhất Kinh Đô livestream công khai nhận lại tôi là đại tiểu thư thất lạc."
  ];
  return premises[Math.floor(Math.random() * premises.length)];
}
