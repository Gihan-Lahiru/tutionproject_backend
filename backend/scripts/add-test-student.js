const { db } = require('../config/database');
const bcrypt = require('bcryptjs');

async function addTestStudent() {
  try {
    // Student credentials
    const email = 'student@gmail.com';
    const password = 'student';
    const name = 'Test Student';
    const grade = 10;
    const institute = 'Test Institute';

    // Check if student already exists
    const existingUser = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (existingUser) {
      console.log('⚠️  Student already exists!');
      console.log('\n📧 Login Credentials:');
      console.log('Email:', email);
      console.log('Password: student');
      process.exit(0);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert student
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO users (name, email, password_hash, role, grade, institute, email_verified, profile_picture) 
         VALUES (?, ?, ?, 'student', ?, ?, 1, NULL)`,
        [name, email, hashedPassword, grade, institute],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });

    console.log('\n✅ Test student added successfully!\n');
    console.log('📧 Login Credentials:');
    console.log('─'.repeat(40));
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('─'.repeat(40));
    console.log('\nYou can now login at: http://localhost:3002/login\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

addTestStudent();
