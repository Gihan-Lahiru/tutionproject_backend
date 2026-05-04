require('dotenv').config();
const pool = require('../config/database');

async function addFilePublicIdColumn() {
  try {
    console.log('Adding file_public_id column to papers table...');
    
    try {
      await pool.query(`
        ALTER TABLE papers 
        ADD COLUMN file_public_id TEXT
      `);
      console.log('✅ file_public_id column added successfully');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('ℹ️ file_public_id column already exists');
      } else {
        throw error;
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding file_public_id column:', error);
    process.exit(1);
  }
}

addFilePublicIdColumn();
