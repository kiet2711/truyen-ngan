import { TROPE_CATEGORIES, ALL_TROPES, getRandomTropes, getRandomSamplePremise } from "./data/tagPools.js";
import { normalizeTextForAudio } from "./data/numberToWordsVi.js";
import { geminiService } from "./services/geminiService.js";
import { storageService } from "./services/storageService.js";
import { authService } from "./services/authService.js";

class NovelStudioApp {
  constructor() {
    this.currentStep = 1;
    this.customTags = storageService.getCustomTags();
    this.selectedTags = new Set(["Zhihu style", "Vả mặt cực mạnh", "Plot twist bất ngờ", "Báo thù"]);
    this.generatedConcepts = [];
    this.selectedConcept = null;
    this.currentStory = null;
    this.isWriting = false;
    this.isPaused = false;
    this.isAudioCleaned = false;
    this.adminUsers = [];

    this.init();
  }

  async init() {
    this.bindEvents();
    this.updateApiKeyStatus();
    this.updateSavedCount();
    this.renderTropeCloud();
    await this.initAuth();
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
            this.showToast("Cần giữ lại ít nhất 1 thẻ trope!", "warning");
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
      this.showToast("Vui lòng nhập tên thẻ trope!", "warning");
      return;
    }

    const rawTags = rawInput
      .split(/[,;\n]+/)
      .map(t => t.trim())
      .filter(t => t.length > 0);

    if (rawTags.length === 0) {
      this.showToast("Vui lòng nhập tên thẻ hợp lệ!", "warning");
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
      this.showToast(`Đã thêm ${addedCount} thẻ mới và tự động kích hoạt!`, "success");
    } else {
      this.showToast(`Các thẻ đã được kích hoạt!`, "info");
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
    this.showToast(`Đã xóa thẻ: "${tagName}"`, "info");
  }

  applyRandomTropes() {
    const randomTags = getRandomTropes(4);
    this.selectedTags = new Set(randomTags);
    this.renderTropeCloud();
    this.showToast(`Đã chọn ngẫu nhiên: ${randomTags.join(", ")}`, "info");
  }

  // ==================== AUTHENTICATION & USER MANAGEMENT ====================

