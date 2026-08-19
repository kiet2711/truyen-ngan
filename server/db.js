/**
 * Database Module for AI Novel Studio
 * Supports Neon Serverless PostgreSQL with SSL + Local JSON Fallback
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let pg = null;
try {
  pg = require('pg');
} catch (e) {
  console.warn("Thư viện 'pg' chưa được tải, sử dụng fallback mode.");
}

// Load .env if exists
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.substring(0, idx).trim();
        const value = trimmed.substring(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  });
}

const DATABASE_URL = process.env.DATABASE_URL;
let pool = null;
let isPostgres = false;

// Fallback JSON file path
const FALLBACK_DIR = path.join(__dirname, '..', 'data');
const FALLBACK_FILE = path.join(FALLBACK_DIR, 'local_db.json');

function getFallbackData() {
  if (!fs.existsSync(FALLBACK_DIR)) {
    fs.mkdirSync(FALLBACK_DIR, { recursive: true });
  }
  if (!fs.existsSync(FALLBACK_FILE)) {
    const initial = {
      users: [],
      user_custom_tags: [],
      user_stories: [],
      sessions: []
    };
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(FALLBACK_FILE, 'utf8'));
  } catch {
    return { users: [], user_custom_tags: [], user_stories: [], sessions: [] };
  }
}

function saveFallbackData(data) {
  if (!fs.existsSync(FALLBACK_DIR)) {
    fs.mkdirSync(FALLBACK_DIR, { recursive: true });
  }
  fs.writeFileSync(FALLBACK_FILE, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Hash password securely with PBKDF2
 */
function hashPassword(password, salt = null) {
  if (!salt) {
    salt = crypto.randomBytes(16).toString('hex');
  }
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

/**
 * Verify password
 */
function verifyPassword(password, hash, salt) {
  const check = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return check === hash;
}

/**
 * Initialize Database (PostgreSQL / Neon or Fallback)
 */
async function initDatabase() {
  if (DATABASE_URL && pg) {
    try {
      console.log("🔌 Đang kết nối tới Neon PostgreSQL Database...");
      pool = new pg.Pool({
        connectionString: DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });

      // Test connection
      const client = await pool.connect();
      console.log("✅ Kết nối Neon PostgreSQL thành công!");
      client.release();
      isPostgres = true;

      // Run migrations
      await runPostgresMigrations();
      return true;
    } catch (err) {
      console.warn("⚠️ Không thể kết nối tới Neon PostgreSQL:", err.message);
      console.warn("👉 Tự động chuyển sang chế độ Local Database Fallback (data/local_db.json).");
      isPostgres = false;
    }
  } else {
    console.log("ℹ️ Chưa cấu hình DATABASE_URL. Đang chạy ở chế độ Local Database Fallback (data/local_db.json).");
    console.log("👉 Để kết nối Neon, thêm DATABASE_URL vào file .env hoặc biến môi trường.");
    isPostgres = false;
  }

  // Fallback seed
  initFallbackAdmin();
  return true;
}

async function runPostgresMigrations() {
  const query = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role VARCHAR(20) DEFAULT 'user',
      is_banned BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      last_login TIMESTAMP WITH TIME ZONE
    );

    CREATE TABLE IF NOT EXISTS user_custom_tags (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      tag_name VARCHAR(100) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      CONSTRAINT unique_user_tag UNIQUE(user_id, tag_name)
    );

    CREATE TABLE IF NOT EXISTS user_stories (
      id VARCHAR(100) PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title TEXT,
      genre_id VARCHAR(50),
      data JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token VARCHAR(128) PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_api_settings (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      api_keys TEXT[] DEFAULT '{}',
      settings JSONB DEFAULT '{}',
      api_usage JSONB DEFAULT '{}',
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    ALTER TABLE user_api_settings ADD COLUMN IF NOT EXISTS api_usage JSONB DEFAULT '{}';
  `;
  await pool.query(query);

  // Seed or update default admin
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@novels.ai';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
  const { hash, salt } = hashPassword(adminPassword);

  const checkAdmin = await pool.query('SELECT id FROM users WHERE username = $1 LIMIT 1', [adminUsername]);
  if (checkAdmin.rows.length === 0) {
    await pool.query(
      `INSERT INTO users (username, email, password_hash, salt, role, is_banned)
       VALUES ($1, $2, $3, $4, 'admin', FALSE)`,
      [adminUsername, adminEmail, hash, salt]
    );
    console.log(`👑 Đã khởi tạo tài khoản Admin mặc định: ${adminUsername} (Mật khẩu: ${adminPassword})`);
  } else {
    await pool.query(
      `UPDATE users SET password_hash = $1, salt = $2, role = 'admin', is_banned = FALSE WHERE username = $3`,
      [hash, salt, adminUsername]
    );
    console.log(`👑 Đã cập nhật tài khoản Admin: ${adminUsername} (Mật khẩu: ${adminPassword})`);
  }
}

function initFallbackAdmin() {
  const data = getFallbackData();
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@novels.ai';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
  const { hash, salt } = hashPassword(adminPassword);

  const existingAdmin = data.users.find(u => u.username === adminUsername);
  if (!existingAdmin) {
    const adminUser = {
      id: 1,
      username: adminUsername,
      email: adminEmail,
      password_hash: hash,
      salt: salt,
      role: 'admin',
      is_banned: false,
      created_at: new Date().toISOString(),
      last_login: null
    };
    data.users.push(adminUser);
    saveFallbackData(data);
    console.log(`👑 Đã khởi tạo tài khoản Admin mặc định (Fallback): ${adminUsername} (Mật khẩu: ${adminPassword})`);
  } else {
    existingAdmin.password_hash = hash;
    existingAdmin.salt = salt;
    existingAdmin.role = 'admin';
    existingAdmin.is_banned = false;
    saveFallbackData(data);
    console.log(`👑 Đã cập nhật tài khoản Admin (Fallback): ${adminUsername} (Mật khẩu: ${adminPassword})`);
  }
}

module.exports = {
  get pool() { return pool; },
  get isPostgres() { return isPostgres; },
  initDatabase,
  hashPassword,
  verifyPassword,
  getFallbackData,
  saveFallbackData
};
