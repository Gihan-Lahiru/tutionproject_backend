const jwt = require('jsonwebtoken')
const User = require('../models/User')
const { db } = require('../config/database')

const ENABLE_DEVICE_TRACKING = String(process.env.ENABLE_DEVICE_TRACKING || 'false').toLowerCase() === 'true'

const getRow = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row)
    })
  })

const getActiveSessionMeta = async (userId, sessionId) => {
  if (!ENABLE_DEVICE_TRACKING || !userId || !sessionId) return null
  return getRow(
    `SELECT device_name, created_at
     FROM user_sessions
     WHERE user_id = ? AND session_id = ?
     LIMIT 1`,
    [userId, sessionId]
  )
}

const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        message: 'Authentication required. Please login to continue.',
        code: 'NO_TOKEN',
      })
    }

    const token = authHeader.substring(7) // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    // Tokens without sid are treated as legacy tokens and are rejected.
    if (!decoded.sid) {
      return res.status(401).json({
        message: 'Session expired. Please login again.',
        code: 'LEGACY_TOKEN',
      })
    }

    const user = await User.findById(decoded.id)
    if (!user || !user.current_session_id || user.current_session_id !== decoded.sid) {
      const activeSession = await getActiveSessionMeta(decoded.id, user?.current_session_id)
      return res.status(401).json({
        message: 'This account was used on another device. Please login again.',
        code: 'SESSION_REPLACED',
        activeDevice: activeSession?.device_name || null,
        activeSince: activeSession?.created_at || null,
      })
    }
    
    // Attach user info to request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      sid: decoded.sid,
    }
    next()
  } catch (error) {
    console.error('Auth middleware error:', error)
    if (error?.name === 'TokenExpiredError') {
      return res.status(401).json({
        message: 'Your login token has expired. Please login again.',
        code: 'TOKEN_EXPIRED',
        expiredAt: error?.expiredAt || null,
      })
    }

    if (error?.name === 'JsonWebTokenError') {
      return res.status(401).json({
        message: 'Invalid authentication token. Please login again.',
        code: 'INVALID_TOKEN',
      })
    }

    return res.status(401).json({
      message: 'Authentication failed. Please login again.',
      code: 'AUTH_FAILED',
    })
  }
}

module.exports = authMiddleware
