/**
 * Novel Controller - Quản lý toàn bộ giao diện và quy trình 4 Bước Sáng Tác Tiểu Thuyết
 * Step 1: Trope & Premise
 * Step 2: Checkpoint 1 (Dàn ý chi tiết)
 * Step 3: Checkpoint 2 (Viết chương hàng loạt & đa luồng)
 * Step 4: Đọc truyện, Làm sạch Audio & Xuất bản (TXT, MD, HTML, DOCX, EPUB)
 */

import { TROPE_CATEGORIES, ALL_TROPES, getRandomTropes, getRandomSamplePremise } from "../data/tagPools.js";
import { normalizeTextForAudio } from "../data/numberToWordsVi.js";
import { geminiService } from "../services/geminiService.js";
import { storageService } from "../services/storageService.js";
import { authService } from "../services/authService.js";

export class NovelController {
  constructor(app) {
    this.app = app;
    this.currentStep = 1;
    this.customTags = storageService.getCustomTags();
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
    this.renderTropeCloud();
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

    const protagonist = document.getElementById("protagonistInput")?.value || "Nữ chính độc lập, mạnh mẽ";
    const antagonist = document.getElementById("antagonistInput")?.value || "Mẹ chồng / Em gái độc hại";
    const setting = document.getElementById("settingSelect")?.value || "Hiện đại đô thị hào môn";
    const userPremise = document.getElementById("userPremiseInput")?.value || "";
    const targetWords = parseInt(document.getElementById("targetWordsSelect")?.value, 10) || 12000;
    const tone = document.getElementById("toneSelect")?.value || "Kịch tính, vả mặt đã tai, cuốn hút";

    const params = {
      selectedTags: Array.from(this.selectedTags),
      protagonist,
      antagonist,
      setting,
      userPremise,
      targetWords,
      tone
    };

    const btn = document.getElementById("btnGenerateConcepts");
    const container = document.getElementById("conceptsGrid");
    const section = document.getElementById("conceptsResultSection");

    btn.disabled = true;
    btn.innerHTML = `<span class="typing-cursor"></span> AI đang lên 3 kịch bản Zhihu...`;
    if (section) section.style.display = "block";
    if (container) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--accent-pink);">
          <div style="font-size: 28px; margin-bottom: 12px; animation: spin 2s linear infinite;">🪄</div>
          <div style="font-weight: 600; font-size: 15px;">Đang kiến tạo 3 motif vả mặt đỉnh cao từ kho dữ liệu Zhihu...</div>
          <div style="font-size: 12px; color: var(--text-dim); margin-top: 6px;">Áp dụng ${params.selectedTags.length} thẻ trope được chọn</div>
        </div>
      `;
    }

    try {
      this.generatedConcepts = await geminiService.generateStoryConcepts(params);
      this.renderConceptCards(params);
      this.app.showToast("Đã tạo thành công 3 bản phác thảo cốt truyện!", "success");
    } catch (error) {
      this.app.showToast(`Lỗi: ${error.message}`, "error");
      if (container) {
        container.innerHTML = `
          <div style="grid-column: 1/-1; padding: 24px; background: rgba(239, 68, 68, 0.1); border: 1px solid var(--accent-rose); border-radius: 8px; color: var(--accent-rose);">
            <strong>✕ Không thể tạo cốt truyện:</strong> ${error.message}
            <div style="margin-top: 12px;">
              <button class="btn btn-secondary btn-sm" onclick="window.novelStudio.openApiSettingsModal()">Kiểm tra API Key</button>
            </div>
          </div>
        `;
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<span>✨</span> Lên 3 Bản Phác Thảo Cốt Truyện`;
    }
  }

  renderConceptCards(params) {
    const container = document.getElementById("conceptsGrid");
    if (!container) return;
    container.innerHTML = "";

    this.generatedConcepts.forEach((concept, index) => {
      const card = document.createElement("div");
      card.className = `concept-card ${this.selectedConcept?.id === concept.id ? 'selected' : ''}`;
      card.id = `conceptCard_${concept.id}`;

      card.innerHTML = `
        <div class="concept-badge">Kịch Bản #${index + 1} • ${concept.tone || 'Zhihu High Drama'}</div>
        <div class="concept-title">${concept.title}</div>
        <div class="concept-premise">${concept.premise}</div>
        <div class="concept-hook">
          <div class="concept-hook-label">⚡ Móc Câu Mở Đầu (Hook 30s):</div>
          "${concept.hook}"
        </div>
        <div class="concept-twist">
          <div class="concept-twist-label">🎭 Cú Twist Bất Ngờ (Zhihu Twist):</div>
          ${concept.twist}
        </div>
        <button class="btn ${this.selectedConcept?.id === concept.id ? 'btn-success' : 'btn-primary'} btn-select-concept" style="width: 100%; margin-top: 16px;">
          ${this.selectedConcept?.id === concept.id ? '✓ Đã Chọn Kịch Bản Này' : '👉 Chọn Kịch Bản & Sang Bước 2'}
        </button>
      `;

      card.querySelector(".btn-select-concept").addEventListener("click", () => {
        this.selectConcept(concept, params);
      });

      container.appendChild(card);
    });
  }

  selectConcept(concept, params) {
    this.selectedConcept = concept;
    document.querySelectorAll(".concept-card").forEach(c => c.classList.remove("selected"));
    const selectedCard = document.getElementById(`conceptCard_${concept.id}`);
    if (selectedCard) selectedCard.classList.add("selected");

    const chapterCount = Math.max(8, Math.min(18, Math.round((params.targetWords || 12000) / 1200)));

    this.currentStory = {
      id: `story_${Date.now()}`,
      title: concept.title,
      concept: concept,
      params: { ...params, chapterCount },
      outline: null,
      chapters: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.app.saveCurrentStory();
    this.setupStep2View();
    this.goToStep(2);
    this.app.showToast(`Đã chọn: "${concept.title}"`, "success");
  }

  // ==================== STEP 2: DETAILED OUTLINE ====================

  setupStep2View() {
    if (!this.currentStory) return;
    const story = this.currentStory;

    const banner = document.getElementById("step2ConceptBanner");
    if (banner) {
      banner.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;">
          <div>
            <div style="font-size: 18px; font-weight: 800; color: #fff;">${story.title}</div>
            <div style="font-size: 13px; color: var(--text-dim); margin-top: 4px;">${story.concept.premise}</div>
            <div style="display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap;">
              ${(story.params.selectedTags || []).map(t => `<span class="badge badge-purple">${t}</span>`).join("")}
              <span class="badge badge-emerald">Dự kiến: ${story.params.chapterCount} chương (~${(story.params.targetWords || 12000).toLocaleString()} từ)</span>
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" id="btnEditStep1Params" style="flex-shrink: 0;">
            ✏️ Đổi Ý Tưởng
          </button>
        </div>
      `;

      document.getElementById("btnEditStep1Params")?.addEventListener("click", () => {
        this.goToStep(1);
      });
    }

    const outlineCountInput = document.getElementById("outlineChapterCount");
    if (outlineCountInput) {
      outlineCountInput.value = story.params.chapterCount || 10;
    }

    if (story.outline) {
      this.renderOutlineView();
    }
  }

  async generateDetailedOutline() {
    if (!this.currentStory) return;

    const btn = document.getElementById("btnGenerateOutline");
    const container = document.getElementById("outlineEditorContainer");
    const chapterCount = parseInt(document.getElementById("outlineChapterCount")?.value, 10) || 10;

    this.currentStory.params.chapterCount = chapterCount;

    btn.disabled = true;
    btn.innerHTML = `<span class="typing-cursor"></span> AI đang phân tích & lập dàn ý ${chapterCount} chương...`;
    container.innerHTML = `
      <div style="text-align: center; padding: 48px; color: var(--accent-pink);">
        <div style="font-size: 32px; margin-bottom: 12px; animation: bounce 1.5s infinite;">📋</div>
        <div style="font-weight: 700; font-size: 16px;">Đang phân bổ nhịp điệu Zhihu: Mở đầu Hook ➡️ Tích tụ Uất ức ➡️ Đỉnh điểm Bùng nổ ➡️ Vả mặt Trả thù...</div>
        <div style="font-size: 12px; color: var(--text-dim); margin-top: 6px;">Chia nhỏ thành ${chapterCount} chương với cliffhanger và conflict rõ ràng</div>
      </div>
    `;

    try {
      const outline = await geminiService.generateDetailedOutline(this.currentStory.concept, this.currentStory.params);
      this.currentStory.outline = outline;
      this.currentStory.chapters = outline.chapters.map(ch => ({
        chapterNumber: ch.chapterNumber,
        title: ch.title,
        outlineInfo: ch,
        content: "",
        wordCount: 0,
        status: "pending"
      }));

      await this.app.saveCurrentStory();
      this.renderOutlineView();
      this.app.showToast("Đã hoàn thành Checkpoint 1: Dàn ý chi tiết!", "success");
    } catch (error) {
      this.app.showToast(`Lỗi tạo dàn ý: ${error.message}`, "error");
      container.innerHTML = `
        <div style="padding: 20px; background: rgba(239, 68, 68, 0.1); border: 1px solid var(--accent-rose); border-radius: 8px; color: var(--accent-rose);">
          ✕ Không thể lập dàn ý: ${error.message}
        </div>
      `;
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<span>🪄</span> Tự Động Lập Dàn Ý Chi Tiết`;
    }
  }

  renderOutlineView() {
    const container = document.getElementById("outlineEditorContainer");
    if (!container || !this.currentStory?.outline) return;

    const outline = this.currentStory.outline;

    container.innerHTML = `
      <!-- Characters Overview -->
      <div class="studio-card" style="margin-bottom: 20px;">
        <div class="card-title" style="margin-bottom: 12px;">👥 Tuyến Nhân Vật Chính & Động Cơ:</div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px;">
          ${(outline.characters || []).map(char => `
            <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <strong style="color: var(--accent-pink); font-size: 14px;">${char.name}</strong>
                <span class="badge badge-purple" style="font-size: 10px;">${char.role}</span>
              </div>
              <div style="font-size: 12px; color: var(--text-main); margin-top: 4px;"><strong>Tính cách:</strong> ${char.personality}</div>
              <div style="font-size: 11px; color: var(--text-dim); margin-top: 2px;"><strong>Mục tiêu:</strong> ${char.motivation}</div>
            </div>
          `).join("")}
        </div>
      </div>

      <!-- Arc Progression -->
      <div class="studio-card" style="margin-bottom: 20px;">
        <div class="card-title" style="margin-bottom: 8px;">📈 Cấu Trúc Cốt Truyện 3 Hồi (Zhihu Arc):</div>
        <div style="font-size: 13px; color: var(--text-main); line-height: 1.6; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 6px;">
          ${outline.arcSummary || 'Theo chuẩn cấu trúc Zhihu: Kích thích tò mò ban đầu, đẩy mâu thuẫn lên đỉnh điểm, lật ngược thế cờ và kết thúc thỏa mãn.'}
        </div>
      </div>

      <!-- Chapter Outline Cards -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <div style="font-size: 16px; font-weight: 700; color: #fff;">
          📚 Danh Sách ${outline.chapters.length} Chương Chi Tiết:
        </div>
        <button class="btn btn-secondary btn-sm" id="btnAddChapterToOutline">
          ➕ Thêm Chương
        </button>
      </div>

      <div id="outlineChaptersList">
        ${outline.chapters.map((ch, idx) => `
          <div class="chapter-outline-item" data-chapter-index="${idx}">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span class="badge badge-purple" style="font-size: 12px; padding: 4px 8px;">Chương ${ch.chapterNumber}</span>
                <input type="text" class="param-input ch-title-input" value="${ch.title}" style="font-weight: 700; font-size: 14px; width: 320px;" placeholder="Tên chương...">
              </div>
              <button class="btn btn-danger btn-xs btn-delete-chapter" data-idx="${idx}" title="Xóa chương này">&times; Xóa</button>
            </div>
            
            <div style="margin-top: 10px;">
              <label style="font-size: 11px; color: var(--text-dim); display: block; margin-bottom: 4px;">Nội dung chính & diễn biến:</label>
              <textarea class="param-textarea ch-summary-input" rows="2" style="font-size: 12px;">${ch.summary || ''}</textarea>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px;">
              <div>
                <label style="font-size: 11px; color: var(--accent-rose); display: block; margin-bottom: 2px;">⚡ Xung đột / Uất ức (Conflict):</label>
                <input type="text" class="param-input ch-conflict-input" value="${ch.conflict || ''}" style="font-size: 12px;">
              </div>
              <div>
                <label style="font-size: 11px; color: var(--accent-pink); display: block; margin-bottom: 2px;">🪝 Móc câu kết chương (Cliffhanger):</label>
                <input type="text" class="param-input ch-cliff-input" value="${ch.cliffhanger || ''}" style="font-size: 12px;">
              </div>
            </div>
          </div>
        `).join("")}
      </div>

      <!-- Action Bar -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 24px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.08);">
        <button class="btn btn-secondary btn-lg" id="btnBackToStep1">
          ← Quay Lại Bước 1
        </button>
        <button class="btn btn-primary btn-lg btn-glow" id="btnProceedToStep3">
          🚀 Duyệt Dàn Ý & Bắt Đầu Viết Truyện (Bước 3) →
        </button>
      </div>
    `;

    // Bind Edit Events
    container.querySelectorAll(".btn-delete-chapter").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const idx = parseInt(e.target.getAttribute("data-idx"), 10);
        this.deleteChapterFromOutline(idx);
      });
    });

    document.getElementById("btnAddChapterToOutline")?.addEventListener("click", () => {
      this.addChapterToOutline();
    });

    document.getElementById("btnBackToStep1")?.addEventListener("click", () => {
      this.goToStep(1);
    });

    document.getElementById("btnProceedToStep3")?.addEventListener("click", () => {
      this.syncOutlineInputs();
      this.setupStep3View();
      this.goToStep(3);
    });
  }

  syncOutlineInputs() {
    if (!this.currentStory?.outline) return;

    const items = document.querySelectorAll(".chapter-outline-item");
    items.forEach((item, idx) => {
      const ch = this.currentStory.outline.chapters[idx];
      if (ch) {
        ch.title = item.querySelector(".ch-title-input")?.value || ch.title;
        ch.summary = item.querySelector(".ch-summary-input")?.value || ch.summary;
        ch.conflict = item.querySelector(".ch-conflict-input")?.value || ch.conflict;
        ch.cliffhanger = item.querySelector(".ch-cliff-input")?.value || ch.cliffhanger;
      }
    });

    this.currentStory.chapters = this.currentStory.outline.chapters.map((ch, idx) => {
      const existing = this.currentStory.chapters[idx] || {};
      return {
        ...existing,
        chapterNumber: ch.chapterNumber,
        title: ch.title,
        outlineInfo: ch
      };
    });

    this.app.saveCurrentStory();
  }

  deleteChapterFromOutline(idx) {
    if (this.currentStory.outline.chapters.length <= 3) {
      this.app.showToast("Truyện cần tối thiểu 3 chương!", "warning");
      return;
    }
    this.syncOutlineInputs();
    this.currentStory.outline.chapters.splice(idx, 1);
    // Re-index
    this.currentStory.outline.chapters.forEach((ch, i) => {
      ch.chapterNumber = i + 1;
    });
    this.renderOutlineView();
  }

  addChapterToOutline() {
    this.syncOutlineInputs();
    const nextNum = this.currentStory.outline.chapters.length + 1;
    this.currentStory.outline.chapters.push({
      chapterNumber: nextNum,
      title: `Chương ${nextNum}: Cao Trào Tiếp Theo`,
      summary: "Nhân vật chính tiếp tục triển khai kế hoạch...",
      conflict: "Mâu thuẫn mới nảy sinh",
      cliffhanger: "Tình huống bất ngờ hé lộ"
    });
    this.renderOutlineView();
  }

  // ==================== STEP 3: BATCH CHAPTER GENERATION ====================

  setupStep3View() {
    if (!this.currentStory) return;
    const story = this.currentStory;

    const banner = document.getElementById("step3StoryBanner");
    if (banner) {
      banner.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 18px; font-weight: 800; color: #fff;">${story.title}</div>
            <div style="font-size: 12px; color: var(--text-dim); margin-top: 2px;">
              ${story.chapters.length} chương • Dàn ý đã sẵn sàng
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary btn-sm" id="btnBackToStep2">
              ✏️ Sửa Dàn Ý
            </button>
          </div>
        </div>
      `;

      document.getElementById("btnBackToStep2")?.addEventListener("click", () => {
        this.goToStep(2);
      });
    }

    this.renderChapterGenerationList();
  }

  renderChapterGenerationList() {
    const container = document.getElementById("chapterGenerationList");
    if (!container || !this.currentStory) return;

    container.innerHTML = this.currentStory.chapters.map((ch, idx) => {
      const isCompleted = ch.status === "completed";
      const isGenerating = ch.status === "generating";
      const isError = ch.status === "error";

      let statusBadge = `<span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-dim);">Chờ viết</span>`;
      if (isGenerating) {
        statusBadge = `<span class="badge badge-pink"><span class="typing-cursor"></span> Đang viết...</span>`;
      } else if (isCompleted) {
        statusBadge = `<span class="badge badge-emerald">✓ Xong (${ch.wordCount.toLocaleString()} từ)</span>`;
      } else if (isError) {
        statusBadge = `<span class="badge badge-rose">✕ Lỗi</span>`;
      }

      return `
        <div class="studio-card chapter-gen-item ${isGenerating ? 'generating' : ''}" id="chapterGenItem_${ch.chapterNumber}" style="margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;" class="chapter-gen-header" data-idx="${idx}">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-weight: 800; color: var(--accent-pink); font-size: 14px;">#${ch.chapterNumber}</span>
              <strong style="color: #fff; font-size: 14px;">${ch.title}</strong>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              ${statusBadge}
              ${isCompleted ? `<button class="btn btn-secondary btn-xs btn-regen-ch" data-idx="${idx}">🔄 Viết lại</button>` : ''}
              <span class="toggle-icon">▼</span>
            </div>
          </div>

          <div class="chapter-gen-body" id="chapterGenBody_${ch.chapterNumber}" style="display: ${isCompleted || isGenerating ? 'block' : 'none'}; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.06);">
            <div style="font-size: 11px; color: var(--text-dim); margin-bottom: 8px;">
              <strong>Dàn ý:</strong> ${ch.outlineInfo?.summary || ''}
            </div>
            <div class="chapter-live-content" id="chapterLiveContent_${ch.chapterNumber}" style="font-size: 13px; line-height: 1.7; color: var(--text-main); max-height: 250px; overflow-y: auto; white-space: pre-wrap; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 6px;">${ch.content || '<em style="color: var(--text-dim);">Chưa có nội dung. Bấm "Bắt Đầu Viết" để sinh chương.</em>'}</div>
          </div>
        </div>
      `;
    }).join("");

    // Toggle expand
    container.querySelectorAll(".chapter-gen-header").forEach(header => {
      header.addEventListener("click", (e) => {
        if (e.target.classList.contains("btn-regen-ch")) return;
        const idx = header.getAttribute("data-idx");
        const body = document.getElementById(`chapterGenBody_${parseInt(idx) + 1}`);
        if (body) {
          body.style.display = body.style.display === "none" ? "block" : "none";
        }
      });
    });

    // Regen chapter
    container.querySelectorAll(".btn-regen-ch").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute("data-idx"), 10);
        await this.regenerateSingleChapter(idx);
      });
    });
  }

  async startWritingStory() {
    if (!this.currentStory || this.isWriting) return;

    this.isWriting = true;
    this.isPaused = false;

    const btnStart = document.getElementById("btnStartWriting");
    const btnPause = document.getElementById("btnPauseWriting");
    const btnStop = document.getElementById("btnStopWriting");
    const progressContainer = document.getElementById("writingProgressContainer");

    if (btnStart) btnStart.style.display = "none";
    if (btnPause) btnPause.style.display = "inline-flex";
    if (btnStop) btnStop.style.display = "inline-flex";
    if (progressContainer) progressContainer.style.display = "block";

    const settings = storageService.getSettings();
    const delayMs = settings.delayBetweenChapters || 3500;
    const chapters = this.currentStory.chapters;

    let completedCount = chapters.filter(c => c.status === "completed").length;

    for (let i = 0; i < chapters.length; i++) {
      if (!this.isWriting) break;

      while (this.isPaused && this.isWriting) {
        await new Promise(r => setTimeout(r, 500));
      }

      const chapter = chapters[i];
      if (chapter.status === "completed") continue;

      chapter.status = "generating";
      this.renderChapterGenerationList();

      const progressBar = document.getElementById("writingProgressBar");
      const progressText = document.getElementById("writingProgressText");
      const percent = Math.round((i / chapters.length) * 100);

      if (progressBar) progressBar.style.width = `${percent}%`;
      if (progressText) progressText.textContent = `Đang viết Chương ${chapter.chapterNumber}/${chapters.length}: "${chapter.title}"... (${percent}%)`;

      const liveContentEl = document.getElementById(`chapterLiveContent_${chapter.chapterNumber}`);

      try {
        const generatedContent = await geminiService.generateChapterContent(
          this.currentStory,
          chapter.chapterNumber,
          (streamChunk) => {
            if (liveContentEl) {
              liveContentEl.textContent += streamChunk;
              liveContentEl.scrollTop = liveContentEl.scrollHeight;
            }
          }
        );

        chapter.content = generatedContent;
        chapter.wordCount = this.app.countWords(generatedContent);
        chapter.status = "completed";
        completedCount++;

        await this.app.saveCurrentStory();
        this.renderChapterGenerationList();

        if (i < chapters.length - 1 && this.isWriting) {
          const waitSec = Math.round(delayMs / 1000);
          if (progressText) progressText.textContent = `⏳ Đang giãn cách ${waitSec}s chống chạm trần RPM trước khi viết chương ${i + 2}...`;
          await new Promise(r => setTimeout(r, delayMs));
        }

      } catch (err) {
        console.error(`Lỗi khi viết chương ${chapter.chapterNumber}:`, err);
        chapter.status = "error";
        this.renderChapterGenerationList();
        this.app.showToast(`Lỗi viết chương ${chapter.chapterNumber}: ${err.message}`, "error");
        break;
      }
    }

    this.isWriting = false;
    if (btnStart) btnStart.style.display = "inline-flex";
    if (btnPause) btnPause.style.display = "none";
    if (btnStop) btnStop.style.display = "none";

    const allDone = chapters.every(c => c.status === "completed");
    if (allDone) {
      const progressBar = document.getElementById("writingProgressBar");
      const progressText = document.getElementById("writingProgressText");
      if (progressBar) progressBar.style.width = "100%";
      if (progressText) progressText.textContent = `🎉 Hoàn thành toàn bộ ${chapters.length} chương!`;
      this.app.showToast("🎉 Đã hoàn thành toàn bộ tác phẩm!", "success");

      setTimeout(() => {
        this.setupStep4View();
        this.goToStep(4);
      }, 1200);
    }
  }

  pauseWriting() {
    this.isPaused = !this.isPaused;
    const btn = document.getElementById("btnPauseWriting");
    if (btn) {
      btn.textContent = this.isPaused ? "▶️ Tiếp Tục" : "⏸️ Tạm Dừng";
    }
    this.app.showToast(this.isPaused ? "Đã tạm dừng tiến trình viết." : "Đang tiếp tục viết...", "info");
  }

  stopWriting() {
    this.isWriting = false;
    this.isPaused = false;
    const btnStart = document.getElementById("btnStartWriting");
    const btnPause = document.getElementById("btnPauseWriting");
    const btnStop = document.getElementById("btnStopWriting");

    if (btnStart) btnStart.style.display = "inline-flex";
    if (btnPause) btnPause.style.display = "none";
    if (btnStop) btnStop.style.display = "none";
    this.app.showToast("Đã dừng tiến trình viết truyện.", "warning");
    this.renderChapterGenerationList();
  }

  async regenerateSingleChapter(idx) {
    const chapter = this.currentStory.chapters[idx];
    if (!chapter || this.isWriting) return;

    chapter.status = "generating";
    chapter.content = "";
    this.renderChapterGenerationList();

    const liveContentEl = document.getElementById(`chapterLiveContent_${chapter.chapterNumber}`);

    try {
      const generated = await geminiService.generateChapterContent(
        this.currentStory,
        chapter.chapterNumber,
        (chunk) => {
          if (liveContentEl) {
            liveContentEl.textContent += chunk;
            liveContentEl.scrollTop = liveContentEl.scrollHeight;
          }
        }
      );

      chapter.content = generated;
      chapter.wordCount = this.app.countWords(generated);
      chapter.status = "completed";

      await this.app.saveCurrentStory();
      this.renderChapterGenerationList();
      this.app.showToast(`Đã viết lại xong Chương ${chapter.chapterNumber}!`, "success");
    } catch (e) {
      chapter.status = "error";
      this.renderChapterGenerationList();
      this.app.showToast(`Lỗi: ${e.message}`, "error");
    }
  }

  // ==================== STEP 4: READER & EXPORT ====================

  setupStep4View() {
    this.renderReaderMode();
  }

  renderReaderMode() {
    if (!this.currentStory) return;
    const story = this.currentStory;

    const totalWords = story.chapters?.reduce((sum, c) => sum + (c.wordCount || 0), 0) || 0;
    const titleEl = document.getElementById("readerStoryTitle");
    const metaEl = document.getElementById("readerStoryMeta");
    const contentEl = document.getElementById("readerFullContent");

    if (titleEl) titleEl.textContent = story.title;
    if (metaEl) {
      metaEl.innerHTML = `
        <span class="badge badge-pink">${story.params?.tone || 'Zhihu High Drama'}</span>
        <span>•</span>
        <span>${story.chapters?.length || 0} chương</span>
        <span>•</span>
        <strong style="color: var(--accent-emerald);">${totalWords.toLocaleString()} từ</strong>
      `;
    }

    if (contentEl) {
      contentEl.innerHTML = (story.chapters || []).map(ch => `
        <div class="reader-chapter-block" style="margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid rgba(255,255,255,0.06);">
          <h2 style="font-size: 18px; font-weight: 800; color: var(--accent-pink); margin-bottom: 16px;">
            Chương ${ch.chapterNumber}: ${ch.title}
          </h2>
          <div style="font-size: 15px; line-height: 1.85; color: var(--text-main); white-space: pre-wrap;">${ch.content || '<em style="color: var(--text-dim);">(Chương này chưa có nội dung)</em>'}</div>
        </div>
      `).join("");
    }
  }

  buildCleanAudioText() {
    if (!this.currentStory || !this.currentStory.chapters) return "";
    return this.currentStory.chapters.map(ch => {
      const titleLine = this.audioRemoveTitles ? "" : `Chương ${ch.chapterNumber}: ${ch.title}\n\n`;
      const cleaned = normalizeTextForAudio(ch.content || "");
      return titleLine + cleaned;
    }).join("\n\n---\n\n");
  }

  exportTxt() {
    if (!this.currentStory) return;
    const text = this.currentStory.chapters.map(c => `=== CHƯƠNG ${c.chapterNumber}: ${c.title} ===\n\n${c.content}`).join("\n\n\n");
    const filename = `${this.currentStory.title.replace(/[\/\\:*?"<>|]/g, "_")}.txt`;
    this.app.triggerDownload(text, filename, "text/plain;charset=utf-8");
    this.app.showToast(`Đã xuất file: ${filename}`, "success");
  }

  exportMarkdown() {
    if (!this.currentStory) return;
    const md = `# ${this.currentStory.title}\n\n` +
      `> **Tóm tắt:** ${this.currentStory.concept?.premise || ''}\n\n` +
      this.currentStory.chapters.map(c => `## Chương ${c.chapterNumber}: ${c.title}\n\n${c.content}`).join("\n\n---\n\n");
    const filename = `${this.currentStory.title.replace(/[\/\\:*?"<>|]/g, "_")}.md`;
    this.app.triggerDownload(md, filename, "text/markdown;charset=utf-8");
    this.app.showToast(`Đã xuất file: ${filename}`, "success");
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
    this.app.showToast(`Đã xuất file: ${filename}`, "success");
  }

  exportDocx() {
    // Xuất dạng HTML tương thích Word .doc
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

    const btnSubmitTag = document.getElementById("btnSubmitCustomTag");
    const customTagInput = document.getElementById("customTagInput");
    if (btnSubmitTag && customTagInput) {
      btnSubmitTag.addEventListener("click", () => this.addCustomTag(customTagInput.value));
      customTagInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.addCustomTag(customTagInput.value);
        }
      });
    }

    const btnCancelTag = document.getElementById("btnCancelCustomTag");
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

    const btnPauseWriting = document.getElementById("btnPauseWriting");
    if (btnPauseWriting) {
      btnPauseWriting.addEventListener("click", () => this.pauseWriting());
    }

    const btnStopWriting = document.getElementById("btnStopWriting");
    if (btnStopWriting) {
      btnStopWriting.addEventListener("click", () => this.stopWriting());
    }

    // Step 4 Events
    const btnExportTxt = document.getElementById("btnExportTxt");
    if (btnExportTxt) btnExportTxt.addEventListener("click", () => this.exportTxt());

    const btnExportMd = document.getElementById("btnExportMd");
    if (btnExportMd) btnExportMd.addEventListener("click", () => this.exportMarkdown());

    const btnExportHtml = document.getElementById("btnExportHtml");
    if (btnExportHtml) btnExportHtml.addEventListener("click", () => this.exportHtml());

    const btnExportDocx = document.getElementById("btnExportDocx");
    if (btnExportDocx) btnExportDocx.addEventListener("click", () => this.exportDocx());

    const btnExportEpub = document.getElementById("btnExportEpub");
    if (btnExportEpub) btnExportEpub.addEventListener("click", () => this.exportEpub());

    const btnSendAudioPortal = document.querySelector(".card-audio-portal .btn-audio-portal");
    if (btnSendAudioPortal) {
      btnSendAudioPortal.addEventListener("click", (e) => {
        e.preventDefault();
        this.app.sendStoryToAudioStudio();
      });
    }
  }
}
