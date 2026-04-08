import db from '../db.js';
import type { Area, ServiceType, Counter } from '../types.js';

// Areas
export function listAreas(): Area[] {
  return db.prepare('SELECT * FROM areas ORDER BY id').all() as Area[];
}

export function getArea(id: number): Area {
  const area = db.prepare('SELECT * FROM areas WHERE id = ?').get(id) as Area | undefined;
  if (!area) throw new Error('Khu vực không tồn tại');
  return area;
}

export function createArea(name: string): Area {
  const result = db.prepare('INSERT INTO areas (name) VALUES (?)').run(name);
  return db.prepare('SELECT * FROM areas WHERE id = ?').get(result.lastInsertRowid) as Area;
}

export function updateArea(id: number, data: { name?: string; is_active?: number; announce_template?: string }): Area {
  if (data.name !== undefined) {
    db.prepare('UPDATE areas SET name = ? WHERE id = ?').run(data.name, id);
  }
  if (data.is_active !== undefined) {
    db.prepare('UPDATE areas SET is_active = ? WHERE id = ?').run(data.is_active, id);
  }
  if (data.announce_template !== undefined) {
    db.prepare('UPDATE areas SET announce_template = ? WHERE id = ?').run(data.announce_template, id);
  }
  return getArea(id);
}

export function deleteArea(id: number): void {
  const result = db.prepare('DELETE FROM areas WHERE id = ?').run(id);
  if (result.changes === 0) throw new Error('Khu vực không tồn tại');
}

// Service Types
export function listServiceTypes(areaId: number): ServiceType[] {
  return db.prepare('SELECT * FROM service_types WHERE area_id = ? ORDER BY id').all(areaId) as ServiceType[];
}

export function createServiceType(areaId: number, name: string, prefix: string): ServiceType {
  const existing = db.prepare('SELECT id FROM service_types WHERE area_id = ? AND prefix = ?').get(areaId, prefix);
  if (existing) throw new Error(`Prefix "${prefix}" đã tồn tại trong khu vực này`);

  const result = db.prepare(
    'INSERT INTO service_types (area_id, name, prefix) VALUES (?, ?, ?)'
  ).run(areaId, name, prefix);
  return db.prepare('SELECT * FROM service_types WHERE id = ?').get(result.lastInsertRowid) as ServiceType;
}

export function updateServiceType(id: number, data: { name?: string; prefix?: string; is_active?: number }): ServiceType {
  const current = db.prepare('SELECT * FROM service_types WHERE id = ?').get(id) as ServiceType | undefined;
  if (!current) throw new Error('Loại dịch vụ không tồn tại');

  if (data.prefix !== undefined && data.prefix !== current.prefix) {
    const existing = db.prepare('SELECT id FROM service_types WHERE area_id = ? AND prefix = ? AND id != ?').get(current.area_id, data.prefix, id);
    if (existing) throw new Error(`Prefix "${data.prefix}" đã tồn tại trong khu vực này`);
    db.prepare('UPDATE service_types SET prefix = ? WHERE id = ?').run(data.prefix, id);
  }
  if (data.name !== undefined) {
    db.prepare('UPDATE service_types SET name = ? WHERE id = ?').run(data.name, id);
  }
  if (data.is_active !== undefined) {
    db.prepare('UPDATE service_types SET is_active = ? WHERE id = ?').run(data.is_active, id);
  }
  return db.prepare('SELECT * FROM service_types WHERE id = ?').get(id) as ServiceType;
}

export function deleteServiceType(id: number): void {
  const txn = db.transaction(() => {
    db.prepare('DELETE FROM tickets WHERE service_type_id = ?').run(id);
    const result = db.prepare('DELETE FROM service_types WHERE id = ?').run(id);
    if (result.changes === 0) throw new Error('Loại dịch vụ không tồn tại');
  });
  txn();
}

// Counters
export function listCounters(areaId: number): Counter[] {
  return db.prepare('SELECT * FROM counters WHERE area_id = ? ORDER BY id').all(areaId) as Counter[];
}

export function createCounter(areaId: number, name: string): Counter {
  const result = db.prepare('INSERT INTO counters (area_id, name) VALUES (?, ?)').run(areaId, name);
  return db.prepare('SELECT * FROM counters WHERE id = ?').get(result.lastInsertRowid) as Counter;
}

export function updateCounter(id: number, data: { name?: string; is_active?: number }): Counter {
  if (data.name !== undefined) {
    db.prepare('UPDATE counters SET name = ? WHERE id = ?').run(data.name, id);
  }
  if (data.is_active !== undefined) {
    db.prepare('UPDATE counters SET is_active = ? WHERE id = ?').run(data.is_active, id);
  }
  const counter = db.prepare('SELECT * FROM counters WHERE id = ?').get(id) as Counter | undefined;
  if (!counter) throw new Error('Quầy không tồn tại');
  return counter;
}

export function deleteCounter(id: number): void {
  const txn = db.transaction(() => {
    db.prepare('UPDATE tickets SET counter_id = NULL WHERE counter_id = ?').run(id);
    const result = db.prepare('DELETE FROM counters WHERE id = ?').run(id);
    if (result.changes === 0) throw new Error('Quầy không tồn tại');
  });
  txn();
}
