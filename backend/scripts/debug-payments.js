const db = require('../config/database')

async function main() {
  const recent = await db.query(
    "SELECT id, amount, status, class_id, COALESCE(payment_date, date) as paid_at, payer_id, user_id, student_id FROM payments ORDER BY datetime(COALESCE(payment_date, date)) DESC LIMIT 10"
  )
  console.log('recentPayments', recent.rows)

  const completedThisMonth = await db.query(
    "SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as cnt FROM payments WHERE status='completed' AND strftime('%Y-%m', COALESCE(payment_date, date)) = strftime('%Y-%m', CURRENT_TIMESTAMP)"
  )
  console.log('completedThisMonth', completedThisMonth.rows[0])

  const completedAll = await db.query(
    "SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as cnt FROM payments WHERE status='completed'"
  )
  console.log('completedAll', completedAll.rows[0])

  const completedWithClass = await db.query(
    "SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as cnt FROM payments WHERE status='completed' AND class_id IS NOT NULL"
  )
  console.log('completedWithClassId', completedWithClass.rows[0])
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
