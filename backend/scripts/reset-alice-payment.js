const db = require('../config/database')

async function resetAlicePayment() {
  try {
    console.log('Resetting Alice May 2026 payment to pending...')

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

    // Reset May 2026 payment status to pending
    await new Promise((resolve, reject) => {
      db.db.run(
        `UPDATE payments 
         SET status = 'pending', 
             payment_date = NULL,
             receipt_url = NULL,
             receipt_public_id = NULL,
             approval_status = 'pending'
         WHERE student_id = ? AND month = 'May' AND year = 2026`,
        [alice.id],
        function (err) {
          if (err) reject(err)
          else {
            if (this.changes > 0) {
              console.log(`✓ Reset ${this.changes} payment(s) to pending`)
            } else {
              console.log('⚠ No May 2026 payment found for Alice')
            }
            resolve()
          }
        }
      )
    })

    console.log('\n✅ Alice\'s May 2026 payment is ready to pay again!')
    console.log('\nAlice can now:')
    console.log('  • Upload receipt via "Upload Receipt" button')
    console.log('  • Use PayNow for online payment')
    console.log('  • Retry payment flow')
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    process.exit(0)
  }
}

resetAlicePayment()
