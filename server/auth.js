/**
 * Auth & User Service for AI Novel Studio
 * Supports PostgreSQL (Neon) and Fallback JSON storage
 */

const crypto = require('crypto');
const db = require('./db');

/**
 * Generate secure session token (128-char hex)
 */
function generateToken() {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * Register a new user
 */
async function registerUser({ username, email, password }) {
  if (!username || username.trim().length < 3) {
    throw new Error("Tên đăng nhập phải có ít nhất 3 ký tự!");
  }
  if (!email || !email.includes('@')) {
    throw new Error("Email không hợp lệ!");
  }
  if (!password || password.length < 6) {
    throw new Error("Mật khẩu phải có ít nhất 6 ký tự!");
  }

  const cleanUsername = username.trim().toLowerCase();
  const cleanEmail = email.trim().toLowerCase();
  const { hash, salt } = db.hashPassword(password);

  if (db.isPostgres && db.pool) {
    // Check existing
    const existing = await db.pool.query(
      'SELECT id FROM users WHERE LOWER(username) = $1 OR LOWER(email) = $2',
      [cleanUsername, cleanEmail]
    );
    if (existing.rows.length > 0) {
      throw new Error("Tên đăng nhập hoặc Email đã tồn tại!");
    }

    // Insert user
    const res = await db.pool.query(
      `INSERT INTO users (username, email, password_hash, salt, role, is_banned, created_at)
       VALUES ($1, $2, $3, $4, 'user', FALSE, NOW())
       RETURNING id, username, email, role, is_banned, created_at`,
      [cleanUsername, cleanEmail, hash, salt]
    );
    const user = res.rows[0];

    // Create session
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    await db.pool.query(
      'INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)',
      [token, user.id, expiresAt]
    );

    return { token, user };
  } else {
    // Fallback mode
    const data = db.getFallbackData();
    const existing = data.users.find(
      u => u.username.toLowerCase() === cleanUsername || u.email.toLowerCase() === cleanEmail
    );
    if (existing) {
      throw new Error("Tên đăng nhập hoặc Email đã tồn tại!");
    }

    const newId = (data.users.reduce((max, u) => Math.max(max, u.id || 0), 0) || 0) + 1;
    const user = {
      id: newId,
      username: cleanUsername,
      email: cleanEmail,
      password_hash: hash,
      salt: salt,
      role: 'user',
      is_banned: false,
      created_at: new Date().toISOString(),
      last_login: null
    };
    data.users.push(user);

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    data.sessions.push({ token, user_id: newId, created_at: new Date().toISOString(), expires_at: expiresAt });

    db.saveFallbackData(data);

    const { password_hash, salt: _, ...safeUser } = user;
    return { token, user: safeUser };
  }
}

/**
 * Login user
 */
async function loginUser({ usernameOrEmail, password }) {
  if (!usernameOrEmail || !password) {
    throw new Error("Vui lòng nhập đầy đủ tên đăng nhập/email và mật khẩu!");
  }

  const cleanIdentifier = usernameOrEmail.trim().toLowerCase();

  if (db.isPostgres && db.pool) {
    const res = await db.pool.query(
      `SELECT * FROM users 
       WHERE LOWER(username) = $1 OR LOWER(email) = $1 LIMIT 1`,
      [cleanIdentifier]
    );

    if (res.rows.length === 0) {
      throw new Error("Tài khoản hoặc mật khẩu không chính xác!");
    }

    const user = res.rows[0];
    const isValid = db.verifyPassword(password, user.password_hash, user.salt);
    if (!isValid) {
      throw new Error("Tài khoản hoặc mật khẩu không chính xác!");
    }

    if (user.is_banned) {
      throw new Error("🚫 Tài khoản của bạn đã bị khóa bởi Quản trị viên!");
    }

    // Update last login
    await db.pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    // Create session
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.pool.query(
      'INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)',
      [token, user.id, expiresAt]
    );

    const { password_hash, salt, ...safeUser } = user;
    return { token, user: safeUser };
  } else {
    // Fallback mode
    const data = db.getFallbackData();
    const user = data.users.find(
      u => u.username.toLowerCase() === cleanIdentifier || u.email.toLowerCase() === cleanIdentifier
    );

    if (!user) {
      throw new Error("Tài khoản hoặc mật khẩu không chính xác!");
    }

    const isValid = db.verifyPassword(password, user.password_hash, user.salt);
    if (!isValid) {
      throw new Error("Tài khoản hoặc mật khẩu không chính xác!");
    }

    if (user.is_banned) {
      throw new Error("🚫 Tài khoản của bạn đã bị khóa bởi Quản trị viên!");
    }

    user.last_login = new Date().toISOString();

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    data.sessions.push({ token, user_id: user.id, created_at: new Date().toISOString(), expires_at: expiresAt });

    db.saveFallbackData(data);

    const { password_hash, salt: _, ...safeUser } = user;
    return { token, user: safeUser };
  }
}

/**
 * Get user by session token
 */
async function getUserByToken(token) {
  if (!token) return null;

  if (db.isPostgres && db.pool) {
    const res = await db.pool.query(
      `SELECT u.id, u.username, u.email, u.role, u.is_banned, u.created_at, u.last_login
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token = $1 AND s.expires_at > NOW()
       LIMIT 1`,
      [token]
    );
    if (res.rows.length === 0) return null;
    const user = res.rows[0];
    if (user.is_banned) {
      // Clear sessions if banned
      await db.pool.query('DELETE FROM sessions WHERE user_id = $1', [user.id]);
      return null;
    }
    return user;
  } else {
    const data = db.getFallbackData();
    const session = data.sessions.find(
      s => s.token === token && new Date(s.expires_at) > new Date()
    );
    if (!session) return null;

    const user = data.users.find(u => u.id === session.user_id);
    if (!user || user.is_banned) return null;

    const { password_hash, salt, ...safeUser } = user;
    return safeUser;
  }
}

/**
 * Logout
 */
async function logoutUser(token) {
  if (!token) return;
  if (db.isPostgres && db.pool) {
    await db.pool.query('DELETE FROM sessions WHERE token = $1', [token]);
  } else {
    const data = db.getFallbackData();
    data.sessions = data.sessions.filter(s => s.token !== token);
    db.saveFallbackData(data);
  }
}

// ==================== USER CUSTOM TAGS ====================

async function getUserTags(userId) {
  if (db.isPostgres && db.pool) {
    const res = await db.pool.query(
      'SELECT tag_name FROM user_custom_tags WHERE user_id = $1 ORDER BY id ASC',
      [userId]
    );
    return res.rows.map(r => r.tag_name);
  } else {
    const data = db.getFallbackData();
    return (data.user_custom_tags || [])
      .filter(t => t.user_id === userId)
      .map(t => t.tag_name);
  }
}

async function addUserTags(userId, tags) {
  const cleanTags = (Array.isArray(tags) ? tags : [tags])
    .map(t => (typeof t === 'string' ? t.trim() : ''))
    .filter(Boolean);

  if (cleanTags.length === 0) return await getUserTags(userId);

  if (db.isPostgres && db.pool) {
    for (const tag of cleanTags) {
      await db.pool.query(
        `INSERT INTO user_custom_tags (user_id, tag_name)
         VALUES ($1, $2)
         ON CONFLICT (user_id, tag_name) DO NOTHING`,
        [userId, tag]
      );
    }
  } else {
    const data = db.getFallbackData();
    if (!data.user_custom_tags) data.user_custom_tags = [];
    for (const tag of cleanTags) {
      const exists = data.user_custom_tags.some(t => t.user_id === userId && t.tag_name === tag);
      if (!exists) {
        data.user_custom_tags.push({
          id: Date.now() + Math.floor(Math.random() * 1000),
          user_id: userId,
          tag_name: tag,
          created_at: new Date().toISOString()
        });
      }
    }
    db.saveFallbackData(data);
  }

  return await getUserTags(userId);
}

async function removeUserTag(userId, tagName) {
  if (!tagName) return await getUserTags(userId);

  if (db.isPostgres && db.pool) {
    await db.pool.query(
      'DELETE FROM user_custom_tags WHERE user_id = $1 AND tag_name = $2',
      [userId, tagName.trim()]
    );
  } else {
    const data = db.getFallbackData();
    if (data.user_custom_tags) {
      data.user_custom_tags = data.user_custom_tags.filter(
        t => !(t.user_id === userId && t.tag_name === tagName.trim())
      );
      db.saveFallbackData(data);
    }
  }

  return await getUserTags(userId);
}

// ==================== USER STORIES (Cloud Storage) ====================

async function saveUserStory(userId, story) {
  if (!story || !story.id) throw new Error("Dữ liệu truyện không hợp lệ!");

  const title = story.title || "Truyện chưa đặt tên";
  const genreId = story.genreId || story.params?.selectedTags?.[0] || "zhihu";

  if (db.isPostgres && db.pool) {
    await db.pool.query(
      `INSERT INTO user_stories (id, user_id, title, genre_id, data, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (id) 
       DO UPDATE SET title = $3, genre_id = $4, data = $5, updated_at = NOW()`,
      [story.id, userId, title, genreId, JSON.stringify(story)]
    );
  } else {
    const data = db.getFallbackData();
    if (!data.user_stories) data.user_stories = [];
    const idx = data.user_stories.findIndex(s => s.id === story.id);
    const item = {
      id: story.id,
      user_id: userId,
      title: title,
      genre_id: genreId,
      data: story,
      created_at: story.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    if (idx >= 0) {
      data.user_stories[idx] = item;
    } else {
      data.user_stories.push(item);
    }
    db.saveFallbackData(data);
  }
  return story;
}

async function getUserStories(userId) {
  if (db.isPostgres && db.pool) {
    const res = await db.pool.query(
      `SELECT id, user_id, title, genre_id, data, created_at, updated_at 
       FROM user_stories 
       WHERE user_id = $1 
       ORDER BY updated_at DESC`,
      [userId]
    );
    return res.rows.map(r => r.data || r);
  } else {
    const data = db.getFallbackData();
    return (data.user_stories || [])
      .filter(s => s.user_id === userId)
      .map(s => s.data || s);
  }
}

async function deleteUserStory(userId, storyId) {
  if (db.isPostgres && db.pool) {
    await db.pool.query(
      'DELETE FROM user_stories WHERE id = $1 AND user_id = $2',
      [storyId, userId]
    );
  } else {
    const data = db.getFallbackData();
    if (data.user_stories) {
      data.user_stories = data.user_stories.filter(s => !(s.id === storyId && s.user_id === userId));
      db.saveFallbackData(data);
    }
  }
  return { success: true, storyId };
}

// ==================== ADMIN STORY MANAGEMENT ====================

async function adminGetUserStories(targetUserId) {
  const targetId = parseInt(targetUserId, 10);
  if (isNaN(targetId)) throw new Error("ID người dùng không hợp lệ!");

  if (db.isPostgres && db.pool) {
    const res = await db.pool.query(
      `SELECT s.id, s.user_id, s.title, s.genre_id, s.data, s.created_at, s.updated_at,
              u.username AS author_username, u.email AS author_email
       FROM user_stories s
       JOIN users u ON s.user_id = u.id
       WHERE s.user_id = $1
       ORDER BY s.updated_at DESC`,
      [targetId]
    );
    return res.rows.map(r => ({
      ...r,
      story: r.data
    }));
  } else {
    const data = db.getFallbackData();
    const user = data.users.find(u => u.id === targetId);
    return (data.user_stories || [])
      .filter(s => s.user_id === targetId)
      .map(s => ({
        id: s.id,
        user_id: s.user_id,
        title: s.title,
        genre_id: s.genre_id,
        author_username: user ? user.username : 'Unknown',
        author_email: user ? user.email : '',
        created_at: s.created_at,
        updated_at: s.updated_at,
        story: s.data || s
      }));
  }
}

async function adminGetAllStories() {
  if (db.isPostgres && db.pool) {
    const res = await db.pool.query(
      `SELECT s.id, s.user_id, s.title, s.genre_id, s.data, s.created_at, s.updated_at,
              u.username AS author_username, u.email AS author_email
       FROM user_stories s
       JOIN users u ON s.user_id = u.id
       ORDER BY s.updated_at DESC`
    );
    return res.rows.map(r => ({
      ...r,
      story: r.data
    }));
  } else {
    const data = db.getFallbackData();
    return (data.user_stories || []).map(s => {
      const user = data.users.find(u => u.id === s.user_id);
      return {
        id: s.id,
        user_id: s.user_id,
        title: s.title,
        genre_id: s.genre_id,
        author_username: user ? user.username : 'Unknown',
        author_email: user ? user.email : '',
        created_at: s.created_at,
        updated_at: s.updated_at,
        story: s.data || s
      };
    });
  }
}

async function adminDeleteStory(storyId) {
  if (db.isPostgres && db.pool) {
    await db.pool.query('DELETE FROM user_stories WHERE id = $1', [storyId]);
  } else {
    const data = db.getFallbackData();
    if (data.user_stories) {
      data.user_stories = data.user_stories.filter(s => s.id !== storyId);
      db.saveFallbackData(data);
    }
  }
  return { success: true, storyId };
}

// ==================== ADMIN MANAGEMENT ====================

async function getAllUsers() {
  if (db.isPostgres && db.pool) {
    const query = `
      SELECT 
        u.id, 
        u.username, 
        u.email, 
        u.role, 
        u.is_banned, 
        u.created_at, 
        u.last_login,
        COUNT(DISTINCT t.id)::int AS custom_tag_count,
        COUNT(DISTINCT s.id)::int AS story_count
      FROM users u
      LEFT JOIN user_custom_tags t ON u.id = t.user_id
      LEFT JOIN user_stories s ON u.id = s.user_id
      GROUP BY u.id
      ORDER BY u.id ASC
    `;
    const res = await db.pool.query(query);
    return res.rows;
  } else {
    const data = db.getFallbackData();
    return data.users.map(u => {
      const tagCount = (data.user_custom_tags || []).filter(t => t.user_id === u.id).length;
      const storyCount = (data.user_stories || []).filter(s => s.user_id === u.id).length;
      const { password_hash, salt, ...safeUser } = u;
      return {
        ...safeUser,
        custom_tag_count: tagCount,
        story_count: storyCount
      };
    });
  }
}

async function setUserBanStatus(targetUserId, isBanned) {
  const targetId = parseInt(targetUserId, 10);
  if (isNaN(targetId)) throw new Error("ID người dùng không hợp lệ!");

  if (db.isPostgres && db.pool) {
    // Check if target is admin
    const check = await db.pool.query('SELECT role FROM users WHERE id = $1', [targetId]);
    if (check.rows.length === 0) throw new Error("Không tìm thấy người dùng!");
    if (check.rows[0].role === 'admin' && isBanned) {
      throw new Error("Không thể khóa tài khoản có quyền Admin!");
    }

    await db.pool.query('UPDATE users SET is_banned = $1 WHERE id = $2', [Boolean(isBanned), targetId]);

    // If banned, drop all active sessions immediately
    if (isBanned) {
      await db.pool.query('DELETE FROM sessions WHERE user_id = $1', [targetId]);
    }
  } else {
    const data = db.getFallbackData();
    const user = data.users.find(u => u.id === targetId);
    if (!user) throw new Error("Không tìm thấy người dùng!");
    if (user.role === 'admin' && isBanned) {
      throw new Error("Không thể khóa tài khoản có quyền Admin!");
    }
    user.is_banned = Boolean(isBanned);
    if (isBanned) {
      data.sessions = data.sessions.filter(s => s.user_id !== targetId);
    }
    db.saveFallbackData(data);
  }

  return { success: true, userId: targetId, is_banned: Boolean(isBanned) };
}

async function setUserRole(targetUserId, role) {
  const targetId = parseInt(targetUserId, 10);
  if (isNaN(targetId)) throw new Error("ID người dùng không hợp lệ!");
  if (!['admin', 'user'].includes(role)) throw new Error("Vai trò không hợp lệ!");

  if (db.isPostgres && db.pool) {
    await db.pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, targetId]);
  } else {
    const data = db.getFallbackData();
    const user = data.users.find(u => u.id === targetId);
    if (!user) throw new Error("Không tìm thấy người dùng!");
    user.role = role;
    db.saveFallbackData(data);
  }

  return { success: true, userId: targetId, role };
}

