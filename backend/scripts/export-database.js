// Export SQLite database to JSON and SQL
const sqlite3 = require('sqlite3').verbose()
const fs = require('fs')
const path = require('path')

const dbPath = path.join(__dirname, 'tuition_sir.db')
const db = new sqlite3.Database(dbPath)

const exportData = () => {
  console.log('📊 Exporting database...\n')

  db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", (err, tables) => {
    if (err) {
      console.error('Error getting tables:', err)
      process.exit(1)
    }

    console.log(`✅ Found ${tables.length} tables:\n`)

    const allData = {}
    let completed = 0

    tables.forEach((tableObj) => {
      const tableName = tableObj.name
      
      db.all(`SELECT * FROM ${tableName}`, (err, rows) => {
        if (err) {
          console.error(`Error reading ${tableName}:`, err)
          return
        }

        allData[tableName] = rows
        const count = rows.length

        console.log(`  📦 ${tableName}: ${count} rows`)

        completed++
        if (completed === tables.length) {
          console.log('\n✅ Database exported successfully!\n')

          // Save as JSON
          const jsonPath = path.join(__dirname, '..', 'docs', 'database-export.json')
          fs.writeFileSync(jsonPath, JSON.stringify(allData, null, 2))
          console.log(`💾 Saved to: docs/database-export.json\n`)

          // Create summary
          console.log('📋 Data Summary:')
          console.log('===============')
          tables.forEach((tableObj) => {
            const count = allData[tableObj.name].length
            if (count > 0) {
              console.log(`\n${tableObj.name} (${count} records):`)
              const sample = allData[tableObj.name][0]
              const keys = Object.keys(sample)
              console.log(`  Columns: ${keys.join(', ')}`)
              if (count <= 3) {
                console.log(`  Data: ${JSON.stringify(allData[tableObj.name], null, 2)}`)
              } else {
                console.log(`  Sample: ${JSON.stringify(allData[tableObj.name][0], null, 2)}`)
              }
            }
          })

          db.close()
          process.exit(0)
        }
      })
    })
  })
}

exportData()
