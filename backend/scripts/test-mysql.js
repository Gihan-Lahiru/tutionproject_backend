// Test MySQL connection
const mysql = require('mysql2/promise')
require('dotenv').config()

async function testConnection() {
  console.log('🔍 Testing MySQL Connection...\n')
  
  const config = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'tuition_malee',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 2,
    queueLimit: 0,
  }

  console.log('📋 Connection Config:')
  console.log(`  Host: ${config.host}`)
  console.log(`  User: ${config.user}`)
  console.log(`  Database: ${config.database}`)
  console.log(`  Port: ${config.port}\n`)

  try {
    // Create pool
    const pool = mysql.createPool(config)
    console.log('✅ Pool created\n')

    // Get connection
    const connection = await pool.getConnection()
    console.log('✅ Connected to MySQL!\n')

    // Test query
    const [results] = await connection.query('SELECT VERSION()')
    console.log('✅ Query successful!')
    console.log(`   MySQL Version: ${results[0]['VERSION()']}\n`)

    // Check if database exists
    const [databases] = await connection.query('SHOW DATABASES LIKE ?', [config.database])
    if (databases.length > 0) {
      console.log(`✅ Database "${config.database}" exists\n`)

      // Show tables
      const [tables] = await connection.query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?`, [config.database])
      console.log(`📊 Tables in database (${tables.length}):`)
      tables.forEach(t => console.log(`   - ${t.TABLE_NAME}`))
      console.log()
    } else {
      console.log(`⚠️  Database "${config.database}" does NOT exist\n`)
    }

    // Release connection
    connection.release()
    
    // Close pool
    await pool.end()
    console.log('✅ Connection closed gracefully\n')
    console.log('🎉 MySQL is working correctly!')
    process.exit(0)

  } catch (error) {
    console.error('❌ Connection Error:\n')
    console.error(`   Code: ${error.code}`)
    console.error(`   Message: ${error.message}\n`)
    
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 Note: Connection refused - this is expected if:')
      console.log('   - You\'re running locally (use SQLite instead)')
      console.log('   - Hostinger MySQL is not accessible from your IP')
      console.log('   - MySQL credentials are for Hostinger servers only\n')
    }
    
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log('💡 Note: Access denied - check credentials:')
      console.log('   - Username: DB_USER in .env')
      console.log('   - Password: DB_PASSWORD in .env')
      console.log('   - Host: DB_HOST in .env\n')
    }

    process.exit(1)
  }
}

testConnection()
