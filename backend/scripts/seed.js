require('dotenv').config()
const bcrypt = require('bcryptjs')
const { v4: uuidv4 } = require('uuid')
const { pool } = require('../config/database')

async function seed() {
  try {
    console.log('🌱 Starting database seeding...')

    // Create admin user
    const adminId = uuidv4()
    const adminPassword = await bcrypt.hash('admin123', 10)
    await pool.query(
      `INSERT INTO users (id, name, email, password_hash, role, verified) 
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO NOTHING`,
      [adminId, 'Admin User', 'admin@tuitionsir.com', adminPassword, 'admin', true]
    )

    // Create teacher
    const teacherId = uuidv4()
    const teacherPassword = await bcrypt.hash('teacher123', 10)
    await pool.query(
      `INSERT INTO users (id, name, email, password_hash, role, verified) 
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO NOTHING`,
      [teacherId, 'John Smith', 'teacher@tuitionsir.com', teacherPassword, 'teacher', true]
    )

    // Create students
    const studentPassword = await bcrypt.hash('student123', 10)
    const student1Id = uuidv4()
    const student2Id = uuidv4()
    await pool.query(
      `INSERT INTO users (id, name, email, password_hash, role, verified) 
       VALUES ($1, $2, $3, $4, $5, $6), ($7, $8, $9, $10, $11, $12)
       ON CONFLICT (email) DO NOTHING`,
      [
        student1Id, 'Alice Johnson', 'alice@student.com', studentPassword, 'student', true,
        student2Id, 'Bob Williams', 'bob@student.com', studentPassword, 'student', true
      ]
    )

    // Create sample classes
    const class1Id = uuidv4()
    const class2Id = uuidv4()
    await pool.query(
      `INSERT INTO classes (id, title, grade, description, teacher_id) 
       VALUES ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10)
       ON CONFLICT (id) DO NOTHING`,
      [
        class1Id, 'Advanced Mathematics', '10', 'Comprehensive mathematics course for grade 10 students', teacherId,
        class2Id, 'Physics Fundamentals', '10', 'Introduction to physics concepts and applications', teacherId
      ]
    )

    console.log('✅ Database seeding completed successfully!')
    console.log('\n📋 Default credentials:')
    console.log('Admin: admin@tuitionsir.com / admin123')
    console.log('Teacher: teacher@tuitionsir.com / teacher123')
    console.log('Student: alice@student.com / student123')
    console.log('Student: bob@student.com / student123')
    
    process.exit(0)
  } catch (error) {
    console.error('❌ Seeding failed:', error)
    process.exit(1)
  }
}

seed()
