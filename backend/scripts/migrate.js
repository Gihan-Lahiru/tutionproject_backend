require('dotenv').config()
const { pool } = require('../config/database')

const schemas = [
  // Enable UUID extension
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,

  // Users table
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    phone VARCHAR(20),
    address TEXT,
    role VARCHAR(20) CHECK (role IN ('student', 'teacher', 'admin')) NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Classes table
  `CREATE TABLE IF NOT EXISTS classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    grade VARCHAR(50),
    description TEXT,
    teacher_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL
  )`,

  // Enrollments table
  `CREATE TABLE IF NOT EXISTS enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID,
    student_id UUID,
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (class_id, student_id),
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
  )`,

  // Announcements table
  `CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID,
    message TEXT NOT NULL,
    pinned_until TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
  )`,

  // Assignments table
  `CREATE TABLE IF NOT EXISTS assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_date TIMESTAMP NULL,
    attachment_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
  )`,

  // Submissions table
  `CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID,
    student_id UUID,
    file_url VARCHAR(500),
    remarks TEXT,
    marks NUMERIC(5,2),
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (assignment_id, student_id),
    FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
  )`,

  // Notes table
  `CREATE TABLE IF NOT EXISTS notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID,
    title VARCHAR(255) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    file_type VARCHAR(50),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
  )`,

  // Videos table
  `CREATE TABLE IF NOT EXISTS videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID,
    title VARCHAR(255) NOT NULL,
    url VARCHAR(500) NOT NULL,
    duration VARCHAR(20),
    thumbnail_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
  )`,

  // Payments table
  `CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payer_id UUID,
    class_id UUID,
    amount NUMERIC(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'LKR',
    gateway VARCHAR(50),
    gateway_payment_id VARCHAR(255),
    status VARCHAR(20) CHECK (status IN ('pending', 'completed', 'failed', 'refunded')) NOT NULL,
    paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (payer_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
  )`,

  // Add phone and address columns to users table (for existing databases)
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT`,

  // Create indexes
  `CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes(teacher_id)`,
  `CREATE INDEX IF NOT EXISTS idx_enrollments_class ON enrollments(class_id)`,
  `CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id)`,
  `CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id)`,
  `CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON submissions(assignment_id)`,
  `CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_payer ON payments(payer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_class ON payments(class_id)`
]

async function migrate() {
  let client
  try {
    console.log('🚀 Starting PostgreSQL database migration...')
    
    client = await pool.connect()
    
    for (const schema of schemas) {
      try {
        await client.query(schema)
      } catch (error) {
        if (error.code !== '42710' && error.code !== '42P07') { // Ignore already exists errors
          throw error
        }
      }
    }
    
    console.log('✅ Database migration completed successfully!')
    process.exit(0)
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  } finally {
    if (client) client.release()
  }
}

migrate()
