const express = require('express')
const router = express.Router()
const authMiddleware = require('../middleware/auth')
const Notification = require('../models/Notification')

// Get notifications for the current user
router.get('/my-notifications', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id
    const notifications = await Notification.getByUser(userId, 20)
    const unreadCount = await Notification.getUnreadCount(userId)

    res.json({
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        message: n.message,
        created_at: n.created_at,
        unread: Number(n.read) === 0,
      })),
      unreadCount,
    })
    
  } catch (error) {
    console.error('Error fetching notifications:', error)
    res.status(500).json({ error: 'Failed to fetch notifications' })
  }
})

// Mark all notifications as read for the current user
router.patch('/mark-read', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id
    await Notification.markAllAsRead(userId)
    res.json({ success: true })
  } catch (error) {
    console.error('Error marking notifications as read:', error)
    res.status(500).json({ error: 'Failed to mark notifications as read' })
  }
})

module.exports = router
