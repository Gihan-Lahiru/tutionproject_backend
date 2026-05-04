/**
 * Production Database Setup Script for InfinityFree
 * 
 * This script should be uploaded to InfinityFree server and run there
 * InfinityFree doesn't allow remote MySQL connections
 */

const mysql = require('mysql2/promise')
const { v4: uuid } = require('uuid')
const bcrypt = require('bcryptjs')

// Production Database Credentials
const config = {
  host: 'sql100.infinityfree.com',
  port: 3306,
  user: 'if0_40629576',
  password: 'Gihan0754163785',
  database: 'if0_40629576_tution',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
}

async function setupDatabase() {
  let connection

  try {
    console.log('🚀 Connecting to InfinityFree MySQL database...')
    connection = await mysql.createConnection(config)
    console.log('✅ Connected successfully!')

    // Create tables
    console.log('\n📊 Creating database tables...')

    // Users table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id CHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('admin', 'teacher', 'student') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✅ Users table created')

    // Classes table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS classes (
        id CHAR(36) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        grade VARCHAR(50) NOT NULL,
        description TEXT,
        teacher_id CHAR(36) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✅ Classes table created')

    // Enrollments table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS enrollments (
        id CHAR(36) PRIMARY KEY,
        class_id CHAR(36) NOT NULL,
        student_id CHAR(36) NOT NULL,
        enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_enrollment (class_id, student_id),
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✅ Enrollments table created')

    // Announcements table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS announcements (
        id CHAR(36) PRIMARY KEY,
        class_id CHAR(36) NOT NULL,
        message TEXT NOT NULL,
        pinned_until TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✅ Announcements table created')

    // Assignments table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS assignments (
        id CHAR(36) PRIMARY KEY,
        class_id CHAR(36) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        due_date TIMESTAMP NOT NULL,
        attachment_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✅ Assignments table created')

    // Submissions table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS submissions (
        id CHAR(36) PRIMARY KEY,
        assignment_id CHAR(36) NOT NULL,
        student_id CHAR(36) NOT NULL,
        file_url VARCHAR(500),
        remarks TEXT,
        marks INT,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_submission (assignment_id, student_id),
        FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✅ Submissions table created')

    // Notes table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS notes (
        id CHAR(36) PRIMARY KEY,
        class_id CHAR(36) NOT NULL,
        title VARCHAR(255) NOT NULL,
        file_url VARCHAR(500) NOT NULL,
        file_type VARCHAR(50),
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✅ Notes table created')

    // Videos table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS videos (
        id CHAR(36) PRIMARY KEY,
        class_id CHAR(36) NOT NULL,
        title VARCHAR(255) NOT NULL,
        url VARCHAR(500) NOT NULL,
        duration INT,
        thumbnail_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✅ Videos table created')

    // Payments table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS payments (
        id CHAR(36) PRIMARY KEY,
        payer_id CHAR(36) NOT NULL,
        class_id CHAR(36) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'LKR',
        gateway VARCHAR(50),
        gateway_payment_id VARCHAR(255),
        status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
        paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (payer_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✅ Payments table created')

    // Insert sample data
    console.log('\n🌱 Inserting sample data...')

    // Hash passwords
    const adminPassword = await bcrypt.hash('admin123', 10)
    const teacherPassword = await bcrypt.hash('teacher123', 10)
    const studentPassword = await bcrypt.hash('student123', 10)

    // Create users
    const adminId = uuid()
    const teacherId = uuid()
    const student1Id = uuid()
    const student2Id = uuid()

    await connection.execute(
      `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
      [adminId, 'Admin User', 'admin@tuitionsir.com', adminPassword, 'admin']
    )
    console.log('✅ Admin user created')

    await connection.execute(
      `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
      [teacherId, 'Mr. Silva', 'teacher@tuitionsir.com', teacherPassword, 'teacher']
    )
    console.log('✅ Teacher user created')

    await connection.execute(
      `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
      [student1Id, 'Kamal Perera', 'student1@tuitionsir.com', studentPassword, 'student']
    )
    await connection.execute(
      `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
      [student2Id, 'Nimal Fernando', 'student2@tuitionsir.com', studentPassword, 'student']
    )
    console.log('✅ Student users created')

    // Create classes
    const mathClassId = uuid()
    const scienceClassId = uuid()

    await connection.execute(
      `INSERT INTO classes (id, title, grade, description, teacher_id) VALUES (?, ?, ?, ?, ?)`,
      [mathClassId, 'Advanced Mathematics', 'Grade 11', 'A/L Mathematics preparation class', teacherId]
    )
    await connection.execute(
      `INSERT INTO classes (id, title, grade, description, teacher_id) VALUES (?, ?, ?, ?, ?)`,
      [scienceClassId, 'Combined Mathematics', 'Grade 12', 'A/L Combined Maths intensive course', teacherId]
    )
    console.log('✅ Classes created')

    // Enroll students
    await connection.execute(
      `INSERT INTO enrollments (id, class_id, student_id) VALUES (?, ?, ?)`,
      [uuid(), mathClassId, student1Id]
    )
    await connection.execute(
      `INSERT INTO enrollments (id, class_id, student_id) VALUES (?, ?, ?)`,
      [uuid(), mathClassId, student2Id]
    )
    await connection.execute(
      `INSERT INTO enrollments (id, class_id, student_id) VALUES (?, ?, ?)`,
      [uuid(), scienceClassId, student1Id]
    )
    console.log('✅ Enrollments created')

    console.log('\n✨ Database setup completed successfully!')
    console.log('\n📝 Default Login Credentials:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Admin:')
    console.log('  Email: admin@tuitionsir.com')
    console.log('  Password: admin123')
    console.log('\nTeacher:')
    console.log('  Email: teacher@tuitionsir.com')
    console.log('  Password: teacher123')
    console.log('\nStudent:')
    console.log('  Email: student1@tuitionsir.com')
    console.log('  Password: student123')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  } catch (error) {
    console.error('❌ Error:', error.message)
    throw error
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}

// Run the setup
setupDatabase()
  .then(() => {
    console.log('🎉 All done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('💥 Setup failed:', error)
    process.exit(1)
  })