  async initAuth() {
    authService.onAuthChange((user) => this.renderUserHeader(user));

    try {
      const user = await authService.init();
      if (user) {
        // Load cloud custom tags
        const cloudTags = await authService.fetchUserTags();
        if (cloudTags && Array.isArray(cloudTags)) {
          this.customTags = cloudTags;
          storageService.saveCustomTags(this.customTags);
          this.renderTropeCloud();
        }

        // Load cloud API settings & keys
        await this.syncUserApiSettingsFromCloud();
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
        this.updateApiKeyStatus();
      }
    } catch (e) {
      console.warn("Sync API settings error:", e);
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

    if (tab === "login") {
      tabLogin.classList.add("active");
      tabRegister.classList.remove("active");
      formLogin.style.display = "flex";
      formRegister.style.display = "none";
      if (title) title.textContent = "🔐 Đăng Nhập Tài Khoản";
      setTimeout(() => document.getElementById("loginIdentifier")?.focus(), 100);
    } else {
      tabLogin.classList.remove("active");
      tabRegister.classList.add("active");
      formLogin.style.display = "none";
      formRegister.style.display = "flex";
      if (title) title.textContent = "✨ Đăng Ký Tài Khoản Mới";
      setTimeout(() => document.getElementById("regUsername")?.focus(), 100);
    }
  }

  async handleLoginSubmit(e) {
    e.preventDefault();
    const identifier = document.getElementById("loginIdentifier").value.trim();
    const password = document.getElementById("loginPassword").value;
    const alertBox = document.getElementById("authAlertBox");
    const btn = document.getElementById("btnLoginSubmit");
    const originText = btn.innerHTML;

    alertBox.style.display = "none";
    btn.disabled = true;
    btn.innerHTML = `<span class="typing-cursor"></span> Đang đăng nhập...`;

    try {
      const user = await authService.login(identifier, password);
      this.showToast(`Chào mừng trở lại, ${user.username}! 🎉`, "success");
      
      // Load user cloud tags
      const cloudTags = await authService.fetchUserTags();
      if (cloudTags && Array.isArray(cloudTags)) {
        this.customTags = cloudTags;
        storageService.saveCustomTags(this.customTags);
        this.renderTropeCloud();
      }

      // Sync cloud API keys & settings
      await this.syncUserApiSettingsFromCloud();

      this.closeAuthModal();
    } catch (err) {
      alertBox.textContent = err.message;
      alertBox.style.display = "block";
    } finally {
      btn.disabled = false;
      btn.innerHTML = originText;
    }
  }

  async handleRegisterSubmit(e) {
    e.preventDefault();
    const username = document.getElementById("regUsername").value.trim();
    const email = document.getElementById("regEmail").value.trim();
    const password = document.getElementById("regPassword").value;
    const confirm = document.getElementById("regPasswordConfirm").value;
    const alertBox = document.getElementById("authAlertBox");
    const btn = document.getElementById("btnRegisterSubmit");
    const originText = btn.innerHTML;

    if (password !== confirm) {
      alertBox.textContent = "Mật khẩu xác nhận không khớp!";
      alertBox.style.display = "block";
      return;
    }

    alertBox.style.display = "none";
    btn.disabled = true;
    btn.innerHTML = `<span class="typing-cursor"></span> Đang tạo tài khoản...`;

    try {
      const user = await authService.register(username, email, password);
      this.showToast(`Tạo tài khoản thành công! Chào mừng, ${user.username}! 🚀`, "success");

      // Save any existing local tags to user's new account
      if (this.customTags.length > 0) {
        await authService.saveUserTags(this.customTags);
      }

      // Save existing local API settings to user's new account
      const currentKeys = storageService.getApiKeys();
      const currentSettings = storageService.getSettings();
      if (currentKeys.length > 0) {
        await authService.saveUserApiSettings(currentKeys, currentSettings);
      }

      this.closeAuthModal();
    } catch (err) {
      alertBox.textContent = err.message;
      alertBox.style.display = "block";
    } finally {
      btn.disabled = false;
      btn.innerHTML = originText;
    }
  }

  async handleLogout() {
    await authService.logout();
    this.customTags = storageService.getCustomTags();
    this.renderTropeCloud();
    this.showToast("Đã đăng xuất tài khoản!", "info");
  }

  // ==================== ADMIN PANEL CONTROLLERS ====================

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

  async loadAdminData() {
    const tableBody = document.getElementById("adminUsersTableBody");
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px;"><span class="typing-cursor"></span> Đang tải dữ liệu từ Neon DB...</td></tr>`;

    try {
      const stats = await authService.adminGetStats();
      if (stats) {
        document.getElementById("statTotalUsers").textContent = stats.totalUsers || 0;
        document.getElementById("statActiveUsers").textContent = stats.activeUsers || 0;
        document.getElementById("statBannedUsers").textContent = stats.bannedUsers || 0;
        document.getElementById("statTotalTags").textContent = stats.totalTags || 0;
      }

      this.adminUsers = await authService.adminGetUsers();
      this.renderAdminUsersTable(this.adminUsers);
    } catch (err) {
      console.error(err);
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--accent-rose); padding: 20px;">Lỗi tải dữ liệu: ${err.message}</td></tr>`;
      this.showToast(`Lỗi admin: ${err.message}`, "error");
    }
  }

