/**
 * SttController - Quản lý giao diện & logic cho Tab 4: Nhận Dạng Giọng Nói (CapCut STT Studio)
 * Chuyển đổi Audio/Video thành Phụ đề .SRT & Văn bản truyện hoàn chỉnh
 */

import { sttService } from "../services/sttService.js";

export class SttController {
  constructor(app) {
    this.app = app;
    this.selectedFile = null;
    this.audioPreviewUrl = null;
    this.selectedLanguage = "vi-VN";
    this.useTranslation = false;
    this.translationLanguage = "vi-VN";
    this.isProcessing = false;
    this.currentResult = null;
    this.activeResultView = "timeline"; // "timeline" | "fulltext" | "rawsrt"
  }

  init() {
    this.bindEvents();
  }

  bindEvents() {
    // 1. File Upload & Drag-and-drop
    const dropZone = document.getElementById("sttDropZone");
    const fileInput = document.getElementById("sttFileInput");
    const btnSelectFile = document.getElementById("btnSttSelectFile");

    if (btnSelectFile && fileInput) {
      btnSelectFile.addEventListener("click", () => fileInput.click());
    }

    if (dropZone && fileInput) {
      dropZone.addEventListener("click", (e) => {
        if (e.target.closest("button") || e.target.closest("input")) return;
        fileInput.click();
      });

      dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
      });

      dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("dragover");
      });

      dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this.handleFileSelected(e.dataTransfer.files[0]);
        }
      });

      fileInput.addEventListener("change", (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this.handleFileSelected(e.target.files[0]);
        }
      });
    }

    // 2. Clear / Change File
    const btnRemoveFile = document.getElementById("btnSttRemoveFile");
    if (btnRemoveFile) {
      btnRemoveFile.addEventListener("click", () => this.clearSelectedFile());
    }

    // 3. Language Selector Chips
    const langChips = document.querySelectorAll("#sttLangChips .btn-style-chip");
    langChips.forEach(chip => {
      chip.addEventListener("click", () => {
        langChips.forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        this.selectedLanguage = chip.dataset.lang || "vi-VN";
      });
    });

    // 4. Translation Toggle & Target Language
    const chkTranslate = document.getElementById("chkSttTranslate");
    const targetLangSelect = document.getElementById("sttTargetLangSelect");
    if (chkTranslate) {
      chkTranslate.addEventListener("change", () => {
        this.useTranslation = chkTranslate.checked;
        if (targetLangSelect) {
          targetLangSelect.disabled = !this.useTranslation;
        }
      });
    }

    if (targetLangSelect) {
      targetLangSelect.addEventListener("change", () => {
        this.translationLanguage = targetLangSelect.value;
      });
    }

    // 5. Start / Cancel Transcribe
    const btnStart = document.getElementById("btnSttStartTranscribe");
    if (btnStart) {
      btnStart.addEventListener("click", () => this.startTranscribe());
    }

    const btnCancel = document.getElementById("btnSttCancel");
    if (btnCancel) {
      btnCancel.addEventListener("click", () => this.cancelTranscribe());
    }

    // 6. Result Sub-tabs (Timeline / Full Text / Raw SRT)
    const tabTimeline = document.getElementById("btnSttTabTimeline");
    const tabFullText = document.getElementById("btnSttTabFullText");
    const tabRawSrt = document.getElementById("btnSttTabRawSrt");

    if (tabTimeline) tabTimeline.addEventListener("click", () => this.switchResultView("timeline"));
    if (tabFullText) tabFullText.addEventListener("click", () => this.switchResultView("fulltext"));
    if (tabRawSrt) tabRawSrt.addEventListener("click", () => this.switchResultView("rawsrt"));

    // 7. Action Buttons (Export & Cross-tab integration)
    const btnDownloadSrt = document.getElementById("btnSttDownloadSrt");
    if (btnDownloadSrt) {
      btnDownloadSrt.addEventListener("click", () => this.downloadSrt());
    }

    const btnDownloadTxt = document.getElementById("btnSttDownloadTxt");
    if (btnDownloadTxt) {
      btnDownloadTxt.addEventListener("click", () => this.downloadTxt());
    }

    const btnCopyResult = document.getElementById("btnSttCopyResult");
    if (btnCopyResult) {
      btnCopyResult.addEventListener("click", () => this.copyResult());
    }

    const btnSendToTrans = document.getElementById("btnSttSendToTranslator");
    if (btnSendToTrans) {
      btnSendToTrans.addEventListener("click", () => this.sendToTranslatorStudio());
    }

    const btnSendToNovel = document.getElementById("btnSttSendToNovel");
    if (btnSendToNovel) {
      btnSendToNovel.addEventListener("click", () => this.sendToNovelStudio());
    }

    const btnSendToAudio = document.getElementById("btnSttSendToAudio");
    if (btnSendToAudio) {
      btnSendToAudio.addEventListener("click", () => this.sendToAudioStudio());
    }
  }

  // ==================== FILE HANDLING ====================

  handleFileSelected(file) {
    if (!file) return;

    // Check supported format
    const validExtensions = [".mp3", ".m4a", ".mp4", ".wav", ".aac", ".flac", ".ogg", ".webm", ".mkv"];
    const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
    
    if (!validExtensions.includes(ext) && !file.type.startsWith("audio/") && !file.type.startsWith("video/")) {
      this.app.showToast(`Định dạng "${ext}" không được hỗ trợ. Vui lòng chọn tệp Audio/Video (.mp3, .m4a, .mp4, .wav, .flac...)`, "warning");
      return;
    }

    this.selectedFile = file;

    // Update UI Preview
    const dropPrompt = document.getElementById("sttDropPrompt");
    const fileCard = document.getElementById("sttSelectedFileCard");
    const fileNameEl = document.getElementById("sttFileName");
    const fileSizeEl = document.getElementById("sttFileSize");
    const audioPlayer = document.getElementById("sttAudioPlayer");

    if (dropPrompt) dropPrompt.style.display = "none";
    if (fileCard) fileCard.style.display = "flex";

    if (fileNameEl) fileNameEl.textContent = file.name;
    if (fileSizeEl) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      fileSizeEl.textContent = `${sizeMb} MB • ${ext.toUpperCase()}`;
    }

    // Create Audio Preview
    if (this.audioPreviewUrl) {
      URL.revokeObjectURL(this.audioPreviewUrl);
    }
    this.audioPreviewUrl = URL.createObjectURL(file);
    if (audioPlayer) {
      audioPlayer.src = this.audioPreviewUrl;
      audioPlayer.style.display = "block";
    }

    const btnStart = document.getElementById("btnSttStartTranscribe");
    if (btnStart) btnStart.disabled = false;

    this.app.showToast(`Đã chọn file: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`, "info");
  }

  clearSelectedFile() {
    this.selectedFile = null;
    if (this.audioPreviewUrl) {
      URL.revokeObjectURL(this.audioPreviewUrl);
      this.audioPreviewUrl = null;
    }

    const fileInput = document.getElementById("sttFileInput");
    if (fileInput) fileInput.value = "";

    const dropPrompt = document.getElementById("sttDropPrompt");
    const fileCard = document.getElementById("sttSelectedFileCard");
    const audioPlayer = document.getElementById("sttAudioPlayer");
    const btnStart = document.getElementById("btnSttStartTranscribe");

    if (dropPrompt) dropPrompt.style.display = "block";
    if (fileCard) fileCard.style.display = "none";
    if (audioPlayer) {
      audioPlayer.pause();
      audioPlayer.src = "";
      audioPlayer.style.display = "none";
    }
    if (btnStart) btnStart.disabled = true;
  }

  // ==================== EXECUTION & PROGRESS ====================

  async startTranscribe() {
    if (!this.selectedFile) {
      this.app.showToast("Vui lòng chọn file âm thanh trước khi nhận dạng!", "warning");
      return;
    }

    this.isProcessing = true;
    this.updateProcessingState(true);

    const progressSection = document.getElementById("sttProgressSection");
    const progressBar = document.getElementById("sttProgressBar");
    const progressPercent = document.getElementById("sttProgressPercent");
    const progressStatusText = document.getElementById("sttProgressStatusText");
    const resultSection = document.getElementById("sttResultSection");

    if (progressSection) progressSection.style.display = "block";
    if (resultSection) resultSection.style.display = "none";

    try {
      const result = await sttService.transcribe(
        this.selectedFile,
        {
          language: this.selectedLanguage,
          useTranslation: this.useTranslation,
          translationLanguage: this.translationLanguage
        },
        (progress) => {
          if (progressBar) progressBar.style.width = `${progress.progress || 10}%`;
          if (progressPercent) progressPercent.textContent = `${progress.progress || 10}%`;
          if (progressStatusText) progressStatusText.textContent = progress.message || "Đang nhận diện giọng nói...";
        }
      );

      this.currentResult = result;
      this.renderResults(result);
      this.app.showToast(`Nhận dạng thành công! Tìm thấy ${result.totalSentences} câu phụ đề. ✨`, "success");

    } catch (err) {
      console.error("STT Error:", err);
      this.app.showToast(`Lỗi: ${err.message || "Không thể nhận dạng giọng nói."}`, "error");
      if (progressStatusText) {
        progressStatusText.innerHTML = `<span style="color: #ef4444;">❌ Lỗi: ${err.message || "Thất bại"}</span>`;
      }
    } finally {
      this.isProcessing = false;
      this.updateProcessingState(false);
    }
  }

  cancelTranscribe() {
    sttService.cancel();
    this.isProcessing = false;
    this.updateProcessingState(false);
    this.app.showToast("Đã hủy tác vụ nhận dạng giọng nói.", "info");
  }

  updateProcessingState(processing) {
    const btnStart = document.getElementById("btnSttStartTranscribe");
    const btnCancel = document.getElementById("btnSttCancel");
    const fileInput = document.getElementById("sttFileInput");
    const btnSelect = document.getElementById("btnSttSelectFile");

    if (btnStart) {
      btnStart.disabled = processing;
      btnStart.innerHTML = processing 
        ? `<span class="typing-cursor"></span> Đang Nhận Dạng Giọng Nói...` 
        : `⚡ Bắt Đầu Nhận Dạng (STT)`;
    }

    if (btnCancel) btnCancel.style.display = processing ? "inline-flex" : "none";
    if (fileInput) fileInput.disabled = processing;
    if (btnSelect) btnSelect.disabled = processing;
  }

  // ==================== RENDERING RESULTS ====================

  renderResults(result) {
    const resultSection = document.getElementById("sttResultSection");
    if (resultSection) resultSection.style.display = "block";

    // Summary stats
    const statSentences = document.getElementById("sttStatSentences");
    const statWords = document.getElementById("sttStatWords");
    const statDuration = document.getElementById("sttStatDuration");

    const totalWords = this.app.countWords(result.fullText);
    if (statSentences) statSentences.textContent = `${result.totalSentences} câu`;
    if (statWords) statWords.textContent = `${totalWords.toLocaleString("vi-VN")} từ`;
    if (statDuration) statDuration.textContent = sttService.formatMsToDisplay(result.durationMs);

    // 1. Render Timeline Cards
    this.renderTimeline(result.utterances);

    // 2. Render Full Text
    const fullTextArea = document.getElementById("sttFullTextOutput");
    if (fullTextArea) fullTextArea.value = result.fullText;

    // 3. Render Raw SRT Code
    const rawSrtArea = document.getElementById("sttRawSrtOutput");
    if (rawSrtArea) rawSrtArea.value = result.srt;

    this.switchResultView("timeline");
  }

  renderTimeline(utterances) {
    const container = document.getElementById("sttTimelineContainer");
    if (!container) return;
    container.innerHTML = "";

    if (!Array.isArray(utterances) || utterances.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-dim);">Không có dữ liệu phụ đề.</div>`;
      return;
    }

    utterances.forEach((ut, idx) => {
      const card = document.createElement("div");
      card.className = "stt-timeline-card";

      const header = document.createElement("div");
      header.className = "stt-timeline-card-header";

      header.innerHTML = `
        <div class="stt-timeline-index-badge">#${idx + 1}</div>
        <div class="stt-timeline-timecodes">
          <span class="stt-timecode-tag">${ut.startFormatted}</span>
          <span style="color: var(--text-dim); font-size: 11px;">➔</span>
          <span class="stt-timecode-tag">${ut.endFormatted}</span>
        </div>
        <button class="btn btn-secondary btn-xs btn-play-cue" title="Phát đoạn này">
          ▶️ Nghe
        </button>
      `;

      const body = document.createElement("div");
      body.className = "stt-timeline-card-body";

      const textInput = document.createElement("textarea");
      textInput.className = "stt-timeline-textarea";
      textInput.rows = 2;
      textInput.value = ut.text;

      // Realtime text edit sync
      textInput.addEventListener("input", () => {
        ut.text = textInput.value;
        this.syncModifiedUtterances();
      });

      // Play audio cue
      const playBtn = header.querySelector(".btn-play-cue");
      if (playBtn) {
        playBtn.addEventListener("click", () => {
          const audioPlayer = document.getElementById("sttAudioPlayer");
          if (audioPlayer && this.audioPreviewUrl) {
            audioPlayer.currentTime = (ut.startTime || 0) / 1000;
            audioPlayer.play();
          }
        });
      }

      body.appendChild(textInput);
      card.appendChild(header);
      card.appendChild(body);
      container.appendChild(card);
    });
  }

  syncModifiedUtterances() {
    if (!this.currentResult) return;
    this.currentResult.srt = sttService.buildSrtString(this.currentResult.utterances);
    this.currentResult.fullText = sttService.buildFullText(this.currentResult.utterances);

    const fullTextArea = document.getElementById("sttFullTextOutput");
    if (fullTextArea) fullTextArea.value = this.currentResult.fullText;

    const rawSrtArea = document.getElementById("sttRawSrtOutput");
    if (rawSrtArea) rawSrtArea.value = this.currentResult.srt;
  }

  switchResultView(viewName) {
    this.activeResultView = viewName;

    const tabTimeline = document.getElementById("btnSttTabTimeline");
    const tabFullText = document.getElementById("btnSttTabFullText");
    const tabRawSrt = document.getElementById("btnSttTabRawSrt");

    const viewTimeline = document.getElementById("sttTimelineView");
    const viewFullText = document.getElementById("sttFullTextView");
    const viewRawSrt = document.getElementById("sttRawSrtView");

    if (tabTimeline) tabTimeline.classList.toggle("active", viewName === "timeline");
    if (tabFullText) tabFullText.classList.toggle("active", viewName === "fulltext");
    if (tabRawSrt) tabRawSrt.classList.toggle("active", viewName === "rawsrt");

    if (viewTimeline) viewTimeline.style.display = viewName === "timeline" ? "block" : "none";
    if (viewFullText) viewFullText.style.display = viewName === "fulltext" ? "block" : "none";
    if (viewRawSrt) viewRawSrt.style.display = viewName === "rawsrt" ? "block" : "none";
  }

  // ==================== EXPORT & PIPELINE INTEGRATIONS ====================

  downloadSrt() {
    if (!this.currentResult || !this.currentResult.srt) {
      this.app.showToast("Chưa có nội dung phụ đề SRT để tải về!", "warning");
      return;
    }
    const baseName = (this.selectedFile?.name || "subtitles").replace(/\.[^/.]+$/, "");
    this.app.triggerDownload(this.currentResult.srt, `${baseName}_subtitle.srt`, "text/plain;charset=utf-8");
    this.app.showToast("Đã tải xuống file phụ đề chuẩn .SRT! 📥", "success");
  }

  downloadTxt() {
    if (!this.currentResult || !this.currentResult.fullText) {
      this.app.showToast("Chưa có văn bản để tải về!", "warning");
      return;
    }
    const baseName = (this.selectedFile?.name || "transcript").replace(/\.[^/.]+$/, "");
    this.app.triggerDownload(this.currentResult.fullText, `${baseName}_transcript.txt`, "text/plain;charset=utf-8");
    this.app.showToast("Đã tải xuống file toàn văn bản .TXT! 📥", "success");
  }

  copyResult() {
    if (!this.currentResult) {
      this.app.showToast("Chưa có kết quả để sao chép!", "warning");
      return;
    }
    const textToCopy = this.activeResultView === "rawsrt" ? this.currentResult.srt : this.currentResult.fullText;
    navigator.clipboard.writeText(textToCopy).then(() => {
      this.app.showToast("Đã sao chép nội dung vào Clipboard! 📋", "success");
    }).catch(() => {
      this.app.showToast("Không thể sao chép vào Clipboard", "error");
    });
  }

  sendToTranslatorStudio() {
    if (!this.currentResult || !this.currentResult.srt) {
      this.app.showToast("Chưa có kết quả phụ đề để gửi sang Dịch Thuật!", "warning");
      return;
    }
    this.app.switchWorkspace("translator");
    const transInput = document.getElementById("transSourceInput");
    if (transInput) {
      transInput.value = this.currentResult.srt;
      this.app.translatorController.onSourceTextChanged();
    }
    this.app.showToast("Đã nạp toàn bộ phụ đề SRT vào Tab Dịch Thuật Studio! ✨", "success");
  }

  sendToNovelStudio() {
    if (!this.currentResult || !this.currentResult.fullText) {
      this.app.showToast("Chưa có văn bản để gửi sang Sáng Tác!", "warning");
      return;
    }
    this.app.switchWorkspace("novel");
    this.app.novelController.goToStep(1);
    const premiseInput = document.getElementById("userPremiseInput");
    if (premiseInput) {
      premiseInput.value = this.currentResult.fullText.slice(0, 1000);
    }
    this.app.showToast("Đã nạp văn bản làm ý tưởng cốt truyện cho Tab Sáng Tác! ✨", "success");
  }

  sendToAudioStudio() {
    if (!this.currentResult || !this.currentResult.fullText) {
      this.app.showToast("Chưa có văn bản để gửi sang Tạo Audio!", "warning");
      return;
    }
    this.app.switchWorkspace("audio");
    const audioInput = document.getElementById("audioTextInput");
    if (audioInput) {
      audioInput.value = this.currentResult.fullText;
      this.app.audioController.onAudioTextChanged();
    }
    this.app.showToast("Đã nạp văn bản vào Tab Tạo Audio Truyện (TTS)! ✨", "success");
  }
}
