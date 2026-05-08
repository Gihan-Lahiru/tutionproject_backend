const db = require('../config/database')

async function fixAlicePayments() {
  try {
    console.log('Cleaning up Alice\'s payment history...')

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

    // Delete all old payments (keep only May 2026)
    await new Promise((resolve, reject) => {
      db.db.run(
        `DELETE FROM payments 
         WHERE student_id = ? AND NOT (month = 'May' AND year = 2026)`,
        [alice.id],
        function (err) {
          if (err) reject(err)
          else {
            console.log(`✓ Deleted ${this.changes} old payment(s)`)
            resolve()
          }
        }
      )
    })

    // Ensure May 2026 is pending status
    await new Promise((resolve, reject) => {
      db.db.run(
        `UPDATE payments 
         SET status = 'pending',
             payment_date = NULL,
             receipt_url = NULL,
             receipt_public_id = NULL,
             receipt_uploaded_at = NULL,
             approval_status = 'pending',
             approved_by = NULL,
             approval_notes = NULL
         WHERE student_id = ? AND month = 'May' AND year = 2026`,
        [alice.id],
        function (err) {
          if (err) reject(err)
          else {
            console.log(`✓ Reset May 2026 payment to fresh pending state`)
            resolve()
          }
        }
      )
    })

    console.log('\n✅ Alice\'s payment is fixed!')
    console.log('\nAlice should now see:')
    console.log('  • Rs. 1,000 fee for May 2026')
    console.log('  • PayNow button (click to pay online)')
    console.log('  • Upload Receipt button (for manual payment)')
    console.log('\n👉 Please refresh the page (Ctrl+F5) to clear browser cache')
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    process.exit(0)
  }
}

fixAlicePayments()
