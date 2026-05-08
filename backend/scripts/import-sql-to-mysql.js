// Import database-dump.sql into MySQL using .env credentials
// Usage: node scripts/import-sql-to-mysql.js

require('dotenv').config()
const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')

async function importSql() {
  const sqlPath = path.join(__dirname, '..', '..', 'docs', 'database-dump.sql')
  if (!fs.existsSync(sqlPath)) {
    console.error('❌ SQL file not found:', sqlPath)
    process.exit(1)
  }

  const sql = fs.readFileSync(sqlPath, 'utf8')

  // Split statements safely by semicolon + newline. Adjust if your dump contains
  // complex procedures or delimiter changes.
  const statements = sql
    .split(/;\s*\n/g)
    .map(s => s.trim())
    .filter(Boolean)

  const config = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || '',
    port: Number(process.env.DB_PORT || 3306),
    multipleStatements: false,
  }

  console.log('📋 Connecting with:', { host: config.host, user: config.user, database: config.database })

  let pool
  try {
    pool = mysql.createPool(config)
    const conn = await pool.getConnection()

    console.log(`📥 Running ${statements.length} statements...`)
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i]
      if (!stmt) continue
      try {
        await conn.query(stmt)
      } catch (err) {
        console.error(`⚠️ Statement ${i + 1} failed:`)
        console.error(err.message)
        // continue on error to try remaining statements
      }
    }

    conn.release()
    console.log('✅ Import finished')
    process.exit(0)
  } catch (err) {
    console.error('❌ Import failed:', err.message)
    process.exit(1)
  } finally {
    if (pool) await pool.end()
  }
}

importSql()
