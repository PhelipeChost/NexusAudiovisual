import initSqlJs from 'sql.js'
import { readFileSync, writeFileSync, existsSync, renameSync, statSync, mkdirSync, readdirSync, unlinkSync, copyFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DB_PATH = join(__dirname, '..', 'database.sqlite')
const DB_TMP_PATH = join(__dirname, '..', 'database.sqlite.tmp')
const BACKUP_DIR = join(__dirname, '..', 'backups')
const MAX_BACKUPS = 14 // keep 2 weeks of daily backups

let db

// Verify SQLite file integrity by checking the "SQLite format 3" magic header
function isValidSQLiteFile(path) {
  try {
    const buf = readFileSync(path, { encoding: null })
    if (buf.length < 16) return false
    // SQLite header: "SQLite format 3\0"
    return buf.slice(0, 15).toString() === 'SQLite format 3'
  } catch { return false }
}

// Try to load DB from a path, returning the SQL.Database instance or null
function tryLoadDb(SQL, path) {
  if (!existsSync(path)) return null
  if (!isValidSQLiteFile(path)) {
    console.error(`[db] File ${path} exists but is not a valid SQLite database — skipping`)
    return null
  }
  try {
    const buffer = readFileSync(path)
    return new SQL.Database(buffer)
  } catch (err) {
    console.error(`[db] Failed to load ${path}:`, err.message)
    return null
  }
}

async function initDb() {
  const SQL = await initSqlJs()

  // Try main DB file first
  db = tryLoadDb(SQL, DB_PATH)

  // If main DB is missing or corrupted, attempt recovery from most recent backup
  if (!db) {
    if (existsSync(DB_PATH)) {
      // Quarantine the corrupted file
      const quarantinePath = `${DB_PATH}.corrupted-${Date.now()}`
      try {
        renameSync(DB_PATH, quarantinePath)
        console.error(`[db] Corrupted DB moved to ${quarantinePath}`)
      } catch (err) { console.error('[db] Failed to quarantine corrupted file:', err.message) }
    }

    // Find most recent valid backup
    if (existsSync(BACKUP_DIR)) {
      const backups = readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('database-') && f.endsWith('.sqlite'))
        .sort()
        .reverse()
      for (const backup of backups) {
        const backupPath = join(BACKUP_DIR, backup)
        const restored = tryLoadDb(SQL, backupPath)
        if (restored) {
          console.log(`[db] Restored database from backup: ${backup}`)
          db = restored
          break
        }
      }
    }
  }

  // Last resort: fresh empty DB
  if (!db) {
    console.log('[db] Creating fresh empty database')
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
      role TEXT NOT NULL CHECK(role IN ('admin','gestor','editor','cliente','supervisor')),
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

  // ============ EDITOR STANDALONE ENTRIES (pagamentos avulsos) ============

  db.run(`
    CREATE TABLE IF NOT EXISTS editor_standalone_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      editor_id INTEGER NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      description TEXT NOT NULL,
      entry_date DATE DEFAULT (DATE('now')),
      batch_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (editor_id) REFERENCES users(id),
      FOREIGN KEY (batch_id) REFERENCES editor_payment_batches(id) ON DELETE SET NULL
    )
  `)

  // ============ CONTRACT VALIDATIONS ============

  db.run(`
    CREATE TABLE IF NOT EXISTS contract_validations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      contract_id INTEGER,
      filename TEXT NOT NULL,
      file_size INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      report TEXT,
      signature_count INTEGER DEFAULT 0,
      confidence INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (contract_id) REFERENCES contracts(id)
    )
  `)

  // Add contract_id column to existing contract_validations table
  try { run('ALTER TABLE contract_validations ADD COLUMN contract_id INTEGER') } catch {}

  // Add validation columns to contracts table
  try { run('ALTER TABLE contracts ADD COLUMN validation_status TEXT') } catch {}
  try { run('ALTER TABLE contracts ADD COLUMN validation_date TEXT') } catch {}
  try { run('ALTER TABLE contracts ADD COLUMN validated_filename TEXT') } catch {}

  // ============ CLIENT STANDALONE ENTRIES (lançamentos avulsos para clientes) ============

  db.run(`
    CREATE TABLE IF NOT EXISTS client_standalone_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      description TEXT NOT NULL,
      entry_date DATE DEFAULT (DATE('now')),
      status TEXT DEFAULT 'pending',
      proof_url TEXT,
      paid_at DATETIME,
      invoice_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (client_id) REFERENCES clients(id),
      FOREIGN KEY (invoice_id) REFERENCES client_invoices(id) ON DELETE SET NULL
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
      removed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      UNIQUE(user_id, company_id)
    )
  `)

  // Add removed_at column to existing team_memberships (preserves history)
  try { db.run('ALTER TABLE team_memberships ADD COLUMN removed_at DATETIME') } catch {}

  // Add removed_at column to users to track when direct members were deactivated
  try { db.run('ALTER TABLE users ADD COLUMN removed_at DATETIME') } catch {}

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

  // Order templates table
  db.run(`
    CREATE TABLE IF NOT EXISTS order_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      briefing TEXT,
      priority TEXT DEFAULT 'normal',
      drive_links TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id)
    )
  `)

  // SaaS plans table
  db.run(`
    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      description TEXT,
      max_editors INTEGER DEFAULT -1,
      max_clients INTEGER DEFAULT -1,
      max_orders_month INTEGER DEFAULT -1,
      active INTEGER DEFAULT 1,
      visible INTEGER DEFAULT 1,
      featured INTEGER DEFAULT 0,
      type TEXT DEFAULT 'Mensal (1 mes)',
      benefits TEXT DEFAULT '[]',
      discount_3m REAL DEFAULT 0,
      discount_6m REAL DEFAULT 0,
      discount_12m REAL DEFAULT 0,
      position INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Subscriptions per company
  db.run(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL UNIQUE,
      plan_id INTEGER,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','trial','active','past_due','cancelled','suspended')),
      trial_ends_at DATETIME,
      current_period_start DATETIME,
      current_period_end DATETIME,
      mp_subscription_id TEXT,
      mp_payer_email TEXT,
      cancelled_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (plan_id) REFERENCES plans(id)
    )
  `)

  // Payment history
  db.run(`
    CREATE TABLE IF NOT EXISTS subscription_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id INTEGER NOT NULL,
      company_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','refunded')),
      payment_method TEXT,
      mp_payment_id TEXT,
      paid_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subscription_id) REFERENCES subscriptions(id),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    )
  `)

  // Platform settings (admin-configurable key-value store)
  db.run(`
    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Migrate role constraint to include 'admin'
  try { db.run("UPDATE users SET role = role WHERE 1=0") } catch {} // no-op to avoid issues

  // Migrate plans table: add new columns
  try { db.run('ALTER TABLE plans ADD COLUMN visible INTEGER DEFAULT 1') } catch {}
  try { db.run('ALTER TABLE plans ADD COLUMN featured INTEGER DEFAULT 0') } catch {}
  try { db.run('ALTER TABLE plans ADD COLUMN type TEXT DEFAULT \'Mensal (1 mes)\'') } catch {}
  try { db.run('ALTER TABLE plans ADD COLUMN benefits TEXT DEFAULT \'[]\'') } catch {}
  try { db.run('ALTER TABLE plans ADD COLUMN discount_3m REAL DEFAULT 0') } catch {}
  try { db.run('ALTER TABLE plans ADD COLUMN discount_6m REAL DEFAULT 0') } catch {}
  try { db.run('ALTER TABLE plans ADD COLUMN discount_12m REAL DEFAULT 0') } catch {}
  try { db.run('ALTER TABLE plans ADD COLUMN position INTEGER DEFAULT 0') } catch {}

  // Migrate subscriptions table to include 'pending' status
  try {
    const testOk = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='subscriptions'")
    const tableSql = testOk[0]?.values[0]?.[0] || ''
    if (tableSql && !tableSql.includes("'pending'")) {
      // Temporarily disable FK checks for migration
      db.run('PRAGMA foreign_keys = OFF')
      // Clean up any leftover temp table from previous failed migration
      try { db.run('DROP TABLE IF EXISTS subscriptions_new') } catch {}
      db.run(`CREATE TABLE subscriptions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL UNIQUE,
        plan_id INTEGER,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending','trial','active','past_due','cancelled','suspended')),
        trial_ends_at DATETIME,
        current_period_start DATETIME,
        current_period_end DATETIME,
        mp_subscription_id TEXT,
        mp_payer_email TEXT,
        cancelled_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (plan_id) REFERENCES plans(id)
      )`)
      db.run(`INSERT INTO subscriptions_new SELECT * FROM subscriptions`)
      db.run(`DROP TABLE subscriptions`)
      db.run(`ALTER TABLE subscriptions_new RENAME TO subscriptions`)
      db.run('PRAGMA foreign_keys = ON')
      console.log('Subscription migration: added pending status successfully')
    }
  } catch (e) { console.log('Subscription migration note:', e.message) }

  // ============ CONTRACTS ============

  db.run(`
    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','active','expired','cancelled')),
      start_date DATE,
      end_date DATE,
      monthly_videos INTEGER DEFAULT 0,
      monthly_value REAL DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS contract_clauses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      position INTEGER DEFAULT 0,
      FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
    )
  `)

  // ============ CONTRACT PARTY FIELDS ============
  try { db.run("ALTER TABLE contracts ADD COLUMN contratante_nome TEXT") } catch {}
  try { db.run("ALTER TABLE contracts ADD COLUMN contratante_doc TEXT") } catch {}
  try { db.run("ALTER TABLE contracts ADD COLUMN contratante_endereco TEXT") } catch {}
  try { db.run("ALTER TABLE contracts ADD COLUMN contratado_nome TEXT") } catch {}
  try { db.run("ALTER TABLE contracts ADD COLUMN contratado_doc TEXT") } catch {}
  try { db.run("ALTER TABLE contracts ADD COLUMN contratado_endereco TEXT") } catch {}
  try { db.run("ALTER TABLE contracts ADD COLUMN contratante_tipo TEXT DEFAULT 'pf'") } catch {}
  try { db.run("ALTER TABLE contracts ADD COLUMN contratante_cnpj TEXT") } catch {}
  try { db.run("ALTER TABLE contracts ADD COLUMN contratante_cpf TEXT") } catch {}
  try { db.run("ALTER TABLE contracts ADD COLUMN contratado_tipo TEXT DEFAULT 'pf'") } catch {}
  try { db.run("ALTER TABLE contracts ADD COLUMN contratado_cnpj TEXT") } catch {}
  try { db.run("ALTER TABLE contracts ADD COLUMN contratado_cpf TEXT") } catch {}
  try { db.run("ALTER TABLE contracts ADD COLUMN payment_value REAL DEFAULT 0") } catch {}
  try { db.run("ALTER TABLE contracts ADD COLUMN payment_date TEXT") } catch {}
  try { db.run("ALTER TABLE contracts ADD COLUMN payment_details TEXT") } catch {}
  try { db.run("ALTER TABLE contracts ADD COLUMN city TEXT") } catch {}
  try { db.run("ALTER TABLE contracts ADD COLUMN contract_date TEXT") } catch {}

  // Sub-items for clauses (a, b, c...)
  try { db.run("ALTER TABLE contract_clauses ADD COLUMN items_json TEXT DEFAULT '[]'") } catch {}

  // ============ CONTRACT SIGNATURE SYSTEM ============
  try { db.run("ALTER TABLE contracts ADD COLUMN signature_status TEXT DEFAULT 'draft'") } catch {} // draft, pending, signed
  try { db.run("ALTER TABLE contracts ADD COLUMN sign_token TEXT") } catch {}
  try { db.run("ALTER TABLE contracts ADD COLUMN document_hash TEXT") } catch {}

  db.run(`
    CREATE TABLE IF NOT EXISTS contract_signatures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL,
      signer_role TEXT NOT NULL,
      signer_name TEXT,
      signer_cpf TEXT,
      signer_email TEXT,
      ip_address TEXT,
      user_agent TEXT,
      otp_code TEXT,
      otp_sent_at DATETIME,
      signed_at DATETIME,
      document_hash TEXT,
      signature_image TEXT,
      geolocation TEXT,
      FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
    )
  `)

  // ============ CLIENT ORDER REQUESTS ============
  // Uses orders table with source field
  try { db.run("ALTER TABLE orders ADD COLUMN source TEXT DEFAULT 'gestor'") } catch {}
  try { db.run("ALTER TABLE orders ADD COLUMN video_type TEXT") } catch {}
  try { db.run("ALTER TABLE orders ADD COLUMN duration TEXT") } catch {}
  try { db.run("ALTER TABLE orders ADD COLUMN format TEXT") } catch {}
  try { db.run("ALTER TABLE orders ADD COLUMN references_json TEXT DEFAULT '[]'") } catch {}
  try { db.run("ALTER TABLE orders ADD COLUMN delivery_link TEXT") } catch {}

  // SMTP per company
  try { db.run("ALTER TABLE companies ADD COLUMN smtp_host TEXT") } catch {}
  try { db.run("ALTER TABLE companies ADD COLUMN smtp_port INTEGER DEFAULT 587") } catch {}
  try { db.run("ALTER TABLE companies ADD COLUMN smtp_user TEXT") } catch {}
  try { db.run("ALTER TABLE companies ADD COLUMN smtp_pass TEXT") } catch {}
  try { db.run("ALTER TABLE companies ADD COLUMN smtp_from TEXT") } catch {}

  // Gov.br integration per company
  try { db.run("ALTER TABLE companies ADD COLUMN govbr_client_id TEXT") } catch {}
  try { db.run("ALTER TABLE companies ADD COLUMN govbr_client_secret TEXT") } catch {}
  try { db.run("ALTER TABLE companies ADD COLUMN govbr_env TEXT DEFAULT 'staging'") } catch {} // staging or production

  // Gov.br signature data on contract_signatures
  try { db.run("ALTER TABLE contract_signatures ADD COLUMN signature_method TEXT DEFAULT 'typed'") } catch {} // typed or govbr
  try { db.run("ALTER TABLE contract_signatures ADD COLUMN govbr_cpf TEXT") } catch {}
  try { db.run("ALTER TABLE contract_signatures ADD COLUMN govbr_name TEXT") } catch {}
  try { db.run("ALTER TABLE contract_signatures ADD COLUMN govbr_nivel TEXT") } catch {} // bronze, prata, ouro
  try { db.run("ALTER TABLE contract_signatures ADD COLUMN pkcs7_signature TEXT") } catch {}

  // Gov.br OAuth state tracking
  db.run(`CREATE TABLE IF NOT EXISTS govbr_oauth_states (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    state TEXT UNIQUE NOT NULL,
    company_id INTEGER NOT NULL,
    contract_id INTEGER,
    sign_token TEXT,
    signer_type TEXT DEFAULT 'public',
    user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
  )`)

  // ============ PERSONAL FINANCE (painel financeiro pessoal) ============

  db.run(`
    CREATE TABLE IF NOT EXISTS personal_income (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      source TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      description TEXT,
      entry_date DATE DEFAULT (DATE('now')),
      recurring INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS personal_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('necessidade','desejo','economia')),
      name TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      due_day INTEGER,
      paid INTEGER DEFAULT 0,
      entry_date DATE DEFAULT (DATE('now')),
      installment_total INTEGER DEFAULT 0,
      installment_current INTEGER DEFAULT 0,
      installment_group TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)

  // Migrate: add installment columns to personal_expenses
  try { db.run('ALTER TABLE personal_expenses ADD COLUMN installment_total INTEGER DEFAULT 0') } catch {}
  try { db.run('ALTER TABLE personal_expenses ADD COLUMN installment_current INTEGER DEFAULT 0') } catch {}
  try { db.run('ALTER TABLE personal_expenses ADD COLUMN installment_group TEXT') } catch {}

  db.run(`
    CREATE TABLE IF NOT EXISTS personal_avulsas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      entry_date DATE DEFAULT (DATE('now')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS personal_fixed_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('necessidade','desejo','economia')),
      name TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      due_day INTEGER,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)

  // Seed default plan if none exists
  const planCount = db.exec("SELECT COUNT(*) FROM plans")[0]?.values[0][0] || 0
  if (planCount === 0) {
    db.run(`INSERT INTO plans (name, price, description, max_editors, max_clients, max_orders_month, visible, featured, type, benefits, discount_3m, discount_6m, discount_12m, position)
            VALUES ('Profissional', 97.90, 'Acesso completo a todas as ferramentas', -1, -1, -1, 1, 1, 'Mensal (1 mes)', '[]', 10, 15, 20, 0)`)
  }

  saveDb()
  return db
}

// Atomic write: write to temp file, then rename. If the process is killed
// mid-write, the temp file is corrupted but the main DB file remains intact.
function saveDb() {
  if (!db) return
  const data = db.export()
  const buffer = Buffer.from(data)

  // Sanity check: never write a buffer that doesn't start with SQLite magic
  if (buffer.length < 16 || buffer.slice(0, 15).toString() !== 'SQLite format 3') {
    console.error('[db] REFUSING to save: exported buffer has invalid SQLite header')
    return
  }

  try {
    writeFileSync(DB_TMP_PATH, buffer)
    renameSync(DB_TMP_PATH, DB_PATH) // atomic on POSIX
  } catch (err) {
    console.error('[db] Failed to save database:', err.message)
    try { if (existsSync(DB_TMP_PATH)) unlinkSync(DB_TMP_PATH) } catch {}
  }
}

// Create a daily snapshot in backups/. Runs in-process on a 24h timer.
function backupDb() {
  if (!db) return
  try {
    if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true })

    const today = new Date().toISOString().substring(0, 10) // YYYY-MM-DD
    const backupPath = join(BACKUP_DIR, `database-${today}.sqlite`)

    // Skip if today's backup already exists
    if (existsSync(backupPath)) return

    // Copy current valid DB file (cheaper than re-exporting)
    if (existsSync(DB_PATH) && isValidSQLiteFile(DB_PATH)) {
      copyFileSync(DB_PATH, backupPath)
      console.log(`[db] Backup created: ${backupPath}`)
    }

    // Rotate: keep only MAX_BACKUPS most recent
    const backups = readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('database-') && f.endsWith('.sqlite'))
      .sort()
    while (backups.length > MAX_BACKUPS) {
      const old = backups.shift()
      try { unlinkSync(join(BACKUP_DIR, old)); console.log(`[db] Removed old backup: ${old}`) } catch {}
    }
  } catch (err) {
    console.error('[db] Backup failed:', err.message)
  }
}

// Start daily backup timer (runs on boot then every 24h)
function startBackupSchedule() {
  // Run first backup 30s after boot (so the DB has finished initializing/migrating)
  setTimeout(() => {
    backupDb()
    setInterval(backupDb, 24 * 60 * 60 * 1000)
  }, 30 * 1000)
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

export { initDb, getDb, run, get, all, createDefaultColumns, saveDb, backupDb, startBackupSchedule }
