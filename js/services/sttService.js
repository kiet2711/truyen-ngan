/**
 * CapCut Speech-to-Text (STT) Client Service
 * Điều phối tải file âm thanh/video, gọi API nhận dạng giọng nói và định dạng phụ đề .SRT / văn bản
 */

export class SttService {
  constructor() {
    this.isTranscribing = false;
    this.isCancelled = false;
    this.currentTaskId = null;
  }

  /**
   * Format milliseconds sang định dạng thời gian SRT: 00:01:23,456
   */
  formatMsToSrt(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const milliseconds = Math.floor(ms % 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(milliseconds, 3)}`;
  }

  /**
   * Format milliseconds sang hiển thị phát âm: 01:23
   */
  formatMsToDisplay(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(minutes)}:${pad(seconds)}`;
  }

  /**
   * Tách / Tạo chuỗi chuẩn SRT từ danh sách câu nhận diện
   */
  buildSrtString(utterances) {
    if (!Array.isArray(utterances) || utterances.length === 0) return "";
    return utterances
      .filter(u => u && u.text && u.text.trim())
      .map((u, i) => {
        const start = this.formatMsToSrt(u.startTime || u.start_time || 0);
        const end = this.formatMsToSrt(u.endTime || u.end_time || 0);
        return `${i + 1}\n${start} --> ${end}\n${u.text.trim()}\n`;
      })
      .join('\n');
  }

  /**
   * Tạo văn bản thuần nối liền từ danh sách câu nhận diện
   */
  buildFullText(utterances) {
    if (!Array.isArray(utterances)) return "";
    return utterances
      .map(u => (u.text || "").trim())
      .filter(Boolean)
      .join(" ");
  }

  /**
   * Nhận dạng file âm thanh/video qua Backend API với cơ chế Async Polling
   * @param {File|Blob} file File âm thanh/video
   * @param {Object} options Cấu hình (language, useTranslation, translationLanguage)
   * @param {Function} onProgress Callback báo tiến độ
   */
  async transcribe(file, options = {}, onProgress = null) {
    if (!file) {
      throw new Error("Vui lòng chọn hoặc kéo thả tệp âm thanh / video cần nhận dạng.");
    }

    this.isTranscribing = true;
    this.isCancelled = false;
    this.currentTaskId = null;

    const {
      language = "vi-VN",
      useTranslation = false,
      translationLanguage = "vi-VN"
    } = options;

    if (onProgress) {
      onProgress({
        status: "uploading",
        progress: 10,
        message: "Đang tải tệp âm thanh lên máy chủ CapCut..."
      });
    }

    try {
      // 1. Gửi tệp lên endpoint /api/stt/start để tạo tác vụ nền
      const headers = {
        "x-language": language,
        "x-use-translation": useTranslation ? "1" : "0",
        "x-translation-language": translationLanguage
      };

      const startResp = await fetch("/api/stt/start", {
        method: "POST",
        headers: headers,
        body: file
      });

      if (!startResp.ok) {
        // Fallback: Thử gọi đồng bộ /api/stt/transcribe nếu start không khả dụng
        const errText = await startResp.text();
        throw new Error(`Khởi tạo STT thất bại (${startResp.status}): ${errText}`);
      }

      const startData = await startResp.json();
      const taskId = startData.taskId;
      this.currentTaskId = taskId;

      // 2. Polling tiến trình qua /api/stt/status/:taskId
      const pollInterval = 1200; // ms
      const maxPolls = 500; // ~10 phút
      let pollCount = 0;

      while (this.isTranscribing && !this.isCancelled && pollCount < maxPolls) {
        await new Promise(r => setTimeout(r, pollInterval));
        pollCount++;

        if (this.isCancelled) {
          throw new Error("Người dùng đã hủy tiến trình nhận dạng.");
        }

        const statusResp = await fetch(`/api/stt/status/${taskId}`);
        if (!statusResp.ok) continue;

        const statusData = await statusResp.json();
        const { status, progress, message, error } = statusData;

        if (onProgress) {
          onProgress({
            status: status || "processing",
            progress: typeof progress === "number" ? progress : 50,
            message: message || "Máy chủ đang xử lý giọng nói..."
          });
        }

        if (status === "completed") {
          // 3. Lấy kết quả hoàn chỉnh qua /api/stt/result/:taskId
          const resResp = await fetch(`/api/stt/result/${taskId}`);
          if (!resResp.ok) {
            throw new Error("Không thể tải kết quả nhận dạng từ máy chủ.");
          }

          const resData = await resResp.json();
          const data = resData.data || resData;

          this.isTranscribing = false;
          return {
            utterances: data.utterances || [],
            srt: data.srt || this.buildSrtString(data.utterances),
            fullText: data.fullText || this.buildFullText(data.utterances),
            durationMs: data.durationMs || 0,
            language: data.language || language,
            totalSentences: (data.utterances || []).length
          };

        } else if (status === "failed" || status === "error") {
          this.isTranscribing = false;
          throw new Error(error || message || "Nhận dạng giọng nói thất bại trên máy chủ CapCut.");
        }
      }

      this.isTranscribing = false;
      throw new Error("Quá thời gian chờ phản hồi từ máy chủ nhận dạng.");

    } catch (err) {
      this.isTranscribing = false;
      throw err;
    }
  }

  /**
   * Hủy tiến trình nhận dạng đang thực hiện
   */
  cancel() {
    this.isCancelled = true;
    this.isTranscribing = false;
  }
}

export const sttService = new SttService();
