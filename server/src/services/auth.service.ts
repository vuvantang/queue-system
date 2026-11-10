import bcrypt from 'bcryptjs';
import db from '../db.js';
import { signToken } from '../middleware/auth.js';
import type { User, JwtPayload } from '../types.js';

type SafeUser = Omit<User, 'password_hash' | 'token_version'>;

const BCRYPT_COST = 10;
const ROLES = ['admin', 'staff'] as const;
type Role = typeof ROLES[number];

export const USERNAME_MAX = 64;
export const PASSWORD_INPUT_MAX = 256;
const DISPLAY_NAME_MAX = 100;

// Compared against when the user does not exist / is inactive so every login costs one bcrypt compare.
const DUMMY_HASH = bcrypt.hashSync('bamso-dummy-password-for-timing', BCRYPT_COST);

function toSafeUser(user: User): SafeUser {
  const { password_hash, token_version, ...safeUser } = user;
  return safeUser;
}

function issueToken(user: Pick<User, 'id' | 'username' | 'role' | 'token_version'>): string {
  const payload: JwtPayload = { userId: user.id, username: user.username, role: user.role, tv: user.token_version };
  return signToken(payload);
}

export async function login(username: string, password: string): Promise<{ token: string; user: SafeUser; must_change_password: boolean }> {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
  const usable = !!user && !!user.is_active;

  // Always run exactly one bcrypt compare to avoid a username-enumeration timing oracle.
  const valid = await bcrypt.compare(password, usable ? user!.password_hash : DUMMY_HASH);
  if (!usable || !valid) throw new Error('Tên đăng nhập hoặc mật khẩu không đúng');

  return { token: issueToken(user!), user: toSafeUser(user!), must_change_password: !!user!.must_change_password };
}

export const PASSWORD_POLICY_HINT =
  'Tối thiểu 8 ký tự, gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt';

