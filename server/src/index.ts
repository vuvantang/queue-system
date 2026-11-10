import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer } from 'http';
import path from 'node:path';

import { initDatabase } from './db.js';
import { initSocket } from './socket.js';
import { checkAndResetIfNewDay } from './services/reset.service.js';
import { initJwtSecret } from './middleware/auth.js';
import { corsMiddleware, rejectForeignOrigin } from './middleware/origin.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import areaRoutes from './routes/areas.js';
import serviceTypeRoutes from './routes/service-types.js';
import ticketRoutes from './routes/tickets.js';
import counterRoutes from './routes/counters.js';
import settingsRoutes from './routes/settings.js';
import reportRoutes from './routes/reports.js';
import advertisementRoutes from './routes/advertisements.js';

// Resolve the JWT secret first (fails fast on bad configuration, before the
// first-boot admin password is generated so it is never lost)
try {
  initJwtSecret();
} catch (err: any) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}

// Initialize database
const { defaultPassword } = initDatabase();

const app = express();
app.disable('x-powered-by');
const server = createServer(app);

// Middleware
app.use(corsMiddleware);
app.use('/api', rejectForeignOrigin);
app.use(express.json({ limit: '100kb' }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/areas', areaRoutes);
app.use('/api/service-types', serviceTypeRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/counters', counterRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/advertisements', advertisementRoutes);

// Home page
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'home.html'));
});

// Uploaded images: never sniffed, never executed as a document
app.use('/uploads', (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox");
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// TV Display: /tv = area selector, /tv/:areaId = display
app.get('/tv', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'tv-select.html'));
});
app.get('/tv/:areaId', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'tv.html'));
});

// Admin SPA fallback
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html'));
});
app.get('/admin/*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html'));
});

// Unknown API routes => JSON 404
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Không tìm thấy' });
});

// Final error handler: JSON only, never a stack trace
app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) { next(err); return; }
  let status = 500;
  let message = 'Lỗi máy chủ';
  if (err?.type === 'entity.parse.failed') { status = 400; message = 'Dữ liệu JSON không hợp lệ'; }
  else if (err?.type === 'entity.too.large') { status = 413; message = 'Dữ liệu quá lớn'; }
  else if (err?.name === 'MulterError') {
    status = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File quá lớn (tối đa 5MB)' : 'File tải lên không hợp lệ';
  } else if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500) {
    status = err.status;
    message = typeof err.message === 'string' && err.expose !== false ? err.message : 'Yêu cầu không hợp lệ';
  }
  if (status >= 500) console.error('Unhandled error:', err);
  res.status(status).json({ error: message });
});

// Initialize Socket.IO
initSocket(server);

// Periodic daily reset check (every 60 seconds)
setInterval(() => {
  checkAndResetIfNewDay();
}, 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Queue Server đang chạy tại http://localhost:${PORT}`);
  console.log(`📺 TV Display: http://localhost:${PORT}/tv/<areaId>`);
  console.log(`🔧 Admin: http://localhost:${PORT}/admin`);
  console.log(`📡 API: http://localhost:${PORT}/api`);
  if (defaultPassword) {
    console.log(`🔑 Tài khoản mặc định: admin / ${defaultPassword}`);
    console.log('   Mật khẩu này chỉ dùng một lần: bắt buộc đổi mật khẩu ở lần đăng nhập đầu tiên (single-use, must be changed on first login).');
  }
});
