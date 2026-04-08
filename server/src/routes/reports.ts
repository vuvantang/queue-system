import { Router } from 'express';
import db from '../db.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

// Stats by date range
router.get('/stats', authenticate, requireAdmin, (req, res) => {
  const { from, to, area_id } = req.query;
  const today = new Date().toLocaleDateString('en-CA');
  const dateFrom = (from as string) || today;
  const dateTo = (to as string) || today;

  // Tickets per day
  const dailyQuery = area_id
    ? db.prepare(
        `SELECT date(created_at) as date,
                COUNT(*) as total,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped
         FROM tickets
         WHERE date(created_at) BETWEEN ? AND ? AND area_id = ?
         GROUP BY date(created_at)
         ORDER BY date(created_at)`
      )
    : db.prepare(
        `SELECT date(created_at) as date,
                COUNT(*) as total,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped
         FROM tickets
         WHERE date(created_at) BETWEEN ? AND ?
         GROUP BY date(created_at)
         ORDER BY date(created_at)`
      );

  const daily = area_id
    ? dailyQuery.all(dateFrom, dateTo, Number(area_id))
    : dailyQuery.all(dateFrom, dateTo);

  // Tickets per service type
  const byServiceQuery = area_id
    ? db.prepare(
        `SELECT st.name, st.prefix, COUNT(*) as total
         FROM tickets t
         JOIN service_types st ON t.service_type_id = st.id
         WHERE date(t.created_at) BETWEEN ? AND ? AND t.area_id = ?
         GROUP BY t.service_type_id
         ORDER BY total DESC`
      )
    : db.prepare(
        `SELECT st.name, st.prefix, COUNT(*) as total
         FROM tickets t
         JOIN service_types st ON t.service_type_id = st.id
         WHERE date(t.created_at) BETWEEN ? AND ?
         GROUP BY t.service_type_id
         ORDER BY total DESC`
      );

  const byService = area_id
    ? byServiceQuery.all(dateFrom, dateTo, Number(area_id))
    : byServiceQuery.all(dateFrom, dateTo);

  // Tickets per counter (staff performance)
  const byCounterQuery = area_id
    ? db.prepare(
        `SELECT c.name as counter_name, u.display_name as staff_name,
                COUNT(*) as total,
                AVG(CASE WHEN t.called_at IS NOT NULL AND t.completed_at IS NOT NULL
                    THEN (julianday(t.completed_at) - julianday(t.called_at)) * 86400
                    ELSE NULL END) as avg_serve_seconds
         FROM tickets t
         JOIN counters c ON t.counter_id = c.id
         LEFT JOIN users u ON t.called_by = u.id
         WHERE t.status = 'completed' AND date(t.created_at) BETWEEN ? AND ? AND t.area_id = ?
         GROUP BY t.counter_id
         ORDER BY total DESC`
      )
    : db.prepare(
        `SELECT c.name as counter_name, u.display_name as staff_name,
                COUNT(*) as total,
                AVG(CASE WHEN t.called_at IS NOT NULL AND t.completed_at IS NOT NULL
                    THEN (julianday(t.completed_at) - julianday(t.called_at)) * 86400
                    ELSE NULL END) as avg_serve_seconds
         FROM tickets t
         JOIN counters c ON t.counter_id = c.id
         LEFT JOIN users u ON t.called_by = u.id
         WHERE t.status = 'completed' AND date(t.created_at) BETWEEN ? AND ?
         GROUP BY t.counter_id
         ORDER BY total DESC`
      );

  const byCounter = area_id
    ? byCounterQuery.all(dateFrom, dateTo, Number(area_id))
    : byCounterQuery.all(dateFrom, dateTo);

  // Hourly distribution
  const hourlyQuery = area_id
    ? db.prepare(
        `SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour, COUNT(*) as total
         FROM tickets
         WHERE date(created_at) BETWEEN ? AND ? AND area_id = ?
         GROUP BY hour
         ORDER BY hour`
      )
    : db.prepare(
        `SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour, COUNT(*) as total
         FROM tickets
         WHERE date(created_at) BETWEEN ? AND ?
         GROUP BY hour
         ORDER BY hour`
      );

  const hourly = area_id
    ? hourlyQuery.all(dateFrom, dateTo, Number(area_id))
    : hourlyQuery.all(dateFrom, dateTo);

  // Summary
  const summaryQuery = area_id
    ? db.prepare(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped,
                SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END) as waiting,
                SUM(CASE WHEN status = 'serving' THEN 1 ELSE 0 END) as serving,
                AVG(CASE WHEN called_at IS NOT NULL AND completed_at IS NOT NULL AND status = 'completed'
                    THEN (julianday(completed_at) - julianday(called_at)) * 86400
                    ELSE NULL END) as avg_serve_seconds,
                AVG(CASE WHEN called_at IS NOT NULL
                    THEN (julianday(called_at) - julianday(created_at)) * 86400
                    ELSE NULL END) as avg_wait_seconds
         FROM tickets
         WHERE date(created_at) BETWEEN ? AND ? AND area_id = ?`
      )
    : db.prepare(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped,
                SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END) as waiting,
                SUM(CASE WHEN status = 'serving' THEN 1 ELSE 0 END) as serving,
                AVG(CASE WHEN called_at IS NOT NULL AND completed_at IS NOT NULL AND status = 'completed'
                    THEN (julianday(completed_at) - julianday(called_at)) * 86400
                    ELSE NULL END) as avg_serve_seconds,
                AVG(CASE WHEN called_at IS NOT NULL
                    THEN (julianday(called_at) - julianday(created_at)) * 86400
                    ELSE NULL END) as avg_wait_seconds
         FROM tickets
         WHERE date(created_at) BETWEEN ? AND ?`
      );

  const summary = area_id
    ? summaryQuery.get(dateFrom, dateTo, Number(area_id))
    : summaryQuery.get(dateFrom, dateTo);

  res.json({ summary, daily, byService, byCounter, hourly });
});

export default router;