export function validatePassword(password: unknown): asserts password is string {
  if (typeof password !== 'string') throw new Error('Mật khẩu không hợp lệ');
  if (password.length < 8) throw new Error('Mật khẩu tối thiểu 8 ký tự');
  if (Buffer.byteLength(password, 'utf8') > 72) throw new Error('Mật khẩu tối đa 72 byte');
  if (!/[A-Z]/.test(password)) throw new Error('Mật khẩu cần ít nhất 1 chữ hoa');
  if (!/[a-z]/.test(password)) throw new Error('Mật khẩu cần ít nhất 1 chữ thường');
  if (!/[0-9]/.test(password)) throw new Error('Mật khẩu cần ít nhất 1 chữ số');
  if (!/[!@#$%^&*()_+\-=\[\]{};':"|,.<>?/`~]/.test(password)) throw new Error('Mật khẩu cần ít nhất 1 ký tự đặc biệt');
}

function validateRole(role: unknown): asserts role is Role {
  if (typeof role !== 'string' || !(ROLES as readonly string[]).includes(role)) {
    throw new Error('Vai trò không hợp lệ (chỉ admin hoặc staff)');
  }
}

function validateDisplayName(name: unknown): asserts name is string {
  if (typeof name !== 'string' || !name.trim() || name.length > DISPLAY_NAME_MAX) {
    throw new Error(`Tên hiển thị không hợp lệ (1-${DISPLAY_NAME_MAX} ký tự)`);
  }
}

function validateUsername(username: unknown): asserts username is string {
  if (typeof username !== 'string' || !username.trim() || username.length > USERNAME_MAX || /\s/.test(username)) {
    throw new Error(`Tên đăng nhập không hợp lệ (1-${USERNAME_MAX} ký tự, không chứa khoảng trắng)`);
  }
}

/** Change own password. Revokes all existing tokens and returns a fresh one. */
export async function changePassword(userId: number, oldPassword: string, newPassword: string): Promise<string> {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User | undefined;
  if (!user) throw new Error('Người dùng không tồn tại');

  const valid = await bcrypt.compare(oldPassword, user.password_hash);
  if (!valid) throw new Error('Mật khẩu cũ không đúng');

  validatePassword(newPassword);
  if (newPassword === oldPassword) throw new Error('Mật khẩu mới không được trùng mật khẩu cũ');

  const hash = await bcrypt.hash(newPassword, BCRYPT_COST);
  db.prepare(
    'UPDATE users SET password_hash = ?, must_change_password = 0, token_version = token_version + 1 WHERE id = ?'
  ).run(hash, userId);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User;
  return issueToken(updated);
}

export function getMe(userId: number): SafeUser {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User | undefined;
  if (!user) throw new Error('Người dùng không tồn tại');
  return toSafeUser(user);
}

// User management (admin)
export function listUsers(): SafeUser[] {
  const users = db.prepare('SELECT * FROM users ORDER BY id').all() as User[];
  return users.map(toSafeUser);
}

function countOtherActiveAdmins(excludeId: number): number {
  const row = db.prepare(
    "SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?"
  ).get(excludeId) as { count: number };
  return row.count;
}

export async function createUser(username: unknown, password: unknown, displayName: unknown, role: unknown): Promise<SafeUser> {
  validateUsername(username);
  validateDisplayName(displayName);
  validateRole(role);
  validatePassword(password);

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) throw new Error('Tên đăng nhập đã tồn tại');

  const hash = await bcrypt.hash(password, BCRYPT_COST);
  const result = db.prepare(
    'INSERT INTO users (username, password_hash, display_name, role, must_change_password) VALUES (?, ?, ?, ?, 1)'
  ).run(username, hash, displayName.trim(), role);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as User;
  return toSafeUser(user);
}

export async function updateUser(
  id: number,
  data: { display_name?: unknown; role?: unknown; is_active?: unknown; password?: unknown },
): Promise<SafeUser> {
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
  if (!current) throw new Error('Người dùng không tồn tại');

  if (data.display_name !== undefined) validateDisplayName(data.display_name);
  if (data.role !== undefined) validateRole(data.role);
  let isActive: number | undefined;
  if (data.is_active !== undefined) {
    if (data.is_active === 1 || data.is_active === true) isActive = 1;
    else if (data.is_active === 0 || data.is_active === false) isActive = 0;
    else throw new Error('Trạng thái không hợp lệ');
  }
  const newPassword = data.password !== undefined && data.password !== '' ? data.password : undefined;
  if (newPassword !== undefined) validatePassword(newPassword);

  // Last active admin guard
  const willBeAdmin = (data.role ?? current.role) === 'admin';
  const willBeActive = (isActive ?? current.is_active) === 1;
  if (current.role === 'admin' && current.is_active && (!willBeAdmin || !willBeActive) && countOtherActiveAdmins(id) === 0) {
    throw new Error('Không thể hạ quyền hoặc khoá quản trị viên đang hoạt động cuối cùng');
  }

  const hash = newPassword !== undefined ? await bcrypt.hash(newPassword, BCRYPT_COST) : undefined;

  const txn = db.transaction(() => {
    let revoke = false;
    if (data.display_name !== undefined) {
      db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run((data.display_name as string).trim(), id);
    }
    if (data.role !== undefined && data.role !== current.role) {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(data.role, id);
      revoke = true;
    }
    if (isActive !== undefined && isActive !== current.is_active) {
      db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(isActive, id);
      revoke = true;
    }
    if (hash !== undefined) {
      // Admin-set password is single-use: the user must pick their own on next login
      db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(hash, id);
      revoke = true;
    }
    if (revoke) {
      db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(id);
    }
  });
  txn();

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User;
  return toSafeUser(user);
}

export function deleteUser(id: number, actorId: number): void {
  if (id === actorId) throw new Error('Không thể tự xoá tài khoản đang đăng nhập');
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
  if (!current) throw new Error('Người dùng không tồn tại');
  if (current.role === 'admin' && current.is_active && countOtherActiveAdmins(id) === 0) {
    throw new Error('Không thể xoá quản trị viên đang hoạt động cuối cùng');
  }
  try {
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  } catch (err: any) {
    if (String(err?.code).startsWith('SQLITE_CONSTRAINT')) {
      throw new Error('Người dùng đã có lịch sử gọi số, không thể xoá. Hãy khoá tài khoản thay vì xoá.');
    }
    throw err;
  }
}
