const crypto = require('crypto')
const { db } = require('../config/database')
const { getClassAudienceStudentIds } = require('../utils/classAudience')
const { notifyStudentsByClass } = require('../utils/notificationService')

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

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve({ changes: this.changes, lastID: this.lastID })
    })
  })

const normalizeClass = (row) => {
  if (!row) return row
  return {
    ...row,
    title: row.title || row.name,
  }
}

class ClassController {
  static async getAll(req, res) {
    try {
      const { grade, teacherId } = req.query

      const params = []
      let sql = `
        SELECT
          c.*,
          (
            SELECT u.institute
            FROM users u
            WHERE u.role = 'student'
              AND REPLACE(REPLACE(LOWER(TRIM(u.grade)), 'grade ', ''), 'grade ', '') = REPLACE(REPLACE(LOWER(TRIM(c.grade)), 'grade ', ''), 'grade ', '')
              AND COALESCE(u.institute, '') <> ''
            ORDER BY datetime(u.created_at) DESC
            LIMIT 1
          ) as inferred_location,
          (
            SELECT COUNT(*)
            FROM users u
            WHERE u.role = 'student'
              AND REPLACE(REPLACE(LOWER(TRIM(u.grade)), 'grade ', ''), 'grade ', '') = REPLACE(REPLACE(LOWER(TRIM(c.grade)), 'grade ', ''), 'grade ', '')
              AND (
                COALESCE(c.location, '') = ''
                OR LOWER(TRIM(CASE WHEN INSTR(COALESCE(u.institute, ''), ' - ') > 0 THEN SUBSTR(COALESCE(u.institute, ''), 1, INSTR(COALESCE(u.institute, ''), ' - ') - 1) ELSE COALESCE(u.institute, '') END))
                   = LOWER(TRIM(CASE WHEN INSTR(COALESCE(c.location, ''), ' - ') > 0 THEN SUBSTR(COALESCE(c.location, ''), 1, INSTR(COALESCE(c.location, ''), ' - ') - 1) ELSE COALESCE(c.location, '') END))
              )
          ) as student_count
        FROM classes c
        WHERE 1=1
      `

      if (grade) {
        sql += ' AND c.grade = ?'
        params.push(grade)
      }

      if (req.user.role === 'teacher' || req.user.role === 'admin' || teacherId) {
        const tid = teacherId || req.user.id
        sql += ' AND (c.teacher_id = ? OR c.teacher_id IS NULL)'
        params.push(tid)
      }

      sql += ' ORDER BY datetime(c.created_at) DESC'

      const rows = await getAll(sql, params)
      res.json({ classes: rows.map(normalizeClass) })
    } catch (error) {
      console.error('Get classes error:', error)
      res.status(500).json({ message: 'Failed to fetch classes' })
    }
  }

  static async getById(req, res) {
    try {
      const row = await getRow('SELECT * FROM classes WHERE id = ?', [req.params.id])

      if (!row) {
        return res.status(404).json({ message: 'Class not found' })
      }

      res.json({ class: normalizeClass(row) })
    } catch (error) {
      console.error('Get class error:', error)
      res.status(500).json({ message: 'Failed to fetch class' })
    }
  }

  static async create(req, res) {
    try {
      const { title, grade, description, subject, day, time, fee, location } = req.body

      if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Only teachers can create classes' })
      }

      const safeTitle = (title || '').trim()
      const safeGrade = (grade || '').toString().trim()
      const safeSubject = (subject || 'Science').toString().trim()

      if (!safeTitle || !safeGrade) {
        return res.status(400).json({ message: 'Title and grade are required' })
      }

      const id = crypto.randomUUID()
      const numericFee = fee != null && fee !== '' ? Number(fee) : null

      await run(
        `INSERT INTO classes (id, name, title, grade, subject, day, time, fee, description, teacher_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          id,
          safeTitle,
          safeTitle,
          safeGrade,
          safeSubject,
          day || null,
          time || null,
          Number.isFinite(numericFee) ? numericFee : null,
          description || null,
          req.user.id,
        ]
      )

      if (location != null) {
        await run('UPDATE classes SET location = ? WHERE id = ?', [String(location).trim() || null, id])
      }

      const created = await getRow('SELECT * FROM classes WHERE id = ?', [id])

      res.status(201).json({
        message: 'Class created successfully',
        class: normalizeClass(created),
      })
    } catch (error) {
      console.error('Create class error:', error)
      res.status(500).json({ message: 'Failed to create class' })
    }
  }

  static async update(req, res) {
    try {
      const { title, grade, description, subject, day, time, fee, location } = req.body
      const classId = req.params.id

      const existing = await getRow('SELECT * FROM classes WHERE id = ?', [classId])
      if (!existing) {
        return res.status(404).json({ message: 'Class not found' })
      }

      if (existing.teacher_id && existing.teacher_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Not authorized' })
      }

      const newTitle = typeof title === 'string' ? title.trim() : null
      const newGrade = grade != null ? grade.toString().trim() : null
      const newSubject = typeof subject === 'string' ? subject.trim() : null
      const numericFee = fee != null && fee !== '' ? Number(fee) : null

      await run(
        `UPDATE classes
         SET
           name = COALESCE(?, name),
           title = COALESCE(?, title),
           grade = COALESCE(?, grade),
           subject = COALESCE(?, subject),
           day = COALESCE(?, day),
           time = COALESCE(?, time),
           fee = COALESCE(?, fee),
           description = COALESCE(?, description),
           location = COALESCE(?, location),
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          newTitle,
          newTitle,
          newGrade,
          newSubject,
          day ?? null,
          time ?? null,
          Number.isFinite(numericFee) ? numericFee : null,
          description ?? null,
          location ?? null,
          classId,
        ]
      )

