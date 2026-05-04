const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const { v4: uuidv4 } = require('uuid')
const { generateVerificationCode, sendVerificationEmail, sendPasswordResetCodeEmail, validateEmailBeforeSending } = require('../utils/emailService')
const database = require('../config/database')
const { db } = database

const VERIFICATION_TTL_MS = 10 * 60 * 1000
const PASSWORD_RESET_TTL_MS = 10 * 60 * 1000
const AUTH_TOKEN_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'
const ENABLE_DEVICE_TRACKING = String(process.env.ENABLE_DEVICE_TRACKING || 'false').toLowerCase() === 'true'

const normalizeEmail = (email) => String(email || '').trim().toLowerCase()
const createSessionId = () => uuidv4()

const parseExpiresInToMs = (expiresIn) => {
  const normalized = String(expiresIn || '').trim()
  const matched = normalized.match(/^(\d+)([smhd])$/i)
  if (!matched) return 7 * 24 * 60 * 60 * 1000

  const value = Number(matched[1])
  const unit = matched[2].toLowerCase()
  if (!Number.isFinite(value) || value <= 0) return 7 * 24 * 60 * 60 * 1000

  if (unit === 's') return value * 1000
  if (unit === 'm') return value * 60 * 1000
  if (unit === 'h') return value * 60 * 60 * 1000
  if (unit === 'd') return value * 24 * 60 * 60 * 1000
  return 7 * 24 * 60 * 60 * 1000
}

const buildTokenPayload = (user, sessionId) => ({
  id: user.id,
  email: user.email,
  role: user.role,
  sid: sessionId,
})

const buildSignedAuthToken = (user, sessionId) => {
  const token = jwt.sign(buildTokenPayload(user, sessionId), process.env.JWT_SECRET, {
    expiresIn: AUTH_TOKEN_EXPIRES_IN,
  })

  const expiresAt = new Date(Date.now() + parseExpiresInToMs(AUTH_TOKEN_EXPIRES_IN)).toISOString()
  return {
    token,
    tokenExpiresIn: AUTH_TOKEN_EXPIRES_IN,
    tokenExpiresAt: expiresAt,
  }
}

const getClientIp = (req) => {
  const xForwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  return xForwardedFor || req.ip || req.socket?.remoteAddress || ''
}

const getDeviceName = (req) => {
  const userAgent = String(req.headers['user-agent'] || '').trim()
  if (!userAgent) return 'Unknown Device'

  const browser = /edg/i.test(userAgent)
    ? 'Edge'
    : /chrome/i.test(userAgent)
      ? 'Chrome'
      : /firefox/i.test(userAgent)
        ? 'Firefox'
        : /safari/i.test(userAgent)
          ? 'Safari'
          : 'Browser'

  const os = /windows/i.test(userAgent)
    ? 'Windows'
    : /android/i.test(userAgent)
      ? 'Android'
      : /iphone|ipad|ios/i.test(userAgent)
        ? 'iOS'
        : /mac os|macintosh/i.test(userAgent)
          ? 'macOS'
          : /linux/i.test(userAgent)
            ? 'Linux'
            : 'Unknown OS'

  return `${browser} on ${os}`
}

const recordSessionLogin = async (userId, sessionId, req) => {
  if (!ENABLE_DEVICE_TRACKING) return

  const userAgent = String(req.headers['user-agent'] || '').slice(0, 512)
  const deviceName = getDeviceName(req)
  const ipAddress = getClientIp(req).slice(0, 128)

  await run(
    `INSERT OR REPLACE INTO user_sessions
      (id, user_id, session_id, device_name, user_agent, ip_address, created_at, last_seen_at, revoked_at, revoked_reason)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL)`,
    [uuidv4(), userId, sessionId, deviceName, userAgent, ipAddress]
  )
}

