/**
 * Kho Trope & Tag Truyện Phim Ngắn / Zhihu Trung Quốc
 * Đầy đủ các trope thịnh hành: Vả mặt, Trọng sinh, Hào môn, Xuyên thư, Thật giả thiên kim...
 */

export const STORY_TONES = [
  {
    id: "auto",
    icon: "🎲",
    name: "Để AI Tự Chọn Tông Giọng",
    subname: "Auto / AI Choice",
    desc: "AI tự động đa dạng hóa: 3 bản đề xuất sẽ mang 3 phong cách khác biệt từ 7 tông truyện lớn (Học đường, Điền văn, Chữa lành, Hài hước, Kịch tính, Ngọt sủng, Trinh thám).",
    badge: "Tự động 100%",
    promptInstruction: `TỰ ĐỘNG LỰA CHỌN PHONG CÁCH TỐI ƯU TỪ 7 TÔNG TRUYỆN:
- Hãy tự do sáng tạo 3 bản đề xuất với 3 sắc thái và phong cách khác biệt hoàn toàn, được chọn lọc từ 7 Tông truyện lớn: [Học Đường / Thanh Xuân], [Điền Văn / Làm Giàu], [Đời Thường / Chữa Lành], [Hài Hước / Ăn Dưa], [Kịch Tính / Vả Mặt], [Tình Cảm / Ngọt Sủng], [Trinh Thám / Ly Kỳ].
- Tuyệt đối phân tích các điều người dùng CẦN TRÁNH trong ý tưởng để chọn 3 tông truyện phù hợp nhất mà không phạm vào điều cấm.`
  },
  {
    id: "youth_campus",
    icon: "🎓",
    name: "Học Đường / Thanh Xuân",
    subname: "Youth & Campus",
    desc: "Thanh xuân vườn trường, thi cử phấn đấu, tình cảm trong sáng e ấp hoặc nghịch tập học bá, hoài niệm rực rỡ.",
    badge: "Thanh xuân",
    promptInstruction: `VĂN PHONG THANH XUÂN VƯỜN TRƯỜNG / HỌC ĐƯỜNG:
- Bầu không khí trong trẻo, hoài niệm, ngập tràn hơi thở thanh xuân, tiếng ve sầu mùa hạ, sân bóng, bàn học, kỳ thi đại học (Cao khảo) hoặc giảng đường đại học.
- Tuyến nhân vật: Học bá lạnh lùng hoặc ấm áp, học tra nghịch tập nỗ lực, bạn cùng bàn chân thành, thầy cô tâm huyết.
- Tuyến tình cảm: Trong sáng, rung động tinh tế, song hướng thầm mến hoặc cùng nhau tiến bộ vì mục tiêu tương lai. TUYỆT ĐỐI KHÔNG dung tục, KHÔNG có mô-típ tổng tài hào môn cẩu huyết.
- Xung đột tuổi trẻ: Áp lực thi cử, định hướng tương lai, tình bạn chân chính, sự trưởng thành sau những hiểu lầm ngây ngô.`
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
    category: "🎯 Cam Kết Cảm Xúc & Động Cơ (Emotional Payoffs)",
    tags: [
      { id: "va_mat", name: "Vả mặt cực mạnh", highlight: true },
      { id: "nghich_tap", name: "Nghịch tập sảng khoái", highlight: true },
      { id: "bao_thu", name: "Báo thù rửa hận", highlight: true },
      { id: "nguoc_tam_giang_xe", name: "Ngược luyến giằng xé", highlight: true },
      { id: "plot_twist", name: "Plot twist phản chuyển", highlight: true },
      { id: "truong_thanh_nhiet_huyet", name: "Trưởng thành nhiệt huyết" },
      { id: "sinh_ton_ngat_tho", name: "Sinh tồn ngạt thở" },
      { id: "nu_cuong_thuc_tinh", name: "Nữ cường thức tỉnh" },
      { id: "ngot_sung_cuu_roi", name: "Ngọt sủng cứu rỗi" },
      { id: "trinh_tham_hoi_hop", name: "Trinh thám phá án" },
      { id: "an_dua", name: "Ăn dưa hóng drama" },
      { id: "chua_lanh", name: "Chữa lành Healing" }
    ]
  },
  {
    category: "🔥 Mối Quan Hệ Áp Lực Cao (High-Pressure Relationships)",
    tags: [
      { id: "that_gia_thien_kim", name: "Thật giả thiên kim", highlight: true },
      { id: "tien_phu_tien_the", name: "Tiền phu / Tiền thê", highlight: true },
      { id: "the_than_bach_nguyet_quang", name: "Thế thân / Bạch nguyệt quang", highlight: true },
      { id: "o_re_hao_mon", name: "Ở rể / Gia tộc hào môn", highlight: true },
      { id: "cuu_mang_nhan_nham", name: "Cứu mạng / Nhận nhầm ân nhân" },
      { id: "ke_thu_hop_tac", name: "Kẻ thù buộc phải hợp tác" },
      { id: "thuong_vi_ngoai_lai", name: "Thượng vị giả / Ngoại lai giả" },
      { id: "hau_dai_tien_dai", name: "Hậu đài âm thầm / Anh hùng sân khấu" },
      { id: "chu_no_con_no", name: "Chủ nợ / Con nợ" },
      { id: "su_do_tong_mon", name: "Sư đồ / Tông môn ràng buộc" },
      { id: "hon_nhan_hop_dong", name: "Hôn nhân hợp đồng" }
    ]
  },
  {
    category: "⚡ Vũ Đài Xung Đột Công Khai (Conflict Arenas)",
    tags: [
      { id: "huy_hon_ly_hon_tai_tran", name: "Hủy hôn / Ly hôn tại trận", highlight: true },
      { id: "gia_yen_tho_yen", name: "Gia yến / Thọ yến hào môn", highlight: true },
      { id: "dau_gia_giam_bao", name: "Đấu giá ngầm / Giám bảo lật kèo", highlight: true },
      { id: "hoi_dong_tham_tra", name: "Hội đồng thẩm tra / Luận tội", highlight: true },
      { id: "tong_mon_thi_luyen", name: "Tông môn đại tỷ / Thí luyện" },
      { id: "livestream_boc_phot", name: "Livestream / Hot search bóc trần" },
      { id: "toa_an_phan_chia", name: "Tòa án / Tranh chấp thừa kế" },
      { id: "hop_phuc_ban_du_an", name: "Họp dự án / Phục bàn bắt lỗi" },
      { id: "phong_cap_cuu", name: "Hành lang phòng cấp cứu" }
    ]
  },
  {
    category: "🎬 Cảm Hứng Beat Kinh Điển (Classic Beat Remix)",
    tags: [
      { id: "kieu_than_an", name: "Kiểu Thần Ăn (Rớt đài -> Rèn nghề -> Tỏa sáng)", highlight: true },
      { id: "kieu_monte_cristo", name: "Kiểu Monte Cristo (Ẩn nhẫn đổi danh tính báo thù)", highlight: true },
      { id: "kieu_rashomon", name: "Kiểu Rashomon (Lời khai đa góc nhìn)" },
      { id: "kieu_ma_ba_dung", name: "Kiểu Ma Bá Dung (Tiểu nhân vật trong guồng máy lớn)" },
      { id: "kieu_chau_tinh_tri", name: "Kiểu Châu Tinh Trì (Tiểu nhân vật vươn lên ngoạn mục)" },
      { id: "kieu_sixth_sense", name: "Kiểu Sixth Sense (Đảo ngược toàn bộ tiền đề)" },
      { id: "kieu_moc_lan", name: "Kiểu Mộc Lan (Ẩn thân phá vỡ quy tắc)" },
      { id: "kieu_yes_minister", name: "Kiểu Yes Minister (Châm biếm đấu đá quyền lực)" }
    ]
  },
  {
    category: "🏞️ Bối Cảnh & Thiết Lập Thế Giới",
    tags: [
      { id: "hao_mon", name: "Hào môn thế gia" },
      { id: "hien_dai", name: "Hiện đại đô thị" },
      { id: "gioi_giai_tri", name: "Giới giải trí" },
      { id: "dien_van", name: "Điền văn làm giàu" },
      { id: "quan_an_nho", name: "Quán ăn nhỏ / Tiệm bánh" },
      { id: "trong_sinh", name: "Trọng sinh" },
      { id: "xuyen_thu", name: "Xuyên thư" },
      { id: "tien_hiep", name: "Tu chân tiên hiệp" },
      { id: "co_dai", name: "Cổ đại gia đình / Cung đình" },
      { id: "huyen_hoc", name: "Huyền học đoán mệnh" },
      { id: "mat_the", name: "Mạt thế tích trữ" },
      { id: "dan_quoc", name: "Dân quốc hào môn" },
      { id: "thanh_xuan", name: "Thanh xuân vườn trường" }
    ]
  },
  {
    category: "👥 Tuyến Nhân Vật & Hình Tượng",
    tags: [
      { id: "cuoi_truoc_yeu_sau", name: "Cưới trước yêu sau", highlight: true },
      { id: "song_huong_tham_luyen", name: "Song hướng thầm mến", highlight: true },
      { id: "nu_cuong", name: "Nữ cường quyết đoán" },
      { id: "nam_cuong", name: "Nam cường thâm sâu" },
      { id: "dai_lao_an_than", name: "Đại lão ẩn thân" },
      { id: "ca_man", name: "Cá mặn (thích nằm yên)" },
      { id: "tra_nam_tra_xanh", name: "Tra nam trà xanh" },
      { id: "me_ke", name: "Mẹ kế độc ác" },
      { id: "tong_tai_ba_dao", name: "Tổng tài thâm tình" },
      { id: "song_khiet", name: "Song khiết ngọt ngào" }
    ]
  }
];

