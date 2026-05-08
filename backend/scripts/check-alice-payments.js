const db = require('../config/database')

async function checkAlicePayments() {
  try {
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
      console.log('❌ Alice not found')
      process.exit(1)
    }

    const payments = await new Promise((resolve, reject) => {
      db.db.all(
        `SELECT id, amount, month, year, status, payment_date, receipt_url 
         FROM payments 
         WHERE student_id = ? 
         ORDER BY date DESC`,
        [alice.id],
        (err, rows) => {
          if (err) reject(err)
          else resolve(rows || [])
        }
      )
    })

    console.log('\n📋 Alice\'s All Payments:\n')
    if (payments.length === 0) {
      console.log('  (no payments)')
    } else {
      payments.forEach((p, i) => {
        console.log(`[${i + 1}] ${p.month} ${p.year} - Rs ${p.amount}`)
        console.log(`    Status: ${p.status}`)
        console.log(`    Receipt: ${p.receipt_url ? 'YES' : 'NO'}`)
        console.log('')
      })
    }

    console.log('To clean up duplicates and fix "Payment processing" issue:')
    console.log('  Run: node backend/scripts/fix-alice-payment.js')
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    process.exit(0)
  }
}

checkAlicePayments()
