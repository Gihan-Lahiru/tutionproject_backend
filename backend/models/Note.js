const crypto = require('crypto')
const database = require('../config/database')

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    database.db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve({ changes: this.changes, lastID: this.lastID })
    })
  })

const getRow = (sql, params = []) =>
  new Promise((resolve, reject) => {
    database.db.get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row)
    })
  })

const getAll = (sql, params = []) =>
  new Promise((resolve, reject) => {
    database.db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows || [])
    })
  })

class Note {
  static async getByClass(classId) {
    return getAll(
      `SELECT * FROM notes
       WHERE class_id = ?
       ORDER BY datetime(COALESCE(uploaded_at, created_at)) DESC`,
      [classId]
    )
  }

  static async findById(id) {
    return getRow('SELECT * FROM notes WHERE id = ?', [id])
  }

  static async create(noteData) {
    const { class_id, title, file_url, file_type, uploaded_by } = noteData
    const id = crypto.randomUUID()

    await run(
      `INSERT INTO notes (id, class_id, title, file_url, file_type, uploaded_by, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [id, class_id || null, title, file_url || null, file_type || null, uploaded_by || null]
    )

    return this.findById(id)
  }

  static async delete(id) {
    await run('DELETE FROM notes WHERE id = ?', [id])
  }
}

module.exports = Note
