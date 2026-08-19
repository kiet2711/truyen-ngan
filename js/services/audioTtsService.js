/**
 * CapCut Text-to-Speech (TTS) Service
 * Hỗ trợ chuyển đổi văn bản truyện thành giọng đọc AI tự nhiên, đa luồng, xử lý truyện dài và phát âm thanh trực tiếp.
 */

import { storageService } from "./storageService.js";

const DEFAULT_TTS_API_URL = "https://tao-audio-truyen.onrender.com";

export class AudioTtsService {
  constructor() {
    this.voices = [];
    this.currentAudioUrl = null;
    this.isGenerating = false;
    this.isCancelled = false;
    this.currentTaskId = null;
  }

  /**
   * Lấy URL máy chủ TTS (mặc định hoặc từ Settings)
   */
  getApiBaseUrl() {
    const settings = storageService.getSettings();
    let url = settings.ttsApiUrl || DEFAULT_TTS_API_URL;
    return url.replace(/\/+$/, "");
  }

  /**
   * Tải danh sách giọng đọc từ Voice.json hoặc API
   */
  async loadVoices() {
    if (this.voices && this.voices.length > 0) {
      return this.voices;
    }

    try {
      // Ưu tiên tải từ file cục bộ Voice.json
      const localResp = await fetch("js/data/Voice.json");
      if (localResp.ok) {
        this.voices = await localResp.json();
        return this.voices;
      }
    } catch (e) {
      console.warn("Không thể đọc file cục bộ Voice.json, thử gọi API server...", e);
    }

    try {
      const apiResp = await fetch(`${this.getApiBaseUrl()}/api/voices`);
      if (apiResp.ok) {
        const data = await apiResp.json();
        this.voices = data.voices || data || [];
        return this.voices;
      }
    } catch (e) {
      console.error("Lỗi khi tải danh sách giọng đọc từ API:", e);
    }

    return [];
  }

