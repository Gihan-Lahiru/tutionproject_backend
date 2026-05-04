require('dotenv').config()
const db = require('../config/database')

async function addProfilePictureColumn() {
  try {
    console.log('Adding profile_picture column to users table...')
    
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS profile_picture VARCHAR(500)
    `)
    
    console.log('✅ Profile picture column added successfully!')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error adding profile picture column:', error)
    process.exit(1)
  }
}

addProfilePictureColumn()
