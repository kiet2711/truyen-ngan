/**
 * Storage Service - Quản lý lưu trữ Offline với IndexedDB & LocalStorage
 * Tự động lưu tiến trình viết truyện, lịch sử tổ hợp và cài đặt API Keys
 */

const DB_NAME = "AIFictionStudioDB";
const DB_VERSION = 1;
const STORE_STORIES = "stories";

class StorageService {
  constructor() {
    this.db = null;
    this.initDB();
  }

  /**
   * Khởi tạo IndexedDB
   */
  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        console.warn("IndexedDB error, falling back to LocalStorage:", event);
        resolve(null);
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_STORIES)) {
          const store = db.createObjectStore(STORE_STORIES, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
          store.createIndex("genreId", "genreId", { unique: false });
        }
      };
    });
  }

  // ==================== API KEYS & SETTINGS ====================

  getApiKeys() {
    const keys = localStorage.getItem("novel_studio_gemini_keys");
    if (!keys) return [];
    try {
      return JSON.parse(keys);
    } catch {
      return keys.split("\n").map(k => k.trim()).filter(Boolean);
    }
  }

  saveApiKeys(keysArray) {
    const cleanKeys = (Array.isArray(keysArray) ? keysArray : [keysArray])
      .map(k => k.trim())
      .filter(Boolean);
    localStorage.setItem("novel_studio_gemini_keys", JSON.stringify(cleanKeys));
    return cleanKeys;
  }

  getSettings() {
    const defaults = {
      model: "gemini-3.6-flash",
      temperatureOutline: 0.9,
      temperatureChapter: 0.8,
      delayBetweenChapters: 3500, // ms, chống lỗi 429
      maxRetries: 3
    };
    try {
      const stored = localStorage.getItem("novel_studio_settings");
      if (!stored) return defaults;
      const parsed = JSON.parse(stored);
      // Tự động nâng cấp nếu đang lưu model cũ gemini-2.5-flash bị Google đóng
      if (parsed.model === "gemini-2.5-flash") {
        parsed.model = "gemini-3.6-flash";
        this.saveSettings(parsed);
      }
      return { ...defaults, ...parsed };
    } catch {
      return defaults;
    }
  }

  saveSettings(settings) {
    localStorage.setItem("novel_studio_settings", JSON.stringify(settings));
  }

  // ==================== API USAGE & QUOTA LIMITS (PER-MODEL REAL-TIME TRACKING) ====================

  /**
   * Bảng hạn mức chuẩn 100% từ Google AI Studio Dashboard cho từng Model riêng biệt
   */
  getAllModelLimits() {
    return {
      "gemini-3.5-flash-lite": { rpm: 15, rpd: 500,   tpm: 250000, name: "Gemini 3.5 Flash Lite", category: "Text-out models", highlight: true },
      "gemini-3.1-flash-lite": { rpm: 15, rpd: 500,   tpm: 250000, name: "Gemini 3.1 Flash Lite", category: "Text-out models" },
      "gemini-3.6-flash":      { rpm: 5,  rpd: 20,    tpm: 250000, name: "Gemini 3.6 Flash",      category: "Text-out models", highlight: true },
      "gemini-3.7-flash":      { rpm: 5,  rpd: 20,    tpm: 250000, name: "Gemini 3.7 Flash",      category: "Text-out models" },
      "gemini-3.5-flash":      { rpm: 5,  rpd: 20,    tpm: 250000, name: "Gemini 3.5 Flash",      category: "Text-out models" },
      "gemini-3-flash":        { rpm: 5,  rpd: 20,    tpm: 250000, name: "Gemini 3.0 Flash",      category: "Text-out models" },
      "gemini-2.5-flash":      { rpm: 5,  rpd: 20,    tpm: 250000, name: "Gemini 2.5 Flash",      category: "Text-out models" },
      "gemini-2.5-flash-lite": { rpm: 10, rpd: 20,    tpm: 250000, name: "Gemini 2.5 Flash Lite", category: "Text-out models" },
      "gemma-4-31b-it":        { rpm: 30, rpd: 14400, tpm: 16000,  name: "Gemma 4 31B",         category: "Other models", highlight: true },
      "gemma-4-26b-a4b-it":    { rpm: 30, rpd: 14400, tpm: 16000,  name: "Gemma 4 26B (MoE)",   category: "Other models", highlight: true }
    };
  }

  /**
   * Lấy thông tin giới hạn (RPM / RPD / TPM) theo Model
   */
  getModelLimits(modelName) {
    const all = this.getAllModelLimits();
    return all[modelName] || { rpm: 5, rpd: 20, tpm: 250000, name: modelName || "Gemini Model", category: "Text-out models" };
  }

  /**
   * Tính ngày hiện tại theo chuẩn múi giờ UTC-8 của Google (Reset quota vào 00:00 UTC-8, tức ~14h-15h VN)
   */
  getGoogleUtc8DateString() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const utcMinus8 = new Date(utc - (8 * 3600000));
    return utcMinus8.toISOString().split("T")[0]; // YYYY-MM-DD
  }

  /**
   * Tính thời gian đếm ngược tới đợt reset RPD tiếp theo của Google (00:00 UTC-8)
   */
  getTimeUntilNextGoogleReset() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const utcMinus8 = new Date(utc - (8 * 3600000));

    const nextReset = new Date(utcMinus8);
    nextReset.setHours(24, 0, 0, 0); // 00:00 tiếp theo

    const diffMs = Math.max(0, nextReset.getTime() - utcMinus8.getTime());
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);

    return {
      hours,
      minutes,
      seconds,
      formatted: `${hours}h ${minutes}m ${seconds}s`,
      totalMs: diffMs
    };
  }

  /**
   * Rút gọn API Key để hiển thị an toàn trên giao diện
   */
  maskApiKey(key) {
    if (!key || typeof key !== "string") return "Chưa có Key";
    if (key.length <= 10) return key;
    return `${key.slice(0, 7)}...${key.slice(-4)}`;
  }

  /**
   * Đọc toàn bộ dữ liệu thống kê usage
   */
  getRawApiUsageData() {
    try {
      const stored = localStorage.getItem("novel_studio_api_usage");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }

  /**
   * Lưu dữ liệu thống kê usage
   */
  saveRawApiUsageData(data) {
    try {
      localStorage.setItem("novel_studio_api_usage", JSON.stringify(data));
    } catch (e) {
      console.warn("Không thể lưu api usage vào localStorage:", e);
    }
  }

  /**
   * Ghi nhận 1 lượt gọi API và số token đã sử dụng - Lưu TÁCH BIỆT theo từng Model và từng Key
   */
  recordApiUsage(key, usageMetadata = {}, model = null) {
    if (!key) return;

    const data = this.getRawApiUsageData();
    const currentDateStr = this.getGoogleUtc8DateString();
    const now = Date.now();
    const modelKey = model || "gemini-3.6-flash";

    if (!data[key]) {
      data[key] = {
        keyMasked: this.maskApiKey(key),
        lastResetDate: currentDateStr,
        models: {}
      };
    }

    const keyStats = data[key];

    // Reset nếu sang ngày mới
    if (keyStats.lastResetDate !== currentDateStr) {
      keyStats.lastResetDate = currentDateStr;
      if (keyStats.models) {
        Object.keys(keyStats.models).forEach(m => {
          if (keyStats.models[m]) {
            keyStats.models[m].requestsToday = 0;
          }
        });
      }
    }

    if (!keyStats.models) keyStats.models = {};
    if (!keyStats.models[modelKey]) {
      keyStats.models[modelKey] = {
        rpmTimestamps: [],
        tpmTimestamps: [],
        requestsToday: 0,
        totalRequests: 0,
        promptTokens: 0,
        candidatesTokens: 0,
        totalTokens: 0,
        lastUsedAt: null
      };
    }

    const modelStats = keyStats.models[modelKey];

    // Dọn dẹp sliding window 60s (RPM & TPM)
    const windowStart = now - 60000;
    modelStats.rpmTimestamps = (modelStats.rpmTimestamps || []).filter(ts => ts > windowStart);
    modelStats.rpmTimestamps.push(now);

    // Cập nhật số request cho model này
    modelStats.requestsToday = (modelStats.requestsToday || 0) + 1;
    modelStats.totalRequests = (modelStats.totalRequests || 0) + 1;
    modelStats.lastUsedAt = now;

    // Cập nhật token từ usageMetadata của Gemini
    const promptCount = usageMetadata.promptTokenCount || 0;
    const candidatesCount = usageMetadata.candidatesTokenCount || 0;
    const totalCount = usageMetadata.totalTokenCount || (promptCount + candidatesCount);

    modelStats.promptTokens = (modelStats.promptTokens || 0) + promptCount;
    modelStats.candidatesTokens = (modelStats.candidatesTokens || 0) + candidatesCount;
    modelStats.totalTokens = (modelStats.totalTokens || 0) + totalCount;

    // Sliding window 60s cho TPM (Tokens Per Minute)
    if (!modelStats.tpmTimestamps) modelStats.tpmTimestamps = [];
    modelStats.tpmTimestamps = modelStats.tpmTimestamps.filter(item => item.ts > windowStart);
    modelStats.tpmTimestamps.push({ ts: now, tokens: totalCount });

    this.saveRawApiUsageData(data);

    // Phát sự kiện cập nhật để UI lắng nghe và vẽ lại tức thì
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("novel_studio_api_usage_updated", {
        detail: { key, model: modelKey, modelStats, usageMetadata }
      }));

      // Kích hoạt đồng bộ nhẹ nhàng lên Neon Cloud (Debounce 3 giây)
      if (this._usageSyncTimeout) clearTimeout(this._usageSyncTimeout);
      this._usageSyncTimeout = setTimeout(() => {
        window.dispatchEvent(new CustomEvent("novel_studio_request_cloud_sync", { detail: {} }));
      }, 3000);
    }

    return modelStats;
  }

  /**
   * Hợp nhất dữ liệu token usage từ Neon Cloud vào LocalStorage
   */
  mergeApiUsageData(cloudData) {
    if (!cloudData || typeof cloudData !== "object") return;
    const local = this.getRawApiUsageData();
    const currentDateStr = this.getGoogleUtc8DateString();

    Object.keys(cloudData).forEach(key => {
      const cloudKeyData = cloudData[key];
      if (!cloudKeyData || typeof cloudKeyData !== "object") return;

      if (!local[key]) {
        local[key] = cloudKeyData;
        return;
      }

      if (!local[key].models) local[key].models = {};
      const cloudModels = cloudKeyData.models || {};

      Object.keys(cloudModels).forEach(modelKey => {
        const cm = cloudModels[modelKey];
        if (!cm) return;

        if (!local[key].models[modelKey]) {
          local[key].models[modelKey] = cm;
        } else {
          const lm = local[key].models[modelKey];
          lm.totalRequests = Math.max(lm.totalRequests || 0, cm.totalRequests || 0);
          lm.promptTokens = Math.max(lm.promptTokens || 0, cm.promptTokens || 0);
          lm.candidatesTokens = Math.max(lm.candidatesTokens || 0, cm.candidatesTokens || 0);
          lm.totalTokens = Math.max(lm.totalTokens || 0, cm.totalTokens || 0);
          if (cloudKeyData.lastResetDate === currentDateStr && local[key].lastResetDate === currentDateStr) {
            lm.requestsToday = Math.max(lm.requestsToday || 0, cm.requestsToday || 0);
          }
          if (cm.lastUsedAt && (!lm.lastUsedAt || cm.lastUsedAt > lm.lastUsedAt)) {
            lm.lastUsedAt = cm.lastUsedAt;
          }
        }
      });
    });

    this.saveRawApiUsageData(local);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("novel_studio_api_usage_updated", { detail: {} }));
    }
  }

  /**
   * Lấy thống kê sử dụng (RPM, TPM, RPD, Tokens) - TÍNH CHÍNH XÁC RIÊNG CHO TỪNG MODEL
   */
  getApiUsageStats(targetModel = null) {
    const data = this.getRawApiUsageData();
    const currentDateStr = this.getGoogleUtc8DateString();
    const now = Date.now();
    const windowStart = now - 60000;
    const settings = this.getSettings();
    const selectedModel = targetModel || settings.model || "gemini-3.6-flash";
    const selectedModelLimits = this.getModelLimits(selectedModel);
    const allModelLimits = this.getAllModelLimits();
    const keysList = this.getApiKeys();

    // 1. Thống kê tổng hợp cho Model đang chọn (Active Model)
    let activeModelRpm = 0;
    let activeModelTpm = 0;
    let activeModelRpd = 0;
    let activeModelPromptTokens = 0;
    let activeModelCandidatesTokens = 0;
    let activeModelTotalTokens = 0;
    let activeModelTotalRequests = 0;

    // 2. Thống kê riêng cho từng model trong danh mục All Models
    const allModelsSummary = {};
    Object.keys(allModelLimits).forEach(m => {
      allModelsSummary[m] = {
        modelId: m,
        name: allModelLimits[m].name,
        category: allModelLimits[m].category,
        limits: allModelLimits[m],
        rpm: 0,
        tpm: 0,
        rpd: 0,
        totalTokens: 0,
        promptTokens: 0,
        candidatesTokens: 0,
        lastUsedAt: null
      };
    });

    // 3. Phân rã dữ liệu từ từng API Key
    const keyDetails = [];

    keysList.forEach((k, idx) => {
      const keyData = data[k] || { keyMasked: this.maskApiKey(k), lastResetDate: currentDateStr, models: {} };
      
      // Reset ngày nếu sang ngày mới
      if (keyData.lastResetDate !== currentDateStr) {
        keyData.lastResetDate = currentDateStr;
        if (keyData.models) {
          Object.keys(keyData.models).forEach(m => {
            if (keyData.models[m]) keyData.models[m].requestsToday = 0;
          });
        }
      }

      const keyModels = keyData.models || {};
      const activeStatsForThisKey = keyModels[selectedModel] || {
        rpmTimestamps: [], tpmTimestamps: [], requestsToday: 0, totalRequests: 0, promptTokens: 0, candidatesTokens: 0, totalTokens: 0, lastUsedAt: null
      };

      const validTimestamps = (activeStatsForThisKey.rpmTimestamps || []).filter(ts => ts > windowStart);
      const validTpmEntries = (activeStatsForThisKey.tpmTimestamps || []).filter(item => item.ts > windowStart);
      const rpm = validTimestamps.length;
      const tpm = validTpmEntries.reduce((sum, item) => sum + (item.tokens || 0), 0);
      const rpd = activeStatsForThisKey.requestsToday || 0;

      activeModelRpm += rpm;
      activeModelTpm += tpm;
      activeModelRpd += rpd;
      activeModelPromptTokens += (activeStatsForThisKey.promptTokens || 0);
      activeModelCandidatesTokens += (activeStatsForThisKey.candidatesTokens || 0);
      activeModelTotalTokens += (activeStatsForThisKey.totalTokens || 0);
      activeModelTotalRequests += (activeStatsForThisKey.totalRequests || 0);

      // Cộng dồn vào allModelsSummary
      Object.keys(keyModels).forEach(m => {
        if (!allModelsSummary[m]) {
          allModelsSummary[m] = {
            modelId: m,
            name: this.getModelLimits(m).name,
            category: "Text-out models",
            limits: this.getModelLimits(m),
            rpm: 0,
            tpm: 0,
            rpd: 0,
            totalTokens: 0,
            promptTokens: 0,
            candidatesTokens: 0,
            lastUsedAt: null
          };
        }
        const mStats = keyModels[m];
        const mValidTs = (mStats.rpmTimestamps || []).filter(ts => ts > windowStart);
        const mValidTpm = (mStats.tpmTimestamps || []).filter(item => item.ts > windowStart);
        allModelsSummary[m].rpm += mValidTs.length;
        allModelsSummary[m].tpm += mValidTpm.reduce((sum, item) => sum + (item.tokens || 0), 0);
        allModelsSummary[m].rpd += (mStats.requestsToday || 0);
        allModelsSummary[m].totalTokens += (mStats.totalTokens || 0);
        allModelsSummary[m].promptTokens += (mStats.promptTokens || 0);
        allModelsSummary[m].candidatesTokens += (mStats.candidatesTokens || 0);
        if (mStats.lastUsedAt && (!allModelsSummary[m].lastUsedAt || mStats.lastUsedAt > allModelsSummary[m].lastUsedAt)) {
          allModelsSummary[m].lastUsedAt = mStats.lastUsedAt;
        }
      });

      keyDetails.push({
        index: idx + 1,
        key: k,
        keyMasked: this.maskApiKey(k),
        activeModel: selectedModel,
        rpm,
        rpmLimit: selectedModelLimits.rpm,
        tpm,
        tpmLimit: selectedModelLimits.tpm,
        rpd,
        rpdLimit: selectedModelLimits.rpd,
        totalTokens: activeStatsForThisKey.totalTokens || 0,
        lastUsedAt: activeStatsForThisKey.lastUsedAt
      });
    });

    return {
      activeModel: {
        modelId: selectedModel,
        name: selectedModelLimits.name,
        rpm: activeModelRpm,
        rpmLimit: selectedModelLimits.rpm,
        tpm: activeModelTpm,
        tpmLimit: selectedModelLimits.tpm,
        rpd: activeModelRpd,
        rpdLimit: selectedModelLimits.rpd,
        promptTokens: activeModelPromptTokens,
        candidatesTokens: activeModelCandidatesTokens,
        totalTokens: activeModelTotalTokens,
        totalRequests: activeModelTotalRequests
      },
      allModels: Object.values(allModelsSummary),
      activeKeyCount: keysList.length,
      keys: keyDetails,
      resetCountdown: this.getTimeUntilNextGoogleReset()
    };
  }

  /**
   * Reset toàn bộ hoặc 1 key thống kê
   */
  clearApiUsageStats(key = null) {
    if (key) {
      const data = this.getRawApiUsageData();
      delete data[key];
      this.saveRawApiUsageData(data);
    } else {
      localStorage.removeItem("novel_studio_api_usage");
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("novel_studio_api_usage_updated", { detail: {} }));
    }
  }

  // ==================== CUSTOM USER TROPES / TAGS ====================

  getCustomTags() {
    try {
      const stored = localStorage.getItem("novel_studio_custom_tags");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  saveCustomTags(tagsArray) {
    const clean = Array.from(
      new Set(
        (Array.isArray(tagsArray) ? tagsArray : [])
          .map(t => (typeof t === "string" ? t.trim() : ""))
          .filter(Boolean)
      )
    );
    localStorage.setItem("novel_studio_custom_tags", JSON.stringify(clean));
    return clean;
  }

  // ==================== TAG COMBINATION HISTORY ====================

  getTagHistory() {
    try {
      return JSON.parse(localStorage.getItem("novel_studio_tag_history") || "[]");
    } catch {
      return [];
    }
  }

  addTagCombination(combination) {
    const history = this.getTagHistory();
    history.unshift({
      genreId: combination.genreId,
      setting: combination.setting,
      motif: combination.motif,
      timestamp: Date.now()
    });
    // Giữ tối đa 50 tổ hợp gần nhất
    const trimmed = history.slice(0, 50);
    localStorage.setItem("novel_studio_tag_history", JSON.stringify(trimmed));
  }

  // ==================== STORY PROJECTS (IndexedDB) ====================

  async saveStory(story) {
    if (!story.id) {
      story.id = "story_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6);
    }
    story.updatedAt = Date.now();

    // Lưu vào IndexedDB nếu khả dụng
    if (this.db) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction([STORE_STORIES], "readwrite");
        const store = tx.objectStore(STORE_STORIES);
        const req = store.put(story);
        req.onsuccess = () => resolve(story);
        req.onerror = () => {
          this._saveToLocalStorageFallback(story);
          resolve(story);
        };
      });
    } else {
      this._saveToLocalStorageFallback(story);
      return story;
    }
  }

  async getStory(id) {
    if (this.db) {
      return new Promise((resolve) => {
        const tx = this.db.transaction([STORE_STORIES], "readonly");
        const store = tx.objectStore(STORE_STORIES);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || this._getFromLocalStorageFallback(id));
        req.onerror = () => resolve(this._getFromLocalStorageFallback(id));
      });
    }
    return this._getFromLocalStorageFallback(id);
  }

  async getAllStories() {
    if (this.db) {
      return new Promise((resolve) => {
        const tx = this.db.transaction([STORE_STORIES], "readonly");
        const store = tx.objectStore(STORE_STORIES);
        const req = store.getAll();
        req.onsuccess = () => {
          const list = req.result || [];
          list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          resolve(list);
        };
        req.onerror = () => resolve(this._getAllFromLocalStorageFallback());
      });
    }
    return this._getAllFromLocalStorageFallback();
  }

  async deleteStory(id) {
    if (this.db) {
      return new Promise((resolve) => {
        const tx = this.db.transaction([STORE_STORIES], "readwrite");
        const store = tx.objectStore(STORE_STORIES);
        const req = store.delete(id);
        req.onsuccess = () => {
          this._deleteFromLocalStorageFallback(id);
          resolve(true);
        };
        req.onerror = () => resolve(false);
      });
    }
    this._deleteFromLocalStorageFallback(id);
    return true;
  }

  async clearAllStories() {
    if (this.db) {
      await new Promise((resolve) => {
        const tx = this.db.transaction([STORE_STORIES], "readwrite");
        const store = tx.objectStore(STORE_STORIES);
        const req = store.clear();
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      });
    }
    localStorage.removeItem("novel_studio_stories_backup");
    return true;
  }

  // ==================== LOCALSTORAGE FALLBACK ====================

  _saveToLocalStorageFallback(story) {
    try {
      const all = this._getAllFromLocalStorageFallback();
      const idx = all.findIndex(s => s.id === story.id);
      if (idx >= 0) all[idx] = story;
      else all.unshift(story);
      localStorage.setItem("novel_studio_stories_backup", JSON.stringify(all.slice(0, 20)));
    } catch (e) {
      console.warn("LocalStorage quota exceeded", e);
    }
  }

  _getFromLocalStorageFallback(id) {
    const all = this._getAllFromLocalStorageFallback();
    return all.find(s => s.id === id) || null;
  }

  _getAllFromLocalStorageFallback() {
    try {
      return JSON.parse(localStorage.getItem("novel_studio_stories_backup") || "[]");
    } catch {
      return [];
    }
  }

  _deleteFromLocalStorageFallback(id) {
    const all = this._getAllFromLocalStorageFallback().filter(s => s.id !== id);
    localStorage.setItem("novel_studio_stories_backup", JSON.stringify(all));
  }
}

export const storageService = new StorageService();