// Danh sách tất cả các tag phẳng
export const ALL_TROPES = TROPE_CATEGORIES.flatMap(c => c.tags);

/**
 * Lấy ngẫu nhiên 3 - 5 tag trope phối hợp theo công thức kịch tính
 */
export function getRandomTropes(count = 4) {
  const shuffled = [...ALL_TROPES].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count).map(t => t.name);
}

/**
 * Mẫu ý tưởng mở đầu nhanh (Premise prompts gợi ý đa dạng kịch tính)
 */
export function getRandomSamplePremise() {
  const premises = [
    "Vào ngày gia yến thọ thần 80 tuổi của lão phu nhân Lục gia, em gái nuôi dâng lên một bức cổ họa giả rồi vu oan tôi tráo đổi đồ thật để bán lấy tiền tiêu xài.",
    "Ngày ký giấy ly hôn tại tòa án, vị hôn phu cũ ép tôi phải ra đi tay trắng, đúng lúc đó luật sư trưởng của tập đoàn tài phiệt số một Kinh Đô bước vào mang theo bản di chúc thật.",
    "Tôi là một đệ tử ngoại môn tạp vụ bị tông môn ruồng bỏ, trong buổi giám bảo linh vật ngầm, tất cả mọi người đều tranh nhau mua một viên ngọc phế phẩm còn tôi nhặt được truyền thừa thượng cổ.",
    "Sau khi trọng sinh về đúng khoảnh khắc bị ép gả thay cho vị đại lão tàn tật quái dị của Giang gia, tôi không khóc lóc bỏ trốn nữa mà thản nhiên cầm bút ký tên vào hợp đồng hôn nhân.",
    "Tôi vốn là thiên kim thật sự bị thất lạc 18 năm, ngày trở về gia đình hào môn, mẹ ruột nắm tay thiên kim giả nói: 'Nó yếu đuối từ nhỏ, con nhường phòng ngủ và hôn ước cho nó đi'.",
    "Một nhân viên kỹ thuật hậu đài nhỏ bé bị cấp trên cướp trắng công lao dự án trăm tỷ, trong buổi họp phục bàn toàn thể tập đoàn, anh ta đã dùng chính mã nguồn log để lật tẩy toàn bộ âm mưu.",
    "Sau khi tốt nghiệp, tôi về quê thừa kế một quán trà nhỏ ven sông, mở ra những ngày tháng pha trà ngắm mưa và lắng nghe tâm sự của lữ khách qua đường.",
    "Tôi cùng học thần lạnh lùng của trường kết hôn giả theo hôn ước gia đình, ai ngờ sau khi về chung một nhà hắn lại cưng chiều tôi lên tận trời.",
    "Tôi là nữ phụ độc ác trong tiểu thuyết, theo kịch bản hôm nay tôi phải nhảy lầu để đe dọa nam chính, nhưng tôi quyết định cầm 500 tỷ rồi lui về hậu trường ăn dưa."
  ];
  return premises[Math.floor(Math.random() * premises.length)];
}