const revokeSessionRecord = async (userId, sessionId, reason) => {
  if (!ENABLE_DEVICE_TRACKING || !sessionId) return

  await run(
    `UPDATE user_sessions
     SET revoked_at = CURRENT_TIMESTAMP,
         revoked_reason = ?
     WHERE user_id = ? AND session_id = ?`,
    [reason, userId, sessionId]
  )
}

const getRow = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row)
    })
  })

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve({ changes: this.changes, lastID: this.lastID })
    })
  })

const saveVerification = async (email, code, expiresAtIso) => {
  await run(
    `INSERT INTO email_verifications (email, code, expires_at, verified, created_at, updated_at)
     VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(email)
     DO UPDATE SET
       code = excluded.code,
       expires_at = excluded.expires_at,
       verified = 0,
       updated_at = CURRENT_TIMESTAMP`,
    [email, code, expiresAtIso]
  )
}

const getVerification = (email) =>
  getRow(
    `SELECT email, code, expires_at, verified
     FROM email_verifications
     WHERE email = ?`,
    [email]
  )

const markVerificationVerified = async (email) => {
  await run(
    `UPDATE email_verifications
     SET verified = 1, updated_at = CURRENT_TIMESTAMP
     WHERE email = ?`,
    [email]
  )
}

const clearVerification = async (email) => {
  await run(`DELETE FROM email_verifications WHERE email = ?`, [email])
}

