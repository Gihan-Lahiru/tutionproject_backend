require('dotenv').config();
const db = require('../config/database');

async function test() {
  try {
    // Get user
    console.log('1. Fetching user...');
    const result = await db.query('SELECT id, name, email, phone FROM users WHERE email = ?', ['kamala@gmail.com']);
    const user = result.rows[0];
    console.log('User:', user);
    console.log('User ID type:', typeof user.id, 'Value:', user.id);
    
    // Try to update
    console.log('\n2. Updating user...');
    await db.query('UPDATE users SET name = ?, phone = ? WHERE id = ?', ['Kamala Updated', '0771234567', user.id]);
    
    // Check update
    console.log('\n3. Checking updated user...');
    const updated = await db.query('SELECT id, name, email, phone FROM users WHERE id = ?', [user.id]);
    console.log('Updated user:', updated.rows[0]);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

test();
