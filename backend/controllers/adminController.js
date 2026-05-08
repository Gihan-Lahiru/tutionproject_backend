// Admin API Controller - Manage database via API
const { db } = require('../config/database')

// ==================== USERS ====================

// Get all users
const getAllUsers = async (req, res) => {
  try {
    const users = await db.all(`SELECT id, name, email, role, grade, status, created_at FROM users ORDER BY created_at DESC`)
    res.json({ success: true, count: users.length, users })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// Get user by ID
const getUserById = async (req, res) => {
  try {
    const { id } = req.params
    const user = await db.all(`SELECT * FROM users WHERE id = ? LIMIT 1`, [id])
    res.json({ success: true, user: user[0] || null })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// Update user status
const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    if (!['active', 'inactive', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }

    await db.run(`UPDATE users SET status = ? WHERE id = ?`, [status, id])
    res.json({ success: true, message: `User ${id} status updated to ${status}` })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// Update user role
const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params
    const { role } = req.body

    if (!['student', 'teacher', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' })
    }

    await db.run(`UPDATE users SET role = ? WHERE id = ?`, [role, id])
    res.json({ success: true, message: `User ${id} role updated to ${role}` })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ==================== PAYMENTS ====================

// Get all payments
const getAllPayments = async (req, res) => {
  try {
    const payments = await db.all(`
      SELECT p.*, u.name as payer_name
      FROM payments p
      LEFT JOIN users u ON p.payer_id = u.id
      ORDER BY p.created_at DESC
      LIMIT 100
    `)
    res.json({ success: true, count: payments.length, payments })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// Get pending receipts
const getPendingReceipts = async (req, res) => {
  try {
    const receipts = await db.all(`
      SELECT p.*, u.name as payer_name, u.email
      FROM payments p
      LEFT JOIN users u ON p.payer_id = u.id
      WHERE p.receipt_url IS NOT NULL 
      AND p.approval_status = 'pending'
      ORDER BY p.receipt_uploaded_at DESC
    `)
    res.json({ success: true, count: receipts.length, receipts })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// Update payment approval status
const updatePaymentApproval = async (req, res) => {
  try {
    const { id } = req.params
    const { approval_status, approval_notes } = req.body

    if (!['approved', 'rejected', 'pending'].includes(approval_status)) {
      return res.status(400).json({ error: 'Invalid approval status' })
    }

    const updateStatus = approval_status === 'approved' ? 'completed' : 'pending'

    await db.run(
      `UPDATE payments SET approval_status = ?, status = ?, approval_notes = ? WHERE id = ?`,
      [approval_status, updateStatus, approval_notes || '', id]
    )

    res.json({ success: true, message: `Payment ${id} approval status updated to ${approval_status}` })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// Reset payment (for testing/admin)
const resetPayment = async (req, res) => {
  try {
    const { id } = req.params

    await db.run(
      `UPDATE payments SET status = 'pending', approval_status = 'pending', receipt_url = NULL, receipt_public_id = NULL WHERE id = ?`,
      [id]
    )

    res.json({ success: true, message: `Payment ${id} reset to pending` })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ==================== CLASSES ====================

// Get all classes
const getAllClasses = async (req, res) => {
  try {
    const classes = await db.all(`
      SELECT c.*, u.name as teacher_name
      FROM classes c
      LEFT JOIN users u ON c.teacher_id = u.id
      ORDER BY c.grade, c.location
    `)
    res.json({ success: true, count: classes.length, classes })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// Update class fee
const updateClassFee = async (req, res) => {
  try {
    const { id } = req.params
    const { fee } = req.body

    if (!fee || fee <= 0) {
      return res.status(400).json({ error: 'Invalid fee amount' })
    }

    await db.run(`UPDATE classes SET fee = ? WHERE id = ?`, [fee, id])
    res.json({ success: true, message: `Class ${id} fee updated to ${fee}` })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ==================== STATISTICS ====================

// Get dashboard stats
const getDashboardStats = async (req, res) => {
  try {
    const stats = {}

    // User counts
    const userCounts = await db.all(`
      SELECT role, COUNT(*) as count FROM users GROUP BY role
    `)
    stats.users = {}
    userCounts.forEach(row => {
      stats.users[row.role] = row.count
    })

    // Payment stats
    const paymentStats = await db.all(`
      SELECT status, COUNT(*) as count FROM payments GROUP BY status
    `)
    stats.payments = {}
    paymentStats.forEach(row => {
      stats.payments[row.status] = row.count
    })

    // Pending receipts
    const pendingReceipts = await db.all(`
      SELECT COUNT(*) as count FROM payments WHERE receipt_url IS NOT NULL AND approval_status = 'pending'
    `)
    stats.pendingReceiptsCount = pendingReceipts[0]?.count || 0

    // Total revenue
    const revenue = await db.all(`
      SELECT SUM(amount) as total FROM payments WHERE status = 'completed'
    `)
    stats.totalRevenue = revenue[0]?.total || 0

    res.json({ success: true, stats })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// Export data
const exportData = async (req, res) => {
  try {
    const { table } = req.query

    if (!table) {
      return res.status(400).json({ error: 'Table name required' })
    }

    // Sanitize table name (basic protection)
    const allowedTables = ['users', 'classes', 'payments', 'videos', 'notes', 'assignments', 'announcements']
    if (!allowedTables.includes(table)) {
      return res.status(400).json({ error: 'Invalid table' })
    }

    const data = await db.all(`SELECT * FROM ${table} LIMIT 1000`)

    // Convert to CSV
    if (data.length === 0) {
      return res.json({ success: true, data: [] })
    }

    const headers = Object.keys(data[0])
    const rows = data.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))
    const csv = [headers.join(','), ...rows].join('\n')

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="${table}-export.csv"`)
    res.send(csv)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = {
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
}
