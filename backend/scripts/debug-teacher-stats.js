const db = require('../config/database')

async function main() {
  const teacherId = process.argv[2] || 'teacher-1'

  const gradeRows = await db.query(
    "SELECT DISTINCT grade FROM classes WHERE teacher_id = ? AND grade IS NOT NULL AND TRIM(grade) <> ''",
    [teacherId]
  )
  console.log('teacherId', teacherId)
  console.log('grades', gradeRows.rows)

  const classesCount = await db.query(
    'SELECT COUNT(*) as count FROM classes WHERE teacher_id = ? OR teacher_id IS NULL',
    [teacherId]
  )
  console.log('classesCount', classesCount.rows)

  const studentsInGrades = await db.query(
    "SELECT COUNT(DISTINCT id) as count FROM users WHERE role = 'student' AND grade IN ('10','11')",
    []
  )
  console.log('studentsInGrades(10,11)', studentsInGrades.rows)

  const studentsAll = await db.query(
    "SELECT COUNT(DISTINCT id) as count FROM users WHERE role = 'student'",
    []
  )
  console.log('studentsAll', studentsAll.rows)

  const monthKey = await db.query("SELECT strftime('%Y-%m', CURRENT_TIMESTAMP) as m", [])
  console.log('monthKey', monthKey.rows)

  const revenueThisMonth = await db.query(
    "SELECT COALESCE(SUM(p.amount),0) as total FROM payments p LEFT JOIN classes c ON c.id=p.class_id WHERE p.status='completed' AND p.class_id IS NOT NULL AND strftime('%Y-%m', COALESCE(p.payment_date,p.date)) = strftime('%Y-%m', CURRENT_TIMESTAMP) AND (c.teacher_id = ? OR c.teacher_id IS NULL)",
    [teacherId]
  )
  console.log('revenueThisMonth', revenueThisMonth.rows)
}

main().catch((e) => {
  console.error('ERROR', e)
  process.exit(1)
})
