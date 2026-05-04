const db = require('../config/database')

class Announcement {
  static async getByClass(classId) {
    const result = await db.query(
      `SELECT * FROM announcements 
       WHERE class_id = $1 
       ORDER BY created_at DESC`,
      [classId]
    )
    return result.rows
  }

  static async create(announcementData) {
    const { class_id, message, pinned_until } = announcementData
    const result = await db.query(
      `INSERT INTO announcements (class_id, message, pinned_until) 
       VALUES ($1, $2, $3)
       RETURNING *`,
      [class_id, message, pinned_until]
    )
    return result.rows[0]
  }

  static async update(id, message) {
    const result = await db.query(
      `UPDATE announcements 
       SET message = $1 
       WHERE id = $2
       RETURNING *`,
      [message, id]
    )
    return result.rows[0]
  }

  static async delete(id) {
    await db.query('DELETE FROM announcements WHERE id = $1', [id])
  }
}

module.exports = Announcement
