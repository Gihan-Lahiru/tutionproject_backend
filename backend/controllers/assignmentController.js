const Assignment = require('../models/Assignment')
const Paper = require('../models/Paper')
const User = require('../models/User')
const { addWatermarkToPdf } = require('../utils/pdfWatermark')
const { notifyStudentsByClass } = require('../utils/notificationService')
const { db } = require('../config/database')

const getRow = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row)
    })
  })

class AssignmentController {
  static async getMyAssignments(req, res) {
    try {
      const studentId = req.user.id
      const assignments = await Assignment.getByStudentId(studentId)
      res.json({ assignments })
    } catch (error) {
      console.error('Get my assignments error:', error)
      res.status(500).json({ message: 'Failed to fetch assignments' })
    }
  }

  static async getByClass(req, res) {
    try {
      const assignments = await Assignment.getByClass(req.params.classId)
      res.json({ assignments })
    } catch (error) {
      console.error('Get assignments error:', error)
      res.status(500).json({ message: 'Failed to fetch assignments' })
    }
  }

  static async getById(req, res) {
    try {
      const assignment = await Assignment.findById(req.params.id)
      
      if (!assignment) {
        return res.status(404).json({ message: 'Assignment not found' })
      }

      res.json({ assignment })
    } catch (error) {
      console.error('Get assignment error:', error)
      res.status(500).json({ message: 'Failed to fetch assignment' })
    }
  }

  static async downloadWithWatermark(req, res) {
    try {
      const assignmentId = req.params.id
      const assignment = await Assignment.findById(assignmentId)

      let fileUrl = assignment?.attachment_url || null
      let fileTitle = assignment?.title || 'assignment'

      // Some student assignment rows are sourced from papers fallback.
      if (!fileUrl) {
        const paper = await Paper.findById(assignmentId)
        const paperType = String(paper?.type || '').toLowerCase()
        if (paper && paperType === 'assignment') {
          fileUrl = paper.file_url
          fileTitle = paper.title || fileTitle
        }
      }

      if (!assignment && !fileUrl) {
        return res.status(404).json({ message: 'Assignment not found' })
      }

      if (!fileUrl) {
        return res.status(400).json({ message: 'This assignment has no attachment to download.' })
      }

      const student = await User.findById(req.user.id)
      const studentInfo = {
        name: student?.name,
        grade: student?.grade,
      }

      const watermarkedPdf = await addWatermarkToPdf(fileUrl, studentInfo)

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="${fileTitle}.pdf"`)
      res.send(watermarkedPdf)
    } catch (error) {
      console.error('Download watermarked assignment error:', error)
      const msg = String(error?.message || '')
      const looksLikeNotPdf =
        msg.toLowerCase().includes('pdf') ||
        msg.toLowerCase().includes('no pdf') ||
        msg.toLowerCase().includes('invalid')

      if (looksLikeNotPdf || msg.toLowerCase().includes('failed to download file')) {
        return res.status(400).json({ message: 'This file cannot be watermarked (not a valid PDF).' })
      }

      res.status(500).json({ message: 'Failed to download assignment' })
    }
  }

  static async create(req, res) {
    try {
      const { title, description, due_date, attachment_url } = req.body
      const classId = req.params.classId

      // Verify teacher owns this class (SQLite-first; do not depend on enrollments table)
      const classData = await getRow('SELECT id, grade, teacher_id FROM classes WHERE id = ?', [classId])
      if (!classData) {
        return res.status(404).json({ message: 'Class not found' })
      }

      if (classData.teacher_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Not authorized' })
      }

      const assignment = await Assignment.create({
        class_id: classId,
        title,
        description,
        due_date,
        attachment_url,
      })

      try {
        await notifyStudentsByClass({
          classId,
          type: 'assignment',
          message: `New Assignment: ${String(title || '').trim() || 'New assignment'}`,
        })
      } catch (notifyErr) {
        console.error('Failed to create assignment notifications:', notifyErr)
      }

      res.status(201).json({
        message: 'Assignment created successfully',
        assignment,
      })
    } catch (error) {
      console.error('Create assignment error:', error)
      res.status(500).json({ message: 'Failed to create assignment' })
    }
  }

  static async update(req, res) {
    try {
      const { title, description, due_date } = req.body
      const assignmentId = req.params.id

      const assignment = await Assignment.findById(assignmentId)
      if (!assignment) {
        return res.status(404).json({ message: 'Assignment not found' })
      }

      // Verify ownership through class (SQLite-first)
      const classData = await getRow('SELECT id, grade, teacher_id FROM classes WHERE id = ?', [assignment.class_id])
      if (classData.teacher_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Not authorized' })
      }

      const updatedAssignment = await Assignment.update(assignmentId, {
        title,
        description,
        due_date,
      })

      res.json({
        message: 'Assignment updated successfully',
        assignment: updatedAssignment,
      })
    } catch (error) {
      console.error('Update assignment error:', error)
      res.status(500).json({ message: 'Failed to update assignment' })
    }
  }

  static async delete(req, res) {
    try {
      const assignment = await Assignment.findById(req.params.id)
      if (!assignment) {
        return res.status(404).json({ message: 'Assignment not found' })
      }

      // Verify ownership
      const classData = await getRow('SELECT id, grade, teacher_id FROM classes WHERE id = ?', [assignment.class_id])
      if (classData.teacher_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Not authorized' })
      }

      await Assignment.delete(req.params.id)
      res.json({ message: 'Assignment deleted successfully' })
    } catch (error) {
      console.error('Delete assignment error:', error)
      res.status(500).json({ message: 'Failed to delete assignment' })
    }
  }

  static async getSubmissions(req, res) {
    try {
      const submissions = await Assignment.getSubmissions(req.params.id)
      res.json({ submissions })
    } catch (error) {
      console.error('Get submissions error:', error)
      res.status(500).json({ message: 'Failed to fetch submissions' })
    }
  }

  static async submit(req, res) {
    try {
      const { file_url, remarks } = req.body
      const assignmentId = req.params.id

      // Only students can submit
      if (req.user.role !== 'student') {
        return res.status(403).json({ message: 'Only students can submit assignments' })
      }

      const submission = await Assignment.submit({
        assignment_id: assignmentId,
        student_id: req.user.id,
        file_url,
        remarks,
      })

      res.status(201).json({
        message: 'Assignment submitted successfully',
        submission,
      })
    } catch (error) {
      console.error('Submit assignment error:', error)
      res.status(500).json({ message: 'Failed to submit assignment' })
    }
  }

  static async grade(req, res) {
    try {
      const { submission_id, marks } = req.body
      const assignmentId = req.params.id

      // Verify teacher owns the class
      const assignment = await Assignment.findById(assignmentId)
      const classData = await getRow('SELECT id, teacher_id FROM classes WHERE id = ?', [assignment.class_id])

      if (!classData) {
        return res.status(404).json({ message: 'Class not found' })
      }
      
      if (classData.teacher_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Not authorized' })
      }

      const gradedSubmission = await Assignment.grade(submission_id, marks)

      res.json({
        message: 'Assignment graded successfully',
        submission: gradedSubmission,
      })
    } catch (error) {
      console.error('Grade assignment error:', error)
      res.status(500).json({ message: 'Failed to grade assignment' })
    }
  }
}

module.exports = AssignmentController
