const { Pool } = require('pg')
require('dotenv').config()

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
})

async function updateAliceGrade() {
  try {
    console.log('Connecting to database...')
    
    // First, check all users
    const allUsers = await pool.query('SELECT id, name, email, role, grade FROM users')
    console.log('\nAll users in database:')
    console.table(allUsers.rows)
    
    // Find student users
    const students = allUsers.rows.filter(u => u.role === 'student')
    if (students.length === 0) {
      console.log('\n✗ No student users found in database')
      await pool.end()
      process.exit(1)
      return
    }
    
    console.log('\nStudent users:')
    console.table(students)
    
    // Update Alice (alico@student.com) to Grade 10
    const result = await pool.query(
      `UPDATE users 
       SET grade = $1 
       WHERE email = $2 
       RETURNING id, name, email, grade`,
      ['Grade 10', 'alico@student.com']
    )
    
    if (result.rows.length > 0) {
      console.log('\n✓ Successfully updated grade!')
      console.log('Updated user:', result.rows[0])
    } else {
      console.log('\n✗ Update failed')
    }
    
    await pool.end()
    process.exit(0)
  } catch (error) {
    console.error('Error updating grade:', error)
    await pool.end()
    process.exit(1)
  }
}

updateAliceGrade()
