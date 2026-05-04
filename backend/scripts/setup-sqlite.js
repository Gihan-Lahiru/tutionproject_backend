require('dotenv').config()
const bcrypt = require('bcryptjs')
const { db } = require('../config/database')

async function setup() {
  console.log('🚀 Setting up SQLite database...')

  // Create tables
  db.serialize(() => {
    // Users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'student',
        phone TEXT,
        grade TEXT,
        institute TEXT,
        profile_picture TEXT,
        verified INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('Error creating users table:', err)
      else console.log('✅ Users table created')
    })

    // Insert seed data
    const adminPassword = bcrypt.hashSync('admin123', 10)
    const teacherPassword = bcrypt.hashSync('teacher123', 10)
    const studentPassword = bcrypt.hashSync('student123', 10)

    db.run(`
      INSERT OR IGNORE INTO users (id, name, email, password_hash, role, verified) 
      VALUES 
        ('admin-1', 'Admin User', 'admin@tuitionsir.com', ?, 'admin', 1),
        ('teacher-1', 'John Smith', 'teacher@tuitionsir.com', ?, 'teacher', 1),
        ('student-1', 'Alice Johnson', 'alice@student.com', ?, 'student', 1),
        ('student-2', 'Bob Williams', 'bob@student.com', ?, 'student', 1)
    `, [adminPassword, teacherPassword, studentPassword, studentPassword], (err) => {
      if (err) console.error('Error seeding users:', err)
      else console.log('✅ Users seeded')
    })

    // Classes table
    db.run(`
      CREATE TABLE IF NOT EXISTS classes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        grade TEXT NOT NULL,
        subject TEXT NOT NULL,
        day TEXT,
        time TEXT,
        fee REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('Error creating classes table:', err)
      else console.log('✅ Classes table created')
    })

    // Payments table
    db.run(`
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        amount REAL NOT NULL,
        month TEXT,
        year INTEGER,
        status TEXT DEFAULT 'pending',
        payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `, (err) => {
      if (err) console.error('Error creating payments table:', err)
      else console.log('✅ Payments table created')
    })

    console.log('\n✅ Database setup complete!')
    console.log('\n📧 Test Credentials:')
    console.log('   Student: alice@student.com / student123')
    console.log('   Student: bob@student.com / student123')
    console.log('   Teacher: teacher@tuitionsir.com / teacher123')
    console.log('   Admin: admin@tuitionsir.com / admin123\n')
    
    setTimeout(() => process.exit(0), 1000)
  })
}

setup()
