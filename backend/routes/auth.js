const express = require('express')
const router = express.Router()
const AuthController = require('../controllers/authController')
const authMiddleware = require('../middleware/auth')

// Public routes
router.post('/send-verification', AuthController.sendEmailVerification)
router.post('/verify-code', AuthController.verifyEmailCode)
router.post('/register', AuthController.register)
router.post('/login', AuthController.login)
router.post('/forgot-password', AuthController.forgotPassword)
router.post('/reset-password', AuthController.resetPassword)

// Protected routes
router.get('/me', authMiddleware, AuthController.getCurrentUser)
router.post('/change-password', authMiddleware, AuthController.changePassword)

module.exports = router
