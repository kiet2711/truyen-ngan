/**
 * Gemini API Service - Tối ưu cho Văn Phong Phim Ngắn / Zhihu Trung Quốc
 * Tuyệt đối không dùng tên/địa điểm Việt Nam.
 * Hỗ trợ tạo 3 bản Concept đề xuất, Multi-key Rotation, Stream SSE, Auto-retry 429.
 * Tích hợp triệt để Anti-AI Language Gate, Hook Engine & Escalation Ladder.
 */

import { storageService } from "./storageService.js";
import { STORY_TONES } from "../data/tagPools.js";

const BASE_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Trả về Prompt Nền tảng (System Prompt) dựa theo Tông Truyện người dùng lựa chọn
 */
export function getBaseSystemPrompt(toneId = "dramatic") {
  const toneObj = STORY_TONES.find(t => t.id === toneId) || STORY_TONES[0];

  return `Bạn là tác giả tiểu thuyết và biên kịch hàng đầu chuyên sáng tác các tác phẩm phong cách Trung Quốc / Zhihu / Phim ngắn kịch tính cao.

QUY TẮC CỐT LÕI (BẮT BUỘC TUÂN THỦ 100%):
1. ĐỊNH HƯỚNG PHONG CÁCH & VĂN PHONG CHÍNH (${toneObj.name}):
${toneObj.promptInstruction}

2. QUY TẮC TÊN GỌI VÀ ĐỊA DANH (NGHIÊM CẤM VI PHẠM):
   - TUYỆT ĐỐI KHÔNG SỬ DỤNG TÊN HOẶC ĐỊA DANH VIỆT NAM (như Hùng, Nam, Linh, Hà Nội, Sài Gòn...).
   - BẮT BUỘC SỬ DỤNG TÊN HỌ HÁN VIỆT TRUNG QUỐC phù hợp với bối cảnh:
     * Họ: Cố, Lục, Thẩm, Giang, Phó, Tần, Chu, Diệp, Tiêu, Tống, Ôn, Lâm, Bùi, Kỷ, Khương, Dư, Trình, Diễm...
     * Tên nhân vật ví dụ: Cố Bắc Thần, Thẩm Chiêu Chiêu, Lục Cẩn Niên, Giang Thính Vũ, Ôn Tri Hứa, Diệp Thương Lan, Khương Vãn, Chu Tự Hằng, Tống Thanh Hòa, Tần Duật, Hứa Tri Ý...
     * Địa danh / Bối cảnh ví dụ: Kinh Đô, Giang Thành, Lâm Hải, Trấn Thanh Hà, Huyện Bình An, Thành phố S, Thành phố A, Tập đoàn Cố Thị, Lục gia, Thôn Hạnh Hoa, Vân Đình Quán...

3. BỘ LỌC KHỬ TRIỆT ĐỂ "MÙI AI" (ANTI-AI LANGUAGE GATE - CỰC KỲ QUAN TRỌNG):
   - TUYỆT ĐỐI KHÔNG DÙNG cấu trúc tương phản sáo rỗng: "Không phải X, mà là Y" (不是X而是Y), "Vấn đề không nằm ở X, mà ở Y", "Đây không chỉ là... mà còn là...", "Kỳ thực không phải... mà chính là...".
   - TUYỆT ĐỐI KHÔNG DÙNG giọng văn thuyết giáo / tổng kết: "Tóm lại", "Tổng kết lại", "Điểm mấu chốt là", "Đáng chú ý là", "Hãy tưởng tượng...", "Đó chính là ý nghĩa của...".
   - TUYỆT ĐỐI KHÔNG giải thích bài học đạo lý hay đúc kết triết lý ở cuối cảnh/cuối chương.
   - Hạn chế tối đa việc lạm dụng dấu gạch ngang trang trí "——".

4. QUY CHUẨN KỸ THUẬT VIẾT TRUYỆN ĐỈNH CAO (FICTION CRAFT RULES):
   - SHOW, DON'T TELL: Thay vì nói nhân vật tức giận hay nhục nhã, hãy miêu tả ai cười khẩy, ai quay mặt đi, chén trà bị đập vỡ, tiếng giày nện xuống sàn, bàn tay run lên như thế nào.
   - MÓC CÂU MỞ ĐẦU (HOOK ENGINE): 3 đoạn đầu của câu chuyện phải ném nhân vật vào tình huống nguy hiểm, sỉ nhục, tổn thất không thể đảo ngược hoặc sự kiện bất thường ngay lập tức. KHÔNG mở màn bằng thuyết minh bối cảnh hay tả cảnh dông dài.
   - ÁP LỰC LỜI THOẠI (DIALOGUE TENSION): Từng câu thoại phải mang tính ẩn ý, thăm dò, giấu giếm, đe dọa hoặc ra điều kiện. Tránh đối thoại xã giao suông.
   - HÌNH TƯỢNG VẬT PHẨM LẶP LẠI (MOTIF OBJECT): Sử dụng một vật phẩm cụ thể (vết sẹo, chiếc nhẫn, sổ nợ, đồng tiền cũ, hợp đồng bị xé...) làm nhân chứng mang ý nghĩa biến đổi xuyên suốt câu chuyện.
   - THANG LEO THANG XUNG ĐỘT (ESCALATION): Mỗi diễn biến tiếp theo phải thu hẹp một đường lui an toàn của nhân vật chính hoặc nâng cao cái giá phải trả.`;
}

