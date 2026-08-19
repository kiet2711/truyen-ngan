/**
 * Audio Controller - Quản lý toàn bộ giao diện Tab Tạo Audio Truyện (CapCut TTS Studio)
 * Hỗ trợ chuyển văn bản thành giọng đọc AI tự nhiên, đa luồng, xử lý truyện dài và trình phát MP3
 */

import { audioTtsService } from "../services/audioTtsService.js";
import { translatorService } from "../services/translatorService.js";
import { normalizeTextForAudio } from "../data/numberToWordsVi.js";

export class AudioController {
  constructor(app) {
    this.app = app;
    this.audioVoices = [];
    this.currentAudioBlob = null;
    this.selectedAudioVoice = "BV074_streaming";
    this.selectedAudioLang = "vi-VN";
  }

  async init() {
    this.bindEvents();
    await this.loadVoices();
  }

  async loadVoices() {
    try {
      this.audioVoices = await audioTtsService.loadVoices();
      const badge = document.getElementById("audioVoiceCountBadge");
      if (badge) {
        badge.textContent = `${this.audioVoices.length} Giọng Đọc`;
      }
      this.renderAudioVoices(this.selectedAudioLang);
    } catch (e) {
      console.warn("Chưa thể tải danh sách giọng đọc CapCut:", e);
    }
  }

