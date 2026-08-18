/**
 * Auth & User Client Service for AI Novel Studio
 * Quản lý phiên đăng nhập, đồng bộ Thẻ Trope với Neon DB, và các thao tác Admin
 */

class AuthService {
  constructor() {
    this.currentUser = null;
    this.token = localStorage.getItem("novel_studio_auth_token") || null;
    this.authListeners = [];
  }

  onAuthChange(callback) {
    if (typeof callback === "function") {
      this.authListeners.push(callback);
    }
  }

  notifyAuthChange() {
    this.authListeners.forEach(fn => {
      try { fn(this.currentUser); } catch (e) { console.error(e); }
    });
  }

  async init() {
    if (!this.token) {
      this.currentUser = null;
      this.notifyAuthChange();
      return null;
    }

    try {
      const res = await fetch("/api/auth/me", {
        headers: { "Authorization": `Bearer ${this.token}` }
      });

      if (res.ok) {
        const data = await res.json();
        this.currentUser = data.user;
        this.notifyAuthChange();
        return this.currentUser;
      } else {
        // Token invalid or user banned
        const err = await res.json().catch(() => ({}));
        this.clearSession();
        if (res.status === 403 || err.error?.includes("bị khóa")) {
          throw new Error("🚫 Tài khoản của bạn đã bị khóa bởi Quản trị viên!");
        }
        return null;
      }
    } catch (err) {
      this.clearSession();
      throw err;
    }
  }

  setSession(token, user) {
    this.token = token;
    this.currentUser = user;
    localStorage.setItem("novel_studio_auth_token", token);
    this.notifyAuthChange();
  }

  clearSession() {
    this.token = null;
    this.currentUser = null;
    localStorage.removeItem("novel_studio_auth_token");
    this.notifyAuthChange();
  }

  isLoggedIn() {
    return Boolean(this.currentUser);
  }

  isAdmin() {
    return this.currentUser?.role === "admin";
  }

  async register(username, email, password) {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Đăng ký thất bại!");
    }

    this.setSession(data.token, data.user);
    return data.user;
  }

  async login(usernameOrEmail, password) {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernameOrEmail, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Đăng nhập thất bại!");
    }

    this.setSession(data.token, data.user);
    return data.user;
  }

  async logout() {
    if (this.token) {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { "Authorization": `Bearer ${this.token}` }
        });
      } catch (e) {
        console.warn("Logout error:", e);
      }
    }
    this.clearSession();
  }

  // ==================== USER CUSTOM TAGS SYNC ====================

  async fetchUserTags() {
    if (!this.isLoggedIn()) return null;

    try {
      const res = await fetch("/api/user/tags", {
        headers: { "Authorization": `Bearer ${this.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        return data.tags || [];
      }
    } catch (e) {
      console.warn("Fetch tags error:", e);
    }
    return null;
  }

  async saveUserTags(tagsArray) {
    if (!this.isLoggedIn()) return null;

    try {
      const res = await fetch("/api/user/tags", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.token}`
        },
        body: JSON.stringify({ tags: tagsArray })
      });
      if (res.ok) {
        const data = await res.json();
        return data.tags;
      }
    } catch (e) {
      console.warn("Save user tags error:", e);
    }
    return null;
  }

  async deleteUserTag(tagName) {
    if (!this.isLoggedIn()) return null;

    try {
      const res = await fetch(`/api/user/tags/${encodeURIComponent(tagName)}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${this.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        return data.tags;
      }
    } catch (e) {
      console.warn("Delete tag error:", e);
    }
    return null;
  }

  // ==================== ADMIN API CALLS ====================

  async adminGetUsers() {
    if (!this.isAdmin()) throw new Error("Yêu cầu quyền Quản trị viên");

    const res = await fetch("/api/admin/users", {
      headers: { "Authorization": `Bearer ${this.token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Không thể tải danh sách người dùng");
    return data.users || [];
  }

  async adminSetBan(userId, isBanned) {
    if (!this.isAdmin()) throw new Error("Yêu cầu quyền Quản trị viên");

    const res = await fetch(`/api/admin/users/${userId}/ban`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.token}`
      },
      body: JSON.stringify({ is_banned: isBanned })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Không thể thay đổi trạng thái khóa nick");
    return data;
  }

  async adminSetRole(userId, role) {
    if (!this.isAdmin()) throw new Error("Yêu cầu quyền Quản trị viên");

    const res = await fetch(`/api/admin/users/${userId}/role`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.token}`
      },
      body: JSON.stringify({ role })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Không thể phân quyền");
    return data;
  }

  async adminDeleteUser(userId) {
    if (!this.isAdmin()) throw new Error("Yêu cầu quyền Quản trị viên");

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${this.token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Không thể xóa người dùng");
    return data;
  }

  async adminGetStats() {
    if (!this.isAdmin()) throw new Error("Yêu cầu quyền Quản trị viên");

    const res = await fetch("/api/admin/stats", {
      headers: { "Authorization": `Bearer ${this.token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Không thể lấy thống kê");
    return data.stats;
  }
}

export const authService = new AuthService();