async function deleteUser(targetUserId) {
  const targetId = parseInt(targetUserId, 10);
  if (isNaN(targetId)) throw new Error("ID người dùng không hợp lệ!");

  if (db.isPostgres && db.pool) {
    const check = await db.pool.query('SELECT role FROM users WHERE id = $1', [targetId]);
    if (check.rows.length === 0) throw new Error("Không tìm thấy người dùng!");
    if (check.rows[0].role === 'admin') {
      throw new Error("Không thể xóa tài khoản Admin!");
    }

    await db.pool.query('DELETE FROM users WHERE id = $1', [targetId]);
  } else {
    const data = db.getFallbackData();
    const user = data.users.find(u => u.id === targetId);
    if (!user) throw new Error("Không tìm thấy người dùng!");
    if (user.role === 'admin') {
      throw new Error("Không thể xóa tài khoản Admin!");
    }
    data.users = data.users.filter(u => u.id !== targetId);
    data.user_custom_tags = (data.user_custom_tags || []).filter(t => t.user_id !== targetId);
    data.user_stories = (data.user_stories || []).filter(s => s.user_id !== targetId);
    data.sessions = data.sessions.filter(s => s.user_id !== targetId);
    db.saveFallbackData(data);
  }

  return { success: true, deletedUserId: targetId };
}