  renderAudioVoices(lang = "vi-VN", query = "") {
    const select = document.getElementById("audioVoiceSelect");
    if (!select) return;

    const filtered = audioTtsService.filterVoices(lang, query);
    select.innerHTML = "";

    if (filtered.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Không tìm thấy giọng đọc phù hợp";
      select.appendChild(opt);
      return;
    }

    filtered.forEach((v, idx) => {
      const opt = document.createElement("option");
      opt.value = v.voice_type;
      opt.setAttribute("data-resource", v.resource_id || "");
      opt.textContent = `${v.display_name || v.voice_type} (${v.lang || v.lan || "vi"})`;
      if (v.voice_type === this.selectedAudioVoice || (idx === 0 && !this.selectedAudioVoice)) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    select.onchange = (e) => {
      this.selectedAudioVoice = e.target.value;
    };
  }

  onAudioTextChanged() {
    const text = document.getElementById("audioTextInput")?.value || "";
    const statsEl = document.getElementById("audioTextStats");
    const estimateEl = document.getElementById("audioChunkEstimate");

    const units = translatorService.countUnits(text);
    const chars = text.length;
    if (statsEl) {
      statsEl.textContent = `${units.toLocaleString()} từ • ${chars.toLocaleString()} ký tự`;
    }

    const chunks = audioTtsService.splitTextChunks(text, 250);
    const estSeconds = Math.max(1, Math.ceil(chunks.length * 0.4));
    if (estimateEl) {
      estimateEl.textContent = `${chunks.length} đoạn chunk (~${estSeconds}s hoàn thành)`;
    }
  }

  cleanAudioTextInput() {
    const input = document.getElementById("audioTextInput");
    if (!input || !input.value.trim()) {
      this.app.showToast("Chưa có văn bản để làm sạch!", "warning");
      return;
    }
    const cleaned = normalizeTextForAudio(input.value);
    input.value = cleaned;
    this.onAudioTextChanged();
    this.app.showToast("Đã làm sạch số và định dạng chuẩn Audio! ✨", "success");
  }

  async startAudioGeneration() {
    const text = document.getElementById("audioTextInput")?.value?.trim();
    if (!text) {
      this.app.showToast("Vui lòng nhập hoặc dán văn bản cần tạo audio!", "warning");
      return;
    }

    const select = document.getElementById("audioVoiceSelect");
    const selectedOpt = select ? select.options[select.selectedIndex] : null;
    const voice = selectedOpt ? selectedOpt.value : "BV074_streaming";
    const resource_id = selectedOpt ? selectedOpt.getAttribute("data-resource") : null;
    const rate = parseFloat(document.getElementById("audioRateSlider")?.value) || 1.0;
    const threads = parseInt(document.getElementById("audioThreadsSlider")?.value, 10) || 30;

    this.setAudioUiState(true);

    const progressBox = document.getElementById("audioProgressBox");
    const progressMsg = document.getElementById("audioProgressMsg");
    const progressPct = document.getElementById("audioProgressPct");
    const progressBar = document.getElementById("audioProgressBar");
    const statusBadge = document.getElementById("audioStatusBadge");
    const playerTitle = document.getElementById("audioPlayerTitle");
    const playerSubtitle = document.getElementById("audioPlayerSubtitle");
    const mainAudio = document.getElementById("mainAudioElement");

    if (progressBox) progressBox.style.display = "block";
    if (statusBadge) {
      statusBadge.textContent = "Đang Tạo...";
      statusBadge.className = "badge badge-pink";
    }

    const onProgress = (p) => {
      if (progressMsg) progressMsg.textContent = p.message;
      if (progressPct) progressPct.textContent = `${p.progress}%`;
      if (progressBar) progressBar.style.width = `${p.progress}%`;
    };

    try {
      const result = await audioTtsService.generateAudioAsync({
        text,
        voice,
        resource_id,
        rate,
        threads
      }, onProgress);

      this.currentAudioBlob = result.audioBlob;

      if (mainAudio) {
        mainAudio.src = result.audioUrl;
        mainAudio.play().catch(() => {});
      }

      if (playerTitle) {
        playerTitle.textContent = selectedOpt ? selectedOpt.textContent : "Audio Đã Tạo";
      }
      if (playerSubtitle) {
        playerSubtitle.textContent = `Thời lượng: ${result.duration || 0}s • ${result.totalChunks} đoạn ghép nối`;
      }
      if (statusBadge) {
        statusBadge.textContent = "Hoàn Thành";
        statusBadge.className = "badge badge-emerald";
      }

      const btnDownload = document.getElementById("btnDownloadMp3");
      const btnSaveLib = document.getElementById("btnSaveAudioToLib");
      if (btnDownload) btnDownload.disabled = false;
      if (btnSaveLib) btnSaveLib.disabled = false;

      this.app.showToast("🎉 Tạo file Audio thành công!", "success");

    } catch (err) {
      console.error("Audio generation error:", err);
      this.app.showToast(`Lỗi tạo Audio: ${err.message}`, "error");
      if (statusBadge) {
        statusBadge.textContent = "Thất Bại";
        statusBadge.className = "badge badge-rose";
      }
    } finally {
      this.setAudioUiState(false);
    }
  }

  setAudioUiState(isGenerating) {
    const btnStart = document.getElementById("btnStartGenerateAudio");
    const btnCancel = document.getElementById("btnCancelGenerateAudio");
    const progressBox = document.getElementById("audioProgressBox");

    if (isGenerating) {
      if (btnStart) btnStart.style.display = "none";
      if (btnCancel) btnCancel.style.display = "inline-flex";
      if (progressBox) progressBox.style.display = "block";
    } else {
      if (btnStart) btnStart.style.display = "inline-flex";
      if (btnCancel) btnCancel.style.display = "none";
    }
  }

  cancelAudioGeneration() {
    if (confirm("Bạn có chắc muốn hủy tiến trình tạo audio không?")) {
      audioTtsService.cancel();
      this.setAudioUiState(false);
      this.app.showToast("Đã hủy tạo audio.", "warning");
    }
  }

  downloadGeneratedMp3() {
    if (!this.currentAudioBlob && !audioTtsService.currentAudioUrl) {
      this.app.showToast("Chưa có file audio để tải về!", "warning");
      return;
    }
    const url = audioTtsService.currentAudioUrl;
    const a = document.createElement("a");
    a.href = url;
    a.download = `audio_truyen_${Date.now()}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    this.app.showToast("Đang tải file MP3 về máy...", "success");
  }

  saveGeneratedAudioToLibrary() {
    const input = document.getElementById("audioTextInput");
    const text = input ? input.value : "";
    if (!text) return;
    this.app.showToast("Bản ghi âm đã sẵn sàng trong phiên làm việc hiện tại!", "info");
  }

  // ==================== EVENT BINDINGS ====================

  bindEvents() {
    const audioLangChips = document.querySelectorAll("#audioLangChips .btn-style-chip");
    audioLangChips.forEach(chip => {
      chip.addEventListener("click", () => {
        const lang = chip.getAttribute("data-lang") || "vi-VN";
        this.selectedAudioLang = lang;
        audioLangChips.forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        this.renderAudioVoices(lang, document.getElementById("audioVoiceSearch")?.value || "");
      });
    });

    const audioVoiceSearch = document.getElementById("audioVoiceSearch");
    if (audioVoiceSearch) {
      audioVoiceSearch.addEventListener("input", (e) => {
        this.renderAudioVoices(this.selectedAudioLang, e.target.value);
      });
    }

    const audioRateSlider = document.getElementById("audioRateSlider");
    const audioRateVal = document.getElementById("audioRateVal");
    if (audioRateSlider && audioRateVal) {
      audioRateSlider.addEventListener("input", (e) => {
        audioRateVal.textContent = `${parseFloat(e.target.value).toFixed(1)}x`;
      });
    }

    const audioThreadsSlider = document.getElementById("audioThreadsSlider");
    const audioThreadsVal = document.getElementById("audioThreadsVal");
    if (audioThreadsSlider && audioThreadsVal) {
      audioThreadsSlider.addEventListener("input", (e) => {
        audioThreadsVal.textContent = `${e.target.value} luồng`;
      });
    }

    const audioTextInput = document.getElementById("audioTextInput");
    if (audioTextInput) {
      audioTextInput.addEventListener("input", () => this.onAudioTextChanged());
    }

    const btnAudioClean = document.getElementById("btnAudioCleanText");
    if (btnAudioClean) {
      btnAudioClean.addEventListener("click", () => this.cleanAudioTextInput());
    }

    const btnAudioPaste = document.getElementById("btnAudioPaste");
    if (btnAudioPaste) {
      btnAudioPaste.addEventListener("click", async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            if (audioTextInput) audioTextInput.value = text;
            this.onAudioTextChanged();
            this.app.showToast("Đã dán văn bản từ clipboard!", "info");
          }
        } catch {
          this.app.showToast("Không thể đọc clipboard tự động, vui lòng dùng Ctrl+V.", "warning");
        }
      });
    }

    const btnAudioClear = document.getElementById("btnAudioClear");
    if (btnAudioClear) {
      btnAudioClear.addEventListener("click", () => {
        if (audioTextInput) audioTextInput.value = "";
        this.onAudioTextChanged();
      });
    }

    const btnStartAudio = document.getElementById("btnStartGenerateAudio");
    if (btnStartAudio) {
      btnStartAudio.addEventListener("click", () => this.startAudioGeneration());
    }

    const btnCancelAudio = document.getElementById("btnCancelGenerateAudio");
    if (btnCancelAudio) {
      btnCancelAudio.addEventListener("click", () => this.cancelAudioGeneration());
    }

    const btnResetDev = document.getElementById("btnAudioResetDevice");
    if (btnResetDev) {
      btnResetDev.addEventListener("click", async () => {
        try {
          btnResetDev.disabled = true;
          btnResetDev.innerHTML = `<span>⏳ Đang đổi...</span>`;
          const res = await audioTtsService.resetDeviceId();
          this.app.showToast(`Đã đổi Device ID thành công: ${res.device_id || "OK"}`, "success");
        } catch (err) {
          this.app.showToast(`Không thể đổi Device ID: ${err.message}`, "error");
        } finally {
          btnResetDev.disabled = false;
          btnResetDev.innerHTML = `🔄 Đổi ID (Gỡ Ban)`;
        }
      });
    }

    const btnSkipBack = document.getElementById("btnAudioSkipBack");
    const btnSkipFwd = document.getElementById("btnAudioSkipFwd");
    const mainAudio = document.getElementById("mainAudioElement");

    if (btnSkipBack && mainAudio) {
      btnSkipBack.addEventListener("click", () => {
        mainAudio.currentTime = Math.max(0, mainAudio.currentTime - 5);
      });
    }
    if (btnSkipFwd && mainAudio) {
      btnSkipFwd.addEventListener("click", () => {
        mainAudio.currentTime = Math.min(mainAudio.duration || 0, mainAudio.currentTime + 5);
      });
    }

    const audioPlaybackRate = document.getElementById("audioPlaybackRate");
    if (audioPlaybackRate && mainAudio) {
      audioPlaybackRate.addEventListener("change", (e) => {
        mainAudio.playbackRate = parseFloat(e.target.value) || 1.0;
      });
    }

    const btnDownloadMp3 = document.getElementById("btnDownloadMp3");
    if (btnDownloadMp3) {
      btnDownloadMp3.addEventListener("click", () => this.downloadGeneratedMp3());
    }

    const btnSaveAudioLib = document.getElementById("btnSaveAudioToLib");
    if (btnSaveAudioLib) {
      btnSaveAudioLib.addEventListener("click", () => this.saveGeneratedAudioToLibrary());
    }
  }
}
