const db = require('../config/database')

async function deleteAliceMayPayment() {
  try {
    console.log('Deleting Alice May 2026 payment...')

    // Find Alice
    const alice = await new Promise((resolve, reject) => {
      db.db.get(
        "SELECT id FROM users WHERE email = 'alice@student.com'",
        (err, row) => {
          if (err) reject(err)
          else resolve(row)
        }
      )
    })

    if (!alice) {
      console.error('❌ Alice not found!')
      process.exit(1)
    }

    // Delete ALL May 2026 payments for Alice
    await new Promise((resolve, reject) => {
      db.db.run(
        `DELETE FROM payments 
         WHERE student_id = ? AND month = 'May' AND year = 2026`,
        [alice.id],
        function (err) {
          if (err) reject(err)
          else {
            console.log(`✓ Deleted ${this.changes} payment(s)`)
            resolve()
          }
        }
      )
    })

    // Create fresh pending payment
    const paymentId = `alice-fresh-${Date.now()}`
    await new Promise((resolve, reject) => {
      db.db.run(
        `INSERT INTO payments (
          id, student_id, amount, month, year, currency, status, date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [paymentId, alice.id, 1000, 'May', 2026, 'LKR', 'pending'],
        function (err) {
          if (err) reject(err)
          else resolve()
        }
      )
    })

    console.log('\n✅ Created fresh payment for Alice!')
    console.log('  Amount: Rs. 1,000 (Grade 6)')
    console.log('  Month: May 2026')
    console.log('  Status: Pending')
    console.log('\nAlice should now see:')
    console.log('  ✓ PayNow button to make online payment')
    console.log('  ✓ Upload Receipt button for manual payment')
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    process.exit(0)
  }
}

deleteAliceMayPayment()