async function getAdminStats() {
  const users = await getAllUsers();
  const totalUsers = users.length;
  const bannedUsers = users.filter(u => u.is_banned).length;
  const activeUsers = totalUsers - bannedUsers;
  const totalTags = users.reduce((sum, u) => sum + (u.custom_tag_count || 0), 0);
  const totalStories = users.reduce((sum, u) => sum + (u.story_count || 0), 0);

  return {
    totalUsers,
    activeUsers,
    bannedUsers,
    totalTags,
    totalStories,
    isNeonPostgres: db.isPostgres
  };
}

// ==================== USER API SETTINGS (Gemini Keys & Config) ====================

async function getUserApiSettings(userId) {
  if (db.isPostgres && db.pool) {
    const res = await db.pool.query(
      'SELECT api_keys, settings FROM user_api_settings WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    if (res.rows.length === 0) {
      return { api_keys: [], settings: {} };
    }
    return {
      api_keys: res.rows[0].api_keys || [],
      settings: res.rows[0].settings || {}
    };
  } else {
    const data = db.getFallbackData();
    if (!data.user_api_settings) data.user_api_settings = [];
    const found = data.user_api_settings.find(s => s.user_id === userId);
    return {
      api_keys: found ? (found.api_keys || []) : [],
      settings: found ? (found.settings || {}) : {}
    };
  }
}

