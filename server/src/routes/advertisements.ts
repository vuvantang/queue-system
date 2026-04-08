import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import db from '../db.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import type { Advertisement } from '../types.js';

const router = Router();

// Multer config for ad image upload
const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads');
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `ad-${Date.now()}${ext}`);
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

// Public: get all active ads (for TV display)
router.get('/', (_req, res) => {
  const ads = db.prepare(
    'SELECT * FROM advertisements WHERE is_active = 1 ORDER BY sort_order ASC'
  ).all() as Advertisement[];
  res.json(ads);
});

// Admin: get all ads (including inactive)
router.get('/all', authenticate, requireAdmin, (_req, res) => {
  const ads = db.prepare(
    'SELECT * FROM advertisements ORDER BY sort_order ASC'
  ).all() as Advertisement[];
  res.json(ads);
});

// Admin: reorder ads (MUST be before /:id)
router.put('/reorder', authenticate, requireAdmin, (req, res) => {
  const { order } = req.body as { order: number[] };
  if (!Array.isArray(order)) {
    res.status(400).json({ error: 'Thiếu danh sách thứ tự' });
    return;
  }
  const stmt = db.prepare('UPDATE advertisements SET sort_order = ? WHERE id = ?');
  const transaction = db.transaction(() => {
    order.forEach((id, index) => {
      stmt.run(index, id);
    });
  });
  transaction();
  const ads = db.prepare('SELECT * FROM advertisements ORDER BY sort_order ASC').all() as Advertisement[];
  res.json(ads);
});

// Admin: upload ad image
router.post('/', authenticate, requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Thiếu file ảnh' });
    return;
  }
  const imagePath = `/uploads/${req.file.filename}`;
  const maxOrder = db.prepare('SELECT MAX(sort_order) as max_order FROM advertisements').get() as { max_order: number | null };
  const sortOrder = (maxOrder?.max_order ?? -1) + 1;

  const result = db.prepare(
    'INSERT INTO advertisements (image_path, sort_order) VALUES (?, ?)'
  ).run(imagePath, sortOrder);

  const ad = db.prepare('SELECT * FROM advertisements WHERE id = ?').get(result.lastInsertRowid) as Advertisement;
  res.json(ad);
});

// Admin: update ad (is_active, sort_order)
router.put('/:id', authenticate, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { is_active, sort_order } = req.body as { is_active?: number; sort_order?: number };

  const ad = db.prepare('SELECT * FROM advertisements WHERE id = ?').get(id) as Advertisement | undefined;
  if (!ad) {
    res.status(404).json({ error: 'Không tìm thấy quảng cáo' });
    return;
  }

  if (is_active !== undefined) {
    db.prepare('UPDATE advertisements SET is_active = ? WHERE id = ?').run(is_active, id);
  }
  if (sort_order !== undefined) {
    db.prepare('UPDATE advertisements SET sort_order = ? WHERE id = ?').run(sort_order, id);
  }

  const updated = db.prepare('SELECT * FROM advertisements WHERE id = ?').get(id) as Advertisement;
  res.json(updated);
});

// Admin: delete ad
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const { id } = req.params;
  const ad = db.prepare('SELECT * FROM advertisements WHERE id = ?').get(id) as Advertisement | undefined;
  if (!ad) {
    res.status(404).json({ error: 'Không tìm thấy quảng cáo' });
    return;
  }

  // Delete image file from disk
  const filePath = path.join(__dirname, '..', '..', 'public', ad.image_path);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  db.prepare('DELETE FROM advertisements WHERE id = ?').run(id);
  res.json({ message: 'Đã xóa quảng cáo' });
});

export default router;
