import Database, { type Database as DatabaseType } from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', 'data', 'bamso.db');
const db: DatabaseType = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): { defaultPassword?: string } {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      username              TEXT NOT NULL UNIQUE,
      password_hash         TEXT NOT NULL,
      display_name          TEXT NOT NULL,
      role                  TEXT NOT NULL DEFAULT 'staff',
      is_active             INTEGER NOT NULL DEFAULT 1,
      must_change_password  INTEGER NOT NULL DEFAULT 0,
      created_at            TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS areas (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      name              TEXT NOT NULL,
      next_number       INTEGER NOT NULL DEFAULT 1,
      is_active         INTEGER NOT NULL DEFAULT 1,
      announce_template TEXT NOT NULL DEFAULT 'Mời số {ticket}, đến {counter}'
    );

    CREATE TABLE IF NOT EXISTS service_types (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      area_id     INTEGER NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      prefix      TEXT NOT NULL,
      is_active   INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS counters (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      area_id   INTEGER NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
      name      TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_number   TEXT NOT NULL,
      service_type_id INTEGER NOT NULL REFERENCES service_types(id),
      area_id         INTEGER NOT NULL REFERENCES areas(id),
      status          TEXT NOT NULL DEFAULT 'waiting',
      counter_id      INTEGER REFERENCES counters(id),
      called_by       INTEGER REFERENCES users(id),
      created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      called_at       TEXT,
      completed_at    TEXT
    );

    CREATE TABLE IF NOT EXISTS advertisements (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      image_path TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_tickets_area_status ON tickets(area_id, status);
    CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_at);
  `);

  // Migrations
  const areaColumns = db.prepare("PRAGMA table_info(areas)").all() as { name: string }[];
  if (!areaColumns.find(c => c.name === 'next_number')) {
    db.exec("ALTER TABLE areas ADD COLUMN next_number INTEGER NOT NULL DEFAULT 1");
  }
  if (!areaColumns.find(c => c.name === 'announce_template')) {
    db.exec("ALTER TABLE areas ADD COLUMN announce_template TEXT NOT NULL DEFAULT 'Mời số {ticket}, đến {counter}'");
  }

  const userColumns = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!userColumns.find(c => c.name === 'must_change_password')) {
    db.exec("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0");
  }

  // Seed default data if empty
  return seedDefaults();
}

function seedDefaults(): { defaultPassword?: string } {
  let defaultPassword: string | undefined;

  // Seed admin user
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (userCount.count === 0) {
    defaultPassword = crypto.randomBytes(6).toString('base64url');
    const hash = bcrypt.hashSync(defaultPassword, 10);
    db.prepare(
      `INSERT INTO users (username, password_hash, display_name, role, must_change_password) VALUES (?, ?, ?, ?, ?)`
    ).run('admin', hash, 'Quản trị viên', 'admin', 1);
  }

  // Seed settings
  const settingsCount = db.prepare('SELECT COUNT(*) as count FROM settings').get() as { count: number };
  if (settingsCount.count === 0) {
    const today = new Date().toLocaleDateString('en-CA');
    db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`).run('org_name', 'CÔNG AN XÃ IA LE');
    db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`).run('last_reset_date', today);
    db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`).run('logo', '/uploads/logo-default.jpg');
    db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`).run('contact_phones', '[]');
  }

  // Seed ad_slide_duration if not exists
  const adDuration = db.prepare("SELECT value FROM settings WHERE key = 'ad_slide_duration'").get();
  if (!adDuration) {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run('ad_slide_duration', '5');
  }

  // Seed default area
  const areaCount = db.prepare('SELECT COUNT(*) as count FROM areas').get() as { count: number };
  if (areaCount.count === 0) {
    const result = db.prepare(
      `INSERT INTO areas (name, announce_template) VALUES (?, ?)`
    ).run('Khu vực dịch vụ công', 'Mời quý khách hàng có số {ticket}, đến {counter}');
    const areaId = result.lastInsertRowid;

    // Seed service types
    db.prepare(`INSERT INTO service_types (area_id, name, prefix) VALUES (?, ?, ?)`).run(areaId, 'Đăng ký cư trú', 'A');
    db.prepare(`INSERT INTO service_types (area_id, name, prefix) VALUES (?, ?, ?)`).run(areaId, 'Đăng ký xe', 'B');
    db.prepare(`INSERT INTO service_types (area_id, name, prefix) VALUES (?, ?, ?)`).run(areaId, 'Cấp đổi giấy phép lái xe', 'C');
    db.prepare(`INSERT INTO service_types (area_id, name, prefix) VALUES (?, ?, ?)`).run(areaId, 'Làm Căn cước công dân', 'D');

    // Seed counters
    db.prepare(`INSERT INTO counters (area_id, name) VALUES (?, ?)`).run(areaId, 'Quầy 1');
    db.prepare(`INSERT INTO counters (area_id, name) VALUES (?, ?)`).run(areaId, 'Quầy 2');
    db.prepare(`INSERT INTO counters (area_id, name) VALUES (?, ?)`).run(areaId, 'Quầy 3');
    db.prepare(`INSERT INTO counters (area_id, name) VALUES (?, ?)`).run(areaId, 'Quầy 4');
  }

  return { defaultPassword };
}

export default db;
