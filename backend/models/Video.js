const db = require('../config/database')

class Video {
  static async getAll() {
    const result = await db.query(
      `SELECT v.*, c.title as class_title, c.grade 
       FROM videos v
       LEFT JOIN classes c ON v.class_id = c.id
       ORDER BY v.created_at DESC`
    )
    return result.rows
  }

  static async getByClass(classId) {
    const result = await db.query(
      `SELECT * FROM videos 
       WHERE class_id = $1 
       ORDER BY created_at DESC`,
      [classId]
    )
    return result.rows
  }

  static async create(videoData) {
    const { class_id, title, url, duration, thumbnail_url } = videoData
    const result = await db.query(
      `INSERT INTO videos (class_id, title, url, duration, thumbnail_url) 
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [class_id, title, url, duration, thumbnail_url]
    )
    return result.rows[0]
  }

  static async delete(id) {
    await db.query('DELETE FROM videos WHERE id = $1', [id])
  }
}

module.exports = Video
