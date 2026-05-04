const { db } = require('../config/database');

console.log('Adding PayHere columns to payments table...\n');

// Add columns for PayHere integration
const alterations = [
  `ALTER TABLE payments ADD COLUMN payment_id TEXT`,
  `ALTER TABLE payments ADD COLUMN status_message TEXT`,
];

async function addColumns() {
  for (const sql of alterations) {
    try {
      await new Promise((resolve, reject) => {
        db.run(sql, (err) => {
          if (err) {
            if (err.message.includes('duplicate column')) {
              console.log(`✓ Column already exists (skipped)`);
              resolve();
            } else {
              reject(err);
            }
          } else {
            console.log(`✓ ${sql}`);
            resolve();
          }
        });
      });
    } catch (error) {
      console.error(`✗ Error:`, error.message);
    }
  }

  console.log('\n✅ PayHere columns added successfully!\n');
  process.exit(0);
}

addColumns();
