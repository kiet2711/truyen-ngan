/**
 * AI Novel Studio - Main Application Coordinator & Router
 * Điều phối 3 Không gian làm việc chính:
 * 1. novelController     -> 🎬 Sáng Tác Tiểu Thuyết (4 Bước Kịch Bản)
 * 2. translatorController -> 🌐 Dịch Thuật Studio (Tiểu Thuyết Raw & Phụ Đề .SRT)
 * 3. audioController      -> 🎙️ Tạo Audio Truyện (CapCut TTS Studio Đa Luồng)
 */

import { geminiService } from "./services/geminiService.js";
import { storageService } from "./services/storageService.js";
import { authService } from "./services/authService.js";

import { NovelController } from "./controllers/novelController.js";
import { TranslatorController } from "./controllers/translatorController.js";
import { AudioController } from "./controllers/audioController.js";

class NovelStudioApp {
  constructor() {
    this.currentWorkspace = "novel"; // "novel" | "translator" | "audio"
    this.adminUsers = [];

    // Khởi tạo 3 Controller chuyên trách cho 3 Tab
    this.novelController = new NovelController(this);
    this.translatorController = new TranslatorController(this);
    this.audioController = new AudioController(this);

    this.init();
  }

  async init() {
    this.bindGlobalEvents();
    this.updateApiKeyStatus();
    this.updateQuotaDisplay();
    this.updateSavedCount();

    // Khởi tạo các controllers con
    this.novelController.init();
    this.translatorController.init();
    await this.audioController.init();
    await this.initAuth();

    // Định kỳ cập nhật thanh RPM & đồng hồ đếm ngược reset ngày mỗi 4 giây
    setInterval(() => {
      this.updateQuotaDisplay();
    }, 4000);

    // Lắng nghe sự kiện cập nhật usage từ geminiService/storageService
    window.addEventListener("novel_studio_api_usage_updated", () => {
      this.updateQuotaDisplay();
    });
  }

  // ==================== WORKSPACE SWITCHER ====================

