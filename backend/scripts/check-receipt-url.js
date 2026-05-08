const db = require('../config/database')

async function checkReceiptUrl() {
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

    const row = await new Promise((resolve, reject) => {
      db.db.get(
        `SELECT id, receipt_url, receipt_public_id 
         FROM payments 
         WHERE student_id = ? 
         AND month = 'May' 
         AND year = 2026`,
        [alice.id],
        (err, row) => {
          if (err) reject(err)
          else resolve(row)
        }
      )
    })

    console.log('📋 Receipt URL Data:')
    console.log('ID:', row?.id)
    console.log('Receipt URL:', row?.receipt_url)
    console.log('Receipt Public ID:', row?.receipt_public_id)
    
    if (!row || !row.receipt_url) {
      console.log('❌ No receipt uploaded yet')
    }
  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    process.exit(0)
  }
}

checkReceiptUrl()

