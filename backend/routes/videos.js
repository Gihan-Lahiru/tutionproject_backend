const express = require('express')
const router = express.Router()
const authMiddleware = require('../middleware/auth')
const roleMiddleware = require('../middleware/role')
const crypto = require('crypto')
const multer = require('multer')
const { db } = require('../config/database')
const { cloudinary } = require('../middleware/cloudinaryUpload')
const { notifyStudentsByGrade, notifyStudentsByClass } = require('../utils/notificationService')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
})

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

// All routes require authentication
router.use(authMiddleware)

// Get all videos
router.get('/', async (req, res) => {
  try {
    const params = []
    let sql = `SELECT * FROM videos WHERE 1=1`

    if (req.user.role === 'teacher' || req.user.role === 'admin') {
      sql += ' AND (uploaded_by = ? OR uploaded_by IS NULL)'
      params.push(req.user.id)
    } else if (req.user.role === 'student') {
      const me = await getRow('SELECT grade FROM users WHERE id = ?', [req.user.id])
      const rawGrade = (me?.grade ?? '').toString().trim()
      const gradeDigits = rawGrade.match(/\d+/)?.[0]

      const gradeVariants = []
      const addVariant = (val) => {
        const v = (val ?? '').toString().trim()
        if (!v) return
        if (!gradeVariants.includes(v)) gradeVariants.push(v)
      }

      addVariant(rawGrade)
      if (gradeDigits) {
        addVariant(gradeDigits)
        addVariant(`Grade ${gradeDigits}`)
      }

      if (gradeVariants.length > 0) {
        sql += ` AND (grade IN (${gradeVariants.map(() => '?').join(', ')}) OR grade IS NULL)`
        params.push(...gradeVariants)
      }
    }

    sql += ' ORDER BY datetime(created_at) DESC'

    const rows = await getAll(sql, params)
    const videos = rows.map((v) => ({
      ...v,
      url: v.video_url,
    }))

    res.json(videos)
  } catch (error) {
    console.error('Get all videos error:', error)
    res.status(500).json({ message: 'Failed to fetch videos' })
  }
})

// Get videos by class
router.get('/class/:classId', async (req, res) => {
  try {
    const rows = await getAll(
      `SELECT * FROM videos WHERE class_id = ? ORDER BY datetime(created_at) DESC`,
      [req.params.classId]
    )
    res.json(rows.map((v) => ({ ...v, url: v.video_url })))
  } catch (error) {
    console.error('Get videos by class error:', error)
    res.status(500).json({ message: 'Failed to fetch videos' })
  }
})

