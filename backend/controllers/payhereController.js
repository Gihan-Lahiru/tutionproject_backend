const crypto = require('crypto');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');
const db = require('../config/database');
const { sendPaymentSuccessEmail } = require('../utils/emailService');

class PayHereController {
  static isClientConfirmAllowed() {
    // This is a dev convenience for local/sandbox where PayHere cannot POST notify_url to localhost.
    // In production, use PayHere server-to-server notify (webhook) + signature verification.
    if (process.env.PAYHERE_ALLOW_CLIENT_CONFIRM === 'true') return true
    if (process.env.PAYHERE_SANDBOX === 'true') return true
    return process.env.NODE_ENV !== 'production'
  }

  static async createPaymentNotifications(orderId) {
    const payment = await Payment.findByTransactionId(orderId)
    if (!payment) return

    const studentId = payment?.student_id || payment?.user_id || payment?.payer_id

    let studentName = 'Student'
    let studentEmail = null
    if (studentId) {
      const studentRes = await db.query('SELECT name, email FROM users WHERE id = ?', [studentId])
      studentName = studentRes.rows?.[0]?.name || studentName
      studentEmail = studentRes.rows?.[0]?.email || null
    }

    const monthYear = [payment?.month, payment?.year].filter(Boolean).join(' ') || 'this month'
    const amountText = payment?.amount != null ? `Rs ${payment.amount}` : 'a payment'
    const studentLabel = studentEmail ? `${studentName} (${studentEmail})` : studentName

    const teacherRes = await db.query(
      "SELECT id FROM users WHERE role = 'teacher' OR role = 'admin'",
      []
    )

    for (const row of teacherRes.rows || []) {
      await Notification.create({
        user_id: row.id,
        type: 'payment',
        message: `Payment completed: ${studentLabel} paid ${amountText} for ${monthYear}.`,
        related_payment_id: payment?.id || null,
      })
    }

    if (studentId) {
      await Notification.create({
        user_id: studentId,
        type: 'payment',
        message: `Payment successful: ${amountText} for ${monthYear} is completed.`,
        related_payment_id: payment?.id || null,
      })

      if (studentEmail) {
        try {
          await sendPaymentSuccessEmail(studentEmail, {
            name: studentName,
            amountText,
            monthYear,
            transactionId: payment?.transaction_id || orderId,
          })
        } catch (emailErr) {
          // Keep payment success flow intact even if email fails.
          console.error('Failed to send payment success email:', emailErr.message)
        }
      }
    }
  }

  // Generate PayHere payment hash
  static generateHash(merchantId, orderId, amount, currency = 'LKR') {
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;

    // PayHere hash format: MD5(merchant_id + order_id + amount_formatted + currency + MD5(merchant_secret).toUpperCase())
    const hashedSecret = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
    const amountFormatted = parseFloat(amount).toFixed(2);
    const hashString = `${merchantId}${orderId}${amountFormatted}${currency}${hashedSecret}`;
    
    const finalHash = crypto.createHash('md5').update(hashString).digest('hex').toUpperCase();
    
    return finalHash;
  }

