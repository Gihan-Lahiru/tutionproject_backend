const express = require('express')
const router = express.Router()
const db = require('../config/database')
const authMiddleware = require('../middleware/auth')
const { getClassAudienceStudentIds } = require('../utils/classAudience')

// Get teacher dashboard statistics
router.get('/teacher-stats', authMiddleware, async (req, res) => {
  try {
    const teacherId = req.user.id

    const now = new Date()
    const ym = (d) => {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      return `${y}-${m}`
    }
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)

    const thisMonthKey = ym(startOfThisMonth)
    const lastMonthKey = ym(startOfLastMonth)

    const pctChange = (current, previous) => {
      const c = Number(current) || 0
      const p = Number(previous) || 0
      if (p === 0) {
        if (c === 0) return { value: 0, isPositive: true }
        return { value: 100, isPositive: true }
      }
      const raw = ((c - p) / p) * 100
      return { value: Math.round(Math.abs(raw)), isPositive: raw >= 0 }
    }
    
    // Scope classes to teacher-owned classes first, then legacy NULL-teacher classes only if needed.
    const ownedClasses = await db.query(
      `SELECT id, grade FROM classes WHERE teacher_id = ?`,
      [teacherId]
    )

    let scopedClasses = ownedClasses.rows || []
    let classScopeWhere = 'teacher_id = ?'
    let classScopeParams = [teacherId]

    if (scopedClasses.length === 0) {
      const legacyClasses = await db.query(
        `SELECT id, grade FROM classes WHERE teacher_id IS NULL`,
        []
      )
      scopedClasses = legacyClasses.rows || []
      classScopeWhere = 'teacher_id IS NULL'
      classScopeParams = []
    }

    const buildInClause = (items) => items.map(() => '?').join(',')

    const teacherGrades = Array.from(new Set((scopedClasses || []).map((c) => c.grade).filter(Boolean)))
    const totalClasses = scopedClasses.length

    // Real student count: unique students that belong to class audience of teacher's scoped classes.
    let teacherStudentIds = []
    if (scopedClasses.length > 0) {
      const audienceResults = await Promise.all(
        scopedClasses.map((c) => getClassAudienceStudentIds(c.id))
      )
      teacherStudentIds = Array.from(
        new Set(
          audienceResults
            .flatMap((r) => r.studentIds || [])
            .filter(Boolean)
        )
      )
    }

    const totalStudents = teacherStudentIds.length
    
    // Get total videos count (teacher-owned; allow legacy NULL uploaded_by rows)
    const videosResult = await db.query(
      'SELECT COUNT(*) as count FROM videos WHERE uploaded_by = ? OR uploaded_by IS NULL',
      [teacherId]
    )
    const totalVideos = videosResult.rows[0]?.count || 0
    
    // Get total papers count
    const papersResult = await db.query(
      'SELECT COUNT(*) as count FROM papers WHERE uploaded_by = ? OR uploaded_by IS NULL',
      [teacherId]
    )
    const totalPapers = papersResult.rows[0]?.count || 0

    // Monthly revenue (completed payments for current month)
    // Some older payment rows don't have class_id; fall back to attributing by student grade.
    const revenueParams = ['completed', thisMonthKey, teacherId]
    const revenueGradeFilter = teacherGrades.length > 0
      ? ` OR (p.class_id IS NULL AND u.grade IN (${buildInClause(teacherGrades)}))`
      : ''
    if (teacherGrades.length > 0) revenueParams.push(...teacherGrades)

    const revenueResult = await db.query(
      `SELECT COALESCE(SUM(p.amount), 0) as total
       FROM payments p
       LEFT JOIN classes c ON c.id = p.class_id
       LEFT JOIN users u ON u.id = COALESCE(p.student_id, p.user_id, p.payer_id)
       WHERE p.status = ?
         AND strftime('%Y-%m', COALESCE(p.payment_date, p.date)) = ?
         AND (
           (p.class_id IS NOT NULL AND (c.teacher_id = ? OR c.teacher_id IS NULL))
           ${revenueGradeFilter}
         )`,
      revenueParams
    )
    const monthlyRevenue = parseFloat(revenueResult.rows[0]?.total || 0)

    // Trends (vs last month)
    let studentsThisMonth = 0
    let studentsLastMonth = 0
    if (teacherStudentIds.length > 0) {
      studentsThisMonth = (await db.query(
        `SELECT COUNT(*) as count
         FROM users
         WHERE id IN (${buildInClause(teacherStudentIds)})
           AND strftime('%Y-%m', created_at) = ?`,
        [...teacherStudentIds, thisMonthKey]
      )).rows[0]?.count || 0

      studentsLastMonth = (await db.query(
        `SELECT COUNT(*) as count
         FROM users
         WHERE id IN (${buildInClause(teacherStudentIds)})
           AND strftime('%Y-%m', created_at) = ?`,
        [...teacherStudentIds, lastMonthKey]
      )).rows[0]?.count || 0
    }

    const classesThisMonth = (await db.query(
      `SELECT COUNT(*) as count FROM classes
       WHERE ${classScopeWhere}
         AND strftime('%Y-%m', created_at) = ?`,
      [...classScopeParams, thisMonthKey]
    )).rows[0]?.count || 0
    const classesLastMonth = (await db.query(
      `SELECT COUNT(*) as count FROM classes
       WHERE ${classScopeWhere}
         AND strftime('%Y-%m', created_at) = ?`,
      [...classScopeParams, lastMonthKey]
    )).rows[0]?.count || 0

    const revenueLastMonthParams = ['completed', lastMonthKey, teacherId]
    const revenueLastMonthGradeFilter = teacherGrades.length > 0
      ? ` OR (p.class_id IS NULL AND u.grade IN (${buildInClause(teacherGrades)}))`
      : ''
    if (teacherGrades.length > 0) revenueLastMonthParams.push(...teacherGrades)

    const revenueLastMonthResult = await db.query(
      `SELECT COALESCE(SUM(p.amount), 0) as total
       FROM payments p
       LEFT JOIN classes c ON c.id = p.class_id
       LEFT JOIN users u ON u.id = COALESCE(p.student_id, p.user_id, p.payer_id)
       WHERE p.status = ?
         AND strftime('%Y-%m', COALESCE(p.payment_date, p.date)) = ?
         AND (
           (p.class_id IS NOT NULL AND (c.teacher_id = ? OR c.teacher_id IS NULL))
           ${revenueLastMonthGradeFilter}
         )`,
      revenueLastMonthParams
    )
    const revenueLastMonth = parseFloat(revenueLastMonthResult.rows[0]?.total || 0)
    
    res.json({
      totalStudents,
      totalClasses,
      totalVideos,
      totalPapers,
      monthlyRevenue,
      trends: {
        students: pctChange(studentsThisMonth, studentsLastMonth),
        classes: pctChange(classesThisMonth, classesLastMonth),
        revenue: pctChange(monthlyRevenue, revenueLastMonth),
      },
    })
  } catch (error) {
    console.error('Error fetching teacher stats:', error)
    res.status(500).json({ error: 'Failed to fetch statistics' })
  }
})

