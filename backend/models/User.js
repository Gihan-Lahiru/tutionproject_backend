const db = require('../config/database')
const { v4: uuidv4 } = require('uuid')

class User {
  static async findById(id) {
    const result = await db.query('SELECT * FROM users WHERE id = ?', [id])
    return result.rows[0]
  }

  static async findByEmail(email) {
    const result = await db.query('SELECT * FROM users WHERE email = ?', [email])
    return result.rows[0]
  }

  static async create(userData) {
    const { id, name, email, password_hash, role, phone, grade, institute, tuition_class, status } = userData
    const userId = id || uuidv4()
    await db.query(
      `INSERT INTO users (id, name, email, password_hash, role, phone, grade, institute, tuition_class, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, name, email, password_hash, role, phone, grade, institute, tuition_class || null, status || 'active']
    )
    // SQLite doesn't support RETURNING, so fetch the inserted user
    return await User.findByEmail(email)
  }

  static async setIdForEmail(email, id) {
    await db.query(
      `UPDATE users
       SET id = ?
       WHERE email = ? AND (id IS NULL OR id = '')`,
      [id, email]
    )
  }

  static async update(id, userData) {
    const { name, email, phone, profile_picture, grade, institute, tuition_class, status } = userData
    
    // Build dynamic update query based on provided fields
    const updates = []
    const values = []

    if (name !== undefined) {
      updates.push(`name = ?`)
      values.push(name)
    }
    if (email !== undefined) {
      updates.push(`email = ?`)
      values.push(email)
    }
    if (phone !== undefined) {
      updates.push(`phone = ?`)
      values.push(phone)
    }
    if (profile_picture !== undefined) {
      updates.push(`profile_picture = ?`)
      values.push(profile_picture)
    }
    if (grade !== undefined) {
      updates.push(`grade = ?`)
      values.push(grade)
    }
    if (institute !== undefined) {
      updates.push(`institute = ?`)
      values.push(institute)
    }
    if (tuition_class !== undefined) {
      updates.push(`tuition_class = ?`)
      values.push(tuition_class)
    }
    if (status !== undefined) {
      updates.push(`status = ?`)
      values.push(status)
    }

    if (updates.length === 0) {
      return await User.findById(id)
    }
    values.push(id)

    await db.query(
      `UPDATE users 
       SET ${updates.join(', ')} 
       WHERE id = ?`,
      values
    )
    
    // Fetch and return updated user (SQLite doesn't support RETURNING)
    return await User.findById(id)
  }

  static async updatePassword(id, password_hash) {
    await db.query(
      `UPDATE users SET password_hash = ? WHERE id = ?`,
      [password_hash, id]
    )
  }

  static async setCurrentSessionId(id, sessionId) {
    await db.query(
      `UPDATE users SET current_session_id = ? WHERE id = ?`,
      [sessionId, id]
    )
  }

  static async clearCurrentSessionId(id) {
    await db.query(
      `UPDATE users SET current_session_id = NULL WHERE id = ?`,
      [id]
    )
  }

  static async delete(id) {
    await db.query('DELETE FROM users WHERE id = ?', [id])
  }

  static async getAll(role = null) {
    let query = 'SELECT id, name, email, role, grade, institute, tuition_class, status, phone, profile_picture, created_at FROM users'
    const params = []

    if (role) {
      query += ' WHERE role = ?'
      params.push(role)
    }

    query += ' ORDER BY created_at DESC'
    const result = await db.query(query, params)
    return result.rows
  }

  // Email verification methods
  static async storeVerificationCode(email, code, expiresAt) {
    await db.query(
      `UPDATE users 
       SET verification_code = ?, verification_code_expires = ? 
       WHERE email = ?`,
      [code, expiresAt, email]
    )
  }

  static async verifyEmail(email, code) {
    const user = await User.findByEmail(email)
    if (!user) return { success: false, message: 'User not found' }

    const now = new Date().toISOString()
    if (user.verification_code_expires < now) {
      return { success: false, message: 'Verification code expired' }
    }

    if (user.verification_code !== code) {
      return { success: false, message: 'Invalid verification code' }
    }

    // Mark email as verified
    await db.query(
      `UPDATE users 
       SET email_verified = 1, verification_code = NULL, verification_code_expires = NULL 
       WHERE email = ?`,
      [email]
    )

    return { success: true, message: 'Email verified successfully' }
  }

  static async isEmailVerified(email) {
    const user = await User.findByEmail(email)
    return user && user.email_verified === 1
  }
}

module.exports = User
