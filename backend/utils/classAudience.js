const { db } = require('../config/database')

const getRow = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row)
    })
  })

const getAll = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows || [])
    })
  })

const normalizeGrade = (value) => {
  const raw = (value || '').toString().toLowerCase().trim()
  const digits = raw.match(/\d+/)?.[0]
  return digits || raw.replace(/^grade\s+/, '')
}

const normalizeLocationPrefix = (value) => {
  const raw = (value || '').toString().trim().toLowerCase()
  if (!raw) return ''
  return raw.split(' - ')[0].trim()
}

async function getClassAudienceStudentIds(classId) {
  const classRow = await getRow('SELECT id, grade, location FROM classes WHERE id = ?', [classId])
  if (!classRow) return { classRow: null, studentIds: [] }

  const allStudents = await getAll(
    `SELECT id, grade, institute
     FROM users
     WHERE role = 'student'`,
    []
  )

  const classGrade = normalizeGrade(classRow.grade)
  const classLocation = normalizeLocationPrefix(classRow.location)

  const studentIds = allStudents
    .filter((student) => {
      const studentGrade = normalizeGrade(student.grade)
      if (!studentGrade || studentGrade !== classGrade) return false

      if (!classLocation) return true

      const studentLocation = normalizeLocationPrefix(student.institute)
      return !!studentLocation && studentLocation === classLocation
    })
    .map((student) => student.id)

  return { classRow, studentIds }
}

module.exports = {
  getClassAudienceStudentIds,
  normalizeGrade,
  normalizeLocationPrefix,
}
