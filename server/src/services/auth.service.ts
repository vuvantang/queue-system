import bcrypt from 'bcryptjs';
import db from '../db.js';
import { signToken } from '../middleware/auth.js';
import type { User, JwtPayload } from '../types.js';

export function login(username: string, password: string): { token: string; user: Omit<User, 'password_hash'>; must_change_password: boolean } {
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username) as User | undefined;
  if (!user) throw new Error('Tên đăng nhập hoặc mật khẩu không đúng');

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) throw new Error('Tên đăng nhập hoặc mật khẩu không đúng');

  const payload: JwtPayload = { userId: user.id, username: user.username, role: user.role };
  const token = signToken(payload);

  const { password_hash, ...safeUser } = user;
  return { token, user: safeUser, must_change_password: !!user.must_change_password };
}

function validatePassword(password: string): void {
  if (password.length < 8) throw new Error('Mật khẩu tối thiểu 8 ký tự');
  if (!/[A-Z]/.test(password)) throw new Error('Mật khẩu cần ít nhất 1 chữ hoa');
  if (!/[a-z]/.test(password)) throw new Error('Mật khẩu cần ít nhất 1 chữ thường');
  if (!/[0-9]/.test(password)) throw new Error('Mật khẩu cần ít nhất 1 chữ số');
  if (!/[!@#$%^&*()_+\-=\[\]{};':"|,.<>?/`~]/.test(password)) throw new Error('Mật khẩu cần ít nhất 1 ký tự đặc biệt');
}

export function changePassword(userId: number, oldPassword: string, newPassword: string): void {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User | undefined;
  if (!user) throw new Error('Người dùng không tồn tại');

  const valid = bcrypt.compareSync(oldPassword, user.password_hash);
  if (!valid) throw new Error('Mật khẩu cũ không đúng');

  validatePassword(newPassword);
  if (newPassword === oldPassword) throw new Error('Mật khẩu mới không được trùng mật khẩu cũ');

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hash, userId);
}

export function getMe(userId: number): Omit<User, 'password_hash'> {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User | undefined;
  if (!user) throw new Error('Người dùng không tồn tại');
  const { password_hash, ...safeUser } = user;
  return safeUser;
}

// User management (admin)
export function listUsers(): Omit<User, 'password_hash'>[] {
  const users = db.prepare('SELECT * FROM users ORDER BY id').all() as User[];
  return users.map(({ password_hash, ...u }) => u);
}

export function createUser(username: string, password: string, displayName: string, role: 'admin' | 'staff'): Omit<User, 'password_hash'> {
  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)'
  ).run(username, hash, displayName, role);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as User;
  const { password_hash, ...safeUser } = user;
  return safeUser;
}

export function updateUser(id: number, data: { display_name?: string; role?: string; is_active?: number; password?: string }): Omit<User, 'password_hash'> {
  if (data.display_name !== undefined) {
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(data.display_name, id);
  }
  if (data.role !== undefined) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(data.role, id);
  }
  if (data.is_active !== undefined) {
    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(data.is_active, id);
  }
  if (data.password) {
    const hash = bcrypt.hashSync(data.password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User;
  if (!user) throw new Error('Người dùng không tồn tại');
  const { password_hash, ...safeUser } = user;
  return safeUser;
}

export function deleteUser(id: number): void {
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  if (result.changes === 0) throw new Error('Người dùng không tồn tại');
}