/**
 * Tự động nhận diện Tông Truyện cụ thể từ Concept đã chọn hoặc Tone ID
 */
export function resolveToneObject(toneId, concept = null) {
  if (toneId && toneId !== "auto") {
    const found = STORY_TONES.find(t => t.id === toneId);
    if (found) return found;
  }
  
  if (concept) {
    if (concept.toneId) {
      const found = STORY_TONES.find(t => t.id === concept.toneId);
      if (found && found.id !== "auto") return found;
    }
    if (concept.toneName || concept.tone) {
      const name = String(concept.toneName || concept.tone).toLowerCase();
      const found = STORY_TONES.find(t => t.id !== "auto" && (name.includes(t.id) || t.name.toLowerCase().includes(name) || name.includes(t.name.toLowerCase())));
      if (found) return found;
    }
    if (concept.settingAndCharacters) {
      const text = String(concept.settingAndCharacters).toLowerCase();
      if (text.includes("học đường") || text.includes("thanh xuân") || text.includes("vườn trường") || text.includes("học bá")) return STORY_TONES.find(t => t.id === "youth_campus");
      if (text.includes("điền văn") || text.includes("làm giàu")) return STORY_TONES.find(t => t.id === "cozy_farming");
      if (text.includes("chữa lành") || text.includes("đời thường")) return STORY_TONES.find(t => t.id === "healing_life");
      if (text.includes("hài hước") || text.includes("ăn dưa")) return STORY_TONES.find(t => t.id === "humorous_comedy");
      if (text.includes("trinh thám") || text.includes("phá án") || text.includes("ly kỳ")) return STORY_TONES.find(t => t.id === "mystery_suspense");
      if (text.includes("ngọt sủng") || text.includes("tình cảm")) return STORY_TONES.find(t => t.id === "sweet_romance");
      if (text.includes("kịch tính") || text.includes("vả mặt")) return STORY_TONES.find(t => t.id === "dramatic");
    }
  }

  return STORY_TONES.find(t => t.id === "dramatic") || STORY_TONES[1] || STORY_TONES[0];
}

class GeminiService {
  constructor() {
    this.currentKeyIndex = 0;
  }

  getActiveKey() {
    const keys = storageService.getApiKeys();
    if (!keys || keys.length === 0) {
      throw new Error("Chưa cấu hình Gemini API Key. Vui lòng bấm vào nút 'Cài đặt API' ở góc trên để nhập Key!");
    }
    return keys[this.currentKeyIndex % keys.length];
  }

  getCurrentActiveKeyInfo() {
    const keys = storageService.getApiKeys();
    if (!keys || keys.length === 0) return null;
    const activeIndex = this.currentKeyIndex % keys.length;
    return {
      index: activeIndex + 1,
      totalKeys: keys.length,
      key: keys[activeIndex],
      keyMasked: storageService.maskApiKey(keys[activeIndex])
    };
  }

  rotateKey() {
    const keys = storageService.getApiKeys();
    if (keys.length > 1) {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % keys.length;
      console.log(`Đã chuyển sang API Key số ${this.currentKeyIndex + 1}/${keys.length}`);
      return true;
    }
    return false;
  }