// Get recent activity for teacher
router.get('/teacher-activity', authMiddleware, async (req, res) => {
  try {
    const teacherId = req.user.id
    const activities = []

    const teacherGradeRows = await db.query(
      "SELECT DISTINCT grade FROM classes WHERE (teacher_id = ? OR teacher_id IS NULL) AND grade IS NOT NULL AND TRIM(grade) <> ''",
      [teacherId]
    )
    const teacherGrades = (teacherGradeRows.rows || []).map((r) => r.grade).filter(Boolean)
    const buildInClause = (items) => items.map(() => '?').join(',')

    // Get recent papers uploaded (fallback for legacy schema without class_id)
    let papers
    try {
      papers = await db.query(
        `SELECT id, title, type, grade, class_id, uploaded_at
         FROM papers
         ORDER BY datetime(uploaded_at) DESC
         LIMIT 3`,
        []
      )
    } catch (paperErr) {
      if (!String(paperErr?.message || '').includes('no such column: class_id')) {
        throw paperErr
      }
      papers = await db.query(
        `SELECT id, title, type, grade, uploaded_at
         FROM papers
         ORDER BY datetime(uploaded_at) DESC
         LIMIT 3`,
        []
      )
    }

    papers.rows.forEach((paper) => {
      activities.push({
        id: `paper_${paper.id}`,
        type: 'paper',
        title: (paper.type || '').toLowerCase() === 'note' ? 'Notes uploaded' : 'Paper uploaded',
        description: `${paper.title} - Grade ${paper.grade}`,
        class_id: paper.class_id || null,
        created_at: paper.uploaded_at,
      })
    })

    // Get recent students enrolled
    const students = teacherGrades.length > 0
      ? await db.query(
          `SELECT id, name, grade, created_at
           FROM users
           WHERE role = ?
             AND grade IN (${buildInClause(teacherGrades)})
           ORDER BY datetime(created_at) DESC
           LIMIT 3`,
          ['student', ...teacherGrades]
        )
      : await db.query(
          `SELECT id, name, grade, created_at
           FROM users
           WHERE role = ?
           ORDER BY datetime(created_at) DESC
           LIMIT 3`,
          ['student']
        )

    students.rows.forEach((student) => {
      activities.push({
        id: `student_${student.id}`,
        type: 'student',
        title: 'New student enrolled',
        description: `${student.name} - Grade ${student.grade || 'N/A'}`,
        created_at: student.created_at,
      })
    })

    // Get recent videos uploaded
    const videos = await db.query(
      `SELECT id, title, grade, class_id, created_at
       FROM videos
       ORDER BY datetime(created_at) DESC
       LIMIT 3`,
      []
    )

    videos.rows.forEach((video) => {
      activities.push({
        id: `video_${video.id}`,
        type: 'video',
        title: 'Video lesson uploaded',
        description: `${video.title} - Grade ${video.grade}`,
        class_id: video.class_id || null,
        created_at: video.created_at,
      })
    })

    // Get recent announcements
    const announcements = await db.query(
      `SELECT a.id,
              COALESCE(a.message, a.content) AS message,
              a.created_at,
              COALESCE(c.title, c.name) AS class_title,
              a.class_id
       FROM announcements a
       LEFT JOIN classes c ON c.id = a.class_id
       WHERE (
           (a.class_id IS NOT NULL AND (c.teacher_id = ? OR c.teacher_id IS NULL))
           OR (a.class_id IS NULL AND a.created_by = ?)
         )
       ORDER BY datetime(a.created_at) DESC
       LIMIT 3`,
      [teacherId, teacherId]
    )

    announcements.rows.forEach((announcement) => {
      const rawMessage = String(announcement.message || '').trim()
      const shortMessage = rawMessage.length > 90 ? `${rawMessage.slice(0, 90)}...` : rawMessage
      activities.push({
        id: `announcement_${announcement.id}`,
        type: 'announcement',
        title: 'Announcement posted',
        class_id: announcement.class_id || null,
        description: announcement.class_title
          ? `${announcement.class_title} - ${shortMessage || 'New announcement'}`
          : shortMessage || 'New announcement',
        created_at: announcement.created_at,
      })
    })

    // Get recent payments received
    const paymentParams = ['completed', teacherId]
    const paymentGradeFilter = teacherGrades.length > 0
      ? ` OR (p.class_id IS NULL AND u.grade IN (${buildInClause(teacherGrades)}))`
      : ''
    if (teacherGrades.length > 0) paymentParams.push(...teacherGrades)

    const payments = await db.query(
      `SELECT p.id, p.amount, u.name as payer_name, COALESCE(p.payment_date, p.date) as paid_at
       FROM payments p
       LEFT JOIN classes c ON c.id = p.class_id
       LEFT JOIN users u ON u.id = COALESCE(p.student_id, p.user_id, p.payer_id)
       WHERE p.status = ?
         AND (
           (p.class_id IS NOT NULL AND (c.teacher_id = ? OR c.teacher_id IS NULL))
           ${paymentGradeFilter}
         )
       ORDER BY datetime(COALESCE(p.payment_date, p.date)) DESC
       LIMIT 3`,
      paymentParams
    )

    payments.rows.forEach((payment) => {
      activities.push({
        id: `payment_${payment.id}`,
        type: 'fee',
        title: 'Fee payment received',
        description: `${payment.payer_name || 'Student'} - Rs ${payment.amount}`,
        created_at: payment.paid_at,
      })
    })

    activities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    res.json({ activities: activities.slice(0, 10) })
  } catch (error) {
    console.error('Error fetching teacher activity:', error)
    res.status(500).json({ error: 'Failed to fetch activity' })
  }
})

// Get today's classes
router.get('/today-classes', authMiddleware, async (req, res) => {
  try {
    const teacherId = req.user.id

    // Get all classes (since we don't have schedule data, return all classes)
    const classes = await db.query(
      `SELECT
         c.id,
         COALESCE(c.title, c.name) as title,
         c.description,
         c.grade,
         c.subject,
         COUNT(DISTINCT u.id) as student_count
       FROM classes c
       LEFT JOIN users u ON u.grade = c.grade AND u.role = 'student'
       WHERE (c.teacher_id = ? OR c.teacher_id IS NULL)
       GROUP BY c.id, c.name, c.title, c.description, c.grade, c.subject
       ORDER BY (c.teacher_id = ?) DESC, datetime(c.created_at) DESC
       LIMIT 2`,
      [teacherId, teacherId]
    )

    res.json({ classes: classes.rows })
  } catch (error) {
    console.error('Error fetching today classes:', error)
    res.status(500).json({ error: 'Failed to fetch classes' })
  }
})

module.exports = router

