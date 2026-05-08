const Payment = require('../models/Payment')
const crypto = require('crypto')
const Notification = require('../models/Notification')
const db = require('../config/database')
const cloudinary = require('cloudinary').v2
const fs = require('fs')
const path = require('path')

class PaymentController {
  static async getMyPayments(req, res) {
    try {
      const userId = req.user.id
      const payments = await Payment.getByUser(userId)
      res.json({ payments })
    } catch (error) {
      console.error('Get my payments error:', error)
      res.status(500).json({ message: 'Failed to fetch payments' })
    }
  }

  static async getUserPayments(req, res) {
    try {
      const userId = req.params.userId || req.user.id
      
      // Users can only view their own payments unless admin
      if (userId !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Not authorized' })
      }

      const payments = await Payment.getByUser(userId)
      res.json({ payments })
    } catch (error) {
      console.error('Get payments error:', error)
      res.status(500).json({ message: 'Failed to fetch payments' })
    }
  }

  static async initPayment(req, res) {
    try {
      const { class_id, amount, gateway = 'manual' } = req.body
      const payer_id = req.user.id

      // Create payment record. For manual gateway we still create a pending record.
      const payment = await Payment.create({
        payer_id,
        class_id,
        amount,
        currency: 'LKR',
        gateway: gateway === 'payhere' ? 'payhere' : 'manual',
        gateway_payment_id: gateway === 'payhere' ? crypto.randomUUID() : null,
        status: 'pending',
      })

      // If client requested manual flow, return minimal response instructing
      // frontend to upload a receipt. Keep backward compatibility for payhere.
      if (gateway !== 'payhere') {
        return res.json({ success: true, payment_id: payment.id, message: 'Manual payment created. Upload receipt to complete.' })
      }

      // --- PayHere flow (kept for compatibility) ---
      const paymentData = {
        merchant_id: process.env.PAYHERE_MERCHANT_ID,
        return_url: `${process.env.FRONTEND_URL}/student/payments`,
        cancel_url: `${process.env.FRONTEND_URL}/student/payments`,
        notify_url: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/payments/verify`,
        order_id: payment.id,
        items: `Class Payment`,
        amount: amount,
        currency: 'LKR',
        first_name: req.user.name.split(' ')[0],
        last_name: req.user.name.split(' ').slice(1).join(' ') || '',
        email: req.user.email,
      }

      // Generate hash for PayHere
      const hash = crypto
        .createHash('md5')
        .update(
          `${process.env.PAYHERE_MERCHANT_ID}${payment.id}${amount}LKR` +
          crypto.createHash('md5').update(process.env.PAYHERE_MERCHANT_SECRET).digest('hex').toUpperCase()
        )
        .digest('hex')
        .toUpperCase()

      res.json({
        payment_id: payment.id,
        paymentUrl: process.env.PAYHERE_SANDBOX === 'true' 
          ? 'https://sandbox.payhere.lk/pay/checkout'
          : 'https://www.payhere.lk/pay/checkout',
        paymentData: {
          ...paymentData,
          hash,
        },
      })
    } catch (error) {
      console.error('Init payment error:', error)
      res.status(500).json({ message: 'Failed to initialize payment' })
    }
  }

  static async verifyPayment(req, res) {
    try {
      const {
        order_id,
        payment_id,
        status_code,
        md5sig,
      } = req.body

      // Verify hash
      const localHash = crypto
        .createHash('md5')
        .update(
          `${process.env.PAYHERE_MERCHANT_ID}${order_id}${payment_id}${status_code}` +
          crypto.createHash('md5').update(process.env.PAYHERE_MERCHANT_SECRET).digest('hex').toUpperCase()
        )
        .digest('hex')
        .toUpperCase()

      if (localHash !== md5sig) {
        return res.status(400).json({ message: 'Invalid signature' })
      }

      // Update payment status
      const paymentStatus = status_code === '2' ? 'completed' : 'failed'
      await Payment.updateStatus(order_id, paymentStatus)

      res.json({ message: 'Payment verified' })
    } catch (error) {
      console.error('Verify payment error:', error)
      res.status(500).json({ message: 'Failed to verify payment' })
    }
  }

  static async getStats(req, res) {
    try {
      const teacherId = req.user.role === 'teacher' ? req.user.id : null
      const stats = await Payment.getStats(teacherId)
      res.json({ stats })
    } catch (error) {
      console.error('Get payment stats error:', error)
      res.status(500).json({ message: 'Failed to fetch stats' })
    }
  }

  static async getAllPayments(req, res) {
    try {
      if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Not authorized' })
      }

      const payments = await Payment.getAllWithUsers()
      res.json({ payments })
    } catch (error) {
      console.error('Get all payments error:', error)
      res.status(500).json({ message: 'Failed to fetch all payments' })
    }
  }

  static async sendReminder(req, res) {
    try {
      if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Not authorized' })
      }

      const paymentId = req.body?.paymentId
      const transactionId = req.body?.transactionId

      if (!paymentId && !transactionId) {
        return res.status(400).json({ message: 'paymentId or transactionId is required' })
      }

      const result = await db.query(
        `SELECT id, student_id, user_id, payer_id, amount, month, year, status, transaction_id
         FROM payments
         WHERE (? IS NOT NULL AND id = ?)
            OR (? IS NOT NULL AND transaction_id = ?)
         LIMIT 1`,
        [paymentId || null, paymentId || null, transactionId || null, transactionId || null]
      )

      const payment = result.rows?.[0]
      if (!payment) {
        return res.status(404).json({ message: 'Payment record not found' })
      }

      const studentId = payment.student_id || payment.user_id || payment.payer_id
      if (!studentId) {
        return res.status(400).json({ message: 'No student is linked to this payment record' })
      }

      const status = String(payment.status || '').toLowerCase()
      if (status === 'completed') {
        return res.status(400).json({ message: 'Payment is already completed' })
      }

      const monthYear = [payment.month, payment.year].filter(Boolean).join(' ') || 'this month'
      const amountText = Number(payment.amount || 0).toLocaleString()

      await Notification.create({
        user_id: studentId,
        type: 'payment',
        message: `Payment reminder: Please pay Rs ${amountText} for ${monthYear}.`,
        related_payment_id: payment.id || null,
      })

      return res.json({ success: true, message: 'Reminder sent successfully' })
    } catch (error) {
      console.error('Send reminder error:', error)
      return res.status(500).json({ message: 'Failed to send reminder' })
    }
  }

  static async requestReactivation(req, res) {
    try {
      if (req.user.role !== 'student') {
        return res.status(403).json({ message: 'Only students can request reactivation' })
      }

      const userRes = await db.query(
        'SELECT id, name, email, grade, status FROM users WHERE id = ? LIMIT 1',
        [req.user.id]
      )
      const student = userRes.rows?.[0]
      if (!student) {
        return res.status(404).json({ message: 'Student not found' })
      }

      const currentStatus = String(student.status || 'active').toLowerCase()
      if (currentStatus !== 'inactive') {
        return res.status(400).json({ message: 'Your account is already active' })
      }

      const paymentRows = await db.query(
        `SELECT id, amount, month, year, status
         FROM payments
         WHERE (student_id = ? OR user_id = ? OR payer_id = ?)
           AND LOWER(COALESCE(status, 'pending')) <> 'completed'`,
        [student.id, student.id, student.id]
      )

      const overduePayments = paymentRows.rows || []
      const overdueCount = overduePayments.length
      const overdueTotal = overduePayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)

      if (overdueCount > 0) {
        return res.status(400).json({
          message: 'Please pay all overdue amounts before requesting activation',
          overdueCount,
          overdueTotal,
        })
      }

      const note = String(req.body?.message || '').trim()
      const safeNote = note ? note.slice(0, 300) : ''
      const studentLabel = `${student.name || 'Student'} (${student.email || 'no-email'})`
      const message = safeNote
        ? `Reactivation request: ${studentLabel} has cleared overdue payments and asks to activate the account again. Note: ${safeNote}`
        : `Reactivation request: ${studentLabel} has cleared overdue payments and asks to activate the account again.`

      const teachersRes = await db.query(
        "SELECT id FROM users WHERE role IN ('teacher','admin')",
        []
      )

      let sent = 0
      for (const row of teachersRes.rows || []) {
        await Notification.create({
          user_id: row.id,
          type: 'reactivation_request',
          message,
          related_payment_id: null,
        })
        sent += 1
      }

      await Notification.create({
        user_id: student.id,
        type: 'reactivation_request',
        message: 'Your reactivation request was sent to the teacher. You will be activated after approval.',
        related_payment_id: null,
      })

      return res.json({
        success: true,
        message: 'Reactivation request sent to teacher',
        notifiedTeachers: sent,
      })
    } catch (error) {
      console.error('Request reactivation error:', error)
      return res.status(500).json({ message: 'Failed to send reactivation request' })
    }
  }

  // Receipt upload for manual payment
  static async uploadReceipt(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'Receipt file is required' })
      }

      const paymentId = req.params.id
      const userId = req.user.id

      console.log(`[uploadReceipt] Starting upload for payment ${paymentId}, user ${userId}`)
      console.log(`[uploadReceipt] File info:`, { path: req.file.path, size: req.file.size, mimetype: req.file.mimetype, originalname: req.file.originalname })

      // Get payment and verify it belongs to user
      const payment = await Payment.findById(paymentId)
      console.log(`[uploadReceipt] Payment found:`, payment)
      
      if (!payment) {
        return res.status(404).json({ message: 'Payment not found' })
      }

      const payerId = payment.student_id || payment.user_id || payment.payer_id
      console.log(`[uploadReceipt] Payer ID: ${payerId}, User ID: ${userId}`)
      
      if (payerId !== userId) {
        return res.status(403).json({ message: 'Not authorized to upload receipt for this payment' })
      }

      // Get file extension from original filename
      const ext = path.extname(req.file.originalname) || '';
      console.log(`[uploadReceipt] File extension: ${ext}`)

      // Try Cloudinary if configured, otherwise use local storage
      let receipt_url = ''
      let receipt_public_id = `receipt-local-${paymentId}-${Date.now()}${ext}`

      if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
        console.log(`[uploadReceipt] Uploading file to Cloudinary: ${req.file.originalname}`)
        
        // Read file from disk (multer stored it there)
        const fileBuffer = fs.readFileSync(req.file.path)
        
        // Use public_id WITH extension for Cloudinary
        const cloudinaryPublicId = `receipt-${paymentId}-${Date.now()}${ext}`
        
        const result = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: 'tuition-app/receipts',
              resource_type: 'raw',
              public_id: cloudinaryPublicId,
            },
            (error, result) => {
              if (error) {
                console.error('[uploadReceipt] Cloudinary error:', error)
                reject(error)
              }
              else {
                console.log('[uploadReceipt] Cloudinary success:', result.public_id)
                resolve(result)
              }
            }
          )
          stream.end(fileBuffer)
        })
        receipt_url = result.secure_url
        receipt_public_id = result.public_id
        
        // Clean up temp file
        try {
          fs.unlinkSync(req.file.path)
        } catch (e) {
          console.warn('Failed to delete temp file:', e.message)
        }
      } else {
        // Fallback: use local storage with proper extension
        console.log(`[uploadReceipt] Cloudinary not configured, using local file storage`)
        
        const filenameWithExt = path.basename(req.file.path) + ext;
        const newFilePath = path.join(path.dirname(req.file.path), filenameWithExt);
        
        // Rename file to include extension
        try {
          fs.renameSync(req.file.path, newFilePath);
          console.log(`[uploadReceipt] File renamed with extension: ${filenameWithExt}`);
        } catch (e) {
          console.warn('Failed to rename file:', e.message);
        }
        
        receipt_url = `/uploads/${filenameWithExt}`;
      }

      console.log(`[uploadReceipt] Updating payment with receipt URL: ${receipt_url}`)
      // Update payment with receipt URL
      await Payment.updateReceipt(
        paymentId,
        receipt_url,
        receipt_public_id
      )

      // Notify all teachers that a receipt is pending approval
      console.log(`[uploadReceipt] Notifying teachers about pending receipt`)
      const studentName = payment.payer_name || 'A student'
      const monthYear = `${payment.month} ${payment.year}`
      const amount = Number(payment.amount || 0).toLocaleString('en-US', { style: 'currency', currency: 'LKR' }).replace('LKR', 'Rs')
      
      const teachersRes = await db.query(
        "SELECT id FROM users WHERE role IN ('teacher','admin')",
        []
      )

      for (const row of teachersRes.rows || []) {
        await Notification.create({
          user_id: row.id,
          type: 'receipt_pending_approval',
          message: `${studentName} uploaded a payment receipt for ${monthYear} (${amount}). Pending your review and approval.`,
          related_payment_id: paymentId,
        })
      }

      console.log(`[uploadReceipt] Receipt upload complete`)
      res.json({
        message: 'Receipt uploaded successfully',
        receipt_url: receipt_url,
        receipt_public_id: receipt_public_id,
      })
    } catch (error) {
      console.error('[uploadReceipt] Error:', error.message, error.stack)
      // Clean up temp file on error
      if (req.file && req.file.path) {
        try {
          fs.unlinkSync(req.file.path)
        } catch (e) {
          console.warn('Failed to delete temp file on error:', e.message)
        }
      }
      res.status(500).json({ message: 'Failed to upload receipt: ' + error.message })
    }
  }

  // Get pending receipt payments for teacher
  static async getPendingReceipts(req, res) {
    try {
      if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Not authorized' })
      }

      const payments = await Payment.getPendingReceiptPayments()
      res.json({ payments })
    } catch (error) {
      console.error('Get pending receipts error:', error)
      res.status(500).json({ message: 'Failed to fetch pending receipts' })
    }
  }

  // Approve receipt and complete payment
  static async approveReceipt(req, res) {
    try {
      if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Not authorized' })
      }

      const paymentId = req.params.id
      const { notes } = req.body

      const payment = await Payment.findById(paymentId)
      if (!payment) {
        return res.status(404).json({ message: 'Payment not found' })
      }

      if (!payment.receipt_url) {
        return res.status(400).json({ message: 'No receipt found for this payment' })
      }

      const updatedPayment = await Payment.approveReceipt(paymentId, req.user.id, notes || '')

      // Notify student
      const payerId = payment.student_id || payment.user_id || payment.payer_id
      await Notification.create({
        user_id: payerId,
        type: 'payment_approved',
        message: `Your payment receipt for ${payment.month} ${payment.year} has been approved. Amount: Rs. ${Number(payment.amount).toLocaleString()}`,
        related_payment_id: paymentId,
      })

      res.json({
        message: 'Receipt approved and payment completed',
        payment: updatedPayment,
      })
    } catch (error) {
      console.error('Approve receipt error:', error)
      res.status(500).json({ message: 'Failed to approve receipt' })
    }
  }

  // Reject receipt
  static async rejectReceipt(req, res) {
    try {
      if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Not authorized' })
      }

      const paymentId = req.params.id
      const { notes } = req.body

      const payment = await Payment.findById(paymentId)
      if (!payment) {
        return res.status(404).json({ message: 'Payment not found' })
      }

      if (!payment.receipt_url) {
        return res.status(400).json({ message: 'No receipt found for this payment' })
      }

      // Reject receipt and clear it for retry, set status back to pending
      const updatedPayment = await Payment.rejectReceipt(paymentId, req.user.id, notes || '')
      
      // Set payment status back to pending so student can retry
      await Payment.updateStatus(paymentId, 'pending')

      // Notify student
      const payerId = payment.student_id || payment.user_id || payment.payer_id
      const notesText = notes ? ` Reason: ${notes}` : ''
      await Notification.create({
        user_id: payerId,
        type: 'payment_rejected',
        message: `Your payment receipt for ${payment.month} ${payment.year} was rejected.${notesText} Please upload a new receipt to retry.`,
        related_payment_id: paymentId,
      })

      res.json({
        message: 'Receipt rejected. Student can now retry with a new receipt.',
        payment: updatedPayment,
      })
    } catch (error) {
      console.error('Reject receipt error:', error)
      res.status(500).json({ message: 'Failed to reject receipt' })
    }
  }
}

module.exports = PaymentController
