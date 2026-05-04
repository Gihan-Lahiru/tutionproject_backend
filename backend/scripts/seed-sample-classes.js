require('dotenv').config()

const { db } = require('../config/database')

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve(this)
    })
  })

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })

async function main() {
  const teacherRows = await all(
    "SELECT id, email FROM users WHERE role = 'teacher' ORDER BY datetime(created_at) ASC LIMIT 1"
  )
  const teacher = teacherRows[0]
  if (!teacher) {
    console.log('No teacher found; nothing to seed.')
    process.exit(0)
  }

  const countRows = await all('SELECT COUNT(*) as c FROM classes')
  const count = countRows[0]?.c || 0

  if (count >= 2) {
    console.log(`Classes already exist (count=${count}); skipping.`)
    process.exit(0)
  }

  const cols = await all('PRAGMA table_info(classes)')
  const colSet = new Set(cols.map((c) => c.name))

  const baseCols = ['id', 'name', 'grade', 'subject', 'created_at']
  const optionalCols = ['title', 'description', 'teacher_id', 'day', 'time', 'fee']

  const insertCols = []
  for (const c of baseCols) {
    if (colSet.has(c)) insertCols.push(c)
  }
  for (const c of optionalCols) {
    if (colSet.has(c) && !insertCols.includes(c)) insertCols.push(c)
  }

  const makeRow = (id, name, grade) => {
    const row = {
      id,
      name,
      title: name,
      grade,
      subject: 'Science',
      day: 'Mon',
      time: '4:00 PM',
      fee: 1500,
      description: `${name} for Grade ${grade}`,
      teacher_id: teacher.id,
      created_at: new Date().toISOString(),
    }

    return insertCols.map((c) => row[c])
  }

  const placeholders = `(${insertCols.map(() => '?').join(',')})`
  const sql = `INSERT OR IGNORE INTO classes (${insertCols.join(',')}) VALUES ${placeholders}, ${placeholders}`

  const params = [...makeRow('sample-class-1', 'Grade 10 Science', '10'), ...makeRow('sample-class-2', 'Grade 11 Science', '11')]

  await run(sql, params)

  const afterRows = await all('SELECT COUNT(*) as c FROM classes')
  console.log(`Seeded sample classes for ${teacher.email}. classes_count_after=${afterRows[0]?.c || 0}`)
}

main().catch((e) => {
  console.error('Seeding failed:', e)
  process.exit(1)
})