  switchWorkspace(workspaceName) {
    this.currentWorkspace = workspaceName;

    const tabNovel = document.getElementById("tabNavNovelStudio");
    const tabTrans = document.getElementById("tabNavTranslator");
    const tabAudio = document.getElementById("tabNavAudioStudio");
    const novelWorkspace = document.getElementById("novelStudioWorkspace");
    const transWorkspace = document.getElementById("translatorStudioWorkspace");
    const audioWorkspace = document.getElementById("audioStudioWorkspace");

    if (tabNovel) tabNovel.classList.toggle("active", workspaceName === "novel");
    if (tabTrans) tabTrans.classList.toggle("active", workspaceName === "translator");
    if (tabAudio) tabAudio.classList.toggle("active", workspaceName === "audio");

    if (novelWorkspace) novelWorkspace.style.display = workspaceName === "novel" ? "block" : "none";
    if (transWorkspace) transWorkspace.style.display = workspaceName === "translator" ? "block" : "none";
    if (audioWorkspace) audioWorkspace.style.display = workspaceName === "audio" ? "block" : "none";

    if (workspaceName === "translator") {
      this.translatorController.updateTransEstimate();
    } else if (workspaceName === "audio") {
      this.audioController.onAudioTextChanged();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ==================== CROSS-TAB PIPELINES (1-CLICK WORKFLOWS) ====================

  sendStoryToAudioStudio() {
    const cleanText = this.novelController.buildCleanAudioText();
    if (!cleanText || !cleanText.trim()) {
      this.showToast("Chưa có nội dung truyện để gửi sang Audio!", "warning");
      return;
    }
    this.switchWorkspace("audio");
    const audioInput = document.getElementById("audioTextInput");
    if (audioInput) {
      audioInput.value = cleanText;
      this.audioController.onAudioTextChanged();
    }
    this.showToast(`Đã nạp toàn bộ truyện "${this.novelController.currentStory?.title || 'Truyện'}" vào Tab Tạo Audio! ✨`, "success");
  }

  sendTranslatedToAudio() {
    const text = document.getElementById("transResultOutput")?.value || "";
    if (!text || !text.trim()) {
      this.showToast("Chưa có bản dịch để gửi sang Audio!", "warning");
      return;
    }
    this.switchWorkspace("audio");
    const audioInput = document.getElementById("audioTextInput");
    if (audioInput) {
      audioInput.value = text;
      this.audioController.onAudioTextChanged();
    }
    this.showToast("Đã nạp bản dịch vào Tab Tạo Audio! ✨", "success");
  }

  // ==================== GLOBAL UI HELPERS ====================

  showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;
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

  formatTokenCount(num) {
    if (!num || num === 0) return "0";
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "k";
    return num.toLocaleString("vi-VN");
  }

  triggerDownload(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  updateApiKeyStatus() {
    const keys = storageService.getApiKeys();
    const badge = document.getElementById("apiKeyStatusBadge");
    const text = document.getElementById("keyStatusText");
    const activeInfo = geminiService.getCurrentActiveKeyInfo();

    if (keys.length > 0) {
      if (badge) badge.className = "badge badge-emerald";
      if (text) {
        text.textContent = keys.length > 1
          ? `${keys.length} API Keys (Đang dùng Key #${activeInfo?.index || 1})`
          : `1 API Key sẵn sàng`;
      }
    } else {
      if (badge) badge.className = "badge badge-purple";
      if (text) text.textContent = "Chưa có API Key";
    }

    this.updateQuotaDisplay();
  }

  updateQuotaDisplay(forcedModel = null) {
    const modalSelectEl = document.getElementById("modelSelect");
    const activeModelId = forcedModel || (modalSelectEl ? modalSelectEl.value : null);
    const stats = storageService.getApiUsageStats(activeModelId);
    if (!stats) return;

    const activeModel = stats.activeModel;

    // 1. Cập nhật Header Live Badge
    const rpmTextEl = document.getElementById("liveRpmText");
    const rpdTextEl = document.getElementById("liveRpdText");
    const tokensTextEl = document.getElementById("liveTokensText");
    const pulseDot = document.querySelector("#apiQuotaLiveBadge .quota-pulse-dot");

    if (rpmTextEl) rpmTextEl.textContent = `${activeModel.rpm}/${activeModel.rpmLimit} RPM`;
    if (rpdTextEl) rpdTextEl.textContent = `${activeModel.rpd}/${activeModel.rpdLimit} RPD`;
    if (tokensTextEl) tokensTextEl.textContent = `${this.formatTokenCount(activeModel.totalTokens)} Tok`;

    if (pulseDot) {
      const rpmPercent = (activeModel.rpm / activeModel.rpmLimit) * 100;
      const rpdPercent = (activeModel.rpd / activeModel.rpdLimit) * 100;
      pulseDot.className = "quota-pulse-dot";
      if (rpmPercent >= 90 || rpdPercent >= 95) {
        pulseDot.classList.add("danger");
      } else if (rpmPercent >= 60 || rpdPercent >= 75) {
        pulseDot.classList.add("warning");
      }
    }

    // 2. Cập nhật Đồng hồ Reset ngày
    const resetTimerEl = document.getElementById("quotaResetCountdown");
    if (resetTimerEl && stats.resetCountdown) {
      resetTimerEl.innerHTML = `🕒 Reset ngày sau: <strong>${stats.resetCountdown.hours}h ${stats.resetCountdown.minutes}m</strong>`;
    }

    // 3. Render Bảng All Models Dashboard
    const allModelsTableBody = document.getElementById("modalAllModelsTableBody");
    if (allModelsTableBody && stats.allModels) {
      allModelsTableBody.innerHTML = stats.allModels.map(m => {
        const isCurrent = m.modelId === activeModel.modelId;
        const isExhausted = m.rpd >= m.limits.rpd;
        const isWarning = m.rpm >= m.limits.rpm;

        let statusHtml = `<span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-muted); font-size: 10px;">⚪ Sẵn sàng</span>`;
        if (isExhausted) {
          statusHtml = `<span class="badge" style="background: rgba(239,68,68,0.25); color: #f87171; font-size: 10px;">🚫 Cạn RPD</span>`;
        } else if (isWarning) {
          statusHtml = `<span class="badge" style="background: rgba(245,158,11,0.25); color: #fbbf24; font-size: 10px;">⚠️ Chạm RPM</span>`;
        } else if (isCurrent) {
          statusHtml = `<span class="badge badge-emerald" style="font-size: 10px;">🟢 Đang chọn</span>`;
        }

        return `
          <tr style="${isCurrent ? 'background: rgba(139, 92, 246, 0.12);' : ''}">
            <td>
              <strong>${m.name}</strong>
              <div style="font-size: 10px; color: var(--text-dim);">${m.modelId}</div>
            </td>
            <td><strong style="color: #a78bfa;">${m.rpm}</strong> / ${m.limits.rpm}</td>
            <td><strong style="color: #38bdf8;">${m.rpd}</strong> / ${m.limits.rpd}</td>
            <td style="color: #cbd5e1;">${this.formatTokenCount(m.limits.tpm)}</td>
            <td>${statusHtml}</td>
          </tr>
        `;
      }).join("");
    }

    // 4. Hiển thị bảng chi tiết từng Key
    const perKeyContainer = document.getElementById("modalPerKeyContainer");
    const tableBody = document.getElementById("modalPerKeyTableBody");
    const activeKeyIndicator = document.getElementById("modalActiveKeyIndicator");
    const activeKeyInfo = geminiService.getCurrentActiveKeyInfo();

    if (perKeyContainer && tableBody) {
      if (stats.keys && stats.keys.length >= 1) {
        perKeyContainer.style.display = "block";
        if (activeKeyIndicator && activeKeyInfo) {
          activeKeyIndicator.innerHTML = `🟢 Đang phát lệnh bằng: <strong>Key #${activeKeyInfo.index}</strong>`;
        }
        tableBody.innerHTML = stats.keys.map(k => {
          const isActive = activeKeyInfo && k.index === activeKeyInfo.index;
          return `
            <tr style="${isActive ? 'background: rgba(16, 185, 129, 0.08);' : ''}">
              <td>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="font-weight: 700; color: #e2e8f0;">#${k.index}</span>
                  <code>${k.keyMasked}</code>
                </div>
              </td>
              <td>
                ${isActive 
                  ? `<span class="badge badge-emerald" style="font-size: 10px;">🟢 Đang dùng</span>` 
                  : `<span class="badge" style="background: rgba(255,255,255,0.06); color: var(--text-muted); font-size: 10px;">⚪ Chờ xoay tua</span>`
                }
              </td>
              <td><strong style="color: #38bdf8;">${k.rpd}</strong> / ${k.rpdLimit}</td>
              <td><strong style="color: #f472b6;">${this.formatTokenCount(k.totalTokens)}</strong></td>
              <td><strong style="color: #a78bfa;">${k.rpm}</strong> / ${k.rpmLimit}</td>
              <td style="font-size: 10px; color: var(--text-muted);">${k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleTimeString("vi-VN", { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Chưa dùng'}</td>
            </tr>
          `;
        }).join("");
      } else {
        perKeyContainer.style.display = "none";
      }
    }
  }

  async updateSavedCount() {
    const stories = await storageService.getAllStories();
    const count = stories.length;
    const el = document.getElementById("savedStoryCount") || document.getElementById("savedStoriesCount");
    if (el) el.textContent = count;
  }

  async saveCurrentStory() {
    if (!this.novelController.currentStory) return;
    await storageService.saveStory(this.novelController.currentStory);
    if (authService.isLoggedIn()) {
      try {
        await authService.saveUserStory(this.novelController.currentStory);
      } catch (e) {
        console.warn("Cloud story sync error:", e);
      }
    }
    await this.updateSavedCount();
  }

  // ==================== AUTHENTICATION & USER MANAGEMENT ====================

  async initAuth() {
    authService.onAuthChange((user) => this.renderUserHeader(user));

    try {
      const user = await authService.init();
      if (user) {
        // Load cloud custom tags
        const cloudTags = await authService.getUserTags();
        if (cloudTags && cloudTags.length > 0) {
          this.novelController.customTags = cloudTags;
          storageService.saveCustomTags(cloudTags);
          this.novelController.renderTropeCloud();
        }

        // Load cloud stories
        const cloudStories = await authService.getUserStories();
        if (cloudStories && cloudStories.length > 0) {
          for (const s of cloudStories) {
            await storageService.saveStory(s);
          }
          await this.updateSavedCount();
        }

        // Load cloud API settings
        const cloudSettings = await authService.getUserApiSettings();
        if (cloudSettings) {
          if (cloudSettings.keys && cloudSettings.keys.length > 0) {
            storageService.saveApiKeys(cloudSettings.keys);
          }
          if (cloudSettings.settings) {
            storageService.saveSettings(cloudSettings.settings);
          }
          this.updateApiKeyStatus();
        }
      }
    } catch (e) {
      console.warn("Auth initialization error (offline fallback mode):", e);
    }
  }

  renderUserHeader(user) {
    const userContainer = document.getElementById("headerUserSection");
    if (!userContainer) return;

    if (user) {
      const roleBadge = user.role === "admin" 
        ? `<span class="badge badge-pink" style="font-size: 10px; margin-left: 4px;">👑 Quản Trị Viên</span>`
        : `<span class="badge badge-purple" style="font-size: 10px; margin-left: 4px;">Tác Giả</span>`;

      userContainer.innerHTML = `
        <div class="user-profile-badge" id="btnUserMenu" title="Tài khoản: ${user.email}">
          <span class="user-avatar">${user.name ? user.name[0].toUpperCase() : '👤'}</span>
          <span class="user-name">${user.name || user.username}</span>
          ${roleBadge}
        </div>
      `;

      document.getElementById("btnUserMenu")?.addEventListener("click", () => {
        this.openUserProfileModal(user);
      });
    } else {
      userContainer.innerHTML = `
        <button class="btn btn-secondary btn-sm" id="btnHeaderLogin">
          <span>👤</span> Đăng Nhập / Đồng Bộ Cloud
        </button>
      `;

      document.getElementById("btnHeaderLogin")?.addEventListener("click", () => {
        this.openAuthModal();
      });
    }
  }

  openAuthModal(initialTab = "login") {
    const modal = document.getElementById("authModal");
    if (!modal) return;
    modal.classList.add("active");
    this.switchAuthTab(initialTab);
  }

  closeAuthModal() {
    const modal = document.getElementById("authModal");
    if (modal) modal.classList.remove("active");
  }

  switchAuthTab(tab) {
    const tabLogin = document.getElementById("authTabLogin");
    const tabReg = document.getElementById("authTabRegister");
    const formLogin = document.getElementById("authFormLogin");
    const formReg = document.getElementById("authFormRegister");

    if (tab === "register") {
      tabLogin?.classList.remove("active");
      tabReg?.classList.add("active");
      if (formLogin) formLogin.style.display = "none";
      if (formReg) formReg.style.display = "block";
    } else {
      tabLogin?.classList.add("active");
      tabReg?.classList.remove("active");
      if (formLogin) formLogin.style.display = "block";
      if (formReg) formReg.style.display = "none";
    }
  }

  async handleLogin() {
    const email = document.getElementById("loginEmail")?.value?.trim();
    const pass = document.getElementById("loginPassword")?.value;
    const btn = document.getElementById("btnLoginSubmit");
    const errEl = document.getElementById("authErrorMsg");

    if (!email || !pass) {
      if (errEl) errEl.textContent = "Vui lòng nhập đầy đủ email và mật khẩu!";
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="typing-cursor"></span> Đang đăng nhập...`;
    }
    if (errEl) errEl.textContent = "";

    try {
      const user = await authService.login(email, pass);
      this.showToast(`Chào mừng bạn trở lại, ${user.name || user.username}! 🌟`, "success");
      this.closeAuthModal();
      await this.initAuth();
    } catch (err) {
      if (errEl) errEl.textContent = err.message || "Đăng nhập thất bại!";
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `Đăng Nhập Ngay`;
      }
    }
  }

  async handleRegister() {
    const name = document.getElementById("regName")?.value?.trim();
    const username = document.getElementById("regUsername")?.value?.trim();
    const email = document.getElementById("regEmail")?.value?.trim();
    const pass = document.getElementById("regPassword")?.value;
    const passConfirm = document.getElementById("regPasswordConfirm")?.value;
    const btn = document.getElementById("btnRegisterSubmit");
    const errEl = document.getElementById("authErrorMsg");

    if (!username || !email || !pass) {
      if (errEl) errEl.textContent = "Vui lòng điền đầy đủ các thông tin bắt buộc!";
      return;
    }

    if (pass !== passConfirm) {
      if (errEl) errEl.textContent = "Mật khẩu xác nhận không khớp!";
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="typing-cursor"></span> Đang tạo tài khoản...`;
    }
    if (errEl) errEl.textContent = "";

    try {
      const user = await authService.register({ username, email, password: pass, name });
      this.showToast(`Chúc mừng ${user.name || user.username} đã đăng ký tài khoản thành công! 🎉`, "success");
      this.closeAuthModal();
      await this.initAuth();
    } catch (err) {
      if (errEl) errEl.textContent = err.message || "Đăng ký thất bại!";
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `Hoàn Tất Đăng Ký`;
      }
    }
  }

  openUserProfileModal(user) {
    const modal = document.getElementById("userProfileModal");
    if (!modal) return;

    const nameEl = document.getElementById("profileUserName");
    const emailEl = document.getElementById("profileUserEmail");
    const roleEl = document.getElementById("profileUserRole");
    const adminBtn = document.getElementById("btnOpenAdminPanel");

    if (nameEl) nameEl.textContent = user.name || user.username;
    if (emailEl) emailEl.textContent = user.email;
    if (roleEl) roleEl.textContent = user.role === "admin" ? "Quản Trị Viên Hệ Thống" : "Tác Giả";

    if (adminBtn) {
      adminBtn.style.display = user.role === "admin" ? "inline-flex" : "none";
    }

    modal.classList.add("active");
  }

  closeUserProfileModal() {
    const modal = document.getElementById("userProfileModal");
    if (modal) modal.classList.remove("active");
  }

  async openAdminPanelModal() {
    this.closeUserProfileModal();
    const modal = document.getElementById("adminPanelModal");
    if (!modal) return;
    modal.classList.add("active");
    await this.loadAdminUsersList();
  }

  closeAdminPanelModal() {
    const modal = document.getElementById("adminPanelModal");
    if (modal) modal.classList.remove("active");
  }

  async loadAdminUsersList() {
    const tbody = document.getElementById("adminUserTableBody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--text-dim);"><span class="typing-cursor"></span> Đang tải danh sách người dùng từ Neon DB...</td></tr>`;

    try {
      this.adminUsers = await authService.getAdminUsersList();
      if (this.adminUsers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--text-dim);">Chưa có người dùng nào</td></tr>`;
        return;
      }

      tbody.innerHTML = this.adminUsers.map(u => `
        <tr>
          <td><strong>#${u.id}</strong></td>
          <td>${u.name || u.username}</td>
          <td><code>${u.email}</code></td>
          <td><span class="badge ${u.role === 'admin' ? 'badge-pink' : 'badge-purple'}">${u.role}</span></td>
          <td style="font-size: 11px; color: var(--text-dim);">${new Date(u.created_at).toLocaleDateString("vi-VN")}</td>
          <td>
            ${u.role !== 'admin' ? `
              <button class="btn btn-secondary btn-xs btn-change-role" data-uid="${u.id}" data-role="${u.role}">
                Đổi thành Admin
              </button>
            ` : `<span style="font-size: 11px; color: var(--accent-emerald);">Tối cao</span>`}
          </td>
        </tr>
      `).join("");

      tbody.querySelectorAll(".btn-change-role").forEach(btn => {
        btn.addEventListener("click", async (e) => {
          const uid = e.target.getAttribute("data-uid");
          const curRole = e.target.getAttribute("data-role");
          const nextRole = curRole === "admin" ? "user" : "admin";
          if (confirm(`Bạn có chắc muốn nâng cấp người dùng #${uid} thành ${nextRole}?`)) {
            await authService.updateUserRole(uid, nextRole);
            this.showToast("Đã cập nhật quyền thành công!", "success");
            await this.loadAdminUsersList();
          }
        });
      });

    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--accent-rose);">✕ Lỗi: ${err.message}</td></tr>`;
    }
  }

