require('dotenv').config()
const db = require('../config/database')

async function addGradeColumn() {
  try {
    console.log('Adding grade column to users table...')
    
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS grade VARCHAR(50)
    `)
    
    console.log('✅ Grade column added successfully!')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error adding grade column:', error)
    process.exit(1)
  }
}

addGradeColumn()
