const Note = require('../models/Note')
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

class NoteController {
  static async getByClass(req, res) {
    try {
      const notes = await Note.getByClass(req.params.classId)
      res.json({ notes })
    } catch (error) {
      console.error('Get notes error:', error)
      res.status(500).json({ message: 'Failed to fetch notes' })
    }
  }

  static async create(req, res) {
    try {
      const { title, file_url, file_type } = req.body
      const classId = req.params.classId

      // Verify teacher owns this class
      const classData = await getRow('SELECT id, grade, teacher_id FROM classes WHERE id = ?', [classId])
      if (!classData) {
        return res.status(404).json({ message: 'Class not found' })
      }

      if (classData.teacher_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Not authorized' })
      }

      const note = await Note.create({
        class_id: classId,
        title,
        file_url,
        file_type,
        uploaded_by: req.user.id,
      })

      try {
        await notifyStudentsByClass({
          classId,
          type: 'note',
          message: `New Note: ${title}`,
        })
      } catch (e) {
        console.warn('Note notification error:', e)
      }

      res.status(201).json({
        message: 'Note uploaded successfully',
        note,
      })
    } catch (error) {
      console.error('Create note error:', error)
      res.status(500).json({ message: 'Failed to upload note' })
    }
  }

  static async delete(req, res) {
    try {
      // TODO: Verify ownership before deleting
      await Note.delete(req.params.id)
      res.json({ message: 'Note deleted successfully' })
    } catch (error) {
      console.error('Delete note error:', error)
      res.status(500).json({ message: 'Failed to delete note' })
    }
  }

  static async downloadWithWatermark(req, res) {
    try {
      const noteId = req.params.id
      const note = await Note.findById(noteId)
      
      if (!note) {
        return res.status(404).json({ message: 'Note not found' })
      }

      const student = await User.findById(req.user.id)
      const studentInfo = {
        name: student?.name,
        grade: student?.grade,
      }

      // Add watermark and send
      const watermarkedPdf = await addWatermarkToPdf(note.file_url, studentInfo)
      
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="${note.title}.pdf"`)
      res.send(watermarkedPdf)
    } catch (error) {
      console.error('Download watermarked note error:', error)
      const msg = String(error?.message || '')
      const looksLikeNotPdf =
        msg.toLowerCase().includes('pdf') ||
        msg.toLowerCase().includes('no pdf') ||
        msg.toLowerCase().includes('invalid')

      if (looksLikeNotPdf || msg.toLowerCase().includes('failed to download file')) {
        return res.status(400).json({ message: 'This file cannot be watermarked (not a valid PDF).' })
      }

      res.status(500).json({ message: 'Failed to download note' })
    }
  }
}

module.exports = NoteController
