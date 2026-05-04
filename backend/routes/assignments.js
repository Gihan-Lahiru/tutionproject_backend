const express = require('express')
const router = express.Router()
const AssignmentController = require('../controllers/assignmentController')
const authMiddleware = require('../middleware/auth')
const roleMiddleware = require('../middleware/role')

// All routes require authentication
router.use(authMiddleware)

// Get all assignments for logged-in student
router.get('/my-assignments', roleMiddleware('student'), AssignmentController.getMyAssignments)

// Get assignments by class
router.get('/class/:classId', AssignmentController.getByClass)

// Get single assignment
router.get('/:id', AssignmentController.getById)

// Download assignment attachment with watermark (students)
router.get('/:id/download', roleMiddleware('student'), AssignmentController.downloadWithWatermark)

// Create assignment (teachers only)
router.post('/class/:classId', roleMiddleware('teacher', 'admin'), AssignmentController.create)

// Update assignment (teachers only)
router.put('/:id', roleMiddleware('teacher', 'admin'), AssignmentController.update)

// Delete assignment (teachers only)
router.delete('/:id', roleMiddleware('teacher', 'admin'), AssignmentController.delete)

// Get submissions for assignment (teachers only)
router.get('/:id/submissions', roleMiddleware('teacher', 'admin'), AssignmentController.getSubmissions)

// Submit assignment (students only)
router.post('/:id/submit', roleMiddleware('student'), AssignmentController.submit)

// Grade submission (teachers only)
router.post('/:id/grade', roleMiddleware('teacher', 'admin'), AssignmentController.grade)

module.exports = router