  renderAdminUsersTable(users) {
    const tableBody = document.getElementById("adminUsersTableBody");
    tableBody.innerHTML = "";

    if (!users || users.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">Không tìm thấy người dùng nào.</td></tr>`;
      return;
    }

    users.forEach(user => {
      const tr = document.createElement("tr");

      const isCurrentLoggedIn = authService.currentUser?.id === user.id;
      const isAdminUser = user.role === "admin";
      const isBanned = Boolean(user.is_banned);

      tr.innerHTML = `
        <td style="color: var(--text-dim); font-size: 11px;">#${user.id}</td>
        <td>
          <div style="font-weight: 700; color: #fff;">${user.username} ${isCurrentLoggedIn ? '<span style="font-size: 10px; color: var(--accent-pink);">(Bạn)</span>' : ''}</div>
          <div style="font-size: 11px; color: var(--text-dim);">Tạo: ${new Date(user.created_at).toLocaleDateString("vi-VN")}</div>
        </td>
        <td style="color: var(--text-muted); font-size: 12px;">${user.email}</td>
        <td>
          <span class="${isAdminUser ? 'badge-role-admin' : 'badge-role-user'}">${isAdminUser ? '👑 ADMIN' : 'MEMBER'}</span>
        </td>
        <td style="font-weight: 600; color: #f472b6;">${user.custom_tag_count || 0} thẻ</td>
        <td>
          <span class="${isBanned ? 'badge-status-banned' : 'badge-status-active'}">
            ${isBanned ? '🚫 ĐÃ KHÓA' : '🟢 HOẠT ĐỘNG'}
          </span>
        </td>
        <td style="text-align: right;">
          <div class="admin-actions-cell">
            ${!isAdminUser ? `
              <button class="btn-action-xs ${isBanned ? 'btn-action-unban' : 'btn-action-ban'} btn-toggle-ban" data-id="${user.id}" data-banned="${isBanned}">
                ${isBanned ? '✅ Mở Khóa' : '🚫 Khóa Nick'}
              </button>
              <button class="btn-action-xs btn-action-role btn-toggle-role" data-id="${user.id}" data-role="${user.role}">
                ${user.role === 'admin' ? 'Hạ Quyền' : '⭐ Lên Admin'}
              </button>
              <button class="btn-action-xs btn-action-delete btn-delete-user" data-id="${user.id}" data-username="${user.username}" title="Xóa tài khoản">
                🗑️
              </button>
            ` : `<span style="font-size: 11px; color: var(--text-dim); font-style: italic;">Admin gốc</span>`}
          </div>
        </td>
      `;

      // Event: Toggle Ban
      const banBtn = tr.querySelector(".btn-toggle-ban");
      if (banBtn) {
        banBtn.addEventListener("click", async () => {
          const targetBan = !isBanned;
          const confirmMsg = targetBan 
            ? `Bạn có chắc chắn muốn KHÓA (Ban) tài khoản "${user.username}" không? Người này sẽ không thể đăng nhập được nữa.`
            : `Mở khóa tài khoản "${user.username}"?`;
          
          if (confirm(confirmMsg)) {
            try {
              await authService.adminSetBan(user.id, targetBan);
              this.showToast(`Đã ${targetBan ? 'khóa' : 'mở khóa'} tài khoản "${user.username}" thành công!`, "success");
              await this.loadAdminData();
            } catch (err) {
              this.showToast(err.message, "error");
            }
          }
        });
      }

      // Event: Toggle Role
      const roleBtn = tr.querySelector(".btn-toggle-role");
      if (roleBtn) {
        roleBtn.addEventListener("click", async () => {
          const newRole = user.role === "admin" ? "user" : "admin";
          if (confirm(`Bạn có muốn đổi vai trò của "${user.username}" thành "${newRole.toUpperCase()}"?`)) {
            try {
              await authService.adminSetRole(user.id, newRole);
              this.showToast(`Đã cập nhật vai trò "${user.username}" thành ${newRole}!`, "success");
              await this.loadAdminData();
            } catch (err) {
              this.showToast(err.message, "error");
            }
          }
        });
      }

      // Event: Delete User
      const delBtn = tr.querySelector(".btn-delete-user");
      if (delBtn) {
        delBtn.addEventListener("click", async () => {
          if (confirm(`CẢNH BÁO: Bạn có chắc chắn muốn XÓA VĨNH VIỄN tài khoản "${user.username}" và toàn bộ dữ liệu thẻ của người này không?`)) {
            try {
              await authService.adminDeleteUser(user.id);
              this.showToast(`Đã xóa tài khoản "${user.username}"!`, "success");
              await this.loadAdminData();
            } catch (err) {
              this.showToast(err.message, "error");
            }
          }
        });
      }

      tableBody.appendChild(tr);
    });
  }

