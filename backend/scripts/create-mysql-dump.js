// Create complete SQL dump from SQLite database
const sqlite3 = require('sqlite3').verbose()
const fs = require('fs')
const path = require('path')

const dbPath = path.join(__dirname, 'tuition_sir.db')
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Cannot open database:', err)
    process.exit(1)
  }
})

let sqlDump = `-- Tuition Management System - Database Dump
-- Generated: ${new Date().toISOString()}
-- Source: SQLite (tuition_sir.db)
-- Target: MySQL (tuition_malee)

-- ============================================
-- DATABASE SCHEMA & DATA
-- ============================================

SET FOREIGN_KEY_CHECKS=0;

`

const getTables = () => {
  db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", (err, tables) => {
    if (err) {
      console.error('Error:', err)
      process.exit(1)
    }

    if (!tables || tables.length === 0) {
      console.log('⚠️  Database is empty - no tables found')
      console.log('\nℹ️  This is normal! The database schema will be created automatically on first run.')
      
      // Create sample schema file
      createSampleSchema()
      return
    }

    console.log(`📊 Found ${tables.length} tables\n`)

    let completed = 0
    tables.forEach((tableObj, idx) => {
      const tableName = tableObj.name
      console.log(`Exporting: ${idx + 1}/${tables.length} - ${tableName}...`)

      // Get schema
      db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
        if (err) {
          console.error(`Error getting schema for ${tableName}:`, err)
          return
        }

        // Create table statement
        let createTable = `\n-- Table: ${tableName}\nCREATE TABLE IF NOT EXISTS ${tableName} (\n`
        columns.forEach((col, i) => {
          createTable += `  ${col.name} ${col.type}`
          if (col.notnull) createTable += ' NOT NULL'
          if (col.pk) createTable += ' PRIMARY KEY'
          if (i < columns.length - 1) createTable += ',\n'
        })
        createTable += '\n);\n'

        sqlDump += createTable

        // Get data
        db.all(`SELECT * FROM ${tableName}`, (err, rows) => {
          if (err) {
            console.error(`Error reading ${tableName}:`, err)
            return
          }

          if (rows && rows.length > 0) {
            console.log(`  ↳ ${rows.length} rows`)
            rows.forEach((row) => {
              const cols = Object.keys(row)
              const values = cols.map((col) => {
                const val = row[col]
                if (val === null) return 'NULL'
                if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`
                return val
              })
              sqlDump += `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${values.join(', ')});\n`
            })
          }

          completed++
          if (completed === tables.length) {
            finishDump()
          }
        })
      })
    })
  })
}

const createSampleSchema = () => {
  console.log('\n📋 Creating sample database schema for MySQL...\n')
  
  // Add sample schema that matches what backend expects
  sqlDump = `-- Tuition Management System - Sample Schema
-- For MySQL (tuition_malee)
-- Generated: ${new Date().toISOString()}

SET FOREIGN_KEY_CHECKS=0;

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  role ENUM('student', 'teacher', 'admin') DEFAULT 'student',
  grade VARCHAR(50),
  phone VARCHAR(20),
  profile_picture VARCHAR(500),
  tuition_class VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active',
  current_session_id VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Classes Table
CREATE TABLE IF NOT EXISTS classes (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255),
  title VARCHAR(255),
  grade VARCHAR(50),
  subject VARCHAR(100),
  day VARCHAR(50),
  time VARCHAR(50),
  fee INT,
  description TEXT,
  location VARCHAR(255),
  teacher_id VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES users(id)
);

-- Class Students Table
CREATE TABLE IF NOT EXISTS class_students (
  id VARCHAR(255) PRIMARY KEY,
  class_id VARCHAR(255) NOT NULL,
  student_id VARCHAR(255) NOT NULL,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id) REFERENCES classes(id),
  FOREIGN KEY (student_id) REFERENCES users(id),
  UNIQUE KEY unique_class_student (class_id, student_id)
);

-- Payments Table
CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(255) PRIMARY KEY,
  payer_id VARCHAR(255),
  payer_name VARCHAR(255),
  class_id VARCHAR(255),
  amount INT,
  month INT,
  year INT,
  status VARCHAR(50) DEFAULT 'pending',
  gateway VARCHAR(50) DEFAULT 'manual',
  reference_id VARCHAR(255),
  paid_date DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  receipt_url VARCHAR(500),
  receipt_public_id VARCHAR(255),
  receipt_uploaded_at DATETIME,
  approved_by VARCHAR(255),
  approval_status VARCHAR(50) DEFAULT 'pending',
  approval_notes TEXT,
  FOREIGN KEY (payer_id) REFERENCES users(id),
  FOREIGN KEY (class_id) REFERENCES classes(id)
);

-- Videos Table
CREATE TABLE IF NOT EXISTS videos (
  id VARCHAR(255) PRIMARY KEY,
  title VARCHAR(255),
  description TEXT,
  video_url VARCHAR(500),
  thumbnail_url VARCHAR(500),
  thumbnail_public_id VARCHAR(255),
  grade VARCHAR(50),
  subject VARCHAR(100),
  class_id VARCHAR(255),
  uploaded_by VARCHAR(255),
  views INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id) REFERENCES classes(id),
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

-- Notes Table
CREATE TABLE IF NOT EXISTS notes (
  id VARCHAR(255) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  class_id VARCHAR(255),
  file_url VARCHAR(500),
  file_type VARCHAR(50),
  uploaded_by VARCHAR(255),
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id) REFERENCES classes(id),
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

-- Assignments Table
CREATE TABLE IF NOT EXISTS assignments (
  id VARCHAR(255) PRIMARY KEY,
  class_id VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  due_date DATETIME,
  attachment_url VARCHAR(500),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id) REFERENCES classes(id)
);

-- Submissions Table
CREATE TABLE IF NOT EXISTS submissions (
  id VARCHAR(255) PRIMARY KEY,
  assignment_id VARCHAR(255) NOT NULL,
  student_id VARCHAR(255) NOT NULL,
  file_url VARCHAR(500),
  remarks TEXT,
  marks INT,
  submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assignment_id) REFERENCES assignments(id),
  FOREIGN KEY (student_id) REFERENCES users(id),
  UNIQUE KEY unique_submission (assignment_id, student_id)
);

-- Announcements Table
CREATE TABLE IF NOT EXISTS announcements (
  id VARCHAR(255) PRIMARY KEY,
  class_id VARCHAR(255),
  title VARCHAR(255),
  content TEXT,
  message TEXT,
  created_by VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id) REFERENCES classes(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  related_payment_id VARCHAR(255),
  read TINYINT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  KEY idx_notifications_user (user_id),
  KEY idx_notifications_read (user_id, read)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_students_class ON class_students(class_id);
CREATE INDEX IF NOT EXISTS idx_class_students_student ON class_students(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_payer ON payments(payer_id);
CREATE INDEX IF NOT EXISTS idx_payments_class ON payments(class_id);
CREATE INDEX IF NOT EXISTS idx_videos_class ON videos(class_id);
CREATE INDEX IF NOT EXISTS idx_notes_class ON notes(class_id);
CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_announcements_class ON announcements(class_id);

SET FOREIGN_KEY_CHECKS=1;

-- ✅ Database ready for Hostinger!
`

  finishDump()
}

const finishDump = () => {
  sqlDump += `\n\nSET FOREIGN_KEY_CHECKS=1;\n`
  sqlDump += `\n-- ✅ Database dump completed\n`
  sqlDump += `-- Import this into MySQL via phpMyAdmin SQL tab\n`

  const dumpPath = path.join(__dirname, '..', '..', 'docs', 'database-dump.sql')
  fs.writeFileSync(dumpPath, sqlDump)

  console.log('✅ Database dump created!')
  console.log(`💾 Saved to: docs/database-dump.sql\n`)
  console.log('📋 File info:')
  console.log(`   Size: ${(sqlDump.length / 1024).toFixed(2)} KB`)
  console.log(`   Lines: ${sqlDump.split('\n').length}`)
  console.log('\n🚀 Ready for Hostinger!')
  console.log('\nTo import into Hostinger MySQL:')
  console.log('1. Go to Hostinger cPanel → phpMyAdmin')
  console.log('2. Select database "tuition_malee"')
  console.log('3. Click "Import" tab')
  console.log('4. Upload this SQL file')
  console.log('5. Click "Go"')

  db.close()
  process.exit(0)
}

getTables()