// Create video (teachers only) - without classId
router.post('/', roleMiddleware('teacher', 'admin'), upload.fields([{ name: 'thumbnail', maxCount: 1 }]), async (req, res) => {
  try {
    const { title, url, grade, subject, description } = req.body
    const thumbnail = req.files?.thumbnail?.[0] || null
    
    if (!title || !url || !grade) {
      return res.status(400).json({ message: 'Title, URL, and grade are required' })
    }

    let thumbnailResult = null
    if (thumbnail) {
      if (!String(thumbnail.mimetype || '').startsWith('image/')) {
        return res.status(400).json({ message: 'Thumbnail must be an image file' })
      }

      thumbnailResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'tuition-app/video-thumbnails',
            transformation: { width: 640, height: 360, crop: 'fill' },
          },
          (error, result) => {
            if (error) reject(error)
            else resolve(result)
          }
        )
        stream.end(thumbnail.buffer)
      })
    }

    const id = crypto.randomUUID()
    await run(
      `INSERT INTO videos (id, title, description, video_url, grade, subject, thumbnail_url, thumbnail_public_id, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        id,
        title.toString().trim(),
        description || null,
        url.toString().trim(),
        grade.toString().trim(),
        (subject || 'Science').toString().trim(),
        thumbnailResult ? thumbnailResult.secure_url : null,
        thumbnailResult ? thumbnailResult.public_id : null,
        req.user.id,
      ]
    )

    const created = await getRow('SELECT * FROM videos WHERE id = ?', [id])

    try {
      await notifyStudentsByGrade({
        grade,
        type: 'video',
        message: `New Video: ${title.toString().trim()}`,
      })
    } catch (notifyErr) {
      console.error('Failed to create video notifications:', notifyErr)
    }

    res.status(201).json({ ...created, url: created.video_url })
  } catch (error) {
    console.error('Create video error:', error)
    res.status(500).json({ message: 'Failed to create video' })
  }
})

// Increment video view count (placeholder - views column doesn't exist yet)
router.post('/:id/view', async (req, res) => {
  try {
    // TODO: Add views column to videos table and implement view tracking
    res.json({ message: 'View counted' })
  } catch (error) {
    console.error('Video view error:', error)
    res.status(500).json({ message: 'Failed to count view' })
  }
})

// Create video (teachers only) - for a specific class
router.post('/class/:classId', roleMiddleware('teacher', 'admin'), upload.fields([{ name: 'thumbnail', maxCount: 1 }]), async (req, res) => {
  try {
    const { title, url, description } = req.body
    const thumbnail = req.files?.thumbnail?.[0] || null
    if (!title || !url) {
      return res.status(400).json({ message: 'Title and URL are required' })
    }

    const classRow = await getRow('SELECT id, grade, subject, teacher_id FROM classes WHERE id = ?', [
      req.params.classId,
    ])
    if (!classRow) {
      return res.status(404).json({ message: 'Class not found' })
    }
    if (classRow.teacher_id && classRow.teacher_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' })
    }

    let thumbnailResult = null
    if (thumbnail) {
      if (!String(thumbnail.mimetype || '').startsWith('image/')) {
        return res.status(400).json({ message: 'Thumbnail must be an image file' })
      }

      thumbnailResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'tuition-app/video-thumbnails',
            transformation: { width: 640, height: 360, crop: 'fill' },
          },
          (error, result) => {
            if (error) reject(error)
            else resolve(result)
          }
        )
        stream.end(thumbnail.buffer)
      })
    }

    const id = crypto.randomUUID()
    await run(
      `INSERT INTO videos (id, class_id, title, description, video_url, grade, subject, thumbnail_url, thumbnail_public_id, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        id,
        req.params.classId,
        title.toString().trim(),
        description || null,
        url.toString().trim(),
        classRow.grade || null,
        classRow.subject || 'Science',
        thumbnailResult ? thumbnailResult.secure_url : null,
        thumbnailResult ? thumbnailResult.public_id : null,
        req.user.id,
      ]
    )

    const created = await getRow('SELECT * FROM videos WHERE id = ?', [id])

    try {
      await notifyStudentsByClass({
        classId: req.params.classId,
        type: 'video',
        message: `New Video: ${title.toString().trim()}`,
      })
    } catch (notifyErr) {
      console.error('Failed to create class video notifications:', notifyErr)
    }

    res.status(201).json({ ...created, url: created.video_url })
  } catch (error) {
    console.error('Create class video error:', error)
    res.status(500).json({ message: 'Failed to create video' })
  }
})

// Delete video (teachers only)
router.delete('/:id', roleMiddleware('teacher', 'admin'), async (req, res) => {
  try {
    const existing = await getRow('SELECT * FROM videos WHERE id = ?', [req.params.id])
    if (!existing) {
      return res.status(404).json({ message: 'Video not found' })
    }

    if (existing.uploaded_by && existing.uploaded_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' })
    }

    await run('DELETE FROM videos WHERE id = ?', [req.params.id])
    res.json({ message: 'Video deleted successfully' })
  } catch (error) {
    console.error('Delete video error:', error)
    res.status(500).json({ message: 'Failed to delete video' })
  }
})

module.exports = router
