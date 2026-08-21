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
   * Chuẩn hóa 1 mốc thời gian riêng lẻ thành định dạng chuẩn quốc tế HH:MM:SS,mmm
   * Sửa lỗi thiếu số 0 (ví dụ: 9:0:35,379 -> 09:00:35,379) để Windows Media Player nhận phụ đề 100%
   */
  normalizeSingleTime(t) {
    if (!t || typeof t !== "string") return "00:00:00,000";
    const cleaned = t.trim().replace(/\./g, ",");
    const [hms, msPart] = cleaned.split(",");
    const ms = (msPart || "000").padEnd(3, "0").substring(0, 3);
    const parts = (hms || "").split(":").map(p => parseInt(p, 10) || 0);
    let h = 0, m = 0, s = 0;
    if (parts.length >= 3) {
      h = parts[0];
      m = parts[1];
      s = parts[2];
    } else if (parts.length === 2) {
      m = parts[0];
      s = parts[1];
    } else if (parts.length === 1) {
      s = parts[0];
    }
    const pad = (n, len = 2) => String(n).padStart(len, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)},${ms}`;
  }

  /**
   * Chuẩn hóa cả chuỗi timecode: 9:0:35,379 --> 9:0:37,239 -> 09:00:35,379 --> 09:00:37,239
   */
  normalizeTimecode(timecode) {
    if (!timecode || typeof timecode !== "string") return "";
    const parts = timecode.split(/\s*-->\s*/);
    if (parts.length === 2) {
      return `${this.normalizeSingleTime(parts[0])} --> ${this.normalizeSingleTime(parts[1])}`;
    }
    return timecode.trim();
  }

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

        const rawTimecode = lines[timecodeLineIndex] ? lines[timecodeLineIndex].trim() : "";
        if (rawTimecode.includes("-->")) {
          const timecode = this.normalizeTimecode(rawTimecode);
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
      const timecode = this.normalizeTimecode(item.timecode);
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

      return `${id}\n${timecode}\n${text}`;
    }).join("\n\n") + "\n";
  }

  /**
   * Chuyển đổi timestamp SRT sang chuẩn ASS: 00:01:23,456 -> 0:01:23.45
   */
  formatSrtTimeToAss(srtTime) {
    if (!srtTime || typeof srtTime !== "string") return "0:00:00.00";
    const cleaned = srtTime.trim().replace(/\./g, ",");
    const [hms, msPart] = cleaned.split(",");
    const msNum = parseInt((msPart || "000").padEnd(3, "0").substring(0, 3), 10) || 0;
    const centi = Math.floor(msNum / 10);
    const centiStr = String(centi).padStart(2, "0");

    const parts = (hms || "").split(":").map(p => parseInt(p, 10) || 0);
    let h = 0, m = 0, s = 0;
    if (parts.length >= 3) {
      [h, m, s] = parts;
    } else if (parts.length === 2) {
      [m, s] = parts;
    } else if (parts.length === 1) {
      [s] = parts;
    }
    const pad = (n, len = 2) => String(n).padStart(len, "0");
    return `${h}:${pad(m)}:${pad(s)}.${centiStr}`;
  }

  /**
   * Tạo file định dạng ASS với Style hộp nền đen (Opaque Box) che kín phụ đề gốc bên dưới
   * @param {Array} items
   * @param {'translated'|'bilingual'|'source'} mode
   * @returns {string}
   */
  buildAss(items, mode = "translated") {
    if (!Array.isArray(items) || items.length === 0) return "";

    const header = `[Script Info]
