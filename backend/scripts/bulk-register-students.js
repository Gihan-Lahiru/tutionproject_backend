const { db } = require('../config/database');
const bcrypt = require('bcryptjs');
const { sendVerificationEmail, generateVerificationCode } = require('../utils/emailService');

/**
 * Bulk register students from CSV or array
 * Usage: node scripts/bulk-register-students.js
 */

const students = [
  { name: 'John Doe', email: 'john@gmail.com', grade: 10, institute: 'Royal College' },
  { name: 'Jane Smith', email: 'jane@gmail.com', grade: 11, institute: 'Visakha Vidyalaya' },
  // Add more students here...
];

async function bulkRegisterStudents() {
  console.log('🚀 Starting bulk student registration...\n');
  
  const results = {
    success: [],
    failed: [],
    skipped: []
  };

  for (const student of students) {
    try {
      console.log(`Processing: ${student.name} (${student.email})...`);

      // Check if email already exists
      const existingUser = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE email = ?', [student.email], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (existingUser) {
        console.log(`  ⚠️  Skipped - Email already registered\n`);
        results.skipped.push({ ...student, reason: 'Already registered' });
        continue;
      }

      // Generate temporary password (can be sent via email)
      const tempPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      // Insert user
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO users (name, email, password, role, grade, institute, email_verified, profile_picture) 
           VALUES (?, ?, ?, 'student', ?, ?, 1, NULL)`,
          [student.name, student.email, hashedPassword, student.grade, student.institute],
          function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });

      // Send welcome email with temporary password
      try {
        await sendWelcomeEmail(student.email, student.name, tempPassword);
        console.log(`  ✅ Registered successfully - Password sent to email\n`);
        results.success.push({ ...student, tempPassword });
      } catch (emailError) {
        console.log(`  ✅ Registered (email failed - manual password: ${tempPassword})\n`);
        results.success.push({ ...student, tempPassword, emailFailed: true });
      }

    } catch (error) {
      console.log(`  ❌ Failed: ${error.message}\n`);
      results.failed.push({ ...student, error: error.message });
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 BULK REGISTRATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Successful: ${results.success.length}`);
  console.log(`⚠️  Skipped: ${results.skipped.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log('='.repeat(60) + '\n');

  // Save results to file
  const fs = require('fs');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = `./bulk-registration-report-${timestamp}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`📄 Detailed report saved to: ${reportPath}\n`);

  process.exit(0);
}

async function sendWelcomeEmail(email, name, password) {
  const nodemailer = require('nodemailer');
  
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    throw new Error('Email not configured');
  }

  const transporter = nodemailer.createTransporter({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: `"Tuition Sir LMS" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Welcome to Tuition Sir LMS - Your Account Details',
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #2563eb 0%, #06b6d4 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1>Welcome to Tuition Sir LMS!</h1>
          </div>
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
            <p>Hello <strong>${name}</strong>,</p>
            <p>Your account has been created successfully! Here are your login credentials:</p>
            
            <div style="background: white; border: 2px solid #2563eb; padding: 20px; margin: 20px 0; border-radius: 8px;">
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Temporary Password:</strong> <span style="color: #2563eb; font-size: 18px; font-weight: bold;">${password}</span></p>
            </div>
            
            <p><strong>⚠️ Important:</strong> Please change your password after your first login for security.</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="http://localhost:3002/login" style="background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Login Now</a>
            </div>
            
            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280;">
              <p>Best regards,<br><strong>Tuition Sir LMS Team</strong></p>
              <p>Contact: +94 71 439 0924</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
  });
}

// Run the script
bulkRegisterStudents();
