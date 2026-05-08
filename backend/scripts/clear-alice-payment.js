const db = require('../config/database')

async function clearAlicePayment() {
  try {
    console.log('Clearing Alice May 2026 payment to show PayNow button...')

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

    // Delete May 2026 payment entirely
    await new Promise((resolve, reject) => {
      db.db.run(
        `DELETE FROM payments 
         WHERE student_id = ? AND month = 'May' AND year = 2026`,
        [alice.id],
        function (err) {
          if (err) reject(err)
          else {
            console.log(`✓ Deleted May 2026 payment(s)`)
            resolve()
          }
        }
      )
    })

    console.log('\n✅ Done! Alice will now see:')
    console.log('  Current Month Fee: Rs. 1,000')
    console.log('  Payment Due: May 13')
    console.log('  🔘 PayNow button (ready to pay)')
    console.log('  📤 Upload Receipt button')
    console.log('\n👉 Refresh page (Ctrl+F5) to see the buttons')
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    process.exit(0)
  }
}

clearAlicePayment()
