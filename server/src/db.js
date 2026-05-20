import initSqlJs from 'sql.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DB_PATH = join(__dirname, '..', 'database.sqlite')

let db

async function initDb() {
  const SQL = await initSqlJs()

  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  db.run('PRAGMA foreign_keys = ON')

  db.run(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      logo TEXT,
      primary_color TEXT DEFAULT '#6c5ce7',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('gestor','editor','cliente','supervisor')),
      phone TEXT,
      pix_key TEXT,
      bank_info TEXT,
      specialty TEXT,
      default_rate REAL DEFAULT 0,
      avatar TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id)
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      contact_name TEXT,
      email TEXT,
      phone TEXT,
      logo TEXT,
      notes TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id)
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS kanban_columns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      client_id INTEGER,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      color TEXT DEFAULT '#6c5ce7',
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      column_id INTEGER,
      editor_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      briefing TEXT,
      drive_links TEXT,
      priority TEXT DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
      due_date DATE,
      position INTEGER DEFAULT 0,
      video_url TEXT,
      thumbnail TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (client_id) REFERENCES clients(id),
      FOREIGN KEY (column_id) REFERENCES kanban_columns(id),
      FOREIGN KEY (editor_id) REFERENCES users(id)
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS order_checklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      done INTEGER DEFAULT 0,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      timestamp_mark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      file_url TEXT NOT NULL,
      notes TEXT,
      version_number INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      editor_id INTEGER NOT NULL,
      order_id INTEGER,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','paid','cancelled')),
      proof_url TEXT,
      paid_at DATETIME,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (editor_id) REFERENCES users(id),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      read INTEGER DEFAULT 0,
      reference_id INTEGER,
      reference_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id)
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      client_id INTEGER,
      order_id INTEGER,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      type TEXT,
      category TEXT DEFAULT 'general',
      uploaded_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (client_id) REFERENCES clients(id),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      email TEXT,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )
  `)

  // ============ FINANCIAL TABLES ============

  db.run(`
    CREATE TABLE IF NOT EXISTS client_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      total_amount REAL NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','paid')),
      proof_url TEXT,
      notes TEXT,
      paid_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS client_invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (invoice_id) REFERENCES client_invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS editor_payment_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      editor_id INTEGER NOT NULL,
      total_amount REAL NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','paid')),
      proof_url TEXT,
      notes TEXT,
      paid_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (editor_id) REFERENCES users(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS editor_payment_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (batch_id) REFERENCES editor_payment_batches(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS daily_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      client_id INTEGER,
      record_date DATE NOT NULL,
      meetings INTEGER DEFAULT 0,
      meeting_notes TEXT,
      observations TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )
  `)

  // ============ TEAM MEMBERSHIPS (multi-team editors) ============

  db.run(`
    CREATE TABLE IF NOT EXISTS team_memberships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      company_id INTEGER NOT NULL,
      role TEXT DEFAULT 'editor',
      status TEXT DEFAULT 'active' CHECK(status IN ('active','inactive')),
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      UNIQUE(user_id, company_id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS team_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      editor_id INTEGER,
      editor_email TEXT,
      invited_by INTEGER NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (editor_id) REFERENCES users(id),
      FOREIGN KEY (invited_by) REFERENCES users(id)
    )
  `)

  try { db.run('ALTER TABLE clients ADD COLUMN user_id INTEGER REFERENCES users(id)') } catch {}
  try { db.run('ALTER TABLE orders ADD COLUMN approved INTEGER DEFAULT 0') } catch {}
  try { db.run('ALTER TABLE orders ADD COLUMN approved_at DATETIME') } catch {}
  try { db.run('ALTER TABLE orders ADD COLUMN approved_by INTEGER') } catch {}
  try { db.run('ALTER TABLE orders ADD COLUMN value REAL DEFAULT 0') } catch {}
  try { db.run('ALTER TABLE orders ADD COLUMN editor_value REAL DEFAULT 0') } catch {}

  saveDb()
  return db
}

function saveDb() {
  if (db) {
    const data = db.export()
    const buffer = Buffer.from(data)
    writeFileSync(DB_PATH, buffer)
  }
}

function getDb() {
  return db
}

const textDecoder = new TextDecoder('utf-8')

function decodeRow(row) {
  const out = {}
  for (const key in row) {
    const val = row[key]
    if (val instanceof Uint8Array) {
      out[key] = textDecoder.decode(val)
    } else {
      out[key] = val
    }
  }
  return out
}

function run(sql, params = []) {
  db.run(sql, params)
  const result = db.exec('SELECT last_insert_rowid() as id')
  const lastId = result.length > 0 ? result[0].values[0][0] : null
  saveDb()
  return { lastInsertRowid: lastId }
}

function get(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  if (stmt.step()) {
    const row = decodeRow(stmt.getAsObject())
    stmt.free()
    return row
  }
  stmt.free()
  return null
}

function all(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) {
    rows.push(decodeRow(stmt.getAsObject()))
  }
  stmt.free()
  return rows
}

function createDefaultColumns(companyId, clientId) {
  const cols = [
    { name: 'Não iniciado', color: '#6c6c80', position: 0 },
    { name: 'Liberado', color: '#0984e3', position: 1 },
    { name: 'Para edição', color: '#6c5ce7', position: 2 },
    { name: 'Editado', color: '#fdcb6e', position: 3 },
    { name: 'Correção', color: '#e17055', position: 4 },
    { name: 'Finalizado', color: '#00b894', position: 5 },
  ]
  for (const col of cols) {
    run(
      'INSERT INTO kanban_columns (company_id, client_id, name, color, position) VALUES (?, ?, ?, ?, ?)',
      [companyId, clientId, col.name, col.color, col.position]
    )
  }
}

export { initDb, getDb, run, get, all, createDefaultColumns, saveDb }
