const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./tuition_sir.db');

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

async function main() {
  const like = '%kamala%';
  const matches = await all(
    'SELECT id, name, email, role, grade FROM users WHERE name LIKE ? OR email LIKE ? ORDER BY email',
    [like, like]
  );

  console.log('Matches:');
  console.log(JSON.stringify(matches, null, 2));

  const targetEmail = process.env.TARGET_EMAIL;

  let emailToUpdate = null;
  if (targetEmail) {
    emailToUpdate = targetEmail;
  } else if (matches.length === 1) {
    emailToUpdate = matches[0].email;
  }

  if (!emailToUpdate) {
    console.log(
      '\nNot updating because match count != 1. Re-run with TARGET_EMAIL set to the correct email.\n' +
        'Example (PowerShell):\n' +
        '$env:TARGET_EMAIL="kamala@gmail.com"; node scripts/set-kamala-grade-10.js'
    );
    return;
  }

  const before = await get('SELECT id, name, email, role, grade FROM users WHERE email = ?', [emailToUpdate]);
  console.log('\nBefore:', JSON.stringify(before, null, 2));

  const result = await run('UPDATE users SET grade = ?, role = ? WHERE email = ?', ['10', 'student', emailToUpdate]);
  console.log(`\nUpdated ${result.changes} row(s) for email=${emailToUpdate}`);

  const after = await get('SELECT id, name, email, role, grade FROM users WHERE email = ?', [emailToUpdate]);
  console.log('\nAfter:', JSON.stringify(after, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });
