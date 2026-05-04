const express = require('express')
const router = express.Router()
const ClassController = require('../controllers/classController')
const authMiddleware = require('../middleware/auth')
const roleMiddleware = require('../middleware/role')

// All routes require authentication
router.use(authMiddleware)

// Get my classes (enrolled or teaching)
router.get('/my-classes', ClassController.getMyClasses)

// Get all classes
router.get('/', ClassController.getAll)

// Get single class
router.get('/:id', ClassController.getById)

// Create class (teachers only)
router.post('/', roleMiddleware('teacher', 'admin'), ClassController.create)

// Update class (teachers only)
router.put('/:id', roleMiddleware('teacher', 'admin'), ClassController.update)

// Delete class (teachers only)
router.delete('/:id', roleMiddleware('teacher', 'admin'), ClassController.delete)

// Enroll in class (students only)
router.post('/:id/enroll', roleMiddleware('student'), ClassController.enroll)

// Get students in class
router.get('/:id/students', ClassController.getStudents)

// Announcements
router.get('/:id/announcements', ClassController.getAnnouncements)
router.post('/:id/announcements', roleMiddleware('teacher', 'admin'), ClassController.createAnnouncement)

module.exports = router
