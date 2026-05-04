const db = require('../config/database')

class Class {
  static async findById(id) {
    const result = await db.query(
      `SELECT c.*, u.name as teacher_name,
       (SELECT COUNT(*) FROM enrollments WHERE class_id = c.id) as student_count
       FROM classes c
       LEFT JOIN users u ON c.teacher_id = u.id
       WHERE c.id = $1`,
      [id]
    )
    return result.rows[0]
  }

  static async getAll(filters = {}) {
    let query = `
      SELECT c.*, u.name as teacher_name,
      (SELECT COUNT(*) FROM enrollments WHERE class_id = c.id) as student_count
      FROM classes c
      LEFT JOIN users u ON c.teacher_id = u.id
      WHERE 1=1
    `
    const params = []

    if (filters.teacherId) {
      query += ` AND c.teacher_id = $${params.length + 1}`
      params.push(filters.teacherId)
    }

    if (filters.grade) {
      query += ` AND c.grade = $${params.length + 1}`
      params.push(filters.grade)
    }

    query += ' ORDER BY c.created_at DESC'
    const result = await db.query(query, params)
    return result.rows
  }

  static async create(classData) {
    const { title, grade, description, teacher_id } = classData
    const result = await db.query(
      `INSERT INTO classes (title, grade, description, teacher_id) 
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [title, grade, description, teacher_id]
    )
    return result.rows[0]
  }

  static async update(id, classData) {
    const { title, grade, description } = classData
    const result = await db.query(
      `UPDATE classes 
       SET title = $1, grade = $2, description = $3, updated_at = NOW() 
       WHERE id = $4
       RETURNING *`,
      [title, grade, description, id]
    )
    return result.rows[0]
  }

  static async delete(id) {
    await db.query('DELETE FROM classes WHERE id = $1', [id])
  }

  static async getStudents(classId) {
    const result = await db.query(
      `SELECT u.id, u.name, u.email, e.enrolled_at
       FROM enrollments e
       JOIN users u ON e.student_id = u.id
       WHERE e.class_id = $1
       ORDER BY e.enrolled_at DESC`,
      [classId]
    )
    return result.rows
  }

  static async enroll(classId, studentId) {
    const result = await db.query(
      `INSERT INTO enrollments (class_id, student_id) 
       VALUES ($1, $2)
       ON CONFLICT (class_id, student_id) DO NOTHING
       RETURNING *`,
      [classId, studentId]
    )
    
    if (result.rows[0]) {
      return result.rows[0]
    }
    
    // If conflict occurred, fetch the existing enrollment
    const existingResult = await db.query(
      'SELECT * FROM enrollments WHERE class_id = $1 AND student_id = $2',
      [classId, studentId]
    )
    return existingResult.rows[0]
  }

  static async unenroll(classId, studentId) {
    await db.query(
      'DELETE FROM enrollments WHERE class_id = $1 AND student_id = $2',
      [classId, studentId]
    )
  }

  static async isEnrolled(classId, studentId) {
    const result = await db.query(
      'SELECT * FROM enrollments WHERE class_id = $1 AND student_id = $2',
      [classId, studentId]
    )
    return result.rows.length > 0
  }

  static async getMyClasses(userId, role) {
    if (role === 'student') {
      // Get classes student is enrolled in
      const result = await db.query(
        `SELECT c.*, u.name as teacher_name, e.enrolled_at,
         (SELECT COUNT(*) FROM enrollments WHERE class_id = c.id) as student_count
         FROM classes c
         JOIN enrollments e ON c.id = e.class_id
         LEFT JOIN users u ON c.teacher_id = u.id
         WHERE e.student_id = $1
         ORDER BY c.created_at DESC`,
        [userId]
      )
      return result.rows
    } else if (role === 'teacher' || role === 'admin') {
      // Get classes teacher created
      const result = await db.query(
        `SELECT c.*, u.name as teacher_name,
         (SELECT COUNT(*) FROM enrollments WHERE class_id = c.id) as student_count
         FROM classes c
         LEFT JOIN users u ON c.teacher_id = u.id
         WHERE c.teacher_id = $1
         ORDER BY c.created_at DESC`,
        [userId]
      )
      return result.rows
    }
    return []
  }
}

module.exports = Class