  /**
   * Lọc danh sách giọng đọc theo ngôn ngữ và từ khóa
   */
  filterVoices(lang = "vi-VN", query = "") {
    if (!this.voices || this.voices.length === 0) return [];
    
    return this.voices.filter(v => {
      // Lọc theo ngôn ngữ
      const matchLang = lang === "all" || v.lang === lang || (lang === "vi-VN" && v.lan === "vi");
      if (!matchLang) return false;

      // Lọc theo từ khóa tìm kiếm
      if (!query || !query.trim()) return true;
      const q = query.toLowerCase().trim();
      const name = (v.display_name || "").toLowerCase();
      const code = (v.voice_type || "").toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  }

  /**
   * Tách văn bản dài thành các đoạn nhỏ dưới 250 ký tự cho CapCut TTS
   */
  splitTextChunks(text, maxChars = 250) {
    if (!text || typeof text !== "string") return [];
    const cleaned = text.trim();
    if (!cleaned) return [];

    const paragraphs = cleaned.split(/\n+/).map(p => p.trim()).filter(Boolean);
    const chunks = [];

    for (const para of paragraphs) {
      if (para.length <= maxChars) {
        chunks.push(para);
        continue;
      }

      // Tách theo câu dấu chấm, hỏi, than, chấm phẩy
      const sentences = para.split(/(?<=[.!?。！？;；])\s+/).filter(Boolean);
      let current = "";

      for (const s of sentences) {
        if (!s.trim()) continue;

        if (current.length + s.length + 1 <= maxChars) {
          current = current ? `${current} ${s}` : s;
        } else {
          if (current) {
            chunks.push(current);
            current = "";
          }

          if (s.length > maxChars) {
            // Tách tiếp theo dấu phẩy, hai chấm
            const commaParts = s.split(/(?<=[,，:：\-])\s+/).filter(Boolean);
            let subCurr = "";
            for (const cp of commaParts) {
              if (subCurr.length + cp.length + 1 <= maxChars) {
                subCurr = subCurr ? `${subCurr} ${cp}` : cp;
              } else {
                if (subCurr) {
                  chunks.push(subCurr);
                  subCurr = "";
                }
                if (cp.length > maxChars) {
                  // Tách theo từ
                  const words = cp.split(/\s+/).filter(Boolean);
                  let wCurr = "";
                  for (const w of words) {
                    if (wCurr.length + w.length + 1 <= maxChars) {
                      wCurr = wCurr ? `${wCurr} ${w}` : w;
                    } else {
                      if (wCurr) chunks.push(wCurr);
                      wCurr = w;
                    }
                  }
                  if (wCurr) chunks.push(wCurr);
                } else {
                  subCurr = cp;
                }
              }
            }
            if (subCurr) chunks.push(subCurr);
          } else {
            current = s;
          }
        }
      }

      if (current) chunks.push(current);
    }

    return chunks.filter(c => c.trim().length > 0);
  }

  /**
   * Tạo Audio bằng API không đồng bộ (Async Task) với tiến độ thời gian thực
   */
  async generateAudioAsync(options, onProgress = null) {
    const {
      text,
      voice = "BV074_streaming",
      resource_id = null,
      rate = 1.0,
      threads = 30
    } = options;

    if (!text || !text.trim()) {
      throw new Error("Vui lòng nhập hoặc chọn văn bản cần tạo audio!");
    }

    this.isGenerating = true;
    this.isCancelled = false;
    this.currentTaskId = null;

    const baseUrl = this.getApiBaseUrl();
    const chunks = this.splitTextChunks(text, 250);

    if (onProgress) {
      onProgress({
        status: "starting",
        progress: 0,
        completedChunks: 0,
        totalChunks: chunks.length,
        message: `Khởi tạo tiến trình tạo audio (${chunks.length} đoạn)...`
      });
    }

    // Gửi yêu cầu tạo task async
    const payload = {
      text,
      voice,
      resource_id,
      rate: parseFloat(rate) || 1.0,
      threads: parseInt(threads, 10) || 30,
      auto_split: true
    };

    const startResp = await fetch(`${baseUrl}/api/tts/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!startResp.ok) {
      const errText = await startResp.text();
      throw new Error(`Lỗi máy chủ TTS (${startResp.status}): ${errText}`);
    }

    const startData = await startResp.json();
    const taskId = startData.task_id;
    this.currentTaskId = taskId;

    // Polling theo dõi tiến độ task
    const pollInterval = 800; // ms
    let pollCount = 0;
    const maxPolls = 600; // Tối đa 8 phút

    while (this.isGenerating && !this.isCancelled && pollCount < maxPolls) {
      await new Promise(r => setTimeout(r, pollInterval));
      pollCount++;

      if (this.isCancelled) {
        throw new Error("Người dùng đã hủy tiến trình tạo audio.");
      }

      const statusResp = await fetch(`${baseUrl}/api/tts/status/${taskId}`);
      if (!statusResp.ok) continue;

      const taskStatus = await statusResp.json();
      const progressPercent = typeof taskStatus.percent === "number" ? taskStatus.percent : 0;
      const completedChunks = taskStatus.completed_chunks || 0;
      const totalChunks = taskStatus.total_chunks || chunks.length;

      if (onProgress) {
        onProgress({
          status: taskStatus.status,
          progress: progressPercent,
          completedChunks: completedChunks,
          totalChunks: totalChunks,
          message: `Đang tạo audio ${completedChunks}/${totalChunks} đoạn (${progressPercent}%)...`
        });
      }

      if (taskStatus.status === "completed") {
        // Tải dữ liệu file audio MP3
        const audioResp = await fetch(`${baseUrl}/api/tts/audio/${taskId}`);
        if (!audioResp.ok) {
          throw new Error("Không thể tải file âm thanh sau khi hoàn thành.");
        }

        const audioBlob = await audioResp.blob();
        if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
          if (this.currentAudioUrl && this.currentAudioUrl.startsWith("blob:")) {
            URL.revokeObjectURL(this.currentAudioUrl);
          }
          this.currentAudioUrl = URL.createObjectURL(audioBlob);
        } else {
          this.currentAudioUrl = `${baseUrl}/api/tts/audio/${taskId}`;
        }
        this.isGenerating = false;

        return {
          audioUrl: this.currentAudioUrl,
          audioBlob,
          duration: taskStatus.duration_seconds || 0,
          totalChunks: totalChunks
        };

      } else if (taskStatus.status === "error" || taskStatus.status === "failed") {
        this.isGenerating = false;
        throw new Error(taskStatus.error_message || taskStatus.error || "Tạo audio thất bại trên máy chủ CapCut.");
      }
    }

    this.isGenerating = false;
    throw new Error("Quá thời gian chờ phản hồi từ máy chủ TTS.");
  }

  /**
   * Đổi Device ID trên máy chủ CapCut để gỡ giới hạn/ban
   */
  async resetDeviceId() {
    const baseUrl = this.getApiBaseUrl();
    const resp = await fetch(`${baseUrl}/api/reset-device`, {
      method: "POST"
    });

    if (!resp.ok) {
      throw new Error(`Không thể đổi Device ID (${resp.status})`);
    }

    return await resp.json();
  }

  /**
   * Hủy tiến trình tạo audio đang chạy
   */
  cancel() {
    this.isCancelled = true;
    this.isGenerating = false;
  }
}

export const audioTtsService = new AudioTtsService();
