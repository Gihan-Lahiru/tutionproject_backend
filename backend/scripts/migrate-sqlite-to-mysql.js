// Migration script: Copy data from SQLite to MySQL
const sqlite3 = require('sqlite3').verbose()
const mysql = require('mysql2/promise')
const path = require('path')
require('dotenv').config()

const dbPath = path.join(__dirname, '..', 'tuition_sir.db')

// SQLite connection
const sqliteDb = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Could not open SQLite database:', err)
    process.exit(1)
  }
})

const sqliteQuery = (sql, params = []) =>
  new Promise((resolve, reject) => {
    sqliteDb.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })

// MySQL connection
const mysqlPool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 5,
})

const mysqlQuery = async (sql, params = []) => {
  const connection = await mysqlPool.getConnection()
  try {
    const [result] = await connection.execute(sql, params)
    return result
  } finally {
    connection.release()
  }
}

const migrate = async () => {
  try {
    console.log('🔄 Starting migration from SQLite to MySQL...\n')

    // Get table list from SQLite
    const tables = await sqliteQuery(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `)

    console.log(`📊 Found ${tables.length} tables to migrate`)

    for (const table of tables) {
      console.log(`\n📦 Migrating table: ${table.name}`)

      // Get all rows from SQLite table
      const rows = await sqliteQuery(`SELECT * FROM ${table.name}`)

      if (!rows.length) {
        console.log(`   ✓ No data to migrate (empty table)`)
        continue
      }

      console.log(`   Found ${rows.length} rows`)

      // Get column names
      const columns = Object.keys(rows[0])
      const placeholders = columns.map(() => '?').join(',')
      const columnList = columns.join(',')

      // Insert rows into MySQL
      let inserted = 0
      for (const row of rows) {
        try {
          const values = columns.map(col => row[col])
          await mysqlQuery(
            `INSERT IGNORE INTO ${table.name} (${columnList}) VALUES (${placeholders})`,
            values
          )
          inserted++
        } catch (err) {
          console.error(`   ⚠️  Error inserting row:`, err.message)
        }
      }

      console.log(`   ✓ Inserted ${inserted}/${rows.length} rows`)
    }

    console.log('\n✅ Migration completed successfully!')
    console.log('\n📋 Migration Summary:')
    console.log(`   • Source: SQLite (${dbPath})`)
    console.log(`   • Destination: MySQL (${process.env.DB_NAME})`)
    console.log(`   • Total tables: ${tables.length}`)

  } catch (err) {
    console.error('❌ Migration failed:', err)
    process.exit(1)
  } finally {
    sqliteDb.close()
    await mysqlPool.end()
  }
}

// Run migration
migrate()
