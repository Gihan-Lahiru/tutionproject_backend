const Payment = require('../models/Payment')
const crypto = require('crypto')
const Notification = require('../models/Notification')
const db = require('../config/database')

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
      const { class_id, amount } = req.body
      const payer_id = req.user.id

      // Create payment record
      const payment = await Payment.create({
        payer_id,
        class_id,
        amount,
        currency: 'LKR',
        gateway: 'payhere',
        gateway_payment_id: crypto.randomUUID(),
        status: 'pending',
      })

      // Generate PayHere payment URL/data
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
}

module.exports = PaymentController
