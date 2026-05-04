const { db } = require('../config/database');

function all(sql, params) {
  return new Promise((resolve, reject) => {
    db.all(sql, params || [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

(async () => {
  try {
    const tables = await all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    console.log(tables.map(t => t.name).join('\n'));
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    db.close();
  }
})();
