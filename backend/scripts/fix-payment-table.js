const { db } = require('../config/database');

console.log('Fixing payments table for PayHere integration...\n');

// Add missing columns for PayHere integration
const alterations = [
  `ALTER TABLE payments ADD COLUMN student_id TEXT`,
  `ALTER TABLE payments ADD COLUMN transaction_id TEXT`,
  `ALTER TABLE payments ADD COLUMN gateway TEXT DEFAULT 'payhere'`,
  `ALTER TABLE payments ADD COLUMN currency TEXT DEFAULT 'LKR'`,
  `ALTER TABLE payments ADD COLUMN gateway_payment_id TEXT`,
  `ALTER TABLE payments ADD COLUMN date DATETIME DEFAULT CURRENT_TIMESTAMP`,
  `ALTER TABLE payments ADD COLUMN payer_id TEXT`,
  `ALTER TABLE payments ADD COLUMN class_id TEXT`,
];

async function fixTable() {
  for (const sql of alterations) {
    try {
      await new Promise((resolve, reject) => {
        db.run(sql, (err) => {
          if (err) {
            if (err.message.includes('duplicate column')) {
              console.log(`✓ Column already exists (skipped): ${sql.split('ADD COLUMN ')[1]?.split(' ')[0]}`);
              resolve();
            } else {
              reject(err);
            }
          } else {
            console.log(`✓ Added column: ${sql.split('ADD COLUMN ')[1]?.split(' ')[0]}`);
            resolve();
          }
        });
      });
    } catch (error) {
      console.error(`✗ Error:`, error.message);
    }
  }

  // Copy user_id to student_id for existing records
  try {
    await new Promise((resolve, reject) => {
      db.run(`UPDATE payments SET student_id = user_id WHERE student_id IS NULL`, (err) => {
        if (err) reject(err);
        else {
          console.log('\n✓ Migrated existing user_id to student_id');
          resolve();
        }
      });
    });
  } catch (error) {
    console.error('✗ Error migrating data:', error.message);
  }

  console.log('\n✅ Payments table updated successfully!');
  db.close();
  process.exit(0);
}

fixTable();
