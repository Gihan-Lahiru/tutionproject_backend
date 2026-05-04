/*
  Safe maintenance script: delete payments for a given user + month/year.

  Usage (dry run):
    node scripts/delete-payments-by-month.js --email alice@student.com --month April --year 2026

  Delete (creates backup first):
    node scripts/delete-payments-by-month.js --email alice@student.com --month April --year 2026 --yes
*/

const fs = require('fs')
const path = require('path')
const sqlite3 = require('sqlite3').verbose()

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      args[key] = true
    } else {
      args[key] = next
      i++
    }
  }
  return args
}

function openDb(dbPath) {
  return new sqlite3.Database(dbPath)
}

function dbGet(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)))
  })
}

function dbAll(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])))
  })
}

function dbRun(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve({ changes: this.changes })
    })
  })
}

function closeDb(db) {
  return new Promise((resolve) => db.close(() => resolve()))
}

function monthPrefix(month) {
  const m = (month || '').trim().toLowerCase()
  if (!m) return ''
  if (m.startsWith('apr')) return 'apr'
  if (m.startsWith('jan')) return 'jan'
  if (m.startsWith('feb')) return 'feb'
  if (m.startsWith('mar')) return 'mar'
  if (m.startsWith('may')) return 'may'
  if (m.startsWith('jun')) return 'jun'
  if (m.startsWith('jul')) return 'jul'
  if (m.startsWith('aug')) return 'aug'
  if (m.startsWith('sep')) return 'sep'
  if (m.startsWith('oct')) return 'oct'
  if (m.startsWith('nov')) return 'nov'
  if (m.startsWith('dec')) return 'dec'
  return m.slice(0, 3)
}

async function main() {
  const args = parseArgs(process.argv)
  const email = args.email
  const userIdArg = args.userId
  const monthArg = args.month
  const yearArg = args.year
  const yes = Boolean(args.yes)

  if ((!email && !userIdArg) || !monthArg || !yearArg) {
    console.error('Missing args. Provide --email OR --userId, plus --month and --year')
    process.exit(2)
  }

  const dbPath = path.join(__dirname, '..', 'tuition_sir.db')
  const mPrefix = monthPrefix(monthArg)

  const db1 = openDb(dbPath)
  const userId = userIdArg
    ? userIdArg
    : (await dbGet(db1, 'SELECT id FROM users WHERE email = $email', { $email: email }))?.id

  if (!userId) {
    await closeDb(db1)
    console.error('User not found for given --email/--userId')
    process.exit(2)
  }

  const selectSql = `
    SELECT id, student_id, payer_id, amount, month, year, status, transaction_id, date, status_message
    FROM payments
    WHERE (student_id = $uid OR payer_id = $uid OR user_id = $uid)
      AND lower(COALESCE(month, '')) LIKE $monthLike
      AND CAST(COALESCE(year, '') AS TEXT) = $year
    ORDER BY datetime(COALESCE(date, payment_date)) DESC
  `.trim()

  const rows = await dbAll(db1, selectSql, {
    $uid: userId,
    $monthLike: `${mPrefix}%`,
    $year: String(yearArg),
  })

  console.log(JSON.stringify({ userId, monthPrefix: mPrefix, year: String(yearArg), matches: rows }, null, 2))

  await closeDb(db1)

  if (!yes) {
    console.log(`DRY RUN: would delete ${rows.length} row(s). Re-run with --yes to delete.`)
    return
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  const backupPath = path.join(__dirname, '..', `tuition_sir.db.backup_${ts}`)

  try {
    fs.copyFileSync(dbPath, backupPath)
    console.log(`Backup created: ${backupPath}`)
  } catch (e) {
    console.error('Failed to create DB backup. If the server is running, stop it and try again.')
    throw e
  }

  const db2 = openDb(dbPath)

  const deleteSql = `
    DELETE FROM payments
    WHERE (student_id = $uid OR payer_id = $uid OR user_id = $uid)
      AND lower(COALESCE(month, '')) LIKE $monthLike
      AND CAST(COALESCE(year, '') AS TEXT) = $year
  `.trim()

  const result = await dbRun(db2, deleteSql, {
    $uid: userId,
    $monthLike: `${mPrefix}%`,
    $year: String(yearArg),
  })

  await closeDb(db2)

  console.log(`Deleted rows: ${result.changes}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
