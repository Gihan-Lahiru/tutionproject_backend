const pool = require('../config/database');

class Paper {
  static async create({ title, grade, type, topic, class_id, file_url, file_public_id, thumbnail_url, thumbnail_public_id, uploaded_by }) {
    try {
      try {
        const result = await pool.query(
          `INSERT INTO papers (title, grade, type, topic, class_id, file_url, file_public_id, thumbnail_url, thumbnail_public_id, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING *`,
          [title, grade, type, topic, class_id || null, file_url, file_public_id, thumbnail_url, thumbnail_public_id, uploaded_by]
        );
        return result.rows[0];
      } catch (error) {
        const msg = String(error?.message || '').toLowerCase();
        if (!msg.includes('class_id')) throw error;

        const fallback = await pool.query(
          `INSERT INTO papers (title, grade, type, topic, file_url, file_public_id, thumbnail_url, thumbnail_public_id, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING *`,
          [title, grade, type, topic, file_url, file_public_id, thumbnail_url, thumbnail_public_id, uploaded_by]
        );
        return fallback.rows[0];
      }
    } catch (error) {
      console.error('Error creating paper:', error);
      throw error;
    }
  }

  static async getByClassId(classId) {
    try {
      const result = await pool.query(
        `SELECT p.*, u.name as uploaded_by_name
         FROM papers p
         LEFT JOIN users u ON p.uploaded_by = u.id
         WHERE p.class_id = ?
         ORDER BY p.uploaded_at DESC`,
        [classId]
      );
      return result.rows;
    } catch (error) {
      const msg = String(error?.message || '').toLowerCase();
      if (msg.includes('class_id')) {
        return [];
      }
      console.error('Error getting papers by class:', error);
      throw error;
    }
  }

  static async getAll() {
    try {
      const result = await pool.query(
        `SELECT p.*, u.name as uploaded_by_name
         FROM papers p
         LEFT JOIN users u ON p.uploaded_by = u.id
         ORDER BY p.uploaded_at DESC`
      );
      return result.rows;
    } catch (error) {
      console.error('Error getting all papers:', error);
      throw error;
    }
  }

  static async getByGrade(grade) {
    try {
      const result = await pool.query(
        `SELECT p.*, u.name as uploaded_by_name
         FROM papers p
         LEFT JOIN users u ON p.uploaded_by = u.id
         WHERE p.grade = ?
         ORDER BY p.uploaded_at DESC`,
        [grade]
      );
      return result.rows;
    } catch (error) {
      console.error('Error getting papers by grade:', error);
      throw error;
    }
  }

  static async getByType(type) {
    try {
      const result = await pool.query(
        `SELECT p.*, u.name as uploaded_by_name
         FROM papers p
         LEFT JOIN users u ON p.uploaded_by = u.id
         WHERE p.type = ?
         ORDER BY p.uploaded_at DESC`,
        [type]
      );
      return result.rows;
    } catch (error) {
      console.error('Error getting papers by type:', error);
      throw error;
    }
  }

  static async getById(id) {
    try {
      const result = await pool.query(
        `SELECT p.*, u.name as uploaded_by_name
         FROM papers p
         LEFT JOIN users u ON p.uploaded_by = u.id
         WHERE p.id = ?`,
        [id]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error getting paper by id:', error);
      throw error;
    }
  }

  static async findById(id) {
    return this.getById(id);
  }

  static async incrementDownloads(id) {
    try {
      const result = await pool.query(
        `UPDATE papers
         SET downloads = downloads + 1
         WHERE id = ?
         RETURNING *`,
        [id]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error incrementing downloads:', error);
      throw error;
    }
  }

  static async delete(id) {
    try {
      await pool.query('DELETE FROM papers WHERE id = ?', [id]);
      return true;
    } catch (error) {
      console.error('Error deleting paper:', error);
      throw error;
    }
  }

  static async update(id, { title, topic, thumbnail_url, thumbnail_public_id }) {
    try {
      const result = await pool.query(
        `UPDATE papers
         SET title = COALESCE(?, title),
             topic = COALESCE(?, topic),
             thumbnail_url = COALESCE(?, thumbnail_url),
             thumbnail_public_id = COALESCE(?, thumbnail_public_id)
         WHERE id = ?
         RETURNING *`,
        [title, topic, thumbnail_url, thumbnail_public_id, id]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error updating paper:', error);
      throw error;
    }
  }
}

module.exports = Paper;
