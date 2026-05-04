require('dotenv').config();
const pool = require('../config/database');

async function addTopicThumbnailColumns() {
  try {
    console.log('Adding topic and thumbnail columns to papers table...');
    
    await pool.query(`
      ALTER TABLE papers 
      ADD COLUMN IF NOT EXISTS topic VARCHAR(255),
      ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
      ADD COLUMN IF NOT EXISTS thumbnail_public_id TEXT
    `);
    
    console.log('✅ Columns added successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding columns:', error);
    process.exit(1);
  }
}

addTopicThumbnailColumns();
