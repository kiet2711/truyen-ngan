/**
 * AI Novel Studio - Core Application Logic (Phim Ngắn / Zhihu Style)
 * Quản lý chọn Trope Tag, AI sinh 3 Concept, Checkpoint 1 & 2, Trình đọc và Xuất bản
 */

import { TROPE_CATEGORIES, ALL_TROPES, getRandomTropes, getRandomSamplePremise } from "./data/tagPools.js";
import { normalizeTextForAudio } from "./data/numberToWordsVi.js";
import { geminiService } from "./services/geminiService.js";
import { storageService } from "./services/storageService.js";

class NovelStudioApp {
  constructor() {
    this.currentStep = 1;
    this.selectedTags = new Set(["Zhihu style", "Vả mặt cực mạnh", "Plot twist bất ngờ", "Báo thù"]);
    this.generatedConcepts = [];
    this.selectedConcept = null;
    this.currentStory = null;
    this.isWriting = false;
    this.isPaused = false;
    this.isAudioCleaned = false;

    this.init();
  }

  async init() {
    this.bindEvents();
    this.updateApiKeyStatus();
    this.updateSavedCount();
    this.renderTropeCloud();
  }

  // ==================== UI HELPERS & NOTIFICATIONS ====================

  showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  countWords(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  updateApiKeyStatus() {
    const keys = storageService.getApiKeys();
    const badge = document.getElementById("apiKeyStatusBadge");
    const text = document.getElementById("keyStatusText");

    if (keys.length > 0) {
      badge.className = "badge badge-emerald";
      text.textContent = `${keys.length} API Key sẵn sàng`;
    } else {
      badge.className = "badge badge-purple";
      text.textContent = "Chưa có API Key";
    }
  }

  async updateSavedCount() {
    const stories = await storageService.getAllStories();
    const el = document.getElementById("savedStoryCount");
    if (el) el.textContent = stories.length;
  }

  // ==================== STEP NAVIGATION ====================

  goToStep(stepNumber) {
    this.currentStep = stepNumber;

    for (let i = 1; i <= 4; i++) {
      const pill = document.getElementById(`stepPill${i}`);
      const view = document.getElementById(`step${i}View`);

      if (pill) {
        pill.classList.remove("active", "completed");
        if (i === stepNumber) pill.classList.add("active");
        else if (i < stepNumber) pill.classList.add("completed");
      }

      if (view) {
        view.style.display = i === stepNumber ? "block" : "none";
      }
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ==================== STEP 1: TROPE TAG CLOUD ====================

  renderTropeCloud() {
    const container = document.getElementById("tropeCloudContainer");
    container.innerHTML = "";

    TROPE_CATEGORIES.forEach(cat => {
      const block = document.createElement("div");
      block.className = "trope-category-block";

      const title = document.createElement("div");
      title.className = "trope-category-title";
      title.textContent = cat.category;
      block.appendChild(title);

      const list = document.createElement("div");
      list.className = "trope-tag-list";

      cat.tags.forEach(tag => {
        const pill = document.createElement("div");
        const isActive = this.selectedTags.has(tag.name);
        pill.className = `trope-tag-pill ${isActive ? 'active' : ''}`;
        pill.textContent = tag.name;

        pill.addEventListener("click", () => {
          if (this.selectedTags.has(tag.name)) {
            if (this.selectedTags.size > 1) {
              this.selectedTags.delete(tag.name);
              pill.classList.remove("active");
            } else {
              this.showToast("Cần giữ lại ít nhất 1 thẻ trope!", "warning");
            }
          } else {
            this.selectedTags.add(tag.name);
            pill.classList.add("active");
          }
        });

        list.appendChild(pill);
      });

      block.appendChild(list);
      container.appendChild(block);
    });
  }

  applyRandomTropes() {
    const randomTags = getRandomTropes(4);
    this.selectedTags = new Set(randomTags);
    this.renderTropeCloud();
    this.showToast(`Đã chọn ngẫu nhiên: ${randomTags.join(", ")}`, "info");
  }

  // ==================== STEP 1.5: GENERATE 3 CONCEPTS ====================

  async generateConcepts() {
    const keys = storageService.getApiKeys();
    if (keys.length === 0) {
      this.openApiSettingsModal();
      this.showToast("Vui lòng nhập ít nhất một Gemini API Key để tiếp tục!", "warning");
      return;
    }

    const btn = document.getElementById("btnGenerateConcepts");
    const originText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="typing-cursor"></span> AI đang sáng tạo 3 bản bối cảnh & motif...`;

    try {
      const chapterCount = parseInt(document.getElementById("chapterCountSelect").value, 10) || 6;
      const targetWords = parseInt(document.getElementById("wordsPerChapterSelect").value, 10) || 2000;
      const userPremise = document.getElementById("userPremiseInput").value.trim();

      const params = {
        selectedTags: Array.from(this.selectedTags),
        userPremise,
        chapterCount,
        targetWordsPerChapter: targetWords
      };

      const res = await geminiService.generateStoryConcepts(params, (msg) => {
        btn.innerHTML = `<span class="typing-cursor"></span> ${msg}`;
      });

      this.generatedConcepts = res.concepts || [];
      if (this.generatedConcepts.length === 0) {
        throw new Error("Không nhận được bản đề xuất nào từ AI.");
      }

      this.selectedConcept = this.generatedConcepts[0]; // Mặc định chọn bản 1
      this.renderConceptsGrid();

      const conceptsSection = document.getElementById("conceptsSection");
      conceptsSection.style.display = "block";
      conceptsSection.scrollIntoView({ behavior: "smooth", block: "start" });
      this.showToast("Đã tạo xong 3 bản đề xuất! Hãy chọn bản bạn ưng ý nhất.", "success");

    } catch (err) {
      console.error(err);
      this.showToast(`Lỗi tạo bản đề xuất: ${err.message}`, "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = originText;
    }
  }

  renderConceptsGrid() {
    const grid = document.getElementById("conceptsGrid");
    grid.innerHTML = "";

    this.generatedConcepts.forEach((concept, idx) => {
      const card = document.createElement("div");
      const isSelected = this.selectedConcept?.id === concept.id;
      card.className = `concept-card ${isSelected ? 'selected' : ''}`;

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span class="concept-number-badge">BẢN ĐỀ XUẤT 0${idx + 1}</span>
          <span style="font-size: 11px; color: var(--accent-pink);">Phim ngắn kịch tính</span>
        </div>
        <div class="concept-title">${concept.title}</div>
        <div class="concept-hook">"${concept.hook}"</div>
        <div class="concept-detail-item"><strong>🏛️ Bối cảnh & Nhân vật:</strong> ${concept.settingAndCharacters}</div>
        <div class="concept-detail-item"><strong>⚡ Motif & Xung đột:</strong> ${concept.motifAndConflict}</div>
        <div class="concept-detail-item"><strong>📖 Tóm tắt cốt truyện:</strong> ${concept.plotSummary}</div>
        <div class="concept-detail-item" style="color: #f472b6;"><strong>💥 Cú Twist vả mặt:</strong> ${concept.climaxTwist}</div>
        <div class="btn-select-concept">${isSelected ? '✓ Đang Chọn Bản Này' : 'Bấm Để Chọn Bản Này'}</div>
      `;

      card.addEventListener("click", () => {
        this.selectedConcept = concept;
        document.querySelectorAll(".concept-card").forEach(c => {
          c.classList.remove("selected");
          c.querySelector(".btn-select-concept").textContent = "Bấm Để Chọn Bản Này";
        });
        card.classList.add("selected");
        card.querySelector(".btn-select-concept").textContent = "✓ Đang Chọn Bản Này";
      });

      grid.appendChild(card);
    });
  }

  // ==================== STEP 2: CHECKPOINT 1 OUTLINE ====================

  async createOutlineFromSelectedConcept() {
    if (!this.selectedConcept) {
      this.showToast("Vui lòng chọn 1 bản đề xuất trước khi tiếp tục!", "warning");
      return;
    }

    const btn = document.getElementById("btnConfirmConceptAndGoToOutline");
    const originText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="typing-cursor"></span> Đang sinh Dàn Ý & Hồ Sơ Nhân Vật chi tiết...`;

    try {
      const chapterCount = parseInt(document.getElementById("chapterCountSelect").value, 10) || 6;
      const targetWords = parseInt(document.getElementById("wordsPerChapterSelect").value, 10) || 2000;
      const userPremise = document.getElementById("userPremiseInput").value.trim();

      const params = {
        chosenConcept: this.selectedConcept,
        selectedTags: Array.from(this.selectedTags),
        userPremise,
        chapterCount,
        targetWordsPerChapter: targetWords
      };

      const outlineData = await geminiService.generateOutlineFromConcept(params, (msg) => {
        btn.innerHTML = `<span class="typing-cursor"></span> ${msg}`;
      });

      this.currentStory = {
        id: "story_" + Date.now(),
        title: outlineData.title || this.selectedConcept.title,
        logline: outlineData.logline || this.selectedConcept.hook,
        settingDescription: outlineData.settingDescription || this.selectedConcept.settingAndCharacters,
        params: params,
        characterBible: outlineData.characterBible || [],
        chapters: (outlineData.chapters || []).map((ch, idx) => ({
          index: ch.index || idx + 1,
          title: ch.title || `Chương ${idx + 1}`,
          summary: ch.summary || "",
          dramaticGoal: ch.dramaticGoal || "",
          appearingCharacters: ch.appearingCharacters || [],
          content: "",
          wordCount: 0,
          status: "pending"
        })),
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await storageService.saveStory(this.currentStory);
      await this.updateSavedCount();

      this.renderCheckpoint1();
      this.goToStep(2);
      this.showToast("Đã lập Dàn Ý & Bảng Nhân Vật Hán Việt thành công!", "success");

    } catch (err) {
      console.error(err);
      this.showToast(`Lỗi tạo dàn ý: ${err.message}`, "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = originText;
    }
  }

  renderCheckpoint1() {
    if (!this.currentStory) return;

    document.getElementById("storyTitleInput").value = this.currentStory.title;
    document.getElementById("storyLoglineInput").value = this.currentStory.logline;
    document.getElementById("storySettingDescInput").value = this.currentStory.settingDescription;

    // Character Bible
    const charContainer = document.getElementById("storyBibleContainer");
    charContainer.innerHTML = "";

    this.currentStory.characterBible.forEach((char, idx) => {
      const card = document.createElement("div");
      card.className = "character-card";
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <input type="text" class="character-name-input" value="${char.name || ''}" placeholder="Tên nhân vật Hán Việt" data-idx="${idx}" data-field="name">
          <button class="btn btn-danger btn-sm btn-del-char" data-idx="${idx}" style="padding: 2px 6px;">✕</button>
        </div>
        <div style="font-size: 12px; margin-bottom: 4px; color: var(--accent-pink);">
          Thân phận: <input type="text" value="${char.role || ''}" placeholder="Thân phận thật / ngụy trang" data-idx="${idx}" data-field="role">
        </div>
        <div style="font-size: 12px; margin-bottom: 4px; color: var(--text-muted);">
          Tính cách: <textarea rows="2" placeholder="Tính cách" data-idx="${idx}" data-field="personality">${char.personality || ''}</textarea>
        </div>
        <div style="font-size: 12px; color: var(--text-dim);">
          Đặc điểm: <textarea rows="2" placeholder="Ngoại hình/Đặc điểm" data-idx="${idx}" data-field="traits">${char.traits || ''}</textarea>
        </div>
      `;

      card.querySelectorAll("input, textarea").forEach(input => {
        input.addEventListener("input", (e) => {
          const i = parseInt(e.target.dataset.idx, 10);
          const field = e.target.dataset.field;
          this.currentStory.characterBible[i][field] = e.target.value;
        });
      });

      card.querySelector(".btn-del-char").addEventListener("click", () => {
        this.currentStory.characterBible.splice(idx, 1);
        this.renderCheckpoint1();
      });

      charContainer.appendChild(card);
    });

