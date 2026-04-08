import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import db from '../db.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import type { Setting } from '../types.js';

const router = Router();

// Multer config for logo upload
const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads');
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `logo-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file ảnh (png, jpg, gif, svg, webp)'));
    }
  },
});

// Public: get settings (TV/Kiosk need org_name)
router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all() as Setting[];
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  res.json(settings);
});

router.put('/', authenticate, requireAdmin, (req, res) => {
  const entries = Object.entries(req.body) as [string, string][];
  for (const [key, value] of entries) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
  }
  const rows = db.prepare('SELECT * FROM settings').all() as Setting[];
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  res.json(settings);
});

// Upload logo
router.post('/logo', authenticate, requireAdmin, upload.single('logo'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Thiếu file logo' });
    return;
  }

  // Delete old logo if exists
  const old = db.prepare("SELECT value FROM settings WHERE key = 'logo'").get() as { value: string } | undefined;
  if (old?.value) {
    const oldPath = path.join(__dirname, '..', '..', 'public', old.value);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  const logoPath = `/uploads/${req.file.filename}`;
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('logo', ?)").run(logoPath);
  res.json({ logo: logoPath });
});

// Delete logo
router.delete('/logo', authenticate, requireAdmin, (_req, res) => {
  const old = db.prepare("SELECT value FROM settings WHERE key = 'logo'").get() as { value: string } | undefined;
  if (old?.value) {
    const oldPath = path.join(__dirname, '..', '..', 'public', old.value);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  db.prepare("DELETE FROM settings WHERE key = 'logo'").run();
  res.json({ message: 'Đã xóa logo' });
});

export default router;
