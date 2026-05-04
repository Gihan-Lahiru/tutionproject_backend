require('dotenv').config();
const pool = require('../config/database');

async function addPapersTable() {
  try {
    console.log('Creating papers table...');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS papers (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        grade VARCHAR(50) NOT NULL,
        type VARCHAR(50) NOT NULL,
        file_url TEXT NOT NULL,
        file_public_id TEXT NOT NULL,
        uploaded_by UUID REFERENCES users(id),
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        downloads INTEGER DEFAULT 0
      )
    `);
    
    console.log('✅ Papers table created successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating papers table:', error);
    process.exit(1);
  }
}

addPapersTable();
