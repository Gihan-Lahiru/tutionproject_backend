const sqlite3 = require('sqlite3').verbose()
const path = require('path')

const dbPath = path.join(__dirname, '..', 'tuition_sir.db')
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Database connection error:', err)
  } else {
    console.log('✅ Database connected (SQLite)')
  }
})

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON')

const runAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve(this)
    })
  })

const allAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })

const ensureColumnAsync = async (table, column, columnDef) => {
  const rows = await allAsync(`PRAGMA table_info(${table})`)
  const hasColumn = (rows || []).some((r) => r.name === column)
  if (hasColumn) return

  await runAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${columnDef}`)
  console.log(`✅ Added column ${table}.${column}`)
}

const ensureStandardClasses = async () => {
  const grades = ['6', '7', '8', '9', '10', '11', 'A/L']
  const institutes = ['Prebhashi - Hettipola', 'Focus - Hadungamuwa']

  for (const grade of grades) {
    for (let idx = 0; idx < institutes.length; idx += 1) {
      const institute = institutes[idx]
      const defaultDay = idx === 0 ? 'Tuesday' : 'Friday'
      const defaultTime = '4.00pm-7.00pm'
      const defaultFee = grade === '6' ? 1000 : null

      const existing = await allAsync(
        `SELECT id, day, time, fee FROM classes WHERE grade = ? AND COALESCE(location, '') = ? LIMIT 1`,
        [grade, institute]
      )

      if (existing?.length) {
        const row = existing[0]
        const hasDay = String(row.day || '').trim().length > 0
        const hasTime = String(row.time || '').trim().length > 0
        const feeNumber = Number(row.fee)
        const shouldSetFee = defaultFee != null && (!Number.isFinite(feeNumber) || feeNumber <= 0)

        if (!hasDay || !hasTime || shouldSetFee) {
          await runAsync(
            `UPDATE classes
             SET day = COALESCE(NULLIF(day, ''), ?),
                 time = COALESCE(NULLIF(time, ''), ?),
                 fee = CASE WHEN ? THEN ? ELSE fee END
             WHERE id = ?`,
            [defaultDay, defaultTime, shouldSetFee ? 1 : 0, defaultFee, row.id]
          )
        }

        continue
      }

      const id = `auto-${String(grade).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${institute
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')}`
      const title = `Grade ${grade} Science - ${institute}`
      const description = `Science class for Grade ${grade} students (${institute})`

      await runAsync(
        `INSERT OR IGNORE INTO classes
          (id, name, title, grade, subject, day, time, fee, description, location, teacher_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [id, title, title, grade, 'Science', defaultDay, defaultTime, defaultFee, description, institute, null]
      )
    }
  }
}


// Ensure required tables/columns exist (lightweight, idempotent)
;(async () => {
  try {
    await runAsync(
      `CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        related_payment_id TEXT,
        read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`
    )
    await runAsync('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)')
    await runAsync('CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read)')

    await runAsync(
      `CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        device_name TEXT,
        user_agent TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        revoked_at DATETIME,
        revoked_reason TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`
    )
    await runAsync('CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id)')
    await runAsync('CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_sid ON user_sessions(session_id)')

    await runAsync(
      `CREATE TABLE IF NOT EXISTS email_verifications (
        email TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        verified INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    )
    await runAsync('CREATE INDEX IF NOT EXISTS idx_email_verifications_expires ON email_verifications(expires_at)')

    await runAsync(
      `CREATE TABLE IF NOT EXISTS announcements (
        id TEXT PRIMARY KEY,
        class_id TEXT,
        title TEXT,
        content TEXT,
        message TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    )
    await ensureColumnAsync('announcements', 'class_id', 'TEXT')
    await ensureColumnAsync('announcements', 'title', 'TEXT')
    await ensureColumnAsync('announcements', 'content', 'TEXT')
    await ensureColumnAsync('announcements', 'message', 'TEXT')
    await ensureColumnAsync('announcements', 'created_by', 'TEXT')
    await ensureColumnAsync('announcements', 'created_at', 'DATETIME')
    await runAsync('CREATE INDEX IF NOT EXISTS idx_announcements_class ON announcements(class_id)')

    // Notes (lightweight, SQLite-first)
    await runAsync(
      `CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        class_id TEXT,
        file_url TEXT,
        file_type TEXT,
        uploaded_by TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    )
    await ensureColumnAsync('notes', 'class_id', 'TEXT')
    await ensureColumnAsync('notes', 'file_url', 'TEXT')
    await ensureColumnAsync('notes', 'file_type', 'TEXT')
    await ensureColumnAsync('notes', 'uploaded_by', 'TEXT')
    await ensureColumnAsync('notes', 'uploaded_at', 'DATETIME')
    await ensureColumnAsync('notes', 'created_at', 'DATETIME')
    await runAsync('CREATE INDEX IF NOT EXISTS idx_notes_class ON notes(class_id)')

    // Assignments + submissions (SQLite)
    await runAsync(
      `CREATE TABLE IF NOT EXISTS assignments (
        id TEXT PRIMARY KEY,
        class_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        due_date DATETIME,
        attachment_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (class_id) REFERENCES classes(id)
      )`
    )
    await runAsync('CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id)')

    // Existing DBs may have older `assignments` schema (CREATE TABLE IF NOT EXISTS won't add columns)
    await ensureColumnAsync('assignments', 'attachment_url', 'TEXT')

    await runAsync(
      `CREATE TABLE IF NOT EXISTS submissions (
        id TEXT PRIMARY KEY,
        assignment_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        file_url TEXT,
        remarks TEXT,
        marks INTEGER,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (assignment_id) REFERENCES assignments(id),
        FOREIGN KEY (student_id) REFERENCES users(id)
      )`
    )
    await runAsync(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_unique ON submissions(assignment_id, student_id)'
    )
    await runAsync('CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON submissions(assignment_id)')
    await runAsync('CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id)')

    // Teacher portal expects these columns
    await ensureColumnAsync('classes', 'teacher_id', 'TEXT')
    await ensureColumnAsync('classes', 'description', 'TEXT')
    await ensureColumnAsync('classes', 'updated_at', 'DATETIME')
    await ensureColumnAsync('classes', 'title', 'TEXT')
    await ensureColumnAsync('classes', 'subject', 'TEXT')
    await ensureColumnAsync('classes', 'location', 'TEXT')
    await ensureColumnAsync('users', 'tuition_class', 'TEXT')
    await ensureColumnAsync('users', 'status', "TEXT DEFAULT 'active'")
    await ensureColumnAsync('users', 'current_session_id', 'TEXT')

    await ensureStandardClasses()

    // Backfill null/empty statuses for older rows.
    await runAsync("UPDATE users SET status = 'active' WHERE status IS NULL OR TRIM(status) = ''")

    // Videos in SQLite are stored in `videos.video_url`; these help the UI filter/display.
    await ensureColumnAsync('videos', 'grade', 'TEXT')
    await ensureColumnAsync('videos', 'subject', 'TEXT')
    await ensureColumnAsync('videos', 'thumbnail_url', 'TEXT')
    await ensureColumnAsync('videos', 'thumbnail_public_id', 'TEXT')

  } catch (e) {
    console.error('❌ DB init error:', e)
  }
})()

// Promisify query for easier use
const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve({ rows })
    })
  })
}

module.exports = {
  query,
  db,
}
