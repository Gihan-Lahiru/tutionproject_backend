require('dotenv').config();
const db = require('../config/database');

async function addInstituteColumn() {
  try {
    console.log('Adding institute column to users table...');
    
    // Add institute column
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS institute VARCHAR(100)
    `);
    
    console.log('✓ Institute column added successfully');
    
    // Update existing users with a default value (optional)
    await db.query(`
      UPDATE users 
      SET institute = 'Institute A' 
      WHERE institute IS NULL AND role = 'student'
    `);
    
    console.log('✓ Existing users updated with default institute');
    console.log('Migration completed successfully!');
    
    process.exit(0);
  } catch (error) {
    console.error('Error adding institute column:', error);
    process.exit(1);
  }
}

addInstituteColumn();