    // Chapters Outline
    const chapterList = document.getElementById("chapterOutlineList");
    chapterList.innerHTML = "";
    document.getElementById("totalChapterBadge").textContent = `${this.currentStory.chapters.length} Chương`;

    this.currentStory.chapters.forEach((ch, idx) => {
      const card = document.createElement("div");
      card.className = "chapter-item-card";
      card.innerHTML = `
        <div class="chapter-item-header">
          <span class="chapter-number-tag">CHƯƠNG ${ch.index}</span>
          <input type="text" class="chapter-title-input param-input" value="${ch.title}" data-idx="${idx}" data-field="title">
        </div>
        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-top: 8px;">
          <div>
            <label class="param-label" style="font-size: 11px;">📝 Diễn biến kịch bản:</label>
            <textarea class="param-textarea" rows="3" data-idx="${idx}" data-field="summary">${ch.summary}</textarea>
          </div>
          <div>
            <label class="param-label" style="font-size: 11px;">🎯 Nút thắt / Vả mặt:</label>
            <textarea class="param-textarea" rows="3" data-idx="${idx}" data-field="dramaticGoal">${ch.dramaticGoal}</textarea>
          </div>
        </div>
        <div style="margin-top: 8px;">
          <label class="param-label" style="font-size: 11px;">👥 Nhân vật xuất hiện:</label>
          <input type="text" class="param-input" value="${(ch.appearingCharacters || []).join(", ")}" data-idx="${idx}" data-field="appearingCharacters" placeholder="Phân cách bằng dấu phẩy">
        </div>
      `;

      card.querySelectorAll("input, textarea").forEach(input => {
        input.addEventListener("input", (e) => {
          const i = parseInt(e.target.dataset.idx, 10);
          const field = e.target.dataset.field;
          if (field === "appearingCharacters") {
            this.currentStory.chapters[i].appearingCharacters = e.target.value.split(",").map(s => s.trim()).filter(Boolean);
          } else {
            this.currentStory.chapters[i][field] = e.target.value;
          }
        });
      });

      chapterList.appendChild(card);
    });
  }

  // ==================== STEP 3: LIVE WRITING STUDIO ====================

  async startFullStoryWriting() {
    if (!this.currentStory) return;

    this.currentStory.title = document.getElementById("storyTitleInput").value.trim() || this.currentStory.title;
    this.currentStory.logline = document.getElementById("storyLoglineInput").value.trim();
    this.currentStory.settingDescription = document.getElementById("storySettingDescInput").value.trim();
    await storageService.saveStory(this.currentStory);

    this.goToStep(3);
    this.renderWritingMonitor();
    this.runWritingPipeline();
  }

  renderWritingMonitor() {
    if (!this.currentStory) return;

    const list = document.getElementById("chaptersMonitorList");
    list.innerHTML = "";

    this.currentStory.chapters.forEach((ch, idx) => {
      const row = document.createElement("div");
      row.className = `chapter-monitor-row ${ch.status === 'writing' ? 'active' : ''} ${ch.status === 'completed' ? 'completed' : ''}`;
      row.id = `chapterRow_${idx}`;

      let statusBadge = `<span class="badge badge-purple">Chờ viết</span>`;
      if (ch.status === "writing") statusBadge = `<span class="badge badge-cyan"><span class="typing-cursor"></span> Đang viết...</span>`;
      if (ch.status === "completed") statusBadge = `<span class="badge badge-emerald">✓ Hoàn thành (${ch.wordCount || 0} từ)</span>`;
      if (ch.status === "error") statusBadge = `<span class="badge btn-danger">Lỗi</span>`;

      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 14px;">
          <strong style="color: #ec4899; font-family: var(--font-heading); min-width: 80px;">Chương ${ch.index}</strong>
          <div>
            <div style="font-weight: 600; font-size: 14px;">${ch.title}</div>
            <div style="font-size: 11px; color: var(--text-muted);">${ch.summary.slice(0, 70)}...</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <div id="chapterStatusBadge_${idx}">${statusBadge}</div>
          <button class="btn btn-secondary btn-sm btn-regen-ch" data-idx="${idx}" title="Tạo lại chương này">🔄</button>
        </div>
      `;

      row.querySelector(".btn-regen-ch").addEventListener("click", () => {
        this.regenerateSingleChapter(idx);
      });

      list.appendChild(row);
    });

    this.updateStats();
  }

  updateStats() {
    if (!this.currentStory) return;

    let totalWords = 0;
    let completedCount = 0;

    this.currentStory.chapters.forEach(ch => {
      if (ch.content) {
        const words = this.countWords(ch.content);
        ch.wordCount = words;
        totalWords += words;
      }
      if (ch.status === "completed") completedCount++;
    });

    const totalChapters = this.currentStory.chapters.length;
    const percent = Math.round((completedCount / totalChapters) * 100);

    document.getElementById("totalWordsStat").textContent = totalWords.toLocaleString();
    document.getElementById("completedChaptersStat").textContent = `${completedCount} / ${totalChapters}`;
    document.getElementById("progressPercentStat").textContent = `${percent}%`;

    const btnGoToStep4 = document.getElementById("btnGoToStep4");
    if (completedCount === totalChapters) {
      btnGoToStep4.style.display = "inline-block";
      document.getElementById("writingStatusStat").textContent = "Hoàn tất trọn bộ!";
    }
  }

  async runWritingPipeline() {
    this.isWriting = true;
    this.isPaused = false;
    document.getElementById("btnPauseResumeWriting").textContent = "⏸️ Tạm Dừng";

    const settings = storageService.getSettings();
    const delayTime = settings.delayBetweenChapters || 3500;

    for (let i = 0; i < this.currentStory.chapters.length; i++) {
      const chapter = this.currentStory.chapters[i];

      if (chapter.status === "completed" && chapter.content) {
        continue;
      }

      if (this.isPaused) {
        document.getElementById("writingStatusStat").textContent = "Đang tạm dừng";
        return;
      }

      chapter.status = "writing";
      this.renderWritingMonitor();
      document.getElementById("writingStatusStat").textContent = `Đang viết Chương ${chapter.index}`;
      document.getElementById("activeChapterTitle").textContent = `Chương ${chapter.index}: ${chapter.title}`;
      
      const streamBox = document.getElementById("typingStreamContent");
      streamBox.innerHTML = `<span class="typing-cursor"></span>`;

      try {
        const generatedText = await geminiService.generateChapterStream({
          story: this.currentStory,
          chapterIndex: i,
          onChunk: (chunk, full) => {
            streamBox.textContent = full;
            document.getElementById("liveChapterWordCount").textContent = `${this.countWords(full)} từ`;
          },
          onStatus: (msg) => {
            document.getElementById("writingStatusStat").textContent = msg;
          }
        });

        chapter.content = generatedText;
        chapter.wordCount = this.countWords(generatedText);
        chapter.status = "completed";
        
        await storageService.saveStory(this.currentStory);
        this.renderWritingMonitor();

        if (i < this.currentStory.chapters.length - 1) {
          await this.showThrottleCountdown(delayTime);
        }

      } catch (err) {
        console.error(err);
        chapter.status = "error";
        this.renderWritingMonitor();
        this.showToast(`Lỗi khi sinh Chương ${chapter.index}: ${err.message}`, "error");
        document.getElementById("writingStatusStat").textContent = `Lỗi ở Chương ${chapter.index}`;
        this.isWriting = false;
        return;
      }
    }

    this.isWriting = false;
    this.updateStats();
    this.showToast("🎉 Chúc mừng! Đã hoàn thành toàn bộ tác phẩm!", "success");
  }

  async showThrottleCountdown(ms) {
    const indicator = document.getElementById("throttleIndicator");
    const countEl = document.getElementById("throttleCountdown");
    indicator.style.display = "inline-flex";

    let remainingSeconds = Math.ceil(ms / 1000);
    while (remainingSeconds > 0) {
      countEl.textContent = remainingSeconds;
      await new Promise(r => setTimeout(r, 1000));
      remainingSeconds--;
    }

    indicator.style.display = "none";
  }

  async regenerateSingleChapter(chapterIdx) {
    if (this.isWriting) {
      this.showToast("Vui lòng đợi quá trình viết hiện tại hoàn thành hoặc tạm dừng trước khi tạo lại!", "warning");
      return;
    }

    const chapter = this.currentStory.chapters[chapterIdx];
    chapter.status = "pending";
    chapter.content = "";
    chapter.wordCount = 0;
    this.renderWritingMonitor();

    this.runWritingPipeline();
  }

  // ==================== STEP 4: CHECKPOINT 2 READER & EXPORT ====================

  renderReaderMode() {
    if (!this.currentStory) return;

    this.isAudioCleaned = false;
    document.getElementById("btnRestoreOriginalText").style.display = "none";
    document.getElementById("btnCleanForAudio").style.display = "inline-flex";

    document.getElementById("readerStoryTitle").textContent = this.currentStory.title;
    document.getElementById("readerStoryLogline").textContent = this.currentStory.logline || "";

    const totalWords = this.currentStory.chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0);
    const readingMins = Math.round(totalWords / 250);
    document.getElementById("readerTotalWords").textContent = `${totalWords.toLocaleString()} từ`;
    document.getElementById("readerEstReadingTime").textContent = `~${readingMins} phút đọc`;

    this.renderReaderChaptersContent();
  }

  renderReaderChaptersContent() {
    const body = document.getElementById("readerBody");
    body.innerHTML = "";

    this.currentStory.chapters.forEach(ch => {
      const chBlock = document.createElement("div");
      chBlock.className = "reader-chapter-block";

      let textToRender = ch.content || "(Chương này chưa có nội dung)";
      if (this.isAudioCleaned) {
        textToRender = normalizeTextForAudio(textToRender);
      }

      const paragraphs = textToRender.split("\n\n").filter(Boolean);
      const paragraphsHtml = paragraphs.map(p => `<p class="reader-paragraph">${p}</p>`).join("");

      chBlock.innerHTML = `
        <h2 class="reader-chapter-title">Chương ${ch.index}: ${ch.title}</h2>
        <div class="reader-chapter-paragraphs">${paragraphsHtml}</div>
      `;

      body.appendChild(chBlock);
    });
  }

  cleanTextForTTS() {
    this.isAudioCleaned = true;
    this.renderReaderChaptersContent();
    document.getElementById("btnCleanForAudio").style.display = "none";
    document.getElementById("btnRestoreOriginalText").style.display = "inline-flex";
    this.showToast("Đã chuẩn hóa toàn bộ số, ký hiệu và làm sạch markdown sẵn sàng cho TTS!", "success");
  }

  restoreOriginalText() {
    this.isAudioCleaned = false;
    this.renderReaderChaptersContent();
    document.getElementById("btnCleanForAudio").style.display = "inline-flex";
    document.getElementById("btnRestoreOriginalText").style.display = "none";
    this.showToast("Đã trả về văn bản gốc.", "info");
  }

  downloadFile(filename, content, type = "text/plain;charset=utf-8") {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.showToast(`Đã tải về file: ${filename}`, "success");
  }

  getCleanAudioTxt() {
    if (!this.currentStory) return "";
    let out = `${this.currentStory.title.toUpperCase()}\n\n`;
    this.currentStory.chapters.forEach(ch => {
      out += `CHƯƠNG ${ch.index}. ${ch.title.toUpperCase()}.\n\n`;
      out += normalizeTextForAudio(ch.content || "") + "\n\n";
    });
    return out.trim();
  }

  getFullMarkdown() {
    if (!this.currentStory) return "";
    let out = `# ${this.currentStory.title}\n\n`;
    out += `> **Trope:** ${(this.currentStory.params?.selectedTags || []).join(", ")}\n`;
    out += `> **Bối cảnh:** ${this.currentStory.settingDescription || ""}\n`;
    out += `> **Tóm tắt kịch tính:** ${this.currentStory.logline || ""}\n\n`;

    out += `## BẢNG NHÂN VẬT (STORY BIBLE)\n\n`;
    (this.currentStory.characterBible || []).forEach(c => {
      out += `- **${c.name}** (${c.role}): ${c.personality} - *${c.traits}*\n`;
    });
    out += "\n---\n\n";

    this.currentStory.chapters.forEach(ch => {
      out += `## Chương ${ch.index}: ${ch.title}\n\n`;
      out += `${ch.content || ""}\n\n`;
    });
    return out.trim();
  }

  // ==================== EVENT BINDINGS ====================

  bindEvents() {
    // Header buttons
    document.getElementById("btnOpenApiSettings").addEventListener("click", () => this.openApiSettingsModal());
    document.getElementById("apiKeyStatusBadge").addEventListener("click", () => this.openApiSettingsModal());
    document.getElementById("btnCloseApiSettings").addEventListener("click", () => this.closeApiSettingsModal());
    document.getElementById("btnSaveApiSettings").addEventListener("click", () => this.saveApiSettings());
    document.getElementById("btnTestApiKey").addEventListener("click", () => this.testApiKeyConnection());

    document.getElementById("btnOpenLibrary").addEventListener("click", () => this.openStoryLibraryModal());
    document.getElementById("btnCloseStoryLibrary").addEventListener("click", () => this.closeStoryLibraryModal());
    document.getElementById("librarySearchInput").addEventListener("input", (e) => this.filterLibraryStories(e.target.value));

    document.getElementById("btnNewStory").addEventListener("click", () => {
      if (confirm("Bạn có muốn bắt đầu tạo một bộ truyện mới không?")) {
        this.currentStory = null;
        this.selectedConcept = null;
        document.getElementById("conceptsSection").style.display = "none";
        document.getElementById("userPremiseInput").value = "";
        this.goToStep(1);
      }
    });

    // Step 1 Events
    document.getElementById("btnRandomTropes").addEventListener("click", () => this.applyRandomTropes());
    document.getElementById("btnSamplePremise").addEventListener("click", () => {
      const sample = getRandomSamplePremise();
      document.getElementById("userPremiseInput").value = sample;
      this.showToast("Đã điền mẫu ý tưởng mở đầu!", "info");
    });
    document.getElementById("btnGenerateConcepts").addEventListener("click", () => this.generateConcepts());
    document.getElementById("btnRerollConcepts").addEventListener("click", () => this.generateConcepts());
    document.getElementById("btnConfirmConceptAndGoToOutline").addEventListener("click", () => this.createOutlineFromSelectedConcept());

    // Step 2 Events
    document.getElementById("btnBackToStep1").addEventListener("click", () => this.goToStep(1));
    document.getElementById("btnRegenerateOutline").addEventListener("click", () => this.createOutlineFromSelectedConcept());
    document.getElementById("btnAddCharacter").addEventListener("click", () => {
      this.currentStory.characterBible.push({ name: "Cố Tử Ninh", role: "Đồng minh", personality: "Thấu hiểu, quyết đoán", traits: "Trang phục thanh lịch" });
      this.renderCheckpoint1();
    });
    document.getElementById("btnStartWriting").addEventListener("click", () => this.startFullStoryWriting());

    // Step 3 Events
    document.getElementById("btnPauseResumeWriting").addEventListener("click", () => {
      if (this.isPaused) {
        this.isPaused = false;
        document.getElementById("btnPauseResumeWriting").textContent = "⏸️ Tạm Dừng";
        this.runWritingPipeline();
      } else {
        this.isPaused = true;
        document.getElementById("btnPauseResumeWriting").textContent = "▶️ Tiếp Tục Viết";
      }
    });

    document.getElementById("btnGoToStep4").addEventListener("click", () => {
      this.renderReaderMode();
      this.goToStep(4);
    });

    // Step 4 Events
    document.getElementById("btnCleanForAudio").addEventListener("click", () => this.cleanTextForTTS());
    document.getElementById("btnRestoreOriginalText").addEventListener("click", () => this.restoreOriginalText());

    // Theme toggles
    document.getElementById("btnThemeDark").addEventListener("click", (e) => this.setReaderTheme("dark", e.target));
    document.getElementById("btnThemeSepia").addEventListener("click", (e) => this.setReaderTheme("sepia", e.target));
    document.getElementById("btnThemeLight").addEventListener("click", (e) => this.setReaderTheme("light", e.target));

    // Font size
    const fontSizeSlider = document.getElementById("readerFontSizeRange");
    fontSizeSlider.addEventListener("input", (e) => {
      const size = e.target.value;
      document.getElementById("fontSizeDisplay").textContent = `${size}px`;
      document.documentElement.style.setProperty("--reader-size", `${size}px`);
    });

    // Download buttons
    document.getElementById("btnDownloadAudioTxt").addEventListener("click", () => {
      const safeTitle = (this.currentStory?.title || "truyen_phim_ngan").replace(/[^a-zA-Z0-9_-]/g, "_");
      this.downloadFile(`${safeTitle}_audio_clean.txt`, this.getCleanAudioTxt());
    });

    document.getElementById("btnDownloadFullMarkdown").addEventListener("click", () => {
      const safeTitle = (this.currentStory?.title || "truyen_phim_ngan").replace(/[^a-zA-Z0-9_-]/g, "_");
      this.downloadFile(`${safeTitle}_full.md`, this.getFullMarkdown());
    });

    document.getElementById("btnDownloadProjectJson").addEventListener("click", () => {
      const safeTitle = (this.currentStory?.title || "truyen_phim_ngan").replace(/[^a-zA-Z0-9_-]/g, "_");
      this.downloadFile(`${safeTitle}_project.json`, JSON.stringify(this.currentStory, null, 2), "application/json");
    });

    document.getElementById("btnCopyCleanText").addEventListener("click", () => {
      const text = this.getCleanAudioTxt();
      navigator.clipboard.writeText(text).then(() => {
        this.showToast("Đã sao chép toàn bộ văn bản chuẩn Audio vào Clipboard!", "success");
      });
    });

    // Step Indicator Click
    for (let i = 1; i <= 4; i++) {
      document.getElementById(`stepPill${i}`)?.addEventListener("click", () => {
        if (i === 1) this.goToStep(1);
        if (i === 2 && this.currentStory) this.goToStep(2);
        if (i === 3 && this.currentStory) this.goToStep(3);
        if (i === 4 && this.currentStory) {
          this.renderReaderMode();
          this.goToStep(4);
        }
      });
    }
  }

  setReaderTheme(theme, activeBtn) {
    const container = document.getElementById("readerContainer");
    container.className = `reader-container reader-theme-${theme}`;
    document.querySelectorAll(".reader-toolbar .btn-group .btn").forEach(b => b.classList.remove("active"));
    activeBtn.classList.add("active");
  }

  // ==================== MODAL API SETTINGS ====================

  openApiSettingsModal() {
    const keys = storageService.getApiKeys();
    const settings = storageService.getSettings();

    document.getElementById("apiKeysInput").value = keys.join("\n");
    document.getElementById("modelSelect").value = settings.model || "gemini-2.5-flash";
    document.getElementById("throttleDelayInput").value = settings.delayBetweenChapters || 3500;
    document.getElementById("chapterTempInput").value = settings.temperatureChapter || 0.8;
    document.getElementById("apiTestResult").textContent = "";

    document.getElementById("apiSettingsModal").classList.add("open");
  }

  closeApiSettingsModal() {
    document.getElementById("apiSettingsModal").classList.remove("open");
  }

  saveApiSettings() {
    const rawKeys = document.getElementById("apiKeysInput").value;
    const keys = rawKeys.split("\n").map(k => k.trim()).filter(Boolean);
    storageService.saveApiKeys(keys);

    const settings = {
      model: document.getElementById("modelSelect").value,
      delayBetweenChapters: parseInt(document.getElementById("throttleDelayInput").value, 10) || 3500,
      temperatureChapter: parseFloat(document.getElementById("chapterTempInput").value) || 0.8
    };
    storageService.saveSettings(settings);

    this.updateApiKeyStatus();
    this.closeApiSettingsModal();
    this.showToast("Đã lưu cấu hình API thành công!", "success");
  }

  async testApiKeyConnection() {
    const rawKeys = document.getElementById("apiKeysInput").value;
    const keys = rawKeys.split("\n").map(k => k.trim()).filter(Boolean);
    const resEl = document.getElementById("apiTestResult");

    if (keys.length === 0) {
      resEl.innerHTML = `<span style="color: var(--accent-rose);">Vui lòng nhập API Key trước khi test!</span>`;
      return;
    }

    resEl.innerHTML = `<span style="color: var(--accent-pink);"><span class="typing-cursor"></span> Đang kiểm tra kết nối với Gemini...</span>`;

    try {
      const model = document.getElementById("modelSelect").value;
      const resp = await geminiService.testApiKey(keys[0], model);
      resEl.innerHTML = `<span style="color: var(--accent-emerald);">✓ Kết nối thành công! AI phản hồi: "${resp}"</span>`;
    } catch (err) {
      resEl.innerHTML = `<span style="color: var(--accent-rose);">✕ Lỗi kết nối: ${err.message}</span>`;
    }
  }

  // ==================== MODAL STORY LIBRARY ====================

  async openStoryLibraryModal() {
    const stories = await storageService.getAllStories();
    this.renderLibraryList(stories);
    document.getElementById("storyLibraryModal").classList.add("open");
  }

  closeStoryLibraryModal() {
    document.getElementById("storyLibraryModal").classList.remove("open");
  }

  async filterLibraryStories(query) {
    const stories = await storageService.getAllStories();
    const q = query.toLowerCase().trim();
    const filtered = stories.filter(s => 
      (s.title || "").toLowerCase().includes(q) ||
      (s.params?.selectedTags || []).some(t => t.toLowerCase().includes(q))
    );
    this.renderLibraryList(filtered);
  }

  renderLibraryList(stories) {
    const container = document.getElementById("libraryListContainer");
    container.innerHTML = "";

    if (stories.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 24px;">Chưa có truyện nào trong thư viện.</div>`;
      return;
    }

    stories.forEach(story => {
      const card = document.createElement("div");
      card.className = "studio-card";
      card.style.padding = "16px";
      card.style.marginBottom = "8px";

      const totalWords = story.chapters?.reduce((sum, c) => sum + (c.wordCount || 0), 0) || 0;
      const completedCount = story.chapters?.filter(c => c.status === "completed").length || 0;
      const totalChapters = story.chapters?.length || 0;

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <div style="font-size: 16px; font-weight: 700; color: #fff;">${story.title}</div>
            <div style="font-size: 12px; color: var(--accent-pink); margin-top: 2px;">
              ${(story.params?.selectedTags || []).slice(0, 3).join(", ")} • ${completedCount}/${totalChapters} chương hoàn thành (${totalWords.toLocaleString()} từ)
            </div>
            <div style="font-size: 11px; color: var(--text-dim); margin-top: 4px;">
              Cập nhật: ${new Date(story.updatedAt).toLocaleString("vi-VN")}
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-primary btn-sm btn-load-story">Mở Xem</button>
            <button class="btn btn-danger btn-sm btn-del-story">Xóa</button>
          </div>
        </div>
      `;

      card.querySelector(".btn-load-story").addEventListener("click", () => {
        this.currentStory = story;
        this.closeStoryLibraryModal();
        this.renderReaderMode();
        this.goToStep(4);
        this.showToast(`Đã mở truyện: ${story.title}`, "info");
      });

      card.querySelector(".btn-del-story").addEventListener("click", async () => {
        if (confirm(`Bạn có chắc chắn muốn xóa "${story.title}" không?`)) {
          await storageService.deleteStory(story.id);
          await this.updateSavedCount();
          this.openStoryLibraryModal();
          this.showToast("Đã xóa truyện khỏi thư viện.", "info");
        }
      });

      container.appendChild(card);
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.novelStudio = new NovelStudioApp();
});
