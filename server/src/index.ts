import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import path from 'node:path';

import { initDatabase } from './db.js';
import { initSocket } from './socket.js';
import { checkAndResetIfNewDay } from './services/reset.service.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import areaRoutes from './routes/areas.js';
import serviceTypeRoutes from './routes/service-types.js';
import ticketRoutes from './routes/tickets.js';
import counterRoutes from './routes/counters.js';
import settingsRoutes from './routes/settings.js';
import reportRoutes from './routes/reports.js';
import advertisementRoutes from './routes/advertisements.js';

// Initialize database
const { defaultPassword } = initDatabase();

const app = express();
const server = createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

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

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// TV Display: /tv = area selector, /tv/:areaId = display
app.get('/tv', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'tv-select.html'));
});
app.get('/tv/:areaId', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'tv.html'));
});

// Admin login page
app.get('/admin/login', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'login.html'));
});

// Admin SPA fallback
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html'));
});
app.get('/admin/*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html'));
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
  }
});