const ensurePasswordResetCodeTable = async () => {
  await run(
    `CREATE TABLE IF NOT EXISTS password_reset_codes (
      email TEXT PRIMARY KEY,
      user_id TEXT,
      code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  )
}

const savePasswordResetCode = async (email, userId, code, expiresAtIso) => {
  await ensurePasswordResetCodeTable()
  await run(
    `INSERT INTO password_reset_codes (email, user_id, code, expires_at, used, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(email)
     DO UPDATE SET
       user_id = excluded.user_id,
       code = excluded.code,
       expires_at = excluded.expires_at,
       used = 0,
       updated_at = CURRENT_TIMESTAMP`,
    [email, userId, code, expiresAtIso]
  )
}

const getPasswordResetCode = (email) =>
  getRow(
    `SELECT email, user_id, code, expires_at, used
     FROM password_reset_codes
     WHERE email = ?`,
    [email]
  )

const clearPasswordResetCode = async (email) => {
  await ensurePasswordResetCodeTable()
  await run(`DELETE FROM password_reset_codes WHERE email = ?`, [email])
}

const TUITION_CLASS_LOCATIONS = ['Prebhashi', 'Focus']

const normalizeGrade = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const once = raw.replace(/^grade\s+/i, '').trim()
  const twice = once.replace(/^grade\s+/i, '').trim()
  return twice
}

const normalizeLocation = (value) =>
  String(value || '')
    .split(' - ')[0]
    .trim()
    .toLowerCase()

const getDefaultFeeForGrade = (gradeValue) => {
  const normalized = normalizeGrade(gradeValue)
  if (normalized === '6') return 1000
  return null
}

const ensureClassesForGrade = async (grade) => {
  const safeGrade = normalizeGrade(grade)
  if (!safeGrade) return

  const gradeLabel = /^a\/l$/i.test(safeGrade) ? 'A/L' : `Grade ${safeGrade}`

  const classTemplates = TUITION_CLASS_LOCATIONS.map((location, idx) => ({
    location,
    title: `${gradeLabel} Science - ${location}`,
    description: `Science class for ${gradeLabel} students (${location})`,
    day: idx === 0 ? 'Tuesday' : 'Friday',
    time: '4.00pm-7.00pm',
    fee: getDefaultFeeForGrade(safeGrade),
  }))

  for (const classTemplate of classTemplates) {
    const existingRows = await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, location FROM classes WHERE grade = ?`,
        [safeGrade],
        (err, rows) => {
          if (err) reject(err)
          else resolve(rows || [])
        }
      )
    })

    const existing = existingRows.find(
      (row) => normalizeLocation(row.location) === normalizeLocation(classTemplate.location)
    )

    if (existing) continue

    const classId = uuidv4()
    await run(
      `INSERT INTO classes (id, name, title, grade, subject, day, time, fee, description, location, teacher_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        classId,
        classTemplate.title,
        classTemplate.title,
        safeGrade,
        'Science',
        classTemplate.day,
        classTemplate.time,
        classTemplate.fee,
        classTemplate.description,
        classTemplate.location,
        null,
      ]
    )
  }
}

class AuthController {
  // Send verification code to email (before registration)
  static async sendEmailVerification(req, res) {
    try {
      const email = normalizeEmail(req.body.email)

      if (!email) {
        return res.status(400).json({ message: 'Email is required' })
      }

      // Validate email before proceeding
      const validation = await validateEmailBeforeSending(email)
      if (!validation.isValid) {
        return res.status(400).json({ 
          message: 'Invalid email address', 
          errors: validation.errors 
        })
      }

      // Check if email is already registered
      const existingUser = await User.findByEmail(email)
      if (existingUser) {
        return res.status(400).json({ message: 'Email already registered' })
      }

      // Generate verification code
      const verificationCode = generateVerificationCode()
      const expiresAtIso = new Date(Date.now() + VERIFICATION_TTL_MS).toISOString()

      // Persist verification per email so concurrent registrations are isolated and reliable.
      await saveVerification(email, verificationCode, expiresAtIso)

      // Send verification email
      try {
        await sendVerificationEmail(email, verificationCode, 'User')
        console.log(`✅ Verification email sent to ${email}`)
        
        res.json({
          message: 'Verification code sent to your email. Please check your inbox.',
        })
      } catch (emailError) {
        console.error('❌ Failed to send verification email:', emailError.message)

        // Dev fallback: optional via env flag. Set ALLOW_DEV_EMAIL_FALLBACK=false to enforce real email.
        const isNonProd = (process.env.NODE_ENV || '').toLowerCase() !== 'production'
        const allowDevFallback = String(process.env.ALLOW_DEV_EMAIL_FALLBACK || 'true').toLowerCase() !== 'false'

        const emailErrorText = String(emailError?.message || '').toLowerCase()
        const looksLikeConfigIssue =
          emailErrorText.includes('email service not configured') ||
          emailErrorText.includes('missing smtp username/password') ||
          emailErrorText.includes('missing smtp') ||
          emailErrorText.includes('phpmailer not installed') ||
          emailErrorText.includes('failed to start php process')

        if (looksLikeConfigIssue && isNonProd) {
          return res.json({
            message:
              'Email service is currently unavailable. Use the verification code shown to continue registration.',
            verificationCode,
            emailSent: false,
          })
        }

        if (looksLikeConfigIssue) {
          return res.status(500).json({
            message: 'Email service is not configured. Please ask admin to set backend EMAIL_USER and EMAIL_PASSWORD.',
          })
        }

        if (isNonProd && allowDevFallback) {
          return res.json({
            message:
              'Email service is currently unavailable. Use the verification code shown to continue registration.',
            verificationCode,
            emailSent: false,
          })
        }

        return res.status(500).json({
          message: 'Failed to send verification email. Email service is not configured correctly.',
        })
      }
    } catch (error) {
      console.error('Send verification error:', error)
      res.status(500).json({ message: 'Failed to send verification code' })
    }
  }

  // Verify email code (before registration)
  static async verifyEmailCode(req, res) {
    try {
      const email = normalizeEmail(req.body.email)
      const { code } = req.body

      if (!email || !code) {
        return res.status(400).json({ message: 'Email and code are required' })
      }

      const verification = await getVerification(email)

      if (!verification) {
        return res.status(400).json({ message: 'No verification request found' })
      }

      if (Date.now() > new Date(verification.expires_at).getTime()) {
        await clearVerification(email)
        return res.status(400).json({ message: 'Verification code expired' })
      }

      if (verification.code !== code) {
        return res.status(400).json({ message: 'Invalid verification code' })
      }

      // Mark as verified
      await markVerificationVerified(email)

      res.json({ 
        message: 'Email verified successfully',
        verified: true
      })
    } catch (error) {
      console.error('Verify code error:', error)
      res.status(500).json({ message: 'Verification failed' })
    }
  }

  static async register(req, res) {
    try {
      const { name, password, role, phone, grade, institute } = req.body
      const email = normalizeEmail(req.body.email)

      // Validate input
      if (!name || !email || !password) {
        return res.status(400).json({ message: 'All fields are required' })
      }

      // Check if email was verified
      const verification = await getVerification(email)
      if (!verification || Number(verification.verified) !== 1) {
        return res.status(400).json({ message: 'Please verify your email first' })
      }

      if (Date.now() > new Date(verification.expires_at).getTime()) {
        await clearVerification(email)
        return res.status(400).json({ message: 'Verification code expired. Please request a new code.' })
      }

      // Check if user exists
      const existingUser = await User.findByEmail(email)
      if (existingUser) {
        return res.status(400).json({ message: 'Email already registered' })
      }

      // Hash password
      const password_hash = await bcrypt.hash(password, 10)

      // Create user (email already verified)
      const user = await User.create({
        id: uuidv4(),
        name,
        email,
        password_hash,
        role: role || 'student',
        phone,
        grade,
        institute,
      })

      if ((role || 'student') === 'student' && grade) {
        await ensureClassesForGrade(grade)
      }

      // Mark email as verified in database
      await User.storeVerificationCode(email, null, null)
      await database.query(
        `UPDATE users SET email_verified = 1 WHERE email = ?`,
        [email]
      )

      // Clean up verification row after successful registration.
      await clearVerification(email)

      const sessionId = createSessionId()
      await User.setCurrentSessionId(user.id, sessionId)

      // Generate JWT token
      const { token, tokenExpiresIn, tokenExpiresAt } = buildSignedAuthToken(user, sessionId)
      await recordSessionLogin(user.id, sessionId, req)

      res.status(201).json({
        message: 'Registration successful',
        token,
        tokenExpiresIn,
        tokenExpiresAt,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone,
          grade: user.grade,
          institute: user.institute,
          status: user.status,
        },
      })
    } catch (error) {
      console.error('Register error:', error)
      res.status(500).json({ message: 'Registration failed' })
    }
  }

  static async login(req, res) {
    try {
      const email = normalizeEmail(req.body.email)
      const { password } = req.body

      // Validate input
      if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' })
      }

      // Find user
      const user = await User.findByEmail(email)
      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' })
      }

      // Backfill missing user id (older rows may have NULL id)
      if (!user.id) {
        const newId = uuidv4()
        await User.setIdForEmail(email, newId)
        user.id = newId
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password_hash)
      if (!isValidPassword) {
        return res.status(401).json({ message: 'Invalid credentials' })
      }

      // Rotate server-side session id so previous devices are logged out immediately.
      const oldSessionId = user.current_session_id || null
      const sessionId = createSessionId()
      await User.setCurrentSessionId(user.id, sessionId)
      await revokeSessionRecord(user.id, oldSessionId, 'replaced_by_new_login')
      await recordSessionLogin(user.id, sessionId, req)

      // Generate JWT
      const { token, tokenExpiresIn, tokenExpiresAt } = buildSignedAuthToken(user, sessionId)

      res.json({
        message: 'Login successful',
        token,
        tokenExpiresIn,
        tokenExpiresAt,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone,
          address: user.address,
          profile_picture: user.profile_picture,
          grade: user.grade,
          status: user.status,
          created_at: user.created_at,
        },
      })
    } catch (error) {
      console.error('Login error:', error)
      res.status(500).json({ message: 'Login failed' })
    }
  }

  static async getCurrentUser(req, res) {
    try {
      const user = await User.findById(req.user.id)
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' })
      }

      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone,
          address: user.address,
          profile_picture: user.profile_picture,
          grade: user.grade,
          status: user.status,
          created_at: user.created_at,
        },
      })
    } catch (error) {
      console.error('Get user error:', error)
      res.status(500).json({ message: 'Failed to get user' })
    }
  }

  static async forgotPassword(req, res) {
    try {
      const email = normalizeEmail(req.body?.email)

      if (!email) {
        return res.status(400).json({ message: 'Email is required' })
      }

      const user = await User.findByEmail(email)
      if (!user) {
        // Don't reveal if email exists
        return res.json({ message: 'If email exists, reset link has been sent' })
      }

      // Generate reset token
      const resetCode = generateVerificationCode()
      const expiresAtIso = new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString()
      await savePasswordResetCode(email, user.id, resetCode, expiresAtIso)

      try {
        await sendPasswordResetCodeEmail(user.email, resetCode, user.name)
      } catch (emailError) {
        const isNonProd = (process.env.NODE_ENV || '').toLowerCase() !== 'production'
        console.error('Forgot password email send failed:', emailError.message)

        if (isNonProd) {
          return res.json({
            message: 'Email service is currently unavailable. Please try again in a moment.',
            emailSent: false,
          })
        }

        throw emailError
      }

      res.json({ 
        message: 'Password reset code sent to email',
      })
    } catch (error) {
      console.error('Forgot password error:', error)
      res.status(500).json({ message: 'Failed to process request' })
    }
  }

  static async resetPassword(req, res) {
    try {
      const email = normalizeEmail(req.body?.email)
      const code = String(req.body?.code || '').trim()
      const { newPassword } = req.body

      if (!email || !code || !newPassword) {
        return res.status(400).json({ message: 'Email, code and new password are required' })
      }

      if (String(newPassword).length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' })
      }

      const reset = await getPasswordResetCode(email)
      if (!reset || Number(reset.used) === 1 || String(reset.code) !== code) {
        return res.status(400).json({ message: 'Invalid reset code' })
      }

      if (Date.now() > new Date(reset.expires_at).getTime()) {
        await clearPasswordResetCode(email)
        return res.status(400).json({ message: 'Reset code expired' })
      }

      const user = await User.findByEmail(email)
      if (!user) {
        return res.status(400).json({ message: 'Invalid reset request' })
      }

      // Hash new password
      const password_hash = await bcrypt.hash(newPassword, 10)

      // Update password
      await revokeSessionRecord(user.id, user.current_session_id, 'password_reset')
      await User.updatePassword(user.id, password_hash)
      await User.clearCurrentSessionId(user.id)
      await clearPasswordResetCode(email)

      res.json({ message: 'Password reset successful' })
    } catch (error) {
      console.error('Reset password error:', error)
      res.status(400).json({ message: 'Invalid or expired reset request' })
    }
  }

  static async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Current password and new password are required' })
      }

      if (String(newPassword).length < 6) {
        return res.status(400).json({ message: 'New password must be at least 6 characters' })
      }

      const user = await User.findById(req.user.id)
      if (!user) {
        return res.status(404).json({ message: 'User not found' })
      }

      const isValidCurrent = await bcrypt.compare(currentPassword, user.password_hash)
      if (!isValidCurrent) {
        return res.status(400).json({ message: 'Current password is incorrect' })
      }

      const password_hash = await bcrypt.hash(newPassword, 10)
      await revokeSessionRecord(user.id, user.current_session_id, 'password_changed')
      await User.updatePassword(user.id, password_hash)
      await User.clearCurrentSessionId(user.id)

      res.json({ message: 'Password changed successfully' })
    } catch (error) {
      console.error('Change password error:', error)
      res.status(500).json({ message: 'Failed to change password' })
    }
  }
}

module.exports = AuthController
