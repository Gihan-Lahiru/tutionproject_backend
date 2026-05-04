const crypto = require('crypto')
const db = require('../config/database')

class Notification {
  static async create({ user_id, type, message, related_payment_id = null }) {
    const id = crypto.randomUUID()

    await new Promise((resolve, reject) => {
      db.db.run(
        `INSERT INTO notifications (id, user_id, type, message, related_payment_id)
         VALUES (?, ?, ?, ?, ?)`
        ,
        [id, user_id, type, message, related_payment_id],
        (err) => {
          if (err) reject(err)
          else resolve()
        }
      )
    })

    return { id }
  }

  static async getByUser(userId, limit = 20) {
    const result = await db.query(
      `SELECT id, type, message, related_payment_id, read, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY datetime(created_at) DESC
       LIMIT ?`,
      [userId, limit]
    )
    return result.rows || []
  }

  static async getUnreadCount(userId) {
    const result = await db.query(
      `SELECT COUNT(*) as count
       FROM notifications
       WHERE user_id = ? AND read = 0`,
      [userId]
    )
    return Number(result.rows?.[0]?.count || 0)
  }

  static async markAllAsRead(userId) {
    await new Promise((resolve, reject) => {
      db.db.run(
        `UPDATE notifications
         SET read = 1
         WHERE user_id = ? AND read = 0`,
        [userId],
        (err) => {
          if (err) reject(err)
          else resolve()
        }
      )
    })
  }
}

module.exports = Notification
