/**
 * Translator Controller - Quản lý giao diện và quy trình Tab Dịch Thuật Studio
 * Hỗ trợ dịch tiểu thuyết raw tiếng Trung/Anh và phụ đề video .SRT với Smart Chunking
 */

import { translatorService } from "../services/translatorService.js";
import { storageService } from "../services/storageService.js";

export class TranslatorController {
  constructor(app) {
    this.app = app;
    this.transMode = "srt"; // "srt" | "novel"
    this.transParsedSrt = [];
    this.transRawText = "";
    this.transTranslatedText = "";
  }

  init() {
    this.bindEvents();
    this.updateTransEstimate();
  }

  switchTransMode(mode) {
    this.transMode = mode;
    const btnSrt = document.getElementById("btnTransModeSrt");
    const btnNovel = document.getElementById("btnTransModeNovel");
    const sourceTitle = document.getElementById("transSourceTitle");
    const sourceInput = document.getElementById("transSourceInput");
    const btnVi = document.getElementById("btnDownloadSrtVi");
    const btnBi = document.getElementById("btnDownloadSrtBilingual");
    const btnTxt = document.getElementById("btnDownloadTxt");
    const btnAudio = document.getElementById("btnSendToAudioStudio");
    const btnLib = document.getElementById("btnSaveToLibrary");

    if (mode === "novel") {
      if (btnSrt) btnSrt.classList.remove("active");
      if (btnNovel) btnNovel.classList.add("active");
      if (sourceTitle) sourceTitle.innerHTML = `<span>📖</span> Văn Bản Gốc (Tiếng Trung / Anh / Raw):`;
      if (sourceInput) sourceInput.placeholder = "Dán toàn bộ văn bản tiểu thuyết tiếng Trung (hoặc tiếng Anh) tại đây...\n\nHệ thống sẽ tự động gộp chunk thông minh và dịch trọn vẹn 100% không cắt bớt câu chữ.";
      
      if (btnVi) btnVi.style.display = "none";
      if (btnBi) btnBi.style.display = "none";
      if (btnTxt) btnTxt.style.display = "inline-flex";
      if (btnAudio) btnAudio.style.display = "inline-flex";
      if (btnLib) btnLib.style.display = "inline-flex";
    } else {
      if (btnSrt) btnSrt.classList.add("active");
      if (btnNovel) btnNovel.classList.remove("active");
      if (sourceTitle) sourceTitle.innerHTML = `<span>📄</span> File Phụ Đề Gốc (.SRT):`;
      if (sourceInput) sourceInput.placeholder = "Dán nội dung file phụ đề SRT vào đây...\nVí dụ:\n1\n00:00:01,000 --> 00:00:04,000\n你好，欢迎来到这里\n\n2\n00:00:04,500 --> 00:00:07,000\n今天我们讲一个故事";
      
      if (btnVi) btnVi.style.display = "inline-flex";
      if (btnBi) btnBi.style.display = "inline-flex";
      if (btnTxt) btnTxt.style.display = "none";
      if (btnAudio) btnAudio.style.display = "inline-flex";
      if (btnLib) btnLib.style.display = "inline-flex";
    }

    this.updateTransEstimate();
  }

  handleTransFileInput(file) {
    if (!file) return;

    const isSrt = file.name.endsWith(".srt");
    const isTxt = file.name.endsWith(".txt") || file.name.endsWith(".md");

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      const inputEl = document.getElementById("transSourceInput");
      if (inputEl) {
        inputEl.value = content;
      }

      if (isSrt || translatorService.isSrtContent(content)) {
        this.switchTransMode("srt");
        this.transParsedSrt = translatorService.parseSrt(content);
        
        // Tự động chuẩn hóa timecode và đẩy ra ô kết quả ngay lập tức
        const normalizedSrt = translatorService.buildSrt(this.transParsedSrt, "source");
        const outputEl = document.getElementById("transResultOutput");
        if (outputEl) outputEl.value = normalizedSrt;
        
        this.updateTransExportButtons(true);
        const btnCopy = document.getElementById("btnCopyTranslated");
        if (btnCopy) btnCopy.disabled = false;

        this.app.showToast(`Đã nạp & tự động chuẩn hóa Timecode: ${file.name} (${this.transParsedSrt.length} dòng)`, "success");
      } else {
        this.switchTransMode("novel");
        this.transRawText = content;
        const units = translatorService.countUnits(content);
        this.app.showToast(`Đã nạp văn bản: ${file.name} (~${units.toLocaleString()} chữ)`, "success");
      }

      this.updateTransEstimate();
    };

