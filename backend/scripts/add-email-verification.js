const db = require('../config/database')

async function addEmailVerificationColumns() {
  try {
    console.log('Adding email verification columns to users table...')

    // Add email_verified column (default 0 = not verified)
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN email_verified INTEGER DEFAULT 0
    `).catch(() => {
      console.log('email_verified column already exists')
    })

    // Add verification_code column
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN verification_code TEXT
    `).catch(() => {
      console.log('verification_code column already exists')
    })

    // Add verification_code_expires column
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN verification_code_expires TEXT
    `).catch(() => {
      console.log('verification_code_expires column already exists')
    })

    console.log('Email verification columns added successfully!')
  } catch (error) {
    console.error('Error adding email verification columns:', error)
    throw error
  }
}

// Run if called directly
if (require.main === module) {
  addEmailVerificationColumns()
    .then(() => {
      console.log('Migration completed')
      process.exit(0)
    })
    .catch((error) => {
      console.error('Migration failed:', error)
      process.exit(1)
    })
}

module.exports = addEmailVerificationColumns
