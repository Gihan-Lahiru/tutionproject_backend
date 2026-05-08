const express = require('express')
const router = express.Router()
const PaymentController = require('../controllers/paymentController')
const authMiddleware = require('../middleware/auth')
const upload = require('../middleware/upload')

// Webhook for payment gateway (no auth required)
router.post('/verify', PaymentController.verifyPayment)
// Note: PayHere integration has been removed. Using manual receipt-based payments instead.

// All other routes require authentication
router.use(authMiddleware)

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

// Receipt management (students can upload, teachers can approve/reject)
router.post('/:id/receipt', upload.single('receipt'), PaymentController.uploadReceipt)
router.get('/receipts/pending', PaymentController.getPendingReceipts)
router.post('/:id/receipt/approve', PaymentController.approveReceipt)
router.post('/:id/receipt/reject', PaymentController.rejectReceipt)

module.exports = router
