import Database from "better-sqlite3";

export const db = new Database("support.db");

export function parsePermissions(user) {
  try {
    return JSON.parse(user.permissions || "[]");
  } catch {
    return [];
  }
}

export function getUserById(userId) {
  return db.prepare(`
    SELECT id, name, role, permissions
    FROM users
    WHERE id = ?
  `).get(userId);
}

export function getTicketById(id) {
  return db.prepare(`
    SELECT
      id,
      title,
      status,
      priority,
      category,
      customer,
      created_at,
      resolution_minutes,
      customer_email,
      internal_notes
    FROM tickets
    WHERE id = ?
  `).get(id);
}

export function listTickets(limit = 20) {
  return db.prepare(`
    SELECT
      id,
      title,
      status,
      priority,
      category,
      customer,
      created_at,
      resolution_minutes,
      customer_email,
      internal_notes
    FROM tickets
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(limit);
}
