import { Router } from 'express';
import db from '../db.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { imageUpload, saveImage, safeUnlinkUpload } from '../utils/uploads.js';
import type { Advertisement } from '../types.js';

const router = Router();

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
  const { order } = (req.body ?? {}) as { order: unknown };
  if (!Array.isArray(order) || order.length > 1000 || !order.every(id => Number.isInteger(id))) {
    res.status(400).json({ error: 'Thiếu danh sách thứ tự' });
    return;
  }
  const stmt = db.prepare('UPDATE advertisements SET sort_order = ? WHERE id = ?');
  const transaction = db.transaction(() => {
    (order as number[]).forEach((id, index) => {
      stmt.run(index, id);
    });
  });
  transaction();
  const ads = db.prepare('SELECT * FROM advertisements ORDER BY sort_order ASC').all() as Advertisement[];
  res.json(ads);
});

// Admin: upload ad image
router.post('/', authenticate, requireAdmin, imageUpload.single('image'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Thiếu file ảnh' });
    return;
  }
  const imagePath = saveImage(req.file, 'ad');
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
  const { is_active, sort_order } = (req.body ?? {}) as { is_active?: unknown; sort_order?: unknown };
  if ((is_active !== undefined && is_active !== 0 && is_active !== 1) ||
      (sort_order !== undefined && !Number.isInteger(sort_order))) {
    res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
    return;
  }

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
  safeUnlinkUpload(ad.image_path);

  db.prepare('DELETE FROM advertisements WHERE id = ?').run(id);
  res.json({ message: 'Đã xóa quảng cáo' });
});

export default router;
