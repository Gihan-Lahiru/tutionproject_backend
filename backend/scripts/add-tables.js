const { db } = require('../config/database')

db.serialize(() => {
  // Drop and recreate papers table with correct columns
  db.run('DROP TABLE IF EXISTS papers', (err) => {
    if (err) console.error(err)
    db.run(`
      CREATE TABLE papers (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        type TEXT DEFAULT 'Note',
        grade TEXT,
        subject TEXT,
        file_url TEXT,
        thumbnail_url TEXT,
        uploaded_by TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('Papers error:', err)
      else console.log('✅ Papers table created with uploaded_at')
    })
  })

  // Notes table
  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      class_id TEXT,
      file_url TEXT,
      uploaded_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('Notes error:', err)
    else console.log('✅ Notes table created')
  })

  // Videos table
  db.run(`
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      class_id TEXT,
      video_url TEXT,
      thumbnail_url TEXT,
      uploaded_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('Videos error:', err)
    else console.log('✅ Videos table created')
  })

  // Assignments table
  db.run(`
    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      class_id TEXT,
      due_date DATETIME,
      file_url TEXT,
      uploaded_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('Assignments error:', err)
    else console.log('✅ Assignments table created')
  })

  // Announcements table
  db.run(`
    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('Announcements error:', err)
    else console.log('✅ Announcements table created')
    setTimeout(() => process.exit(0), 500)
  })
})
