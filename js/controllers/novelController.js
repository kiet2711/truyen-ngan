/**
 * Novel Controller - Quản lý toàn bộ giao diện và quy trình 4 Bước Sáng Tác Tiểu Thuyết
 * Step 1: Trope & Premise
 * Step 2: Checkpoint 1 (Dàn ý chi tiết)
 * Step 3: Checkpoint 2 (Viết chương hàng loạt & đa luồng)
 * Step 4: Đọc truyện, Làm sạch Audio & Xuất bản (TXT, MD, HTML, DOCX, EPUB)
 */

import { STORY_TONES, TROPE_CATEGORIES, ALL_TROPES, getRandomTropes, getRandomSamplePremise } from "../data/tagPools.js";
import { normalizeTextForAudio } from "../data/numberToWordsVi.js";
import { geminiService } from "../services/geminiService.js";
import { storageService } from "../services/storageService.js";
import { authService } from "../services/authService.js";

export class NovelController {
  constructor(app) {
    this.app = app;
    this.currentStep = 1;
    this.customTags = storageService.getCustomTags();
    this.selectedTone = "dramatic";
    this.selectedTags = new Set(["Zhihu style", "Vả mặt cực mạnh", "Plot twist bất ngờ", "Báo thù"]);
    this.generatedConcepts = [];
    this.selectedConcept = null;
    this.currentStory = null;
    this.isWriting = false;
    this.isPaused = false;
    this.isAudioCleaned = false;
    this.audioRemoveTitles = true;
    this.audioSingleParagraph = false;
  }

  init() {
    this.bindEvents();
    this.renderToneSelector();
    this.renderTropeCloud();
  }

  // ==================== STEP 1: STORY TONE SELECTOR ====================

