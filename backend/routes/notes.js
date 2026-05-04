const express = require('express')
const router = express.Router()
const NoteController = require('../controllers/noteController')
const authMiddleware = require('../middleware/auth')
const roleMiddleware = require('../middleware/role')

// All routes require authentication
router.use(authMiddleware)

// Download note with watermark (students)
router.get('/:id/download', roleMiddleware('student'), NoteController.downloadWithWatermark)

// Get notes by class
router.get('/class/:classId', NoteController.getByClass)

// Create note (teachers only)
router.post('/class/:classId', roleMiddleware('teacher', 'admin'), NoteController.create)

// Delete note (teachers only)
router.delete('/:id', roleMiddleware('teacher', 'admin'), NoteController.delete)

module.exports = router
