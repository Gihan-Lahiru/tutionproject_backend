const User = require('../models/User')
const { v4: uuidv4 } = require('uuid')
const bcrypt = require('bcryptjs')
const db = require('../config/database')

const runSafe = async (sql, params = []) => {
  try {
    await db.query(sql, params)
  } catch (error) {
    const msg = String(error?.message || '')
    // Some deployments may not have all legacy tables/columns.
    if (msg.includes('no such table') || msg.includes('no such column')) return
    throw error
  }
}

async function resolveAuthenticatedUserId(req) {
  const tokenUserId = req.user?.id
  if (tokenUserId) return tokenUserId

  const tokenEmail = req.user?.email
  if (!tokenEmail) return null

  const user = await User.findByEmail(tokenEmail)
  if (!user) return null

  if (!user.id) {
    const newId = uuidv4()
    await User.setIdForEmail(tokenEmail, newId)
    return newId
  }

  return user.id
}

class UserController {
  static async getProfile(req, res) {
    try {
      const userId = await resolveAuthenticatedUserId(req)
      if (!userId) {
        return res.status(404).json({ message: 'User not found' })
      }

      const user = await User.findById(userId)
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' })
      }

      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          address: user.address,
          profile_picture: user.profile_picture,
          grade: user.grade,
          role: user.role,
          created_at: user.created_at,
        },
      })
    } catch (error) {
      console.error('Get profile error:', error)
      res.status(500).json({ message: 'Failed to fetch profile' })
    }
  }

  static async updateProfile(req, res) {
    try {
      const userId = await resolveAuthenticatedUserId(req)
      if (!userId) {
        return res.status(404).json({ message: 'User not found' })
      }

      const { name, email, phone } = req.body

      const updatedUser = await User.update(userId, { 
        name, 
        email, 
        phone
      })

      if (!updatedUser) {
        return res.status(404).json({ message: 'User not found' })
      }

      res.json({
        message: 'Profile updated successfully',
        user: {
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
          phone: updatedUser.phone,
          profile_picture: updatedUser.profile_picture,
          grade: updatedUser.grade,
          role: updatedUser.role,
          created_at: updatedUser.created_at
        },
      })
    } catch (error) {
      console.error('Update profile error:', error)
      res.status(500).json({ message: 'Failed to update profile', error: error.message })
    }
  }

  static async uploadProfilePicture(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' })
      }

      const userId = await resolveAuthenticatedUserId(req)
      if (!userId) {
        return res.status(404).json({ message: 'User not found' })
      }

      // Cloudinary automatically uploads and returns the URL
      const profilePictureUrl = req.file.path // Cloudinary URL
      
      // Update user's profile picture in database
      await User.update(userId, { profile_picture: profilePictureUrl })

      res.json({
        message: 'Profile picture uploaded successfully',
        profile_picture: profilePictureUrl
      })
    } catch (error) {
      console.error('Upload profile picture error:', error)
      res.status(500).json({ message: 'Failed to upload profile picture' })
    }
  }

  static async getAllUsers(req, res) {
    try {
      // Admin only
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' })
      }

      const { role } = req.query
      const users = await User.getAll(role)
      
      res.json({ users })
    } catch (error) {
      console.error('Get users error:', error)
      res.status(500).json({ message: 'Failed to fetch users' })
    }
  }

  static async getStudents(req, res) {
    try {
      // teacher or admin (enforced by route middleware)
      const users = await User.getAll('student')
      res.json({ users })
    } catch (error) {
      console.error('Get students error:', error)
      res.status(500).json({ message: 'Failed to fetch students' })
    }
  }

  static async getStudentById(req, res) {
    try {
      const student = await User.findById(req.params.id)
      if (!student || student.role !== 'student') {
        return res.status(404).json({ message: 'Student not found' })
      }

      res.json({
        user: {
          id: student.id,
          name: student.name,
          email: student.email,
          phone: student.phone,
          grade: student.grade,
          institute: student.institute,
          status: student.status,
          profile_picture: student.profile_picture,
          created_at: student.created_at,
        },
      })
    } catch (error) {
      console.error('Get student by id error:', error)
      res.status(500).json({ message: 'Failed to fetch student' })
    }
  }

  static async createStudent(req, res) {
    try {
      const { name, email, phone, grade, institute, tuition_class, status, password } = req.body
      if (!name || !email) {
        return res.status(400).json({ message: 'Name and email are required' })
      }

      const existing = await User.findByEmail(email)
      if (existing) {
        return res.status(400).json({ message: 'Email already exists' })
      }

      const plainPassword = String(password || '12345678')
      const password_hash = await bcrypt.hash(plainPassword, 10)

      const created = await User.create({
        id: uuidv4(),
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        password_hash,
        role: 'student',
        phone: phone ? String(phone).trim() : null,
        grade: grade ? String(grade).trim() : null,
        institute: institute ? String(institute).trim() : null,
        tuition_class: tuition_class ? String(tuition_class).trim() : null,
        status: String(status || 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active',
      })

      res.status(201).json({
        message: 'Student created successfully',
        user: {
          id: created.id,
          name: created.name,
          email: created.email,
          phone: created.phone,
          grade: created.grade,
          institute: created.institute,
          status: created.status,
          profile_picture: created.profile_picture,
          created_at: created.created_at,
        },
      })
    } catch (error) {
      console.error('Create student error:', error)
      res.status(500).json({ message: 'Failed to create student' })
    }
  }

  static async updateStudent(req, res) {
    try {
      const existing = await User.findById(req.params.id)
      if (!existing || existing.role !== 'student') {
        return res.status(404).json({ message: 'Student not found' })
      }

      const { name, email, phone, grade, institute, tuition_class, status } = req.body
      const updated = await User.update(req.params.id, {
        name: name != null ? String(name).trim() : undefined,
        email: email != null ? String(email).trim().toLowerCase() : undefined,
        phone: phone != null ? String(phone).trim() : undefined,
        grade: grade != null ? String(grade).trim() : undefined,
        institute: institute != null ? String(institute).trim() : undefined,
        tuition_class: tuition_class != null ? String(tuition_class).trim() : undefined,
        status: status != null ? (String(status).toLowerCase() === 'inactive' ? 'inactive' : 'active') : undefined,
      })

      res.json({
        message: 'Student updated successfully',
        user: {
          id: updated.id,
          name: updated.name,
          email: updated.email,
          phone: updated.phone,
          grade: updated.grade,
          institute: updated.institute,
          status: updated.status,
          profile_picture: updated.profile_picture,
          created_at: updated.created_at,
        },
      })
    } catch (error) {
      console.error('Update student error:', error)
      res.status(500).json({ message: 'Failed to update student' })
    }
  }

  static async deleteStudent(req, res) {
    try {
      const existing = await User.findById(req.params.id)
      if (!existing || existing.role !== 'student') {
        return res.status(404).json({ message: 'Student not found' })
      }

      // Remove or detach dependent records first to avoid FK constraint failures.
      await runSafe('DELETE FROM notifications WHERE user_id = ?', [req.params.id])
      await runSafe('DELETE FROM submissions WHERE student_id = ?', [req.params.id])
      await runSafe('UPDATE payments SET student_id = NULL WHERE student_id = ?', [req.params.id])
      await runSafe('UPDATE payments SET user_id = NULL WHERE user_id = ?', [req.params.id])
      await runSafe('UPDATE payments SET payer_id = NULL WHERE payer_id = ?', [req.params.id])

      await User.delete(req.params.id)
      res.json({ message: 'Student deleted successfully' })
    } catch (error) {
      console.error('Delete student error:', error)
      res.status(500).json({ message: 'Failed to delete student' })
    }
  }
}

module.exports = UserController