  renderToneSelector() {
    const container = document.getElementById("toneGridContainer");
    const badge = document.getElementById("selectedToneBadge");
    if (!container) return;
    container.innerHTML = "";

    STORY_TONES.forEach(tone => {
      const card = document.createElement("div");
      const isActive = this.selectedTone === tone.id;
      card.className = `tone-card ${isActive ? 'active' : ''}`;
      card.id = `toneCard_${tone.id}`;

      card.innerHTML = `
        <div class="tone-card-header">
          <div class="tone-card-icon-title">
            <span class="tone-card-icon">${tone.icon}</span>
            <span class="tone-card-title">${tone.name}</span>
          </div>
          <span class="tone-card-badge">${tone.badge}</span>
        </div>
        <div class="tone-card-desc">${tone.desc}</div>
      `;

      card.addEventListener("click", () => {
        this.selectedTone = tone.id;
        document.querySelectorAll(".tone-card").forEach(c => c.classList.remove("active"));
        card.classList.add("active");
        if (badge) {
          badge.textContent = `${tone.icon} ${tone.name}`;
        }
      });

      container.appendChild(card);
    });

    // Update badge initially
    const currentObj = STORY_TONES.find(t => t.id === this.selectedTone) || STORY_TONES[0];
    if (badge && currentObj) {
      badge.textContent = `${currentObj.icon} ${currentObj.name}`;
    }
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
    if (!container) return;
    container.innerHTML = "";

    // 1. Render Predefined Categories
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
              this.app.showToast("Cần giữ lại ít nhất 1 thẻ trope!", "warning");
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

    // 2. Render User Custom Tags Block
    const customBlock = document.createElement("div");
    customBlock.className = "trope-category-block custom-tropes-section";

    const customTitle = document.createElement("div");
    customTitle.className = "trope-category-title";
    customTitle.innerHTML = `<span>⭐ Thẻ Tùy Chỉnh Của Bạn</span> <span style="font-size: 11px; font-weight: normal; color: var(--text-dim);">(${this.customTags.length} thẻ)</span>`;
    customBlock.appendChild(customTitle);

    const customList = document.createElement("div");
    customList.className = "trope-tag-list";

    this.customTags.forEach(tagName => {
      const pill = document.createElement("div");
      const isActive = this.selectedTags.has(tagName);
      pill.className = `trope-tag-pill custom-tag ${isActive ? 'active' : ''}`;

      const textSpan = document.createElement("span");
      textSpan.textContent = tagName;
      pill.appendChild(textSpan);

      const removeBtn = document.createElement("span");
      removeBtn.className = "tag-remove-btn";
      removeBtn.innerHTML = "&times;";
      removeBtn.title = `Xóa thẻ "${tagName}"`;
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.removeCustomTag(tagName);
      });
      pill.appendChild(removeBtn);

      pill.addEventListener("click", () => {
        if (this.selectedTags.has(tagName)) {
          if (this.selectedTags.size > 1) {
            this.selectedTags.delete(tagName);
            pill.classList.remove("active");
          } else {
            this.app.showToast("Cần giữ lại ít nhất 1 thẻ trope!", "warning");
          }
        } else {
          this.selectedTags.add(tagName);
          pill.classList.add("active");
        }
      });

      customList.appendChild(pill);
    });

    // Quick add pill button
    const addPill = document.createElement("div");
    addPill.className = "trope-tag-pill add-tag-pill";
    addPill.innerHTML = `<span>➕ Nhập Thẻ Mới...</span>`;
    addPill.title = "Bấm để mở khung tự nhập thẻ trope tùy chỉnh";
    addPill.addEventListener("click", () => {
      this.toggleCustomTagPanel(true);
    });
    customList.appendChild(addPill);

    customBlock.appendChild(customList);
    container.appendChild(customBlock);
  }

  toggleCustomTagPanel(show) {
    const panel = document.getElementById("customTagInputPanel");
    const input = document.getElementById("customTagInput");
    if (!panel) return;

    const isCurrentlyVisible = panel.style.display !== "none";
    const shouldShow = show !== undefined ? show : !isCurrentlyVisible;

    if (shouldShow) {
      panel.style.display = "block";
      if (input) {
        input.focus();
        input.select();
      }
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
      panel.style.display = "none";
      if (input) input.value = "";
    }
  }

  async addCustomTag(rawInput) {
    if (!rawInput || !rawInput.trim()) {
      this.app.showToast("Vui lòng nhập tên thẻ trope!", "warning");
      return;
    }

    const rawTags = rawInput
      .split(/[,;\n]+/)
      .map(t => t.trim())
      .filter(t => t.length > 0);

    if (rawTags.length === 0) {
      this.app.showToast("Vui lòng nhập tên thẻ hợp lệ!", "warning");
      return;
    }

    let addedCount = 0;
    rawTags.forEach(tag => {
      if (!this.customTags.includes(tag)) {
        this.customTags.push(tag);
        addedCount++;
      }
      this.selectedTags.add(tag);
    });

    storageService.saveCustomTags(this.customTags);
    if (authService.isLoggedIn()) {
      await authService.saveUserTags(this.customTags);
    }
    this.renderTropeCloud();

    const input = document.getElementById("customTagInput");
    if (input) input.value = "";

    if (addedCount > 0) {
      this.app.showToast(`Đã thêm ${addedCount} thẻ mới và tự động kích hoạt!`, "success");
    } else {
      this.app.showToast(`Các thẻ đã được kích hoạt!`, "info");
    }
  }

  async removeCustomTag(tagName) {
    this.customTags = this.customTags.filter(t => t !== tagName);
    this.selectedTags.delete(tagName);
    storageService.saveCustomTags(this.customTags);
    if (authService.isLoggedIn()) {
      await authService.deleteUserTag(tagName);
    }
    this.renderTropeCloud();
    this.app.showToast(`Đã xóa thẻ: "${tagName}"`, "info");
  }

  applyRandomTropes() {
    const randomTags = getRandomTropes(4);
    this.selectedTags = new Set(randomTags);
    this.renderTropeCloud();
    this.app.showToast(`Đã chọn ngẫu nhiên: ${randomTags.join(", ")}`, "info");
  }

  // ==================== STEP 1: GENERATE CONCEPTS ====================

  async generateStoryConcepts() {
    if (storageService.getApiKeys().length === 0) {
      this.app.showToast("Vui lòng cài đặt Gemini API Key trước khi bắt đầu!", "warning");
      this.app.openApiSettingsModal();
      return;
    }

    const userPremise = document.getElementById("userPremiseInput")?.value || "";
    const chapterCount = parseInt(document.getElementById("chapterCountSelect")?.value, 10) || 6;
    const wordsPerChapter = parseInt(document.getElementById("wordsPerChapterSelect")?.value, 10) || 2000;
    const targetWords = chapterCount * wordsPerChapter;
    const toneObj = STORY_TONES.find(t => t.id === this.selectedTone) || STORY_TONES[0];

    const params = {
      selectedTone: this.selectedTone,
      selectedTags: Array.from(this.selectedTags),
      userPremise,
      chapterCount,
      wordsPerChapter,
      targetWords
    };

    const btn = document.getElementById("btnGenerateConcepts");
    const container = document.getElementById("conceptsGrid");
    const section = document.getElementById("conceptsSection") || document.getElementById("conceptsResultSection");

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="typing-cursor"></span> AI đang tạo 3 kịch bản (${toneObj.name})...`;
    }
    if (section) section.style.display = "block";
    if (container) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--accent-pink);">
          <div style="font-size: 28px; margin-bottom: 12px; animation: spin 2s linear infinite;">🪄</div>
          <div style="font-weight: 600; font-size: 15px;">Đang kiến tạo 3 bản đề xuất theo phong cách ${toneObj.name}...</div>
          <div style="font-size: 12px; color: var(--text-dim); margin-top: 6px;">Áp dụng ${params.selectedTags.length} thẻ trope được chọn</div>
        </div>
      `;
    }

    try {
      const res = await geminiService.generateStoryConcepts(params);
      if (Array.isArray(res)) {
        this.generatedConcepts = res;
      } else if (res && Array.isArray(res.concepts)) {
        this.generatedConcepts = res.concepts;
      } else if (res && Array.isArray(res.data)) {
        this.generatedConcepts = res.data;
      } else if (res && typeof res === "object") {
        const arr = Object.values(res).find(v => Array.isArray(v));
        this.generatedConcepts = arr || [res];
      } else {
        this.generatedConcepts = [];
      }

      if (this.generatedConcepts.length === 0) {
        throw new Error("AI không trả về danh sách kịch bản hợp lệ. Vui lòng thử lại!");
      }

      this.selectedConcept = this.generatedConcepts[0] || null;
      this.renderConceptCards(params);
      if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
      this.app.showToast("Đã tạo thành công 3 bản phác thảo cốt truyện!", "success");
    } catch (error) {
      console.error("Lỗi tạo concepts:", error);
      this.app.showToast(`Lỗi: ${error.message}`, "error");
      if (container) {
        container.innerHTML = `
          <div style="grid-column: 1/-1; padding: 24px; background: rgba(239, 68, 68, 0.1); border: 1px solid var(--accent-rose); border-radius: 8px; color: var(--accent-rose);">
            <strong>✕ Không thể tạo cốt truyện:</strong> ${error.message}
            <div style="margin-top: 12px;">
              <button class="btn btn-secondary btn-sm" id="btnRetryConceptsModal">Kiểm tra API Key</button>
            </div>
          </div>
        `;
        document.getElementById("btnRetryConceptsModal")?.addEventListener("click", () => {
          this.app.openApiSettingsModal();
        });
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `⚡ AI Tạo 3 Bản Đề Xuất Cốt Truyện (Bối Cảnh & Motif)`;
      }
    }
  }

  renderConceptCards(params) {
    const container = document.getElementById("conceptsGrid");
    if (!container) return;
    container.innerHTML = "";

    if (!Array.isArray(this.generatedConcepts) || this.generatedConcepts.length === 0) {
      container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 20px;">Không có bản phác thảo nào được tạo. Vui lòng thử lại.</div>`;
      return;
    }

    this.generatedConcepts.forEach((concept, index) => {
      const isSelected = this.selectedConcept?.id === (concept.id || index + 1) || (index === 0 && !this.selectedConcept);
      if (isSelected && !this.selectedConcept) {
        this.selectedConcept = concept;
      }

      const card = document.createElement("div");
      card.className = `concept-card ${isSelected ? 'selected' : ''}`;
      card.id = `conceptCard_${concept.id || index + 1}`;

      const title = concept.title || `Bản Đề Xuất #${index + 1}`;
      const hook = concept.hook || "";
      const setting = concept.settingAndCharacters || concept.setting || "";
      const motif = concept.motifAndConflict || concept.conflict || "";
      const summary = concept.plotSummary || concept.premise || "";
      const twist = concept.climaxTwist || concept.twist || "";

      card.innerHTML = `
        <div class="concept-number-badge">Kịch Bản #${index + 1}</div>
        <div class="concept-title">${title}</div>
        ${hook ? `<div class="concept-hook">"${hook}"</div>` : ""}
        ${setting ? `<div class="concept-detail-item"><strong>🏞️ Bối cảnh & Nhân vật:</strong> ${setting}</div>` : ""}
        ${motif ? `<div class="concept-detail-item"><strong>⚔️ Motif xung đột:</strong> ${motif}</div>` : ""}
        ${summary ? `<div class="concept-detail-item"><strong>📖 Tóm tắt diễn biến:</strong> ${summary}</div>` : ""}
        ${twist ? `<div class="concept-detail-item" style="color: #f472b6;"><strong>🎭 Cú twist vả mặt:</strong> ${twist}</div>` : ""}
        <button class="btn ${isSelected ? 'btn-success' : 'btn-secondary'} btn-select-concept" style="width: 100%; margin-top: 12px;">
          ${isSelected ? '✓ Đang Chọn Bản Này' : '👉 Chọn Bản Này'}
        </button>
      `;

      card.addEventListener("click", () => {
        this.selectConcept(concept, params);
      });

      card.querySelector(".btn-select-concept")?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.selectConcept(concept, params);
      });

      container.appendChild(card);
    });

    // Bind Confirm button & Reroll button
    const btnConfirm = document.getElementById("btnConfirmConceptAndGoToOutline");
    if (btnConfirm) {
      btnConfirm.onclick = () => {
        if (!this.selectedConcept && this.generatedConcepts.length > 0) {
          this.selectedConcept = this.generatedConcepts[0];
        }
        if (this.selectedConcept) {
          this.goToOutlineStep(params);
        } else {
          this.app.showToast("Vui lòng chọn 1 bản kịch bản đề xuất!", "warning");
        }
      };
    }

    const btnReroll = document.getElementById("btnRerollConcepts");
    if (btnReroll) {
      btnReroll.onclick = () => {
        this.generateStoryConcepts();
      };
    }
  }

  selectConcept(concept, params) {
    this.selectedConcept = concept;
    document.querySelectorAll(".concepts-grid .concept-card").forEach(c => {
      c.classList.remove("selected");
      const btn = c.querySelector(".btn-select-concept");
      if (btn) {
        btn.className = "btn btn-secondary btn-select-concept";
        btn.textContent = "👉 Chọn Bản Này";
      }
    });

    const cardId = `conceptCard_${concept.id || 1}`;
    const selectedCard = document.getElementById(cardId) || document.querySelector(`.concept-card:nth-child(${concept.id || 1})`);
    if (selectedCard) {
      selectedCard.classList.add("selected");
      const btn = selectedCard.querySelector(".btn-select-concept");
      if (btn) {
        btn.className = "btn btn-success btn-select-concept";
        btn.textContent = "✓ Đang Chọn Bản Này";
      }
    }
  }

  goToOutlineStep(params) {
    if (!this.selectedConcept) return;
    const concept = this.selectedConcept;
    const chapterCount = params?.chapterCount || parseInt(document.getElementById("chapterCountSelect")?.value, 10) || 6;
    const wordsPerChapter = params?.wordsPerChapter || parseInt(document.getElementById("wordsPerChapterSelect")?.value, 10) || 2000;
    const targetWords = chapterCount * wordsPerChapter;

    this.currentStory = {
      id: `story_${Date.now()}`,
      title: concept.title,
      concept: concept,
      params: { ...(params || {}), selectedTone: this.selectedTone, chapterCount, wordsPerChapter, targetWords },
      outline: null,
      characterBible: [],
      chapters: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.app.saveCurrentStory();
    this.setupStep2View();
    this.goToStep(2);
    this.app.showToast(`Đã chọn: "${concept.title}"`, "success");

    // Auto-generate outline
    this.generateDetailedOutline();
  }

  // ==================== STEP 2: DETAILED OUTLINE ====================

  setupStep2View() {
    if (!this.currentStory) return;
    const story = this.currentStory;

    const titleInput = document.getElementById("storyTitleInput");
    const loglineInput = document.getElementById("storyLoglineInput");
    const settingInput = document.getElementById("storySettingDescInput");
    const totalBadge = document.getElementById("totalChapterBadge");

    if (titleInput) titleInput.value = story.title || "";
    if (loglineInput) loglineInput.value = story.logline || story.concept?.hook || story.concept?.premise || "";
    if (settingInput) settingInput.value = story.settingDescription || story.concept?.settingAndCharacters || story.concept?.setting || "";
    if (totalBadge) totalBadge.textContent = `${story.params?.chapterCount || 6} Chương`;

    // Listeners for inputs
    if (titleInput) {
      titleInput.oninput = (e) => {
        if (this.currentStory) this.currentStory.title = e.target.value;
      };
    }
    if (loglineInput) {
      loglineInput.oninput = (e) => {
        if (this.currentStory) this.currentStory.logline = e.target.value;
      };
    }
    if (settingInput) {
      settingInput.oninput = (e) => {
        if (this.currentStory) this.currentStory.settingDescription = e.target.value;
      };
    }

    const btnBack = document.getElementById("btnBackToStep1");
    if (btnBack) {
      btnBack.onclick = () => this.goToStep(1);
    }

    const btnRegen = document.getElementById("btnRegenerateOutline");
    if (btnRegen) {
      btnRegen.onclick = () => this.generateDetailedOutline();
    }

    const btnAddChar = document.getElementById("btnAddCharacter");
    if (btnAddChar) {
      btnAddChar.onclick = () => this.addCharacterToBible();
    }

    const btnStart = document.getElementById("btnStartWriting");
    if (btnStart) {
      btnStart.onclick = () => {
        this.syncOutlineInputs();
        this.setupStep3View();
        this.goToStep(3);
        this.startWritingStory();
      };
    }

    if (story.outline) {
      this.renderOutlineView();
    }
  }

  async generateDetailedOutline() {
    if (!this.currentStory) return;

    const btnRegen = document.getElementById("btnRegenerateOutline");
    const bibleContainer = document.getElementById("storyBibleContainer");
    const outlineContainer = document.getElementById("chapterOutlineList");

    if (btnRegen) {
      btnRegen.disabled = true;
      btnRegen.innerHTML = `<span class="typing-cursor"></span> Đang lập dàn ý...`;
    }

    if (bibleContainer) {
      bibleContainer.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--accent-pink); padding: 20px;"><div style="font-size: 24px; animation: spin 2s linear infinite;">🪄</div>Đang tạo bảng nhân vật chuẩn Hán Việt...</div>`;
    }
    if (outlineContainer) {
      outlineContainer.innerHTML = `<div style="text-align: center; color: var(--accent-pink); padding: 30px;"><div style="font-size: 24px; animation: spin 2s linear infinite;">🪄</div>Đang thiết lập dàn ý chi tiết từng chương chuẩn phim ngắn...</div>`;
    }

    try {
      const outline = await geminiService.generateDetailedOutline(this.currentStory.concept, this.currentStory.params);
      this.currentStory.outline = outline;
      this.currentStory.title = outline.title || this.currentStory.title;
      this.currentStory.logline = outline.logline || this.currentStory.concept?.hook || "";
      this.currentStory.settingDescription = outline.settingDescription || this.currentStory.concept?.settingAndCharacters || "";
      this.currentStory.characterBible = outline.characterBible || outline.characters || [];

      const chaptersData = outline.chapters || [];
      this.currentStory.chapters = chaptersData.map((ch, idx) => ({
        chapterNumber: ch.index || ch.chapterNumber || idx + 1,
        title: ch.title || `Chương ${idx + 1}`,
        summary: ch.summary || "",
        dramaticGoal: ch.dramaticGoal || ch.conflict || "",
        hook: ch.hook || "",
        cliffhanger: ch.cliffhanger || "",
        appearingCharacters: ch.appearingCharacters || [],
        outlineInfo: ch,
        content: "",
        wordCount: 0,
        status: "pending"
      }));

      await this.app.saveCurrentStory();
      this.renderOutlineView();
      this.app.showToast("Đã hoàn thành Checkpoint 1: Dàn ý chi tiết & Bảng nhân vật!", "success");
    } catch (error) {
      console.error("Lỗi tạo dàn ý:", error);
      this.app.showToast(`Lỗi tạo dàn ý: ${error.message}`, "error");
      if (outlineContainer) {
        outlineContainer.innerHTML = `
          <div style="padding: 16px; background: rgba(239, 68, 68, 0.1); border: 1px solid var(--accent-rose); border-radius: 8px; color: var(--accent-rose);">
            ✕ Không thể lập dàn ý: ${error.message}
          </div>
        `;
      }
    } finally {
      if (btnRegen) {
        btnRegen.disabled = false;
        btnRegen.innerHTML = `🔄 Đổi Dàn Ý Khác`;
      }
    }
  }

  renderOutlineView() {
    if (!this.currentStory) return;
    const story = this.currentStory;

    const titleInput = document.getElementById("storyTitleInput");
    const loglineInput = document.getElementById("storyLoglineInput");
    const settingInput = document.getElementById("storySettingDescInput");
    const totalBadge = document.getElementById("totalChapterBadge");

    if (titleInput && story.title) titleInput.value = story.title;
    if (loglineInput && story.logline) loglineInput.value = story.logline;
    if (settingInput && story.settingDescription) settingInput.value = story.settingDescription;
    if (totalBadge) totalBadge.textContent = `${story.chapters?.length || 6} Chương`;

    this.renderStoryBible();
    this.renderChapterOutlineList();
  }

  renderStoryBible() {
    const container = document.getElementById("storyBibleContainer");
    if (!container || !this.currentStory) return;
    container.innerHTML = "";

    const characters = this.currentStory.characterBible || [];
    characters.forEach((char, idx) => {
      const card = document.createElement("div");
      card.className = "character-card";
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <input type="text" class="character-name-input" value="${char.name || ''}" placeholder="Tên nhân vật Hán Việt...">
          <button class="btn btn-danger btn-xs btn-delete-char" data-idx="${idx}" title="Xóa nhân vật">&times;</button>
        </div>
        <div style="margin-bottom: 6px;">
          <input type="text" class="param-input char-role-input" value="${char.role || ''}" placeholder="Vai trò / Thân phận..." style="font-size: 12px; padding: 4px 8px;">
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 6px;">
          <input type="text" class="param-input char-desire-input" value="${char.desire || ''}" placeholder="🎯 Dục vọng cốt lõi..." style="font-size: 11px; padding: 4px 8px;" title="Điều nhân vật khao khát đạt được nhất">
          <input type="text" class="param-input char-traits-input" value="${char.traits || ''}" placeholder="🔍 Nhận diện / Vật chứng..." style="font-size: 11px; padding: 4px 8px;" title="Đặc điểm nhận diện, vết sẹo, thói quen hoặc vật chứng mang theo">
        </div>
        <div>
          <textarea class="param-textarea char-personality-input" rows="2" placeholder="Tính cách, khẩu khí, đặc điểm..." style="font-size: 12px; padding: 4px 8px;">${char.personality || ''}</textarea>
        </div>
      `;

      card.querySelector(".btn-delete-char")?.addEventListener("click", () => {
        this.currentStory.characterBible.splice(idx, 1);
        this.renderStoryBible();
      });

      card.querySelector(".character-name-input")?.addEventListener("input", (e) => {
        char.name = e.target.value;
      });
      card.querySelector(".char-role-input")?.addEventListener("input", (e) => {
        char.role = e.target.value;
      });
      card.querySelector(".char-desire-input")?.addEventListener("input", (e) => {
        char.desire = e.target.value;
      });
      card.querySelector(".char-traits-input")?.addEventListener("input", (e) => {
        char.traits = e.target.value;
      });
      card.querySelector(".char-personality-input")?.addEventListener("input", (e) => {
        char.personality = e.target.value;
      });

      container.appendChild(card);
    });
  }

  addCharacterToBible() {
    if (!this.currentStory) return;
    if (!this.currentStory.characterBible) this.currentStory.characterBible = [];
    this.currentStory.characterBible.push({
      name: "Nhân Vật Mới",
      role: "Thân phận công khai & bí mật",
      desire: "Dục vọng cốt lõi",
      traits: "Vật chứng / Đặc điểm",
      personality: "Tính cách sắc bén, thông minh"
    });
    this.renderStoryBible();
  }

  renderChapterOutlineList() {
    const container = document.getElementById("chapterOutlineList");
    if (!container || !this.currentStory) return;
    container.innerHTML = "";

    const chapters = this.currentStory.chapters || [];
    chapters.forEach((ch, idx) => {
      const card = document.createElement("div");
      card.className = "chapter-item-card";
      card.innerHTML = `
        <div class="chapter-item-header">
          <span class="chapter-number-tag">Chương ${ch.chapterNumber}</span>
          <input type="text" class="param-input chapter-title-input" value="${ch.title || ''}" placeholder="Tên chương...">
          <button class="btn btn-danger btn-xs btn-delete-chapter" data-idx="${idx}" title="Xóa chương này">&times; Xóa</button>
        </div>
        <div style="margin-top: 8px;">
          <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 2px;">📖 Diễn biến chính:</label>
          <textarea class="param-textarea chapter-summary-input" rows="2" placeholder="Tóm tắt nội dung chương...">${ch.summary || ch.outlineInfo?.summary || ''}</textarea>
        </div>
        <div style="margin-top: 6px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div>
            <label style="font-size: 11px; color: var(--accent-cyan); display: block; margin-bottom: 2px;">🎯 Mục tiêu & Xung đột:</label>
            <input type="text" class="param-input chapter-goal-input" value="${ch.dramaticGoal || ch.outlineInfo?.dramaticGoal || ch.conflict || ''}" placeholder="Mục tiêu / Điểm nhấn...">
          </div>
          <div>
            <label style="font-size: 11px; color: var(--accent-pink); display: block; margin-bottom: 2px;">⚡ Móc câu kết chương (Cliffhanger):</label>
            <input type="text" class="param-input chapter-cliffhanger-input" value="${ch.cliffhanger || ch.outlineInfo?.cliffhanger || ''}" placeholder="Móc câu dẫn sang chương sau...">
          </div>
        </div>
      `;

      card.querySelector(".btn-delete-chapter")?.addEventListener("click", () => {
        if (this.currentStory.chapters.length <= 3) {
          this.app.showToast("Cần tối thiểu 3 chương!", "warning");
          return;
        }
        this.currentStory.chapters.splice(idx, 1);
        this.currentStory.chapters.forEach((c, i) => { c.chapterNumber = i + 1; });
        this.renderChapterOutlineList();
      });

      card.querySelector(".chapter-title-input")?.addEventListener("input", (e) => {
        ch.title = e.target.value;
      });
      card.querySelector(".chapter-summary-input")?.addEventListener("input", (e) => {
        ch.summary = e.target.value;
      });
      card.querySelector(".chapter-goal-input")?.addEventListener("input", (e) => {
        ch.dramaticGoal = e.target.value;
      });
      card.querySelector(".chapter-cliffhanger-input")?.addEventListener("input", (e) => {
        ch.cliffhanger = e.target.value;
      });

      container.appendChild(card);
    });
  }

  syncOutlineInputs() {
    if (!this.currentStory) return;
    const titleInput = document.getElementById("storyTitleInput");
    const loglineInput = document.getElementById("storyLoglineInput");
    const settingInput = document.getElementById("storySettingDescInput");

    if (titleInput && titleInput.value.trim()) this.currentStory.title = titleInput.value.trim();
    if (loglineInput && loglineInput.value.trim()) this.currentStory.logline = loglineInput.value.trim();
    if (settingInput && settingInput.value.trim()) this.currentStory.settingDescription = settingInput.value.trim();

    this.app.saveCurrentStory();
  }

  // ==================== STEP 3: LIVE WRITING MONITOR ====================

  setupStep3View() {
    if (!this.currentStory) return;
    this.renderStep3Monitors();

    const btnPause = document.getElementById("btnPauseResumeWriting") || document.getElementById("btnPauseWriting");
    if (btnPause) {
      btnPause.onclick = () => this.pauseWriting();
    }

    const btnGoToStep4 = document.getElementById("btnGoToStep4");
    if (btnGoToStep4) {
      btnGoToStep4.onclick = () => {
        this.setupStep4View();
        this.goToStep(4);
      };
    }
  }

  renderStep3Monitors() {
    const container = document.getElementById("chaptersMonitorList") || document.getElementById("chapterGenerationList");
    if (!container || !this.currentStory) return;
    container.innerHTML = "";

    const chapters = this.currentStory.chapters || [];
    chapters.forEach((ch, idx) => {
      const isCompleted = ch.status === "completed";
      const isGenerating = ch.status === "generating";
      const isError = ch.status === "error";

      let statusBadge = `<span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-dim);">Chờ viết</span>`;
      if (isGenerating) {
        statusBadge = `<span class="badge badge-purple"><span class="typing-cursor"></span> Đang viết...</span>`;
      } else if (isCompleted) {
        statusBadge = `<span class="badge badge-emerald">✓ Xong (${(ch.wordCount || 0).toLocaleString()} từ)</span>`;
      } else if (isError) {
        statusBadge = `<span class="badge badge-rose">✕ Lỗi</span>`;
      }

      const row = document.createElement("div");
      row.className = `chapter-monitor-row ${isGenerating ? 'active' : ''} ${isCompleted ? 'completed' : ''}`;
      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-weight: 800; color: var(--accent-pink); font-size: 14px;">#${ch.chapterNumber}</span>
          <strong style="color: #fff; font-size: 14px;">${ch.title}</strong>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          ${statusBadge}
          ${isCompleted ? `<button class="btn btn-secondary btn-xs btn-regen-ch" data-idx="${idx}">🔄 Viết lại</button>` : ''}
        </div>
      `;

      row.querySelector(".btn-regen-ch")?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.regenerateSingleChapter(idx);
      });

      container.appendChild(row);
    });

    // Update stats
    const totalWords = chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0);
    const completedCount = chapters.filter(c => c.status === "completed").length;
    const percent = chapters.length > 0 ? Math.round((completedCount / chapters.length) * 100) : 0;

    const totalWordsEl = document.getElementById("totalWordsStat");
    const completedEl = document.getElementById("completedChaptersStat");
    const percentEl = document.getElementById("progressPercentStat");
    const statusEl = document.getElementById("writingStatusStat");
    const btnGoToStep4 = document.getElementById("btnGoToStep4");

    if (totalWordsEl) totalWordsEl.textContent = totalWords.toLocaleString();
    if (completedEl) completedEl.textContent = `${completedCount} / ${chapters.length}`;
    if (percentEl) percentEl.textContent = `${percent}%`;
    if (statusEl) statusEl.textContent = this.isWriting ? "AI đang viết..." : (completedCount === chapters.length && chapters.length > 0 ? "Hoàn tất" : "Sẵn sàng");
    if (btnGoToStep4) {
      btnGoToStep4.style.display = completedCount === chapters.length && chapters.length > 0 ? "inline-flex" : "none";
    }
  }

  async startWritingStory() {
    if (!this.currentStory || this.isWriting) return;

    this.isWriting = true;
    this.isPaused = false;

    this.goToStep(3);
    this.setupStep3View();

    const btnPause = document.getElementById("btnPauseResumeWriting") || document.getElementById("btnPauseWriting");
    if (btnPause) {
      btnPause.textContent = "⏸️ Tạm Dừng";
    }

    const throttleIndicator = document.getElementById("throttleIndicator");
    const throttleCountdown = document.getElementById("throttleCountdown");
    const activeChapterTitle = document.getElementById("activeChapterTitle");
    const liveChapterWordCount = document.getElementById("liveChapterWordCount");
    const typingStreamContent = document.getElementById("typingStreamContent");

    const settings = storageService.getSettings();
    const delayMs = settings.delayBetweenChapters || 3500;
    const chapters = this.currentStory.chapters || [];

    for (let i = 0; i < chapters.length; i++) {
      if (!this.isWriting) break;

      while (this.isPaused && this.isWriting) {
        await new Promise(r => setTimeout(r, 500));
      }

      const chapter = chapters[i];
      if (chapter.status === "completed") continue;

      chapter.status = "generating";
      if (activeChapterTitle) activeChapterTitle.textContent = `Chương ${chapter.chapterNumber}: ${chapter.title}`;
      if (typingStreamContent) typingStreamContent.textContent = "";
      if (liveChapterWordCount) liveChapterWordCount.textContent = "0 từ";

      this.renderStep3Monitors();

      try {
        const generatedContent = await geminiService.generateChapterContent(
          this.currentStory,
          chapter.chapterNumber,
          (streamChunk, fullText) => {
            if (typingStreamContent) {
              typingStreamContent.textContent = fullText;
              typingStreamContent.scrollTop = typingStreamContent.scrollHeight;
            }
            if (liveChapterWordCount) {
              liveChapterWordCount.textContent = `${this.app.countWords(fullText)} từ`;
            }
          }
        );

        chapter.content = generatedContent;
        chapter.wordCount = this.app.countWords(generatedContent);
        chapter.status = "completed";

        await this.app.saveCurrentStory();
        this.renderStep3Monitors();

        if (i < chapters.length - 1 && this.isWriting) {
          const waitSec = Math.round(delayMs / 1000);
          if (throttleIndicator) throttleIndicator.style.display = "inline-flex";
          for (let sec = waitSec; sec > 0; sec--) {
            if (!this.isWriting) break;
            if (throttleCountdown) throttleCountdown.textContent = `${sec}`;
            await new Promise(r => setTimeout(r, 1000));
          }
          if (throttleIndicator) throttleIndicator.style.display = "none";
        }

      } catch (err) {
        console.error(`Lỗi khi viết chương ${chapter.chapterNumber}:`, err);
        chapter.status = "error";
        this.renderStep3Monitors();
        this.app.showToast(`Lỗi viết chương ${chapter.chapterNumber}: ${err.message}`, "error");
        break;
      }
    }

    this.isWriting = false;
    this.renderStep3Monitors();

    const allDone = chapters.every(c => c.status === "completed");
    if (allDone) {
      this.app.showToast("🎉 Đã hoàn thành toàn bộ tác phẩm!", "success");
      setTimeout(() => {
        this.setupStep4View();
        this.goToStep(4);
      }, 1200);
    }
  }

  pauseWriting() {
    this.isPaused = !this.isPaused;
    const btn = document.getElementById("btnPauseResumeWriting") || document.getElementById("btnPauseWriting");
    if (btn) {
      btn.textContent = this.isPaused ? "▶️ Tiếp Tục" : "⏸️ Tạm Dừng";
    }
    this.app.showToast(this.isPaused ? "Đã tạm dừng tiến trình viết." : "Đang tiếp tục viết...", "info");
  }

  stopWriting() {
    this.isWriting = false;
    this.isPaused = false;
    const btnStart = document.getElementById("btnStartWriting");
    const btnPause = document.getElementById("btnPauseResumeWriting") || document.getElementById("btnPauseWriting");
    const btnStop = document.getElementById("btnStopWriting");

    if (btnStart) btnStart.style.display = "inline-flex";
    if (btnPause) btnPause.style.display = "none";
    if (btnStop) btnStop.style.display = "none";
    this.app.showToast("Đã dừng tiến trình viết truyện.", "warning");
    this.renderStep3Monitors();
  }

  async regenerateSingleChapter(idx) {
    const chapter = this.currentStory.chapters[idx];
    if (!chapter || this.isWriting) return;

    chapter.status = "generating";
    chapter.content = "";
    this.renderStep3Monitors();

    const typingStreamContent = document.getElementById("typingStreamContent");
    const activeChapterTitle = document.getElementById("activeChapterTitle");
    const liveChapterWordCount = document.getElementById("liveChapterWordCount");

    if (activeChapterTitle) activeChapterTitle.textContent = `Chương ${chapter.chapterNumber}: ${chapter.title}`;
    if (typingStreamContent) typingStreamContent.textContent = "";

    try {
      const generated = await geminiService.generateChapterContent(
        this.currentStory,
        chapter.chapterNumber,
        (chunk, fullText) => {
          if (typingStreamContent) {
            typingStreamContent.textContent = fullText;
            typingStreamContent.scrollTop = typingStreamContent.scrollHeight;
          }
          if (liveChapterWordCount) {
            liveChapterWordCount.textContent = `${this.app.countWords(fullText)} từ`;
          }
        }
      );

      chapter.content = generated;
      chapter.wordCount = this.app.countWords(generated);
      chapter.status = "completed";

      await this.app.saveCurrentStory();
      this.renderStep3Monitors();
      this.app.showToast(`Đã viết lại xong Chương ${chapter.chapterNumber}! ✨`, "success");
    } catch (e) {
      chapter.status = "error";
      this.renderStep3Monitors();
      this.app.showToast(`Lỗi: ${e.message}`, "error");
    }
  }

  // ==================== STEP 4: READER & EXPORT ====================

  setupStep4View() {
    this.renderReaderMode();
  }

  stripLeadingChapterTitle(text) {
    if (!text) return "";
    return text.replace(/^\s*(?:#+\s*)?(?:Chương|Hồi|Tập|Chapter|Phần)\s*\d+[^:\n]*[:.-]?[^\n]*\n+/i, "").trim();
  }

  renderReaderMode() {
    if (!this.currentStory) return;
    const story = this.currentStory;

    const totalWords = story.chapters?.reduce((sum, c) => sum + (c.wordCount || 0), 0) || 0;
    const titleEl = document.getElementById("readerStoryTitle");
    const loglineEl = document.getElementById("readerStoryLogline");
    const totalWordsEl = document.getElementById("readerTotalWords");
    const estTimeEl = document.getElementById("readerEstReadingTime");
    const chapterSelect = document.getElementById("readerChapterSelect");
    const bodyEl = document.getElementById("readerBody");

    if (titleEl) titleEl.textContent = story.title;
    if (loglineEl) loglineEl.textContent = story.concept?.premise || "";
    if (totalWordsEl) totalWordsEl.textContent = `${totalWords.toLocaleString()} từ`;
    if (estTimeEl) {
      const mins = Math.max(1, Math.round(totalWords / 250));
      estTimeEl.textContent = `~${mins} phút đọc / nghe`;
    }

    if (chapterSelect) {
      chapterSelect.innerHTML = `<option value="">-- Chọn chương --</option>` +
        (story.chapters || []).map(c => `<option value="chapter_read_${c.chapterNumber}">Chương ${c.chapterNumber}: ${c.title}</option>`).join("");
    }

    if (bodyEl) {
      if (this.isAudioCleaned) {
        const cleanAudioContent = this.buildCleanAudioText();
        bodyEl.innerHTML = `
          <div class="audio-mode-banner">
            <div class="audio-mode-banner-content">
              <span class="audio-banner-icon">✨</span>
              <div>
                <strong>Chế độ Xem Bản Dịch Âm / Audio TTS đã kích hoạt:</strong>
                <div style="font-size: 12px; color: var(--text-dim);">Toàn bộ số đã được chuyển thành chữ tiếng Việt, loại bỏ markdown và tiêu đề chương để sẵn sàng phát âm.</div>
              </div>
            </div>
            <div class="audio-banner-tags">
              <span class="audio-tag">${this.audioRemoveTitles ? '✓ Đã ẩn tiêu đề chương' : '✕ Giữ tiêu đề'}</span>
              <span class="audio-tag">${this.audioSingleParagraph ? '✓ Gộp 1 đoạn liền mạch' : '✕ Đoạn văn rời'}</span>
            </div>
          </div>
          <div style="font-size: 15.5px; line-height: 1.9; white-space: pre-wrap; color: var(--text-main); font-family: var(--font-reader-serif);">
            ${cleanAudioContent}
          </div>
        `;
      } else {
        // Chế độ bản gốc - cập nhật trực tiếp theo checkbox của người dùng
        if (this.audioSingleParagraph) {
          let mergedText = (story.chapters || []).map(ch => {
            const titleLine = this.audioRemoveTitles ? "" : `Chương ${ch.chapterNumber}: ${ch.title}. `;
            let rawContent = ch.content || "";
            if (this.audioRemoveTitles) {
              rawContent = this.stripLeadingChapterTitle(rawContent);
            }
            return titleLine + rawContent;
          }).join(" ");
          mergedText = mergedText.replace(/\n+/g, " ");

          bodyEl.innerHTML = `
            <div style="font-size: 15px; line-height: 1.9; color: var(--text-main); font-family: var(--font-reader-serif); white-space: pre-wrap;">
              ${mergedText}
            </div>
          `;
        } else {
          bodyEl.innerHTML = (story.chapters || []).map(ch => {
            const headerHtml = this.audioRemoveTitles ? '' : `
              <h2 style="font-size: 18px; font-weight: 800; color: var(--accent-pink); margin-bottom: 16px;">
                Chương ${ch.chapterNumber}: ${ch.title}
              </h2>
            `;
            let rawContent = ch.content || "";
            if (this.audioRemoveTitles) {
              rawContent = this.stripLeadingChapterTitle(rawContent);
            }

            const blockStyle = this.audioRemoveTitles 
              ? "margin-bottom: 24px; padding-bottom: 18px; border-bottom: 1px dashed rgba(255,255,255,0.08);"
              : "margin-bottom: 36px; padding-bottom: 28px; border-bottom: 1px dashed rgba(255,255,255,0.12);";

            return `
              <div class="reader-chapter-block" id="chapter_read_${ch.chapterNumber}" style="${blockStyle}">
                ${headerHtml}
                <div style="font-size: 15px; line-height: 1.85; color: var(--text-main); white-space: pre-wrap;">${rawContent || '<em style="color: var(--text-dim);">(Chương này chưa có nội dung)</em>'}</div>
              </div>
            `;
          }).join("");
        }
      }
    }
  }

  buildCleanAudioText() {
    if (!this.currentStory || !this.currentStory.chapters) return "";
    let fullText = this.currentStory.chapters.map(ch => {
      const titleLine = this.audioRemoveTitles ? "" : `Chương ${ch.chapterNumber}: ${ch.title}\n\n`;
      let rawContent = ch.content || "";
      if (this.audioRemoveTitles) {
        rawContent = this.stripLeadingChapterTitle(rawContent);
      }
      const cleaned = normalizeTextForAudio(rawContent);
      return titleLine + cleaned;
    }).join("\n\n---\n\n");

    if (this.audioSingleParagraph) {
      fullText = fullText.replace(/\n+/g, " ").replace(/\s*---\s*/g, " ");
    }
    return fullText;
  }

  buildOriginalNovelText() {
    if (!this.currentStory || !this.currentStory.chapters) return "";
    if (this.audioSingleParagraph) {
      let merged = this.currentStory.chapters.map(c => {
        const titleLine = this.audioRemoveTitles ? "" : `=== CHƯƠNG ${c.chapterNumber}: ${c.title} === `;
        return titleLine + (c.content || "");
      }).join(" ");
      return merged.replace(/\n+/g, " ");
    }

    return this.currentStory.chapters.map(c => {
      const titleLine = this.audioRemoveTitles ? "" : `=== CHƯƠNG ${c.chapterNumber}: ${c.title} ===\n\n`;
      return titleLine + (c.content || "");
    }).join("\n\n\n");
  }

  getCurrentStoryText() {
    if (!this.currentStory || !this.currentStory.chapters) return "";
    if (this.isAudioCleaned) {
      return this.buildCleanAudioText();
    }
    return this.buildOriginalNovelText();
  }

  exportTxt() {
    if (!this.currentStory) return;
    const text = this.getCurrentStoryText();
    if (!text) {
      this.app.showToast("Chưa có nội dung truyện để xuất file!", "warning");
      return;
    }
    const suffix = this.isAudioCleaned ? "_audio" : "";
    const filename = `${this.currentStory.title.replace(/[\/\\:*?"<>|]/g, "_")}${suffix}.txt`;
    this.app.triggerDownload(text, filename, "text/plain;charset=utf-8");
    const modeName = this.isAudioCleaned ? "Bản Chuẩn Hóa Audio" : "Bản Gốc";
    this.app.showToast(`Đã xuất file TXT (${modeName}): ${filename}`, "success");
  }

  exportMarkdown() {
    if (!this.currentStory) return;
    const md = `# ${this.currentStory.title}\n\n` +
      `> **Tóm tắt:** ${this.currentStory.concept?.premise || ''}\n\n` +
      this.currentStory.chapters.map(c => `## Chương ${c.chapterNumber}: ${c.title}\n\n${c.content}`).join("\n\n---\n\n");
    const filename = `${this.currentStory.title.replace(/[\/\\:*?"<>|]/g, "_")}.md`;
    this.app.triggerDownload(md, filename, "text/markdown;charset=utf-8");
    this.app.showToast(`Đã xuất file Markdown: ${filename}`, "success");
  }

  exportHtml() {
    if (!this.currentStory) return;
    const bodyContent = this.currentStory.chapters.map(c => `
      <section class="chapter">
        <h2>Chương ${c.chapterNumber}: ${c.title}</h2>
        <div class="content">${c.content.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</div>
      </section>
    `).join("<hr>");

    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>${this.currentStory.title}</title>
  <style>
    body { font-family: 'Segoe UI', serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.8; color: #1e293b; }
    h1 { text-align: center; color: #0f172a; margin-bottom: 30px; }
    h2 { color: #8b5cf6; margin-top: 40px; }
    p { text-indent: 1.5em; margin: 12px 0; }
    hr { margin: 40px 0; border: 0; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <h1>${this.currentStory.title}</h1>
  ${bodyContent}
</body>
</html>`;

    const filename = `${this.currentStory.title.replace(/[\/\\:*?"<>|]/g, "_")}.html`;
    this.app.triggerDownload(html, filename, "text/html;charset=utf-8");
    this.app.showToast(`Đã xuất file HTML: ${filename}`, "success");
  }

  exportDocx() {
    if (!this.currentStory) return;
    const bodyContent = this.currentStory.chapters.map(c => `
      <h2>Chương ${c.chapterNumber}: ${c.title}</h2>
      <p>${c.content.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>
    `).join("<br><br>");

    const docxHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>${this.currentStory.title}</title></head>
<body><h1>${this.currentStory.title}</h1>${bodyContent}</body></html>`;

    const filename = `${this.currentStory.title.replace(/[\/\\:*?"<>|]/g, "_")}.doc`;
    this.app.triggerDownload(docxHtml, filename, "application/msword;charset=utf-8");
    this.app.showToast(`Đã xuất file Word: ${filename}`, "success");
  }

  exportEpub() {
    this.app.showToast("Đang chuẩn bị file HTML sẵn sàng nạp Calibre/EPUB!", "info");
    this.exportHtml();
  }

  // ==================== EVENT BINDINGS ====================

  bindEvents() {
    // Step Indicator Pills
    for (let i = 1; i <= 4; i++) {
      const pill = document.getElementById(`stepPill${i}`);
      if (pill) {
        pill.addEventListener("click", () => {
          this.goToStep(i);
        });
      }
    }

    // Step 1: Trope & Tag Events
    const btnToggleAdd = document.getElementById("btnToggleAddTag");
    if (btnToggleAdd) {
      btnToggleAdd.addEventListener("click", () => this.toggleCustomTagPanel());
    }

    const btnSubmitTag = document.getElementById("btnAddCustomTag") || document.getElementById("btnSubmitCustomTag");
    const customTagInput = document.getElementById("customTagInput");
    if (btnSubmitTag) {
      btnSubmitTag.addEventListener("click", () => {
        const val = customTagInput ? customTagInput.value : "";
        this.addCustomTag(val);
      });
    }

    if (customTagInput) {
      customTagInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.addCustomTag(customTagInput.value);
        }
      });
    }

    const btnCancelTag = document.getElementById("btnCloseAddTag") || document.getElementById("btnCancelCustomTag");
    if (btnCancelTag) {
      btnCancelTag.addEventListener("click", () => this.toggleCustomTagPanel(false));
    }

    const btnRandomTropes = document.getElementById("btnRandomTropes");
    if (btnRandomTropes) {
      btnRandomTropes.addEventListener("click", () => this.applyRandomTropes());
    }

    const btnSamplePremise = document.getElementById("btnSamplePremise");
    if (btnSamplePremise) {
      btnSamplePremise.addEventListener("click", () => {
        const sample = getRandomSamplePremise();
        const input = document.getElementById("userPremiseInput");
        if (input) {
          input.value = sample;
          this.app.showToast("Đã điền ý tưởng mẫu cuốn hút!", "info");
        }
      });
    }

    const btnGenConcepts = document.getElementById("btnGenerateConcepts");
    if (btnGenConcepts) {
      btnGenConcepts.addEventListener("click", () => this.generateStoryConcepts());
    }

    // Step 2 Events
    const btnGenOutline = document.getElementById("btnGenerateOutline");
    if (btnGenOutline) {
      btnGenOutline.addEventListener("click", () => this.generateDetailedOutline());
    }

    // Step 3 Events
    const btnStartWriting = document.getElementById("btnStartWriting");
    if (btnStartWriting) {
      btnStartWriting.addEventListener("click", () => this.startWritingStory());
    }

    const btnPauseWriting = document.getElementById("btnPauseResumeWriting") || document.getElementById("btnPauseWriting");
    if (btnPauseWriting) {
      btnPauseWriting.addEventListener("click", () => this.pauseWriting());
    }

    const btnStopWriting = document.getElementById("btnStopWriting");
    if (btnStopWriting) {
      btnStopWriting.addEventListener("click", () => this.stopWriting());
    }

    // Step 4 Reader Toolbar Events
    const btnThemeDark = document.getElementById("btnThemeDark");
    const btnThemeSepia = document.getElementById("btnThemeSepia");
    const btnThemeLight = document.getElementById("btnThemeLight");
    const readerContainer = document.getElementById("readerContainer");

    const setTheme = (themeName) => {
      [btnThemeDark, btnThemeSepia, btnThemeLight].forEach(b => b?.classList.remove("active"));
      if (themeName === "sepia") {
        btnThemeSepia?.classList.add("active");
        if (readerContainer) {
          readerContainer.style.setProperty("--reader-bg", "#fbf0d9");
          readerContainer.style.setProperty("--reader-text", "#433422");
          readerContainer.style.setProperty("--reader-card", "#f4e4c1");
          readerContainer.style.setProperty("--reader-border", "#e2cf9f");
        }
      } else if (themeName === "light") {
        btnThemeLight?.classList.add("active");
        if (readerContainer) {
          readerContainer.style.setProperty("--reader-bg", "#ffffff");
          readerContainer.style.setProperty("--reader-text", "#1e293b");
          readerContainer.style.setProperty("--reader-card", "#f8fafc");
          readerContainer.style.setProperty("--reader-border", "#e2e8f0");
        }
      } else {
        btnThemeDark?.classList.add("active");
        if (readerContainer) {
          readerContainer.style.setProperty("--reader-bg", "#0f1422");
          readerContainer.style.setProperty("--reader-text", "#e2e8f0");
          readerContainer.style.setProperty("--reader-card", "#172033");
          readerContainer.style.setProperty("--reader-border", "rgba(255, 255, 255, 0.1)");
        }
      }
    };

    if (btnThemeDark) btnThemeDark.addEventListener("click", () => setTheme("dark"));
    if (btnThemeSepia) btnThemeSepia.addEventListener("click", () => setTheme("sepia"));
    if (btnThemeLight) btnThemeLight.addEventListener("click", () => setTheme("light"));

    const fontRange = document.getElementById("readerFontSizeRange");
    const fontDisplay = document.getElementById("fontSizeDisplay");
    if (fontRange && readerContainer) {
      fontRange.addEventListener("input", (e) => {
        const val = e.target.value;
        readerContainer.style.setProperty("--reader-size", `${val}px`);
        if (fontDisplay) fontDisplay.textContent = `${val}px`;
      });
    }

    const btnCleanAudio = document.getElementById("btnCleanForAudio");
    const btnRestoreText = document.getElementById("btnRestoreOriginalText");
    const btnQuickCopy = document.getElementById("btnQuickCopyCleanText");
    const btnQuickTxt = document.getElementById("btnQuickDownloadAudioTxt");

    const updateActionButtonsState = () => {
      if (this.isAudioCleaned) {
        if (btnQuickCopy) btnQuickCopy.innerHTML = "📋 Sao Chép (Đã Chuẩn Hóa)";
        if (btnQuickTxt) btnQuickTxt.innerHTML = "📥 Tải .TXT (Đã Chuẩn Hóa)";
      } else {
        if (btnQuickCopy) btnQuickCopy.innerHTML = "📋 Sao Chép";
        if (btnQuickTxt) btnQuickTxt.innerHTML = "📥 Tải .TXT";
      }
    };

    if (btnCleanAudio) {
      btnCleanAudio.addEventListener("click", () => {
        this.isAudioCleaned = true;
        btnCleanAudio.style.display = "none";
        if (btnRestoreText) btnRestoreText.style.display = "inline-flex";
        updateActionButtonsState();
        this.renderReaderMode();
        this.app.showToast("Đã kích hoạt chế độ Chuẩn Hóa Audio! Nút Sao Chép & Tải .TXT sẽ lấy bản đã làm sạch số. ✨", "success");
      });
    }

    if (btnRestoreText) {
      btnRestoreText.addEventListener("click", () => {
        this.isAudioCleaned = false;
        btnRestoreText.style.display = "none";
        if (btnCleanAudio) btnCleanAudio.style.display = "inline-flex";
        updateActionButtonsState();
        this.renderReaderMode();
        this.app.showToast("Đã trở về Bản Gốc! Nút Sao Chép & Tải .TXT sẽ lấy nguyên văn ban đầu.", "info");
      });
    }

    const chkRemoveTitles = document.getElementById("chkAudioRemoveTitles");
    if (chkRemoveTitles) {
      chkRemoveTitles.addEventListener("change", (e) => {
        this.audioRemoveTitles = e.target.checked;
        this.renderReaderMode();
        const msg = this.audioRemoveTitles 
          ? "✓ Đã xóa toàn bộ tiêu đề & tên chương trên màn hình!" 
          : "✓ Đã hiển thị lại tiêu đề các chương.";
        this.app.showToast(msg, "info");
      });
    }

    const chkSinglePara = document.getElementById("chkAudioSingleParagraph");
    if (chkSinglePara) {
      chkSinglePara.addEventListener("change", (e) => {
        this.audioSingleParagraph = e.target.checked;
        this.renderReaderMode();
        const msg = this.audioSingleParagraph 
          ? "✓ Đã gộp toàn bộ thành 1 đoạn văn duy nhất!" 
          : "✓ Đã tách lại thành các đoạn văn riêng biệt.";
        this.app.showToast(msg, "info");
      });
    }

    if (btnQuickCopy) {
      btnQuickCopy.addEventListener("click", async () => {
        const text = this.getCurrentStoryText();
        if (!text) {
          this.app.showToast("Chưa có nội dung truyện để sao chép!", "warning");
          return;
        }
        await navigator.clipboard.writeText(text);
        const modeLabel = this.isAudioCleaned ? "Bản Chuẩn Hóa Audio" : "Bản Gốc";
        this.app.showToast(`Đã sao chép toàn bộ truyện (${modeLabel}) vào clipboard! 📋`, "success");
      });
    }

    if (btnQuickTxt) {
      btnQuickTxt.addEventListener("click", () => this.exportTxt());
    }

    const btnQuickMd = document.getElementById("btnQuickDownloadFullMarkdown");
    if (btnQuickMd) {
      btnQuickMd.addEventListener("click", () => this.exportMarkdown());
    }

    const btnQuickAudio = document.getElementById("btnQuickOpenAudio");
    if (btnQuickAudio) {
      btnQuickAudio.addEventListener("click", (e) => {
        e.preventDefault();
        this.app.sendStoryToAudioStudio();
      });
    }

    const chapterSelect = document.getElementById("readerChapterSelect");
    if (chapterSelect) {
      chapterSelect.addEventListener("change", (e) => {
        const targetId = e.target.value;
        if (targetId) {
          const el = document.getElementById(targetId);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    }

    const btnScrollTop = document.getElementById("btnReaderScrollTop");
    if (btnScrollTop) {
      btnScrollTop.addEventListener("click", () => {
        const bodyEl = document.getElementById("readerBody");
        if (bodyEl) bodyEl.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  }
}
