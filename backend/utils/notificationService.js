const crypto = require('crypto')
const { db } = require('../config/database')
const { getClassAudienceStudentIds } = require('./classAudience')

const runAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve({ changes: this.changes, lastID: this.lastID })
    })
  })

const allAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows || [])
    })
  })

const buildGradeVariants = (gradeValue) => {
  const raw = (gradeValue ?? '').toString().trim()
  const digits = raw.match(/\d+/)?.[0]

  const variants = []
  const add = (v) => {
    const s = (v ?? '').toString().trim()
    if (!s) return
    if (!variants.includes(s)) variants.push(s)
  }

  add(raw)
  if (digits) {
    add(digits)
    add(`Grade ${digits}`)
  }

  return variants
}

/**
 * Creates notifications for all students in the given grade.
 * Grade matching is tolerant to "10" vs "Grade 10" formats.
 */
async function notifyStudentsByGrade({ grade, type, message }) {
  const gradeVariants = buildGradeVariants(grade)
  if (gradeVariants.length === 0) return { created: 0 }

  const placeholders = gradeVariants.map(() => '?').join(', ')
  const students = await allAsync(
    `SELECT id FROM users WHERE role = 'student' AND grade IN (${placeholders})`,
    gradeVariants
  )

  if (!students.length) return { created: 0 }

  // Insert as a small transaction for speed/consistency
  await runAsync('BEGIN')
  try {
    let created = 0
    for (const s of students) {
      const id = crypto.randomUUID()
      await runAsync(
        `INSERT INTO notifications (id, user_id, type, message)
         VALUES (?, ?, ?, ?)`,
        [id, s.id, type, message]
      )
      created += 1
    }
    await runAsync('COMMIT')
    return { created }
  } catch (e) {
    await runAsync('ROLLBACK').catch(() => {})
    throw e
  }
}

/**
 * Creates notifications only for students belonging to a specific class audience.
 */
async function notifyStudentsByClass({ classId, type, message }) {
  const { classRow, studentIds } = await getClassAudienceStudentIds(classId)
  if (!classRow || !studentIds.length) return { created: 0 }

  await runAsync('BEGIN')
  try {
    let created = 0
    for (const studentId of studentIds) {
      const id = crypto.randomUUID()
      await runAsync(
        `INSERT INTO notifications (id, user_id, type, message)
         VALUES (?, ?, ?, ?)`,
        [id, studentId, type, message]
      )
      created += 1
    }
    await runAsync('COMMIT')
    return { created }
  } catch (e) {
    await runAsync('ROLLBACK').catch(() => {})
    throw e
  }
}

module.exports = {
  notifyStudentsByGrade,
  notifyStudentsByClass,
  buildGradeVariants,
}
