/**
 * AI Novel Studio - Fullstack Server with Neon PostgreSQL & Admin Auth
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const db = require('./server/db');
const auth = require('./server/auth');

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8'
};

// Helper: send JSON response
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

// Helper: parse JSON body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 2 * 1024 * 1024) { // Max 2MB
        reject(new Error("Request body too large"));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on('error', err => reject(err));
  });
}

// Helper: get current user from Authorization header
async function getAuthUser(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  return await auth.getUserByToken(token);
}

// Create HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  // ==================== API ROUTING ====================
  if (pathname.startsWith('/api/')) {
    try {
      // 1. Health & DB Status Check
      if (pathname === '/api/health' && req.method === 'GET') {
        return sendJson(res, 200, {
          status: 'ok',
          database: db.isPostgres ? 'neon-postgresql' : 'local-fallback',
          timestamp: new Date().toISOString()
        });
      }

      // 2. Auth: Register
      if (pathname === '/api/auth/register' && req.method === 'POST') {
        const body = await parseBody(req);
        const result = await auth.registerUser(body);
        return sendJson(res, 201, { success: true, ...result });
      }

      // 3. Auth: Login
      if (pathname === '/api/auth/login' && req.method === 'POST') {
        const body = await parseBody(req);
        const result = await auth.loginUser(body);
        return sendJson(res, 200, { success: true, ...result });
      }

      // 4. Auth: Get Current User (Me)
      if (pathname === '/api/auth/me' && req.method === 'GET') {
        const user = await getAuthUser(req);
        if (!user) {
          return sendJson(res, 401, { error: "Chưa đăng nhập hoặc phiên đã hết hạn" });
        }
        return sendJson(res, 200, { success: true, user });
      }

      // 5. Auth: Logout
      if (pathname === '/api/auth/logout' && req.method === 'POST') {
        const authHeader = req.headers['authorization'];
        const match = authHeader ? authHeader.match(/^Bearer\s+(.+)$/i) : null;
        if (match) {
          await auth.logoutUser(match[1]);
        }
        return sendJson(res, 200, { success: true, message: "Đã đăng xuất" });
      }

      // 6. User Custom Tags: GET
      if (pathname === '/api/user/tags' && req.method === 'GET') {
        const user = await getAuthUser(req);
        if (!user) {
          return sendJson(res, 401, { error: "Vui lòng đăng nhập để xem thẻ đã lưu" });
        }
        const tags = await auth.getUserTags(user.id);
        return sendJson(res, 200, { success: true, tags });
      }

      // 7. User Custom Tags: POST (Add tags)
      if (pathname === '/api/user/tags' && req.method === 'POST') {
        const user = await getAuthUser(req);
        if (!user) {
          return sendJson(res, 401, { error: "Vui lòng đăng nhập để lưu thẻ" });
        }
        const body = await parseBody(req);
        const updatedTags = await auth.addUserTags(user.id, body.tags || body.tag);
        return sendJson(res, 200, { success: true, tags: updatedTags });
      }

      // 8. User Custom Tags: DELETE
      if (pathname.startsWith('/api/user/tags/') && req.method === 'DELETE') {
        const user = await getAuthUser(req);
        if (!user) {
          return sendJson(res, 401, { error: "Vui lòng đăng nhập để xóa thẻ" });
        }
        const tagName = pathname.substring('/api/user/tags/'.length);
        const updatedTags = await auth.removeUserTag(user.id, tagName);
        return sendJson(res, 200, { success: true, tags: updatedTags });
      }

      // 9. User API Settings: GET
      if (pathname === '/api/user/api-settings' && req.method === 'GET') {
        const user = await getAuthUser(req);
        if (!user) {
          return sendJson(res, 401, { error: "Vui lòng đăng nhập để lấy cấu hình API" });
        }
        const data = await auth.getUserApiSettings(user.id);
        return sendJson(res, 200, { success: true, ...data });
      }

      // 10. User API Settings: POST
      if (pathname === '/api/user/api-settings' && req.method === 'POST') {
        const user = await getAuthUser(req);
        if (!user) {
          return sendJson(res, 401, { error: "Vui lòng đăng nhập để lưu cấu hình API" });
        }
        const body = await parseBody(req);
        const saved = await auth.saveUserApiSettings(user.id, {
          api_keys: body.api_keys || body.apiKeys,
          settings: body.settings
        });
        return sendJson(res, 200, { success: true, ...saved });
      }

      // ==================== ADMIN ENDPOINTS (Role = 'admin' Required) ====================
      if (pathname.startsWith('/api/admin/')) {
        const user = await getAuthUser(req);
        if (!user) {
          return sendJson(res, 401, { error: "Vui lòng đăng nhập" });
        }
        if (user.role !== 'admin') {
          return sendJson(res, 403, { error: "Bạn không có quyền truy cập trang Quản trị Admin" });
        }

        // Admin: Get all users
        if (pathname === '/api/admin/users' && req.method === 'GET') {
          const users = await auth.getAllUsers();
          return sendJson(res, 200, { success: true, users });
        }

        // Admin: Ban / Unban user
        const banMatch = pathname.match(/^\/api\/admin\/users\/(\d+)\/ban$/);
        if (banMatch && req.method === 'POST') {
          const targetId = banMatch[1];
          const body = await parseBody(req);
          const result = await auth.setUserBanStatus(targetId, body.is_banned);
          return sendJson(res, 200, result);
        }

        // Admin: Set Role (admin/user)
        const roleMatch = pathname.match(/^\/api\/admin\/users\/(\d+)\/role$/);
        if (roleMatch && req.method === 'POST') {
          const targetId = roleMatch[1];
          const body = await parseBody(req);
          const result = await auth.setUserRole(targetId, body.role);
          return sendJson(res, 200, result);
        }

        // Admin: Delete user
        const deleteMatch = pathname.match(/^\/api\/admin\/users\/(\d+)$/);
        if (deleteMatch && req.method === 'DELETE') {
          const targetId = deleteMatch[1];
          const result = await auth.deleteUser(targetId);
          return sendJson(res, 200, result);
        }

        // Admin: Stats
        if (pathname === '/api/admin/stats' && req.method === 'GET') {
          const stats = await auth.getAdminStats();
          return sendJson(res, 200, { success: true, stats });
        }
      }

      // Not found API
      return sendJson(res, 404, { error: "API endpoint not found" });

    } catch (err) {
      console.error("API Error:", err);
      return sendJson(res, 400, { error: err.message || "Lỗi xử lý yêu cầu" });
    }
  }

  // ==================== STATIC ASSETS SERVING ====================
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback for SPA or return 404
      if (!path.extname(pathname)) {
        filePath = path.join(__dirname, 'index.html');
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
  });
});

// Start Database and HTTP Server
async function start() {
  await db.initDatabase();

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`🚀 AI NOVEL STUDIO (Auth & Neon DB Ready)`);
    console.log(`👉 Local:   http://localhost:${PORT}`);
    console.log(`👉 Network: http://0.0.0.0:${PORT}`);
    console.log(`👑 Admin:   admin / Admin@123456`);
    console.log(`====================================================`);
  });
}

start().catch(err => {
  console.error("Lỗi khởi động server:", err);
});
