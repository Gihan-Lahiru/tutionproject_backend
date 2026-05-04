const db = require('../config/database')

class Payment {
  static async findById(id) {
    return new Promise((resolve, reject) => {
      db.db.get('SELECT * FROM payments WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  static async getByUser(userId) {
    return new Promise((resolve, reject) => {
      db.db.all(
        `SELECT p.*
         FROM payments p
         WHERE p.student_id = ? OR p.user_id = ? OR p.payer_id = ?
         ORDER BY datetime(COALESCE(p.date, p.payment_date)) DESC`,
        [userId, userId, userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  static async getByClass(classId) {
    return new Promise((resolve, reject) => {
      db.db.all(
        `SELECT p.*, u.name as payer_name, u.email as payer_email
         FROM payments p
         LEFT JOIN users u ON u.id = COALESCE(p.student_id, p.user_id, p.payer_id)
         WHERE p.class_id = ?
         ORDER BY datetime(COALESCE(p.date, p.payment_date)) DESC`,
        [classId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  static async getAllWithUsers() {
    return new Promise((resolve, reject) => {
      db.db.all(
        `SELECT p.*, u.name as payer_name, u.email as payer_email
         FROM payments p
         LEFT JOIN users u ON u.id = COALESCE(p.student_id, p.user_id, p.payer_id)
         ORDER BY datetime(COALESCE(p.date, p.payment_date)) DESC`,
        [],
        (err, rows) => {
          if (err) reject(err)
          else resolve(rows || [])
        }
      )
    })
  }

  static async create(paymentData) {
    const { 
      student_id, 
      payer_id, 
      class_id, 
      amount, 
      month, 
      year, 
      currency = 'LKR', 
      gateway = 'payhere', 
      gateway_payment_id, 
      transaction_id,
      status = 'pending' 
    } = paymentData
    
    return new Promise((resolve, reject) => {
      db.db.run(
        `INSERT INTO payments (
          student_id, payer_id, class_id, amount, month, year, 
          currency, gateway, gateway_payment_id, transaction_id, status, date
        ) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          student_id || payer_id, 
          payer_id || student_id, 
          class_id, 
          amount, 
          month, 
          year, 
          currency, 
          gateway, 
          gateway_payment_id, 
          transaction_id, 
          status
        ],
        function(err) {
          if (err) {
            console.error('Payment creation error:', err);
            reject(err);
          } else {
            resolve({ id: this.lastID, transaction_id, status });
          }
        }
      );
    });
  }

  static async updateStatus(id, status) {
    return new Promise((resolve, reject) => {
      db.db.run(
        `UPDATE payments 
         SET status = ?, payment_date = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [status, id],
        function(err) {
          if (err) reject(err);
          else {
            db.db.get('SELECT * FROM payments WHERE id = ?', [id], (err, row) => {
              if (err) reject(err);
              else resolve(row);
            });
          }
        }
      );
    });
  }

  static async getStats(teacherId = null) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          COUNT(*) as total_payments,
          SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_revenue,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count
        FROM payments p
      `;
      
      const params = [];
      if (teacherId) {
        query += ` JOIN classes c ON p.class_id = c.id WHERE c.teacher_id = ?`;
        params.push(teacherId);
      }

      db.db.get(query, params, (err, row) => {
        if (err) reject(err);
        else resolve(row || { total_payments: 0, total_revenue: 0, pending_count: 0 });
      });
    });
  }

  // PayHere integration methods
  static async findByTransactionId(transactionId) {
    return new Promise((resolve, reject) => {
      db.db.get('SELECT * FROM payments WHERE transaction_id = ?', [transactionId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  static async updateByTransactionId(transactionId, updates) {
    const { status, payment_id, status_message } = updates;
    return new Promise((resolve, reject) => {
      db.db.run(
        `UPDATE payments 
         SET status = ?, payment_id = ?, status_message = ?, date = CURRENT_TIMESTAMP
         WHERE transaction_id = ?`,
        [status, payment_id, status_message, transactionId],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, changes: this.changes });
        }
      );
    });
  }
}

module.exports = Payment