  filterAdminUsers(query) {
    const q = (query || "").toLowerCase().trim();
    if (!q) {
      this.renderAdminUsersTable(this.adminUsers);
      return;
    }
    const filtered = this.adminUsers.filter(u => 
      (u.username || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q)
    );
    this.renderAdminUsersTable(filtered);
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
    // Auth & User Dropdown Events
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
      loginForm.addEventListener("submit", (e) => this.handleLoginSubmit(e));
    }

    const registerForm = document.getElementById("registerForm");
    if (registerForm) {
      registerForm.addEventListener("submit", (e) => this.handleRegisterSubmit(e));
    }

    const btnUserDropdownToggle = document.getElementById("btnUserDropdownToggle");
    const userDropdownMenu = document.getElementById("userDropdownMenu");
    if (btnUserDropdownToggle && userDropdownMenu) {
      btnUserDropdownToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = userDropdownMenu.style.display === "block";
        userDropdownMenu.style.display = isOpen ? "none" : "block";
      });
      document.addEventListener("click", () => {
        userDropdownMenu.style.display = "none";
      });
    }

    const btnLogout = document.getElementById("btnLogout");
    if (btnLogout) {
      btnLogout.addEventListener("click", () => this.handleLogout());
    }

    // Admin Modal Events
    const btnOpenAdminPanel = document.getElementById("btnOpenAdminPanel");
    if (btnOpenAdminPanel) {
      btnOpenAdminPanel.addEventListener("click", () => this.openAdminModal());
    }

    const btnCloseAdmin = document.getElementById("btnCloseAdmin");
    if (btnCloseAdmin) {
      btnCloseAdmin.addEventListener("click", () => this.closeAdminModal());
    }

    const btnRefreshAdminUsers = document.getElementById("btnRefreshAdminUsers");
    if (btnRefreshAdminUsers) {
      btnRefreshAdminUsers.addEventListener("click", () => this.loadAdminData());
    }

    const adminSearchUsers = document.getElementById("adminSearchUsers");
    if (adminSearchUsers) {
      adminSearchUsers.addEventListener("input", (e) => this.filterAdminUsers(e.target.value));
    }

    // Backdrop click & Escape to close modals
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

    // Header buttons
    document.getElementById("btnOpenApiSettings").addEventListener("click", () => this.openApiSettingsModal());
    document.getElementById("apiKeyStatusBadge").addEventListener("click", () => this.openApiSettingsModal());
    document.getElementById("btnCloseApiSettings").addEventListener("click", () => this.closeApiSettingsModal());
    document.getElementById("btnSaveApiSettings").addEventListener("click", () => this.saveApiSettings());
    document.getElementById("btnTestApiKey").addEventListener("click", () => this.testApiKeyConnection());

    document.getElementById("btnOpenLibrary").addEventListener("click", () => this.openStoryLibraryModal());
    document.getElementById("btnCloseStoryLibrary").addEventListener("click", () => this.closeStoryLibraryModal());
    document.getElementById("librarySearchInput").addEventListener("input", (e) => this.filterLibraryStories(e.target.value));

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
    const btnToggleAdd = document.getElementById("btnToggleAddTag");
    if (btnToggleAdd) {
      btnToggleAdd.addEventListener("click", () => this.toggleCustomTagPanel());
    }

    const btnCloseAdd = document.getElementById("btnCloseAddTag");
    if (btnCloseAdd) {
      btnCloseAdd.addEventListener("click", () => this.toggleCustomTagPanel(false));
    }

    const btnAdd = document.getElementById("btnAddCustomTag");
    if (btnAdd) {
      btnAdd.addEventListener("click", () => {
        const input = document.getElementById("customTagInput");
        if (input) this.addCustomTag(input.value);
      });
    }

    const customTagInput = document.getElementById("customTagInput");
    if (customTagInput) {
      customTagInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.addCustomTag(customTagInput.value);
        } else if (e.key === "Escape") {
          this.toggleCustomTagPanel(false);
        }
      });
    }

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
