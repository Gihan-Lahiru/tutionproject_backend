require('dotenv').config();
const pool = require('../config/database');

async function checkSchema() {
  try {
    // Check table structure
    const tableInfo = await pool.query('PRAGMA table_info(papers)');
    console.log('Papers table schema:');
    console.log(JSON.stringify(tableInfo.rows, null, 2));
    
    // Check sample data
    const sampleData = await pool.query('SELECT * FROM papers LIMIT 1');
    console.log('\nSample paper data:');
    console.log(JSON.stringify(sampleData.rows, null, 2));
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkSchema();
