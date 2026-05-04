const crypto = require('crypto')
const db = require('../config/database')

const getRow = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.db.get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row)
    })
  })

const getAll = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows || [])
    })
  })

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve({ changes: this.changes, lastID: this.lastID })
    })
  })

class Assignment {
  static async findById(id) {
    return await getRow(
      `SELECT a.*, c.title as class_title
       FROM assignments a
       JOIN classes c ON a.class_id = c.id
       WHERE a.id = ?`,
      [id]
    )
  }

  static async getByClass(classId) {
    return await getAll(
      `SELECT * FROM assignments
       WHERE class_id = ?
       ORDER BY datetime(COALESCE(due_date, created_at)) DESC`,
      [classId]
    )
  }

  static async getByStudentId(studentId) {
    const fetchByStudentScope = async (includeSubmissionColumns) => {
      const userRes = await db.query('SELECT grade, tuition_class FROM users WHERE id = ?', [studentId])
      const userGradeRaw = userRes.rows?.[0]?.grade
      const tuitionClass = String(userRes.rows?.[0]?.tuition_class || '').trim()

      if (tuitionClass) {
        const classScopedQuery = includeSubmissionColumns
          ? `SELECT a.*, c.title as class_title, c.grade,
               s.marks, s.submitted_at
             FROM assignments a
             JOIN classes c ON a.class_id = c.id
             LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = ?
             WHERE a.class_id = ?
             ORDER BY datetime(COALESCE(a.due_date, a.created_at)) DESC`
          : `SELECT a.*, c.title as class_title, c.grade,
               NULL as marks, NULL as submitted_at
             FROM assignments a
             JOIN classes c ON a.class_id = c.id
             WHERE a.class_id = ?
             ORDER BY datetime(COALESCE(a.due_date, a.created_at)) DESC`

        const classScopedParams = includeSubmissionColumns
          ? [studentId, tuitionClass]
          : [tuitionClass]

        const classScopedResult = await db.query(classScopedQuery, classScopedParams)
        if ((classScopedResult.rows || []).length > 0) {
          return classScopedResult.rows || []
        }
      }

      if (!userGradeRaw) return []

      const gradeRawNormalized = String(userGradeRaw).trim().toLowerCase().replace(/^grade\s+/, '')

      const safeQuery = includeSubmissionColumns
        ? `SELECT a.*, c.title as class_title, c.grade,
             s.marks, s.submitted_at
           FROM assignments a
           JOIN classes c ON a.class_id = c.id
           LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = ?
           WHERE REPLACE(LOWER(TRIM(COALESCE(c.grade, ''))), 'grade ', '') = ?
           ORDER BY datetime(COALESCE(a.due_date, a.created_at)) DESC`
        : `SELECT a.*, c.title as class_title, c.grade,
             NULL as marks, NULL as submitted_at
           FROM assignments a
           JOIN classes c ON a.class_id = c.id
           WHERE REPLACE(LOWER(TRIM(COALESCE(c.grade, ''))), 'grade ', '') = ?
           ORDER BY datetime(COALESCE(a.due_date, a.created_at)) DESC`

      const params = includeSubmissionColumns
        ? [studentId, gradeRawNormalized]
        : [gradeRawNormalized]

      const result = await db.query(safeQuery, params)
      return result.rows || []
    }

    const fetchFromPapersFallback = async () => {
      const userRes = await db.query('SELECT grade, tuition_class FROM users WHERE id = ?', [studentId])
      const userGradeRaw = userRes.rows?.[0]?.grade
      const tuitionClass = String(userRes.rows?.[0]?.tuition_class || '').trim()

      try {
        const tableInfoRes = await db.query('PRAGMA table_info(papers)')
        const paperColumns = new Set((tableInfoRes.rows || []).map((r) => String(r.name || '').toLowerCase()))
        if (!paperColumns.has('id') || !paperColumns.has('title')) return []

        const hasType = paperColumns.has('type')
        const hasClassId = paperColumns.has('class_id')
        const hasGrade = paperColumns.has('grade')
        const hasFileUrl = paperColumns.has('file_url')
        const hasUploadedAt = paperColumns.has('uploaded_at')

        const buildSelect = () => `SELECT p.id,
                  p.title,
                  ${hasGrade ? 'p.grade' : 'NULL as grade'},
                  ${hasClassId ? 'p.class_id' : 'NULL as class_id'},
                  ${hasFileUrl ? 'p.file_url as attachment_url' : 'NULL as attachment_url'},
                  ${hasUploadedAt ? 'p.uploaded_at as due_date' : 'NULL as due_date'},
                  c.title as class_title,
                  NULL as marks,
                  NULL as submitted_at,
                  NULL as total_marks
           FROM papers p
           ${hasClassId ? 'LEFT JOIN classes c ON c.id = p.class_id' : 'LEFT JOIN classes c ON 1=0'}`

        const buildWhere = (withClassFilter, withGradeFilter) => {
          const clauses = []
          if (hasType) clauses.push("LOWER(COALESCE(p.type, '')) = 'assignment'")
          if (withClassFilter && hasClassId) clauses.push('p.class_id = ?')
          if (withGradeFilter && hasGrade) {
            clauses.push("REPLACE(LOWER(TRIM(COALESCE(p.grade, ''))), 'grade ', '') = ?")
          }
          return clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
        }

        const orderBy = hasUploadedAt
          ? 'ORDER BY datetime(COALESCE(p.uploaded_at, CURRENT_TIMESTAMP)) DESC'
          : 'ORDER BY p.id DESC'

        // Prefer class-specific assignment uploads when student has a linked class.
        if (tuitionClass && hasClassId) {
          const byClassRes = await db.query(
            `${buildSelect()}
             ${buildWhere(true, false)}
             ${orderBy}`,
            [tuitionClass]
          )
          if ((byClassRes.rows || []).length > 0) return byClassRes.rows
        }

        if (!userGradeRaw || !hasGrade) return []

        const gradeRawNormalized = String(userGradeRaw).trim().toLowerCase().replace(/^grade\s+/, '')
        const byGradeRes = await db.query(
          `${buildSelect()}
           ${buildWhere(false, true)}
           ${orderBy}`,
          [gradeRawNormalized]
        )
        return byGradeRes.rows || []
      } catch (error) {
        const message = String(error?.message || '')
        if (message.includes('no such table: papers')) return []
        throw error
      }
    }

    // Primary path (full feature): enrollments + submissions
    try {
      const result = await db.query(
        `SELECT a.*, c.title as class_title, c.grade,
         s.marks, s.submitted_at
         FROM assignments a
         JOIN classes c ON a.class_id = c.id
         JOIN enrollments e ON e.class_id = c.id
         LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = ?
         WHERE e.student_id = ?
         ORDER BY a.due_date DESC`,
        [studentId, studentId]
      )

      // If enrollments table exists but no enrollment data, fallback to grade matching.
      if ((result.rows || []).length === 0) {
        const scoped = await fetchByStudentScope(true)
        if ((scoped || []).length > 0) return scoped
        return await fetchFromPapersFallback()
      }

      return result.rows
    } catch (error) {
      const message = (error && error.message) ? String(error.message) : ''

      // If assignments aren't set up at all, return empty list instead of breaking the UI.
      if (message.includes('no such table: assignments')) return []

      // Some deployments don't have enrollments/submissions yet.
      if (message.includes('no such table: enrollments') || message.includes('no such table: submissions')) {
        // Fallback: return assignments by the student's grade (from users table)
        const scoped = await fetchByStudentScope(!message.includes('no such table: submissions'))
        if ((scoped || []).length > 0) return scoped
        return await fetchFromPapersFallback()
      }

      throw error
    }
  }

