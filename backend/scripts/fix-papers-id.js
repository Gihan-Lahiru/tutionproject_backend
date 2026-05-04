require('dotenv').config();
const pool = require('../config/database');

async function fixPapersTable() {
  try {
    console.log('Fixing papers table with proper id column...');
    
    // Create a new table with the correct structure
    await pool.query(`
      CREATE TABLE IF NOT EXISTS papers_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        type TEXT DEFAULT 'Note',
        grade TEXT,
        subject TEXT,
        file_url TEXT,
        thumbnail_url TEXT,
        uploaded_by TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        topic VARCHAR(255),
        file_public_id TEXT,
        thumbnail_public_id TEXT,
        downloads INTEGER DEFAULT 0
      )
    `);
    
    console.log('New table created. Copying data...');
    
    // Copy data from old table to new table (id will auto-generate)
    await pool.query(`
      INSERT INTO papers_new (title, description, type, grade, subject, file_url, thumbnail_url, uploaded_by, uploaded_at, topic, file_public_id, thumbnail_public_id)
      SELECT title, description, type, grade, subject, file_url, thumbnail_url, uploaded_by, uploaded_at, topic, file_public_id, thumbnail_public_id
      FROM papers
    `);
    
    console.log('Data copied. Replacing old table...');
    
    // Drop old table and rename new one
    await pool.query('DROP TABLE papers');
    await pool.query('ALTER TABLE papers_new RENAME TO papers');
    
    console.log('✅ Papers table fixed successfully with auto-incrementing id');
    
    // Show sample data
    const result = await pool.query('SELECT id, title, type, grade FROM papers LIMIT 3');
    console.log('\nSample papers with new ids:');
    console.log(result.rows);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing papers table:', error);
    process.exit(1);
  }
}

fixPapersTable();
