const db = require('../config/database')

async function createAlicePayment() {
  try {
    console.log('Creating payment for Alice...')

    // Get current date
    const now = new Date()
    const currentMonth = now.toLocaleString('en-US', { month: 'long' })
    const currentYear = now.getFullYear()

    // Find Alice
    const alice = await new Promise((resolve, reject) => {
      db.db.get(
        "SELECT id, email, status FROM users WHERE email = 'alice@student.com'",
        (err, row) => {
          if (err) reject(err)
          else resolve(row)
        }
      )
    })

    if (!alice) {
      console.error('❌ Alice not found! Run setup-sqlite.js first')
      process.exit(1)
    }

    console.log(`✓ Found Alice (${alice.email}, Status: ${alice.status})`)

    // Activate if inactive
    if (alice.status !== 'active') {
      await new Promise((resolve, reject) => {
        db.db.run(
          "UPDATE users SET status = 'active' WHERE id = ?",
          [alice.id],
          function (err) {
            if (err) reject(err)
            else {
              console.log('✓ Activated Alice account')
              resolve()
            }
          }
        )
      })
    }

    // Delete existing pending/rejected payments for this month
    await new Promise((resolve, reject) => {
      db.db.run(
        `DELETE FROM payments 
         WHERE student_id = ? AND month = ? AND year = ? AND status IN ('pending', 'rejected')`,
        [alice.id, currentMonth, currentYear],
        function (err) {
          if (err) reject(err)
          else {
            if (this.changes > 0) console.log(`✓ Cleared ${this.changes} old payment(s)`)
            resolve()
          }
        }
      )
    })

    // Create new pending payment
    const paymentId = `alice-${currentMonth}-${currentYear}-${Date.now()}`
    await new Promise((resolve, reject) => {
      db.db.run(
        `INSERT INTO payments (
          id, student_id, amount, month, year, currency, status, date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [paymentId, alice.id, 1500, currentMonth, currentYear, 'LKR', 'pending'],
        function (err) {
          if (err) reject(err)
          else {
            console.log(`✓ Created payment: ${paymentId}`)
            console.log(`  Amount: Rs. 1500`)
            console.log(`  Month: ${currentMonth} ${currentYear}`)
            console.log(`  Status: pending`)
            resolve()
          }
        }
      )
    })

    console.log('\n✅ Done! Alice can now pay for ' + currentMonth + ' ' + currentYear)
    console.log('\nLogin as Alice:')
    console.log('  Email: alice@student.com')
    console.log('  Password: student123')
    console.log('  URL: http://localhost:3002/login')
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    process.exit(0)
  }
}

createAlicePayment()
