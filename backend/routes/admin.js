// Admin Routes - Database management via API
const express = require('express')
const router = express.Router()
const auth = require('../middleware/auth')
const {
  getAllUsers,
  getUserById,
  updateUserStatus,
  updateUserRole,
  getAllPayments,
  getPendingReceipts,
  updatePaymentApproval,
  resetPayment,
  getAllClasses,
  updateClassFee,
  getDashboardStats,
  exportData,
} = require('../controllers/adminController')

// ⚠️ Middleware: Verify admin access
const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'teacher') {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}

// ==================== USERS ====================
router.get('/users', auth, adminOnly, getAllUsers)
router.get('/users/:id', auth, adminOnly, getUserById)
router.patch('/users/:id/status', auth, adminOnly, updateUserStatus)
router.patch('/users/:id/role', auth, adminOnly, updateUserRole)

// ==================== PAYMENTS ====================
router.get('/payments', auth, adminOnly, getAllPayments)
router.get('/payments/receipts/pending', auth, adminOnly, getPendingReceipts)
router.patch('/payments/:id/approval', auth, adminOnly, updatePaymentApproval)
router.post('/payments/:id/reset', auth, adminOnly, resetPayment)

// ==================== CLASSES ====================
router.get('/classes', auth, adminOnly, getAllClasses)
router.patch('/classes/:id/fee', auth, adminOnly, updateClassFee)

// ==================== STATISTICS & EXPORT ====================
router.get('/stats', auth, adminOnly, getDashboardStats)
router.get('/export', auth, adminOnly, exportData)

module.exports = router
