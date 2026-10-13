import Database from "better-sqlite3";

const db = new Database("support.db");

db.exec(`
DROP TABLE IF EXISTS tickets;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS knowledge_articles;

CREATE TABLE tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  category TEXT NOT NULL,
  customer TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolution_minutes INTEGER,
  customer_email TEXT NOT NULL,
  internal_notes TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  permissions TEXT NOT NULL
);

CREATE TABLE knowledge_articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_priority ON tickets(priority);
CREATE INDEX idx_tickets_category ON tickets(category);
CREATE INDEX idx_tickets_customer ON tickets(customer);
CREATE INDEX idx_tickets_created_at ON tickets(created_at);
`);

const insertTicket = db.prepare(`
INSERT INTO tickets
(title, status, priority, category, customer, created_at, resolution_minutes, customer_email, internal_notes)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const tickets = [
  ["Error al procesar pago con tarjeta", "open", "critical", "payments", "Contoso", "2026-06-01", null, "laura@contoso.example", "Proveedor PSP devuelve errores intermitentes 502."],
  ["Login lento en horario de mañana", "open", "high", "login", "Northwind", "2026-06-02", null, "admin@northwind.example", "Posible saturación de cache de sesiones."],
  ["Factura duplicada en portal", "closed", "medium", "billing", "Contoso", "2026-05-29", 180, "finance@contoso.example", "Reproceso manual desde ERP."],
  ["No llega email de recuperación", "open", "medium", "login", "Fabrikam", "2026-06-01", null, "soporte@fabrikam.example", "SMTP con cola retrasada."],
  ["Timeout al confirmar pedido", "closed", "critical", "payments", "Northwind", "2026-05-30", 95, "ops@northwind.example", "Timeout aguas abajo en confirmación."],
  ["Consulta de saldo incorrecta", "open", "high", "billing", "Fabrikam", "2026-06-03", null, "billing@fabrikam.example", "Pendiente reconciliación contable."],
  ["Error visual en dashboard", "closed", "low", "frontend", "Contoso", "2026-05-27", 60, "ux@contoso.example", "Cache de navegador antigua."],
  ["Pago rechazado sin motivo claro", "open", "critical", "payments", "Fabrikam", "2026-06-03", null, "payments@fabrikam.example", "Validar 3DS y código del PSP."]
];

for (const ticket of tickets) {
  insertTicket.run(...ticket);
}

const insertUser = db.prepare(`
INSERT INTO users (id, name, role, permissions) VALUES (?, ?, ?, ?)
`);

insertUser.run("USR-ADMIN", "Laura Admin", "support_manager", JSON.stringify([
  "read:tickets",
  "read:ticket_metrics",
  "read:knowledge"
]));
insertUser.run("USR-AGENT", "Mario Agente", "support_agent", JSON.stringify([
  "read:tickets",
  "read:knowledge"
]));
insertUser.run("USR-LIMITED", "Cliente Demo", "customer_viewer", JSON.stringify([
  "read:own_tickets"
]));

const insertArticle = db.prepare(`
INSERT INTO knowledge_articles (title, category, content, updated_at)
VALUES (?, ?, ?, ?)
`);

const articles = [
  ["Pagos rechazados con tarjeta", "payments", "Revisar código de respuesta, autenticación 3DS, límite de tarjeta y reintentos duplicados.", "2026-06-01"],
  ["Timeout al confirmar pedidos", "payments", "Revisar latencia del proveedor, cola de confirmación y correlación con errores 500.", "2026-06-02"],
  ["Recuperación de contraseña", "login", "Validar email, estado de cuenta, expiración del token y envío del correo de recuperación.", "2026-05-28"],
  ["Facturas duplicadas en portal", "billing", "Revisar reprocesos ERP, sincronización parcial y operaciones manuales.", "2026-05-29"]
];

for (const article of articles) {
  insertArticle.run(...article);
}

console.log("Base de datos inicializada en support.db");
