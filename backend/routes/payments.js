const express = require('express')
const router = express.Router()
const PaymentController = require('../controllers/paymentController')
const PayHereController = require('../controllers/payhereController')
const authMiddleware = require('../middleware/auth')

// Webhook for payment gateway (no auth required)
router.post('/verify', PaymentController.verifyPayment)
router.post('/payhere/notify', PayHereController.handleNotify)
// PayHere browser redirects (no auth required)
router.get('/payhere/return', PayHereController.handleReturn)
router.get('/payhere/cancel', PayHereController.handleCancel)

// All other routes require authentication
router.use(authMiddleware)

// PayHere integration
router.post('/payhere/initiate', PayHereController.initiatePayment)
router.post('/payhere/confirm', PayHereController.confirmPayment)
router.get('/payhere/status/:orderId', PayHereController.getPaymentStatus)

// Get current user's payments (for students)
router.get('/my-payments', PaymentController.getMyPayments)
router.post('/request-reactivation', PaymentController.requestReactivation)

// Get user payments
router.get('/user/:userId?', PaymentController.getUserPayments)

// Initialize payment
router.post('/init', PaymentController.initPayment)

// Get payment stats
router.get('/stats', PaymentController.getStats)

// Teacher/admin: list all payments
router.get('/all', PaymentController.getAllPayments)
router.post('/remind', PaymentController.sendReminder)

module.exports = router
