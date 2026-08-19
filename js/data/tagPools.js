/**
 * Kho Trope & Tag Truyện Phim Ngắn / Zhihu Trung Quốc
 * Đầy đủ các trope thịnh hành: Vả mặt, Trọng sinh, Hào môn, Xuyên thư, Thật giả thiên kim...
 */

export const STORY_TONES = [
  {
    id: "dramatic",
    icon: "⚡",
    name: "Kịch Tính / Vả Mặt",
    subname: "Zhihu Short Drama",
    desc: "Nhịp nhanh, đấu trí gay gắt, bóc trần bộ mặt giả tạo, vả mặt sảng khoái, plot twist giật gân.",
    badge: "Hot Zhihu",
    promptInstruction: `VĂN PHONG PHIM NGẮN ZHIHU / KỊCH TÍNH CAO:
- Nhịp điệu cực nhanh, mở đầu giật gân (hook mạnh), xung đột leo thang gay gắt.
- Yếu tố "Vả mặt" (打脸) cực mạnh, sảng khoái, hả dạ, dứt khoát không mềm lòng.
- Lời thoại đanh thép, châm biếm thâm sâu, các pha gài bẫy và lật ngược tình thế (plot twist) chấn động.`
  },
  {
    id: "sweet_romance",
    icon: "🌸",
    name: "Tình Cảm / Ngọt Sủng",
    subname: "Sweet Romance",
    desc: "Ngọt ngào, cưng chiều, tương tác rung động tinh tế, tình cảm chân thành, không ngược, HE mỹ mãn.",
    badge: "Ngọt ngào",
    promptInstruction: `VĂN PHONG TÌNH CẢM LÃNG MẠN / NGỌT SỦNG (SWEET ROMANCE):
- Tập trung vào cảm xúc rung động, sự thấu hiểu, chở che và cưng chiều lẫn nhau giữa các nhân vật chính.
- Tương tác đối thoại ngọt ngào, duyên dáng, những khoảnh khắc tình tứ và sự quan tâm tinh tế khiến độc giả rung động.
- TUYỆT ĐỐI KHÔNG ngược tâm vô lý, KHÔNG có hiểu lầm dây dưa gây ức chế, kết thúc có hậu (HE) trọn vẹn và hạnh phúc.`
  },
  {
    id: "healing_life",
    icon: "☕",
    name: "Đời Thường / Chữa Lành",
    subname: "Slice of Life / Healing",
    desc: "Nhịp sống bình yên, ấm áp đời thường, tình thân bạn bè, xoa dịu tổn thương, nhẹ nhàng sâu lắng.",
    badge: "Chữa lành",
    promptInstruction: `VĂN PHONG ĐỜI THƯỜNG / CHỮA LÀNH (SLICE OF LIFE / HEALING):
- Tập trung vào cuộc sống thường nhật, những chi tiết sinh hoạt bình dị, hương vị khói lửa nhân gian.
- Nhấn mạnh tình cảm gia đình, tình bạn chân thành, sự sẻ chia xoa dịu những vết thương tâm hồn.
- Giọng văn nhẹ nhàng, ấm áp, thư thái, mang lại sự bình yên và năng lượng tích cực cho người đọc.
- TUYỆT ĐỐI KHÔNG CÓ đấu đá độc hại, KHÔNG có vả mặt đao to búa lớn hay drama mưu mô hiểm độc.`
  },
  {
    id: "cozy_farming",
    icon: "🌾",
    name: "Điền Văn / Làm Giàu",
    subname: "Cozy Farming & Wealth",
    desc: "Làm nông, buôn bán, kinh doanh ẩm thực, từng bước làm giàu, xây dựng cuộc sống an cư lạc nghiệp.",
    badge: "Làm giàu",
    promptInstruction: `VĂN PHONG ĐIỀN VĂN / LÀM GIÀU BÌNH DỊ:
- Từng bước gây dựng sự nghiệp, kinh doanh buôn bán hoặc phát triển trồng trọt chăn nuôi, ẩm thực ngon mắt.
- Cuộc sống gia đình ấm êm thuận hòa, các nhân vật đoàn kết cùng nhau làm giàu, tích lũy của cải.
- Không khí gần gũi, thực tế, tạo cảm giác thành tựu và an yên sau mỗi nỗ lực.`
  },
  {
    id: "humorous_comedy",
    icon: "😂",
    name: "Hài Hước / Ăn Dưa",
    subname: "Comedy / Fun Drama",
    desc: "Đối thoại dí dỏm, tình huống dở khóc dở cười, nhân vật lầy lội, giải trí thả ga sảng khoái.",
    badge: "Hài hước",
    promptInstruction: `VĂN PHONG HÀI HƯỚC / ĂN DƯA HÓNG BIẾN (COMEDY):
- Tình huống trớ trêu, dở khóc dở cười, đối thoại duyên dáng, mặn mà, đầy bất ngờ.
- Nhân vật có nét tính cách thú vị, độc lạ, 'cá mặn' thích nằm yên hoặc chuyên gia 'hóng hớt drama'.
- Mang lại tiếng cười sảng khoái, không khí vui tươi, lạc quan và hài hước giải trí.`
  },
  {
    id: "mystery_suspense",
    icon: "🔍",
    name: "Trinh Thám / Ly Kỳ",
    subname: "Mystery & Suspense",
    desc: "Suy luận logic, vén màn bí mật từng lớp, bầu không khí hồi hộp, phá án hấp dẫn.",
    badge: "Phá án",
    promptInstruction: `VĂN PHONG TRINH THÁM / PHÁ ÁN LY KỲ:
- Bầu không khí hồi hộp, các manh mối cài cắm tinh tế, suy luận logic và thông minh.
- Từng bước bóc tách sự thật đằng sau những vụ việc bí ẩn, vén màn chân tướng bất ngờ.
- Nhịp truyện chặt chẽ, cuốn hút người đọc vào hành trình tìm kiếm sự thật.`
  }
];