      const updated = await getRow('SELECT * FROM classes WHERE id = ?', [classId])

      res.json({
        message: 'Class updated successfully',
        class: normalizeClass(updated),
      })
    } catch (error) {
      console.error('Update class error:', error)
      res.status(500).json({ message: 'Failed to update class' })
    }
  }

  static async delete(req, res) {
    try {
      const classId = req.params.id
      const existing = await getRow('SELECT * FROM classes WHERE id = ?', [classId])

      if (!existing) {
        return res.status(404).json({ message: 'Class not found' })
      }

      if (existing.teacher_id && existing.teacher_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Not authorized' })
      }

      await run('DELETE FROM classes WHERE id = ?', [classId])
      res.json({ message: 'Class deleted successfully' })
    } catch (error) {
      console.error('Delete class error:', error)
      res.status(500).json({ message: 'Failed to delete class' })
    }
  }

  static async enroll(req, res) {
    try {
      if (req.user.role !== 'student') {
        return res.status(403).json({ message: 'Only students can enroll' })
      }

      const classId = req.params.id
      const exists = await getRow('SELECT id FROM classes WHERE id = ?', [classId])
      if (!exists) {
        return res.status(404).json({ message: 'Class not found' })
      }

      res.json({ message: 'Enrollment is not enabled in this deployment.' })
    } catch (error) {
      console.error('Enroll error:', error)
      res.status(500).json({ message: 'Failed to enroll' })
    }
  }

  static async getStudents(req, res) {
    try {
      const classRow = await getRow('SELECT id FROM classes WHERE id = ?', [req.params.id])
      if (!classRow) {
        return res.status(404).json({ message: 'Class not found' })
      }

      const { studentIds } = await getClassAudienceStudentIds(req.params.id)
      if (!studentIds.length) {
        return res.json({ students: [] })
      }

      const placeholders = studentIds.map(() => '?').join(', ')
      const students = await getAll(
        `SELECT id, name, email, grade, institute, profile_picture, created_at
         FROM users
         WHERE role = 'student'
           AND id IN (${placeholders})
         ORDER BY datetime(created_at) DESC`,
        studentIds
      )

      res.json({ students })
    } catch (error) {
      console.error('Get students error:', error)
      res.status(500).json({ message: 'Failed to fetch students' })
    }
  }

  static async getAnnouncements(req, res) {
    try {
      const classRow = await getRow('SELECT id FROM classes WHERE id = ?', [req.params.id])
      if (!classRow) {
        return res.status(404).json({ message: 'Class not found' })
      }

      const announcements = await getAll(
        `SELECT id,
                COALESCE(message, content, '') as message,
                created_by,
                created_at,
                class_id
         FROM announcements
         WHERE class_id = ?
         ORDER BY datetime(created_at) DESC`,
        [req.params.id]
      )
      res.json({ announcements })
    } catch (error) {
      console.error('Get announcements error:', error)
      res.status(500).json({ message: 'Failed to fetch announcements' })
    }
  }

  static async createAnnouncement(req, res) {
    try {
      const { message } = req.body
      const classId = req.params.id
      const id = crypto.randomUUID()

      const classData = await getRow('SELECT id, teacher_id FROM classes WHERE id = ?', [classId])
      if (!classData) {
        return res.status(404).json({ message: 'Class not found' })
      }

      if (classData.teacher_id && classData.teacher_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Not authorized' })
      }

      const announcementMessage = String(message || '').trim()
      if (!announcementMessage) {
        return res.status(400).json({ message: 'Announcement message is required' })
      }

      await run(
        `INSERT INTO announcements (id, class_id, title, content, message, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [id, classId, 'Announcement', announcementMessage, announcementMessage, req.user.id]
      )

      const announcement = await getRow(
        `SELECT id,
                COALESCE(message, content, '') as message,
                created_by,
                created_at,
                class_id
         FROM announcements
         WHERE id = ?`,
        [id]
      )

      try {
        await notifyStudentsByClass({
          classId,
          type: 'announcement',
          message: `New Announcement: ${announcementMessage}`,
        })
      } catch (notifyErr) {
        console.error('Announcement notification error:', notifyErr)
      }

      res.status(201).json({
        message: 'Announcement posted successfully',
        announcement,
      })
    } catch (error) {
      console.error('Create announcement error:', error)
      res.status(500).json({ message: 'Failed to create announcement' })
    }
  }

  static async getMyClasses(req, res) {
    try {
      if (req.user.role === 'student') {
        const me = await getRow('SELECT grade FROM users WHERE id = ?', [req.user.id])
        const myGrade = me?.grade
        const rows = await getAll(
          `SELECT c.*, 
           (
             SELECT u.institute
             FROM users u
             WHERE u.role = 'student'
               AND REPLACE(REPLACE(LOWER(TRIM(u.grade)), 'grade ', ''), 'grade ', '') = REPLACE(REPLACE(LOWER(TRIM(c.grade)), 'grade ', ''), 'grade ', '')
               AND COALESCE(u.institute, '') <> ''
             ORDER BY datetime(u.created_at) DESC
             LIMIT 1
           ) as inferred_location,
           (
             SELECT COUNT(*)
             FROM users u
             WHERE u.role = 'student'
               AND REPLACE(REPLACE(LOWER(TRIM(u.grade)), 'grade ', ''), 'grade ', '') = REPLACE(REPLACE(LOWER(TRIM(c.grade)), 'grade ', ''), 'grade ', '')
               AND (
                 COALESCE(c.location, '') = '' OR
                 LOWER(TRIM(CASE WHEN INSTR(COALESCE(u.institute, ''), ' - ') > 0 THEN SUBSTR(COALESCE(u.institute, ''), 1, INSTR(COALESCE(u.institute, ''), ' - ') - 1) ELSE COALESCE(u.institute, '') END))
                 = LOWER(TRIM(CASE WHEN INSTR(COALESCE(c.location, ''), ' - ') > 0 THEN SUBSTR(COALESCE(c.location, ''), 1, INSTR(COALESCE(c.location, ''), ' - ') - 1) ELSE COALESCE(c.location, '') END))
               )
           ) as student_count
           FROM classes c
           WHERE (? IS NULL OR c.grade = ?)
           ORDER BY datetime(c.created_at) DESC`,
          [myGrade || null, myGrade || null]
        )
        return res.json({ classes: rows.map(normalizeClass) })
      }

      const rows = await getAll(
        `SELECT c.*, 
         (
           SELECT u.institute
           FROM users u
           WHERE u.role = 'student'
             AND REPLACE(REPLACE(LOWER(TRIM(u.grade)), 'grade ', ''), 'grade ', '') = REPLACE(REPLACE(LOWER(TRIM(c.grade)), 'grade ', ''), 'grade ', '')
             AND COALESCE(u.institute, '') <> ''
           ORDER BY datetime(u.created_at) DESC
           LIMIT 1
         ) as inferred_location,
         (
           SELECT COUNT(*)
           FROM users u
           WHERE u.role = 'student'
             AND REPLACE(REPLACE(LOWER(TRIM(u.grade)), 'grade ', ''), 'grade ', '') = REPLACE(REPLACE(LOWER(TRIM(c.grade)), 'grade ', ''), 'grade ', '')
             AND (
               COALESCE(c.location, '') = '' OR
               LOWER(TRIM(CASE WHEN INSTR(COALESCE(u.institute, ''), ' - ') > 0 THEN SUBSTR(COALESCE(u.institute, ''), 1, INSTR(COALESCE(u.institute, ''), ' - ') - 1) ELSE COALESCE(u.institute, '') END))
               = LOWER(TRIM(CASE WHEN INSTR(COALESCE(c.location, ''), ' - ') > 0 THEN SUBSTR(COALESCE(c.location, ''), 1, INSTR(COALESCE(c.location, ''), ' - ') - 1) ELSE COALESCE(c.location, '') END))
             )
         ) as student_count
         FROM classes c
         WHERE (c.teacher_id = ? OR c.teacher_id IS NULL)
         ORDER BY datetime(c.created_at) DESC`,
        [req.user.id]
      )

      res.json({ classes: rows.map(normalizeClass) })
    } catch (error) {
      console.error('Get my classes error:', error)
      res.status(500).json({ message: 'Failed to fetch classes' })
    }
  }
}

module.exports = ClassController
