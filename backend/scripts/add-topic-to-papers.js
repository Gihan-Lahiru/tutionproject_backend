require('dotenv').config();
const pool = require('../config/database');

async function addTopicColumn() {
  try {
    console.log('Adding topic column to papers table...');
    
    try {
      await pool.query(`
        ALTER TABLE papers 
        ADD COLUMN topic VARCHAR(255)
      `);
      console.log('✅ Topic column added successfully');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('ℹ️ Topic column already exists');
      } else {
        throw error;
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding topic column:', error);
    process.exit(1);
  }
}

addTopicColumn();
