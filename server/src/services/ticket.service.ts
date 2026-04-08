import db from '../db.js';
import { checkAndResetIfNewDay } from './reset.service.js';
import type { Ticket, ServiceType, Counter, Area, QueueStatus } from '../types.js';

function formatTicketNumber(_prefix: string, num: number): string {
  return String(num).padStart(3, '0');
}

export function createTicket(serviceTypeId: number): Ticket {
  const txn = db.transaction(() => {
    checkAndResetIfNewDay();

    const today = new Date().toLocaleDateString('en-CA');

    const st = db.prepare('SELECT * FROM service_types WHERE id = ? AND is_active = 1').get(serviceTypeId) as ServiceType | undefined;
    if (!st) throw new Error('Loại dịch vụ không tồn tại hoặc đã tắt');

    // Derive next number from today's ticket count in this area
    const countResult = db.prepare(
      `SELECT COUNT(*) as count FROM tickets WHERE area_id = ? AND date(created_at) = ?`
    ).get(st.area_id, today) as { count: number };
    const nextNumber = countResult.count + 1;
    const ticketNumber = formatTicketNumber(st.prefix, nextNumber);

    const result = db.prepare(
      `INSERT INTO tickets (ticket_number, service_type_id, area_id, status)
       VALUES (?, ?, ?, 'waiting')`
    ).run(ticketNumber, st.id, st.area_id);

    return db.prepare('SELECT * FROM tickets WHERE id = ?').get(result.lastInsertRowid) as Ticket;
  });

  return txn();
}

export function callNext(counterId: number, userId: number, serviceTypeId?: number): { ticket: Ticket; counter: Counter; serviceTypeName: string; announceTemplate: string } | null {
  const txn = db.transaction(() => {
    const counter = db.prepare('SELECT * FROM counters WHERE id = ? AND is_active = 1').get(counterId) as Counter | undefined;
    if (!counter) throw new Error('Quầy không tồn tại hoặc đã tắt');

    // Complete any currently serving ticket at this counter
    db.prepare(
      `UPDATE tickets SET status = 'completed', completed_at = datetime('now','localtime')
       WHERE counter_id = ? AND status = 'serving'`
    ).run(counterId);

    // Get next waiting ticket for today, optionally filtered by service type
    const today = new Date().toLocaleDateString('en-CA');
    let ticket: Ticket | undefined;
    if (serviceTypeId) {
      ticket = db.prepare(
        `SELECT * FROM tickets WHERE area_id = ? AND service_type_id = ? AND status = 'waiting' AND date(created_at) = ?
         ORDER BY id ASC LIMIT 1`
      ).get(counter.area_id, serviceTypeId, today) as Ticket | undefined;
    } else {
      ticket = db.prepare(
        `SELECT * FROM tickets WHERE area_id = ? AND status = 'waiting' AND date(created_at) = ?
         ORDER BY id ASC LIMIT 1`
      ).get(counter.area_id, today) as Ticket | undefined;
    }

    if (!ticket) return null;

    db.prepare(
      `UPDATE tickets SET status = 'serving', counter_id = ?, called_by = ?, called_at = datetime('now','localtime')
       WHERE id = ?`
    ).run(counterId, userId, ticket.id);

    const updated = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticket.id) as Ticket;
    const st = db.prepare('SELECT * FROM service_types WHERE id = ?').get(updated.service_type_id) as ServiceType;
    const area = db.prepare('SELECT * FROM areas WHERE id = ?').get(counter.area_id) as Area;
    return { ticket: updated, counter, serviceTypeName: st?.name || '', announceTemplate: area.announce_template };
  });

  return txn();
}

export function recall(ticketId: number, counterId: number): { ticket: Ticket; counter: Counter; serviceTypeName: string; announceTemplate: string } {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ? AND status = ?').get(ticketId, 'serving') as Ticket | undefined;
  if (!ticket) throw new Error('Vé không tồn tại hoặc không đang phục vụ');

  const counter = db.prepare('SELECT * FROM counters WHERE id = ?').get(counterId) as Counter;
  const st = db.prepare('SELECT * FROM service_types WHERE id = ?').get(ticket.service_type_id) as ServiceType;
  const area = db.prepare('SELECT * FROM areas WHERE id = ?').get(ticket.area_id) as Area;
  return { ticket, counter, serviceTypeName: st?.name || '', announceTemplate: area.announce_template };
}

export function completeTicket(ticketId: number): Ticket {
  db.prepare(
    `UPDATE tickets SET status = 'completed', completed_at = datetime('now','localtime') WHERE id = ? AND status = 'serving'`
  ).run(ticketId);

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId) as Ticket | undefined;
  if (!ticket) throw new Error('Vé không tồn tại');
  return ticket;
}

export function skipTicket(ticketId: number): Ticket {
  db.prepare(
    `UPDATE tickets SET status = 'skipped' WHERE id = ? AND status IN ('waiting', 'serving')`
  ).run(ticketId);

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId) as Ticket | undefined;
  if (!ticket) throw new Error('Vé không tồn tại');
  return ticket;
}

export function getQueueStatus(areaId: number): QueueStatus {
  const today = new Date().toLocaleDateString('en-CA');

  const serving = db.prepare(
    `SELECT t.*, c.name as counter_name, st.name as service_type_name
     FROM tickets t
     LEFT JOIN counters c ON t.counter_id = c.id
     LEFT JOIN service_types st ON t.service_type_id = st.id
     WHERE t.area_id = ? AND t.status = 'serving' AND date(t.created_at) = ?
     ORDER BY t.called_at DESC`
  ).all(areaId, today) as (Ticket & { counter_name: string; service_type_name: string })[];

  const waiting = db.prepare(
    `SELECT t.*, st.name as service_type_name
     FROM tickets t
     LEFT JOIN service_types st ON t.service_type_id = st.id
     WHERE t.area_id = ? AND t.status = 'waiting' AND date(t.created_at) = ?
     ORDER BY t.id ASC`
  ).all(areaId, today) as (Ticket & { service_type_name: string })[];

  const completedCount = db.prepare(
    `SELECT COUNT(*) as count FROM tickets WHERE area_id = ? AND status = 'completed' AND date(created_at) = ?`
  ).get(areaId, today) as { count: number };

  const serviceTypes = db.prepare(
    `SELECT id, name, prefix FROM service_types WHERE area_id = ? AND is_active = 1 ORDER BY id`
  ).all(areaId) as { id: number; name: string; prefix: string }[];

  return {
    serving,
    waiting,
    completed_count: completedCount.count,
    waiting_count: waiting.length,
    service_types: serviceTypes,
  };
}