  // Initiate payment
  static async initiatePayment(req, res) {
    try {
      const { amount, month, year } = req.body;
      const studentId = req.user.id;

      // Validate required fields
      if (!amount || !month || !year) {
        return res.status(400).json({ message: 'Amount, month, and year are required' });
      }

      // Prevent duplicates for the same student/month/year
      // (especially important in local dev where payments can remain pending).
      const existingRes = await db.query(
        `SELECT *
         FROM payments
         WHERE (student_id = ? OR user_id = ? OR payer_id = ?)
           AND LOWER(COALESCE(month, '')) = LOWER(?)
           AND COALESCE(year, '') = ?
           AND COALESCE(gateway, 'payhere') = 'payhere'
           AND status IN ('pending','completed')
         ORDER BY datetime(COALESCE(date, payment_date)) DESC
         LIMIT 1`,
        [studentId, studentId, studentId, String(month), String(year)]
      )

      let orderId = `ORDER_${studentId}_${Date.now()}`
      let payment = null

      const existing = existingRes?.rows?.[0]
      if (existing?.transaction_id && String(existing.status).toLowerCase() === 'completed') {
        return res.status(409).json({
          success: false,
          message: `Already paid for ${month} ${year}`,
          status: 'completed',
          orderId: existing.transaction_id,
        })
      }

      if (existing?.transaction_id && String(existing.status).toLowerCase() === 'pending') {
        // Reuse the existing pending order id so the same DB row can be updated.
        orderId = existing.transaction_id
        payment = { id: existing.id }
      } else {
        // Create payment record
        payment = await Payment.create({
          student_id: studentId,
          amount,
          month,
          year,
          status: 'pending',
          transaction_id: orderId,
        });
      }

      const merchantId = process.env.PAYHERE_MERCHANT_ID;

      // Generate hash with merchantId
      const hash = PayHereController.generateHash(merchantId, orderId, amount);

      // Get user full name from database
      const userName = await new Promise((resolve, reject) => {
        const { db } = require('../config/database');
        db.get('SELECT name, phone, institute FROM users WHERE id = ?', [studentId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      const fullName = userName?.name || req.user.email.split('@')[0];
      const nameParts = fullName.split(' ');
      
      // PayHere payment data
      const paymentData = {
        sandbox: process.env.PAYHERE_SANDBOX === 'true',
        merchant_id: process.env.PAYHERE_MERCHANT_ID,
        // Use backend return/cancel so we can verify + update DB even on localhost.
        // PayHere redirects the user's browser here after checkout.
        return_url: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/payments/payhere/return`,
        cancel_url: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/payments/payhere/cancel`,
        notify_url:
          process.env.PAYHERE_NOTIFY_URL ||
          `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/payments/payhere/notify`,
        order_id: orderId,
        items: `Tuition Fee - ${month}/${year}`,
        currency: 'LKR',
        amount: parseFloat(amount).toFixed(2),
        first_name: nameParts[0] || 'Student',
        last_name: nameParts.slice(1).join(' ') || '-',
        email: req.user.email,
        phone: userName?.phone || '0000000000',
        address: userName?.institute || 'N/A',
        city: 'Colombo',
        country: 'Sri Lanka',
        hash: hash,
      };

      res.json({
        success: true,
        paymentData,
        paymentId: payment.id,
      });
    } catch (error) {
      console.error('Payment initiation error:', error);
      res.status(500).json({ message: 'Failed to initiate payment', error: error.message });
    }
  }

  // Local/sandbox fallback: confirm completion from the authenticated client.
  // This is ONLY to make sandbox/local dev usable when notify_url cannot hit localhost.
  static async confirmPayment(req, res) {
    try {
      if (!PayHereController.isClientConfirmAllowed()) {
        return res.status(403).json({ message: 'Client confirmation is disabled' })
      }

      const orderId = req.body?.orderId || req.body?.order_id
      if (!orderId) {
        return res.status(400).json({ message: 'orderId is required' })
      }

      const payment = await Payment.findByTransactionId(orderId)
      if (!payment) {
        return res.status(404).json({ message: 'Payment not found' })
      }

      const payerId = payment?.student_id || payment?.user_id || payment?.payer_id
      if (String(payerId) !== String(req.user.id) && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Not authorized to confirm this payment' })
      }

      const currentStatus = String(payment.status || '').toLowerCase()
      if (currentStatus === 'completed') {
        // Still cleanup any other pending attempts for the same month/year.
        try {
          const month = String(payment.month || '')
          const year = payment.year != null ? String(payment.year) : ''
          const studentId = payerId
          if (month && year && studentId) {
            const changes = await new Promise((resolve, reject) => {
              db.db.run(
                `UPDATE payments
                 SET status = 'failed',
                     status_message = 'Superseded by a successful payment',
                     date = CURRENT_TIMESTAMP
                 WHERE (student_id = ? OR user_id = ? OR payer_id = ?)
                   AND LOWER(COALESCE(month, '')) = LOWER(?)
                   AND CAST(COALESCE(year, '') AS TEXT) = ?
                   AND status = 'pending'
                   AND transaction_id <> ?`,
                [studentId, studentId, studentId, month, year, orderId],
                function (err) {
                  if (err) reject(err)
                  else resolve(this.changes)
                }
              )
            })

            console.log(`[PAYHERE][CONFIRM] cleanup_changes=${changes || 0} order_id=${orderId}`)
          }
        } catch (cleanupErr) {
          console.error('Failed to cleanup duplicate pending payments:', cleanupErr)
        }

        return res.json({ success: true, payment })
      }

      await Payment.updateByTransactionId(orderId, {
        status: 'completed',
        payment_id: payment.payment_id || null,
        status_message: 'Client confirmed (sandbox/local)',
      })

      // If there are older pending attempts for the same month/year, mark them as failed.
      // This prevents the UI from looking like multiple payments are still pending.
      try {
        const month = String(payment.month || '')
        const year = payment.year != null ? String(payment.year) : ''
        const studentId = payerId
        if (month && year && studentId) {
          const changes = await new Promise((resolve, reject) => {
            db.db.run(
              `UPDATE payments
               SET status = 'failed',
                   status_message = 'Superseded by a successful payment',
                   date = CURRENT_TIMESTAMP
               WHERE (student_id = ? OR user_id = ? OR payer_id = ?)
                 AND LOWER(COALESCE(month, '')) = LOWER(?)
                 AND CAST(COALESCE(year, '') AS TEXT) = ?
                 AND status = 'pending'
                 AND transaction_id <> ?`,
              [studentId, studentId, studentId, month, year, orderId],
              function (err) {
                if (err) reject(err)
                else resolve(this.changes)
              }
            )
          })

          console.log(`[PAYHERE][CONFIRM] cleanup_changes=${changes || 0} order_id=${orderId}`)
        }
      } catch (cleanupErr) {
        console.error('Failed to cleanup duplicate pending payments:', cleanupErr)
      }

      try {
        await PayHereController.createPaymentNotifications(orderId)
      } catch (notifyErr) {
        console.error('Failed to create payment notifications (client confirm):', notifyErr)
      }

      const updated = await Payment.findByTransactionId(orderId)
      return res.json({ success: true, payment: updated })
    } catch (error) {
      console.error('Client confirm payment error:', error)
      return res.status(500).json({ message: 'Failed to confirm payment' })
    }
  }

  // PayHere notify callback (webhook)
  static async handleNotify(req, res) {
    try {
      const {
        merchant_id,
        order_id,
        payment_id,
        payhere_amount,
        payhere_currency,
        status_code,
        md5sig,
        status_message,
      } = req.body;

      console.log(`[PAYHERE][NOTIFY] order_id=${order_id} status_code=${status_code} payment_id=${payment_id}`)
      console.log('PayHere Notify:', req.body);

      // Verify hash
      const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
      const hashedSecret = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
      const localHash = crypto
        .createHash('md5')
        .update(`${merchant_id}${order_id}${payhere_amount}${payhere_currency}${status_code}${hashedSecret}`)
        .digest('hex')
        .toUpperCase();

      if (localHash !== md5sig) {
        console.error('Hash verification failed');
        return res.status(400).send('Invalid hash');
      }

      // Update payment status
      const status = status_code === '2' ? 'completed' : 'failed';
      await Payment.updateByTransactionId(order_id, {
        status,
        payment_id,
        status_message,
      });

      // Create notifications on successful payments
      if (status === 'completed') {
        try {
          await PayHereController.createPaymentNotifications(order_id)
        } catch (notifyErr) {
          console.error('Failed to create payment notifications:', notifyErr)
        }
      }

      console.log(`Payment ${order_id} status updated to ${status}`);
      res.status(200).send('OK');
    } catch (error) {
      console.error('PayHere notify error:', error);
      res.status(500).send('Error processing notification');
    }
  }

  // Get payment status
  static async getPaymentStatus(req, res) {
    try {
      const { orderId } = req.params;
      const payment = await Payment.findByTransactionId(orderId);

      if (!payment) {
        return res.status(404).json({ message: 'Payment not found' });
      }

      res.json({
        success: true,
        payment,
      });
    } catch (error) {
      console.error('Get payment status error:', error);
      res.status(500).json({ message: 'Failed to get payment status' });
    }
  }

  // PayHere browser return callback (user is redirected here after payment)
  static async handleReturn(req, res) {
    const frontendBase = process.env.FRONTEND_URL || 'http://localhost:3002'
    try {
      const {
        order_id,
        payment_id,
        status_code,
        md5sig,
        merchant_id,
        payhere_amount,
        payhere_currency,
        status_message,
      } = req.query

      console.log(`[PAYHERE][RETURN] order_id=${order_id || ''} status_code=${status_code || ''} payment_id=${payment_id || ''}`)

      if (!order_id) {
        return res.redirect(`${frontendBase}/student/payments/cancel`)
      }

      // Verify signature if present.
      const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET
      const hashedSecret = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase()

      let isValid = false

      // Prefer notify-style signature when amount/currency are available.
      if (md5sig && merchant_id && payhere_amount && payhere_currency && status_code) {
        const localHash = crypto
          .createHash('md5')
          .update(`${merchant_id}${order_id}${payhere_amount}${payhere_currency}${status_code}${hashedSecret}`)
          .digest('hex')
          .toUpperCase()
        isValid = String(localHash) === String(md5sig).toUpperCase()
      }

      // Fallback: verify-style signature (merchant_id + order_id + payment_id + status_code + hashedSecret)
      if (!isValid && md5sig && payment_id && status_code) {
        const localHash = crypto
          .createHash('md5')
          .update(`${process.env.PAYHERE_MERCHANT_ID}${order_id}${payment_id}${status_code}${hashedSecret}`)
          .digest('hex')
          .toUpperCase()
        isValid = String(localHash) === String(md5sig).toUpperCase()
      }

      if (!isValid && md5sig) {
        console.error('PayHere return signature verification failed', req.query)
        // Don't mark as failed — just show processing.
        return res.redirect(`${frontendBase}/student/dashboard?payment=processing`)
      }

      const status = String(status_code) === '2' ? 'completed' : 'failed'
      await Payment.updateByTransactionId(order_id, {
        status,
        payment_id: payment_id || null,
        status_message: status_message || 'Return callback',
      })

      if (status === 'completed') {
        try {
          await PayHereController.createPaymentNotifications(order_id)
        } catch (notifyErr) {
          console.error('Failed to create payment notifications (return):', notifyErr)
        }
        return res.redirect(`${frontendBase}/student/dashboard?payment=success`)
      }

      return res.redirect(`${frontendBase}/student/payments/cancel`)
    } catch (error) {
      console.error('PayHere return error:', error)
      return res.redirect(`${frontendBase}/student/dashboard?payment=processing`)
    }
  }

  static async handleCancel(req, res) {
    const frontendBase = process.env.FRONTEND_URL || 'http://localhost:3002'
    return res.redirect(`${frontendBase}/student/payments/cancel`)
  }
}

module.exports = PayHereController;