async function saveUserApiSettings(userId, { api_keys, settings }) {
  const cleanKeys = (Array.isArray(api_keys) ? api_keys : [])
    .map(k => (typeof k === 'string' ? k.trim() : ''))
    .filter(Boolean);

  const cleanSettings = typeof settings === 'object' && settings !== null ? settings : {};

  if (db.isPostgres && db.pool) {
    await db.pool.query(
      `INSERT INTO user_api_settings (user_id, api_keys, settings, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id) 
       DO UPDATE SET api_keys = $2, settings = $3, updated_at = NOW()`,
      [userId, cleanKeys, JSON.stringify(cleanSettings)]
    );
  } else {
    const data = db.getFallbackData();
    if (!data.user_api_settings) data.user_api_settings = [];
    const idx = data.user_api_settings.findIndex(s => s.user_id === userId);
    const item = {
      user_id: userId,
      api_keys: cleanKeys,
      settings: cleanSettings,
      updated_at: new Date().toISOString()
    };
    if (idx >= 0) {
      data.user_api_settings[idx] = item;
    } else {
      data.user_api_settings.push(item);
    }
    db.saveFallbackData(data);
  }

  return { api_keys: cleanKeys, settings: cleanSettings };
}

module.exports = {
  registerUser,
  loginUser,
  getUserByToken,
  logoutUser,
  getUserTags,
  addUserTags,
  removeUserTag,
  getUserApiSettings,
  saveUserApiSettings,
  saveUserStory,
  getUserStories,
  deleteUserStory,
  getAllUsers,
  setUserBanStatus,
  setUserRole,
  deleteUser,
  getAdminStats,
  adminGetUserStories,
  adminGetAllStories,
  adminDeleteStory
};