  async callWithRetry(apiFn, maxRetries = 3) {
    const keys = storageService.getApiKeys();
    const effectiveRetries = Math.max(maxRetries, keys.length > 1 ? keys.length + 1 : 3);
    let delay = 2000;

    for (let attempt = 1; attempt <= effectiveRetries; attempt++) {
      try {
        return await apiFn();
      } catch (error) {
        console.warn(`Lỗi gọi Gemini API (Lần ${attempt}/${effectiveRetries}):`, error);

        const errMsg = (error.message || "").toLowerCase();
        const errStatus = error.status || 0;

        const isRateLimit = errMsg.includes("429") || 
                            errMsg.includes("resource_exhausted") ||
                            errMsg.includes("quota") ||
                            errStatus === 429;

        const isKeyRevokedOrDenied = errMsg.includes("403") ||
                                     errMsg.includes("permission_denied") ||
                                     errMsg.includes("denied access") ||
                                     errMsg.includes("400") ||
                                     errMsg.includes("api_key_invalid") ||
                                     errMsg.includes("invalid_argument") ||
                                     errMsg.includes("401") ||
                                     errStatus === 403 ||
                                     errStatus === 401;

        if (isRateLimit || isKeyRevokedOrDenied) {
          const rotated = this.rotateKey();
          if (rotated) {
            console.warn(`Tự động chuyển sang API Key tiếp theo do gặp lỗi ${isKeyRevokedOrDenied ? 'Key bị khóa/hỏng' : 'Rate Limit'}.`);
            continue;
          }
        }

        if (attempt === effectiveRetries) throw error;

        console.log(`Đang chờ ${delay / 1000}s trước khi thử lại...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * 1.5, 8000);
      }
    }
  }

  /**
   * Kiểm tra chi tiết trạng thái 1 API Key cụ thể
   */
  async checkSingleKey(key, model = "gemini-3.6-flash") {
    try {
      const url = `${BASE_API_URL}/${model}:generateContent?key=${key}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "ping" }] }],
          generationConfig: { maxOutputTokens: 5 }
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const msg = errData.error?.message || `HTTP ${response.status}`;
        const status = response.status;
        return {
          ok: false,
          key,
          status,
          error: msg,
          isDenied: status === 403 || msg.includes("denied access") || msg.includes("PERMISSION_DENIED"),
          isInvalid: status === 400 || status === 401 || msg.includes("API_KEY_INVALID")
        };
      }

      const data = await response.json();
      if (data.usageMetadata) {
        storageService.recordApiUsage(key, data.usageMetadata, model);
      }
      return {
        ok: true,
        key,
        status: 200,
        error: null
      };
    } catch (e) {
      return {
        ok: false,
        key,
        status: 0,
        error: e.message || "Lỗi mạng hoặc không thể kết nối",
        isDenied: false,
        isInvalid: false
      };
    }
  }

  async testKey(key, model = "gemini-3.6-flash") {
    const res = await this.checkSingleKey(key, model);
    if (!res.ok) {
      throw new Error(res.error || `HTTP ${res.status}`);
    }
    return true;
  }

  async testApiKey(key, model = "gemini-3.6-flash") {
    return this.testKey(key, model);
  }

  // ==================== GENERATE 3 STORY CONCEPTS ====================

  /**
   * Sinh 3 bản đề xuất cốt truyện / bối cảnh / motif khác nhau theo Tông Truyện đã chọn
   * Hỗ trợ chế độ AI Tự Chọn Tông Giọng (auto) và Tự Do Phối Hợp Trope (0 thẻ)
   * Áp dụng công thức 5 lớp: Cam kết cảm xúc -> Mối quan hệ áp lực -> Vũ đài xung đột -> Động cơ cốt truyện -> Twist vả mặt
   */
  async generateStoryConcepts(params, onProgress = null) {
    const settings = storageService.getSettings();
    const model = settings.model || "gemini-3.6-flash";
    const toneId = params.selectedTone || "auto";
    const toneObj = STORY_TONES.find(t => t.id === toneId) || STORY_TONES[0];
    const isAutoTone = toneId === "auto";
    const hasTags = Array.isArray(params.selectedTags) && params.selectedTags.length > 0;
    const systemBase = getBaseSystemPrompt(toneId);

    const systemPrompt = `${systemBase}
Nhiệm vụ của bạn là sáng tạo ra ĐÚNG 3 BẢN ĐỀ XUẤT CỐT TRUYỆN (Concepts / Pitch Options) mang tính kịch tính đỉnh cao và hấp dẫn cho người đọc.

${isAutoTone 
  ? `YÊU CẦU ĐA DẠNG HÓA TÔNG TRUYỆN (CHẾ ĐỘ TỰ ĐỘNG TỪ 7 TÔNG TRUYỆN):
Người dùng để AI tự do quyết định tông giọng. Hãy sáng tạo 3 bản đề xuất mang 3 TÔNG TRUYỆN KHÁC BIỆT HOÀN TOÀN, được chọn lọc linh hoạt từ 7 Tông truyện lớn sau:
1. [youth_campus] Học Đường / Thanh Xuân: Thanh xuân vườn trường, thi cử phấn đấu, tình cảm trong sáng e ấp, học bá nghịch tập, không khí học đường trong trẻo.
2. [cozy_farming] Điền Văn / Làm Giàu: Mộc mạc, làm ăn kinh doanh buôn bán/nông nghiệp, xây dựng gia đình và cơ nghiệp.
3. [healing_life] Đời Thường / Chữa Lành: Bình yên ấm áp, tình thân bạn bè, xoa dịu tổn thương, sâu lắng.
4. [humorous_comedy] Hài Hước / Ăn Dưa: Đối thoại dí dỏm, tình huống trớ trêu dở khóc dở cười, giải trí vui tươi sảng khoái.
5. [dramatic] Kịch Tính / Vả Mặt: Đấu trí gay gắt, bóc trần bộ mặt giả tạo, vả mặt sảng khoái, plot twist giật gân.
6. [sweet_romance] Tình Cảm / Ngọt Sủng: Lãng mạn, cưng chiều, tương tác rung động tinh tế, không ngược, HE mỹ mãn.
7. [mystery_suspense] Trinh Thám / Ly Kỳ: Suy luận logic, vén màn bí mật từng lớp, phá án hồi hộp.

QUY TẮC CHỌN TÔNG CỰC KỲ QUAN TRỌNG:
- Phân tích kỹ nội dung "Ý tưởng / Tình huống người dùng tự viết". Nếu người dùng yêu cầu TRÁNH hoặc KHÔNG MUỐN yếu tố nào (ví dụ: tránh tổng tài, tránh ngôn tình sướt mướt, tránh phá án máu me...), BẮT BUỘC LOẠI TRỪ các tông/yếu tố đó và linh hoạt chọn 3 tông truyện phù hợp nhất trong số các tông còn lại (ví dụ: ưu tiên Học Đường Thanh Xuân, Điền Văn Làm Giàu, Đời Thường Chữa Lành, Hài Hước Ăn Dưa...).
- Cả 3 bản đề xuất phải mang 3 tông truyện khác nhau để người dùng có nhiều lựa chọn phong phú.`
  : `YÊU CẦU BÁM SÁT TÔNG TRUYỆN: Cả 3 bản đề xuất phải bám sát phong cách "${toneObj.name}" (${toneObj.desc}).`
}

CÔNG THỨC 5 LỚP KỊCH BẢN BẮT BUỘC TRONG TỪNG ĐỀ XUẤT:
1. MÓC CÂU (Hook): Đặt nhân vật vào ngay một tình huống nguy cơ, sỉ nhục, bất thường hoặc tổn thất không thể đảo ngược (1-2 câu giật gân / cuốn hút).
2. MỐI QUAN HỆ ÁP LỰC CAO (Pressure Relationship): Thiết lập mối quan hệ ngột ngạt hoặc gắn kết đặc sắc (Thật giả thiên kim, Tiền phu/Tiền thê, Thế thân, Ở rể, Bạn cùng bàn đối đầu, Học bá x Học tra, Đồng hành lập nghiệp...).
3. VŨ ĐÀI XUNG ĐỘT CÔNG KHAI (Conflict Arena): Mâu thuẫn bùng nổ trước đám đông hoặc thử thách sinh kế (Gia yến, Hủy hôn, Đấu giá, Thẩm tra công khai, Kỳ thi lớn, Bảng vinh danh, Hội trường...).
4. MẠCH LEO THANG (Plot Summary): 3-4 câu tóm tắt mạch truyện, mỗi bước tăng thêm cái giá phải trả và đóng lại lối thoát an toàn.
5. CÚ TWIST / CAO TRÀO (Climax Twist): Đòn lật kèo vả mặt sảng khoái hoặc nút thắt cảm xúc bùng nổ / quả ngọt thành công.

BẮT BUỘC trả về JSON thuần túy theo cấu trúc:
{
  "concepts": [
    {
      "id": 1,
      "toneId": "youth_campus | cozy_farming | healing_life | humorous_comedy | dramatic | sweet_romance | mystery_suspense",
      "toneName": "Tên Tông Truyện tương ứng (VD: Học Đường / Thanh Xuân)",
      "title": "Tựa đề truyện cuốn hút, hợp thể loại",
      "hook": "Câu mở đầu / tình huống mở màn thu hút người đọc ngay lập tức (1-2 câu giật gân)",
      "settingAndCharacters": "Bối cảnh & Tên nhân vật Hán Việt chuẩn kèm Mối quan hệ áp lực cao (VD: Thôn Hạnh Hoa, Cố Hoài An (Thợ săn trầm mặc) - Thẩm Chiêu Chiêu (Tiểu tức phụ lanh lợi))",
      "motifAndConflict": "Vũ đài xung đột & Động cơ cốt truyện chủ đạo",
      "plotSummary": "Tóm tắt mạch leo thang 3-4 câu theo đúng tông truyện đã chọn",
      "climaxTwist": "Cú twist / Điểm cao trào cảm xúc nhất"
    },
    {
      "id": 2,
      "toneId": "...",
      "toneName": "...",
      "title": "...",
      "hook": "...",
      "settingAndCharacters": "...",
      "motifAndConflict": "...",
      "plotSummary": "...",
      "climaxTwist": "..."
    },
    {
      "id": 3,
      "toneId": "...",
      "toneName": "...",
      "title": "...",
      "hook": "...",
      "settingAndCharacters": "...",
      "motifAndConflict": "...",
      "plotSummary": "...",
      "climaxTwist": "..."
    }
  ]
}`;

    const userPrompt = `Hãy tạo 3 bản đề xuất cốt truyện từ các yêu cầu sau:
- Định hướng Tông truyện: ${isAutoTone ? "Để AI tự do sáng tạo 3 màu sắc khác nhau trong 7 tông truyện lớn" : `${toneObj.name} (${toneObj.desc})`}
- Yêu cầu Trope: ${hasTags ? `Các Trope đã chọn: ${params.selectedTags.join(", ")}` : "Người dùng không chọn thẻ nào -> AI tự do tuyển chọn Trope & Vũ đài xung đột hấp dẫn nhất."}
${params.userPremise ? `- Ý tưởng / Tình huống người dùng tự viết (ĐẶC BIỆT CHÚ Ý CÁC ĐIỀU CẦN TRÁNH NẾU CÓ): "${params.userPremise}"` : "- Ý tưởng: Người dùng không nhập bất kỳ ý tưởng nào -> AI tự do sáng tạo 100% từ con số 0 theo các motif thịnh hành nhất."}
- Số lượng chương dự kiến: ${params.chapterCount || 6} chương.

Nhắc lại: Tuyệt đối không dùng tên hay địa điểm Việt Nam. Sử dụng tên Hán Việt Trung Quốc chuẩn. Áp dụng quy chuẩn Khử Mùi AI và Công thức 5 lớp kịch bản. Tuân thủ nghiêm ngặt các điều cần tránh mà người dùng đã nêu trong ý tưởng.`;

    return this.callWithRetry(async () => {
      const apiKey = this.getActiveKey();
      const url = `${BASE_API_URL}/${model}:generateContent?key=${apiKey}`;

      if (onProgress) onProgress(isAutoTone ? "AI đang sáng tạo 3 bản đề xuất đa dạng phong cách từ 7 tông truyện..." : `AI đang sáng tạo 3 bản đề xuất cốt truyện (${toneObj.name})...`);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            temperature: 0.95,
            responseMimeType: "application/json"
          }
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${response.status}`);
      }

      const resData = await response.json();
      if (resData.usageMetadata) {
        storageService.recordApiUsage(apiKey, resData.usageMetadata, model);
      }
      const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const cleanJson = rawText.replace(/```json\s*|\s*```/g, "").trim();
      let parsed = JSON.parse(cleanJson);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.concepts)) return parsed.concepts;
      if (parsed && Array.isArray(parsed.data)) return parsed.data;
      if (parsed && typeof parsed === "object") {
        const arr = Object.values(parsed).find(v => Array.isArray(v));
        if (arr) return arr;
      }
      return [parsed];
    });
  }

  // ==================== GENERATE FULL OUTLINE (CHECKPOINT 1) ====================

  /**
   * Sinh Dàn Ý Chi Tiết & Bảng Nhân Vật dựa trên Concept đã chọn
   * Mỗi chương xây dựng theo thang leo thang (Escalation Ladder) và kết bằng Móc câu (Cliffhanger)
   */
  async generateOutlineFromConcept(params, onProgress = null) {
    const settings = storageService.getSettings();
    const model = settings.model || "gemini-3.6-flash";
    const toneObj = resolveToneObject(params.selectedTone, params.chosenConcept);
    const systemBase = getBaseSystemPrompt(toneObj.id);

    const systemPrompt = `${systemBase}
Nhiệm vụ của bạn là mở rộng BẢN CONCEPT CỐT TRUYỆN ĐÃ CHỌN thành DÀN Ý CHI TIẾT (Outline) gồm ${params.chapterCount || 6} chương và BẢNG NHÂN VẬT (Story Bible) sống động theo đúng phong cách "${toneObj.name}".

QUY TẮC THIẾT KẾ DÀN Ý KỊCH TÍNH:
1. BẢNG NHÂN VẬT SẮC NÉT: Mỗi nhân vật phải có Dục vọng cốt lõi (Core Desire - họ muốn gì cụ thể), Điểm yếu / Vết thương lòng (Wound/Flaw), và Vật chứng/Đặc điểm nhận diện.
2. DÀN Ý TỪNG CHƯƠNG (ESCALATION LADDER):
   - Mở đầu chương (Hook): Sự cố hoặc biến cố mới ập đến.
   - Thắt nút & Leo thang (Escalation): Đóng lại 1 đường lui an toàn hoặc tăng cái giá phải trả.
   - Cao trào chương (Dramatic Goal): Điểm nhấn xung đột/cảm xúc bùng nổ.
   - Móc câu kết chương (Cliffhanger): Kết thúc bằng một câu hỏi chưa có lời giải, một sự xuất hiện bất ngờ hoặc một vật chứng mới lộ diện.
3. BẮT BUỘC trả về JSON thuần túy theo cấu trúc:
{
  "title": "Tên truyện cuốn hút",
  "logline": "1-2 câu tóm tắt chủ đề kịch tính",
  "settingDescription": "Bối cảnh cụ thể (Địa danh Trung Quốc, Tập đoàn Cố Thị, Biệt phủ Lục gia, Thôn Hạnh Hoa...)",
  "characterBible": [
    {
      "name": "Tên nhân vật Hán Việt (VD: Cố Hoài An)",
      "role": "Thân phận và vai trò trong truyện (VD: Nam chính / Đại lão tàn tật Giang gia)",
      "personality": "Tính cách nổi bật & Khẩu khí",
      "desire": "Dục vọng cốt lõi (Muốn đạt được điều gì)",
      "traits": "Đặc điểm nhận dạng, vết sẹo, thói quen hoặc vật chứng mang theo"
    }
  ],
  "chapters": [
    {
      "index": 1,
      "title": "Tên chương ấn tượng",
      "summary": "Tóm tắt diễn biến chương 3-4 câu chi tiết",
      "dramaticGoal": "Mục tiêu cảm xúc / Điểm nhấn xung đột của chương",
      "hook": "Móc câu mở màn chương",
      "cliffhanger": "Móc câu cuối chương dẫn sang chương sau",
      "appearingCharacters": ["Tên các nhân vật xuất hiện"]
    }
  ]
}`;

    const userPrompt = `Dưới đây là Bản Concept cốt truyện được chọn:
- Tông truyện: ${toneObj.name}
- Tựa đề: ${params.chosenConcept.title}
- Hook: ${params.chosenConcept.hook}
- Bối cảnh & Nhân vật: ${params.chosenConcept.settingAndCharacters}
- Motif & Xung đột: ${params.chosenConcept.motifAndConflict}
- Tóm tắt diễn biến: ${params.chosenConcept.plotSummary}
- Điểm nhấn cao trào: ${params.chosenConcept.climaxTwist}
- Các Trope chính: ${(params.selectedTags || []).join(", ")}
- Số chương: ${params.chapterCount || 6} chương

Hãy xuất dữ liệu JSON Dàn ý chi tiết và Bảng nhân vật ngay bây giờ:`;

    return this.callWithRetry(async () => {
      const apiKey = this.getActiveKey();
      const url = `${BASE_API_URL}/${model}:generateContent?key=${apiKey}`;

      if (onProgress) onProgress(`Đang xây dựng Dàn ý chi tiết và Bảng nhân vật (${toneObj.name})...`);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            temperature: 0.85,
            responseMimeType: "application/json"
          }
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${response.status}`);
      }

      const resData = await response.json();
      if (resData.usageMetadata) {
        storageService.recordApiUsage(apiKey, resData.usageMetadata, model);
      }
      const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
      const cleanJson = rawText.replace(/```json\s*|\s*```/g, "").trim();
      return JSON.parse(cleanJson);
    });
  }

  // ==================== STREAM GENERATE CHAPTER ====================

  /**
   * Sinh từng chương chi tiết bám sát Tông Truyện đã chọn (Stream Realtime)
   * Áp dụng nghiêm ngặt Anti-AI Language Gate, Show-Don't-Tell và Dialogue Tension
   */
  async generateChapterStream({
    story,
    chapterIndex,
    onChunk,
    onStatus
  }) {
    const settings = storageService.getSettings();
    const model = settings.model || "gemini-3.6-flash";
    const currentChapter = story.chapters[chapterIndex];
    const toneObj = resolveToneObject(story.params?.selectedTone, story.concept);
    const systemBase = getBaseSystemPrompt(toneObj.id);

    const pastSummaries = story.chapters
      .slice(0, chapterIndex)
      .map(c => `Chương ${c.index}: ${c.title}\n- Tóm tắt: ${c.summary}\n- Đoạn kết đã viết: ${c.content ? c.content.slice(-300).replace(/\n+/g, " ") : "(Chưa có)"}`)
      .join("\n\n");

    let lastParagraphHook = "";
    if (chapterIndex > 0 && story.chapters[chapterIndex - 1]?.content) {
      const prevContent = story.chapters[chapterIndex - 1].content.trim();
      lastParagraphHook = prevContent.slice(-400);
    }

    const systemPrompt = `${systemBase}
Bạn đang viết CHƯƠNG ${currentChapter.index}: "${currentChapter.title}" cho bộ truyện "${story.title}".

TIÊU CHUẨN VĂN PHONG VÀ NỘI DUNG CHI TIẾT:
1. ĐỘ DÀI MỤC TIÊU: Viết chi tiết, đầy đặn, đạt độ dài từ 1.500 đến 2.500 TỪ TIẾNG VIỆT cho chương này.
2. PHONG CÁCH NỘI DUNG (${toneObj.name}): ${toneObj.desc}. Văn phong cuốn hút, miêu tả cảm xúc và đối thoại sống động, tự nhiên, bám sát đúng tông truyện đã định hình.
3. TUYỆT ĐỐI KHÔNG DÙNG TÊN HAY ĐỊA DANH VIỆT NAM. Giữ đúng tên họ Hán Việt trong Bảng Nhân Vật (Story Bible).
4. ÁP DỤNG NGHIÊM NGẶT ANTI-AI LANGUAGE GATE:
   - Cấm dùng: "Không phải X mà là Y", "Vấn đề không nằm ở...", "Tóm lại", "Điểm mấu chốt là", "Đáng chú ý là".
   - Tăng cường đối thoại có áp lực, hành động cụ thể, chi tiết đồ vật, ánh mắt và phản ứng cơ thể thay vì kể lể trừu tượng.
5. TÍNH LIÊN TỤC: Nối liền mạch với đoạn cuối của chương trước, duy trì bối cảnh và tính cách của từng nhân vật.
6. KẾT CHƯƠNG ẤN TƯỢNG: Kết thúc bằng một tình huống lửng (Cliffhanger), một câu thoại đanh thép hoặc một hình ảnh cụ thể đọng lại dư vị. KHÔNG giảng đạo lý.
7. CHỈ TRẢ VỀ NỘI DUNG VĂN XUÔI CỦA CHƯƠNG. Không thêm lời mở đầu hay kết thúc ngoài lề.`;

    const userPrompt = `### THÔNG TIN BỘ TRUYỆN:
- Tên truyện: ${story.title}
- Tông truyện: ${toneObj.name}
- Logline: ${story.logline || ""}
- Bối cảnh: ${story.settingDescription || ""}
- Các Trope: ${(story.params?.selectedTags || []).join(", ")}

### BẢNG NHÂN VẬT (STORY BIBLE):
${JSON.stringify(story.characterBible || [], null, 2)}

### TÓM TẮT DIỄN BIẾN CÁC CHƯƠNG TRƯỚC:
${pastSummaries || "(Đây là chương mở đầu)"}

${lastParagraphHook ? `### ĐOẠN CUỐI CHƯƠNG TRƯỚC (HÃY NỐI TIẾP MẠCH VĂN NÀY):
"...${lastParagraphHook}"` : ""}

### YÊU CẦU CHO CHƯƠNG ${currentChapter.index}: "${currentChapter.title}":
- Diễn biến chính: ${currentChapter.summary}
- Điểm nhấn / Mục tiêu chương: ${currentChapter.dramaticGoal}
${currentChapter.hook ? `- Móc câu mở đầu: ${currentChapter.hook}` : ""}
${currentChapter.cliffhanger ? `- Móc câu kết chương: ${currentChapter.cliffhanger}` : ""}
- Nhân vật xuất hiện: ${(currentChapter.appearingCharacters || []).join(", ")}
- Mục tiêu độ dài: ~${story.params?.targetWordsPerChapter || 2000} từ tiếng Việt chất lượng.

Hãy bắt đầu viết nội dung Chương ${currentChapter.index} ngay bây giờ:`;

    return this.callWithRetry(async () => {
      const apiKey = this.getActiveKey();
      const url = `${BASE_API_URL}/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

      if (onStatus) onStatus(`Đang viết Chương ${currentChapter.index}...`);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            temperature: settings.temperatureChapter || 0.8,
            maxOutputTokens: 8192
          }
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";
      let streamUsageMetadata = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.replace("data: ", "").trim();
            if (dataStr === "[DONE]") continue;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.usageMetadata) {
                streamUsageMetadata = parsed.usageMetadata;
              }
              const textChunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
              if (textChunk) {
                fullText += textChunk;
                if (onChunk) onChunk(textChunk, fullText);
              }
            } catch (e) {
              // Bỏ qua fragment lỗi
            }
          }
        }
      }

      if (!fullText.trim()) throw new Error(`Chương ${currentChapter.index} sinh ra bị rỗng.`);

      // Ghi nhận usage metadata vào StorageService
      const recordedUsage = streamUsageMetadata || {
        promptTokenCount: Math.ceil(userPrompt.length / 3),
        candidatesTokenCount: Math.ceil(fullText.length / 3),
        totalTokenCount: Math.ceil((userPrompt.length + fullText.length) / 3)
      };
      storageService.recordApiUsage(apiKey, recordedUsage, model);

      return fullText.trim();
    });
  }

  async generateDetailedOutline(concept, params = {}, onProgress = null) {
    const mergedParams = {
      chosenConcept: concept || {},
      selectedTags: params.selectedTags || (concept ? [concept.title] : []),
      chapterCount: params.chapterCount || 6,
      ...params
    };
    return this.generateOutlineFromConcept(mergedParams, onProgress);
  }

  async generateChapterContent(story, chapterNumber, onChunk = null, onStatus = null) {
    const idx = typeof chapterNumber === "number" ? chapterNumber - 1 : 0;
    return this.generateChapterStream({
      story,
      chapterIndex: Math.max(0, idx),
      onChunk,
      onStatus
    });
  }
}

export const geminiService = new GeminiService();