  // ==================== API SETTINGS & STORY LIBRARY MODALS ====================

  openApiSettingsModal() {
    const modal = document.getElementById("apiSettingsModal");
    const input = document.getElementById("apiKeysInput");
    const throttleInput = document.getElementById("throttleDelayInput");
    const chapterTempInput = document.getElementById("chapterTempInput");
    const modelSelect = document.getElementById("modelSelect");

    if (modal) {
      const keys = storageService.getApiKeys();
      const settings = storageService.getSettings();

      if (input) input.value = keys.join("\n");
      if (throttleInput) throttleInput.value = settings.delayBetweenChapters || 3500;
      if (chapterTempInput) chapterTempInput.value = settings.temperatureChapter || 0.8;
      if (modelSelect) modelSelect.value = settings.model || "gemini-3.6-flash";

      modal.classList.add("active");
      this.updateQuotaDisplay(modelSelect?.value);
    }
  }

  closeApiSettingsModal() {
    const modal = document.getElementById("apiSettingsModal");
    if (modal) modal.classList.remove("active");
  }

  async saveApiSettings() {
    const rawKeys = document.getElementById("apiKeysInput").value;
    const keys = rawKeys.split("\n").map(k => k.trim()).filter(Boolean);
    storageService.saveApiKeys(keys);

    const settings = {
      model: document.getElementById("modelSelect").value,
      delayBetweenChapters: parseInt(document.getElementById("throttleDelayInput").value, 10) || 3500,
      temperatureChapter: parseFloat(document.getElementById("chapterTempInput").value) || 0.8
    };
    storageService.saveSettings(settings);

    if (authService.isLoggedIn()) {
      await authService.saveUserApiSettings(keys, settings);
      this.showToast("Đã lưu và đồng bộ API Key lên tài khoản Neon Cloud! ☁️", "success");
    } else {
      this.showToast("Đã lưu cấu hình API thành công!", "success");
    }

    this.updateApiKeyStatus();
    this.closeApiSettingsModal();
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

  async openStoryLibraryModal() {
    const modal = document.getElementById("storyLibraryModal");
    const container = document.getElementById("libraryStoriesList");
    if (!modal || !container) return;

    modal.classList.add("active");
    container.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-dim);"><span class="typing-cursor"></span> Đang tải danh sách tác phẩm...</div>`;

    const stories = await storageService.getAllStories();
    if (stories.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-dim);">
          <div style="font-size: 32px; margin-bottom: 8px;">📚</div>
          <div>Thư viện chưa có tác phẩm nào. Hãy tạo câu chuyện đầu tiên của bạn ở Bước 1!</div>
        </div>
      `;
      return;
    }

    container.innerHTML = "";
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
        this.novelController.currentStory = story;
        this.closeStoryLibraryModal();
        this.novelController.renderReaderMode();
        this.novelController.goToStep(4);
        this.switchWorkspace("novel");
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

  closeStoryLibraryModal() {
    const modal = document.getElementById("storyLibraryModal");
    if (modal) modal.classList.remove("active");
  }

  // ==================== GLOBAL EVENT BINDINGS ====================

  bindGlobalEvents() {
    // 1. Workspace Tabs
    const tabNovel = document.getElementById("tabNavNovelStudio");
    const tabTrans = document.getElementById("tabNavTranslator");
    const tabAudio = document.getElementById("tabNavAudioStudio");
    if (tabNovel) tabNovel.addEventListener("click", () => this.switchWorkspace("novel"));
    if (tabTrans) tabTrans.addEventListener("click", () => this.switchWorkspace("translator"));
    if (tabAudio) tabAudio.addEventListener("click", () => this.switchWorkspace("audio"));

    const btnHeaderAudio = document.getElementById("btnHeaderAudioPortal");
    if (btnHeaderAudio) {
      btnHeaderAudio.addEventListener("click", (e) => {
        e.preventDefault();
        this.switchWorkspace("audio");
      });
    }

    // 2. Modals Triggers
    const btnOpenSettings = document.getElementById("btnOpenApiSettings");
    const btnCloseSettings = document.getElementById("btnCloseApiSettings");
    const btnSaveSettings = document.getElementById("btnSaveApiSettings");
    const btnTestKey = document.getElementById("btnTestApiKey");
    const modelSelect = document.getElementById("modelSelect");

    if (btnOpenSettings) btnOpenSettings.addEventListener("click", () => this.openApiSettingsModal());
    if (btnCloseSettings) btnCloseSettings.addEventListener("click", () => this.closeApiSettingsModal());
    if (btnSaveSettings) btnSaveSettings.addEventListener("click", () => this.saveApiSettings());
    if (btnTestKey) btnTestKey.addEventListener("click", () => this.testApiKeyConnection());

    if (modelSelect) {
      modelSelect.addEventListener("change", (e) => {
        this.updateQuotaDisplay(e.target.value);
      });
    }

    const liveBadge = document.getElementById("apiQuotaLiveBadge");
    if (liveBadge) liveBadge.addEventListener("click", () => this.openApiSettingsModal());

    const btnClearStats = document.getElementById("btnClearApiStats");
    if (btnClearStats) {
      btnClearStats.addEventListener("click", () => {
        if (confirm("Bạn có chắc muốn reset toàn bộ bộ đếm token và request của các Key về 0?")) {
          storageService.resetApiStats();
          this.updateQuotaDisplay();
          this.showToast("Đã reset thống kê hạn mức API!", "success");
        }
      });
    }

    const btnOpenLib = document.getElementById("btnOpenStoryLibrary");
    const btnCloseLib = document.getElementById("btnCloseStoryLibrary");
    if (btnOpenLib) btnOpenLib.addEventListener("click", () => this.openStoryLibraryModal());
    if (btnCloseLib) btnCloseLib.addEventListener("click", () => this.closeStoryLibraryModal());

    // Auth Modal Triggers
    const btnCloseAuth = document.getElementById("btnCloseAuthModal");
    const tabLogin = document.getElementById("authTabLogin");
    const tabReg = document.getElementById("authTabRegister");
    const btnLoginSubmit = document.getElementById("btnLoginSubmit");
    const btnRegSubmit = document.getElementById("btnRegisterSubmit");

    if (btnCloseAuth) btnCloseAuth.addEventListener("click", () => this.closeAuthModal());
    if (tabLogin) tabLogin.addEventListener("click", () => this.switchAuthTab("login"));
    if (tabReg) tabReg.addEventListener("click", () => this.switchAuthTab("register"));
    if (btnLoginSubmit) btnLoginSubmit.addEventListener("click", () => this.handleLogin());
    if (btnRegSubmit) btnRegSubmit.addEventListener("click", () => this.handleRegister());

    // Profile Modal Triggers
    const btnCloseProfile = document.getElementById("btnCloseProfileModal");
    const btnLogout = document.getElementById("btnLogout");
    const btnOpenAdmin = document.getElementById("btnOpenAdminPanel");
    const btnCloseAdmin = document.getElementById("btnCloseAdminPanel");

    if (btnCloseProfile) btnCloseProfile.addEventListener("click", () => this.closeUserProfileModal());
    if (btnLogout) {
      btnLogout.addEventListener("click", () => {
        authService.logout();
        this.closeUserProfileModal();
        this.showToast("Đã đăng xuất tài khoản.", "info");
      });
    }

    if (btnOpenAdmin) btnOpenAdmin.addEventListener("click", () => this.openAdminPanelModal());
    if (btnCloseAdmin) btnCloseAdmin.addEventListener("click", () => this.closeAdminPanelModal());
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.novelStudio = new NovelStudioApp();
});