; Script generated by AI Novel Studio
Title: Vietnamese Subtitles with Black Box
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: BlackBox,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,3,14,0,2,30,30,95,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const dialogues = items.map((item) => {
      let text = item.translatedText || item.originalText || "";
      if (mode === "bilingual") {
        if (item.originalText && item.translatedText && item.originalText !== item.translatedText) {
          text = `${item.translatedText}\\N${item.originalText}`;
        }
      }
      // Trong ASS, ký tự xuống dòng là \N
      const assText = text.replace(/\r\n|\n|\r/g, "\\N");

      const timecode = this.normalizeTimecode(item.timecode || "");
      const timeparts = timecode.split(/\s*-->\s*/);
      const startAss = this.formatSrtTimeToAss(timeparts[0] || "");
      const endAss = this.formatSrtTimeToAss(timeparts[1] || "");

      return `Dialogue: 0,${startAss},${endAss},BlackBox,,0,0,0,,${assText}`;
    }).join("\n");

    return header + dialogues + "\n";
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
   * Dịch toàn bộ danh sách phụ đề SRT với cơ chế Smart Chunking + Đa Luồng Song Song (Worker Pool) + Gối Đầu Ngữ Cảnh
   * @param {Array} items Danh sách items SRT
   * @param {string} modelId ID model Gemini
   * @param {string} style Phong cách dịch
   * @param {Function} onProgress Callback báo tiến độ
   * @param {Object} options Cấu hình luồng { concurrency: 'auto'|1|2|3|4|5, contextOverlap: true }
   */
  async translateSrt(items, modelId, style = "zhihu", onProgress = null, options = {}) {
    if (!items || items.length === 0) return items;

    this.isTranslating = true;
    this.isPaused = false;
    this.isCancelled = false;

    const keys = storageService.getApiKeys();
    if (!keys || keys.length === 0) {
      throw new Error("Chưa cấu hình Gemini API Key. Vui lòng cài đặt ít nhất 1 Key!");
    }

    const { chunks, config } = this.chunkSrtItems(items, modelId);
    const systemPrompt = this.getTranslationSystemPrompt(style, "srt");

    // Xác định số luồng song song (hỗ trợ tự do từ 1 đến 20 luồng)
    let requestedConcurrency = options.concurrency === "auto" || !options.concurrency
      ? Math.max(1, Math.min(keys.length, 5))
      : Math.max(1, Math.min(parseInt(options.concurrency, 10) || 1, 20));
    
    const concurrency = Math.min(requestedConcurrency, chunks.length);
    const useOverlap = options.contextOverlap !== false;

    let completedChunks = 0;
    let nextChunkIndex = 0;

    // Hàng đợi tasks
    const tasks = chunks.map((chunk, idx) => ({
      chunkIndex: idx,
      chunk,
      prevChunk: idx > 0 ? chunks[idx - 1] : null
    }));

    // Hàm thực thi của 1 Worker
    const runWorker = async (workerId) => {
      while (!this.isCancelled && nextChunkIndex < tasks.length) {
        while (this.isPaused && !this.isCancelled) {
          await new Promise(r => setTimeout(r, 500));
        }
        if (this.isCancelled) break;

        const currentTaskIdx = nextChunkIndex++;
        if (currentTaskIdx >= tasks.length) break;

        const task = tasks[currentTaskIdx];
        const { chunkIndex, chunk, prevChunk } = task;
        const chunkSrtInput = this.buildSrt(chunk, "source");

        // Xoay tua phân bổ đều qua toàn bộ danh sách API Keys có sẵn
        let keyIndex = (workerId + currentTaskIdx) % keys.length;
        let currentKey = keys[keyIndex];

        // Gối đầu ngữ cảnh 3 câu cuối của chunk trước
        let contextPrefix = "";
        if (useOverlap && prevChunk && prevChunk.length > 0) {
          const overlapItems = prevChunk.slice(-3);
          const overlapLines = overlapItems.map(it => `${it.timecode}: ${it.originalText}`).join("\n");
          contextPrefix = `[BỐI CẢNH 3 CÂU LIỀN TRƯỚC ĐỂ BẠN NẮM VỮNG ĐẠI TỪ XƯNG HÔ VÀ MẠCH CẢM XÚC - TUYỆT ĐỐI KHÔNG DỊCH LẠI CÁC CÂU NÀY]:\n${overlapLines}\n\n`;
        }

        const prompt = `${contextPrefix}[NỘI DUNG BẮT BUỘC DỊCH SANG TIẾNG VIỆT ĐẦY ĐỦ 100% CÁC KHỐI PHỤ ĐỀ DƯỚI ĐÂY]:\n\n${chunkSrtInput}`;

        if (onProgress) {
          onProgress({
            status: "translating",
            currentChunkIndex: completedChunks + 1,
            totalChunks: chunks.length,
            concurrency,
            workerId: workerId + 1,
            progressPercent: Math.round((completedChunks / chunks.length) * 100),
            message: concurrency > 1
              ? `[Luồng #${workerId + 1}] Đang dịch phần ${chunkIndex + 1}/${chunks.length} (${chunk.length} dòng)...`
              : `Đang dịch phần ${chunkIndex + 1}/${chunks.length} (${chunk.length} dòng phụ đề)...`
          });
        }

        let success = false;
        let retryAttempts = 0;
        const maxWorkerRetries = 3;

        while (!success && retryAttempts < maxWorkerRetries && !this.isCancelled) {
          try {
            const result = await geminiService.callTranslateApiWithKey(prompt, systemPrompt, modelId, currentKey);
            const translatedSrtText = result.text.trim();
            const translatedItems = this.parseSrt(translatedSrtText);

            // Ghép bản dịch vào từng item tương ứng
            chunk.forEach((item, cIdx) => {
              let match = translatedItems.find(t => t.id === item.id);
              if (!match) match = translatedItems.find(t => t.timecode === item.timecode);
              if (!match && translatedItems[cIdx]) match = translatedItems[cIdx];

              if (match && match.originalText) {
                item.translatedText = match.originalText;
              } else if (match && match.translatedText) {
                item.translatedText = match.translatedText;
              }
            });

            completedChunks++;
            success = true;

            if (onProgress) {
              const translatedSoFar = items.filter(it => it.translatedText);
              const accumulatedText = this.buildSrt(translatedSoFar, "translated");

              onProgress({
                status: "chunk_completed",
                currentChunkIndex: completedChunks,
                totalChunks: chunks.length,
                concurrency,
                workerId: workerId + 1,
                progressPercent: Math.round((completedChunks / chunks.length) * 100),
                accumulatedText,
                message: concurrency > 1
                  ? `[Đa Luồng x${concurrency}] Đã xong ${completedChunks}/${chunks.length} phần (${translatedSoFar.length}/${items.length} dòng)!`
                  : `Hoàn thành phần ${completedChunks}/${chunks.length} (${translatedSoFar.length}/${items.length} dòng)!`
              });
            }

            // Delay nhẹ giữa các request của cùng 1 worker
            if (config.delayMs > 0 && nextChunkIndex < tasks.length) {
              await new Promise(r => setTimeout(r, Math.max(500, Math.round(config.delayMs / (concurrency > 1 ? 1.5 : 1)))));
            }

          } catch (err) {
            retryAttempts++;
            console.warn(`Luồng #${workerId + 1} gặp lỗi ở chunk ${chunkIndex + 1} (Lần ${retryAttempts}):`, err.message);

            // Nếu có nhiều key, thử đổi sang key khác
            if (keys.length > 1) {
              keyIndex = (keyIndex + 1) % keys.length;
              currentKey = keys[keyIndex];
              console.log(`Luồng #${workerId + 1} đã chuyển sang API Key số ${keyIndex + 1}`);
            }

            if (retryAttempts >= maxWorkerRetries) {
              throw new Error(`Luồng #${workerId + 1} không thể dịch phần ${chunkIndex + 1}: ${err.message}`);
            }

            await new Promise(r => setTimeout(r, 2000));
          }
        }
      }
    };

    // Chạy song song N workers
    const workerPromises = [];
    for (let w = 0; w < concurrency; w++) {
      workerPromises.push(runWorker(w));
    }

    await Promise.all(workerPromises);

    this.isTranslating = false;

    if (onProgress) {
      onProgress({
        status: "completed",
        currentChunkIndex: chunks.length,
        totalChunks: chunks.length,
        concurrency,
        progressPercent: 100,
        message: `🎉 Đã dịch hoàn tất toàn bộ ${items.length} dòng phụ đề (${concurrency} luồng song song)!`
      });
    }

    return items;
  }

  // ==================== WORKFLOW TRANSLATE NOVEL / RAW ====================

  /**
   * Dịch văn bản tiểu thuyết Raw sang tiếng Việt với cơ chế Đa Luồng Song Song
   */
  async translateNovel(rawText, modelId, style = "zhihu", onProgress = null, options = {}) {
    if (!rawText || typeof rawText !== "string") return "";

    this.isTranslating = true;
    this.isPaused = false;
    this.isCancelled = false;

    const keys = storageService.getApiKeys();
    if (!keys || keys.length === 0) {
      throw new Error("Chưa cấu hình Gemini API Key. Vui lòng cài đặt ít nhất 1 Key!");
    }

    const { chunks, config } = this.chunkRawText(rawText, modelId);
    const systemPrompt = this.getTranslationSystemPrompt(style, "novel");
    
    // Mảng lưu kết quả theo đúng index ban đầu
    const translatedChunks = new Array(chunks.length);

    let requestedConcurrency = options.concurrency === "auto" || !options.concurrency
      ? Math.max(1, Math.min(keys.length, 5))
      : Math.max(1, Math.min(parseInt(options.concurrency, 10) || 1, 20));
    
    const concurrency = Math.min(requestedConcurrency, chunks.length);
    const useOverlap = options.contextOverlap !== false;

    let completedChunks = 0;
    let nextChunkIndex = 0;

    const tasks = chunks.map((chunkText, idx) => ({
      chunkIndex: idx,
      chunkText,
      prevChunkText: idx > 0 ? chunks[idx - 1] : null
    }));

    const runWorker = async (workerId) => {
      while (!this.isCancelled && nextChunkIndex < tasks.length) {
        while (this.isPaused && !this.isCancelled) {
          await new Promise(r => setTimeout(r, 500));
        }
        if (this.isCancelled) break;

        const currentTaskIdx = nextChunkIndex++;
        if (currentTaskIdx >= tasks.length) break;

        const task = tasks[currentTaskIdx];
        const { chunkIndex, chunkText, prevChunkText } = task;

        let keyIndex = (workerId + currentTaskIdx) % keys.length;
        let currentKey = keys[keyIndex];

        let contextPrefix = "";
        if (useOverlap && prevChunkText) {
          const sentences = prevChunkText.split(/([。！？\.\!\?\n]+)/).filter(Boolean);
          const lastSentences = sentences.slice(-6).join("").trim();
          if (lastSentences) {
            contextPrefix = `[BỐI CẢNH ĐOẠN LIỀN TRƯỚC ĐỂ THAM KHẢO MẠCH TRUYỆN - TUYỆT ĐỐI KHÔNG DỊCH LẠI]:\n"${lastSentences}"\n\n`;
          }
        }

        const prompt = `${contextPrefix}Dịch ĐẦY ĐỦ 100% toàn bộ văn bản tiểu thuyết sau đây sang tiếng Việt (TUYỆT ĐỐI KHÔNG TÓM TẮT, KHÔNG CẮT BỚT BẤT KỲ CÂU NÀO):\n\n${chunkText}`;

        if (onProgress) {
          onProgress({
            status: "translating",
            currentChunkIndex: completedChunks + 1,
            totalChunks: chunks.length,
            concurrency,
            workerId: workerId + 1,
            progressPercent: Math.round((completedChunks / chunks.length) * 100),
            message: concurrency > 1
              ? `[Luồng #${workerId + 1}] Đang dịch đoạn ${chunkIndex + 1}/${chunks.length}...`
              : `Đang dịch đoạn ${chunkIndex + 1}/${chunks.length}...`
          });
        }

        let success = false;
        let retryAttempts = 0;
        const maxWorkerRetries = 3;

        while (!success && retryAttempts < maxWorkerRetries && !this.isCancelled) {
          try {
            const result = await geminiService.callTranslateApiWithKey(prompt, systemPrompt, modelId, currentKey);
            translatedChunks[chunkIndex] = result.text.trim();
            completedChunks++;
            success = true;

            if (onProgress) {
              const currentFullText = translatedChunks.filter(Boolean).join("\n\n");
              onProgress({
                status: "chunk_completed",
                currentChunkIndex: completedChunks,
                totalChunks: chunks.length,
                concurrency,
                workerId: workerId + 1,
                progressPercent: Math.round((completedChunks / chunks.length) * 100),
                accumulatedText: currentFullText,
                message: concurrency > 1
                  ? `[Đa Luồng x${concurrency}] Đã xong ${completedChunks}/${chunks.length} đoạn!`
                  : `Hoàn thành đoạn ${completedChunks}/${chunks.length}!`
              });
            }

            if (config.delayMs > 0 && nextChunkIndex < tasks.length) {
              await new Promise(r => setTimeout(r, Math.max(500, Math.round(config.delayMs / (concurrency > 1 ? 1.5 : 1)))));
            }

          } catch (err) {
            retryAttempts++;
            console.warn(`Luồng #${workerId + 1} gặp lỗi ở đoạn ${chunkIndex + 1} (Lần ${retryAttempts}):`, err.message);

            if (keys.length > 1) {
              keyIndex = (keyIndex + 1) % keys.length;
              currentKey = keys[keyIndex];
            }

            if (retryAttempts >= maxWorkerRetries) {
              throw new Error(`Luồng #${workerId + 1} không thể dịch đoạn ${chunkIndex + 1}: ${err.message}`);
            }

            await new Promise(r => setTimeout(r, 2000));
          }
        }
      }
    };

    const workerPromises = [];
    for (let w = 0; w < concurrency; w++) {
      workerPromises.push(runWorker(w));
    }

    await Promise.all(workerPromises);

    this.isTranslating = false;
    const fullTranslatedText = translatedChunks.filter(Boolean).join("\n\n");

    if (onProgress) {
      onProgress({
        status: "completed",
        currentChunkIndex: chunks.length,
        totalChunks: chunks.length,
        concurrency,
        progressPercent: 100,
        accumulatedText: fullTranslatedText,
        message: `🎉 Đã dịch hoàn tất toàn bộ văn bản (${concurrency} luồng song song)!`
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
