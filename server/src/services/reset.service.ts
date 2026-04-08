import db from '../db.js';

export function checkAndResetIfNewDay(): boolean {
  const setting = db.prepare("SELECT value FROM settings WHERE key = 'last_reset_date'").get() as { value: string } | undefined;
  const today = new Date().toLocaleDateString('en-CA');

  if (setting && setting.value === today) return false;

  const txn = db.transaction(() => {
    // Mark old waiting/serving tickets as done — numbering resets automatically since it's derived from today's tickets
    db.prepare("UPDATE tickets SET status = 'skipped' WHERE status = 'waiting'").run();
    db.prepare("UPDATE tickets SET status = 'completed', completed_at = datetime('now','localtime') WHERE status = 'serving'").run();
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_reset_date', ?)").run(today);
  });
  txn();
  return true;
}

export function manualReset(): void {
  const today = new Date().toLocaleDateString('en-CA');
  const txn = db.transaction(() => {
    db.prepare("DELETE FROM tickets WHERE date(created_at) = ?").run(today);
  });
  txn();
}

export function resetArea(areaId: number): void {
  const today = new Date().toLocaleDateString('en-CA');
  const txn = db.transaction(() => {
    db.prepare("DELETE FROM tickets WHERE area_id = ? AND date(created_at) = ?").run(areaId, today);
  });
  txn();
}
