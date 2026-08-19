/**
 * AI Novel Studio - Fullstack Server with Neon PostgreSQL & Admin Auth
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./server/db');
const auth = require('./server/auth');
const capcutStt = require('./server/capcutStt');

const PORT = process.env.PORT || 3000;

// In-memory Task store for asynchronous STT operations
const sttTasks = new Map();

// Periodic cleanup of completed/expired STT tasks (> 1 hour)
setInterval(() => {
  const now = Date.now();
  for (const [id, task] of sttTasks.entries()) {
    if (now - task.createdAt > 3600000) {
      sttTasks.delete(id);
    }
  }
}, 600000);

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
          settings: body.settings,
          api_usage: body.api_usage || body.apiUsage
        });
        return sendJson(res, 200, { success: true, ...saved });
      }

      // 11. User Stories: GET
      if (pathname === '/api/user/stories' && req.method === 'GET') {
        const user = await getAuthUser(req);
        if (!user) {
          return sendJson(res, 401, { error: "Vui lòng đăng nhập để lấy danh sách truyện" });
        }
        const stories = await auth.getUserStories(user.id);
        return sendJson(res, 200, { success: true, stories });
      }

      // 12. User Stories: POST (Save / Sync)
      if (pathname === '/api/user/stories' && req.method === 'POST') {
        const user = await getAuthUser(req);
        if (!user) {
          return sendJson(res, 401, { error: "Vui lòng đăng nhập để lưu truyện" });
        }
        const body = await parseBody(req);
        const story = await auth.saveUserStory(user.id, body.story || body);
        return sendJson(res, 200, { success: true, story });
      }

      // 13. User Stories: DELETE
      if (pathname.startsWith('/api/user/stories/') && req.method === 'DELETE') {
        const user = await getAuthUser(req);
        if (!user) {
          return sendJson(res, 401, { error: "Vui lòng đăng nhập" });
        }
        const storyId = pathname.substring('/api/user/stories/'.length);
        const result = await auth.deleteUserStory(user.id, storyId);
        return sendJson(res, 200, result);
      }

      // ==================== STT (SPEECH-TO-TEXT) ENDPOINTS ====================

      // 14. STT: Direct / Synchronous Transcribe
      if (pathname === '/api/stt/transcribe' && req.method === 'POST') {
        const language = req.headers['x-language'] || req.headers['language'] || 'vi-VN';
        const useTranslation = req.headers['x-use-translation'] === 'true' || req.headers['x-use-translation'] === '1';
        const translationLanguage = req.headers['x-translation-language'] || 'vi-VN';

        const chunks = [];
        let totalSize = 0;
        req.on('data', chunk => {
          chunks.push(chunk);
          totalSize += chunk.length;
          if (totalSize > 120 * 1024 * 1024) { // 120MB limit
            req.destroy(new Error("File âm thanh vượt quá giới hạn 120MB."));
          }
        });

        req.on('end', async () => {
          try {
            let buffer = Buffer.concat(chunks);
            let finalLang = language;
            let finalUseTrans = useTranslation;
            let finalTransLang = translationLanguage;

            const contentType = req.headers['content-type'] || '';
            if (contentType.includes('application/json')) {
              const jsonBody = JSON.parse(buffer.toString('utf-8'));
              if (jsonBody.audioBase64) {
                buffer = Buffer.from(jsonBody.audioBase64, 'base64');
              }
              if (jsonBody.language) finalLang = jsonBody.language;
              if (jsonBody.useTranslation !== undefined) finalUseTrans = Boolean(jsonBody.useTranslation);
              if (jsonBody.translationLanguage) finalTransLang = jsonBody.translationLanguage;
            }

            if (!buffer || buffer.length === 0) {
              return sendJson(res, 400, { error: "Không tìm thấy dữ liệu tệp âm thanh hợp lệ." });
            }

            const result = await capcutStt.transcribeAudioBuffer(buffer, {
              language: finalLang,
              useTranslation: finalUseTrans,
              translationLanguage: finalTransLang
            });

            return sendJson(res, 200, { success: true, data: result });
          } catch (err) {
            console.error("STT Transcribe Error:", err);
            return sendJson(res, 500, { error: err.message || "Lỗi xử lý nhận dạng giọng nói STT." });
          }
        });
        return;
      }

      // 15. STT: Start Async Task
      if (pathname === '/api/stt/start' && req.method === 'POST') {
        const language = req.headers['x-language'] || req.headers['language'] || 'vi-VN';
        const useTranslation = req.headers['x-use-translation'] === 'true' || req.headers['x-use-translation'] === '1';
        const translationLanguage = req.headers['x-translation-language'] || 'vi-VN';

        const chunks = [];
        let totalSize = 0;
        req.on('data', chunk => {
          chunks.push(chunk);
          totalSize += chunk.length;
          if (totalSize > 120 * 1024 * 1024) {
            req.destroy(new Error("File âm thanh vượt quá giới hạn 120MB."));
          }
        });

        req.on('end', async () => {
          try {
            let buffer = Buffer.concat(chunks);
            let finalLang = language;
            let finalUseTrans = useTranslation;
            let finalTransLang = translationLanguage;

            const contentType = req.headers['content-type'] || '';
            if (contentType.includes('application/json')) {
              const jsonBody = JSON.parse(buffer.toString('utf-8'));
              if (jsonBody.audioBase64) {
                buffer = Buffer.from(jsonBody.audioBase64, 'base64');
              }
              if (jsonBody.language) finalLang = jsonBody.language;
              if (jsonBody.useTranslation !== undefined) finalUseTrans = Boolean(jsonBody.useTranslation);
              if (jsonBody.translationLanguage) finalTransLang = jsonBody.translationLanguage;
            }

            if (!buffer || buffer.length === 0) {
              return sendJson(res, 400, { error: "Không tìm thấy dữ liệu tệp âm thanh hợp lệ." });
            }

            const taskId = crypto.randomUUID();
            const taskObj = {
              id: taskId,
              status: 'processing',
              progress: 10,
              phase: 'uploading',
              message: 'Đang tải tệp âm thanh lên CapCut Cloud...',
              createdAt: Date.now(),
              result: null,
              error: null
            };
            sttTasks.set(taskId, taskObj);

            // Execute async task in background
            capcutStt.transcribeAudioBuffer(buffer, {
              language: finalLang,
              useTranslation: finalUseTrans,
              translationLanguage: finalTransLang
            }, (prog) => {
              taskObj.phase = prog.phase;
              taskObj.message = prog.message;
              if (prog.phase === 'uploading') taskObj.progress = 25;
              else if (prog.phase === 'creating_task') taskObj.progress = 45;
              else if (prog.phase === 'polling') {
                taskObj.progress = Math.min(95, 45 + Math.round((prog.elapsed || 1) * 2));
              }
            }).then(result => {
              taskObj.status = 'completed';
              taskObj.progress = 100;
              taskObj.message = 'Nhận dạng giọng nói thành công!';
              taskObj.result = result;
            }).catch(err => {
              console.error(`STT Task ${taskId} failed:`, err);
              taskObj.status = 'failed';
              taskObj.error = err.message || 'Lỗi nhận dạng giọng nói';
              taskObj.message = err.message || 'Lỗi nhận dạng giọng nói';
            });

            return sendJson(res, 200, { success: true, taskId, message: "Đã bắt đầu tác vụ nhận dạng STT" });
          } catch (err) {
            console.error("STT Start Error:", err);
            return sendJson(res, 500, { error: err.message || "Lỗi khởi tạo tác vụ STT." });
          }
        });
        return;
      }

      // 16. STT: Get Task Status
      if (pathname.startsWith('/api/stt/status/') && req.method === 'GET') {
        const taskId = pathname.substring('/api/stt/status/'.length);
        const task = sttTasks.get(taskId);
        if (!task) {
          return sendJson(res, 404, { error: "Không tìm thấy tác vụ STT hoặc đã hết hạn" });
        }
        return sendJson(res, 200, {
          success: true,
          taskId: task.id,
          status: task.status,
          progress: task.progress,
          phase: task.phase,
          message: task.message,
          error: task.error
        });
      }

      // 17. STT: Get Task Result
      if (pathname.startsWith('/api/stt/result/') && req.method === 'GET') {
        const taskId = pathname.substring('/api/stt/result/'.length);
        const task = sttTasks.get(taskId);
        if (!task) {
          return sendJson(res, 404, { error: "Không tìm thấy tác vụ STT hoặc đã hết hạn" });
        }
        if (task.status !== 'completed' || !task.result) {
          return sendJson(res, 400, { error: "Tác vụ chưa hoàn thành hoặc đã thất bại", status: task.status });
        }
        return sendJson(res, 200, { success: true, data: task.result });
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

        // Admin: Read stories of a specific user
        const userStoriesMatch = pathname.match(/^\/api\/admin\/users\/(\d+)\/stories$/);
        if (userStoriesMatch && req.method === 'GET') {
          const targetId = userStoriesMatch[1];
          const stories = await auth.adminGetUserStories(targetId);
          return sendJson(res, 200, { success: true, stories });
        }

        // Admin: Get all stories across all users
        if (pathname === '/api/admin/stories' && req.method === 'GET') {
          const stories = await auth.adminGetAllStories();
          return sendJson(res, 200, { success: true, stories });
        }

        // Admin: Delete any story
        const adminDelStoryMatch = pathname.match(/^\/api\/admin\/stories\/(.+)$/);
        if (adminDelStoryMatch && req.method === 'DELETE') {
          const storyId = adminDelStoryMatch[1];
          const result = await auth.adminDeleteStory(storyId);
          return sendJson(res, 200, result);
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
    console.log(`👑 Admin:   admin / admin`);
    console.log(`====================================================`);
  });
}

start().catch(err => {
  console.error("Lỗi khởi động server:", err);
});