  static async create(assignmentData) {
    const { class_id, title, description, due_date, attachment_url } = assignmentData
    const id = crypto.randomUUID()
    await run(
      `INSERT INTO assignments (id, class_id, title, description, due_date, attachment_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [id, class_id, title, description || null, due_date || null, attachment_url || null]
    )
    return await getRow('SELECT * FROM assignments WHERE id = ?', [id])
  }

  static async update(id, assignmentData) {
    const { title, description, due_date } = assignmentData
    await run(
      `UPDATE assignments
       SET title = ?, description = ?, due_date = ?
       WHERE id = ?`,
      [title, description || null, due_date || null, id]
    )
    return await getRow('SELECT * FROM assignments WHERE id = ?', [id])
  }

  static async delete(id) {
    await run('DELETE FROM assignments WHERE id = ?', [id])
  }

  static async getSubmissions(assignmentId) {
    return await getAll(
      `SELECT s.*, u.name as student_name, u.email as student_email
       FROM submissions s
       JOIN users u ON s.student_id = u.id
       WHERE s.assignment_id = ?
       ORDER BY datetime(s.submitted_at) DESC`,
      [assignmentId]
    )
  }

  static async submit(submissionData) {
    const { assignment_id, student_id, file_url, remarks } = submissionData
    const id = crypto.randomUUID()
    await run(
      `INSERT INTO submissions (id, assignment_id, student_id, file_url, remarks, submitted_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(assignment_id, student_id)
       DO UPDATE SET file_url = excluded.file_url, remarks = excluded.remarks, submitted_at = CURRENT_TIMESTAMP`,
      [id, assignment_id, student_id, file_url || null, remarks || null]
    )
    return await getRow(
      `SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?`,
      [assignment_id, student_id]
    )
  }

  static async grade(submissionId, marks) {
    await run(
      `UPDATE submissions
       SET marks = ?
       WHERE id = ?`,
      [marks, submissionId]
    )
    return await getRow('SELECT * FROM submissions WHERE id = ?', [submissionId])
  }
}

module.exports = Assignment
