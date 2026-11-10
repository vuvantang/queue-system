import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

export const UPLOAD_DIR = path.resolve(__dirname, '..', '..', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
export const IMAGE_TYPE_ERROR = 'Chỉ chấp nhận file ảnh (png, jpg, gif, webp)';

export class UploadError extends Error {
  status = 400;
}

/** Multer instance that keeps the file in memory (max 5MB) so its content can be checked before saving. */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXT.includes(ext)) cb(null, true);
    else cb(new UploadError(IMAGE_TYPE_ERROR));
  },
});

/** Detect image type from magic bytes. Returns the canonical extension or null. */
export function detectImageExt(buf: Buffer): '.png' | '.jpg' | '.gif' | '.webp' | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.length >= 6) {
    const sig = buf.subarray(0, 6).toString('latin1');
    if (sig === 'GIF87a' || sig === 'GIF89a') return '.gif';
  }
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return '.webp';
  return null;
}

/**
 * Validate the uploaded buffer and write it to the uploads dir as `<prefix>-<epoch-ms><ext>`,
 * with the extension derived from the detected content type. Returns the public path.
 */
export function saveImage(file: Express.Multer.File, prefix: 'logo' | 'ad'): string {
  const ext = detectImageExt(file.buffer);
  if (!ext) throw new UploadError(IMAGE_TYPE_ERROR);
  let name = '';
  for (let i = 0; i < 5; i++) {
    name = `${prefix}-${Date.now() + i}${ext}`;
    try {
      fs.writeFileSync(path.join(UPLOAD_DIR, name), file.buffer, { flag: 'wx', mode: 0o644 });
      return `/uploads/${name}`;
    } catch (err: any) {
      if (err?.code !== 'EEXIST') throw err;
    }
  }
  name = `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), file.buffer, { flag: 'wx', mode: 0o644 });
  return `/uploads/${name}`;
}

/**
 * Delete a file referenced by a public path such as `/uploads/logo-123.png`.
 * Only files that resolve to a direct child of the uploads dir are touched; errors are logged, not thrown.
 */
export function safeUnlinkUpload(publicPath: string | undefined | null): boolean {
  if (!publicPath || typeof publicPath !== 'string') return false;
  if (!publicPath.startsWith('/uploads/')) return false;
  const resolved = path.resolve(UPLOAD_DIR, publicPath.slice('/uploads/'.length));
  if (path.dirname(resolved) !== UPLOAD_DIR) return false;
  try {
    const st = fs.lstatSync(resolved);
    if (!st.isFile()) return false;
    fs.unlinkSync(resolved);
    return true;
  } catch (err: any) {
    if (err?.code !== 'ENOENT') console.error('Không thể xoá file upload:', err?.message);
    return false;
  }
}
