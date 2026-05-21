const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

async function main() {
  const SQL = await initSqlJs();
  const dbPath = path.join(__dirname, 'database.sqlite');
  const db = new SQL.Database(fs.readFileSync(dbPath));

  // Show current state
  console.log('=== BEFORE ===');
  let stmt = db.prepare('SELECT id, name, email, role, company_id FROM users ORDER BY id');
  while (stmt.step()) console.log(JSON.stringify(stmt.getAsObject()));
  stmt.free();

  // 1. Make sure Felipe is gestor
  db.run("UPDATE users SET role = 'gestor' WHERE id = 1");

  // 2. Delete old admin account if exists (id 6)
  try { db.run("DELETE FROM users WHERE email = 'reinonexusideal@gmail.com'"); } catch(e) {}

  // 3. Delete orphan company if exists
  try { db.run("DELETE FROM companies WHERE name = 'Nexus Admin'"); } catch(e) {}

  // 4. Create admin company
  db.run("INSERT INTO companies (name) VALUES ('Nexus Platform')");
  const companyResult = db.exec('SELECT last_insert_rowid() as id');
  const adminCompanyId = companyResult[0].values[0][0];

  // 5. Create admin user with provided credentials
  const hash = bcrypt.hashSync('31076hibridos', 10);
  db.run(
    "INSERT INTO users (company_id, name, email, password, role) VALUES (?, ?, ?, ?, ?)",
    [adminCompanyId, 'Admin Nexus', 'reinonexusideal@gmail.com', hash, 'admin']
  );

  // Save
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));

  // Verify
  console.log('\n=== AFTER ===');
  stmt = db.prepare('SELECT id, name, email, role, company_id FROM users ORDER BY id');
  while (stmt.step()) console.log(JSON.stringify(stmt.getAsObject()));
  stmt.free();

  console.log('\nDone!');
}
main().catch(e => { console.error(e); process.exit(1); });
