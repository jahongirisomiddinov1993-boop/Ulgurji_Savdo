const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
  database: process.env.PGDATABASE || 'ulgurji_savdo',
  port: parseInt(process.env.PGPORT) || 5432,
});

async function migrate() {
  try {
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS clerk_user_id VARCHAR(255) UNIQUE
    `);
    console.log('✅ clerk_user_id ustuni muvaffaqiyatli qo\'shildi');
  } catch (err) {
    console.error('❌ Migration xatosi:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
