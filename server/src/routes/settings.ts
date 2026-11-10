import { Router } from 'express';
import db from '../db.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { imageUpload, saveImage, safeUnlinkUpload } from '../utils/uploads.js';
import type { Setting } from '../types.js';

const router = Router();

export const DEFAULT_LOGO = '/uploads/logo-default.jpg';
const LOGO_RE = /^\/uploads\/logo-\d+\.(png|jpe?g|gif|webp)$/;

function readSettings(): Record<string, string> {
  const rows = db.prepare('SELECT * FROM settings').all() as Setting[];
  const settings: Record<string, string> = {};
  for (const row of rows) settings[row.key] = row.value;
  return settings;
}

function isUploadedLogo(value: string | undefined): value is string {
  return typeof value === 'string' && LOGO_RE.test(value);
}

/** Per-key validators for PUT /api/settings. Each returns the normalized string to store or throws. */
const validators: Record<string, (v: unknown) => string> = {
  org_name: (v) => {
    if (typeof v !== 'string') throw new Error('Tên đơn vị không hợp lệ');
    const s = v.trim();
    if (s.length > 120) throw new Error('Tên đơn vị tối đa 120 ký tự');
    return s;
  },
  logo: (v) => {
    if (typeof v !== 'string' || (v !== DEFAULT_LOGO && !LOGO_RE.test(v))) {
      throw new Error('Đường dẫn logo không hợp lệ');
    }
    return v;
  },
  contact_phones: (v) => {
    let arr: unknown;
    try { arr = typeof v === 'string' ? JSON.parse(v) : v; } catch { throw new Error('Danh sách số điện thoại không hợp lệ'); }
    if (!Array.isArray(arr) || arr.length > 20) throw new Error('Danh sách số điện thoại không hợp lệ (tối đa 20 mục)');
    const clean = arr.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Số điện thoại không hợp lệ');
      const { label, phone } = item as { label?: unknown; phone?: unknown };
      if (typeof label !== 'string' || typeof phone !== 'string') throw new Error('Số điện thoại không hợp lệ');
      if (label.length > 60) throw new Error('Nhãn số điện thoại tối đa 60 ký tự');
      if (phone.length > 30) throw new Error('Số điện thoại tối đa 30 ký tự');
      return { label, phone };
    });
    return JSON.stringify(clean);
  },
  ad_slide_duration: (v) => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > 120) throw new Error('Thời gian chuyển ảnh phải là số nguyên từ 1 đến 120 giây');
    return String(n);
  },
};

// Public: get settings (TV/Kiosk need org_name)
router.get('/', (_req, res) => {
  res.json(readSettings());
});

router.put('/', authenticate, requireAdmin, (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
    return;
  }
  const updates: [string, string][] = [];
  try {
    for (const [key, value] of Object.entries(body)) {
      const validate = Object.prototype.hasOwnProperty.call(validators, key) ? validators[key] : undefined;
      if (!validate) throw new Error(`Không được phép cập nhật cấu hình "${key}"`);
      updates.push([key, validate(value)]);
    }
  } catch (err: any) {
    res.status(400).json({ error: err.message });
    return;
  }
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  db.transaction(() => { for (const [k, v] of updates) stmt.run(k, v); })();
  res.json(readSettings());
});

// Upload logo
router.post('/logo', authenticate, requireAdmin, imageUpload.single('logo'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Thiếu file logo' });
    return;
  }
  const logoPath = saveImage(req.file, 'logo');

  // Delete old uploaded logo (never the bundled default, never anything outside uploads/)
  const old = db.prepare("SELECT value FROM settings WHERE key = 'logo'").get() as { value: string } | undefined;
  if (isUploadedLogo(old?.value)) safeUnlinkUpload(old!.value);

  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('logo', ?)").run(logoPath);
  res.json({ logo: logoPath });
});

// Delete logo
router.delete('/logo', authenticate, requireAdmin, (_req, res) => {
  const old = db.prepare("SELECT value FROM settings WHERE key = 'logo'").get() as { value: string } | undefined;
  if (isUploadedLogo(old?.value)) safeUnlinkUpload(old!.value);
  db.prepare("DELETE FROM settings WHERE key = 'logo'").run();
  res.json({ message: 'Đã xóa logo' });
});

export default router;
