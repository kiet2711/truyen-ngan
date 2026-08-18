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
