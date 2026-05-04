const Video = require('../models/Video')
const Class = require('../models/Class')

class VideoController {
  static async getByClass(req, res) {
    try {
      const videos = await Video.getByClass(req.params.classId)
      res.json({ videos })
    } catch (error) {
      console.error('Get videos error:', error)
      res.status(500).json({ message: 'Failed to fetch videos' })
    }
  }

  static async create(req, res) {
    try {
      const { title, url, duration, thumbnail_url } = req.body
      const classId = req.params.classId

      // Verify teacher owns this class
      const classData = await Class.findById(classId)
      if (!classData) {
        return res.status(404).json({ message: 'Class not found' })
      }

      if (classData.teacher_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Not authorized' })
      }

      const video = await Video.create({
        class_id: classId,
        title,
        url,
        duration,
        thumbnail_url,
      })

      res.status(201).json({
        message: 'Video added successfully',
        video,
      })
    } catch (error) {
      console.error('Create video error:', error)
      res.status(500).json({ message: 'Failed to add video' })
    }
  }

  static async delete(req, res) {
    try {
      // TODO: Verify ownership before deleting
      await Video.delete(req.params.id)
      res.json({ message: 'Video deleted successfully' })
    } catch (error) {
      console.error('Delete video error:', error)
      res.status(500).json({ message: 'Failed to delete video' })
    }
  }
}

module.exports = VideoController