    reader.readAsText(file, "UTF-8");
  }

  onTransSourceChanged() {
    const raw = document.getElementById("transSourceInput")?.value || "";

    if (translatorService.isSrtContent(raw)) {
      if (this.transMode !== "srt") {
        this.switchTransMode("srt");
      }
      this.transParsedSrt = translatorService.parseSrt(raw);
      
      const normalizedSrt = translatorService.buildSrt(this.transParsedSrt, "source");
      const outputEl = document.getElementById("transResultOutput");
      if (outputEl && !outputEl.value) outputEl.value = normalizedSrt;
      
      this.updateTransExportButtons(true);
      const btnCopy = document.getElementById("btnCopyTranslated");
      if (btnCopy) btnCopy.disabled = false;
    } else {
      if (this.transMode !== "novel" && raw.trim().length > 0) {
        this.switchTransMode("novel");
      }
      this.transRawText = raw;
      this.transParsedSrt = [];
    }

    this.updateTransEstimate();
  }

  updateTransEstimate() {
    const sourceText = document.getElementById("transSourceInput")?.value || "";
    const modelId = document.getElementById("transModelSelect")?.value || "gemini-3.6-flash";
    const estimateBadge = document.getElementById("transEstimateBadge");
    const sourceStats = document.getElementById("transSourceStats");

    if (!sourceText.trim()) {
      if (estimateBadge) estimateBadge.textContent = "Chờ nhập nội dung...";
      if (sourceStats) sourceStats.textContent = "0 dòng • 0 chữ";
      return;
    }

    if (this.transMode === "srt") {
      const items = this.transParsedSrt.length > 0 ? this.transParsedSrt : translatorService.parseSrt(sourceText);
      const totalLines = items.length;
      const totalWords = items.reduce((sum, item) => sum + translatorService.countUnits(item.originalText), 0);

      if (sourceStats) {
        sourceStats.textContent = `${totalLines} dòng phụ đề • ~${totalWords.toLocaleString()} chữ`;
      }

      const { chunks, config } = translatorService.chunkSrtItems(items, modelId);
      const reqCount = chunks.length;
      const estTimeSec = Math.max(2, Math.ceil(reqCount * 2.5));

      if (estimateBadge) {
        estimateBadge.innerHTML = `⚡ <strong>${reqCount} Request</strong> (~${estTimeSec}s hoàn thành • ${config.chunkSize} dòng/phần)`;
      }
    } else {
      // Novel mode
      const totalUnits = translatorService.countUnits(sourceText);
      const totalChars = sourceText.length;

      if (sourceStats) {
        sourceStats.textContent = `${totalUnits.toLocaleString()} chữ • ${totalChars.toLocaleString()} ký tự`;
      }

      const { chunks, config } = translatorService.chunkRawText(sourceText, modelId);
      const reqCount = chunks.length;
      const estTimeSec = Math.max(3, Math.ceil(reqCount * 3));

      if (estimateBadge) {
        estimateBadge.innerHTML = `⚡ <strong>${reqCount} Request</strong> (~${estTimeSec}s hoàn thành • ${config.chunkSize} chữ/phần)`;
      }
    }
  }

  async startTranslation() {
    const sourceText = document.getElementById("transSourceInput")?.value?.trim();
    if (!sourceText) {
      this.app.showToast("Vui lòng nhập hoặc tải file nội dung cần dịch!", "warning");
      return;
    }

    if (storageService.getApiKeys().length === 0) {
      this.app.showToast("Vui lòng cài đặt ít nhất 1 Gemini API Key trước khi dịch!", "warning");
      this.app.openApiSettingsModal();
      return;
    }

    const modelId = document.getElementById("transModelSelect")?.value || "gemini-3.6-flash";
    const customStyle = document.getElementById("transStyleInput")?.value?.trim() || "";

    this.setTranslatingUiState(true);

    const progressBox = document.getElementById("transProgressContainer") || document.getElementById("transProgressBox");
    const progressMsg = document.getElementById("transProgressMsg");
    const progressPct = document.getElementById("transProgressPct");
    const progressBar = document.getElementById("transProgressBar");
    const statusBadge = document.getElementById("transStatusBadge");
    const outputEl = document.getElementById("transResultOutput");
    const btnCopy = document.getElementById("btnCopyTranslated");

    if (progressBox) progressBox.style.display = "block";
    if (outputEl) outputEl.value = "";
    if (statusBadge) {
      statusBadge.textContent = "Đang Dịch...";
      statusBadge.className = "badge badge-pink";
    }

    const onProgress = (p) => {
      if (progressMsg) progressMsg.textContent = p.message;
      if (progressPct) progressPct.textContent = `${p.progressPercent}%`;
      if (progressBar) progressBar.style.width = `${p.progressPercent}%`;

      if (p.accumulatedText && outputEl) {
        outputEl.value = p.accumulatedText;
        outputEl.scrollTop = outputEl.scrollHeight;
        if (btnCopy) btnCopy.disabled = false;
      }
    };

    try {
      if (this.transMode === "srt") {
        const items = this.transParsedSrt.length > 0 ? this.transParsedSrt : translatorService.parseSrt(sourceText);
        this.transParsedSrt = items;

        const translatedItems = await translatorService.translateSrt(items, modelId, customStyle, onProgress);
        this.transParsedSrt = translatedItems;

        const finalSrtText = translatorService.buildSrt(translatedItems, "translated");
        if (outputEl) outputEl.value = finalSrtText;

      } else {
        // Novel mode
        const finalNovelText = await translatorService.translateNovel(sourceText, modelId, customStyle, onProgress);
        this.transTranslatedText = finalNovelText;
        if (outputEl) outputEl.value = finalNovelText;
      }

      if (statusBadge) {
        statusBadge.textContent = "Hoàn Thành 100%";
        statusBadge.className = "badge badge-emerald";
      }

      if (btnCopy) btnCopy.disabled = false;
      this.updateTransExportButtons(true);
      this.app.showToast("🎉 Đã hoàn tất bản dịch thành công!", "success");

    } catch (err) {
      console.error("Translation error:", err);
      this.app.showToast(`Lỗi khi dịch: ${err.message}`, "error");
      if (statusBadge) {
        statusBadge.textContent = "Có Lỗi Xảy Ra";
        statusBadge.className = "badge badge-rose";
      }
    } finally {
      this.setTranslatingUiState(false);
    }
  }

  setTranslatingUiState(isTranslating) {
    const btnStart = document.getElementById("btnStartTranslate");
    const btnPause = document.getElementById("btnPauseTranslate");
    const btnCancel = document.getElementById("btnCancelTranslate");
    const progressBox = document.getElementById("transProgressContainer") || document.getElementById("transProgressBox");

    if (isTranslating) {
      if (btnStart) btnStart.style.display = "none";
      if (btnPause) btnPause.style.display = "inline-flex";
      if (btnCancel) btnCancel.style.display = "inline-flex";
      if (progressBox) progressBox.style.display = "block";
    } else {
      if (btnStart) btnStart.style.display = "inline-flex";
      if (btnPause) btnPause.style.display = "none";
      if (btnCancel) btnCancel.style.display = "none";
    }
  }

  pauseTranslation() {
    translatorService.isPaused = !translatorService.isPaused;
    const btn = document.getElementById("btnPauseTranslate");
    if (btn) {
      btn.textContent = translatorService.isPaused ? "▶️ Tiếp Tục" : "⏸️ Tạm Dừng";
    }
    this.app.showToast(translatorService.isPaused ? "Đã tạm dừng tiến trình dịch." : "Đang tiếp tục dịch...", "info");
  }

  cancelTranslation() {
    if (confirm("Bạn có chắc muốn hủy tiến trình dịch không?")) {
      translatorService.cancel();
      this.setTranslatingUiState(false);
      this.app.showToast("Đã hủy tiến trình dịch.", "warning");
    }
  }

  updateTransExportButtons(enabled) {
    const btnVi = document.getElementById("btnDownloadSrtVi");
    const btnBi = document.getElementById("btnDownloadSrtBilingual");
    const btnTxt = document.getElementById("btnDownloadTxt");
    const btnAudio = document.getElementById("btnSendToAudioStudio");
    const btnLib = document.getElementById("btnSaveToLibrary");

    if (btnVi) btnVi.disabled = !enabled;
    if (btnBi) btnBi.disabled = !enabled;
    if (btnTxt) btnTxt.disabled = !enabled;
    if (btnAudio) btnAudio.disabled = !enabled;
    if (btnLib) btnLib.disabled = !enabled;
  }

  downloadSrt(mode = "translated") {
    if (!this.transParsedSrt || this.transParsedSrt.length === 0) {
      this.app.showToast("Chưa có nội dung phụ đề để tải về!", "warning");
      return;
    }
    const content = translatorService.buildSrt(this.transParsedSrt, mode);
    const suffix = mode === "bilingual" ? "_bilingual.srt" : "_vi.srt";
    const filename = `subtitles_${Date.now()}${suffix}`;
    this.app.triggerDownload(content, filename, "text/plain;charset=utf-8");
    this.app.showToast(`Đã tải file phụ đề: ${filename}`, "success");
  }

  downloadTransTxt() {
    const content = document.getElementById("transResultOutput")?.value || "";
    if (!content) {
      this.app.showToast("Chưa có nội dung văn bản để tải về!", "warning");
      return;
    }
    const filename = `ban_dich_${Date.now()}.txt`;
    this.app.triggerDownload(content, filename, "text/plain;charset=utf-8");
    this.app.showToast(`Đã tải file văn bản: ${filename}`, "success");
  }

  async saveTranslatedToLibrary() {
    const content = document.getElementById("transResultOutput")?.value || "";
    if (!content) {
      this.app.showToast("Chưa có bản dịch để lưu!", "warning");
      return;
    }

    const title = prompt("Nhập tiêu đề cho bộ truyện này:", `Truyện Dịch - ${new Date().toLocaleDateString("vi-VN")}`);
    if (!title) return;

    const words = content.trim().split(/\s+/).filter(Boolean).length;
    const storyObj = {
      id: `story_trans_${Date.now()}`,
      title,
      outline: {
        title,
        premise: "Tác phẩm dịch thuật",
        characters: []
      },
      chapters: [
        {
          chapterNumber: 1,
          title: "Toàn Văn Bản Dịch",
          content: content,
          wordCount: words,
          status: "completed"
        }
      ],
      params: {
        selectedTags: ["Truyện Dịch", "Bản Dịch AI"]
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await storageService.saveStory(storyObj);
    await this.app.updateSavedCount();
    this.app.showToast(`Đã lưu "${title}" vào Thư Viện Studio!`, "success");
  }

  // ==================== EVENT BINDINGS ====================

  bindEvents() {
    const btnModeSrt = document.getElementById("btnTransModeSrt");
    const btnModeNovel = document.getElementById("btnTransModeNovel");
    if (btnModeSrt) btnModeSrt.addEventListener("click", () => this.switchTransMode("srt"));
    if (btnModeNovel) btnModeNovel.addEventListener("click", () => this.switchTransMode("novel"));

    const transModelSelect = document.getElementById("transModelSelect");
    if (transModelSelect) {
      transModelSelect.addEventListener("change", () => this.updateTransEstimate());
    }

    // Translation Custom Style Chips
    const styleInput = document.getElementById("transStyleInput");
    const styleChips = document.querySelectorAll(".btn-style-chip");

    styleChips.forEach(chip => {
      chip.addEventListener("click", () => {
        const styleVal = chip.getAttribute("data-style") || "";
        if (styleInput) {
          styleInput.value = styleVal;
        }
        styleChips.forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
      });
    });

    if (styleInput) {
      styleInput.addEventListener("input", () => {
        const currentVal = styleInput.value.trim();
        styleChips.forEach(chip => {
          const chipVal = chip.getAttribute("data-style") || "";
          if (chipVal === currentVal) {
            chip.classList.add("active");
          } else {
            chip.classList.remove("active");
          }
        });
      });
    }

    const dropzone = document.getElementById("transDropzone");
    const fileInput = document.getElementById("transFileInput");
    const dropzoneTrigger = document.getElementById("dropzoneTrigger");

    if (dropzoneTrigger && fileInput) {
      dropzoneTrigger.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", (e) => {
        if (e.target.files && e.target.files[0]) {
          this.handleTransFileInput(e.target.files[0]);
        }
      });
    }

    if (dropzone) {
      ["dragenter", "dragover"].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add("dragover");
        });
      });

      ["dragleave", "drop"].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove("dragover");
        });
      });

      dropzone.addEventListener("drop", (e) => {
        const files = e.dataTransfer?.files;
        if (files && files[0]) {
          this.handleTransFileInput(files[0]);
        }
      });
    }

    const sourceInput = document.getElementById("transSourceInput");
    if (sourceInput) {
      sourceInput.addEventListener("input", () => this.onTransSourceChanged());
    }

    const btnClearSource = document.getElementById("btnClearTransSource");
    if (btnClearSource) {
      btnClearSource.addEventListener("click", () => {
        if (sourceInput) sourceInput.value = "";
        this.transParsedSrt = [];
        this.transRawText = "";
        this.updateTransEstimate();
      });
    }

    const btnPasteSource = document.getElementById("btnPasteTransSource");
    if (btnPasteSource) {
      btnPasteSource.addEventListener("click", async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            if (sourceInput) sourceInput.value = text;
            this.onTransSourceChanged();
            this.app.showToast("Đã dán văn bản từ clipboard!", "info");
          }
        } catch {
          this.app.showToast("Không thể đọc clipboard tự động, vui lòng dùng Ctrl+V.", "warning");
        }
      });
    }

    const btnStart = document.getElementById("btnStartTranslate");
    if (btnStart) btnStart.addEventListener("click", () => this.startTranslation());

    const btnPause = document.getElementById("btnPauseTranslate");
    if (btnPause) btnPause.addEventListener("click", () => this.pauseTranslation());

    const btnCancel = document.getElementById("btnCancelTranslate");
    if (btnCancel) btnCancel.addEventListener("click", () => this.cancelTranslation());

    const btnVi = document.getElementById("btnDownloadSrtVi");
    if (btnVi) btnVi.addEventListener("click", () => this.downloadSrt("translated"));

    const btnBi = document.getElementById("btnDownloadSrtBilingual");
    if (btnBi) btnBi.addEventListener("click", () => this.downloadSrt("bilingual"));

    const btnTxt = document.getElementById("btnDownloadTxt");
    if (btnTxt) btnTxt.addEventListener("click", () => this.downloadTransTxt());

    const btnAudio = document.getElementById("btnSendToAudioStudio");
    if (btnAudio) btnAudio.addEventListener("click", () => this.app.sendTranslatedToAudio());

    const btnSaveLib = document.getElementById("btnSaveToLibrary");
    if (btnSaveLib) btnSaveLib.addEventListener("click", () => this.saveTranslatedToLibrary());
  }
}