export const TROPE_CATEGORIES = [
  {
    category: "Phong Cách & Cốt Truyện",
    tags: [
      { id: "zhihu_style", name: "Zhihu style", highlight: true },
      { id: "va_mat", name: "Vả mặt cực mạnh", highlight: true },
      { id: "ngot_sung", name: "Ngọt sủng không ngược", highlight: true },
      { id: "chua_lanh", name: "Chữa lành (Healing)", highlight: true },
      { id: "doi_thuong", name: "Đời thường ấm áp", highlight: true },
      { id: "plot_twist", name: "Plot twist bất ngờ", highlight: true },
      { id: "bao_thu", name: "Báo thù" },
      { id: "an_dua", name: "Ăn dưa hóng drama" },
      { id: "he_thong", name: "Hệ thống" },
      { id: "sang_van", name: "Sảng văn vui vẻ" },
      { id: "cau_huyet", name: "Cẩu huyết kịch tính" },
      { id: "hai_huoc", name: "Hài hước mặn mòi" }
    ]
  },
  {
    category: "Bối Cảnh & Thiết Lập Thế Giới",
    tags: [
      { id: "hao_mon", name: "Hào môn thế gia" },
      { id: "hien_dai", name: "Hiện đại đô thị" },
      { id: "thanh_xuan", name: "Thanh xuân vườn trường" },
      { id: "dien_van", name: "Điền văn làm giàu" },
      { id: "quan_an_nho", name: "Quán ăn nhỏ / Tiệm bánh" },
      { id: "nong_thon_yen_binh", name: "Nông thôn yên bình" },
      { id: "gioi_giai_tri", name: "Giới giải trí" },
      { id: "that_gia_thien_kim", name: "Thật giả thiên kim" },
      { id: "trong_sinh", name: "Trọng sinh" },
      { id: "xuyen_thu", name: "Xuyên thư" },
      { id: "huyen_hoc", name: "Huyền học đoán mệnh" },
      { id: "mat_the", name: "Mạt thế tích trữ" },
      { id: "co_dai", name: "Cổ đại gia đình / Cung đình" },
      { id: "tien_hiep", name: "Tu chân tiên hiệp" },
      { id: "dan_quoc", name: "Dân quốc hào môn" }
    ]
  },
  {
    category: "Hình Tượng & Tuyến Nhân Vật",
    tags: [
      { id: "cuoi_truoc_yeu_sau", name: "Cưới trước yêu sau", highlight: true },
      { id: "song_huong_tham_luyen", name: "Song hướng thầm mến", highlight: true },
      { id: "thanh_mai_truc_ma", name: "Thanh mai trúc mã" },
      { id: "am_ap_diu_dang", name: "Ấm áp dịu dàng" },
      { id: "nu_cuong", name: "Nữ cường" },
      { id: "nam_cuong", name: "Nam cường" },
      { id: "ca_man", name: "Cá mặn (thích nằm yên)" },
      { id: "tong_tai_ba_dao", name: "Tổng tài thâm tình" },
      { id: "dai_lao_an_than", name: "Đại lão ẩn thân" },
      { id: "tra_nam_tra_xanh", name: "Tra nam trà xanh" },
      { id: "me_ke", name: "Mẹ kế độc ác" }
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
    "Sau khi tốt nghiệp, tôi về quê thừa kế một quán trà nhỏ ven sông, mở ra những ngày tháng pha trà ngắm mưa và lắng nghe tâm sự của lữ khách qua đường.",
    "Tôi cùng học thần lạnh lùng của trường kết hôn giả theo hôn ước gia đình, ai ngờ sau khi về chung một nhà hắn lại cưng chiều tôi lên tận trời.",
    "Trọng sinh về năm hai mươi tuổi, tôi không bon chen chốn hào môn nữa mà dọn ra vùng ngoại ô mở tiệm bánh ngọt, sống những ngày tháng bình yên thơm nức mùi bơ sữa.",
    "Vào ngày đính hôn với Thái tử gia Bắc Kinh, tôi vô tình nghe thấy hắn cùng cô em gái nuôi bàn bạc cách chuyển toàn bộ tài sản của tôi sang tên cô ta.",
    "Tôi là nữ phụ độc ác trong tiểu thuyết, theo kịch bản hôm nay tôi phải nhảy lầu để đe dọa nam chính, nhưng tôi quyết định cầm 500 tỷ rồi lui về hậu trường ăn dưa.",
    "Sau khi trọng sinh về ngày bị ép gả cho 'đại ma đầu' tàn tật của Lục gia, tôi không chạy trốn nữa mà lập tức ký giấy đăng ký kết hôn.",
    "Một ngày bình thường, tôi nhặt được một chú mèo hoang bị thương trước cửa nhà, không ngờ hôm sau có một vị tổng tài lạnh lùng đến gõ cửa cảm ơn."
  ];
  return premises[Math.floor(Math.random() * premises.length)];
}
