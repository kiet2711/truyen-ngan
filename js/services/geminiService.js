/**
 * Gemini API Service - Tối ưu cho Văn Phong Phim Ngắn / Zhihu Trung Quốc
 * Tuyệt đối không dùng tên/địa điểm Việt Nam.
 * Hỗ trợ tạo 3 bản Concept đề xuất, Multi-key Rotation, Stream SSE, Auto-retry 429.
 */

import { storageService } from "./storageService.js";
import { STORY_TONES } from "../data/tagPools.js";

const BASE_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Trả về Prompt Nền tảng (System Prompt) dựa theo Tông Truyện người dùng lựa chọn
 */
export function getBaseSystemPrompt(toneId = "dramatic") {
  const toneObj = STORY_TONES.find(t => t.id === toneId) || STORY_TONES[0];

  return `Bạn là tác giả tiểu thuyết và biên kịch hàng đầu chuyên sáng tác các tác phẩm phong cách Trung Quốc.

QUY TẮC CỐT LÕI (BẮT BUỘC TUÂN THỦ 100%):
1. ĐỊNH HƯỚNG PHONG CÁCH & VĂN PHONG CHÍNH (${toneObj.name}):
${toneObj.promptInstruction}

2. QUY TẮC TÊN GỌI VÀ ĐỊA DANH (NGHIÊM CẤM VI PHẠM):
   - TUYỆT ĐỐI KHÔNG SỬ DỤNG TÊN HOẶC ĐỊA DANH VIỆT NAM (như Hùng, Nam, Linh, Hà Nội, Sài Gòn...).
   - BẮT BUỘC SỬ DỤNG TÊN HỌ HÁN VIỆT TRUNG QUỐC phù hợp với bối cảnh:
     * Họ: Cố, Lục, Thẩm, Giang, Phó, Tần, Chu, Diệp, Tiêu, Tống, Ôn, Lâm, Bùi, Kỷ, Khương, Dư, Trình, Diễm...
     * Tên nhân vật ví dụ: Cố Bắc Thần, Thẩm Chiêu Chiêu, Lục Cẩn Niên, Giang Thính Vũ, Ôn Tri Hứa, Diệp Thương Lan, Khương Vãn, Chu Tự Hằng, Tống Thanh Hòa, Tần Duật, Hứa Tri Ý...
     * Địa danh / Bối cảnh ví dụ: Kinh Đô, Giang Thành, Lâm Hải, Trấn Thanh Hà, Huyện Bình An, Thành phố S, Thành phố A, Tập đoàn Cố Thị, Lục gia, Thôn Hạnh Hoa, Vân Đình Quán...
3. NGÔN TỪ TRUYỆN:
   - Sử dụng từ ngữ mượt mà, đúng chuẩn phong cách truyện/phim ngắn, giàu cảm xúc và hình ảnh, câu từ tự nhiên chuẩn mực tiếng Việt.`;
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
    let delay = 3000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await apiFn();
      } catch (error) {
        console.warn(`Lỗi gọi Gemini API (Lần ${attempt}/${maxRetries}):`, error);

        const isRateLimit = error.message.includes("429") || 
                            error.message.includes("RESOURCE_EXHAUSTED") ||
                            error.message.includes("quota");

        if (isRateLimit) {
          const rotated = this.rotateKey();
          if (rotated) continue;
        }

        if (attempt === maxRetries) throw error;

        console.log(`Đang chờ ${delay / 1000}s trước khi thử lại...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  }

  async testKey(key, model = "gemini-3.6-flash") {
    return this.testApiKey(key, model);
  }

  async testApiKey(key, model = "gemini-3.6-flash") {
    const url = `${BASE_API_URL}/${model}:generateContent?key=${key}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Hãy phản hồi ngắn gọn: 'API Hoạt động tốt'" }] }]
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Lỗi HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.usageMetadata) {
      storageService.recordApiUsage(key, data.usageMetadata, model);
    } else {
      storageService.recordApiUsage(key, { promptTokenCount: 15, candidatesTokenCount: 10, totalTokenCount: 25 }, model);
    }
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "OK";
  }

  // ==================== GENERATE 3 STORY CONCEPTS ====================

  /**
   * Sinh 3 bản đề xuất cốt truyện / bối cảnh / motif khác nhau theo Tông Truyện đã chọn
   */
  async generateStoryConcepts(params, onProgress = null) {
    const settings = storageService.getSettings();
    const model = settings.model || "gemini-3.6-flash";
    const toneId = params.selectedTone || "dramatic";
    const toneObj = STORY_TONES.find(t => t.id === toneId) || STORY_TONES[0];
    const systemBase = getBaseSystemPrompt(toneId);

    const systemPrompt = `${systemBase}
Nhiệm vụ của bạn là dựa vào TÔNG TRUYỆN (${toneObj.name}), các TAG TROPE và Ý TƯỞNG của người dùng để sáng tạo ra ĐÚNG 3 BẢN ĐỀ XUẤT CỐT TRUYỆN (Concepts / Pitch Options) mang màu sắc hấp dẫn, bám sát phong cách được chọn.

Mỗi bản đề xuất phải có nét độc đáo riêng, xây dựng tuyến nhân vật và cốt truyện phù hợp với tông "${toneObj.name}".
BẮT BUỘC trả về JSON thuần túy theo cấu trúc:
{
  "concepts": [
    {
      "id": 1,
      "title": "Tựa đề truyện cuốn hút, hợp thể loại",
      "hook": "Câu mở đầu / tình huống mở màn thu hút người đọc ngay lập tức (1-2 câu)",
      "settingAndCharacters": "Bối cảnh và tên nhân vật chính Hán Việt chuẩn (VD: Cố gia Kinh Đô, Thẩm Chiêu Chiêu - Cố Hoài An)",
      "motifAndConflict": "Motif cốt lõi và định hướng phát triển mâu thuẫn/tình cảm",
      "plotSummary": "Tóm tắt mạch diễn biến 3-4 câu phù hợp phong cách đã chọn",
      "climaxTwist": "Điểm cao trào / nút thắt cảm xúc / khoảnh khắc đáng nhớ nhất của truyện"
    },
    {
      "id": 2,
      "title": "...",
      "hook": "...",
      "settingAndCharacters": "...",
      "motifAndConflict": "...",
      "plotSummary": "...",
      "climaxTwist": "..."
    },
    {
      "id": 3,
      "title": "...",
      "hook": "...",
      "settingAndCharacters": "...",
      "motifAndConflict": "...",
      "plotSummary": "...",
      "climaxTwist": "..."
    }
  ]
}`;

    const userPrompt = `Hãy tạo 3 bản đề xuất cốt truyện theo Tông Truyện "${toneObj.name}" từ các yêu cầu sau:
- Tông truyện chính: ${toneObj.name} (${toneObj.desc})
- Các Trope đã chọn: ${(params.selectedTags || []).join(", ")}
${params.userPremise ? `- Ý tưởng / Tình huống người dùng tự viết: "${params.userPremise}"` : "- Ý tưởng: Người dùng không nhập, hãy tự do sáng tạo tổ hợp hấp dẫn nhất theo đúng tông truyện đã chọn."}
- Số lượng chương dự kiến: ${params.chapterCount || 6} chương.

Nhắc lại: Tuyệt đối không dùng tên hay địa điểm Việt Nam. Sử dụng tên Hán Việt Trung Quốc chuẩn.`;

    return this.callWithRetry(async () => {
      const apiKey = this.getActiveKey();
      const url = `${BASE_API_URL}/${model}:generateContent?key=${apiKey}`;

      if (onProgress) onProgress(`AI đang sáng tạo 3 bản đề xuất cốt truyện (${toneObj.name})...`);

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
   */
  async generateOutlineFromConcept(params, onProgress = null) {
    const settings = storageService.getSettings();
    const model = settings.model || "gemini-3.6-flash";
    const toneId = params.selectedTone || "dramatic";
    const toneObj = STORY_TONES.find(t => t.id === toneId) || STORY_TONES[0];
    const systemBase = getBaseSystemPrompt(toneId);

    const systemPrompt = `${systemBase}
Nhiệm vụ của bạn là mở rộng BẢN CONCEPT CỐT TRUYỆN ĐÃ CHỌN thành DÀN Ý CHI TIẾT (Outline) gồm ${params.chapterCount || 6} chương và BẢNG NHÂN VẬT (Story Bible) sống động theo đúng phong cách "${toneObj.name}".

QUY TẮC CẤU TRÚC:
1. Mỗi chương có diễn biến rõ ràng, mở đầu hấp dẫn, giữa chương phát triển cảm xúc/mâu thuẫn, cuối chương có điểm kết cuốn hút để dẫn sang chương kế tiếp.
2. Bảng nhân vật đầy đủ: Tên Hán Việt Trung Quốc, vai trò, tính cách, đặc điểm nhận dạng.
3. BẮT BUỘC trả về JSON thuần túy:
{
  "title": "Tên truyện cuốn hút",
  "logline": "1-2 câu tóm tắt chủ đề",
  "settingDescription": "Bối cảnh cụ thể (Địa danh Trung Quốc, Tập đoàn, Phố thị hoặc Thôn làng)",
  "characterBible": [
    {
      "name": "Tên nhân vật Hán Việt (VD: Cố Hoài An)",
      "role": "Thân phận và vai trò trong truyện",
      "personality": "Tính cách",
      "traits": "Đặc điểm ngoại hình, khẩu khí hoặc thói quen"
    }
  ],
  "chapters": [
    {
      "index": 1,
      "title": "Tên chương",
      "summary": "Tóm tắt diễn biến chương 3-4 câu",
      "dramaticGoal": "Mục tiêu cảm xúc / Điểm nhấn của chương",
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

      if (onProgress) onProgress("Đang xây dựng Dàn ý chi tiết và Bảng nhân vật...");

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
    const toneId = story.params?.selectedTone || "dramatic";
    const toneObj = STORY_TONES.find(t => t.id === toneId) || STORY_TONES[0];
    const systemBase = getBaseSystemPrompt(toneId);

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

TIÊU CHUẨN VĂN PHONG VÀ NỘI DUNG:
1. ĐỘ DÀI MỤC TIÊU: Viết chi tiết, đầy đặn, đạt độ dài từ 1.500 đến 2.500 TỪ TIẾNG VIỆT cho chương này.
2. PHONG CÁCH NỘI DUNG (${toneObj.name}): ${toneObj.desc}. Văn phong cuốn hút, miêu tả cảm xúc và đối thoại sống động, tự nhiên, bám sát đúng tông truyện đã định hình.
3. TUYỆT ĐỐI KHÔNG DÙNG TÊN HAY ĐỊA DANH VIỆT NAM. Giữ đúng tên họ Hán Việt trong Bảng Nhân Vật (Story Bible).
4. TÍNH LIÊN TỤC: Nối liền mạch với đoạn cuối của chương trước, duy trì bối cảnh và tính cách của từng nhân vật.
5. CHỈ TRẢ VỀ NỘI DUNG VĂN XUÔI CỦA CHƯƠNG. Không thêm lời mở đầu hay kết thúc ngoài lề.`;

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
