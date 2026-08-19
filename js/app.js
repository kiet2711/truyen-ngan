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
    this.adminStories = [];

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
    const el = document.getElementById("savedStoryCount");
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
        // 1. Load cloud custom tags
        const cloudTags = await authService.fetchUserTags();
        if (cloudTags && Array.isArray(cloudTags)) {
          this.novelController.customTags = cloudTags;
          storageService.saveCustomTags(cloudTags);
          this.novelController.renderTropeCloud();
        }

        // 2. Load cloud API settings & Token Usage
        await this.syncUserApiSettingsFromCloud();

        // 3. Load cloud stories to library
        await this.syncUserStoriesFromCloud();
      }
    } catch (err) {
      this.showToast(err.message, "error");
    }
  }

  async syncUserApiSettingsFromCloud() {
    if (!authService.isLoggedIn()) return;
    try {
      const cloudData = await authService.fetchUserApiSettings();
      if (cloudData) {
        if (Array.isArray(cloudData.api_keys) && cloudData.api_keys.length > 0) {
          storageService.saveApiKeys(cloudData.api_keys);
        }
        if (cloudData.settings && typeof cloudData.settings === 'object' && Object.keys(cloudData.settings).length > 0) {
          storageService.saveSettings(cloudData.settings);
        }
        if (cloudData.api_usage && typeof cloudData.api_usage === 'object') {
          storageService.mergeApiUsageData(cloudData.api_usage);
        }
        this.updateApiKeyStatus();
        this.updateQuotaDisplay();
      }
    } catch (e) {
      console.warn("Sync API settings error:", e);
    }
  }

  async syncUserStoriesFromCloud() {
    if (!authService.isLoggedIn()) return;
    try {
      const cloudStories = await authService.fetchUserStories();
      if (Array.isArray(cloudStories) && cloudStories.length > 0) {
        for (const story of cloudStories) {
          await storageService.saveStory(story);
        }
        await this.updateSavedCount();
      }
    } catch (e) {
      console.warn("Sync user stories error:", e);
    }
  }

  renderUserHeader(user) {
    const btnOpenAuth = document.getElementById("btnOpenAuth");
    const userProfileWidget = document.getElementById("userProfileWidget");
    const headerUsername = document.getElementById("headerUsername");
    const headerUserRoleBadge = document.getElementById("headerUserRoleBadge");
    const dropdownUsername = document.getElementById("dropdownUsername");
    const dropdownUserEmail = document.getElementById("dropdownUserEmail");
    const btnOpenAdminPanel = document.getElementById("btnOpenAdminPanel");

    if (user) {
      if (btnOpenAuth) btnOpenAuth.style.display = "none";
      if (userProfileWidget) userProfileWidget.style.display = "block";

      if (headerUsername) headerUsername.textContent = user.username;
      if (dropdownUsername) dropdownUsername.textContent = user.username;
      if (dropdownUserEmail) dropdownUserEmail.textContent = user.email;

      if (headerUserRoleBadge) {
        if (user.role === "admin") {
          headerUserRoleBadge.className = "badge badge-purple role-pill";
          headerUserRoleBadge.textContent = "👑 ADMIN";
        } else {
          headerUserRoleBadge.className = "badge badge-emerald role-pill";
          headerUserRoleBadge.textContent = "MEMBER";
        }
      }

      if (btnOpenAdminPanel) {
        btnOpenAdminPanel.style.display = user.role === "admin" ? "flex" : "none";
      }
    } else {
      if (btnOpenAuth) btnOpenAuth.style.display = "inline-flex";
      if (userProfileWidget) userProfileWidget.style.display = "none";
      const dropdown = document.getElementById("userDropdownMenu");
      if (dropdown) dropdown.style.display = "none";
    }
  }

  openAuthModal(tab = "login") {
    const modal = document.getElementById("authModal");
    const alertBox = document.getElementById("authAlertBox");
    if (alertBox) {
      alertBox.style.display = "none";
      alertBox.textContent = "";
    }
    this.switchAuthTab(tab);
    if (modal) modal.classList.add("open");
  }

  closeAuthModal() {
    const modal = document.getElementById("authModal");
    if (modal) modal.classList.remove("open");
  }

  switchAuthTab(tab) {
    const tabLogin = document.getElementById("tabAuthLogin");
    const tabRegister = document.getElementById("tabAuthRegister");
    const formLogin = document.getElementById("loginForm");
    const formRegister = document.getElementById("registerForm");
    const title = document.getElementById("authModalTitle");
    const alertBox = document.getElementById("authAlertBox");

    if (alertBox) {
      alertBox.style.display = "none";
      alertBox.textContent = "";
    }

    if (tab === "register") {
      tabLogin?.classList.remove("active");
      tabRegister?.classList.add("active");
      if (formLogin) formLogin.style.display = "none";
      if (formRegister) formRegister.style.display = "block";
      if (title) title.textContent = "✨ Tạo Tài Khoản Mới";
    } else {
      tabLogin?.classList.add("active");
      tabRegister?.classList.remove("active");
      if (formLogin) formLogin.style.display = "block";
      if (formRegister) formRegister.style.display = "none";
      if (title) title.textContent = "🔐 Đăng Nhập Tài Khoản";
    }
  }

  async handleLogin(e) {
    e.preventDefault();
    const identifier = document.getElementById("loginIdentifier").value.trim();
    const password = document.getElementById("loginPassword").value;
    const btn = document.getElementById("btnLoginSubmit");
    const alertBox = document.getElementById("authAlertBox");

    btn.disabled = true;
    btn.innerHTML = `<span class="typing-cursor"></span> Đang đăng nhập...`;

    try {
      const user = await authService.login(identifier, password);
      this.showToast(`Chào mừng bạn trở lại, ${user.username}! 🎉`, "success");
      this.closeAuthModal();

      // Đồng bộ tags, settings, token usage và thư viện truyện từ Neon Cloud
      const cloudTags = await authService.fetchUserTags();
      if (cloudTags && Array.isArray(cloudTags) && cloudTags.length > 0) {
        this.novelController.customTags = cloudTags;
        storageService.saveCustomTags(cloudTags);
        this.novelController.renderTropeCloud();
      }
      await this.syncUserApiSettingsFromCloud();
      await this.syncUserStoriesFromCloud();

    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message;
        alertBox.style.display = "block";
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = `🚀 Đăng Nhập`;
    }
  }

  async handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById("regUsername").value.trim();
    const email = document.getElementById("regEmail").value.trim();
    const password = document.getElementById("regPassword").value;
    const confirm = document.getElementById("regPasswordConfirm").value;
    const btn = document.getElementById("btnRegisterSubmit");
    const alertBox = document.getElementById("authAlertBox");

    if (password !== confirm) {
      if (alertBox) {
        alertBox.textContent = "Mật khẩu xác nhận không khớp!";
        alertBox.style.display = "block";
      }
      return;
    }

    btn.disabled = true;
    btn.innerHTML = `<span class="typing-cursor"></span> Đang tạo tài khoản...`;

    try {
      const user = await authService.register(username, email, password);
      this.showToast(`Chào mừng thành viên mới: ${user.username}! 🌟`, "success");
      this.closeAuthModal();

      // Tự động sao lưu cấu hình API, Tags và Truyện hiện tại lên tài khoản mới
      await authService.saveUserTags(storageService.getCustomTags());
      await authService.saveUserApiSettings(storageService.getApiKeys(), storageService.getSettings(), storageService.getRawApiUsageData());
      const localStories = await storageService.getAllStories();
      for (const st of localStories) {
        await authService.saveUserStory(st);
      }
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message;
        alertBox.style.display = "block";
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = `✨ Tạo Tài Khoản Ngay`;
    }
  }

  // ==================== ADMIN MANAGEMENT ====================

  async openAdminModal() {
    if (!authService.isAdmin()) {
      this.showToast("Bạn không có quyền truy cập trang Quản trị Admin!", "error");
      return;
    }

    document.getElementById("adminModal").classList.add("open");
    await this.loadAdminData();
  }

  closeAdminModal() {
    document.getElementById("adminModal").classList.remove("open");
  }

  switchAdminTab(tab) {
    const tabUsers = document.getElementById("tabAdminUsers");
    const tabStories = document.getElementById("tabAdminStories");
    const viewUsers = document.getElementById("adminViewUsers");
    const viewStories = document.getElementById("adminViewStories");

    if (tab === "stories") {
      tabUsers?.classList.remove("active");
      tabStories?.classList.add("active");
      if (viewUsers) viewUsers.style.display = "none";
      if (viewStories) viewStories.style.display = "block";
    } else {
      tabUsers?.classList.add("active");
      tabStories?.classList.remove("active");
      if (viewUsers) viewUsers.style.display = "block";
      if (viewStories) viewStories.style.display = "none";
    }
  }

  async loadAdminData() {
    const tableBody = document.getElementById("adminUsersTableBody");
    const storiesContainer = document.getElementById("adminStoriesListContainer");
    if (tableBody) tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px;"><span class="typing-cursor"></span> Đang tải dữ liệu từ Neon DB...</td></tr>`;
    if (storiesContainer) storiesContainer.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-dim);"><span class="typing-cursor"></span> Đang tải danh sách truyện...</div>`;

    try {
      const stats = await authService.adminGetStats();
      if (stats) {
        document.getElementById("statTotalUsers").textContent = stats.totalUsers || 0;
        document.getElementById("statActiveUsers").textContent = stats.activeUsers || 0;
        document.getElementById("statBannedUsers").textContent = stats.bannedUsers || 0;
        document.getElementById("statTotalStories").textContent = stats.totalStories || 0;
      }

      // Load Users & Stories
      this.adminUsers = await authService.adminGetUsers();
      this.adminStories = await authService.adminGetAllStories();

      const totalStories = this.adminStories.length;
      const totalStoriesBadge = document.getElementById("adminTotalStoryBadge");
      if (totalStoriesBadge) totalStoriesBadge.textContent = totalStories;
      const statTotalStories = document.getElementById("statTotalStories");
      if (statTotalStories) statTotalStories.textContent = totalStories;

      this.renderAdminUsersTable(this.adminUsers);
      this.renderAdminStoriesList(this.adminStories);
    } catch (err) {
      console.error(err);
      if (tableBody) tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--accent-rose); padding: 20px;">Lỗi tải dữ liệu: ${err.message}</td></tr>`;
      this.showToast(`Lỗi admin: ${err.message}`, "error");
    }
  }

  renderAdminUsersTable(users) {
    const tableBody = document.getElementById("adminUsersTableBody");
    if (!tableBody) return;
    tableBody.innerHTML = "";

    if (!users || users.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 24px;">Không tìm thấy người dùng nào.</td></tr>`;
      return;
    }

    users.forEach(user => {
      const tr = document.createElement("tr");

      const isCurrentLoggedIn = authService.currentUser?.id === user.id;
      const roleBadge = user.role === "admin"
        ? `<span class="badge badge-purple" style="font-size: 11px;">👑 ADMIN</span>`
        : `<span class="badge badge-emerald" style="font-size: 11px;">USER</span>`;

      const statusBadge = user.is_banned
        ? `<span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #f87171; font-size: 11px;">🚫 ĐÃ KHÓA</span>`
        : `<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399; font-size: 11px;">🟢 BÌNH THƯỜNG</span>`;

      const storyCount = user.story_count || 0;
      const storyCountHtml = storyCount > 0
        ? `<button class="btn btn-secondary btn-xs btn-view-user-stories" data-user-id="${user.id}" data-username="${user.username}" title="Xem truyện của tác giả này" style="color: var(--accent-pink); font-weight: 700;">
             📖 ${storyCount} truyện
           </button>`
        : `<span style="color: var(--text-dim); font-size: 12px;">0</span>`;

      tr.innerHTML = `
        <td><span style="color: var(--text-dim); font-family: monospace;">#${user.id}</span></td>
        <td><strong>${user.username}</strong> ${isCurrentLoggedIn ? '<span style="font-size: 10px; color: var(--accent-pink);">(Bạn)</span>' : ''}</td>
        <td style="color: var(--text-main); font-size: 12px;">${user.email}</td>
        <td>${roleBadge}</td>
        <td><span class="badge" style="background: rgba(255,255,255,0.06);">${(user.custom_tags || []).length} tags</span></td>
        <td>${storyCountHtml}</td>
        <td>${statusBadge}</td>
        <td style="text-align: right;">
          <div style="display: flex; gap: 6px; justify-content: flex-end;">
            ${!isCurrentLoggedIn ? `
              <button class="btn btn-secondary btn-xs btn-toggle-role" data-id="${user.id}" data-role="${user.role}">
                ${user.role === 'admin' ? 'Hạ Quyền User' : '⭐ Thăng Admin'}
              </button>
              <button class="btn ${user.is_banned ? 'btn-success' : 'btn-danger'} btn-xs btn-toggle-ban" data-id="${user.id}" data-banned="${user.is_banned}">
                ${user.is_banned ? '🔓 Mở Khóa' : '🚫 Khóa'}
              </button>
            ` : '<span style="font-size: 11px; color: var(--text-dim);">Đang dùng</span>'}
          </div>
        </td>
      `;

      // Event listeners for action buttons
      const btnToggleRole = tr.querySelector(".btn-toggle-role");
      if (btnToggleRole) {
        btnToggleRole.addEventListener("click", async () => {
          const newRole = user.role === "admin" ? "user" : "admin";
          if (confirm(`Bạn có chắc muốn đổi quyền của "${user.username}" thành "${newRole.toUpperCase()}"?`)) {
            try {
              await authService.adminUpdateUserRole(user.id, newRole);
              this.showToast(`Đã cập nhật quyền cho ${user.username}!`, "success");
              await this.loadAdminData();
            } catch (e) {
              this.showToast(e.message, "error");
            }
          }
        });
      }

      const btnToggleBan = tr.querySelector(".btn-toggle-ban");
      if (btnToggleBan) {
        btnToggleBan.addEventListener("click", async () => {
          const newStatus = !user.is_banned;
          const actionText = newStatus ? "KHÓA TÀI KHOẢN" : "MỞ KHÓA TÀI KHOẢN";
          if (confirm(`Bạn có chắc muốn ${actionText} của "${user.username}"?`)) {
            try {
              await authService.adminUpdateUserStatus(user.id, newStatus);
              this.showToast(`Đã ${actionText.toLowerCase()} ${user.username}!`, "success");
              await this.loadAdminData();
            } catch (e) {
              this.showToast(e.message, "error");
            }
          }
        });
      }

      const btnViewStories = tr.querySelector(".btn-view-user-stories");
      if (btnViewStories) {
        btnViewStories.addEventListener("click", () => {
          const filterBadge = document.getElementById("adminStoriesAuthorFilterBadge");
          const filterName = document.getElementById("adminFilterAuthorName");
          if (filterBadge && filterName) {
            filterName.textContent = `${user.username} (#${user.id})`;
            filterBadge.style.display = "flex";
          }
          this.switchAdminTab("stories");
          const userStories = this.adminStories.filter(s => s.user_id === user.id);
          this.renderAdminStoriesList(userStories);
        });
      }

      tableBody.appendChild(tr);
    });
  }

  filterAdminUsers(query) {
    const q = query.toLowerCase().trim();
    if (!q) {
      this.renderAdminUsersTable(this.adminUsers);
      return;
    }
    const filtered = this.adminUsers.filter(u =>
      u.username.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      String(u.id).includes(q)
    );
    this.renderAdminUsersTable(filtered);
  }

  renderAdminStoriesList(stories) {
    const container = document.getElementById("adminStoriesListContainer");
    if (!container) return;
    container.innerHTML = "";

    if (!stories || stories.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 32px; color: var(--text-dim);">Không có tác phẩm nào phù hợp.</div>`;
      return;
    }

    stories.forEach(story => {
      const card = document.createElement("div");
      card.className = "studio-card";
      card.style.padding = "16px";
      card.style.background = "rgba(15, 23, 42, 0.6)";

      const totalWords = story.chapters?.reduce((sum, c) => sum + (c.wordCount || 0), 0) || 0;
      const completedCount = story.chapters?.filter(c => c.status === "completed").length || 0;
      const totalChapters = story.chapters?.length || 0;

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <strong style="font-size: 16px; color: #fff;">${story.title || 'Truyện Không Tên'}</strong>
              <span class="badge badge-purple" style="font-size: 11px;">✍️ Tác giả: <strong>${story.author_username || 'Tác giả #' + story.user_id}</strong></span>
              <span class="badge badge-pink" style="font-size: 10px;">${story.params?.tone || 'Zhihu High Drama'}</span>
            </div>
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
              ${story.concept?.premise || 'Chưa có tóm tắt cốt truyện.'}
            </div>
            <div style="display: flex; gap: 12px; align-items: center; margin-top: 8px; font-size: 11.5px; color: var(--text-dim);">
              <span>📅 ${new Date(story.created_at || story.createdAt).toLocaleString("vi-VN")}</span>
              <span>•</span>
              <span>📝 ${totalChapters} chương (${completedCount} xong)</span>
              <span>•</span>
              <span style="color: var(--accent-emerald); font-weight: 600;">⚡ ${totalWords.toLocaleString()} từ</span>
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-primary btn-sm btn-admin-read-story" title="Đọc tác phẩm này">
              📖 Đọc Truyện
            </button>
          </div>
        </div>
      `;

      card.querySelector(".btn-admin-read-story").addEventListener("click", () => {
        this.novelController.currentStory = story;
        this.closeAdminModal();
        this.switchWorkspace("novel");
        this.novelController.setupStep4View();
        this.novelController.goToStep(4);
        this.showToast(`Đang mở tác phẩm: "${story.title}" của ${story.author_username}`, "info");
      });

      container.appendChild(card);
    });
  }

  filterAdminStories(query) {
    const q = query.toLowerCase().trim();
    if (!q) {
      this.renderAdminStoriesList(this.adminStories);
      return;
    }
    const filtered = this.adminStories.filter(s =>
      (s.title || "").toLowerCase().includes(q) ||
      (s.author_username || "").toLowerCase().includes(q) ||
      (s.concept?.premise || "").toLowerCase().includes(q)
    );
    this.renderAdminStoriesList(filtered);
  }

  // ==================== API SETTINGS & STORY LIBRARY MODALS ====================

  openApiSettingsModal() {
    const keys = storageService.getApiKeys();
    const settings = storageService.getSettings();

    document.getElementById("apiKeysInput").value = keys.join("\n");
    document.getElementById("modelSelect").value = settings.model || "gemini-3.6-flash";
    document.getElementById("throttleDelayInput").value = settings.delayBetweenChapters || 3500;
    document.getElementById("chapterTempInput").value = settings.temperatureChapter || 0.8;
    document.getElementById("apiTestResult").textContent = "";

    this.updateQuotaDisplay();
    document.getElementById("apiSettingsModal").classList.add("open");
  }

  closeApiSettingsModal() {
    document.getElementById("apiSettingsModal").classList.remove("open");
  }

  clearApiUsageStats() {
    if (confirm("Bạn có chắc chắn muốn đặt lại bộ đếm token và request về 0 không?")) {
      storageService.clearApiUsageStats();
      this.updateQuotaDisplay();
      this.showToast("Đã đặt lại toàn bộ thống kê API!", "info");
    }
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
      await authService.saveUserApiSettings(keys, settings, storageService.getRawApiUsageData());
      this.showToast("Đã lưu và đồng bộ API Key & Thống kê Token lên tài khoản Neon Cloud! ☁️", "success");
    } else {
      this.showToast("Đã lưu cấu hình API Key vào máy!", "success");
    }

    this.updateApiKeyStatus();
    this.closeApiSettingsModal();
  }

  async testApiKeyConnection() {
    const rawKeys = document.getElementById("apiKeysInput").value;
    const keys = rawKeys.split("\n").map(k => k.trim()).filter(Boolean);
    const resultEl = document.getElementById("apiTestResult");
    const btn = document.getElementById("btnTestApiKey");

    if (keys.length === 0) {
      resultEl.innerHTML = `<span style="color: var(--accent-rose);">✕ Vui lòng nhập ít nhất một API key để test!</span>`;
      return;
    }

    btn.disabled = true;
    btn.textContent = "Đang kiểm tra...";
    resultEl.innerHTML = `<span style="color: var(--text-dim);"><span class="typing-cursor"></span> Đang gửi tín hiệu kiểm tra tới Gemini API...</span>`;

    const modelId = document.getElementById("modelSelect").value || "gemini-3.6-flash";
    const originalKeys = storageService.getApiKeys();
    storageService.saveApiKeys(keys);

    try {
      const isOk = await geminiService.testKey(keys[0], modelId);
      if (isOk) {
        resultEl.innerHTML = `<span style="color: var(--accent-emerald);">✓ Kết nối Gemini API (${modelId}) thành công và hợp lệ!</span>`;
      } else {
        resultEl.innerHTML = `<span style="color: var(--accent-rose);">✕ API Key không hợp lệ hoặc model không khả dụng.</span>`;
      }
    } catch (e) {
      resultEl.innerHTML = `<span style="color: var(--accent-rose);">✕ Lỗi kết nối: ${e.message}</span>`;
    } finally {
      storageService.saveApiKeys(originalKeys);
      btn.disabled = false;
      btn.textContent = "🔍 Test Kết Nối";
    }
  }

  async openStoryLibraryModal() {
    if (authService.isLoggedIn()) {
      await this.syncUserStoriesFromCloud();
    }
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
    if (!container) return;
    container.innerHTML = "";

    // Render Cloud Sync status banner
    const syncBanner = document.createElement("div");
    if (authService.isLoggedIn()) {
      syncBanner.style.cssText = "margin-bottom: 14px; padding: 10px 14px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 8px; font-size: 12px; color: var(--accent-emerald); display: flex; align-items: center; justify-content: space-between;";
      syncBanner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span>☁️</span>
          <span>Đã kết nối tài khoản Neon Cloud (<strong>${authService.currentUser.username}</strong>). Truyện được sao lưu vĩnh viễn.</span>
        </div>
        <span class="badge badge-emerald" style="font-size: 10px;">${stories.length} Truyện</span>
      `;
    } else {
      syncBanner.style.cssText = "margin-bottom: 14px; padding: 10px 14px; background: rgba(236, 72, 153, 0.1); border: 1px solid rgba(236, 72, 153, 0.25); border-radius: 8px; font-size: 12px; color: var(--accent-pink); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;";
      syncBanner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span>💡</span>
          <span>Đăng nhập tài khoản để tự động sao lưu truyện vĩnh viễn lên cơ sở dữ liệu Neon Cloud!</span>
        </div>
        <button class="btn btn-secondary btn-xs" id="btnLibraryLoginShortcut" style="font-size: 11px;">Đăng Nhập Ngay</button>
      `;
    }
    container.appendChild(syncBanner);

    const btnLoginShortcut = syncBanner.querySelector("#btnLibraryLoginShortcut");
    if (btnLoginShortcut) {
      btnLoginShortcut.addEventListener("click", () => {
        this.closeStoryLibraryModal();
        this.openAuthModal("login");
      });
    }

    if (stories.length === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.style.cssText = "text-align: center; color: var(--text-muted); padding: 24px;";
      emptyMsg.textContent = "Chưa có truyện nào trong thư viện.";
      container.appendChild(emptyMsg);
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
            <div style="display: flex; align-items: center; gap: 8px;">
              <strong style="font-size: 16px;">${story.title}</strong>
              <span class="badge badge-pink" style="font-size: 10px;">${story.params?.selectedTone || story.params?.tone || 'Zhihu Drama'}</span>
            </div>
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
              ${story.concept?.premise || story.logline || 'Chưa có tóm tắt'}
            </div>
            <div style="display: flex; gap: 12px; align-items: center; margin-top: 8px; font-size: 11.5px; color: var(--text-dim);">
              <span>${new Date(story.createdAt).toLocaleDateString("vi-VN")}</span>
              <span>•</span>
              <span>${totalChapters} chương (${completedCount} xong)</span>
              <span>•</span>
              <span style="color: var(--accent-emerald); font-weight: 600;">${totalWords.toLocaleString()} từ</span>
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-primary btn-sm btn-load-story">Mở Đọc</button>
            <button class="btn btn-danger btn-xs btn-delete-story" title="Xóa truyện này">&times;</button>
          </div>
        </div>
      `;

      card.querySelector(".btn-load-story").addEventListener("click", () => {
        this.novelController.currentStory = story;
        this.closeStoryLibraryModal();
        this.switchWorkspace("novel");
        this.novelController.setupStep4View();
        this.novelController.goToStep(4);
        this.showToast(`Đã mở truyện: ${story.title}`, "info");
      });

      card.querySelector(".btn-delete-story").addEventListener("click", async () => {
        if (confirm(`Bạn có chắc chắn muốn xóa bộ truyện "${story.title}" không?`)) {
          await storageService.deleteStory(story.id);
          if (authService.isLoggedIn()) {
            try {
              await authService.deleteUserStory(story.id);
            } catch (e) {
              console.warn("Delete cloud story error:", e);
            }
          }
          await this.updateSavedCount();
          await this.openStoryLibraryModal();
          this.showToast("Đã xóa truyện khỏi thư viện.", "info");
        }
      });

      container.appendChild(card);
    });
  }

  // ==================== GLOBAL EVENT BINDINGS ====================

  bindGlobalEvents() {
    // 0. Auto Sync Token Usage & Settings to Neon Cloud
    window.addEventListener("novel_studio_request_cloud_sync", async () => {
      if (authService.isLoggedIn()) {
        try {
          const keys = storageService.getApiKeys();
          const settings = storageService.getSettings();
          const usage = storageService.getRawApiUsageData();
          await authService.saveUserApiSettings(keys, settings, usage);
          console.log("☁️ Đã tự động đồng bộ Token Usage lên Neon Cloud!");
        } catch (e) {
          console.warn("Auto cloud sync error:", e);
        }
      }
    });

    // 1. Workspace Navigation Tabs
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

    // 2. Auth Events
    const btnOpenAuth = document.getElementById("btnOpenAuth");
    if (btnOpenAuth) {
      btnOpenAuth.addEventListener("click", () => this.openAuthModal("login"));
    }

    const btnCloseAuth = document.getElementById("btnCloseAuth");
    if (btnCloseAuth) {
      btnCloseAuth.addEventListener("click", () => this.closeAuthModal());
    }

    const tabAuthLogin = document.getElementById("tabAuthLogin");
    if (tabAuthLogin) {
      tabAuthLogin.addEventListener("click", () => this.switchAuthTab("login"));
    }

    const tabAuthRegister = document.getElementById("tabAuthRegister");
    if (tabAuthRegister) {
      tabAuthRegister.addEventListener("click", () => this.switchAuthTab("register"));
    }

    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
      loginForm.addEventListener("submit", (e) => this.handleLogin(e));
    }

    const registerForm = document.getElementById("registerForm");
    if (registerForm) {
      registerForm.addEventListener("submit", (e) => this.handleRegister(e));
    }

    const btnUserDropdown = document.getElementById("btnUserDropdownToggle");
    const userDropdownMenu = document.getElementById("userDropdownMenu");
    if (btnUserDropdown && userDropdownMenu) {
      btnUserDropdown.addEventListener("click", (e) => {
        e.stopPropagation();
        userDropdownMenu.style.display = userDropdownMenu.style.display === "none" ? "block" : "none";
      });

      document.addEventListener("click", () => {
        userDropdownMenu.style.display = "none";
      });
    }

    const btnLogout = document.getElementById("btnLogout");
    if (btnLogout) {
      btnLogout.addEventListener("click", () => {
        authService.logout();
        this.showToast("Đã đăng xuất tài khoản!", "info");
      });
    }

    // 3. Admin Events
    const btnOpenAdminPanel = document.getElementById("btnOpenAdminPanel");
    if (btnOpenAdminPanel) {
      btnOpenAdminPanel.addEventListener("click", () => this.openAdminModal());
    }

    const btnCloseAdmin = document.getElementById("btnCloseAdmin");
    if (btnCloseAdmin) {
      btnCloseAdmin.addEventListener("click", () => this.closeAdminModal());
    }

    const tabAdminUsers = document.getElementById("tabAdminUsers");
    if (tabAdminUsers) {
      tabAdminUsers.addEventListener("click", () => this.switchAdminTab("users"));
    }

    const tabAdminStories = document.getElementById("tabAdminStories");
    if (tabAdminStories) {
      tabAdminStories.addEventListener("click", () => {
        const badge = document.getElementById("adminStoriesAuthorFilterBadge");
        if (badge) badge.style.display = "none";
        this.switchAdminTab("stories");
        this.renderAdminStoriesList(this.adminStories);
      });
    }

    const btnRefreshAdminUsers = document.getElementById("btnRefreshAdminUsers");
    if (btnRefreshAdminUsers) {
      btnRefreshAdminUsers.addEventListener("click", () => this.loadAdminData());
    }

    const btnRefreshAdminStories = document.getElementById("btnRefreshAdminStories");
    if (btnRefreshAdminStories) {
      btnRefreshAdminStories.addEventListener("click", () => this.loadAdminData());
    }

    const adminSearchUsers = document.getElementById("adminSearchUsers");
    if (adminSearchUsers) {
      adminSearchUsers.addEventListener("input", (e) => this.filterAdminUsers(e.target.value));
    }

    const adminSearchStories = document.getElementById("adminSearchStories");
    if (adminSearchStories) {
      adminSearchStories.addEventListener("input", (e) => this.filterAdminStories(e.target.value));
    }

    const btnClearAuthorFilter = document.getElementById("btnClearAuthorFilter");
    if (btnClearAuthorFilter) {
      btnClearAuthorFilter.addEventListener("click", () => {
        const badge = document.getElementById("adminStoriesAuthorFilterBadge");
        if (badge) badge.style.display = "none";
        this.renderAdminStoriesList(this.adminStories);
      });
    }

    // 4. API Settings Events
    const btnOpenApi = document.getElementById("btnOpenApiSettings");
    if (btnOpenApi) {
      btnOpenApi.addEventListener("click", () => this.openApiSettingsModal());
    }

    const keyBadge = document.getElementById("apiKeyStatusBadge");
    if (keyBadge) {
      keyBadge.addEventListener("click", () => this.openApiSettingsModal());
    }

    const liveQuotaBadge = document.getElementById("apiQuotaLiveBadge");
    if (liveQuotaBadge) {
      liveQuotaBadge.addEventListener("click", () => this.openApiSettingsModal());
    }

    const btnClearApiStats = document.getElementById("btnClearApiStats");
    if (btnClearApiStats) {
      btnClearApiStats.addEventListener("click", () => this.clearApiUsageStats());
    }

    const btnCloseApi = document.getElementById("btnCloseApiSettings");
    if (btnCloseApi) {
      btnCloseApi.addEventListener("click", () => this.closeApiSettingsModal());
    }

    const btnSaveApi = document.getElementById("btnSaveApiSettings");
    if (btnSaveApi) {
      btnSaveApi.addEventListener("click", () => this.saveApiSettings());
    }

    const btnTestApi = document.getElementById("btnTestApiKey");
    if (btnTestApi) {
      btnTestApi.addEventListener("click", () => this.testApiKeyConnection());
    }

    const modelSelectEl = document.getElementById("modelSelect");
    if (modelSelectEl) {
      modelSelectEl.addEventListener("change", (e) => {
        this.updateQuotaDisplay(e.target.value);
      });
    }

    // 5. Story Library Events
    const btnOpenLib = document.getElementById("btnOpenLibrary");
    if (btnOpenLib) {
      btnOpenLib.addEventListener("click", () => this.openStoryLibraryModal());
    }

    const btnCloseLib = document.getElementById("btnCloseStoryLibrary");
    if (btnCloseLib) {
      btnCloseLib.addEventListener("click", () => this.closeStoryLibraryModal());
    }

    const libSearch = document.getElementById("librarySearchInput");
    if (libSearch) {
      libSearch.addEventListener("input", (e) => this.filterLibraryStories(e.target.value));
    }

    const btnClearAll = document.getElementById("btnClearAllStories");
    if (btnClearAll) {
      btnClearAll.addEventListener("click", async () => {
        const stories = await storageService.getAllStories();
        if (stories.length === 0) {
          this.showToast("Thư viện hiện đang trống!", "info");
          return;
        }
        if (confirm(`CẢNH BÁO: Bạn có chắc chắn muốn XÓA TẤT CẢ ${stories.length} bộ truyện trong thư viện để giải phóng dung lượng không?`)) {
          await storageService.clearAllStories();
          await this.updateSavedCount();
          this.openStoryLibraryModal();
          this.showToast("Đã xóa toàn bộ truyện khỏi thư viện!", "success");
        }
      });
    }

    // 6. New Story Button
    const btnNewStory = document.getElementById("btnNewStory");
    if (btnNewStory) {
      btnNewStory.addEventListener("click", () => {
        if (confirm("Bạn có muốn bắt đầu tạo một bộ truyện mới không?")) {
          this.novelController.currentStory = null;
          this.novelController.selectedConcept = null;
          const conceptsSec = document.getElementById("conceptsSection");
          if (conceptsSec) conceptsSec.style.display = "none";
          const premiseInput = document.getElementById("userPremiseInput");
          if (premiseInput) premiseInput.value = "";
          this.switchWorkspace("novel");
          this.novelController.goToStep(1);
        }
      });
    }

    // 7. Backdrop Click & Escape to close modals
    ["authModal", "adminModal", "apiSettingsModal", "storyLibraryModal"].forEach(id => {
      const modal = document.getElementById(id);
      if (modal) {
        modal.addEventListener("click", (e) => {
          if (e.target === modal) {
            modal.classList.remove("open");
          }
        });
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        document.querySelectorAll(".modal-backdrop.open").forEach(m => m.classList.remove("open"));
      }
    });
  }
}

// Khởi tạo và gán toàn cục
window.novelStudio = new NovelStudioApp();
