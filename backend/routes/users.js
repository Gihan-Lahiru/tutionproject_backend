const express = require('express')
const router = express.Router()
const UserController = require('../controllers/userController')
const authMiddleware = require('../middleware/auth')
const roleMiddleware = require('../middleware/role')
const { uploadProfilePicture } = require('../middleware/cloudinaryUpload')

// All routes require authentication
router.use(authMiddleware)

// Get current user profile
router.get('/profile', UserController.getProfile)

// Update profile
router.put('/profile', UserController.updateProfile)

// Upload profile picture
router.post('/profile-picture', uploadProfilePicture.single('profilePicture'), UserController.uploadProfilePicture)

// Get all students (teacher/admin)
router.get('/students', roleMiddleware('teacher', 'admin'), UserController.getStudents)
router.get('/students/:id', roleMiddleware('teacher', 'admin'), UserController.getStudentById)
router.post('/students', roleMiddleware('teacher', 'admin'), UserController.createStudent)
router.put('/students/:id', roleMiddleware('teacher', 'admin'), UserController.updateStudent)
router.delete('/students/:id', roleMiddleware('teacher', 'admin'), UserController.deleteStudent)

// Get all users (admin only)
router.get('/', roleMiddleware('admin'), UserController.getAllUsers)

module.exports = router
