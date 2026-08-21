/**
 * AI Novel & Subtitle Translation Service
 * Hỗ trợ dịch Tiểu Thuyết (Raw -> Việt) và Phụ Đề Video (.srt)
 * Tích hợp Smart Chunking: Gộp chunk lớn cho Gemini (ít request) & Chia nhỏ cho Gemma (an toàn 16k TPM).
 */

import { storageService } from "./storageService.js";
import { geminiService } from "./geminiService.js";

const BASE_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export class TranslatorService {
  constructor() {
    this.isTranslating = false;
    this.isPaused = false;
    this.isCancelled = false;
  }

  // ==================== SRT PARSER & SERIALIZER ====================

  /**
   * Phân tích nội dung file SRT thành mảng object
   * @param {string} srtContent 
   * @returns {Array<{ id: number, timecode: string, originalText: string, translatedText: string }>}
   */
  parseSrt(srtContent) {
    if (!srtContent || typeof srtContent !== "string") return [];
    
    // Loại bỏ codeblock markdown nếu có
    const cleaned = srtContent.replace(/```(?:srt)?/gi, "").replace(/```/g, "");
    const normalized = cleaned.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    const blocks = normalized.split(/\n\s*\n+/);
    const items = [];

    blocks.forEach((block, idx) => {
      const lines = block.trim().split("\n");
      if (lines.length >= 2) {
        let id = idx + 1;
        let timecodeLineIndex = 0;

        // Nếu dòng đầu là số thứ tự
        if (/^\d+$/.test(lines[0].trim())) {
          id = parseInt(lines[0].trim(), 10);
          timecodeLineIndex = 1;
        }

        const timecode = lines[timecodeLineIndex] ? lines[timecodeLineIndex].trim() : "";
        if (timecode.includes("-->")) {
          const textLines = lines.slice(timecodeLineIndex + 1);
          const originalText = textLines.join("\n").trim();
          items.push({
            id: isNaN(id) ? (idx + 1) : id,
            timecode,
            originalText: originalText || "",
            translatedText: ""
          });
        }
      }
    });

    return items;
  }

  /**
   * Tạo chuỗi định dạng SRT từ mảng đối tượng
   * @param {Array} items 
   * @param {'translated'|'bilingual'|'source'} mode 
   * @returns {string}
   */
  buildSrt(items, mode = "translated") {
    if (!Array.isArray(items) || items.length === 0) return "";

    return items.map((item, idx) => {
      const id = item.id !== undefined ? item.id : (idx + 1);
      let text = item.translatedText || item.originalText || "";

      if (mode === "bilingual") {
        if (item.originalText && item.translatedText && item.originalText !== item.translatedText) {
          text = `${item.translatedText}\n${item.originalText}`;
        } else {
          text = item.translatedText || item.originalText;
        }
      } else if (mode === "source") {
        text = item.originalText;
      }

      return `${id}\n${item.timecode}\n${text}`;
    }).join("\n\n") + "\n";
  }

  // ==================== SMART CHUNKING ENGINE ====================

  /**
   * Kích thước chunk tối ưu chống bỏ sót nội dung và an toàn TPM:
   * - Gemini (3.6 / 3.5 Flash): 80 dòng SRT / 1.800 từ (đảm bảo AI dịch đủ 100% không tóm tắt)
   * - Gemma (4 31B / 26B): 40 dòng SRT / 700 từ (an toàn 16k TPM)
   */
  getChunkConfig(modelId, type = "srt") {
    const isGemma = modelId && modelId.toLowerCase().includes("gemma");

    if (type === "srt") {
      return {
        chunkSize: isGemma ? 40 : 80, // số dòng phụ đề mỗi request
        delayMs: isGemma ? 1200 : 2000,
        strategy: isGemma ? "gemma-safe-tpm" : "gemini-min-requests"
      };
    } else {
      // Tiểu thuyết / văn bản raw
      return {
        chunkSize: isGemma ? 700 : 1800, // số chữ/từ mỗi request để AI không tóm tắt
        delayMs: isGemma ? 1200 : 2000,
        strategy: isGemma ? "gemma-safe-tpm" : "gemini-min-requests"
      };
    }
  }

  /**
   * Chia mảng SRT thành các chunks
   */
  chunkSrtItems(items, modelId) {
    const config = this.getChunkConfig(modelId, "srt");
    const chunks = [];
    for (let i = 0; i < items.length; i += config.chunkSize) {
      chunks.push(items.slice(i, i + config.chunkSize));
    }
    return { chunks, config };
  }

  /**
   * Kiểm tra chuỗi văn bản có phải định dạng SRT không
   */
  isSrtContent(text) {
    if (!text || typeof text !== "string") return false;
    return /\d{1,2}:\d{2}:\d{2}[,\.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,\.]\d{1,3}/.test(text);
  }

  /**
   * Đếm số lượng đơn vị văn bản (Hỗ trợ chính xác chữ Hán Trung Quốc, từ tiếng Anh và tiếng Việt)
   */
  countUnits(text) {
    if (!text || typeof text !== "string") return 0;
    // Đếm số lượng chữ Hán CJK (Trung/Nhật/Hàn)
    const cjkMatches = text.match(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g);
    const cjkCount = cjkMatches ? cjkMatches.length : 0;
    // Đếm số từ cho phần chữ Latinh (Anh/Việt)
    const nonCjk = text.replace(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g, " ");
    const words = nonCjk.trim().split(/\s+/).filter(Boolean).length;
    return cjkCount + words;
  }

  /**
   * Chia văn bản tiểu thuyết raw thành các chunks chuẩn xác
   */
  chunkRawText(rawText, modelId) {
    const config = this.getChunkConfig(modelId, "novel");
    const limit = config.chunkSize;
    
    // Tách theo đoạn văn
    const paragraphs = rawText.split(/\n+/).map(p => p.trim()).filter(Boolean);
    const chunks = [];
    let currentChunk = [];
    let currentCount = 0;

    for (const para of paragraphs) {
      const paraUnits = this.countUnits(para);

      if (paraUnits > limit) {
        // Đoạn văn quá dài vượt quá hạn mức 1 chunk -> Tách theo câu
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.join("\n\n"));
          currentChunk = [];
          currentCount = 0;
        }

        const sentences = para.split(/([。！？\.\!\?\n]+)/).filter(Boolean);
        let tempChunk = "";
        for (let s = 0; s < sentences.length; s += 2) {
          const sent = (sentences[s] || "") + (sentences[s + 1] || "");
          const sentUnits = this.countUnits(sent);
          if (this.countUnits(tempChunk) + sentUnits > limit && tempChunk) {
            chunks.push(tempChunk.trim());
            tempChunk = sent;
          } else {
            tempChunk += sent;
          }
        }
        if (tempChunk.trim()) {
          chunks.push(tempChunk.trim());
        }
      } else if (currentCount + paraUnits > limit && currentChunk.length > 0) {
        chunks.push(currentChunk.join("\n\n"));
        currentChunk = [para];
        currentCount = paraUnits;
      } else {
        currentChunk.push(para);
        currentCount += paraUnits;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join("\n\n"));
    }

    // Nếu văn bản không có dấu xuống dòng
    if (chunks.length === 0 && rawText.trim()) {
      chunks.push(rawText.trim());
    }

    return { chunks: chunks.filter(Boolean), config };
  }

  // ==================== TRANSLATION PROMPTS & EXECUTION ====================

  /**
   * Tạo System Prompt theo phong cách dịch (Người dùng tự nhập hoặc AI tự động suy luận)
   */
  getTranslationSystemPrompt(userCustomStyle = "", type = "srt") {
    let styleGuide = "";

    if (userCustomStyle && typeof userCustomStyle === "string" && userCustomStyle.trim()) {
      styleGuide = `PHONG CÁCH DỊCH THEO YÊU CẦU CỦA NGƯỜI DÙNG:
"${userCustomStyle.trim()}"
- Hãy bám sát và tuân thủ tuyệt đối phong cách dịch, giọng văn và yêu cầu trên.
- Dịch thoát nghĩa, trôi chảy, đúng sắc thái nhân vật và ngữ cảnh của câu chuyện.
- Sử dụng tên nhân vật và danh xưng theo âm Hán Việt chuẩn mực và trang trọng.`;
    } else {
      styleGuide = `TỰ ĐỘNG SUY LUẬN NGỮ CẢNH & THỂ LOẠI (AUTO-INFERENCE):
- Hãy đọc kỹ văn bản gốc để tự động nhận diện thể loại (phim ngắn Zhihu vả mặt, hiện đại đô thị, cổ trang tiên hiệp, hào môn thế gia, hài hước, kinh dị...).
- Tự động điều chỉnh giọng văn cho phù hợp nhất: kịch tính dồn dập cho phim ngắn, mềm mại giàu cảm xúc cho ngôn tình, trang trọng khí thế cho tiên hiệp/cổ trang.
- Dịch thoát nghĩa, tự nhiên, thuần Việt, tuyệt đối không dịch thô kiểu "word-by-word" máy móc.
- Giữ nguyên các tên riêng, địa danh và danh xưng nhân vật theo âm Hán Việt chuẩn mực (Cố tổng, Lục gia, Thẩm tiểu thư...).`;
    }

    if (type === "srt") {
      return `Bạn là chuyên gia dịch phụ đề video và phim ngắn Trung - Việt hàng đầu thế giới.
${styleGuide}

QUY TẮC BẮT BUỘC ĐỂ KHÔNG BỊ DỊCH THIẾU HOẶC MẤT DÒNG PHỤ ĐỀ:
1. TUYỆT ĐỐI BẢO TOÀN 100% CẤU TRÚC SRT: Đầu vào có bao nhiêu khối phụ đề (ID từ 1 đến N) thì đầu ra BẮT BUỘC PHẢI CÓ ĐỦ CHÍNH XÁC bấy nhiêu khối phụ đề.
2. Giữ nguyên số thứ tự ID và dòng Timecode. Dưới mỗi timecode là đúng 1 bản dịch tiếng Việt tương ứng.
3. KHÔNG gộp 2 khối phụ đề thành 1, KHÔNG bỏ qua bất kỳ khối phụ đề nào.
4. KHÔNG thêm lời chào, lời giải thích hay code block ngoài định dạng SRT chuẩn.`;
    }

    return `Bạn là chuyên gia dịch thuật văn học và tiểu thuyết Trung - Việt hàng đầu thế giới.
${styleGuide}
QUY TẮC BẮT BUỘC ĐỂ BẢN DỊCH KHÔNG BỊ THIẾU (CHỐNG TÓM TẮT):
1. DỊCH ĐẦY ĐỦ 100% TOÀN BỘ VĂN BẢN: Bắt buộc dịch trọn vẹn từng câu, từng đoạn từ đầu đến cuối. Tuyệt đối KHÔNG ĐƯỢC TÓM TẮT, KHÔNG ĐƯỢC CẮT BỚT, KHÔNG ĐƯỢC BỎ SÓT bất kỳ câu văn, lời thoại hay đoạn miêu tả nào dù là nhỏ nhất.
2. Giữ nguyên toàn bộ cấu trúc đoạn văn của bản gốc (đoạn nào dịch ra đoạn đó).
3. Dịch thoát nghĩa, câu từ mượt mà, thuần Việt, chuẩn ngữ pháp tiếng Việt.
4. KHÔNG thêm bất kỳ lời dẫn, ghi chú hay giải thích nào ngoài nội dung đã dịch.`;
  }

  /**
   * Gọi Gemini API với multi-key rotation và retry
   */
  async callTranslateApi(prompt, systemInstruction, modelId) {
    const settings = storageService.getSettings();
    const effectiveModel = modelId || settings.model || "gemini-3.6-flash";
    const maxRetries = settings.maxRetries || 3;

    return await geminiService.callWithRetry(async () => {
      const apiKey = geminiService.getActiveKey();
      const url = `${BASE_API_URL}/${effectiveModel}:generateContent?key=${apiKey}`;

      const payload = {
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.2, // Nhiệt độ thấp giúp bản dịch bám sát 100% nguyên tác, không tóm tắt
          maxOutputTokens: 8192
        }
      };

      if (systemInstruction) {
        payload.systemInstruction = {
          parts: [{ text: systemInstruction }]
        };
      }

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        const err = new Error(`Gemini API Error ${response.status}: ${errorText}`);
        err.status = response.status;
        err.errorText = errorText;
        throw err;
      }

      const data = await response.json();
      const usage = data.usageMetadata || {};

      // Ghi nhận Token Quota theo Model thời gian thực
      storageService.recordApiUsage(apiKey, usage, effectiveModel);

      // Tự động xoay tua API Key tiếp theo cho chunk sau (Round-robin chia đều tải giữa các Key)
      geminiService.rotateKey();

      const candidate = data.candidates?.[0];
      if (!candidate || !candidate.content?.parts?.[0]?.text) {
        throw new Error("API không trả về nội dung dịch hợp lệ.");
      }

      return {
        text: candidate.content.parts[0].text,
        usage
      };
    }, maxRetries);
  }

  // ==================== WORKFLOW TRANSLATE SRT ====================

  /**
   * Dịch toàn bộ danh sách phụ đề SRT với cơ chế Smart Chunking
   */
  async translateSrt(items, modelId, style = "zhihu", onProgress = null) {
    if (!items || items.length === 0) return items;

    this.isTranslating = true;
    this.isPaused = false;
    this.isCancelled = false;

    const { chunks, config } = this.chunkSrtItems(items, modelId);
    const systemPrompt = this.getTranslationSystemPrompt(style, "srt");

    for (let i = 0; i < chunks.length; i++) {
      if (this.isCancelled) break;

      while (this.isPaused && !this.isCancelled) {
        await new Promise(r => setTimeout(r, 500));
      }

      const chunk = chunks[i];
      const chunkSrtInput = this.buildSrt(chunk, "source");

      if (onProgress) {
        onProgress({
          status: "translating",
          currentChunkIndex: i + 1,
          totalChunks: chunks.length,
          progressPercent: Math.round((i / chunks.length) * 100),
          message: `Đang dịch phần ${i + 1}/${chunks.length} (${chunk.length} dòng phụ đề)...`
        });
      }

      const prompt = `Dịch toàn bộ file phụ đề SRT sau đây sang tiếng Việt chuẩn xác theo đúng quy tắc:\n\n${chunkSrtInput}`;

      try {
        const result = await this.callTranslateApi(prompt, systemPrompt, modelId);
        const translatedSrtText = result.text.trim();
        const translatedItems = this.parseSrt(translatedSrtText);

        // Ghép bản dịch vào từng item tương ứng
        chunk.forEach((item, cIdx) => {
          // Ưu tiên 1: Khớp theo ID
          let match = translatedItems.find(t => t.id === item.id);
          // Ưu tiên 2: Khớp theo Timecode
          if (!match) {
            match = translatedItems.find(t => t.timecode === item.timecode);
          }
          // Ưu tiên 3: Khớp theo thứ tự dòng trong chunk
          if (!match && translatedItems[cIdx]) {
            match = translatedItems[cIdx];
          }

          if (match && match.originalText) {
            item.translatedText = match.originalText;
          } else if (match && match.translatedText) {
            item.translatedText = match.translatedText;
          }
        });

        if (onProgress) {
          // Lấy chuỗi SRT đã dịch được tính đến thời điểm hiện tại
          const translatedSoFar = items.filter(it => it.translatedText);
          const accumulatedText = this.buildSrt(translatedSoFar, "translated");

          onProgress({
            status: "chunk_completed",
            currentChunkIndex: i + 1,
            totalChunks: chunks.length,
            progressPercent: Math.round(((i + 1) / chunks.length) * 100),
            accumulatedText,
            message: `Hoàn thành phần ${i + 1}/${chunks.length} (${translatedSoFar.length}/${items.length} dòng)!`
          });
        }

        // Delay nhẹ giữa các chunk để chống 429
        if (i < chunks.length - 1 && config.delayMs > 0) {
          await new Promise(r => setTimeout(r, config.delayMs));
        }

      } catch (err) {
        console.error(`Lỗi khi dịch chunk ${i + 1}:`, err);
        throw new Error(`Lỗi tại phần ${i + 1}/${chunks.length}: ${err.message}`);
      }
    }

    this.isTranslating = false;

    if (onProgress) {
      onProgress({
        status: "completed",
        currentChunkIndex: chunks.length,
        totalChunks: chunks.length,
        progressPercent: 100,
        message: `Đã dịch hoàn tất toàn bộ ${items.length} dòng phụ đề!`
      });
    }

    return items;
  }

  // ==================== WORKFLOW TRANSLATE NOVEL / RAW ====================

  /**
   * Dịch văn bản tiểu thuyết Raw sang tiếng Việt
   */
  async translateNovel(rawText, modelId, style = "zhihu", onProgress = null) {
    if (!rawText || typeof rawText !== "string") return "";

    this.isTranslating = true;
    this.isPaused = false;
    this.isCancelled = false;

    const { chunks, config } = this.chunkRawText(rawText, modelId);
    const systemPrompt = this.getTranslationSystemPrompt(style, "novel");
    const translatedChunks = [];

    for (let i = 0; i < chunks.length; i++) {
      if (this.isCancelled) break;

      while (this.isPaused && !this.isCancelled) {
        await new Promise(r => setTimeout(r, 500));
      }

      const chunkText = chunks[i];

      if (onProgress) {
        onProgress({
          status: "translating",
          currentChunkIndex: i + 1,
          totalChunks: chunks.length,
          progressPercent: Math.round((i / chunks.length) * 100),
          message: `Đang dịch đoạn ${i + 1}/${chunks.length}...`
        });
      }

      const prompt = `Dịch ĐẦY ĐỦ 100% toàn bộ văn bản tiểu thuyết sau đây sang tiếng Việt (TUYỆT ĐỐI KHÔNG TÓM TẮT, KHÔNG CẮT BỚT BẤT KỲ CÂU NÀO):\n\n${chunkText}`;

      try {
        const result = await this.callTranslateApi(prompt, systemPrompt, modelId);
        translatedChunks.push(result.text.trim());

        if (onProgress) {
          onProgress({
            status: "chunk_completed",
            currentChunkIndex: i + 1,
            totalChunks: chunks.length,
            progressPercent: Math.round(((i + 1) / chunks.length) * 100),
            accumulatedText: translatedChunks.join("\n\n"),
            message: `Hoàn thành đoạn ${i + 1}/${chunks.length}!`
          });
        }

        if (i < chunks.length - 1 && config.delayMs > 0) {
          await new Promise(r => setTimeout(r, config.delayMs));
        }

      } catch (err) {
        console.error(`Lỗi khi dịch đoạn ${i + 1}:`, err);
        throw new Error(`Lỗi tại đoạn ${i + 1}/${chunks.length}: ${err.message}`);
      }
    }

    this.isTranslating = false;
    const fullTranslatedText = translatedChunks.join("\n\n");

    if (onProgress) {
      onProgress({
        status: "completed",
        currentChunkIndex: chunks.length,
        totalChunks: chunks.length,
        progressPercent: 100,
        accumulatedText: fullTranslatedText,
        message: `Đã dịch hoàn tất toàn bộ văn bản!`
      });
    }

    return fullTranslatedText;
  }

  cancel() {
    this.isCancelled = true;
    this.isTranslating = false;
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
  }
}

export const translatorService = new TranslatorService();
